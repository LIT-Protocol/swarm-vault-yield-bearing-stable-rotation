import { config } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * Determine if a rotation should occur based on APY improvement
 * @param {number} currentApy - Current token APY
 * @param {number} bestApy - Best available APY
 * @returns {boolean} True if rotation is recommended
 */
export function shouldRotate(currentApy, bestApy) {
  const improvement = bestApy - currentApy;
  const shouldSwap = improvement >= config.minApyImprovement;

  logger.debug(`APY comparison: current=${currentApy?.toFixed(2)}%, best=${bestApy?.toFixed(2)}%, improvement=${improvement?.toFixed(2)}%, threshold=${config.minApyImprovement}%`);

  return shouldSwap;
}

/**
 * Calculate recommended rotations for all users
 * @param {Array} users - Users with enriched holding data
 * @param {Object} bestPool - Best yielding pool from DeFiLlama
 * @returns {Array} Array of recommended rotation actions
 */
export function calculateRotations(users, bestPool) {
  if (!bestPool) {
    logger.warn('No best pool available for rotation calculation');
    return [];
  }

  const rotations = [];

  for (const user of users) {
    for (const holding of user.yieldBearingHoldings || []) {
      // Skip if user is already in the best yielding pool (same project + similar APY)
      // Don't skip just because symbols match - plain USDC != yield-bearing USDC
      const isInBestPool = holding.matchedProject === bestPool.project &&
                           Math.abs((holding.currentApy || 0) - bestPool.apy) < 0.1;

      if (isInBestPool) {
        logger.debug(`User ${user.address} already in best pool ${bestPool.project} at ${holding.currentApy?.toFixed(2)}% APY`);
        continue;
      }

      // Check if rotation is beneficial
      if (shouldRotate(holding.currentApy, bestPool.apy)) {
        const rotation = {
          userAddress: user.address,
          membershipId: user.membershipId, // Include membership ID for targeted swap
          fromToken: {
            symbol: holding.symbol,
            address: holding.address,
            balance: holding.balance,
            balanceUsd: holding.balanceUsd,
            currentApy: holding.currentApy,
          },
          toToken: {
            symbol: bestPool.symbol,
            address: bestPool.tokenAddress,
            project: bestPool.project,
            targetApy: bestPool.apy,
          },
          apyImprovement: bestPool.apy - holding.currentApy,
          estimatedAnnualGainUsd: (holding.balanceUsd * (bestPool.apy - holding.currentApy)) / 100,
        };

        rotations.push(rotation);
        logger.info(`Rotation recommended for ${user.address}: ${holding.symbol} -> ${bestPool.symbol} (+${rotation.apyImprovement.toFixed(2)}% APY)`);
      } else {
        logger.debug(`No rotation needed for ${user.address} holding ${holding.symbol} (improvement below threshold)`);
      }
    }
  }

  logger.info(`Total rotations recommended: ${rotations.length}`);
  return rotations;
}

/**
 * Prioritize rotations by potential gain
 * @param {Array} rotations - All recommended rotations
 * @returns {Array} Rotations sorted by estimated annual gain (descending)
 */
export function prioritizeRotations(rotations) {
  return [...rotations].sort((a, b) => b.estimatedAnnualGainUsd - a.estimatedAnnualGainUsd);
}

/**
 * Generate rotation summary statistics
 * @param {Array} rotations - Recommended rotations
 * @returns {Object} Summary statistics
 */
export function getRotationSummary(rotations) {
  return {
    totalRotations: rotations.length,
    uniqueUsers: new Set(rotations.map(r => r.userAddress)).size,
    totalValueToRotate: rotations.reduce((sum, r) => sum + r.fromToken.balanceUsd, 0),
    totalEstimatedAnnualGain: rotations.reduce((sum, r) => sum + r.estimatedAnnualGainUsd, 0),
    averageApyImprovement: rotations.length > 0
      ? rotations.reduce((sum, r) => sum + r.apyImprovement, 0) / rotations.length
      : 0,
  };
}

export default {
  shouldRotate,
  calculateRotations,
  prioritizeRotations,
  getRotationSummary,
};
