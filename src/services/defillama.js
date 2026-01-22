import axios from 'axios';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const POOLS_ENDPOINT = `${config.defillamaBaseUrl}/pools`;

// Maximum APY threshold to filter out volatile/risky LP positions
// Stablecoins realistically shouldn't exceed 15-20% APY sustainably
const MAX_STABLE_APY = 25;

/**
 * Token address mapping: DeFiLlama pool symbols/projects -> Base chain contract addresses
 * Maps yield-bearing stablecoin pools to their actual token addresses on Base
 */
export const tokenAddressMap = {
  // Aave V3 on Base
  'aave-v3': {
    'USDC': '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB', // aBasUSDC
    'USDbC': '0x0a1d576f3eFeB55CCf1A5452F3cDE8a5B161BCaD', // aBasUSDbC
  },
  // Compound V3 on Base
  'compound-v3': {
    'USDC': '0xb125E6687d4313864e53df431d5425969c15Eb2F', // cUSDCv3
  },
  // Moonwell on Base
  'moonwell': {
    'USDC': '0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22', // mUSDC
    'USDbC': '0x703843C3379b52F9FF486c9f5892218d2a065cC8', // mUSDbC
    'DAI': '0x73b06D8d18De422E269645eaCe15400DE7462417', // mDAI
  },
  // Seamless Protocol on Base
  'seamless-protocol': {
    'USDC': '0x53E240C0F985175dA046A62F26D490d1E259036e', // sUSDC
  },
  // Morpho on Base (various vaults)
  'morpho-blue': {
    'USDC': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Uses underlying USDC
  },
  // Extra Finance on Base
  'extra-finance': {
    'USDC': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Uses underlying USDC
  },
};

// Underlying stablecoin addresses on Base for swapping
export const underlyingTokens = {
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
  DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
};

/**
 * Get token address for a pool based on project and symbol
 * @param {string} project - Protocol name (e.g., 'aave-v3')
 * @param {string} symbol - Token symbol (e.g., 'USDC')
 * @returns {string|null} Token contract address or null
 */
export function getTokenAddress(project, symbol) {
  const projectMap = tokenAddressMap[project];
  if (!projectMap) return null;

  // Try to find exact match first, then try underlying token symbol
  const symbolKey = Object.keys(projectMap).find(
    key => symbol.toUpperCase().includes(key.toUpperCase())
  );

  return symbolKey ? projectMap[symbolKey] : null;
}

/**
 * Fetch all yield pools from DeFiLlama
 * @returns {Promise<Array>} Array of pool data
 */
export async function fetchYieldPools() {
  let lastError;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      logger.debug(`Fetching yield pools from DeFiLlama (attempt ${attempt})`);
      const response = await axios.get(POOLS_ENDPOINT);
      logger.info(`Fetched ${response.data.data?.length || 0} pools from DeFiLlama`);
      return response.data.data || [];
    } catch (error) {
      lastError = error;
      logger.warn(`DeFiLlama API request failed (attempt ${attempt})`, {
        error: error.message
      });

      if (attempt < config.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, config.retryDelayMs * attempt));
      }
    }
  }

  throw new Error(`Failed to fetch yield pools after ${config.maxRetries} attempts: ${lastError.message}`);
}

/**
 * Filter pools for Base chain stablecoins with adequate liquidity
 * Excludes volatile LP positions with unrealistically high APYs
 * @param {Array} pools - All pools from DeFiLlama
 * @param {number} minTvl - Minimum TVL in USD (default 100k)
 * @param {number} maxApy - Maximum APY threshold (default MAX_STABLE_APY)
 * @returns {Array} Filtered stablecoin pools on Base
 */
