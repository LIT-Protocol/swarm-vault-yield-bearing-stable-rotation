# Swarm Vault Yield Rotator - Tasks

## Phase 1: Project Setup

- [x] Initialize Node.js project with ES modules
- [x] Install core dependencies:
  - `axios` - HTTP client for DeFiLlama API
  - `dotenv` - Environment configuration
  - `ethers` - For token address validation and utilities
  - `jest` - Testing framework (dev dependency)
- [x] Create project folder structure:
  ```
  src/
    index.js          # Entry point
    config.js         # Configuration
    services/
      defillama.js    # DeFiLlama API integration
      balances.js     # Balance checking logic
      rotator.js      # Core rotation logic
      swapper.js      # Swap execution
    utils/
      logger.js       # Logging utility
  ```
- [x] Set up environment variables (.env.example)

## Phase 2: DeFiLlama Integration

- [ ] Create DeFiLlama service (`src/services/defillama.js`)
- [ ] Implement `fetchYieldPools()` function
  - Fetch from `https://yields.llama.fi/pools`
  - Handle API errors and retries
- [ ] Implement `filterBaseStablecoins(pools)` function
  - Filter by `chain === "Base"`
  - Filter by `stablecoin === true`
  - Filter by minimum TVL (avoid low liquidity pools)
- [ ] Implement `getTopYieldingStable()` function
  - Sort by APY descending
  - Return best option with token details
- [ ] Create token address mapping (DeFiLlama pool → token contract address)
- [ ] Add unit tests for DeFiLlama service

## Phase 3: Balance Checking

- [ ] Create balance service (`src/services/balances.js`)
- [ ] Implement `getSwarmMemberBalances()` function
  - Interface with swarm vault manager skill
  - Return list of users with their holdings
- [ ] Implement `getCurrentHoldingApy(userHoldings, yieldData)` function
  - Match user tokens to DeFiLlama yield data
  - Return current APY for each holding
- [ ] Handle edge cases:
  - Users with no yield-bearing stables
  - Users with multiple yield-bearing stables
  - Unknown/unmapped tokens

## Phase 4: Rotation Logic

- [ ] Create rotator service (`src/services/rotator.js`)
- [ ] Implement `calculateRotations(users, yieldData)` function
  - Compare each user's current APY vs best available
  - Apply minimum improvement threshold
  - Return list of recommended swaps
- [ ] Implement `shouldRotate(currentApy, bestApy, config)` function
  - Check if improvement exceeds threshold
  - Consider gas costs (optional)
- [ ] Create rotation decision logging
- [ ] Add unit tests for rotation logic

## Phase 5: Swap Execution

- [ ] Create swapper service (`src/services/swapper.js`)
- [ ] Implement `executeSwap(user, fromToken, toToken, amount)` function
  - Use swarm vault manager skill
  - Handle swap routing if needed
- [ ] Implement slippage protection
- [ ] Add swap result tracking
- [ ] Handle partial failures gracefully
- [ ] Add transaction hash logging

## Phase 6: Main Orchestration

- [ ] Create main entry point (`src/index.js`)
- [ ] Implement `runRotation()` async function:
  1. Fetch yield data from DeFiLlama
  2. Get swarm member balances
  3. Calculate needed rotations
  4. Execute swaps
  5. Log results
- [ ] Implement dry-run mode (simulate without executing)
- [ ] Add CLI flag support (`--dry-run`)

## Phase 7: Configuration & Logging

- [ ] Create config module (`src/config.js`)
  - Chain settings (Base, chainId: 8453)
  - Threshold settings (min APY improvement, min balance)
  - API endpoints
- [ ] Create logger utility (`src/utils/logger.js`)
  - Timestamp all entries
  - Log levels (info, warn, error)
  - Optional file output
- [ ] Create `.env.example` with all required variables

## Phase 8: Testing & Documentation

- [ ] Write integration tests
- [ ] Test with dry-run mode
- [ ] Create README.md with:
  - Setup instructions
  - Configuration options
  - Usage examples
- [ ] Document supported tokens and their addresses

## Phase 9: Polish

- [ ] Add summary output after each run
- [ ] Set up error alerting (optional)
- [ ] Performance optimization if needed

---

## Token Address Reference (Base Chain)

| Token | Address | Protocol |
|-------|---------|----------|
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Native |
| aBasUSDC | TBD | Aave V3 |
| cUSDCv3 | TBD | Compound V3 |

*Note: Addresses to be confirmed during implementation*

---

## Definition of Done

Each task is complete when:
1. Code is written and functional
2. Basic error handling is in place
3. Console logging shows progress
4. Manual testing passes

---

## Priority Order

1. **High**: Phases 1-4 (Core functionality)
2. **Medium**: Phases 5-6 (Execution)
3. **Low**: Phases 7-9 (Polish & deployment)
