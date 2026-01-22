import { SwarmVaultClient } from '@swarmvault/sdk';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

// Token address mapping for common tokens on Base
const TOKEN_ADDRESSES = {
  ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
  USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
};

// Cache for swap validation results to avoid repeated API calls
const swapValidationCache = new Map();

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
 * Get token address from symbol or return as-is if already an address
 * @param {string} symbolOrAddress - Token symbol or address
 * @param {string} explicitAddress - Optional explicit address to use
 * @returns {string} Token address
 */
function resolveTokenAddress(symbolOrAddress, explicitAddress = null) {
  // If explicit address is provided, use it
  if (explicitAddress && explicitAddress.startsWith('0x')) {
    return explicitAddress;
  }
  // If symbolOrAddress is already an address, return it
  if (symbolOrAddress && symbolOrAddress.startsWith('0x')) {
    return symbolOrAddress;
  }
  // Otherwise, look up by symbol
  const upperSymbol = symbolOrAddress?.toUpperCase();
  return TOKEN_ADDRESSES[upperSymbol] || symbolOrAddress;
}

/**
 * Check if a token can be swapped into via DEX
 * Uses swap preview to validate - if buyAmount > 0, the token is swappable
 * @param {string} tokenAddress - Token address to check
 * @param {string} tokenSymbol - Token symbol for logging
 * @returns {Promise<boolean>} True if token is swappable
 */
export async function isTokenSwappable(tokenAddress, tokenSymbol = 'unknown') {
  if (!tokenAddress) {
    logger.debug(`Token ${tokenSymbol} has no address - not swappable`);
    return false;
  }

  // Check cache first
  const cacheKey = tokenAddress.toLowerCase();
  if (swapValidationCache.has(cacheKey)) {
    const cached = swapValidationCache.get(cacheKey);
    logger.debug(`Token ${tokenSymbol} swappability (cached): ${cached}`);
    return cached;
  }

  try {
    const client = getClient();
    const swarmId = config.swarmVault.swarmId;

    if (!swarmId) {
      logger.warn('SWARM_ID not configured - cannot validate swappability');
      return false;
    }

    // Preview a swap from USDC to the target token
    const previewParams = {
      sellToken: TOKEN_ADDRESSES.USDC,
      buyToken: tokenAddress,
      sellPercentage: 10, // Small percentage to test
      slippagePercentage: 5, // Higher slippage for testing
    };

    logger.debug(`Testing swappability for ${tokenSymbol} (${tokenAddress})...`);
    const preview = await client.previewSwap(swarmId, previewParams);

    // Check if we got a valid buy amount
    const isSwappable = preview.totalBuyAmount &&
                        BigInt(preview.totalBuyAmount) > 0n &&
                        (!preview.errors || preview.errors.length === 0);

    // Cache the result
    swapValidationCache.set(cacheKey, isSwappable);

    if (isSwappable) {
      logger.debug(`✓ Token ${tokenSymbol} is DEX-swappable`);
    } else {
      logger.debug(`✗ Token ${tokenSymbol} is NOT DEX-swappable (buyAmount: ${preview.totalBuyAmount})`);
    }

    return isSwappable;

  } catch (error) {
    logger.debug(`Token ${tokenSymbol} swap preview failed: ${error.message}`);
    swapValidationCache.set(cacheKey, false);
    return false;
  }
}

/**
 * Filter pools to only include tokens that can be swapped into via DEX
 * @param {Array} pools - Array of pool objects with tokenAddress property
 * @returns {Promise<Array>} Filtered array of swappable pools
 */
export async function filterSwappablePools(pools) {
  if (!pools || pools.length === 0) {
    return [];
  }

  logger.info(`Validating ${pools.length} pools for DEX swappability...`);

  const swappablePools = [];

  for (const pool of pools) {
    if (!pool.tokenAddress) {
      logger.debug(`Pool ${pool.symbol} (${pool.project}) has no token address - skipping`);
      continue;
    }

    const isSwappable = await isTokenSwappable(pool.tokenAddress, `${pool.symbol} (${pool.project})`);

    if (isSwappable) {
      swappablePools.push(pool);
    }
  }

  logger.info(`Found ${swappablePools.length}/${pools.length} pools are DEX-swappable`);

  return swappablePools;
}

/**
 * Execute a swap for a user via the SwarmVault SDK
 * @param {string} userAddress - User's agent wallet address
 * @param {Object} fromToken - Token to swap from
 * @param {Object} toToken - Token to swap to
 * @param {number} amount - Amount to swap (unused - SDK uses percentage)
 * @param {string} membershipId - Member's membership ID for targeted swap
 * @returns {Promise<Object>} Swap result
 */
