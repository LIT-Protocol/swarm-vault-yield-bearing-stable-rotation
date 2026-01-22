# Swarm Vault Yield Rotator - Plan

## Overview

An automated daily service that maximizes yield for swarm vault members by continuously rotating their stablecoin holdings into the highest-yielding options available on Base chain.

## Core Concept

Users hold yield-bearing stablecoins (like aUSDC, sDAI, etc.) but yields fluctuate daily. This app automatically:
1. Monitors all yield-bearing stablecoin APYs on Base via DeFiLlama
2. Checks each swarm member's current holdings
3. Swaps into higher-yielding alternatives when beneficial

## Architecture

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

**Usage:** Run manually once daily via `npm start` or `node src/index.js`

## Components

### 1. DeFiLlama Integration
- Fetch yield data from DeFiLlama's `/pools` endpoint
- Filter for Base chain (`chain: "Base"`)
- Filter for stablecoin pools (`stablecoin: true`)
- Extract relevant yield-bearing tokens and their current APY

### 2. User Balance Checker
- Query swarm vault manager for member wallet balances
- Identify which yield-bearing stablecoins each user holds
- Map holdings to their current APY from DeFiLlama data

### 3. Yield Comparison Engine
- Compare user's current holding APY vs best available APY
- Apply minimum threshold (e.g., 0.5% improvement) to avoid unnecessary swaps
- Consider gas costs in swap decision

### 4. Swap Executor
- Use swarm vault manager skill to execute swaps
- Swap from current holding to highest-yield alternative
- Handle swap routing (may need intermediate token like USDC)

## Supported Yield-Bearing Stablecoins (Base)

Initial target tokens to track:
- **aUSDC** - Aave USDC (Aave)
- **cUSDCv3** - Compound USDC (Compound V3)
- **sDAI** - Savings DAI (MakerDAO)
- **USDbC variants** - Various yield sources
- **USDC/USDT LP positions** - If applicable

## Configuration

```javascript
{
  chain: "Base",
  chainId: 8453,
  minApyImprovement: 0.5,  // Minimum 0.5% APY improvement to trigger swap
  minBalanceUsd: 10,       // Minimum balance to consider for rotation
  gasBuffer: 1.2           // 20% gas buffer for safety
}
```

## Decision Logic

```
FOR each swarm member:
  1. Get current yield-bearing stablecoin holdings
  2. Get current APY for each holding from DeFiLlama
  3. Find highest APY yield-bearing stablecoin on Base

  IF (highestApy - currentApy) > minApyImprovement:
    AND user balance > minBalanceUsd:
    THEN execute swap to highest yielding token
```

## API Endpoints Used

### DeFiLlama
- `GET https://yields.llama.fi/pools` - All yield pools
- Filter: `chain === "Base" && stablecoin === true`

### Swarm Vault Manager (via skill)
- Check balances across member wallets
- Execute swaps on behalf of members

## Error Handling

- Retry failed API calls (3 attempts with exponential backoff)
- Skip users with insufficient balance
- Log all swap attempts and results
- Alert on consecutive failures

## Security Considerations

- Never store private keys in code
- Use swarm vault manager skill for all wallet interactions
- Validate all swap parameters before execution
- Set reasonable slippage limits (e.g., 1%)

## Future Enhancements

1. Multi-chain support beyond Base
2. Include non-stablecoin yield opportunities
3. User-configurable risk tolerance
4. Yield history tracking and analytics
5. Telegram/Discord notifications for swaps

---

## Implementation Notes & Learnings

### Phase 1 Learnings (2026-01-22)

**DeFiLlama API Observations:**
- The `/pools` endpoint returns 20,000+ pools across all chains
- Filtering for Base stablecoins with TVL >= $100k yields ~314 pools
- Some pools show extremely high APYs (e.g., 9000%+) - these are typically volatile LP positions that need additional filtering
- API response structure: `{ data: [...pools] }` with each pool having `chain`, `stablecoin`, `apy`, `tvlUsd`, `symbol`, `project` fields

**Recommendations for Phase 2:**
- Add additional filtering to exclude highly volatile LP pools (may want to filter by `pool` type or set APY ceiling)
- Consider filtering by specific known protocols (Aave, Compound, MakerDAO) for safer yield options
- Map DeFiLlama pool IDs to actual token contract addresses on Base

**Project Structure:**
- ES modules (`"type": "module"`) working well with Node.js
- Logger utility provides good visibility into rotation decisions
- Dry-run mode essential for testing without executing swaps

### Phase 2 Learnings (2026-01-22)

**Token Address Mapping:**
- Successfully mapped yield-bearing tokens from major protocols on Base:
  - Aave V3: aBasUSDC (`0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB`), aBasUSDbC
  - Compound V3: cUSDCv3 (`0xb125E6687d4313864e53df431d5425969c15Eb2F`)
  - Moonwell: mUSDC, mUSDbC, mDAI
  - Seamless Protocol: sUSDC
- Token address lookup implemented via `getTokenAddress(project, symbol)` function

**APY Filtering:**
- Added max APY ceiling of 25% to filter out volatile LP positions
- This prevents the system from recommending high-risk pools with unsustainable yields
- filterBaseStablecoins now accepts `maxApy` parameter for flexibility

**New Functions Added:**
- `getTopYieldingStables(pools, count)` - Returns top N pools for comparison
- `getTokenAddress(project, symbol)` - Maps pool to contract address

**Testing:**
- 21 unit tests covering all DeFiLlama service functions
- Tests use mock pool data to avoid API calls
- All tests passing with Jest ES modules support

### Phase 3 Learnings (2026-01-22)

**SwarmVault SDK Integration:**
- Successfully integrated `@swarmvault/sdk` for fetching member balances
- SDK provides `getSwarmHoldings(swarmId, { includeMembers: true })` to get per-member balances
- Response includes: `membershipId`, `agentWalletAddress`, `userWalletAddress`, `ethBalance`, `tokens[]`
- Token balances are in raw units (smallest denomination) - formatted using BigInt arithmetic

**Token Matching Strategy:**
- Implemented multi-level pool lookup for matching holdings to yield pools:
  1. **Address match (priority)**: Most accurate, uses tokenAddressMap from Phase 2
  2. **Symbol match (fallback)**: Matches by token symbol, selects highest APY if multiple pools
- Address-based matching ensures users get correct APY for their specific yield-bearing token
- Example: aBasUSDC at address `0x4e65...` matches to Aave V3 pool specifically

**Balance Service Architecture:**
- `getSwarmMemberBalances()`: Fetches raw balances from SwarmVault API
- `getCurrentHoldingApy()`: Enriches holdings with APY data from DeFiLlama pools
- `filterYieldBearingHoldings()`: Filters to only yield-bearing stables above min balance
- `getEnrichedMemberData()`: Orchestrates the full enrichment pipeline
- `isYieldBearingStable()`: Utility to identify yield-bearing tokens by symbol pattern or address

**Configuration Updates:**
- Added `swarmVault.apiKey`, `swarmVault.apiUrl`, `swarmVault.swarmId` to config
- Updated `.env.example` with required SwarmVault environment variables

**Testing:**
- 20 new unit tests for balance service covering:
  - APY enrichment for various holdings
  - Pool matching priority (address > symbol)
  - Edge cases (empty holdings, missing pools, unknown tokens)
  - Yield-bearing token identification
- All 48 tests passing (21 DeFiLlama + 20 balance + 7 others)

**Recommendations for Phase 4:**
- Rotator service is already implemented from Phase 2 exploration
- May need minor updates to `calculateRotations()` to work with new member data structure
- Consider adding USD price feed integration for accurate `balanceUsd` values
