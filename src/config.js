import 'dotenv/config';

export const config = {
  // Chain settings
  chain: 'Base',
  chainId: 8453,

  // Rotation thresholds
  minApyImprovement: parseFloat(process.env.MIN_APY_IMPROVEMENT) || 0.5,  // Minimum 0.5% APY improvement to trigger swap
  minBalanceUsd: parseFloat(process.env.MIN_BALANCE_USD) || 10,           // Minimum balance to consider for rotation

  // API settings
  defillamaBaseUrl: 'https://yields.llama.fi',

  // Swap settings
  maxSlippage: parseFloat(process.env.MAX_SLIPPAGE) || 1.0,  // 1% max slippage
  gasBuffer: 1.2,  // 20% gas buffer for safety

  // Retry settings
  maxRetries: 3,
  retryDelayMs: 1000,

  // Execution mode
  dryRun: process.argv.includes('--dry-run'),
};

// Token addresses on Base chain
export const tokenAddresses = {
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
  DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
  // Yield-bearing tokens (to be confirmed during DeFiLlama integration)
  // aBasUSDC: TBD - Aave V3 USDC on Base
  // cUSDCv3: TBD - Compound V3 USDC on Base
};

export default config;
