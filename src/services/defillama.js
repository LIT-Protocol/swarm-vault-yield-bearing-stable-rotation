import axios from 'axios';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const POOLS_ENDPOINT = `${config.defillamaBaseUrl}/pools`;

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
 * @param {Array} pools - All pools from DeFiLlama
 * @param {number} minTvl - Minimum TVL in USD (default 100k)
 * @returns {Array} Filtered stablecoin pools on Base
 */
export function filterBaseStablecoins(pools, minTvl = 100000) {
  const filtered = pools.filter(pool =>
    pool.chain === config.chain &&
    pool.stablecoin === true &&
    (pool.tvlUsd || 0) >= minTvl
  );

  logger.info(`Found ${filtered.length} Base stablecoin pools with TVL >= $${minTvl.toLocaleString()}`);
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

  logger.info(`Top yielding stablecoin: ${best.symbol} at ${best.apy?.toFixed(2)}% APY (${best.project})`);

  return {
    pool: best.pool,
    symbol: best.symbol,
    project: best.project,
    apy: best.apy || 0,
    tvlUsd: best.tvlUsd,
    underlyingTokens: best.underlyingTokens || [],
  };
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
  getPoolBySymbol,
  getBaseYieldData,
};
