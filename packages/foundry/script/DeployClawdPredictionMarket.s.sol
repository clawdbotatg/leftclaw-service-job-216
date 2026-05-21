// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployHelpers.s.sol";
import { ClawdPredictionMarket } from "../contracts/ClawdPredictionMarket.sol";

/**
 * @notice Deploy script for ClawdPredictionMarket
 * @dev Inherits ScaffoldETHDeploy which:
 *      - Includes forge-std/Script.sol for deployment
 *      - Includes ScaffoldEthDeployerRunner modifier
 *      - Provides `deployer` variable
 * Example:
 * yarn deploy --file DeployClawdPredictionMarket.s.sol --network base
 */
contract DeployClawdPredictionMarket is ScaffoldETHDeploy {
    // Client wallet (becomes the contract owner directly via Ownable constructor).
    address internal constant CLIENT_OWNER = 0x34aA3F359A9D614239015126635CE7732c18fDF3;
    // CLAWD ERC20 token on Base mainnet.
    address internal constant CLAWD_TOKEN = 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07;

    function run() external ScaffoldEthDeployerRunner {
        string memory question = "How much $CLAWD will be burned on Bitcoin Pizza Day (May 22nd, 2026)?";

        string[] memory labels = new string[](4);
        labels[0] = "Under 100,000 CLAWD";
        labels[1] = "100,000 - 500,000 CLAWD";
        labels[2] = "500,000 - 1,000,000 CLAWD";
        labels[3] = "Over 1,000,000 CLAWD";

        ClawdPredictionMarket market = new ClawdPredictionMarket(CLIENT_OWNER, CLAWD_TOKEN, question, labels);

        deployments.push(Deployment({ name: "ClawdPredictionMarket", addr: address(market) }));
    }
}
