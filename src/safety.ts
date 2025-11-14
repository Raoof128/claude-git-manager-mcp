import { SimpleGit } from 'simple-git';
import { Config, PermissionLevel, OperationResult } from './types.js';
import { ConfirmationManager } from './confirmation-manager.js';
import { RiskManager } from './risk-manager.js';
import { RollbackManager } from './rollback-manager.js';

export class SafetyValidator {
  private confirmationManager: ConfirmationManager;
  private riskManager: RiskManager;
  private rollbackManager: RollbackManager;

  constructor(
    private git: SimpleGit,
    private config: Config
  ) {
    this.confirmationManager = new ConfirmationManager();
    this.riskManager = new RiskManager();
    this.rollbackManager = new RollbackManager(git);
  }

  async validateOperation(operation: string, params: any): Promise<OperationResult | null> {
    // Check permission level
    if (!this.hasPermission(operation)) {
      return {
        success: false,
        message: `Operation '${operation}' not allowed with current permission level '${this.config.permissionLevel}'`
      };
    }

    // Check if confirmation token is provided
    if (params.confirmation_token) {
      if (this.confirmationManager.validateToken(params.confirmation_token, operation, params)) {
        // Token is valid, proceed with operation
        return null;
      } else {
        return {
          success: false,
          message: 'Invalid or expired confirmation token. Please request a new one.'
        };
      }
    }

    // Check if operation requires confirmation using risk-based assessment
    if (this.riskManager.needsConfirmation(operation, params)) {
      const token = this.confirmationManager.generateToken(operation, params);
      return this.riskManager.createConfirmationResponse(operation, params, token);
    }

    // Check branch protection for operations that modify the current branch
    if (this.isBranchOperation(operation)) {
      const currentBranch = await this.git.revparse(['--abbrev-ref', 'HEAD']);

      // For merge operations, check if we're merging INTO a protected branch
      if (operation === 'merge_branches' && params.target_branch) {
        if (this.config.safety.validation.protected_branches.includes(params.target_branch)) {
          return {
            success: false,
            message: `Cannot merge into protected branch '${params.target_branch}'. Use a pull request instead.`
          };
        }
      }
      // For commits, check if we're committing to a protected branch
      else if (operation === 'commit_changes' && this.config.safety.validation.protected_branches.includes(currentBranch)) {
        return {
          success: false,
          message: `Branch '${currentBranch}' is protected. Create a feature branch and use a pull request.`
        };
      }
    }

    // Check working directory cleanliness for certain operations
    if (this.requiresCleanWorkingDir(operation) && this.config.safety.validation.require_clean_working_dir) {
      const status = await this.git.status();
      if (!status.isClean()) {
        return {
          success: false,
          message: 'Working directory must be clean for this operation',
          details: {
            staged: status.staged.length,
            modified: status.modified.length,
            untracked: status.not_added.length
          }
        };
      }
    }

    return null; // No validation errors
  }

  async createSnapshot(repo_path: string, operation: string): Promise<string | null> {
    if (!this.config.safety.backup_strategy.create_snapshots) {
      return null;
    }

    return await this.rollbackManager.createSafetySnapshot(operation);
  }

  async autoStash(): Promise<string | null> {
    if (!this.config.safety.backup_strategy.auto_stash) {
      return null;
    }

    try {
      const status = await this.git.status();
      if (!status.isClean()) {
        const stashMessage = `Auto-stash before MCP operation - ${new Date().toISOString()}`;
        await this.git.stash(['push', '-m', stashMessage]);
        return stashMessage;
      }
    } catch (error) {
      console.warn(`Failed to auto-stash: ${error}`);
    }

    return null;
  }

  async rollback(snapshotTag: string): Promise<OperationResult> {
    return await this.rollbackManager.rollbackToSnapshot(snapshotTag);
  }

  getRollbackManager(): RollbackManager {
    return this.rollbackManager;
  }

