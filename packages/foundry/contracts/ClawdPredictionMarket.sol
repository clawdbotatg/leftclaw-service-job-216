// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ClawdPredictionMarket
 * @notice Bitcoin Pizza Day Oracle prediction market for CLAWD burn amount.
 * @dev Users stake CLAWD into prediction buckets. 25% of every stake is burned immediately
 *      to the dead address; the remaining 75% is pooled. After the owner resolves the
 *      market by setting the winning bucket, winners can claim a proportional share of
 *      the entire 75% pool (proportional to their contribution within the winning bucket).
 */
contract ClawdPredictionMarket is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    struct Bucket {
        string label;
        uint256 totalPooled; // the 75% portion sum for this bucket
    }

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant BURN_BPS = 2500; // 25%
    uint256 public constant POOL_BPS = 7500; // 75%
    uint256 public constant BPS_DENOMINATOR = 10000;

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    IERC20 public immutable clawd;

    string public question;
    Bucket[] public buckets;
    uint256 public totalPool; // sum of all 75% portions across all buckets

    bool public resolved;
    uint256 public winningBucketId;

    // user => bucketId => pooledAmount (the 75% portion the user contributed to that bucket)
    mapping(address => mapping(uint256 => uint256)) public userPooledPerBucket;
    // one claim per address
    mapping(address => bool) public claimed;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event Staked(
        address indexed user,
        uint256 indexed bucketId,
        uint256 amountStaked,
        uint256 amountBurned,
        uint256 amountToPool
    );
    event Resolved(uint256 indexed winningBucketId);
    event Claimed(address indexed user, uint256 amount);

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    /**
     * @param _owner The address that will own this contract (skips the Ownable2Step pending owner step).
     * @param _clawd The CLAWD ERC20 token address.
     * @param _question The market question.
     * @param _bucketLabels The labels for each prediction bucket.
     */
    constructor(
        address _owner,
        address _clawd,
        string memory _question,
        string[] memory _bucketLabels
    ) Ownable(_owner) {
        require(_clawd != address(0), "clawd zero");
        require(_bucketLabels.length > 1, "need >=2 buckets");

        clawd = IERC20(_clawd);
        question = _question;

        for (uint256 i = 0; i < _bucketLabels.length; i++) {
            buckets.push(Bucket({ label: _bucketLabels[i], totalPooled: 0 }));
        }
    }

    // ---------------------------------------------------------------------
    // External state-mutating functions
    // ---------------------------------------------------------------------

    /**
     * @notice Stake `totalAmount` of CLAWD on a prediction bucket.
     * @dev Caller must approve this contract for at least `totalAmount` first.
     *      25% of `totalAmount` is sent to the burn address and 75% added to the pool.
     */
    function stake(uint256 bucketId, uint256 totalAmount) external nonReentrant {
        require(!resolved, "market resolved");
        require(bucketId < buckets.length, "bad bucket");
        require(totalAmount > 0, "amount zero");

        uint256 burnAmount = (totalAmount * BURN_BPS) / BPS_DENOMINATOR;
        // Use subtraction to avoid integer-division rounding dust.
        uint256 poolAmount = totalAmount - burnAmount;

        // Effects
        userPooledPerBucket[msg.sender][bucketId] += poolAmount;
        buckets[bucketId].totalPooled += poolAmount;
        totalPool += poolAmount;

        // Interactions
        clawd.safeTransferFrom(msg.sender, address(this), totalAmount);
        clawd.safeTransfer(BURN_ADDRESS, burnAmount);

        emit Staked(msg.sender, bucketId, totalAmount, burnAmount, poolAmount);
    }

    /**
     * @notice Resolve the market by selecting the winning bucket.
     * @dev Only callable once.
     */
    function resolve(uint256 _winningBucketId) external onlyOwner nonReentrant {
        require(!resolved, "already resolved");
        require(_winningBucketId < buckets.length, "bad bucket");
        require(buckets[_winningBucketId].totalPooled > 0, "winning bucket empty");

        resolved = true;
        winningBucketId = _winningBucketId;

        emit Resolved(_winningBucketId);
    }

    /**
     * @notice Claim a proportional share of the entire pool.
     * @dev Caller must have staked in the winning bucket.
     *      Payout = userContribution * totalPool / winningBucketTotal
     */
    function claim() external nonReentrant {
        require(resolved, "not resolved");
        require(!claimed[msg.sender], "already claimed");

        uint256 userContribution = userPooledPerBucket[msg.sender][winningBucketId];
        require(userContribution > 0, "not a winner");

        uint256 winningBucketTotal = buckets[winningBucketId].totalPooled;
        require(winningBucketTotal > 0, "empty winning bucket");

        uint256 payout = (userContribution * totalPool) / winningBucketTotal;

        // Effects
        claimed[msg.sender] = true;

        // Interactions
        clawd.safeTransfer(msg.sender, payout);

        emit Claimed(msg.sender, payout);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getBucketsCount() external view returns (uint256) {
        return buckets.length;
    }

    function getBucket(uint256 id) external view returns (string memory label, uint256 totalPooled) {
        require(id < buckets.length, "bad bucket");
        Bucket storage b = buckets[id];
        return (b.label, b.totalPooled);
    }

    function getUserStakeInBucket(address user, uint256 bucketId) external view returns (uint256) {
        return userPooledPerBucket[user][bucketId];
    }

    /**
     * @notice Preview the claim amount for `user`. Returns 0 if not yet resolved,
     *         already claimed, or the user has no stake in the winning bucket.
     */
    function getClaimAmount(address user) external view returns (uint256) {
        if (!resolved) return 0;
        if (claimed[user]) return 0;

        uint256 userContribution = userPooledPerBucket[user][winningBucketId];
        if (userContribution == 0) return 0;

        uint256 winningBucketTotal = buckets[winningBucketId].totalPooled;
        if (winningBucketTotal == 0) return 0;

        return (userContribution * totalPool) / winningBucketTotal;
    }
}
