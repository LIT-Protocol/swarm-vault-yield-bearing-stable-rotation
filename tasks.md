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

- [x] Create DeFiLlama service (`src/services/defillama.js`)
- [x] Implement `fetchYieldPools()` function
  - Fetch from `https://yields.llama.fi/pools`
  - Handle API errors and retries
- [x] Implement `filterBaseStablecoins(pools)` function
  - Filter by `chain === "Base"`
  - Filter by `stablecoin === true`
  - Filter by minimum TVL (avoid low liquidity pools)
  - Filter by max APY (25%) to exclude volatile LP positions
- [x] Implement `getTopYieldingStable()` function
  - Sort by APY descending
  - Return best option with token details and contract address
- [x] Create token address mapping (DeFiLlama pool → token contract address)
  - Mapped Aave V3, Compound V3, Moonwell, Seamless Protocol, Morpho Blue
- [x] Add unit tests for DeFiLlama service (21 tests passing)

## Phase 3: Balance Checking

- [x] Create balance service (`src/services/balances.js`)
- [x] Implement `getSwarmMemberBalances()` function
  - Integrated with @swarmvault/sdk to fetch member balances
  - Returns list of users with wallet addresses and token holdings
  - Transforms SDK response to internal format
- [x] Implement `getCurrentHoldingApy(userHoldings, yieldData)` function
  - Match user tokens to DeFiLlama yield data by address (priority) or symbol
  - Uses smart pool lookup with address and symbol indexes
  - Returns current APY for each holding
- [x] Handle edge cases:
  - Users with no yield-bearing stables (filtered out)
  - Users with multiple yield-bearing stables (all processed)
  - Unknown/unmapped tokens (marked as hasYieldData: false)
- [x] Add unit tests for balance service (20 tests passing)

## Phase 4: Rotation Logic

- [x] Create rotator service (`src/services/rotator.js`)
- [x] Implement `calculateRotations(users, yieldData)` function
  - Compare each user's current APY vs best available
  - Apply minimum improvement threshold
  - Return list of recommended swaps
- [x] Implement `shouldRotate(currentApy, bestApy, config)` function
  - Check if improvement exceeds threshold
- [x] Create rotation decision logging
- [x] Implement `prioritizeRotations()` - sorts by estimated annual gain
- [x] Implement `getRotationSummary()` - provides stats for reporting

## Phase 5: Swap Execution

- [x] Create swapper service (`src/services/swapper.js`)
- [x] Implement `executeSwap(user, fromToken, toToken, amount)` function
  - Dry-run mode support
  - TODO: Implement actual SDK integration for live swaps
- [x] Implement `validateSwap()` for pre-execution validation
- [x] Implement `executeRotations()` for batch processing
- [ ] Integrate with @swarmvault/sdk for actual swap execution
- [ ] Add transaction hash logging from SDK responses

## Phase 6: Main Orchestration

- [x] Create main entry point (`src/index.js`)
- [x] Implement `runRotation()` async function:
  1. Fetch yield data from DeFiLlama
  2. Get swarm member balances
  3. Calculate needed rotations
  4. Execute swaps
  5. Log results
- [x] Implement dry-run mode (simulate without executing)
- [x] Add CLI flag support (`--dry-run`)
- [x] Stats tracking (users checked, swaps executed, errors)

## Phase 7: Configuration & Logging

- [x] Create config module (`src/config.js`)
  - Chain settings (Base, chainId: 8453)
  - Threshold settings (min APY improvement, min balance)
  - API endpoints
  - SwarmVault settings (apiKey, apiUrl, swarmId)
- [x] Create logger utility (`src/utils/logger.js`)
  - Timestamp all entries
  - Log levels (DEBUG, INFO, WARN, ERROR)
  - `swapDecision()` and `summary()` helpers
- [x] Create `.env.example` with all required variables

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
| USDbC | `0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA` | Native (Bridged) |
| DAI | `0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb` | Native |
| aBasUSDC | `0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB` | Aave V3 |
| aBasUSDbC | `0x0a1d576f3eFeB55CCf1A5452F3cDE8a5B161BCaD` | Aave V3 |
| cUSDCv3 | `0xb125E6687d4313864e53df431d5425969c15Eb2F` | Compound V3 |
| mUSDC | `0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22` | Moonwell |
| mUSDbC | `0x703843C3379b52F9FF486c9f5892218d2a065cC8` | Moonwell |
| mDAI | `0x73b06D8d18De422E269645eaCe15400DE7462417` | Moonwell |
| sUSDC | `0x53E240C0F985175dA046A62F26D490d1E259036e` | Seamless Protocol |

*Addresses confirmed and mapped in `src/services/defillama.js`*

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
