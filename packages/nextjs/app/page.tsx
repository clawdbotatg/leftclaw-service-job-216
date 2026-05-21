"use client";

import { useEffect, useMemo, useState } from "react";
import { Address } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { formatEther, parseEther } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import {
  useScaffoldReadContract,
  useScaffoldWriteContract,
  useTargetNetwork,
  useWriteAndOpen,
} from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

const MARKET_ADDRESS = "0x92c1ab2e5c42f0a2ce998ebdcb3e57d27ebc4e0d" as const;
const BASESCAN_URL = `https://basescan.org/address/${MARKET_ADDRESS}`;
const BUCKET_IDS = [0n, 1n, 2n, 3n] as const;

const formatClawd = (value: bigint | undefined): string => {
  if (value === undefined) return "0";
  try {
    const asFloat = Number(formatEther(value));
    if (!Number.isFinite(asFloat)) return formatEther(value);
    return asFloat.toLocaleString(undefined, { maximumFractionDigits: 2 });
  } catch {
    return "0";
  }
};

type BucketCardProps = {
  bucketId: bigint;
  label: string;
  totalPooled: bigint;
  totalPool: bigint;
  userStake: bigint | undefined;
  isConnected: boolean;
  onStakeClick: (bucketId: bigint, label: string) => void;
};

const BucketCard = ({
  bucketId,
  label,
  totalPooled,
  totalPool,
  userStake,
  isConnected,
  onStakeClick,
}: BucketCardProps) => {
  const pct =
    totalPool === 0n
      ? 0
      : Number((totalPooled * 10000n) / totalPool) / 100;

  return (
    <div className="card bg-base-100 shadow-xl border border-base-300 hover:border-warning transition-colors">
      <div className="card-body gap-3">
        <h3 className="card-title text-lg">{label}</h3>
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-warning">
            {formatClawd(totalPooled)} CLAWD
          </span>
          <span className="text-xs opacity-70">{pct.toFixed(1)}% of pool</span>
          {isConnected && userStake !== undefined && userStake > 0n && (
            <span className="text-xs text-info mt-1">
              Your stake: {formatClawd(userStake)} CLAWD
            </span>
          )}
        </div>
        <div className="card-actions justify-end">
          <button
            className="btn btn-warning btn-sm"
            onClick={() => onStakeClick(bucketId, label)}
          >
            Stake
          </button>
        </div>
      </div>
    </div>
  );
};

type StakeFormProps = {
  bucketId: bigint;
  bucketLabel: string;
  onClose: () => void;
  onStakeComplete: () => void;
};

