# Swarm Vault Yield Rotator

A manual yield optimization service for Swarm Vault managers. Run this script to rotate swarm member stablecoin holdings into higher-yielding options on Base chain.

## Create your own app like this
This app was created with Claude Code.  We used this prompt to create the plan.md and tasks.md files:
```
let's create a plan.md and tasks.md for a new app. the app will run every day, once a day.  the app will use defillama to find the current APY of all the yield bearing stablecoins on Base chain.  the app will then use the swarm vault manager SDK (docs at https://raw.githubusercontent.com/LIT-Protocol/swarm-vault/refs/heads/main/packages/sdk/README.md) to check user balances.  if the highest current APY of any of the yield bearing stables is higher than whatever asset they hold, then we will swap them into it. the idea is that it rotates you between the highest yield bearing stables on a daily basis, so you don't have to, and so that you always have the highest yield.  
```

Then, we asked Claude Code to build the app with the following prompt, clearing context after each phase is completed:
```
read plan.md and tasks.md and complete the next phase.  mark tasks as completed when done in tasks.md.  update plan.md with learnings.
```

If you run Claude Code with `docker sandbox run claude` then it will build your app uninterrupted in a sandbox.

## Overview

Users hold yield-bearing stablecoins (like aUSDC, mUSDC, sUSDC) but yields fluctuate over time. This service:

1. Monitors all yield-bearing stablecoin APYs on Base via DeFiLlama
2. Checks each swarm member's current holdings
3. Swaps into higher-yielding alternatives when beneficial

**Important**: This script runs manually - you decide when to run it. Each execution checks current yields and performs rotations if they make financial sense based on your configured thresholds.

## Quick Start

### Prerequisites

- Node.js 18+ (ES modules support)
- npm or yarn
- SwarmVault API key and Swarm ID

### Installation

```bash
npm install
```

### Configuration

Create a `.env` file based on `.env.example`:

```bash
# Required
SWARM_VAULT_API_KEY=svk_your_api_key_here
SWARM_ID=your-swarm-id-here

# Optional
MIN_APY_IMPROVEMENT=0.5    # Minimum APY improvement to trigger swap (%)
MIN_BALANCE_USD=10         # Minimum balance to consider for rotation ($)
MAX_SLIPPAGE=1.0           # Maximum slippage tolerance (%)
LOG_LEVEL=INFO             # DEBUG, INFO, WARN, ERROR
```

### Usage

This script is designed to be **run manually** whenever you want to check for yield optimization opportunities. Rotations only occur if:
- The APY improvement exceeds your `MIN_APY_IMPROVEMENT` threshold (default: 0.5%)
- The member's balance exceeds `MIN_BALANCE_USD` (default: $10)

**Inspect Current Yields:**
```bash
npm run yields
```

**Dry Run (simulate without executing swaps):**
```bash
npm run start:dry
```

**Live Execution:**
```bash
npm start
```

**Suggested Usage Patterns:**
- Run daily or weekly to check for yield opportunities
- Run after significant market APY changes
- Use dry-run first to preview what rotations would occur

### Running Tests

```bash
npm test
```

## How It Works

### Decision Logic

```
FOR each swarm member:
  1. Get current yield-bearing stablecoin holdings
  2. Get current APY for each holding from DeFiLlama
  3. Find highest APY yield-bearing stablecoin on Base

  IF (highestApy - currentApy) > minApyImprovement:
    AND user balance > minBalanceUsd:
    THEN execute swap to highest yielding token
```

### Architecture

```
┌──────────────────┐     ┌─────────────────────┐
│  Yield Rotator   │────▶│  Swarm Vault Skill  │
│     Service      │     │   (Execute Swaps)   │
└────────┬─────────┘     └─────────────────────┘
         │
┌────────▼─────────┐
│   DeFiLlama API  │
│  (APY Data Feed) │
└──────────────────┘
```

## Supported Tokens

### DEX-Swappable Yield Tokens (Rotation Targets)

These tokens can be swapped into via DEX and are used as rotation targets:

| Token | Address | Protocol |
|-------|---------|----------|
| aBasUSDC | `0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB` | Aave V3 |
| mUSDC | `0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22` | Moonwell |
| mDAI | `0x73b06D8d18De422E269645eaCe15400DE7462417` | Moonwell |
| sUSDC | `0x53E240C0F985175dA046A62F26D490d1E259036e` | Seamless Protocol |

### Base Stablecoins (Rotation Sources)

Plain stablecoins that can be rotated into yield-bearing positions:

| Token | Address | Protocol |
|-------|---------|----------|
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Native |
| USDbC | `0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA` | Native (Bridged) |
| DAI | `0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb` | Native |

### Not DEX-Swappable (Require Protocol Deposits)

These tokens require direct protocol deposits and are not currently supported as rotation targets:

| Token | Address | Protocol | Reason |
|-------|---------|----------|--------|
| cUSDCv3 | `0xb125E6687d4313864e53df431d5425969c15Eb2F` | Compound V3 | Requires `supply()` call |
| aBasUSDbC | `0x0a1d576f3eFeB55CCf1A5452F3cDE8a5B161BCaD` | Aave V3 | No DEX liquidity |
| mUSDbC | `0x703843C3379b52F9FF486c9f5892218d2a065cC8` | Moonwell | No DEX liquidity |

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `MIN_APY_IMPROVEMENT` | 0.5 | Minimum APY improvement (%) to trigger a swap |
| `MIN_BALANCE_USD` | 10 | Minimum balance ($) to consider for rotation |
| `MAX_SLIPPAGE` | 1.0 | Maximum slippage tolerance (%) for swaps |
| `LOG_LEVEL` | INFO | Logging verbosity (DEBUG, INFO, WARN, ERROR) |

## Project Structure

```
src/
  index.js              # Entry point and orchestration
  config.js             # Configuration management
  services/
    defillama.js        # DeFiLlama API integration
    balances.js         # Swarm member balance checking
    rotator.js          # Rotation decision logic
    swapper.js          # Swap execution
  utils/
    logger.js           # Logging utility
  __tests__/            # Test files
```

## API Endpoints Used

### DeFiLlama
- `GET https://yields.llama.fi/pools` - Fetches all yield pools

### SwarmVault SDK
- `getSwarmHoldings(swarmId, { includeMembers: true })` - Member balances

## Safety Features

- **Dry-run mode**: Test without executing swaps
- **Minimum balance threshold**: Skip small positions
- **Maximum APY filter**: Excludes volatile LP positions with APY > 25%
- **TVL requirements**: Only considers pools with TVL >= $100,000
- **Slippage limits**: Configurable slippage protection

## Example Output

```
[INFO] === Starting Yield Rotation ===
[INFO] Chain: Base (8453)
[INFO] Mode: DRY RUN
[INFO] Min APY improvement threshold: 0.5%
[INFO] Step 1: Fetching yield data from DeFiLlama...
[INFO] Found 286 Base stablecoin pools
[INFO] Top yielding stablecoin: mUSDC at 6.50% APY (moonwell)
[INFO] Step 2: Fetching swarm member balances...
[INFO] Found 5 swarm members to check
[INFO] Step 3: Calculating rotation opportunities...
[INFO] Rotation recommended: aBasUSDC -> mUSDC (+1.50% APY)
[INFO] Total rotations recommended: 2
[INFO] Step 4: Executing rotations...
[INFO] === Rotation Summary ===
[INFO] Users checked: 5
[INFO] Swaps executed: 2
[INFO] Swaps skipped: 0
[INFO] Errors: 0
```

## License

ISC
