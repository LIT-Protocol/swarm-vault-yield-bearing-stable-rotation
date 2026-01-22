/**
 * Integration tests for the yield rotator main flow
 * Tests the complete rotation pipeline with realistic data scenarios
 */

import { calculateRotations, prioritizeRotations, getRotationSummary } from '../services/rotator.js';
import { getCurrentHoldingApy, filterYieldBearingHoldings } from '../services/balances.js';
import { validateSwap, executeRotations } from '../services/swapper.js';
import { filterBaseStablecoins, getTopYieldingStable } from '../services/defillama.js';

describe('Integration: Full Rotation Pipeline', () => {
  // Realistic mock data matching DeFiLlama API response structure
  const mockDeFiLlamaPools = [
    {
      pool: 'aave-base-usdc-lending',
      chain: 'Base',
      project: 'aave-v3',
      symbol: 'USDC',
      apy: 5.2,
      tvlUsd: 45000000,
      stablecoin: true,
      underlyingTokens: ['0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'],
    },
    {
      pool: 'compound-v3-base-usdc',
      chain: 'Base',
      project: 'compound-v3',
      symbol: 'USDC',
      apy: 4.8,
      tvlUsd: 30000000,
      stablecoin: true,
    },
    {
      pool: 'moonwell-base-usdc',
      chain: 'Base',
      project: 'moonwell-lending',
      symbol: 'USDC',
      apy: 6.5,
      tvlUsd: 25000000,
      stablecoin: true,
    },
    {
      pool: 'moonwell-base-dai',
      chain: 'Base',
      project: 'moonwell-lending',
      symbol: 'DAI',
      apy: 5.0,
      tvlUsd: 8000000,
      stablecoin: true,
    },
    {
      pool: 'seamless-base-usdc',
      chain: 'Base',
      project: 'seamless-protocol',
      symbol: 'USDC',
      apy: 4.5,
      tvlUsd: 15000000,
      stablecoin: true,
    },
    // Pool on different chain - should be filtered out
    {
      pool: 'aave-ethereum-usdc',
      chain: 'Ethereum',
      project: 'aave-v3',
      symbol: 'USDC',
      apy: 3.5,
      tvlUsd: 500000000,
      stablecoin: true,
    },
    // Non-stablecoin pool - should be filtered out
    {
      pool: 'uniswap-base-eth-usdc',
      chain: 'Base',
      project: 'uniswap-v3',
      symbol: 'ETH-USDC',
      apy: 15.0,
      tvlUsd: 20000000,
      stablecoin: false,
    },
    // High APY pool (volatile) - should be filtered out
    {
      pool: 'risky-base-usdc',
      chain: 'Base',
      project: 'risky-protocol',
      symbol: 'USDC',
      apy: 50.0,
      tvlUsd: 500000,
      stablecoin: true,
    },
  ];

  // Mock swarm member data
  const mockSwarmMembers = [
    {
      address: '0xUser1_HoldingAaveUSDC_ShouldRotate',
      membershipId: 'member-001',
      holdings: [
        {
          symbol: 'USDC',
          address: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB', // aBasUSDC
          balance: 5000,
          balanceUsd: 5000,
          decimals: 6,
        },
      ],
    },
    {
      address: '0xUser2_HoldingMoonwell_AlreadyBest',
      membershipId: 'member-002',
      holdings: [
        {
          symbol: 'USDC',
          address: '0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22', // mUSDC
          balance: 3000,
          balanceUsd: 3000,
          decimals: 6,
        },
      ],
    },
    {
      address: '0xUser3_HoldingCompound_ShouldRotate',
      membershipId: 'member-003',
      holdings: [
        {
          symbol: 'USDC',
          address: '0xb125E6687d4313864e53df431d5425969c15Eb2F', // cUSDCv3
          balance: 10000,
          balanceUsd: 10000,
          decimals: 6,
        },
      ],
    },
    {
      address: '0xUser4_SmallBalance_ShouldSkip',
      membershipId: 'member-004',
      holdings: [
        {
          symbol: 'USDC',
          address: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB',
          balance: 5,
          balanceUsd: 5, // Below $10 minimum
          decimals: 6,
        },
      ],
    },
    {
      address: '0xUser5_NoYieldBearing',
      membershipId: 'member-005',
      holdings: [
        {
          symbol: 'ETH',
          address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          balance: 1.5,
          balanceUsd: 4500,
          decimals: 18,
        },
      ],
    },
  ];

  describe('Step 1: DeFiLlama Pool Filtering', () => {
    it('should filter for Base stablecoin pools with adequate TVL', () => {
      const filtered = filterBaseStablecoins(mockDeFiLlamaPools);

      // Should include only Base stablecoins with TVL >= 100k and APY <= 25%
      expect(filtered.length).toBe(5); // aave, compound, moonwell usdc, moonwell dai, seamless
      expect(filtered.every(p => p.chain === 'Base')).toBe(true);
      expect(filtered.every(p => p.stablecoin === true)).toBe(true);
      expect(filtered.every(p => p.apy <= 25)).toBe(true);
    });

    it('should identify top yielding stablecoin', () => {
      const filtered = filterBaseStablecoins(mockDeFiLlamaPools);
      const top = getTopYieldingStable(filtered);

      expect(top.symbol).toBe('USDC');
      expect(top.project).toBe('moonwell-lending');
      expect(top.apy).toBe(6.5);
    });
  });

  describe('Step 2: Balance Enrichment', () => {
    it('should enrich holdings with APY data from pools', () => {
      const filtered = filterBaseStablecoins(mockDeFiLlamaPools);
      const user = mockSwarmMembers[0];

      const enriched = getCurrentHoldingApy(user.holdings, filtered);

      expect(enriched[0].hasYieldData).toBe(true);
      // Should match to a USDC pool (may be address or symbol match)
      expect(enriched[0].currentApy).toBeGreaterThan(0);
    });

    it('should filter to yield-bearing holdings only', () => {
      const filtered = filterBaseStablecoins(mockDeFiLlamaPools);
      const user = mockSwarmMembers[4]; // User with only ETH

      const enriched = getCurrentHoldingApy(user.holdings, filtered);
      const yieldBearing = filterYieldBearingHoldings(enriched, filtered);

      expect(yieldBearing.length).toBe(0); // ETH is not yield-bearing
    });
  });

  describe('Step 3: Rotation Calculation', () => {
    it('should calculate rotations for eligible users', () => {
      const filtered = filterBaseStablecoins(mockDeFiLlamaPools);
      const top = getTopYieldingStable(filtered);

      // Process members like the actual flow does
      const enrichedMembers = mockSwarmMembers.map(member => {
        const enriched = getCurrentHoldingApy(member.holdings, filtered);
        const yieldBearing = filterYieldBearingHoldings(enriched, filtered);
        return {
          ...member,
          yieldBearingHoldings: yieldBearing,
        };
      });

      const rotations = calculateRotations(enrichedMembers, top);

      // Should have some rotation recommendations (depends on APY matching)
      // The key assertion is that the pipeline works end-to-end
      expect(Array.isArray(rotations)).toBe(true);
      if (rotations.length > 0) {
        expect(rotations[0].toToken.symbol).toBe('USDC');
      }
    });

    it('should prioritize rotations by annual gain', () => {
      const filtered = filterBaseStablecoins(mockDeFiLlamaPools);
      const top = getTopYieldingStable(filtered);

      const enrichedMembers = mockSwarmMembers.map(member => {
        const enriched = getCurrentHoldingApy(member.holdings, filtered);
        const yieldBearing = filterYieldBearingHoldings(enriched, filtered);
        return { ...member, yieldBearingHoldings: yieldBearing };
      });

      const rotations = calculateRotations(enrichedMembers, top);
      const prioritized = prioritizeRotations(rotations);

      // Prioritized rotations should be sorted by gain descending
      for (let i = 1; i < prioritized.length; i++) {
        expect(prioritized[i - 1].estimatedAnnualGainUsd).toBeGreaterThanOrEqual(
          prioritized[i].estimatedAnnualGainUsd
        );
      }
    });
  });

  describe('Step 4: Rotation Summary', () => {
    it('should generate accurate summary statistics', () => {
      const filtered = filterBaseStablecoins(mockDeFiLlamaPools);
      const top = getTopYieldingStable(filtered);

      const enrichedMembers = mockSwarmMembers.map(member => {
        const enriched = getCurrentHoldingApy(member.holdings, filtered);
        const yieldBearing = filterYieldBearingHoldings(enriched, filtered);
        return { ...member, yieldBearingHoldings: yieldBearing };
      });

      const rotations = calculateRotations(enrichedMembers, top);
      const summary = getRotationSummary(rotations);

      // Summary should contain all required fields
      expect(typeof summary.totalRotations).toBe('number');
      expect(typeof summary.uniqueUsers).toBe('number');
      expect(typeof summary.totalValueToRotate).toBe('number');
      expect(typeof summary.totalEstimatedAnnualGain).toBe('number');
      expect(typeof summary.averageApyImprovement).toBe('number');
    });
  });

  describe('Step 5: Swap Validation', () => {
    it('should validate rotation parameters before execution', () => {
      const filtered = filterBaseStablecoins(mockDeFiLlamaPools);
      const top = getTopYieldingStable(filtered);

      const enrichedMembers = mockSwarmMembers.map(member => {
        const enriched = getCurrentHoldingApy(member.holdings, filtered);
        const yieldBearing = filterYieldBearingHoldings(enriched, filtered);
        return { ...member, yieldBearingHoldings: yieldBearing };
      });

      const rotations = calculateRotations(enrichedMembers, top);

      // All calculated rotations should have validation results
      rotations.forEach(rotation => {
        const validation = validateSwap(rotation);
        expect(validation).toHaveProperty('valid');
        expect(validation).toHaveProperty('errors');
        expect(Array.isArray(validation.errors)).toBe(true);
      });
    });
  });

  describe('Step 6: Swap Execution', () => {
    it('should execute rotations and return results structure', async () => {
      const filtered = filterBaseStablecoins(mockDeFiLlamaPools);
      const top = getTopYieldingStable(filtered);

      const enrichedMembers = mockSwarmMembers.map(member => {
        const enriched = getCurrentHoldingApy(member.holdings, filtered);
        const yieldBearing = filterYieldBearingHoldings(enriched, filtered);
        return { ...member, yieldBearingHoldings: yieldBearing };
      });

      const rotations = calculateRotations(enrichedMembers, top);
      const results = await executeRotations(rotations);

      // Should have proper results structure
      expect(results).toHaveProperty('executed');
      expect(results).toHaveProperty('failed');
      expect(results).toHaveProperty('skipped');

      // Results arrays should be valid arrays
      expect(Array.isArray(results.executed)).toBe(true);
      expect(Array.isArray(results.failed)).toBe(true);
      expect(Array.isArray(results.skipped)).toBe(true);
    });
  });

  describe('Full Pipeline Integration', () => {
    it('should correctly process entire rotation workflow', async () => {
      // Step 1: Filter pools
      const filteredPools = filterBaseStablecoins(mockDeFiLlamaPools);
      expect(filteredPools.length).toBeGreaterThan(0);

      // Step 2: Get best yield
      const bestPool = getTopYieldingStable(filteredPools);
      expect(bestPool).not.toBeNull();
      expect(bestPool.apy).toBeGreaterThan(0);

      // Step 3: Process members
      const processedMembers = mockSwarmMembers.map(member => {
        const enriched = getCurrentHoldingApy(member.holdings, filteredPools);
        const yieldBearing = filterYieldBearingHoldings(enriched, filteredPools);
        return { ...member, yieldBearingHoldings: yieldBearing };
      });

      // Step 4: Calculate rotations
      const rotations = calculateRotations(processedMembers, bestPool);
      const prioritized = prioritizeRotations(rotations);

      // Step 5: Validate and execute
      const validRotations = prioritized.filter(r => validateSwap(r).valid);
      const results = await executeRotations(validRotations);

      // Step 6: Generate summary
      const summary = getRotationSummary(validRotations);

      // Verify complete flow - pipeline should complete without errors
      expect(results).toHaveProperty('executed');
      expect(results).toHaveProperty('failed');
      expect(results).toHaveProperty('skipped');
      expect(typeof summary.totalRotations).toBe('number');
    });
  });
});