const StakeForm = ({ bucketId, bucketLabel, onClose, onStakeComplete }: StakeFormProps) => {
  const { address, chain, isConnected } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { switchChain, isPending: switchPending } = useSwitchChain();
  const { writeAndOpen } = useWriteAndOpen();

  const [amount, setAmount] = useState("");
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const [approvalCooldown, setApprovalCooldown] = useState(false);
  const [stakeSubmitting, setStakeSubmitting] = useState(false);

  const parsedAmount = useMemo(() => {
    if (!amount || isNaN(Number(amount))) return 0n;
    try {
      return parseEther(amount);
    } catch {
      return 0n;
    }
  }, [amount]);

  const { data: clawdBalance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "balanceOf",
    args: [address],
  });

  const { data: allowance, refetch: refetchAllowance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "allowance",
    args: [address, MARKET_ADDRESS],
  });

  const { writeContractAsync: writeClawdAsync } = useScaffoldWriteContract({
    contractName: "CLAWD",
  });
  const { writeContractAsync: writeMarketAsync } = useScaffoldWriteContract({
    contractName: "ClawdPredictionMarket",
  });

  const onWrongNetwork = isConnected && chain && chain.id !== targetNetwork.id;
  const needsApproval =
    parsedAmount > 0n && (!allowance || (allowance as bigint) < parsedAmount);
  const hasBalance =
    parsedAmount > 0n && (clawdBalance as bigint | undefined) !== undefined && (clawdBalance as bigint) >= parsedAmount;

  const handleApprove = async () => {
    if (approvalSubmitting || approvalCooldown) return;
    if (parsedAmount === 0n) {
      notification.error("Enter an amount first");
      return;
    }
    setApprovalSubmitting(true);
    try {
      await writeAndOpen(() =>
        writeClawdAsync({
          functionName: "approve",
          args: [MARKET_ADDRESS, parsedAmount],
        }),
      );
      setApprovalCooldown(true);
      notification.success("CLAWD approval submitted");
      setTimeout(() => {
        setApprovalCooldown(false);
        refetchAllowance();
      }, 4000);
    } catch (e) {
      console.error(e);
      notification.error("Approval failed");
    } finally {
      setApprovalSubmitting(false);
    }
  };

  const handleStake = async () => {
    if (stakeSubmitting) return;
    if (parsedAmount === 0n) {
      notification.error("Enter an amount first");
      return;
    }
    if (!hasBalance) {
      notification.error("Insufficient CLAWD balance");
      return;
    }
    setStakeSubmitting(true);
    try {
      await writeAndOpen(() =>
        writeMarketAsync({
          functionName: "stake",
          args: [bucketId, parsedAmount],
        }),
      );
      notification.success(`Staked on "${bucketLabel}"!`);
      setAmount("");
      onStakeComplete();
      onClose();
    } catch (e) {
      console.error(e);
      notification.error("Stake failed");
    } finally {
      setStakeSubmitting(false);
    }
  };

  return (
    <div className="card bg-base-100 shadow-2xl border-2 border-warning">
      <div className="card-body gap-4">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="card-title text-xl">Stake on</h3>
            <p className="text-warning font-semibold">{bucketLabel}</p>
          </div>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">Amount (CLAWD)</span>
            <span className="label-text-alt">
              Balance: {formatClawd(clawdBalance as bigint | undefined)} CLAWD
            </span>
          </label>
          <input
            type="number"
            min="0"
            step="any"
            className="input input-bordered w-full"
            placeholder="0.0"
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
        </div>

        <div className="alert">
          <div className="text-xs">
            <p>🔥 25% of your stake will be burned immediately.</p>
            <p>🏆 75% goes to the prize pool for this bucket.</p>
          </div>
        </div>

        {!isConnected && (
          <div className="flex justify-center">
            <RainbowKitCustomConnectButton />
          </div>
        )}

        {isConnected && onWrongNetwork && (
          <button
            className="btn btn-warning w-full"
            disabled={switchPending}
            onClick={() => switchChain({ chainId: targetNetwork.id })}
          >
            {switchPending ? "Switching..." : `Switch to ${targetNetwork.name}`}
          </button>
        )}

        {isConnected && !onWrongNetwork && needsApproval && (
          <button
            className="btn btn-warning w-full"
            disabled={approvalSubmitting || approvalCooldown || parsedAmount === 0n}
            onClick={handleApprove}
          >
            {approvalSubmitting
              ? "Approving..."
              : approvalCooldown
                ? "Waiting for confirmation..."
                : "Approve CLAWD"}
          </button>
        )}

        {isConnected && !onWrongNetwork && !needsApproval && (
          <button
            className="btn btn-warning w-full"
            disabled={stakeSubmitting || parsedAmount === 0n || !hasBalance}
            onClick={handleStake}
          >
            {stakeSubmitting ? "Staking..." : `Stake on ${bucketLabel}`}
          </button>
        )}
      </div>
    </div>
  );
};