export async function executeSwap(userAddress, fromToken, toToken, amount, membershipId = null) {
  logger.info(`Executing swap for ${userAddress}: ${amount} ${fromToken.symbol} -> ${toToken.symbol}`);

  if (config.dryRun) {
    logger.info('[DRY RUN] Swap would be executed with:', {
      userAddress,
      fromToken: fromToken.symbol,
      toToken: toToken.symbol,
      amount,
      maxSlippage: config.maxSlippage,
    });

    return {
      success: true,
      dryRun: true,
      userAddress,
      fromToken: fromToken.symbol,
      toToken: toToken.symbol,
      amount,
    };
  }

  try {
    const client = getClient();
    const swarmId = config.swarmVault.swarmId;

    if (!swarmId) {
      throw new Error('SWARM_ID environment variable is required');
    }

    // Use explicit addresses if available, otherwise resolve from symbol
    const sellToken = resolveTokenAddress(fromToken.symbol, fromToken.address);
    const buyToken = resolveTokenAddress(toToken.symbol, toToken.address);

    logger.info(`Swap tokens: ${sellToken} -> ${buyToken}`);

    // Prepare swap parameters
    const swapParams = {
      sellToken,
      buyToken,
      sellPercentage: 100, // Swap 100% of the token
      slippagePercentage: config.maxSlippage,
    };

    // If we have a membership ID, target only that member
    if (membershipId) {
      swapParams.membershipIds = [membershipId];
    }

    // Preview the swap first
    logger.info('Previewing swap...', swapParams);
    const preview = await client.previewSwap(swarmId, swapParams);

    if (preview.errors && preview.errors.length > 0) {
      logger.error('Swap preview failed', { errors: preview.errors });
      return {
        success: false,
        error: `Swap preview failed: ${preview.errors.map(e => e.message).join(', ')}`,
        userAddress,
        fromToken: fromToken.symbol,
        toToken: toToken.symbol,
        amount,
      };
    }

    logger.info('Swap preview successful', {
      totalSellAmount: preview.totalSellAmount,
      totalBuyAmount: preview.totalBuyAmount,
      membersIncluded: preview.members?.length || 0,
    });

    // Execute the swap
    logger.info('Executing swap...');
    const result = await client.executeSwap(swarmId, swapParams);

    if (!result.transactionId) {
      throw new Error('No transaction ID returned from swap execution');
    }

    logger.info(`Swap submitted, transaction ID: ${result.transactionId}`);

    // Wait for the transaction to complete
    logger.info('Waiting for transaction confirmation...');
    const txResult = await client.waitForTransaction(result.transactionId);

    logger.info('Swap completed successfully', {
      transactionId: result.transactionId,
      status: txResult.status,
    });

    return {
      success: true,
      transactionId: result.transactionId,
      status: txResult.status,
      userAddress,
      fromToken: fromToken.symbol,
      toToken: toToken.symbol,
      amount,
      preview: {
        sellAmount: preview.totalSellAmount,
        buyAmount: preview.totalBuyAmount,
      },
    };

  } catch (error) {
    logger.error('Swap execution failed', { error: error.message, stack: error.stack });
    return {
      success: false,
      error: error.message,
      userAddress,
      fromToken: fromToken.symbol,
      toToken: toToken.symbol,
      amount,
    };
  }
}

/**
 * Execute all recommended rotations
 * @param {Array} rotations - Array of rotation objects
 * @returns {Promise<Object>} Execution results summary
 */
export async function executeRotations(rotations) {
  const results = {
    executed: [],
    failed: [],
    skipped: [],
  };

  for (const rotation of rotations) {
    try {
      const result = await executeSwap(
        rotation.userAddress,
        rotation.fromToken,
        rotation.toToken,
        rotation.fromToken.balance,
        rotation.membershipId // Pass membership ID for targeted swap
      );

      if (result.success) {
        results.executed.push({ rotation, result });
        logger.swapDecision(
          rotation.userAddress,
          rotation.fromToken.symbol,
          rotation.toToken.symbol,
          rotation.apyImprovement,
          true
        );

        // Log transaction details if available
        if (result.transactionId) {
          logger.info(`Transaction ID: ${result.transactionId}`);
        }
      } else {
        results.failed.push({ rotation, result });
        logger.error(`Swap failed for ${rotation.userAddress}`, { error: result.error });
      }
    } catch (error) {
      results.failed.push({ rotation, error: error.message });
      logger.error(`Swap error for ${rotation.userAddress}`, { error: error.message });
    }
  }

  return results;
}

/**
 * Validate swap parameters before execution
 * @param {Object} rotation - Rotation to validate
 * @returns {Object} Validation result
 */
export function validateSwap(rotation) {
  const errors = [];

  if (!rotation.userAddress) {
    errors.push('Missing user address');
  }

  if (!rotation.fromToken?.symbol) {
    errors.push('Missing source token');
  }

  if (!rotation.toToken?.symbol) {
    errors.push('Missing destination token');
  }

  if (!rotation.fromToken?.balance || rotation.fromToken.balance <= 0) {
    errors.push('Invalid swap amount');
  }

  if (rotation.fromToken?.balanceUsd < config.minBalanceUsd) {
    errors.push(`Balance below minimum ($${config.minBalanceUsd})`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  executeSwap,
  executeRotations,
  validateSwap,
  isTokenSwappable,
  filterSwappablePools,
};