export function filterBaseStablecoins(pools, minTvl = 100000, maxApy = MAX_STABLE_APY) {
  const filtered = pools.filter(pool => {
    const isBase = pool.chain === config.chain;
    const isStablecoin = pool.stablecoin === true;
    const hasMinTvl = (pool.tvlUsd || 0) >= minTvl;
    const belowMaxApy = (pool.apy || 0) <= maxApy;

    return isBase && isStablecoin && hasMinTvl && belowMaxApy;
  });

  // Also log how many were excluded for high APY
  const highApyExcluded = pools.filter(pool =>
    pool.chain === config.chain &&
    pool.stablecoin === true &&
    (pool.tvlUsd || 0) >= minTvl &&
    (pool.apy || 0) > maxApy
  ).length;

  logger.info(`Found ${filtered.length} Base stablecoin pools (TVL >= $${minTvl.toLocaleString()}, APY <= ${maxApy}%)`);
  if (highApyExcluded > 0) {
    logger.debug(`Excluded ${highApyExcluded} pools with APY > ${maxApy}% (likely volatile LP positions)`);
  }

  return filtered;
}

/**
 * Get the highest yielding stablecoin pool on Base
 * @param {Array} pools - Filtered pools (should already be Base stablecoins)
 * @returns {Object|null} Best pool with APY and token details
 */
export function getTopYieldingStable(pools) {
  if (!pools || pools.length === 0) {
    logger.warn('No pools available for yield comparison');
    return null;
  }

  // Sort by APY descending and get the best one
  const sorted = [...pools].sort((a, b) => (b.apy || 0) - (a.apy || 0));
  const best = sorted[0];

  // Try to get the token address from our mapping
  const tokenAddress = getTokenAddress(best.project, best.symbol);

  logger.info(`Top yielding stablecoin: ${best.symbol} at ${best.apy?.toFixed(2)}% APY (${best.project})`);

  return {
    pool: best.pool,
    symbol: best.symbol,
    project: best.project,
    apy: best.apy || 0,
    tvlUsd: best.tvlUsd,
    underlyingTokens: best.underlyingTokens || [],
    tokenAddress,
  };
}

/**
 * Get top N yielding stablecoin pools on Base
 * @param {Array} pools - Filtered pools (should already be Base stablecoins)
 * @param {number} count - Number of top pools to return (default 5)
 * @returns {Array} Array of top pools with APY and token details
 */
export function getTopYieldingStables(pools, count = 5) {
  if (!pools || pools.length === 0) {
    logger.warn('No pools available for yield comparison');
    return [];
  }

  // Sort by APY descending
  const sorted = [...pools].sort((a, b) => (b.apy || 0) - (a.apy || 0));
  const topPools = sorted.slice(0, count);

  logger.info(`Top ${topPools.length} yielding stablecoins:`);
  topPools.forEach((pool, i) => {
    logger.info(`  ${i + 1}. ${pool.symbol} at ${pool.apy?.toFixed(2)}% APY (${pool.project})`);
  });

  return topPools.map(pool => ({
    pool: pool.pool,
    symbol: pool.symbol,
    project: pool.project,
    apy: pool.apy || 0,
    tvlUsd: pool.tvlUsd,
    underlyingTokens: pool.underlyingTokens || [],
    tokenAddress: getTokenAddress(pool.project, pool.symbol),
  }));
}

/**
 * Get yield data for a specific token/pool
 * @param {Array} pools - All pools
 * @param {string} symbol - Token symbol to find
 * @returns {Object|null} Pool data or null if not found
 */
export function getPoolBySymbol(pools, symbol) {
  return pools.find(pool =>
    pool.symbol?.toLowerCase() === symbol.toLowerCase() &&
    pool.chain === config.chain
  ) || null;
}

/**
 * Main function to get Base stablecoin yield data
 * @returns {Promise<Object>} Yield data including all pools and best option
 */
export async function getBaseYieldData() {
  const allPools = await fetchYieldPools();
  const baseStablecoins = filterBaseStablecoins(allPools);
  const topYielding = getTopYieldingStable(baseStablecoins);

  return {
    pools: baseStablecoins,
    topYielding,
    fetchedAt: new Date().toISOString(),
  };
}

export default {
  fetchYieldPools,
  filterBaseStablecoins,
  getTopYieldingStable,
  getTopYieldingStables,
  getPoolBySymbol,
  getBaseYieldData,
  getTokenAddress,
  tokenAddressMap,
  underlyingTokens,
};
