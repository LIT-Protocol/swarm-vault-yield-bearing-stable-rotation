import { SwarmVaultClient } from '@swarmvault/sdk';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import { tokenAddressMap, underlyingTokens } from './defillama.js';

// Lazy-initialized client instance
let clientInstance = null;

/**
 * Get or create SwarmVault client instance
 * @returns {SwarmVaultClient}
 */
function getClient() {
  if (!clientInstance) {
    if (!config.swarmVault.apiKey) {
      throw new Error('SWARM_VAULT_API_KEY environment variable is required');
    }
    clientInstance = new SwarmVaultClient({
      apiKey: config.swarmVault.apiKey,
      baseUrl: config.swarmVault.apiUrl,
    });
  }
  return clientInstance;
}

/**
 * Format balance from raw units to human-readable
 * @param {string} balance - Raw balance in smallest units
 * @param {number} decimals - Token decimals
 * @returns {number} Human-readable balance
 */
function formatBalance(balance, decimals) {
  const bigValue = BigInt(balance);
  const divisor = BigInt(10 ** decimals);
  const intPart = bigValue / divisor;
  const fracPart = bigValue % divisor;
  const formatted = parseFloat(`${intPart}.${fracPart.toString().padStart(decimals, '0')}`);
  return formatted;
}

/**
 * Get balances for all swarm vault members
 * Interfaces with the swarm vault manager SDK
 * @param {string} swarmId - Optional swarm ID (uses config if not provided)
 * @returns {Promise<Array>} Array of user objects with their holdings
 */
export async function getSwarmMemberBalances(swarmId = null) {
  const targetSwarmId = swarmId || config.swarmVault.swarmId;

  if (!targetSwarmId) {
    logger.error('No swarm ID provided. Set SWARM_ID in environment or pass swarmId parameter.');
    throw new Error('Swarm ID is required');
  }

  logger.info(`Fetching swarm member balances for swarm: ${targetSwarmId}`);

  try {
    const client = getClient();
    const holdings = await client.getSwarmHoldings(targetSwarmId, { includeMembers: true });

    if (!holdings.members || holdings.members.length === 0) {
      logger.info('No members found in swarm');
      return [];
    }

    logger.info(`Found ${holdings.members.length} swarm members`);

    // Transform SDK response to our expected format
    const members = holdings.members.map(member => ({
      address: member.agentWalletAddress,
      membershipId: member.membershipId,
      userWalletAddress: member.userWalletAddress,
      holdings: [
        // Include ETH balance if non-zero
        ...(BigInt(member.ethBalance) > 0n ? [{
          symbol: 'ETH',
          address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          balance: formatBalance(member.ethBalance, 18),
          balanceRaw: member.ethBalance,
          balanceUsd: 0, // Would need price feed for accurate USD value
          decimals: 18,
        }] : []),
        // Include all token balances
        ...member.tokens.map(token => ({
          symbol: token.symbol,
          address: token.address,
          balance: formatBalance(token.balance, token.decimals),
          balanceRaw: token.balance,
          balanceUsd: 0, // Would need price feed for accurate USD value
          decimals: token.decimals,
        })),
      ],
    }));

    // Log summary
    const totalTokens = members.reduce((sum, m) => sum + m.holdings.length, 0);
    logger.info(`Total token positions across all members: ${totalTokens}`);

    return members;
  } catch (error) {
    logger.error('Failed to fetch swarm member balances', { error: error.message });
    throw error;
  }
}

/**
 * Build a lookup map for matching holdings to yield pools
 * Maps both addresses and symbols to pool data
 * @param {Array} yieldPools - DeFiLlama pool data
 * @returns {Object} Lookup maps for matching
 */
function buildPoolLookup(yieldPools) {
  const bySymbol = new Map();
  const byAddress = new Map();
  const byProject = new Map();

  for (const pool of yieldPools) {
    const symbol = pool.symbol?.toLowerCase();
    const project = pool.project?.toLowerCase();

    // Index by symbol
    if (symbol) {
      if (!bySymbol.has(symbol)) {
        bySymbol.set(symbol, []);
      }
      bySymbol.get(symbol).push(pool);
    }

    // Index by project+symbol combination
    if (project && symbol) {
      const key = `${project}:${symbol}`;
      if (!byProject.has(key)) {
        byProject.set(key, pool);
      }
    }

    // Index by token address if we have a mapping
    const tokenAddress = getTokenAddressForPool(pool);
    if (tokenAddress) {
      byAddress.set(tokenAddress.toLowerCase(), pool);
    }
  }

  return { bySymbol, byAddress, byProject };
}

