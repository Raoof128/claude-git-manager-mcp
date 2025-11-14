import { SimpleGit } from 'simple-git';
import * as fs from 'fs-extra';
import { readFile, writeFile } from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import {
  Config,
  OperationResult,
  RefactorCodeSchema,
  MergeBranchesSchema,
  CreatePullRequestSchema,
  RunGitCommandSchema
} from './types.js';
import { ConflictResolver } from './safety.js';

export class AdvancedOperations {
  private conflictResolver: ConflictResolver;

  constructor(
    private git: SimpleGit,
    private config: Config
  ) {
    this.conflictResolver = new ConflictResolver(git);
  }

  /**
   * Validates that a file path is safe and within the repository
   * @param repoPath The repository root path
   * @param filePath The file path to validate
   * @throws Error if path traversal is detected
   */
  private validatePath(repoPath: string, filePath: string): void {
    const resolvedRepo = path.resolve(repoPath);
    const resolvedFile = path.resolve(repoPath, filePath);

    if (!resolvedFile.startsWith(resolvedRepo)) {
      throw new Error(`Path traversal detected: ${filePath} is outside repository`);
    }
  }

  async refactorCode(params: any): Promise<OperationResult> {
    const validatedParams = RefactorCodeSchema.parse(params);
    const { repo_path, operation, target, new_value, update_references = true } = validatedParams;

    // Validate target file path
    if (target.file) {
      this.validatePath(repo_path, target.file);
    }

    try {
      switch (operation) {
        case 'rename_symbol':
          return await this.renameSymbol(repo_path, target, new_value, update_references);
        case 'extract_function':
          return await this.extractFunction(repo_path, target, new_value);
        case 'inline_variable':
          return await this.inlineVariable(repo_path, target);
        case 'move_to_file':
          return await this.moveToFile(repo_path, target, new_value);
        case 'update_imports':
          return await this.updateImports(repo_path, target, new_value);
        default:
          return {
            success: false,
            message: `Unknown refactoring operation: ${operation}`
          };
      }
    } catch (error) {
      return {
        success: false,
        message: `Refactoring failed: ${error}`,
        details: error
      };
    }
  }

  async mergeBranches(params: any): Promise<OperationResult> {
    const validatedParams = MergeBranchesSchema.parse(params);
    const {
      source_branch,
      target_branch,
      strategy,
      auto_resolve_conflicts = false,
      conflict_resolution_preference = 'smart'
    } = validatedParams;

    try {
      // Checkout target branch
      await this.git.checkout(target_branch);

      // Perform merge based on strategy
      let mergeResult;
      switch (strategy) {
        case 'merge':
          mergeResult = await this.git.merge([source_branch]);
          break;
        case 'rebase':
          mergeResult = await this.git.rebase([source_branch]);
          break;
        case 'squash':
          mergeResult = await this.git.merge(['--squash', source_branch]);
          break;
      }

      return {
        success: true,
        message: `Successfully merged '${source_branch}' into '${target_branch}' using ${strategy} strategy`,
        details: mergeResult
      };

    } catch (error) {
      // Check if it's a merge conflict
      const status = await this.git.status();
      if (status.conflicted.length > 0) {
        if (auto_resolve_conflicts) {
          const resolveResult = await this.conflictResolver.resolveConflicts(
            conflict_resolution_preference,
            status.conflicted
          );

          if (resolveResult.success) {
            // Complete the merge
            await this.git.add('.');
            await this.git.commit(`Merge ${source_branch} into ${target_branch}`);

            return {
              success: true,
              message: `Merged with auto-resolved conflicts using '${conflict_resolution_preference}' strategy`,
              details: {
                conflicts_resolved: status.conflicted.length,
                strategy: conflict_resolution_preference
              }
            };
          }
        }

        return {
          success: false,
          message: `Merge conflicts detected in ${status.conflicted.length} files`,
          details: {
            conflicted_files: status.conflicted,
            suggestion: 'Resolve conflicts manually or use auto_resolve_conflicts option'
          }
        };
      }

      return {
        success: false,
        message: `Merge failed: ${error}`,
        details: error
      };
    }
  }

