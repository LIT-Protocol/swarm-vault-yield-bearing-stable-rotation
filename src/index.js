import { config } from './config.js';
import { logger } from './utils/logger.js';
import { getBaseYieldData } from './services/defillama.js';
import { getEnrichedMemberData } from './services/balances.js';
import { calculateRotations, prioritizeRotations, getRotationSummary } from './services/rotator.js';
import { executeRotations, validateSwap } from './services/swapper.js';

/**
 * Main rotation function - orchestrates the yield rotation process
 */
async function runRotation() {
  logger.info('=== Starting Yield Rotation ===');
  logger.info(`Chain: ${config.chain} (${config.chainId})`);
  logger.info(`Mode: ${config.dryRun ? 'DRY RUN' : 'LIVE'}`);
  logger.info(`Min APY improvement threshold: ${config.minApyImprovement}%`);
  logger.info(`Min balance: $${config.minBalanceUsd}`);

  const stats = {
    usersChecked: 0,
    swapsExecuted: 0,
    swapsSkipped: 0,
    errors: 0,
  };

  try {
    // Step 1: Fetch yield data from DeFiLlama
    logger.info('Step 1: Fetching yield data from DeFiLlama...');
    const yieldData = await getBaseYieldData();

    if (!yieldData.topYielding) {
      logger.warn('No yield-bearing stablecoins found on Base. Exiting.');
      return stats;
    }

    logger.info(`Best yield available: ${yieldData.topYielding.symbol} at ${yieldData.topYielding.apy.toFixed(2)}% APY`);

    // Step 2: Get swarm member balances
    logger.info('Step 2: Fetching swarm member balances...');
    const members = await getEnrichedMemberData(yieldData.pools);
    stats.usersChecked = members.length;

    if (members.length === 0) {
      logger.info('No swarm members found. Exiting.');
      return stats;
    }

    logger.info(`Found ${members.length} swarm members to check`);

    // Step 3: Calculate needed rotations
    logger.info('Step 3: Calculating rotation opportunities...');
    const rotations = calculateRotations(members, yieldData.topYielding);
    const prioritizedRotations = prioritizeRotations(rotations);

    // Log rotation summary
    const summary = getRotationSummary(prioritizedRotations);
    logger.info(`Rotation opportunities found: ${summary.totalRotations}`);
    logger.info(`Total value to rotate: $${summary.totalValueToRotate.toFixed(2)}`);
    logger.info(`Estimated annual gain: $${summary.totalEstimatedAnnualGain.toFixed(2)}`);

    if (prioritizedRotations.length === 0) {
      logger.info('No rotations needed - all holdings are optimal or below threshold.');
      return stats;
    }

    // Step 4: Validate and execute swaps
    logger.info('Step 4: Executing rotations...');

    // Filter valid rotations
    const validRotations = prioritizedRotations.filter(rotation => {
      const validation = validateSwap(rotation);
      if (!validation.valid) {
        logger.warn(`Skipping invalid rotation for ${rotation.userAddress}`, { errors: validation.errors });
        stats.swapsSkipped++;
        return false;
      }
      return true;
    });

    // Execute rotations
    const results = await executeRotations(validRotations);

    stats.swapsExecuted = results.executed.length;
    stats.swapsSkipped += results.skipped.length;
    stats.errors = results.failed.length;

    // Step 5: Log results
    logger.info('Step 5: Rotation complete');
    logger.summary(stats);

    return stats;

  } catch (error) {
    logger.error('Rotation failed with error', { error: error.message, stack: error.stack });
    stats.errors++;
    throw error;
  }
}

// Run if executed directly
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  runRotation()
    .then(stats => {
      logger.info('Yield rotation completed successfully');
      process.exit(stats.errors > 0 ? 1 : 0);
    })
    .catch(error => {
      logger.error('Yield rotation failed', { error: error.message });
      process.exit(1);
    });
}

export { runRotation };
export default runRotation;