/**
 * Get token address for a pool from our mapping
 * @param {Object} pool - DeFiLlama pool
 * @returns {string|null} Token address or null
 */
function getTokenAddressForPool(pool) {
  const projectMap = tokenAddressMap[pool.project];
  if (!projectMap) return null;

  const symbolKey = Object.keys(projectMap).find(
    key => pool.symbol?.toUpperCase().includes(key.toUpperCase())
  );

  return symbolKey ? projectMap[symbolKey] : null;
}

/**
 * Match a user holding to the best yield pool
 * Priority: exact address match > project+symbol match > symbol match
 * @param {Object} holding - User's token holding
 * @param {Object} lookup - Pool lookup maps
 * @returns {Object|null} Matching pool or null
 */
function matchHoldingToPool(holding, lookup) {
  // 1. Try exact address match (most accurate)
  if (holding.address) {
    const addressMatch = lookup.byAddress.get(holding.address.toLowerCase());
    if (addressMatch) {
      return addressMatch;
    }
  }

  // 2. Try to find by symbol, preferring higher APY if multiple matches
  const symbol = holding.symbol?.toLowerCase();
  if (symbol) {
    const symbolMatches = lookup.bySymbol.get(symbol);
    if (symbolMatches && symbolMatches.length > 0) {
      // Return the pool with highest APY if multiple matches
      return symbolMatches.reduce((best, pool) =>
        (pool.apy || 0) > (best.apy || 0) ? pool : best
      );
    }
  }

  return null;
}

/**
 * Match user holdings to DeFiLlama yield data to get current APYs
 * @param {Array} userHoldings - User's token holdings
 * @param {Array} yieldPools - DeFiLlama pool data
 * @returns {Array} Holdings enriched with APY data
 */
export function getCurrentHoldingApy(userHoldings, yieldPools) {
  if (!userHoldings || userHoldings.length === 0) {
    return [];
  }

  const lookup = buildPoolLookup(yieldPools);

  return userHoldings.map(holding => {
    const matchingPool = matchHoldingToPool(holding, lookup);

    if (matchingPool) {
      logger.debug(`Matched ${holding.symbol} to pool ${matchingPool.pool} (${matchingPool.project}) at ${matchingPool.apy?.toFixed(2)}% APY`);
    }

    return {
      ...holding,
      currentApy: matchingPool?.apy || 0,
      pool: matchingPool || null,
      hasYieldData: !!matchingPool,
      matchedProject: matchingPool?.project || null,
    };
  });
}

/**
 * Filter holdings to only yield-bearing stablecoins
 * @param {Array} holdings - All user holdings
 * @param {Array} yieldPools - Available yield pools
 * @returns {Array} Only holdings that match yield pools with sufficient balance
 */
export function filterYieldBearingHoldings(holdings, yieldPools) {
  const lookup = buildPoolLookup(yieldPools);

  return holdings.filter(holding => {
    // Must have a matching yield pool
    const hasYieldPool = matchHoldingToPool(holding, lookup) !== null;

    // Must meet minimum balance (use balanceUsd if available, otherwise assume meets threshold)
    const meetsMinBalance = holding.balanceUsd >= config.minBalanceUsd ||
                           (holding.balanceUsd === 0 && holding.balance > 0);

    if (!hasYieldPool) {
      logger.debug(`Excluding ${holding.symbol} - no matching yield pool`);
    } else if (!meetsMinBalance) {
      logger.debug(`Excluding ${holding.symbol} - balance $${holding.balanceUsd} below minimum $${config.minBalanceUsd}`);
    }

    return hasYieldPool && meetsMinBalance;
  });
}

/**
 * Check if a token is a yield-bearing stablecoin
 * @param {string} symbol - Token symbol
 * @param {string} address - Token address
 * @returns {boolean} True if token is yield-bearing
 */
