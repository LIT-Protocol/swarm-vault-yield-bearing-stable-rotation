import {
  getCurrentHoldingApy,
  filterYieldBearingHoldings,
  isYieldBearingStable,
} from '../services/balances.js';

// Mock pool data for testing
const mockYieldPools = [
  {
    pool: 'aave-base-usdc',
    chain: 'Base',
    symbol: 'USDC',
    project: 'aave-v3',
    apy: 5.5,
    tvlUsd: 10000000,
    stablecoin: true,
  },
  {
    pool: 'compound-base-usdc',
    chain: 'Base',
    symbol: 'USDC',
    project: 'compound-v3',
    apy: 4.2,
    tvlUsd: 5000000,
    stablecoin: true,
  },
  {
    pool: 'moonwell-base-usdc',
    chain: 'Base',
    symbol: 'USDC',
    project: 'moonwell-lending',
    apy: 6.1,
    tvlUsd: 7500000,
    stablecoin: true,
  },
  {
    pool: 'moonwell-base-dai',
    chain: 'Base',
    symbol: 'DAI',
    project: 'moonwell-lending',
    apy: 4.8,
    tvlUsd: 3000000,
    stablecoin: true,
  },
];

// Mock user holdings
const mockHoldings = [
  {
    symbol: 'USDC',
    address: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB', // aBasUSDC address
    balance: 1000,
    balanceUsd: 1000,
    decimals: 6,
  },
  {
    symbol: 'DAI',
    address: '0x73b06D8d18De422E269645eaCe15400DE7462417', // mDAI address
    balance: 500,
    balanceUsd: 500,
    decimals: 18,
  },
  {
    symbol: 'ETH',
    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    balance: 0.5,
    balanceUsd: 1500,
    decimals: 18,
  },
];

