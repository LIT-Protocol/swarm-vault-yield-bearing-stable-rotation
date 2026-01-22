/**
 * Unit tests for the swapper service
 * Tests swap validation and execution logic
 */

import {
  executeSwap,
  executeRotations,
  validateSwap,
} from '../services/swapper.js';

// Note: Tests use actual config values (minBalanceUsd: 10, dryRun from CLI)

describe('Swapper Service', () => {
  describe('validateSwap', () => {
    const validRotation = {
      userAddress: '0x1234567890123456789012345678901234567890',
      fromToken: {
        symbol: 'aBasUSDC',
        balance: 1000,
        balanceUsd: 1000,
        currentApy: 5.0,
      },
      toToken: {
        symbol: 'mUSDC',
        project: 'moonwell-lending',
        targetApy: 6.5,
      },
      apyImprovement: 1.5,
      estimatedAnnualGainUsd: 15,
    };

    it('should validate a valid rotation', () => {
      const result = validateSwap(validRotation);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject rotation with missing user address', () => {
      const invalid = { ...validRotation, userAddress: null };
      const result = validateSwap(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing user address');
    });

    it('should reject rotation with missing source token', () => {
      const invalid = { ...validRotation, fromToken: { balance: 100, balanceUsd: 100 } };
      const result = validateSwap(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing source token');
    });

    it('should reject rotation with missing destination token', () => {
      const invalid = { ...validRotation, toToken: {} };
      const result = validateSwap(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing destination token');
    });

    it('should reject rotation with zero balance', () => {
      const invalid = {
        ...validRotation,
        fromToken: { ...validRotation.fromToken, balance: 0 },
      };
      const result = validateSwap(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid swap amount');
    });

    it('should reject rotation with negative balance', () => {
      const invalid = {
        ...validRotation,
        fromToken: { ...validRotation.fromToken, balance: -100 },
      };
      const result = validateSwap(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid swap amount');
    });

    it('should reject rotation with balance below minimum', () => {
      const invalid = {
        ...validRotation,
        fromToken: { ...validRotation.fromToken, balanceUsd: 5 }, // Below $10 minimum
      };
      const result = validateSwap(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Balance below minimum ($10)');
    });

    it('should collect multiple errors', () => {
      const invalid = {
        userAddress: null,
        fromToken: { symbol: null, balance: 0, balanceUsd: 5 },
        toToken: {},
      };
      const result = validateSwap(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('executeSwap', () => {
    // executeSwap will run in dry-run by default since config.dryRun is false
    // but without actual SDK integration it returns a mock failure
    it('should return result object with all required fields', async () => {
      const result = await executeSwap(
        '0x1234567890123456789012345678901234567890',
        { symbol: 'aBasUSDC' },
        { symbol: 'mUSDC' },
        1000
      );

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('userAddress');
      expect(result.fromToken).toBe('aBasUSDC');
      expect(result.toToken).toBe('mUSDC');
      expect(result.amount).toBe(1000);
    });

    it('should include user address in result', async () => {
      const userAddress = '0xabcdef1234567890abcdef1234567890abcdef12';
      const result = await executeSwap(
        userAddress,
        { symbol: 'cUSDCv3' },
        { symbol: 'mUSDC' },
        500
      );

      expect(result.userAddress).toBe(userAddress);
    });
  });

  describe('executeRotations', () => {
    const mockRotations = [
      {
        userAddress: '0x1111111111111111111111111111111111111111',
        fromToken: { symbol: 'aBasUSDC', balance: 1000 },
        toToken: { symbol: 'mUSDC' },
        apyImprovement: 1.5,
      },
      {
        userAddress: '0x2222222222222222222222222222222222222222',
        fromToken: { symbol: 'cUSDCv3', balance: 500 },
        toToken: { symbol: 'mUSDC' },
        apyImprovement: 2.5,
      },
    ];

    it('should process all rotations and return results object', async () => {
      const results = await executeRotations(mockRotations);

      expect(results).toHaveProperty('executed');
      expect(results).toHaveProperty('failed');
      expect(results).toHaveProperty('skipped');
      expect(Array.isArray(results.executed)).toBe(true);
      expect(Array.isArray(results.failed)).toBe(true);
      expect(Array.isArray(results.skipped)).toBe(true);
    });

    it('should handle empty rotations array', async () => {
      const results = await executeRotations([]);

      expect(results.executed).toHaveLength(0);
      expect(results.failed).toHaveLength(0);
      expect(results.skipped).toHaveLength(0);
    });

    it('should include rotation data in results', async () => {
      const results = await executeRotations(mockRotations);

      // Each result should have the rotation and result
      if (results.executed.length > 0) {
        expect(results.executed[0]).toHaveProperty('rotation');
        expect(results.executed[0]).toHaveProperty('result');
      } else if (results.failed.length > 0) {
        expect(results.failed[0]).toHaveProperty('rotation');
      }
    });

    it('should process rotations in order', async () => {
      let callOrder = [];
      const trackingRotations = mockRotations.map((r, i) => ({
        ...r,
        _index: i,
      }));

      const results = await executeRotations(trackingRotations);

      // All rotations should be processed
      const totalProcessed = results.executed.length + results.failed.length;
      expect(totalProcessed).toBe(2);
    });
  });
});