  private hasPermission(operation: string): boolean {
    const readOnlyOps = [
      'analyse_repository',
      'search_code',
      'get_file_context'
    ];

    const safeWriteOps = [
      ...readOnlyOps,
      'create_branch',
      'modify_files',
      'commit_changes'
    ];

    const fullAccessOps = [
      ...safeWriteOps,
      'refactor_code',
      'merge_branches',
      'create_pull_request',
      'run_git_command'
    ];

    switch (this.config.permissionLevel) {
      case PermissionLevel.READ_ONLY:
        return readOnlyOps.includes(operation);
      case PermissionLevel.SAFE_WRITE:
        return safeWriteOps.includes(operation);
      case PermissionLevel.FULL_ACCESS:
        return fullAccessOps.includes(operation);
      default:
        return false;
    }
  }

  private isDestructiveOperation(operation: string): boolean {
    const destructiveOps = [
      'merge_branches',
      'run_git_command'
    ];
    return destructiveOps.includes(operation);
  }

  private isBranchOperation(operation: string): boolean {
    const branchOps = [
      'merge_branches',
      'commit_changes'
    ];
    // Note: create_branch is excluded because it creates FROM protected branches, not TO them
    return branchOps.includes(operation);
  }

  private requiresCleanWorkingDir(operation: string): boolean {
    const cleanDirOps = [
      'create_branch',
      'merge_branches'
    ];
    return cleanDirOps.includes(operation);
  }
}

export class ConflictResolver {
  constructor(private git: SimpleGit) {}

  async resolveConflicts(
    strategy: 'ours' | 'theirs' | 'smart',
    conflictedFiles: string[]
  ): Promise<OperationResult> {
    try {
      for (const file of conflictedFiles) {
        switch (strategy) {
          case 'ours':
            await this.git.checkout(['--ours', file]);
            break;
          case 'theirs':
            await this.git.checkout(['--theirs', file]);
            break;
          case 'smart':
            await this.smartResolve(file);
            break;
        }
      }

      return {
        success: true,
        message: `Resolved ${conflictedFiles.length} conflicts using '${strategy}' strategy`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to resolve conflicts: ${error}`,
        details: error
      };
    }
  }

  private async smartResolve(file: string): Promise<void> {
    // Read the conflicted file directly from filesystem
    const { readFile, writeFile } = await import('fs/promises');
    const content = await readFile(file, 'utf-8');

    // Smart resolution with improved heuristics
    const lines = content.split('\n');
    const resolved: string[] = [];
    let inConflict = false;
    let inTheirsSection = false;
    const oursSection: string[] = [];
    const theirsSection: string[] = [];

    for (const line of lines) {
      if (line.startsWith('<<<<<<<')) {
        // Start of conflict marker
        inConflict = true;
        inTheirsSection = false;
        oursSection.length = 0;
        theirsSection.length = 0;
      } else if (line.startsWith('=======')) {
        // Switch from ours to theirs section
        inTheirsSection = true;
      } else if (line.startsWith('>>>>>>>')) {
        // End of conflict marker - apply resolution strategy
        inConflict = false;
        inTheirsSection = false;

        // Smart heuristics for resolution:
        // 1. If one section is empty, use the other
        // 2. If sections are identical, use one copy
        // 3. If both have content, prefer newer (theirs) with annotations
        if (oursSection.length === 0 && theirsSection.length > 0) {
          resolved.push(...theirsSection);
        } else if (theirsSection.length === 0 && oursSection.length > 0) {
          resolved.push(...oursSection);
        } else if (oursSection.join('\n') === theirsSection.join('\n')) {
          // Sections are identical, use one copy
          resolved.push(...oursSection);
        } else {
          // Both sections have different content - keep both with comment
          resolved.push('// Merged conflict: kept both versions');
          resolved.push(...oursSection);
          if (theirsSection.some(l => l.trim() !== '')) {
            resolved.push(...theirsSection);
          }
        }

        oursSection.length = 0;
        theirsSection.length = 0;
      } else if (inConflict) {
        // Add line to appropriate section
        if (inTheirsSection) {
          theirsSection.push(line);
        } else {
          oursSection.push(line);
        }
      } else {
        // Regular line, not in conflict
        resolved.push(line);
      }
    }

    // Write resolved content back to file
    await writeFile(file, resolved.join('\n'));
  }
}