export enum RiskLevel {
  SAFE = 0,        // Read-only operations
  LOW = 1,         // Create branches, stage files
  MEDIUM = 2,      // Commit, modify files
  HIGH = 3,        // Merge, rebase, force operations
  CRITICAL = 4     // Delete branches, force push, destructive commands
}

interface OperationRisk {
  level: RiskLevel;
  description: string;
  warnings?: string[];
  reversible: boolean;
}

export class RiskManager {
  private readonly OPERATION_RISKS: Record<string, OperationRisk> = {
    // Safe operations - no confirmation needed
    'analyse_repository': {
      level: RiskLevel.SAFE,
      description: 'analyze repository structure and statistics',
      reversible: true
    },
    'search_code': {
      level: RiskLevel.SAFE,
      description: 'search for patterns in code',
      reversible: true
    },
    'get_file_context': {
      level: RiskLevel.SAFE,
      description: 'read file content with git information',
      reversible: true
    },

    // Low risk operations
    'create_branch': {
      level: RiskLevel.LOW,
      description: 'create a new branch from existing branch',
      reversible: true
    },

    // Medium risk operations
    'modify_files': {
      level: RiskLevel.MEDIUM,
      description: 'modify file contents',
      warnings: ['Changes will overwrite existing content'],
      reversible: false
    },
    'commit_changes': {
      level: RiskLevel.MEDIUM,
      description: 'create a new commit with staged changes',
      reversible: true // Can be reverted
    },
    'refactor_code': {
      level: RiskLevel.MEDIUM,
      description: 'rename symbols across multiple files',
      warnings: ['May affect many files', 'Requires careful review'],
      reversible: false
    },

    // High risk operations
    'merge_branches': {
      level: RiskLevel.HIGH,
      description: 'merge branches (may cause conflicts)',
      warnings: ['May create merge conflicts', 'Changes multiple commit history'],
      reversible: true // Can be reset
    },
    'run_git_command': {
      level: RiskLevel.HIGH,
      description: 'execute raw git command',
      warnings: ['Direct git access', 'Potential for data loss'],
      reversible: false // Depends on command
    },

    // Critical operations (if added later)
    'create_pull_request': {
      level: RiskLevel.LOW,
      description: 'create a pull request',
      reversible: true
    }
  };

  private readonly SAFE_GIT_COMMANDS = [
    'status', 'log', 'diff', 'show', 'branch', 'ls-files',
    'rev-parse', 'symbolic-ref', 'config', 'remote', 'tag'
  ];

  private readonly DANGEROUS_GIT_COMMANDS = [
    'reset --hard', 'clean -fd', 'push --force', 'rebase -i',
    'filter-branch', 'reflog expire', 'gc --prune'
  ];

  needsConfirmation(operation: string, args: any): boolean {
    // Special handling for modify_files preview mode
    if (operation === 'modify_files' && args.preview === true) {
      return false; // Preview is always safe
    }

    // Special handling for git commands
    if (operation === 'run_git_command') {
      return this.isGitCommandDangerous(args.command);
    }

    const risk = this.getOperationRisk(operation);
    return risk.level >= RiskLevel.MEDIUM;
  }

  getOperationRisk(operation: string): OperationRisk {
    return this.OPERATION_RISKS[operation] || {
      level: RiskLevel.HIGH,
      description: 'unknown operation',
      warnings: ['Unknown operation - proceed with caution'],
      reversible: false
    };
  }

  private isGitCommandDangerous(command: string): boolean {
    const firstWord = command.trim().split(' ')[0].toLowerCase();

    // Check if it's explicitly safe
    if (this.SAFE_GIT_COMMANDS.includes(firstWord)) {
      return false;
    }

    // Check if it contains dangerous patterns
    const lowerCommand = command.toLowerCase();
    for (const dangerous of this.DANGEROUS_GIT_COMMANDS) {
      if (lowerCommand.includes(dangerous)) {
        return true;
      }
    }

    // Check for dangerous flags
    const dangerousFlags = ['--force', '--hard', '-f', '-D', '--prune'];
    for (const flag of dangerousFlags) {
      if (lowerCommand.includes(flag)) {
        return true;
      }
    }

    // Default to requiring confirmation for unknown commands
    return !this.SAFE_GIT_COMMANDS.includes(firstWord);
  }

  createConfirmationResponse(operation: string, args: any, token: string): any {
    const risk = this.getOperationRisk(operation);
    const preview = this.getOperationPreview(operation, args);
    const affectedFiles = this.getAffectedFiles(operation, args);

    const riskIndicator = this.getRiskIndicator(risk.level);

    return {
      success: false,
      requires_confirmation: true,
      operation: operation,
      confirmation_token: token,

      details: {
        risk_level: RiskLevel[risk.level],
        description: risk.description,
        warnings: risk.warnings || [],
        affected_files: affectedFiles,
        reversible: risk.reversible,
        preview: preview
      },

      message: `${riskIndicator} This operation will ${risk.description}\n\n` +
               `${risk.warnings?.length ? `⚠️  Warnings:\n${risk.warnings.map(w => `  • ${w}`).join('\n')}\n\n` : ''}` +
               `To proceed, add this parameter to your request:\n` +
               `confirmation_token: "${token}"\n\n` +
               `${preview ? `Preview:\n${preview}` : ''}`
    };
  }

  private getRiskIndicator(level: RiskLevel): string {
    switch (level) {
      case RiskLevel.SAFE: return '✅';
      case RiskLevel.LOW: return '🟡';
      case RiskLevel.MEDIUM: return '🟠';
      case RiskLevel.HIGH: return '🔴';
      case RiskLevel.CRITICAL: return '💀';
      default: return '⚠️';
    }
  }

  private getOperationPreview(operation: string, args: any): string {
    switch (operation) {
      case 'modify_files':
        return `Will modify ${args.changes?.length || 0} file(s)`;
      case 'commit_changes':
        return `Will commit with message: "${args.message}"`;
      case 'merge_branches':
        return `Will merge "${args.source_branch}" into "${args.target_branch}"`;
      case 'run_git_command':
        return `Will execute: git ${args.command}`;
      case 'refactor_code':
        return `Will perform ${args.operation} operation`;
      default:
        return '';
    }
  }

  private getAffectedFiles(operation: string, args: any): string[] {
    switch (operation) {
      case 'modify_files':
        return args.changes?.map((c: any) => c.file_path) || [];
      case 'refactor_code':
        return args.target?.file ? [args.target.file] : [];
      default:
        return [];
    }
  }
}