describe('Balance Service', () => {
  describe('getCurrentHoldingApy', () => {
    it('should enrich holdings with APY data', () => {
      const enriched = getCurrentHoldingApy(mockHoldings, mockYieldPools);

      expect(enriched).toHaveLength(3);

      // USDC holding has aBasUSDC address, so should match to aave-v3 at 5.5% APY
      // (address match takes priority over symbol match)
      const usdcHolding = enriched.find(h => h.symbol === 'USDC');
      expect(usdcHolding.hasYieldData).toBe(true);
      expect(usdcHolding.currentApy).toBe(5.5); // Address match to Aave
    });

    it('should match DAI holdings to DAI pools', () => {
      const enriched = getCurrentHoldingApy(mockHoldings, mockYieldPools);
      const daiHolding = enriched.find(h => h.symbol === 'DAI');

      expect(daiHolding.hasYieldData).toBe(true);
      expect(daiHolding.currentApy).toBe(4.8);
      expect(daiHolding.matchedProject).toBe('moonwell-lending');
    });

    it('should mark non-matching holdings as no yield data', () => {
      const enriched = getCurrentHoldingApy(mockHoldings, mockYieldPools);
      const ethHolding = enriched.find(h => h.symbol === 'ETH');

      expect(ethHolding.hasYieldData).toBe(false);
      expect(ethHolding.currentApy).toBe(0);
    });

    it('should return empty array for empty holdings', () => {
      const result = getCurrentHoldingApy([], mockYieldPools);
      expect(result).toEqual([]);
    });

    it('should return empty array for null holdings', () => {
      const result = getCurrentHoldingApy(null, mockYieldPools);
      expect(result).toEqual([]);
    });

    it('should handle missing pool data gracefully', () => {
      const result = getCurrentHoldingApy(mockHoldings, []);
      expect(result).toHaveLength(3);
      result.forEach(h => {
        expect(h.hasYieldData).toBe(false);
        expect(h.currentApy).toBe(0);
      });
    });

    it('should preserve original holding properties', () => {
      const enriched = getCurrentHoldingApy(mockHoldings, mockYieldPools);
      const usdcHolding = enriched.find(h => h.symbol === 'USDC');

      expect(usdcHolding.balance).toBe(1000);
      expect(usdcHolding.balanceUsd).toBe(1000);
      expect(usdcHolding.address).toBe('0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB');
    });
  });

  describe('filterYieldBearingHoldings', () => {
    it('should filter out non-yield-bearing holdings', () => {
      const enriched = getCurrentHoldingApy(mockHoldings, mockYieldPools);
      const filtered = filterYieldBearingHoldings(enriched, mockYieldPools);

      // ETH should be filtered out
      expect(filtered.find(h => h.symbol === 'ETH')).toBeUndefined();
      // USDC and DAI should remain
      expect(filtered.find(h => h.symbol === 'USDC')).toBeDefined();
      expect(filtered.find(h => h.symbol === 'DAI')).toBeDefined();
    });

    it('should return empty array for empty input', () => {
      const result = filterYieldBearingHoldings([], mockYieldPools);
      expect(result).toEqual([]);
    });

    it('should filter holdings with balance but no matching pool', () => {
      const holdingsWithUnknown = [
        { symbol: 'UNKNOWN', balance: 1000, balanceUsd: 1000 },
      ];
      const result = filterYieldBearingHoldings(holdingsWithUnknown, mockYieldPools);
      expect(result).toEqual([]);
    });

    it('should include holdings with zero USD value but positive balance', () => {
      const holdingsWithZeroUsd = [
        {
          symbol: 'USDC',
          address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          balance: 100,
          balanceUsd: 0, // No USD value calculated
        },
      ];
      const result = filterYieldBearingHoldings(holdingsWithZeroUsd, mockYieldPools);
      expect(result).toHaveLength(1);
    });
  });

  describe('isYieldBearingStable', () => {
    it('should identify aUSDC as yield-bearing', () => {
      expect(isYieldBearingStable('aUSDC', null)).toBe(true);
    });

    it('should identify aBasUSDC as yield-bearing', () => {
      expect(isYieldBearingStable('aBasUSDC', null)).toBe(true);
    });

    it('should identify cUSDC as yield-bearing', () => {
      expect(isYieldBearingStable('cUSDC', null)).toBe(true);
    });

    it('should identify mUSDC as yield-bearing', () => {
      expect(isYieldBearingStable('mUSDC', null)).toBe(true);
    });

    it('should identify sUSDC as yield-bearing', () => {
      expect(isYieldBearingStable('sUSDC', null)).toBe(true);
    });

    it('should identify mDAI as yield-bearing', () => {
      expect(isYieldBearingStable('mDAI', null)).toBe(true);
    });

    it('should identify by address', () => {
      // aBasUSDC address
      expect(isYieldBearingStable('unknown', '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB')).toBe(true);
    });

    it('should return false for regular USDC', () => {
      expect(isYieldBearingStable('USDC', null)).toBe(false);
    });

    it('should return false for ETH', () => {
      expect(isYieldBearingStable('ETH', null)).toBe(false);
    });

    it('should return false for unknown tokens', () => {
      expect(isYieldBearingStable('UNKNOWN', null)).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isYieldBearingStable('ausdc', null)).toBe(true);
      expect(isYieldBearingStable('AUSDC', null)).toBe(true);
    });
  });

  describe('Pool matching priority', () => {
    it('should not match plain USDC to yield pools (plain stables earn 0%)', () => {
      // Plain USDC without yield-bearing prefix should NOT match to pools
      // This ensures we recommend rotation FROM plain USDC TO yield-bearing tokens
      const holdings = [{ symbol: 'USDC', balance: 100, balanceUsd: 100 }];
      const enriched = getCurrentHoldingApy(holdings, mockYieldPools);

      // Plain USDC is not in a yield pool - it earns 0%
      expect(enriched[0].currentApy).toBe(0);
      expect(enriched[0].hasYieldData).toBe(false);
    });

    it('should prefer address match over symbol match', () => {
      const holdingsWithAddress = [
        {
          symbol: 'USDC',
          address: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB', // aBasUSDC (Aave)
          balance: 100,
          balanceUsd: 100,
        },
      ];

      const enriched = getCurrentHoldingApy(holdingsWithAddress, mockYieldPools);
      // Should match to Aave at 5.5% (address match), not moonwell at 6.1% (symbol match)
      expect(enriched[0].hasYieldData).toBe(true);
      expect(enriched[0].currentApy).toBe(5.5);
      expect(enriched[0].matchedProject).toBe('aave-v3');
    });
  });

  describe('Edge cases', () => {
    it('should handle holdings with missing symbol', () => {
      const holdingsWithMissing = [
        { address: '0x123', balance: 100, balanceUsd: 100 },
      ];
      const enriched = getCurrentHoldingApy(holdingsWithMissing, mockYieldPools);
      expect(enriched[0].hasYieldData).toBe(false);
    });

    it('should handle pools with missing fields', () => {
      const poolsWithMissing = [
        { pool: 'test', chain: 'Base', stablecoin: true },
        { pool: 'test2' }, // minimal
      ];
      const enriched = getCurrentHoldingApy(mockHoldings, poolsWithMissing);
      // Should not throw, just mark as no yield data
      enriched.forEach(h => expect(h.hasYieldData).toBe(false));
    });

    it('should handle multiple holdings of same token', () => {
      const multipleHoldings = [
        { symbol: 'USDC', balance: 100, balanceUsd: 100 },
        { symbol: 'USDC', balance: 200, balanceUsd: 200 },
      ];
      const enriched = getCurrentHoldingApy(multipleHoldings, mockYieldPools);
      expect(enriched).toHaveLength(2);
      expect(enriched[0].currentApy).toBe(enriched[1].currentApy);
    });
  });
});
