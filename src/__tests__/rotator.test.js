/**
 * Unit tests for the rotator service
 * Tests rotation decision logic and calculations
 */

import {
  shouldRotate,
  calculateRotations,
  prioritizeRotations,
  getRotationSummary,
} from '../services/rotator.js';

// Note: Tests use actual config values (minApyImprovement: 0.5, minBalanceUsd: 10)

describe('Rotator Service', () => {
  describe('shouldRotate', () => {
    it('should return true when improvement exceeds threshold', () => {
      expect(shouldRotate(4.0, 5.0)).toBe(true); // 1% improvement > 0.5%
    });

    it('should return true when improvement equals threshold', () => {
      expect(shouldRotate(4.0, 4.5)).toBe(true); // 0.5% improvement = 0.5%
    });

    it('should return false when improvement is below threshold', () => {
      expect(shouldRotate(4.0, 4.3)).toBe(false); // 0.3% improvement < 0.5%
    });

    it('should return false when best APY is lower than current', () => {
      expect(shouldRotate(5.0, 4.0)).toBe(false);
    });

    it('should return false when APYs are equal', () => {
      expect(shouldRotate(4.0, 4.0)).toBe(false);
    });

    it('should handle zero APYs', () => {
      expect(shouldRotate(0, 0.5)).toBe(true);
      expect(shouldRotate(0, 0.3)).toBe(false);
    });

    it('should handle high APY values', () => {
      expect(shouldRotate(20.0, 25.0)).toBe(true); // 5% improvement
    });
  });

  describe('calculateRotations', () => {
    const mockBestPool = {
      symbol: 'mUSDC',
      project: 'moonwell',
      apy: 6.5,
    };

    const mockUsers = [
      {
        address: '0x1234567890123456789012345678901234567890',
        yieldBearingHoldings: [
          {
            symbol: 'aBasUSDC',
            balance: 1000,
            balanceUsd: 1000,
            currentApy: 5.0,
          },
        ],
      },
      {
        address: '0x2345678901234567890123456789012345678901',
        yieldBearingHoldings: [
          {
            symbol: 'cUSDCv3',
            balance: 500,
            balanceUsd: 500,
            currentApy: 4.0,
          },
        ],
      },
    ];

    it('should recommend rotations when APY improvement exceeds threshold', () => {
      const rotations = calculateRotations(mockUsers, mockBestPool);

      expect(rotations).toHaveLength(2);
      expect(rotations[0]).toMatchObject({
        userAddress: '0x1234567890123456789012345678901234567890',
        fromToken: { symbol: 'aBasUSDC', currentApy: 5.0 },
        toToken: { symbol: 'mUSDC', targetApy: 6.5 },
        apyImprovement: 1.5,
      });
    });

    it('should calculate estimated annual gain correctly', () => {
      const rotations = calculateRotations(mockUsers, mockBestPool);

      // First user: $1000 * 1.5% = $15 annual gain
      expect(rotations[0].estimatedAnnualGainUsd).toBeCloseTo(15, 2);
      // Second user: $500 * 2.5% = $12.50 annual gain
      expect(rotations[1].estimatedAnnualGainUsd).toBeCloseTo(12.5, 2);
    });

    it('should skip users already holding best token', () => {
      const usersWithBest = [
        {
          address: '0x1234567890123456789012345678901234567890',
          yieldBearingHoldings: [
            {
              symbol: 'mUSDC', // Same as best pool
              balance: 1000,
              balanceUsd: 1000,
              currentApy: 6.5,
            },
          ],
        },
      ];

      const rotations = calculateRotations(usersWithBest, mockBestPool);
      expect(rotations).toHaveLength(0);
    });

    it('should skip when APY improvement is below threshold', () => {
      const usersWithGoodApy = [
        {
          address: '0x1234567890123456789012345678901234567890',
          yieldBearingHoldings: [
            {
              symbol: 'aBasUSDC',
              balance: 1000,
              balanceUsd: 1000,
              currentApy: 6.3, // Only 0.2% below best
            },
          ],
        },
      ];

      const rotations = calculateRotations(usersWithGoodApy, mockBestPool);
      expect(rotations).toHaveLength(0);
    });

    it('should handle users with multiple holdings', () => {
      const userWithMultiple = [
        {
          address: '0x1234567890123456789012345678901234567890',
          yieldBearingHoldings: [
            { symbol: 'aBasUSDC', balance: 500, balanceUsd: 500, currentApy: 5.0 },
            { symbol: 'cUSDCv3', balance: 300, balanceUsd: 300, currentApy: 4.0 },
          ],
        },
      ];

      const rotations = calculateRotations(userWithMultiple, mockBestPool);
      expect(rotations).toHaveLength(2);
    });

    it('should return empty array when no best pool available', () => {
      const rotations = calculateRotations(mockUsers, null);
      expect(rotations).toEqual([]);
    });

    it('should handle empty users array', () => {
      const rotations = calculateRotations([], mockBestPool);
      expect(rotations).toEqual([]);
    });

    it('should handle users with no holdings', () => {
      const usersNoHoldings = [
        { address: '0x123', yieldBearingHoldings: [] },
        { address: '0x456' }, // No yieldBearingHoldings property
      ];

      const rotations = calculateRotations(usersNoHoldings, mockBestPool);
      expect(rotations).toEqual([]);
    });
  });

  describe('prioritizeRotations', () => {
    const mockRotations = [
      { userAddress: '0x111', estimatedAnnualGainUsd: 10 },
      { userAddress: '0x222', estimatedAnnualGainUsd: 50 },
      { userAddress: '0x333', estimatedAnnualGainUsd: 25 },
    ];

    it('should sort rotations by estimated annual gain descending', () => {
      const prioritized = prioritizeRotations(mockRotations);

      expect(prioritized[0].userAddress).toBe('0x222'); // $50
      expect(prioritized[1].userAddress).toBe('0x333'); // $25
      expect(prioritized[2].userAddress).toBe('0x111'); // $10
    });

    it('should not modify original array', () => {
      const original = [...mockRotations];
      prioritizeRotations(mockRotations);

      expect(mockRotations).toEqual(original);
    });

    it('should handle empty array', () => {
      const prioritized = prioritizeRotations([]);
      expect(prioritized).toEqual([]);
    });

    it('should handle single rotation', () => {
      const single = [{ userAddress: '0x111', estimatedAnnualGainUsd: 10 }];
      const prioritized = prioritizeRotations(single);

      expect(prioritized).toEqual(single);
    });
  });

  describe('getRotationSummary', () => {
    const mockRotations = [
      {
        userAddress: '0x111',
        fromToken: { balanceUsd: 1000 },
        estimatedAnnualGainUsd: 15,
        apyImprovement: 1.5,
      },
      {
        userAddress: '0x222',
        fromToken: { balanceUsd: 500 },
        estimatedAnnualGainUsd: 12.5,
        apyImprovement: 2.5,
      },
      {
        userAddress: '0x111', // Same user, different holding
        fromToken: { balanceUsd: 200 },
        estimatedAnnualGainUsd: 4,
        apyImprovement: 2.0,
      },
    ];

    it('should calculate total rotations count', () => {
      const summary = getRotationSummary(mockRotations);
      expect(summary.totalRotations).toBe(3);
    });

    it('should calculate unique users count', () => {
      const summary = getRotationSummary(mockRotations);
      expect(summary.uniqueUsers).toBe(2); // 0x111 and 0x222
    });

    it('should calculate total value to rotate', () => {
      const summary = getRotationSummary(mockRotations);
      expect(summary.totalValueToRotate).toBeCloseTo(1700, 2); // 1000 + 500 + 200
    });

    it('should calculate total estimated annual gain', () => {
      const summary = getRotationSummary(mockRotations);
      expect(summary.totalEstimatedAnnualGain).toBeCloseTo(31.5, 2); // 15 + 12.5 + 4
    });

    it('should calculate average APY improvement', () => {
      const summary = getRotationSummary(mockRotations);
      expect(summary.averageApyImprovement).toBeCloseTo(2.0, 2); // (1.5 + 2.5 + 2.0) / 3
    });

    it('should handle empty rotations', () => {
      const summary = getRotationSummary([]);

      expect(summary.totalRotations).toBe(0);
      expect(summary.uniqueUsers).toBe(0);
      expect(summary.totalValueToRotate).toBe(0);
      expect(summary.totalEstimatedAnnualGain).toBe(0);
      expect(summary.averageApyImprovement).toBe(0);
    });
  });
});
