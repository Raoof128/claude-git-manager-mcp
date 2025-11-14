import { ConfirmationManager } from '../confirmation-manager.js';
import { writeFileSync, rmSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

describe('ConfirmationManager', () => {
  let confirmationManager: ConfirmationManager;
  const tokenDir = join(homedir(), '.git-manager-mcp');
  const tokenFile = join(tokenDir, 'confirmation-tokens.json');

  beforeEach(() => {
    // Clean up any existing token file
    if (existsSync(tokenFile)) {
      rmSync(tokenFile);
    }
    confirmationManager = new ConfirmationManager();
  });

  afterEach(() => {
    // Cleanup after tests
    if (existsSync(tokenFile)) {
      rmSync(tokenFile);
    }
  });

  describe('generateToken', () => {
    it('should generate a unique token', () => {
      const token1 = confirmationManager.generateToken('test_operation', { arg: 'value1' });
      const token2 = confirmationManager.generateToken('test_operation', { arg: 'value2' });

      expect(token1).toBeDefined();
      expect(token2).toBeDefined();
      expect(token1).not.toBe(token2);
      expect(token1).toMatch(/^confirm-test_operation-\d+-\w+$/);
    });

    it('should persist token to file', () => {
      const token = confirmationManager.generateToken('test_operation', { arg: 'value' });

      expect(existsSync(tokenFile)).toBe(true);
      const tokenData = JSON.parse(require('fs').readFileSync(tokenFile, 'utf-8'));
      expect(tokenData[token]).toBeDefined();
      expect(tokenData[token].operation).toBe('test_operation');
    });
  });

  describe('validateToken', () => {
    it('should validate a valid token', () => {
      const args = { repo_path: '/test/path', command: 'test' };
      const token = confirmationManager.generateToken('test_operation', args);

      const isValid = confirmationManager.validateToken(token, 'test_operation', args);
      expect(isValid).toBe(true);
    });

    it('should reject an invalid token', () => {
      const isValid = confirmationManager.validateToken('invalid-token', 'test_operation', {});
      expect(isValid).toBe(false);
    });

    it('should reject token with wrong operation', () => {
      const args = { repo_path: '/test/path' };
      const token = confirmationManager.generateToken('operation1', args);

      const isValid = confirmationManager.validateToken(token, 'operation2', args);
      expect(isValid).toBe(false);
    });

    it('should reject token with different arguments', () => {
      const args1 = { repo_path: '/test/path1', command: 'test' };
      const args2 = { repo_path: '/test/path2', command: 'test' };
      const token = confirmationManager.generateToken('test_operation', args1);

      const isValid = confirmationManager.validateToken(token, 'test_operation', args2);
      expect(isValid).toBe(false);
    });

    it('should delete token after successful validation (single-use)', () => {
      const args = { repo_path: '/test/path' };
      const token = confirmationManager.generateToken('test_operation', args);

      // First validation should succeed
      expect(confirmationManager.validateToken(token, 'test_operation', args)).toBe(true);

      // Second validation should fail (token deleted)
      expect(confirmationManager.validateToken(token, 'test_operation', args)).toBe(false);
    });

    it('should reject expired tokens', (done) => {
      // Create a manager with very short expiry for testing
      const args = { repo_path: '/test/path' };
      const token = confirmationManager.generateToken('test_operation', args);

      // Manually modify the token to be expired
      if (existsSync(tokenFile)) {
        const tokenData = JSON.parse(require('fs').readFileSync(tokenFile, 'utf-8'));
        tokenData[token].expires = Date.now() - 1000; // Expired 1 second ago
        writeFileSync(tokenFile, JSON.stringify(tokenData));
      }

      const isValid = confirmationManager.validateToken(token, 'test_operation', args);
      expect(isValid).toBe(false);
      done();
    });
  });

  describe('cleanup', () => {
    it('should remove expired tokens', () => {
      const token1 = confirmationManager.generateToken('operation1', { arg: 'value1' });
      const token2 = confirmationManager.generateToken('operation2', { arg: 'value2' });

      // Manually expire token1
      if (existsSync(tokenFile)) {
        const tokenData = JSON.parse(require('fs').readFileSync(tokenFile, 'utf-8'));
        tokenData[token1].expires = Date.now() - 1000;
        writeFileSync(tokenFile, JSON.stringify(tokenData));
      }

      confirmationManager.cleanup();

      const tokenData = JSON.parse(require('fs').readFileSync(tokenFile, 'utf-8'));
      expect(tokenData[token1]).toBeUndefined();
      expect(tokenData[token2]).toBeDefined();
    });
  });

  describe('getStats', () => {
    it('should return correct stats', () => {
      confirmationManager.generateToken('operation1', { arg: 'value1' });
      confirmationManager.generateToken('operation2', { arg: 'value2' });

      const stats = confirmationManager.getStats();
      expect(stats.active).toBe(2);
      expect(stats.expired).toBe(0);
    });
  });
});
