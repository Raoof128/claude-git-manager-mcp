import { SimpleGit } from 'simple-git';
import * as fs from 'fs-extra';
import { readFile, writeFile } from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { minimatch } from 'minimatch';
import * as diff from 'diff';
import {
  Config,
  RepositoryAnalysis,
  SearchResult,
  FileContext,
  OperationResult,
  AnalyseRepositorySchema,
  SearchCodeSchema,
  GetFileContextSchema,
  CreateBranchSchema,
  ModifyFilesSchema,
  CommitChangesSchema,
  RefactorCodeSchema,
  MergeBranchesSchema,
  CreatePullRequestSchema,
  RunGitCommandSchema
} from './types.js';

export class GitOperations {
  constructor(
    private git: SimpleGit,
    private config: Config
  ) {}

  async analyseRepository(params: any): Promise<RepositoryAnalysis> {
    const validatedParams = AnalyseRepositorySchema.parse(params);
    const { repo_path, include_stats = false, check_health = false } = validatedParams;

    // Get basic status
    const status = await this.git.status();
    const branch = await this.git.revparse(['--abbrev-ref', 'HEAD']);

    const analysis: RepositoryAnalysis = {
      path: repo_path,
      branch,
      status: {
        clean: status.isClean(),
        staged: status.staged.length,
        modified: status.modified.length,
        untracked: status.not_added.length
      }
    };

    // Add stats if requested
    if (include_stats) {
      const log = await this.git.log();
      const contributors = new Set(log.all.map(commit => commit.author_email)).size;

      // Count lines of code
      const files = await glob('**/*', {
        cwd: repo_path,
        ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
        nodir: true
      });

      let totalLines = 0;
      for (const file of files) {
        try {
          const content = await fs.readFile(path.join(repo_path, file), 'utf-8');
          totalLines += content.split('\n').length;
        } catch {
          // Skip binary files
        }
      }

      analysis.stats = {
        total_commits: log.total,
        contributors,
        lines_of_code: totalLines,
        file_count: files.length
      };
    }

    // Add health check if requested
    if (check_health) {
      const hasReadme = await fs.pathExists(path.join(repo_path, 'README.md')) ||
                       await fs.pathExists(path.join(repo_path, 'readme.md'));
      const hasGitignore = await fs.pathExists(path.join(repo_path, '.gitignore'));

      // Check for test files
      const testFiles = await glob('**/*{test,spec}*', {
        cwd: repo_path,
        ignore: ['node_modules/**'],
        nodir: true
      });

      analysis.health = {
        has_readme: hasReadme,
        has_gitignore: hasGitignore,
        has_tests: testFiles.length > 0
      };
    }

    return analysis;
  }

  async searchCode(params: any): Promise<SearchResult[]> {
    const validatedParams = SearchCodeSchema.parse(params);
    const { repo_path, pattern, file_types = [], include_git_history = false } = validatedParams;

    const results: SearchResult[] = [];

    // Build file pattern - fix the pattern construction
    let filePattern = '**/*';
    if (file_types.length > 0) {
      // Ensure file extensions start with dot if not present
      const normalizedTypes = file_types.map(type => type.startsWith('.') ? type : `.${type}`);
      filePattern = normalizedTypes.length === 1
        ? `**/*${normalizedTypes[0]}`
        : `**/*{${normalizedTypes.join(',')}}`;
    }

    const files = await glob(filePattern, {
      cwd: repo_path,
      ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
      nodir: true
    });

    // Search in current files
    for (const file of files) {
      try {
        const filePath = path.join(repo_path, file);
        const content = await readFile(filePath, 'utf-8');
        const lines = content.split('\n');

        lines.forEach((line, index) => {
          if (line.match(new RegExp(pattern, 'i'))) {
            results.push({
              file,
              line: index + 1,
              content: line.trim(),
              context: lines.slice(Math.max(0, index - 2), index + 3)
            });
          }
        });
      } catch {
        // Skip binary files
      }
    }

    // Search in git history if requested
    if (include_git_history) {
      try {
        const gitResults = await this.git.raw(['log', '--grep', pattern, '--oneline']);
        const commits = gitResults.split('\n').filter(line => line.trim());

        for (const commit of commits) {
          const [hash, ...messageParts] = commit.split(' ');
          results.push({
            file: 'git-history',
            line: 0,
            content: messageParts.join(' '),
            context: [hash]
          });
        }
      } catch {
        // Git grep failed, continue
      }
    }

    return results;
  }

  async getFileContext(params: any): Promise<FileContext> {
    const validatedParams = GetFileContextSchema.parse(params);
    const { repo_path, file_path, include_blame = false, include_history = false, include_imports = false } = validatedParams;

    const fullPath = path.join(repo_path, file_path);
    const content = await readFile(fullPath, 'utf-8');

    const context: FileContext = {
      path: file_path,
      content
    };

    // Add git blame if requested
    if (include_blame) {
      try {
        const blameResult = await this.git.raw(['blame', '--line-porcelain', file_path]);
        context.blame = this.parseBlame(blameResult);
      } catch {
        // Blame failed, skip
      }
    }

    // Add file history if requested
    if (include_history) {
      try {
        const log = await this.git.log({ file: file_path });
        context.history = log.all.map(commit => ({
          commit: commit.hash,
          author: commit.author_name,
          date: commit.date,
          message: commit.message
        }));
      } catch {
        // History failed, skip
      }
    }

    // Extract imports if requested
    if (include_imports) {
      context.imports = this.extractImports(content, path.extname(file_path));
    }

    return context;
  }

