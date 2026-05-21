# 🍕 Pizza Day Oracle

**Live URL:** https://bafybeif7gfmav4psdihjce2umvfhzk4kq2vsxhz4w3na3jpahqwnz3ejxu.ipfs.community.bgipfs.com/

A prediction market for Bitcoin Pizza Day on Base. Stake $CLAWD to predict how much CLAWD will be burned on May 22nd, 2026.

## Live App
(IPFS URL goes here after deployment)

## Contracts
- ClawdPredictionMarket: [0x92c1ab2e5c42f0a2ce998ebdcb3e57d27ebc4e0d](https://basescan.org/address/0x92c1ab2e5c42f0a2ce998ebdcb3e57d27ebc4e0d)

## Mechanics
- Stake CLAWD on a prediction bucket
- 25% burned immediately, 75% to prize pool
- Owner resolves with winning bucket after Pizza Day
- Winners claim proportional share of full prize pool

## Owner
After deploy, `acceptOwnership()` is not needed — ownership was set directly to 0x34aa3f359a9d614239015126635ce7732c18fdf3.