export function isYieldBearingStable(symbol, address) {
  // Check if address matches any known yield-bearing token
  const normalizedAddress = address?.toLowerCase();

  for (const projectTokens of Object.values(tokenAddressMap)) {
    for (const tokenAddress of Object.values(projectTokens)) {
      if (tokenAddress.toLowerCase() === normalizedAddress) {
        return true;
      }
    }
  }

  // Check by symbol pattern (aUSDC, cUSDC, mUSDC, sUSDC, etc.)
  const yieldPrefixes = ['a', 'c', 'm', 's', 'aBas'];
  const stableSymbols = ['USDC', 'USDT', 'DAI', 'USDbC'];

  const normalizedSymbol = symbol?.toUpperCase() || '';
  for (const prefix of yieldPrefixes) {
    for (const stable of stableSymbols) {
      if (normalizedSymbol === `${prefix.toUpperCase()}${stable}` ||
          normalizedSymbol === `${prefix.toUpperCase()}BAS${stable}`) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Process all swarm members and enrich with yield data
 * @param {Array} yieldPools - DeFiLlama pool data for Base stablecoins
 * @param {string} swarmId - Optional swarm ID
 * @returns {Promise<Array>} Users with enriched holding data
 */
export async function getEnrichedMemberData(yieldPools, swarmId = null) {
  const members = await getSwarmMemberBalances(swarmId);

  if (members.length === 0) {
    logger.info('No members to process');
    return [];
  }

  const enrichedMembers = members.map(member => {
    // Enrich all holdings with APY data
    const enrichedHoldings = getCurrentHoldingApy(member.holdings || [], yieldPools);

    // Filter to only yield-bearing holdings
    const yieldBearingHoldings = filterYieldBearingHoldings(enrichedHoldings, yieldPools);

    const totalYieldBearingUsd = yieldBearingHoldings.reduce(
      (sum, h) => sum + (h.balanceUsd || 0),
      0
    );

    // Calculate weighted average current APY
    const weightedApySum = yieldBearingHoldings.reduce(
      (sum, h) => sum + (h.currentApy || 0) * (h.balanceUsd || h.balance || 0),
      0
    );
    const totalWeight = yieldBearingHoldings.reduce(
      (sum, h) => sum + (h.balanceUsd || h.balance || 0),
      0
    );
    const averageCurrentApy = totalWeight > 0 ? weightedApySum / totalWeight : 0;

    return {
      ...member,
      holdings: enrichedHoldings,
      yieldBearingHoldings,
      totalYieldBearingUsd,
      yieldBearingCount: yieldBearingHoldings.length,
      averageCurrentApy,
    };
  });

  // Log summary stats
  const totalYieldBearing = enrichedMembers.reduce((sum, m) => sum + m.yieldBearingCount, 0);
  const membersWithYield = enrichedMembers.filter(m => m.yieldBearingCount > 0).length;

  logger.info(`Processed ${enrichedMembers.length} members:`);
  logger.info(`  - ${membersWithYield} members have yield-bearing stablecoins`);
  logger.info(`  - ${totalYieldBearing} total yield-bearing positions`);

  return enrichedMembers;
}

/**
 * Get aggregate holdings summary for a swarm
 * @param {string} swarmId - Optional swarm ID
 * @returns {Promise<Object>} Aggregate holdings summary
 */
export async function getAggregateHoldings(swarmId = null) {
  const targetSwarmId = swarmId || config.swarmVault.swarmId;

  if (!targetSwarmId) {
    throw new Error('Swarm ID is required');
  }

  const client = getClient();
  const holdings = await client.getSwarmHoldings(targetSwarmId);

  return {
    memberCount: holdings.memberCount,
    ethBalance: formatBalance(holdings.ethBalance, 18),
    tokens: holdings.tokens.map(token => ({
      symbol: token.symbol,
      address: token.address,
      totalBalance: formatBalance(token.totalBalance, token.decimals),
      holderCount: token.holderCount,
      decimals: token.decimals,
    })),
  };
}

export default {
  getSwarmMemberBalances,
  getCurrentHoldingApy,
  filterYieldBearingHoldings,
  getEnrichedMemberData,
  getAggregateHoldings,
  isYieldBearingStable,
};
