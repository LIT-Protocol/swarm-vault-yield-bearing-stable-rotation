import { logger } from '../utils/logger.js';
import { config } from '../config.js';

/**
 * Get balances for all swarm vault members
 * This interfaces with the swarm vault manager skill
 * @returns {Promise<Array>} Array of user objects with their holdings
 */
export async function getSwarmMemberBalances() {
  logger.info('Fetching swarm member balances...');

  // TODO: Implement actual integration with swarm vault manager skill
  // For now, return placeholder structure

  // Expected return format:
  // [
  //   {
  //     address: '0x...',
  //     holdings: [
  //       { symbol: 'aBasUSDC', balance: 1000, balanceUsd: 1000 },
  //       { symbol: 'USDC', balance: 500, balanceUsd: 500 },
  //     ]
  //   }
  // ]

  logger.warn('getSwarmMemberBalances() not yet implemented - returning empty array');
  return [];
}

/**
 * Match user holdings to DeFiLlama yield data to get current APYs
 * @param {Array} userHoldings - User's token holdings
 * @param {Array} yieldPools - DeFiLlama pool data
 * @returns {Array} Holdings enriched with APY data
 */
export function getCurrentHoldingApy(userHoldings, yieldPools) {
  return userHoldings.map(holding => {
    // Find matching pool in DeFiLlama data
    const matchingPool = yieldPools.find(pool =>
      pool.symbol?.toLowerCase() === holding.symbol?.toLowerCase()
    );

    return {
      ...holding,
      currentApy: matchingPool?.apy || 0,
      pool: matchingPool || null,
      hasYieldData: !!matchingPool,
    };
  });
}

/**
 * Filter holdings to only yield-bearing stablecoins
 * @param {Array} holdings - All user holdings
 * @param {Array} yieldPools - Available yield pools
 * @returns {Array} Only holdings that match yield pools
 */
export function filterYieldBearingHoldings(holdings, yieldPools) {
  const poolSymbols = new Set(yieldPools.map(p => p.symbol?.toLowerCase()));

  return holdings.filter(holding =>
    poolSymbols.has(holding.symbol?.toLowerCase()) &&
    holding.balanceUsd >= config.minBalanceUsd
  );
}

/**
 * Process all swarm members and enrich with yield data
 * @param {Array} yieldPools - DeFiLlama pool data for Base stablecoins
 * @returns {Promise<Array>} Users with enriched holding data
 */
export async function getEnrichedMemberData(yieldPools) {
  const members = await getSwarmMemberBalances();

  return members.map(member => {
    const enrichedHoldings = getCurrentHoldingApy(member.holdings || [], yieldPools);
    const yieldBearingHoldings = filterYieldBearingHoldings(enrichedHoldings, yieldPools);

    return {
      ...member,
      holdings: enrichedHoldings,
      yieldBearingHoldings,
      totalYieldBearingUsd: yieldBearingHoldings.reduce((sum, h) => sum + (h.balanceUsd || 0), 0),
    };
  });
}

export default {
  getSwarmMemberBalances,
  getCurrentHoldingApy,
  filterYieldBearingHoldings,
  getEnrichedMemberData,
};