  async createPullRequest(params: any): Promise<OperationResult> {
    const validatedParams = CreatePullRequestSchema.parse(params);
    const { title, description, base_branch, head_branch, labels, reviewers } = validatedParams;

    try {
      // Check if we have GitHub CLI available
      const hasGhCli = await this.checkGitHubCli();
      if (!hasGhCli) {
        return {
          success: false,
          message: 'GitHub CLI (gh) is required for creating pull requests'
        };
      }

      // Generate PR description with AI-enhanced content
      const enhancedDescription = await this.generatePRDescription(head_branch, base_branch, description);

      // Create PR using GitHub CLI
      const ghCommand = [
        'gh', 'pr', 'create',
        '--title', title,
        '--body', enhancedDescription,
        '--base', base_branch,
        '--head', head_branch
      ];

      if (labels && labels.length > 0) {
        ghCommand.push('--label', labels.join(','));
      }

      if (reviewers && reviewers.length > 0) {
        ghCommand.push('--reviewer', reviewers.join(','));
      }

      const result = await this.git.raw(ghCommand);

      return {
        success: true,
        message: 'Pull request created successfully',
        details: {
          url: result.trim(),
          title,
          base_branch,
          head_branch,
          labels,
          reviewers
        }
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to create pull request: ${error}`,
        details: error
      };
    }
  }

  async runGitCommand(params: any): Promise<OperationResult> {
    const validatedParams = RunGitCommandSchema.parse(params);
    const { command, dry_run = false } = validatedParams;

    // Security check: prevent dangerous commands
    const dangerousCommands = ['rm', 'reset --hard', 'clean -fd', 'push --force'];
    const isDangerous = dangerousCommands.some(dangerous => command.includes(dangerous));

    if (isDangerous && this.config.safety.require_confirmation.destructive_operations) {
      return {
        success: false,
        message: `Command '${command}' is potentially destructive and requires confirmation`,
        details: { requires_confirmation: true }
      };
    }

    try {
      if (dry_run) {
        return {
          success: true,
          message: `Dry run: Would execute 'git ${command}'`,
          details: { dry_run: true }
        };
      }

      const result = await this.git.raw(command.split(' '));

      return {
        success: true,
        message: `Command executed successfully: git ${command}`,
        details: { output: result }
      };

    } catch (error) {
      return {
        success: false,
        message: `Command failed: git ${command}`,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  private async renameSymbol(
    repo_path: string,
    target: any,
    newName: string,
    _updateReferences: boolean
  ): Promise<OperationResult> {
    const { symbol } = target;

    if (!symbol) {
      return {
        success: false,
        message: 'Symbol name is required for rename operation'
      };
    }

    // Find all files that might contain references
    const files = await glob('**/*.{ts,js,tsx,jsx}', {
      cwd: repo_path,
      ignore: ['node_modules/**', 'dist/**', 'build/**'],
      nodir: true
    });

    let filesModified = 0;

    for (const targetFile of files) {
      const filePath = path.join(repo_path, targetFile);
      let content = await readFile(filePath, 'utf-8');
      const originalContent = content;

      // Simple regex-based symbol replacement
      // In a real implementation, this would use a proper AST parser
      const symbolRegex = new RegExp(`\\b${symbol}\\b`, 'g');
      content = content.replace(symbolRegex, newName);

      if (content !== originalContent) {
        await writeFile(filePath, content);
        filesModified++;
      }
    }

    return {
      success: true,
      message: `Renamed symbol '${symbol}' to '${newName}' in ${filesModified} files`,
      details: { files_modified: filesModified }
    };
  }

  private async extractFunction(
    repo_path: string,
    target: any,
    newFileName: string
  ): Promise<OperationResult> {
    const { file, start_line, end_line } = target;

    if (!start_line || !end_line) {
      return {
        success: false,
        message: 'Start and end line numbers are required for function extraction'
      };
    }

    const sourceFile = path.join(repo_path, file);
    const content = await readFile(sourceFile, 'utf-8');
    const lines = content.split('\n');

    // Extract the function
    const extractedLines = lines.slice(start_line - 1, end_line);
    const extractedContent = extractedLines.join('\n');

    // Create new file
    const newFile = path.join(repo_path, newFileName);
    await fs.ensureDir(path.dirname(newFile));
    await writeFile(newFile, extractedContent);

    // Remove from original file and add import
    const remainingLines = [
      ...lines.slice(0, start_line - 1),
      `// Extracted to ${newFileName}`,
      ...lines.slice(end_line)
    ];

    await writeFile(sourceFile, remainingLines.join('\n'));

    return {
      success: true,
      message: `Extracted function to ${newFileName}`,
      details: {
        source_file: file,
        new_file: newFileName,
        lines_extracted: end_line - start_line + 1
      }
    };
  }

  private async inlineVariable(repo_path: string, target: any): Promise<OperationResult> {
    const { file, symbol } = target;

    if (!symbol) {
      return {
        success: false,
        message: 'Symbol name is required for inline variable operation'
      };
    }

    try {
      const sourceFile = path.join(repo_path, file);
      const content = await readFile(sourceFile, 'utf-8');
      const lines = content.split('\n');

      // Find variable declaration and its value
      let variableValue: string | null = null;
      let declarationLineIdx = -1;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match variable declarations like: const symbol = value; or let symbol = value;
        const match = line.match(new RegExp(`(?:const|let|var)\\s+${symbol}\\s*=\\s*(.+?);`));
        if (match) {
          variableValue = match[1].trim();
          declarationLineIdx = i;
          break;
        }
      }

      if (!variableValue || declarationLineIdx === -1) {
        return {
          success: false,
          message: `Could not find variable declaration for '${symbol}'`
        };
      }

      // Replace all references with the value and remove declaration
      const symbolRegex = new RegExp(`\\b${symbol}\\b`, 'g');
      const newLines = lines.filter((_, idx) => idx !== declarationLineIdx)
        .map(line => line.replace(symbolRegex, variableValue));

      await writeFile(sourceFile, newLines.join('\n'));

      return {
        success: true,
        message: `Inlined variable '${symbol}' with value '${variableValue}'`,
        details: {
          variable: symbol,
          value: variableValue,
          occurrences: content.split(symbol).length - 1
        }
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to inline variable: ${error}`,
        details: error
      };
    }
  }

  private async moveToFile(
    repo_path: string,
    target: any,
    newFileName: string
  ): Promise<OperationResult> {
    const { file, start_line, end_line, symbol } = target;

    if (!start_line || !end_line) {
      return {
        success: false,
        message: 'Start and end line numbers are required for move operation'
      };
    }

    try {
      const sourceFile = path.join(repo_path, file);
      const content = await readFile(sourceFile, 'utf-8');
      const lines = content.split('\n');

      // Extract the code to move
      const codeToMove = lines.slice(start_line - 1, end_line).join('\n');

      // Determine file extension for proper imports
      const fileExt = path.extname(file);
      const newFile = newFileName.endsWith(fileExt) ? newFileName : `${newFileName}${fileExt}`;
      const newFilePath = path.join(repo_path, newFile);

      // Create or append to the new file
      let newFileContent = '';
      if (await fs.pathExists(newFilePath)) {
        newFileContent = await readFile(newFilePath, 'utf-8');
        newFileContent += '\n\n' + codeToMove;
      } else {
        // Add appropriate header for new file
        if (fileExt === '.ts' || fileExt === '.js') {
          newFileContent = `// Moved from ${file}\n\n${codeToMove}`;
        } else {
          newFileContent = codeToMove;
        }
      }

      await fs.ensureDir(path.dirname(newFilePath));
      await writeFile(newFilePath, newFileContent);

      // Remove from original file and add import reference
      const remainingLines = [
        ...lines.slice(0, start_line - 1),
        `// Moved to ${newFile}${symbol ? ` - use: import { ${symbol} } from './${path.basename(newFile, fileExt)}'` : ''}`,
        ...lines.slice(end_line)
      ];

      await writeFile(sourceFile, remainingLines.join('\n'));

      return {
        success: true,
        message: `Moved code from ${file} to ${newFile}`,
        details: {
          source_file: file,
          target_file: newFile,
          lines_moved: end_line - start_line + 1,
          symbol: symbol || 'anonymous'
        }
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to move code: ${error}`,
        details: error
      };
    }
  }

  private async updateImports(
    repo_path: string,
    target: any,
    newImportPath: string
  ): Promise<OperationResult> {
    const files = await glob('**/*.{ts,js,tsx,jsx}', {
      cwd: repo_path,
      ignore: ['node_modules/**', 'dist/**', 'build/**'],
      nodir: true
    });

    let filesModified = 0;

    for (const file of files) {
      const filePath = path.join(repo_path, file);
      let content = await readFile(filePath, 'utf-8');
      const originalContent = content;

      // Update import statements
      content = content.replace(
        /import\s+.*\s+from\s+['"`]([^'"`]+)['"`]/g,
        (match, importPath) => {
          if (importPath === target.file) {
            return match.replace(importPath, newImportPath);
          }
          return match;
        }
      );

      if (content !== originalContent) {
        await writeFile(filePath, content);
        filesModified++;
      }
    }

    return {
      success: true,
      message: `Updated imports in ${filesModified} files`,
      details: { files_modified: filesModified }
    };
  }

  private async checkGitHubCli(): Promise<boolean> {
    try {
      // Use Node.js child_process to check if gh CLI is available
      const { execSync } = await import('child_process');
      execSync('gh --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  private async generatePRDescription(
    headBranch: string,
    baseBranch: string,
    baseDescription: string
  ): Promise<string> {
    // Get commit messages since branching point
    try {
      const commits = await this.git.log({ from: baseBranch, to: headBranch });
      const commitMessages = commits.all.map(commit => `- ${commit.message}`).join('\n');

      // Get diff stats
      const diffStat = await this.git.diffSummary([`${baseBranch}...${headBranch}`]);

      let enhancedDescription = baseDescription + '\n\n';
      enhancedDescription += '## Changes\n';
      enhancedDescription += `Files changed: ${diffStat.files.length}\n`;
      enhancedDescription += `Insertions: ${diffStat.insertions}\n`;
      enhancedDescription += `Deletions: ${diffStat.deletions}\n\n`;
      enhancedDescription += '## Commits\n';
      enhancedDescription += commitMessages;

      return enhancedDescription;
    } catch {
      return baseDescription;
    }
  }
}