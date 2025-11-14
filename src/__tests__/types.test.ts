import {
  AnalyseRepositorySchema,
  SearchCodeSchema,
  CreateBranchSchema,
  ModifyFilesSchema,
  CommitChangesSchema,
  ConfigSchema,
  PermissionLevel
} from '../types.js';
import { ZodError } from 'zod';

describe('Type Validation', () => {
  describe('AnalyseRepositorySchema', () => {
    it('should validate correct parameters', () => {
      const valid = {
        repo_path: '/path/to/repo',
        include_stats: true,
        check_health: false
      };

      expect(() => AnalyseRepositorySchema.parse(valid)).not.toThrow();
    });

    it('should require repo_path', () => {
      const invalid = {
        include_stats: true
      };

      expect(() => AnalyseRepositorySchema.parse(invalid)).toThrow(ZodError);
    });

    it('should allow minimal parameters', () => {
      const minimal = {
        repo_path: '/path/to/repo'
      };

      const result = AnalyseRepositorySchema.parse(minimal);
      expect(result.repo_path).toBe('/path/to/repo');
    });
  });

  describe('SearchCodeSchema', () => {
    it('should validate search parameters', () => {
      const valid = {
        repo_path: '/path/to/repo',
        pattern: '*.ts',
        file_types: ['.ts', '.js'],
        include_git_history: true
      };

      expect(() => SearchCodeSchema.parse(valid)).not.toThrow();
    });

    it('should require repo_path and pattern', () => {
      const invalid = {
        file_types: ['.ts']
      };

      expect(() => SearchCodeSchema.parse(invalid)).toThrow(ZodError);
    });
  });

  describe('CreateBranchSchema', () => {
    it('should validate branch creation parameters', () => {
      const valid = {
        repo_path: '/path/to/repo',
        branch_name: 'feature/new-feature',
        from_branch: 'main',
        safety_check: true
      };

      expect(() => CreateBranchSchema.parse(valid)).not.toThrow();
    });

    it('should require repo_path and branch_name', () => {
      const invalid = {
        from_branch: 'main'
      };

      expect(() => CreateBranchSchema.parse(invalid)).toThrow(ZodError);
    });
  });

  describe('ModifyFilesSchema', () => {
    it('should validate file modification parameters', () => {
      const valid = {
        repo_path: '/path/to/repo',
        changes: [
          {
            file_path: 'src/test.ts',
            operation: 'update',
            content: 'new content'
          }
        ],
        preview: false
      };

      expect(() => ModifyFilesSchema.parse(valid)).not.toThrow();
    });

    it('should validate line changes', () => {
      const valid = {
        repo_path: '/path/to/repo',
        changes: [
          {
            file_path: 'src/test.ts',
            operation: 'update',
            line_changes: [
              {
                start_line: 1,
                end_line: 5,
                new_content: 'updated lines'
              }
            ]
          }
        ]
      };

      expect(() => ModifyFilesSchema.parse(valid)).not.toThrow();
    });

    it('should enforce valid operations', () => {
      const invalid = {
        repo_path: '/path/to/repo',
        changes: [
          {
            file_path: 'src/test.ts',
            operation: 'invalid_operation'
          }
        ]
      };

      expect(() => ModifyFilesSchema.parse(invalid)).toThrow(ZodError);
    });
  });

  describe('CommitChangesSchema', () => {
    it('should validate commit parameters', () => {
      const valid = {
        repo_path: '/path/to/repo',
        message: 'Add new feature',
        type: 'feat',
        scope: 'core',
        body: 'Detailed description',
        files: ['src/test.ts'],
        sign_commit: false
      };

      expect(() => CommitChangesSchema.parse(valid)).not.toThrow();
    });

    it('should enforce valid commit types', () => {
      const invalid = {
        repo_path: '/path/to/repo',
        message: 'Invalid commit',
        type: 'invalid_type'
      };

      expect(() => CommitChangesSchema.parse(invalid)).toThrow(ZodError);
    });

    it('should allow all conventional commit types', () => {
      const types = ['feat', 'fix', 'refactor', 'docs', 'test', 'chore'];

      types.forEach(type => {
        const params = {
          repo_path: '/path/to/repo',
          message: 'Test message',
          type
        };

        expect(() => CommitChangesSchema.parse(params)).not.toThrow();
      });
    });
  });

  describe('ConfigSchema', () => {
    it('should validate complete configuration', () => {
      const valid = {
        permissionLevel: PermissionLevel.FULL_ACCESS,
        safety: {
          require_confirmation: {
            destructive_operations: true,
            branch_changes: false,
            file_modifications: false,
            git_commands: ['reset --hard']
          },
          backup_strategy: {
            auto_stash: true,
            create_snapshots: true,
            max_rollback_depth: 10
          },
          validation: {
            check_tests_before_commit: false,
            lint_before_commit: false,
            require_clean_working_dir: false,
            protected_branches: ['main', 'master']
          }
        }
      };

      expect(() => ConfigSchema.parse(valid)).not.toThrow();
    });

    it('should enforce valid permission levels', () => {
      const valid = {
        permissionLevel: PermissionLevel.READ_ONLY,
        safety: {
          require_confirmation: {
            destructive_operations: true,
            branch_changes: false,
            file_modifications: false,
            git_commands: []
          },
          backup_strategy: {
            auto_stash: true,
            create_snapshots: true,
            max_rollback_depth: 10
          },
          validation: {
            check_tests_before_commit: false,
            lint_before_commit: false,
            require_clean_working_dir: false,
            protected_branches: []
          }
        }
      };

      expect(() => ConfigSchema.parse(valid)).not.toThrow();
    });
  });

  describe('PermissionLevel', () => {
    it('should define all permission levels', () => {
      expect(PermissionLevel.READ_ONLY).toBe('read');
      expect(PermissionLevel.SAFE_WRITE).toBe('safe');
      expect(PermissionLevel.FULL_ACCESS).toBe('full');
    });
  });
});
