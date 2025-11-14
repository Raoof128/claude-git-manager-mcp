import { RiskManager, RiskLevel } from '../risk-manager.js';

describe('RiskManager', () => {
  let riskManager: RiskManager;

  beforeEach(() => {
    riskManager = new RiskManager();
  });

  describe('getOperationRisk', () => {
    it('should return SAFE risk level for read operations', () => {
      const risk = riskManager.getOperationRisk('analyse_repository');
      expect(risk.level).toBe(RiskLevel.SAFE);
      expect(risk.reversible).toBe(true);
    });

    it('should return MEDIUM risk level for file modifications', () => {
      const risk = riskManager.getOperationRisk('modify_files');
      expect(risk.level).toBe(RiskLevel.MEDIUM);
      expect(risk.warnings).toBeDefined();
      expect(risk.warnings?.length).toBeGreaterThan(0);
    });

    it('should return HIGH risk level for merge operations', () => {
      const risk = riskManager.getOperationRisk('merge_branches');
      expect(risk.level).toBe(RiskLevel.HIGH);
      expect(risk.description).toContain('merge');
    });

    it('should return HIGH risk level for unknown operations', () => {
      const risk = riskManager.getOperationRisk('unknown_operation');
      expect(risk.level).toBe(RiskLevel.HIGH);
      expect(risk.description).toBe('unknown operation');
    });
  });

  describe('needsConfirmation', () => {
    it('should not require confirmation for safe operations', () => {
      const needs = riskManager.needsConfirmation('analyse_repository', {});
      expect(needs).toBe(false);
    });

    it('should not require confirmation for preview mode', () => {
      const needs = riskManager.needsConfirmation('modify_files', { preview: true });
      expect(needs).toBe(false);
    });

    it('should require confirmation for medium risk operations', () => {
      const needs = riskManager.needsConfirmation('modify_files', { preview: false });
      expect(needs).toBe(true);
    });

    it('should require confirmation for dangerous git commands', () => {
      const needs = riskManager.needsConfirmation('run_git_command', { command: 'reset --hard' });
      expect(needs).toBe(true);
    });

    it('should not require confirmation for safe git commands', () => {
      const needs = riskManager.needsConfirmation('run_git_command', { command: 'status' });
      expect(needs).toBe(false);
    });
  });

  describe('createConfirmationResponse', () => {
    it('should create a proper confirmation response', () => {
      const response = riskManager.createConfirmationResponse(
        'modify_files',
        { changes: [{ file_path: 'test.ts', operation: 'update' }] },
        'test-token-123'
      );

      expect(response.success).toBe(false);
      expect(response.requires_confirmation).toBe(true);
      expect(response.confirmation_token).toBe('test-token-123');
      expect(response.details).toBeDefined();
      expect(response.details.risk_level).toBe('MEDIUM');
      expect(response.details.affected_files).toContain('test.ts');
    });

    it('should include warnings in confirmation response', () => {
      const response = riskManager.createConfirmationResponse(
        'modify_files',
        {},
        'test-token'
      );

      expect(response.details.warnings).toBeDefined();
      expect(Array.isArray(response.details.warnings)).toBe(true);
    });
  });
});