  async createBranch(params: any): Promise<OperationResult> {
    const validatedParams = CreateBranchSchema.parse(params);
    const { repo_path, branch_name, from_branch = 'main', safety_check = true } = validatedParams;

    if (safety_check) {
      const status = await this.git.status();
      if (!status.isClean() && this.config.safety.validation.require_clean_working_dir) {
        return {
          success: false,
          message: 'Working directory is not clean. Commit or stash changes first.',
          details: status
        };
      }
    }

    try {
      // Create and checkout new branch
      await this.git.checkout(['-b', branch_name, from_branch]);

      return {
        success: true,
        message: `Created and checked out branch '${branch_name}' from '${from_branch}'`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to create branch: ${error}`,
        details: error
      };
    }
  }

  async modifyFiles(params: any): Promise<OperationResult> {
    const validatedParams = ModifyFilesSchema.parse(params);
    const { repo_path, changes, preview = false } = validatedParams;

    if (preview) {
      // Generate preview of changes
      const previews = [];
      for (const change of changes) {
        const filePath = path.join(repo_path, change.file_path);

        if (change.operation === 'create') {
          previews.push(`+++ ${change.file_path} (new file)\n${change.content}`);
        } else if (change.operation === 'delete') {
          previews.push(`--- ${change.file_path} (deleted)`);
        } else if (change.operation === 'update') {
          let originalContent = '';
          try {
            originalContent = await fs.readFile(filePath, 'utf-8');
          } catch {
            // File doesn't exist
          }

          let newContent = change.content || originalContent;

          if (change.line_changes) {
            const lines = originalContent.split('\n');
            for (const lineChange of change.line_changes) {
              const startIdx = lineChange.start_line - 1;
              const endIdx = lineChange.end_line;
              lines.splice(startIdx, endIdx - startIdx, lineChange.new_content);
            }
            newContent = lines.join('\n');
          }

          const diffResult = diff.createPatch(change.file_path, originalContent, newContent);
          previews.push(diffResult);
        }
      }

      return {
        success: true,
        message: 'Preview generated',
        preview: previews.join('\n\n')
      };
    }

    // Apply changes
    try {
      for (const change of changes) {
        const filePath = path.join(repo_path, change.file_path);

        switch (change.operation) {
          case 'create':
            await fs.ensureDir(path.dirname(filePath));
            await writeFile(filePath, change.content || '');
            break;

          case 'delete':
            await fs.remove(filePath);
            break;

          case 'update':
            if (change.line_changes) {
              const originalContent = await readFile(filePath, 'utf-8');
              const lines = originalContent.split('\n');

              for (const lineChange of change.line_changes) {
                const startIdx = lineChange.start_line - 1;
                const endIdx = lineChange.end_line;
                lines.splice(startIdx, endIdx - startIdx, lineChange.new_content);
              }

              await writeFile(filePath, lines.join('\n'));
            } else if (change.content !== undefined) {
              await writeFile(filePath, change.content);
            }
            break;
        }
      }

      return {
        success: true,
        message: `Successfully modified ${changes.length} file(s)`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to modify files: ${error}`,
        details: error
      };
    }
  }

  async commitChanges(params: any): Promise<OperationResult> {
    const validatedParams = CommitChangesSchema.parse(params);
    const { repo_path, message, type, scope, body, files, sign_commit = false } = validatedParams;

    try {
      // Run tests if configured
      if (this.config.safety.validation.check_tests_before_commit) {
        // This would integrate with the project's test runner
        // Implementation depends on the project type (npm test, cargo test, etc.)
      }

      // Stage files
      if (files && files.length > 0) {
        await this.git.add(files);
      } else {
        await this.git.add('.');
      }

      // Format commit message using conventional commits
      let commitMessage = `${type}`;
      if (scope) {
        commitMessage += `(${scope})`;
      }
      commitMessage += `: ${message}`;

      if (body) {
        commitMessage += `\n\n${body}`;
      }

      // Commit
      if (sign_commit) {
        await this.git.commit(commitMessage, undefined, { '-S': null });
      } else {
        await this.git.commit(commitMessage);
      }

      return {
        success: true,
        message: `Committed changes: ${commitMessage}`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to commit: ${error}`,
        details: error
      };
    }
  }

  private parseBlame(blameOutput: string) {
    const lines = blameOutput.split('\n');
    const blame = [];
    let currentCommit = '';
    let currentAuthor = '';
    let currentDate = '';
    let lineNumber = 0;

    for (const line of lines) {
      if (line.match(/^[0-9a-f]{40}/)) {
        currentCommit = line.split(' ')[0];
      } else if (line.startsWith('author ')) {
        currentAuthor = line.substring(7);
      } else if (line.startsWith('author-time ')) {
        currentDate = new Date(parseInt(line.substring(12)) * 1000).toISOString();
      } else if (line.startsWith('\t')) {
        lineNumber++;
        blame.push({
          line: lineNumber,
          author: currentAuthor,
          commit: currentCommit,
          date: currentDate
        });
      }
    }

    return blame;
  }

  private extractImports(content: string, extension: string): string[] {
    const imports = [];
    const lines = content.split('\n');

    for (const line of lines) {
      // TypeScript/JavaScript imports
      if (extension.match(/\.(ts|js|tsx|jsx)$/)) {
        const importMatch = line.match(/import.*from\s+['"`]([^'"`]+)['"`]/);
        if (importMatch) {
          imports.push(importMatch[1]);
        }
      }
      // Python imports
      else if (extension === '.py') {
        const importMatch = line.match(/^(?:from\s+(\S+)\s+)?import\s+(.+)/);
        if (importMatch) {
          imports.push(importMatch[1] || importMatch[2]);
        }
      }
      // Add more language support as needed
    }

    return imports;
  }
}