const HomeContent = () => {
  const { address, isConnected } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { writeAndOpen } = useWriteAndOpen();

  const [selectedBucket, setSelectedBucket] = useState<{ id: bigint; label: string } | null>(null);
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [resolveSubmitting, setResolveSubmitting] = useState(false);

  const { data: question } = useScaffoldReadContract({
    contractName: "ClawdPredictionMarket",
    functionName: "question",
  });
  const { data: totalPool } = useScaffoldReadContract({
    contractName: "ClawdPredictionMarket",
    functionName: "totalPool",
  });
  const { data: resolved } = useScaffoldReadContract({
    contractName: "ClawdPredictionMarket",
    functionName: "resolved",
  });
  const { data: winningBucketId } = useScaffoldReadContract({
    contractName: "ClawdPredictionMarket",
    functionName: "winningBucketId",
  });
  const { data: owner } = useScaffoldReadContract({
    contractName: "ClawdPredictionMarket",
    functionName: "owner",
  });

  const bucket0 = useScaffoldReadContract({
    contractName: "ClawdPredictionMarket",
    functionName: "getBucket",
    args: [BUCKET_IDS[0]],
  });
  const bucket1 = useScaffoldReadContract({
    contractName: "ClawdPredictionMarket",
    functionName: "getBucket",
    args: [BUCKET_IDS[1]],
  });
  const bucket2 = useScaffoldReadContract({
    contractName: "ClawdPredictionMarket",
    functionName: "getBucket",
    args: [BUCKET_IDS[2]],
  });
  const bucket3 = useScaffoldReadContract({
    contractName: "ClawdPredictionMarket",
    functionName: "getBucket",
    args: [BUCKET_IDS[3]],
  });

  const buckets = [bucket0, bucket1, bucket2, bucket3];

  const stake0 = useScaffoldReadContract({
    contractName: "ClawdPredictionMarket",
    functionName: "getUserStakeInBucket",
    args: [address, BUCKET_IDS[0]],
  });
  const stake1 = useScaffoldReadContract({
    contractName: "ClawdPredictionMarket",
    functionName: "getUserStakeInBucket",
    args: [address, BUCKET_IDS[1]],
  });
  const stake2 = useScaffoldReadContract({
    contractName: "ClawdPredictionMarket",
    functionName: "getUserStakeInBucket",
    args: [address, BUCKET_IDS[2]],
  });
  const stake3 = useScaffoldReadContract({
    contractName: "ClawdPredictionMarket",
    functionName: "getUserStakeInBucket",
    args: [address, BUCKET_IDS[3]],
  });
  const userStakes = [stake0, stake1, stake2, stake3];

  const { data: claimAmount } = useScaffoldReadContract({
    contractName: "ClawdPredictionMarket",
    functionName: "getClaimAmount",
    args: [address],
  });

  const { data: claimed } = useScaffoldReadContract({
    contractName: "ClawdPredictionMarket",
    functionName: "claimed",
    args: [address],
  });

  const { writeContractAsync: writeMarketAsync } = useScaffoldWriteContract({
    contractName: "ClawdPredictionMarket",
  });

  const isOwner =
    isConnected && address && owner && (address as string).toLowerCase() === (owner as string).toLowerCase();

  const userHasStakes = userStakes.some(s => (s.data as bigint | undefined) && (s.data as bigint) > 0n);
  const isWinner =
    resolved &&
    winningBucketId !== undefined &&
    userStakes[Number(winningBucketId as bigint)]?.data !== undefined &&
    (userStakes[Number(winningBucketId as bigint)].data as bigint) > 0n;

  const winningLabel =
    resolved && winningBucketId !== undefined
      ? (buckets[Number(winningBucketId as bigint)]?.data as readonly [string, bigint] | undefined)?.[0]
      : undefined;

  const refetchAll = () => {
    for (const b of buckets) b.refetch();
    for (const s of userStakes) s.refetch();
  };

  // Trigger a refetch when an account connects
  useEffect(() => {
    refetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const handleResolve = async (bucketId: bigint, label: string) => {
    if (resolveSubmitting) return;
    if (!confirm(`Resolve with winning bucket: "${label}"? This cannot be undone.`)) return;
    setResolveSubmitting(true);
    try {
      await writeAndOpen(() =>
        writeMarketAsync({
          functionName: "resolve",
          args: [bucketId],
        }),
      );
      notification.success(`Resolved: ${label}`);
      refetchAll();
    } catch (e) {
      console.error(e);
      notification.error("Resolve failed");
    } finally {
      setResolveSubmitting(false);
    }
  };

  const handleClaim = async () => {
    if (claimSubmitting) return;
    setClaimSubmitting(true);
    try {
      await writeAndOpen(() =>
        writeMarketAsync({
          functionName: "claim",
        }),
      );
      notification.success("CLAWD claimed!");
    } catch (e) {
      console.error(e);
      notification.error("Claim failed");
    } finally {
      setClaimSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col grow w-full">
      {/* Section 1: Market Header */}
      <section className="bg-base-200 px-5 py-10">
        <div className="max-w-5xl mx-auto text-center">
          <div className="text-6xl mb-4">🍕</div>
          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            {(question as string) ??
              "How much $CLAWD will be burned on Bitcoin Pizza Day (May 22nd, 2026)?"}
          </h1>
          <div className="inline-flex flex-col items-center gap-2 mt-4">
            <span className="badge badge-warning badge-lg p-4 text-base font-semibold">
              Pool: {formatClawd(totalPool as bigint | undefined)} CLAWD
            </span>
            {resolved && (
              <div className="alert alert-success mt-4 max-w-2xl">
                <span className="font-semibold">
                  🏆 RESOLVED — Winning bucket: {winningLabel ?? "..."}
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Section 2: Prediction Buckets */}
      <section className="px-5 py-10">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-6">Prediction Buckets</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {buckets.map((b, idx) => {
              const data = b.data as readonly [string, bigint] | undefined;
              const label = data?.[0] ?? "...";
              const pooled = data?.[1] ?? 0n;
              const userStake = userStakes[idx].data as bigint | undefined;
              return (
                <BucketCard
                  key={idx}
                  bucketId={BUCKET_IDS[idx]}
                  label={label}
                  totalPooled={pooled}
                  totalPool={(totalPool as bigint | undefined) ?? 0n}
                  userStake={userStake}
                  isConnected={isConnected}
                  onStakeClick={(id, lbl) => setSelectedBucket({ id, label: lbl })}
                />
              );
            })}
          </div>
        </div>
      </section>

      {/* Section 3: Stake Flow */}
      {selectedBucket && (
        <section className="px-5 py-6">
          <div className="max-w-md mx-auto">
            <StakeForm
              bucketId={selectedBucket.id}
              bucketLabel={selectedBucket.label}
              onClose={() => setSelectedBucket(null)}
              onStakeComplete={refetchAll}
            />
          </div>
        </section>
      )}

      {/* Section 4: My Stakes */}
      {isConnected && userHasStakes && (
        <section className="bg-base-200 px-5 py-10">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-center mb-6">My Stakes</h2>
            <div className="card bg-base-100 shadow-md">
              <div className="card-body gap-3">
                {userStakes.map((s, idx) => {
                  const amount = s.data as bigint | undefined;
                  if (!amount || amount === 0n) return null;
                  const bData = buckets[idx].data as readonly [string, bigint] | undefined;
                  return (
                    <div
                      key={idx}
                      className="flex justify-between items-center border-b border-base-300 pb-2 last:border-b-0"
                    >
                      <span className="text-sm">{bData?.[0] ?? `Bucket ${idx}`}</span>
                      <span className="font-semibold text-warning">
                        {formatClawd(amount)} CLAWD
                      </span>
                    </div>
                  );
                })}

                {resolved && isWinner && (
                  <div className="mt-4 flex flex-col gap-2">
                    <div className="alert alert-success">
                      <span>
                        🏆 You won! Claimable: {formatClawd(claimAmount as bigint | undefined)} CLAWD
                      </span>
                    </div>
                    <button
                      className="btn btn-warning"
                      onClick={handleClaim}
                      disabled={
                        claimSubmitting ||
                        (claimed as boolean | undefined) === true ||
                        !claimAmount ||
                        (claimAmount as bigint) === 0n
                      }
                    >
                      {claimSubmitting
                        ? "Claiming..."
                        : (claimed as boolean | undefined) === true
                          ? "Already claimed"
                          : "Claim CLAWD"}
                    </button>
                  </div>
                )}

                {resolved && !isWinner && (
                  <div className="alert alert-info mt-4">
                    <span>Better luck next time!</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Section 5: Resolve (owner only) */}
      {isOwner && !resolved && (
        <section className="px-5 py-10">
          <div className="max-w-3xl mx-auto">
            <div className="card bg-base-100 border-2 border-warning shadow-xl">
              <div className="card-body gap-4">
                <h2 className="card-title text-2xl">🔮 Oracle Resolution (Owner Only)</h2>
                <div className="alert alert-warning">
                  <span className="text-sm">
                    This cannot be undone. Make sure the correct bucket wins.
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {buckets.map((b, idx) => {
                    const data = b.data as readonly [string, bigint] | undefined;
                    const label = data?.[0] ?? `Bucket ${idx}`;
                    return (
                      <button
                        key={idx}
                        className="btn btn-warning btn-outline"
                        disabled={resolveSubmitting}
                        onClick={() => handleResolve(BUCKET_IDS[idx], label)}
                      >
                        Resolve: {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Section 6: Footer */}
      <section className="px-5 py-8 bg-base-200">
        <div className="max-w-5xl mx-auto flex flex-col items-center gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="opacity-70">Contract:</span>
            <Address address={MARKET_ADDRESS} chain={targetNetwork} />
          </div>
          <a
            href={BASESCAN_URL}
            target="_blank"
            rel="noreferrer"
            className="link link-warning"
          >
            View on Basescan ↗
          </a>
        </div>
      </section>
    </div>
  );
};

const Home: NextPage = () => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) {
    return (
      <div className="flex flex-col grow w-full items-center justify-center py-20">
        <div className="text-6xl mb-4">🍕</div>
        <p className="text-lg opacity-70">Loading Pizza Day Oracle...</p>
      </div>
    );
  }
  return <HomeContent />;
};

export default Home;
