import {
  filterBaseStablecoins,
  getTopYieldingStable,
  getTopYieldingStables,
  getPoolBySymbol,
  getTokenAddress,
  tokenAddressMap,
} from '../services/defillama.js';

// Mock pool data for testing
const mockPools = [
  {
    pool: 'pool-1',
    chain: 'Base',
    symbol: 'USDC',
    project: 'aave-v3',
    apy: 5.5,
    tvlUsd: 1000000,
    stablecoin: true,
  },
  {
    pool: 'pool-2',
    chain: 'Base',
    symbol: 'USDC',
    project: 'compound-v3',
    apy: 4.2,
    tvlUsd: 500000,
    stablecoin: true,
  },
  {
    pool: 'pool-3',
    chain: 'Base',
    symbol: 'USDC',
    project: 'moonwell-lending',
    apy: 6.1,
    tvlUsd: 750000,
    stablecoin: true,
  },
  {
    pool: 'pool-4',
    chain: 'Ethereum',
    symbol: 'USDC',
    project: 'aave-v3',
    apy: 7.0,
    tvlUsd: 2000000,
    stablecoin: true,
  },
  {
    pool: 'pool-5',
    chain: 'Base',
    symbol: 'ETH',
    project: 'aave-v3',
    apy: 3.5,
    tvlUsd: 800000,
    stablecoin: false,
  },
  {
    pool: 'pool-6',
    chain: 'Base',
    symbol: 'USDC-DAI-LP',
    project: 'volatile-protocol',
    apy: 500, // High APY LP pool that should be filtered out
    tvlUsd: 200000,
    stablecoin: true,
  },
  {
    pool: 'pool-7',
    chain: 'Base',
    symbol: 'USDC',
    project: 'small-protocol',
    apy: 8.0,
    tvlUsd: 50000, // Below min TVL
    stablecoin: true,
  },
];

describe('DeFiLlama Service', () => {
  describe('filterBaseStablecoins', () => {
    it('should filter pools to only Base chain stablecoins', () => {
      const filtered = filterBaseStablecoins(mockPools);

      // Should exclude Ethereum pools and non-stablecoins
      expect(filtered.every(p => p.chain === 'Base')).toBe(true);
      expect(filtered.every(p => p.stablecoin === true)).toBe(true);
    });

    it('should exclude pools below minimum TVL', () => {
      const filtered = filterBaseStablecoins(mockPools, 100000);

      // pool-7 has only 50k TVL, should be excluded
      expect(filtered.find(p => p.pool === 'pool-7')).toBeUndefined();
    });

    it('should exclude pools with APY above max threshold', () => {
      const filtered = filterBaseStablecoins(mockPools, 100000, 25);

      // pool-6 has 500% APY, should be excluded
      expect(filtered.find(p => p.pool === 'pool-6')).toBeUndefined();
    });

    it('should return empty array for empty input', () => {
      const filtered = filterBaseStablecoins([]);
      expect(filtered).toEqual([]);
    });

    it('should handle missing fields gracefully', () => {
      const poolsWithMissing = [
        { pool: 'test', chain: 'Base', stablecoin: true }, // missing tvlUsd
        { pool: 'test2', chain: 'Base', stablecoin: true, tvlUsd: null },
      ];
      const filtered = filterBaseStablecoins(poolsWithMissing, 100000);
      expect(filtered).toEqual([]);
    });
  });

  describe('getTopYieldingStable', () => {
    it('should return the highest APY pool', () => {
      const basePools = filterBaseStablecoins(mockPools);
      const top = getTopYieldingStable(basePools);

      expect(top).toBeDefined();
      expect(top.pool).toBe('pool-3'); // Moonwell at 6.1%
      expect(top.apy).toBe(6.1);
    });

    it('should return null for empty pools', () => {
      const top = getTopYieldingStable([]);
      expect(top).toBeNull();
    });

    it('should return null for undefined pools', () => {
      const top = getTopYieldingStable(undefined);
      expect(top).toBeNull();
    });

    it('should include token address when available', () => {
      const basePools = [
        {
          pool: 'pool-1',
          chain: 'Base',
          symbol: 'USDC',
          project: 'aave-v3',
          apy: 5.5,
          tvlUsd: 1000000,
          stablecoin: true,
        },
      ];
      const top = getTopYieldingStable(basePools);
      expect(top.tokenAddress).toBeDefined();
    });
  });

  describe('getTopYieldingStables', () => {
    it('should return top N pools sorted by APY', () => {
      const basePools = filterBaseStablecoins(mockPools);
      const top3 = getTopYieldingStables(basePools, 3);

      expect(top3).toHaveLength(3);
      expect(top3[0].apy).toBeGreaterThanOrEqual(top3[1].apy);
      expect(top3[1].apy).toBeGreaterThanOrEqual(top3[2].apy);
    });

    it('should return all pools if count exceeds available', () => {
      const basePools = filterBaseStablecoins(mockPools);
      const top10 = getTopYieldingStables(basePools, 10);

      expect(top10.length).toBeLessThanOrEqual(10);
    });

    it('should return empty array for empty input', () => {
      const result = getTopYieldingStables([]);
      expect(result).toEqual([]);
    });
  });

  describe('getPoolBySymbol', () => {
    it('should find pool by symbol', () => {
      const pool = getPoolBySymbol(mockPools, 'USDC');
      expect(pool).toBeDefined();
      expect(pool.symbol).toBe('USDC');
      expect(pool.chain).toBe('Base');
    });

    it('should be case insensitive', () => {
      const pool = getPoolBySymbol(mockPools, 'usdc');
      expect(pool).toBeDefined();
      expect(pool.symbol).toBe('USDC');
    });

    it('should return null for non-existent symbol', () => {
      const pool = getPoolBySymbol(mockPools, 'NONEXISTENT');
      expect(pool).toBeNull();
    });
  });

  describe('getTokenAddress', () => {
    it('should return token address for known project and symbol', () => {
      const address = getTokenAddress('aave-v3', 'USDC');
      expect(address).toBe('0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB');
    });

    it('should return null for unknown project', () => {
      const address = getTokenAddress('unknown-protocol', 'USDC');
      expect(address).toBeNull();
    });

    it('should return null for unknown symbol in known project', () => {
      const address = getTokenAddress('aave-v3', 'UNKNOWN');
      expect(address).toBeNull();
    });

    it('should match partial symbol names', () => {
      // e.g., "aBasUSDC" should match "USDC"
      const address = getTokenAddress('compound-v3', 'cUSDC');
      expect(address).toBeDefined();
    });
  });

  describe('tokenAddressMap', () => {
    it('should have mappings for DEX-swappable protocols', () => {
      // Only includes protocols with DEX-swappable yield tokens
      // Project names match DeFiLlama's naming convention
      expect(tokenAddressMap['aave-v3']).toBeDefined();
      expect(tokenAddressMap['moonwell-lending']).toBeDefined();
      expect(tokenAddressMap['seamless-v2']).toBeDefined();
    });

    it('should have valid Ethereum addresses', () => {
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;

      Object.values(tokenAddressMap).forEach(projectMap => {
        Object.values(projectMap).forEach(address => {
          expect(address).toMatch(addressRegex);
        });
      });
    });
  });
});
