import { fetchYieldPools, filterBaseStablecoins, getMappedProtocolPools, getTopYieldingStables } from './services/defillama.js';
import { logger } from './utils/logger.js';

/**
 * Inspect current yield data from DeFiLlama
 */
async function inspectYields() {
  logger.info('=== Fetching Yield Data from DeFiLlama ===\n');

  // Fetch all pools
  const allPools = await fetchYieldPools();

  // Filter to Base stablecoins
  const baseStablecoins = filterBaseStablecoins(allPools);

  // Show top 20 yields across all protocols
  console.log('\n========================================');
  console.log('TOP 20 BASE STABLECOIN YIELDS (All Protocols)');
  console.log('========================================\n');

  const top20 = getTopYieldingStables(baseStablecoins, 20);
  console.log('Rank | APY      | Symbol              | Protocol            | TVL');
  console.log('-----|----------|---------------------|---------------------|------------');
  top20.forEach((pool, i) => {
    const rank = String(i + 1).padStart(2);
    const apy = pool.apy.toFixed(2).padStart(6) + '%';
    const symbol = pool.symbol.padEnd(19).slice(0, 19);
    const project = pool.project.padEnd(19).slice(0, 19);
    const tvl = '$' + (pool.tvlUsd / 1_000_000).toFixed(2) + 'M';
    console.log(`  ${rank} | ${apy} | ${symbol} | ${project} | ${tvl}`);
  });

  // Show DEX-swappable pools from mapped protocols
  console.log('\n========================================');
  console.log('DEX-SWAPPABLE YIELD POOLS (Mapped Protocols)');
  console.log('========================================\n');

  const mappedPools = getMappedProtocolPools(baseStablecoins);

  if (mappedPools.length === 0) {
    console.log('No pools found from mapped protocols.');
  } else {
    console.log('Rank | APY      | Symbol              | Protocol            | TVL          | Token Address');
    console.log('-----|----------|---------------------|---------------------|--------------|--------------------------------------------');
    mappedPools.forEach((pool, i) => {
      const rank = String(i + 1).padStart(2);
      const apy = pool.apy.toFixed(2).padStart(6) + '%';
      const symbol = pool.symbol.padEnd(19).slice(0, 19);
      const project = pool.project.padEnd(19).slice(0, 19);
      const tvl = '$' + (pool.tvlUsd / 1_000_000).toFixed(2) + 'M';
      const addr = pool.tokenAddress || 'N/A';
      console.log(`  ${rank} | ${apy} | ${symbol} | ${project} | ${tvl.padEnd(12)} | ${addr}`);
    });
  }

  // Show protocol breakdown
  console.log('\n========================================');
  console.log('YIELD BY PROTOCOL (Mapped DEX-Swappable Only)');
  console.log('========================================\n');

  const byProtocol = {};
  mappedPools.forEach(pool => {
    if (!byProtocol[pool.project]) {
      byProtocol[pool.project] = [];
    }
    byProtocol[pool.project].push(pool);
  });

  Object.entries(byProtocol).forEach(([protocol, pools]) => {
    console.log(`\n${protocol.toUpperCase()}:`);
    pools.forEach(pool => {
      console.log(`  - ${pool.symbol}: ${pool.apy.toFixed(2)}% APY (TVL: $${(pool.tvlUsd / 1_000_000).toFixed(2)}M)`);
    });
  });

  // Summary
  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================\n');
  console.log(`Total Base stablecoin pools: ${baseStablecoins.length}`);
  console.log(`DEX-swappable pools (mapped): ${mappedPools.length}`);
  if (mappedPools.length > 0) {
    console.log(`Best DEX-swappable yield: ${mappedPools[0].symbol} at ${mappedPools[0].apy.toFixed(2)}% APY (${mappedPools[0].project})`);
  }
  console.log(`\nData fetched at: ${new Date().toISOString()}`);
}

inspectYields().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
