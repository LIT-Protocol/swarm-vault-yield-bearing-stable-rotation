import { config } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * Execute a swap for a user via the swarm vault manager skill
 * @param {string} userAddress - User's wallet address
 * @param {Object} fromToken - Token to swap from
 * @param {Object} toToken - Token to swap to
 * @param {number} amount - Amount to swap
 * @returns {Promise<Object>} Swap result
 */
export async function executeSwap(userAddress, fromToken, toToken, amount) {
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

  // TODO: Implement actual swap execution via swarm vault manager skill
  // This will interface with the swarm-vault-manager-trading skill

  logger.warn('executeSwap() not yet implemented - returning mock success');
  return {
    success: false,
    error: 'Swap execution not yet implemented',
    userAddress,
    fromToken: fromToken.symbol,
    toToken: toToken.symbol,
    amount,
  };
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
        rotation.fromToken.balance
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
};
