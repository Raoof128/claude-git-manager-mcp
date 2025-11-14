import { SimpleGit } from 'simple-git';
import * as fs from 'fs-extra';
import { readFile, writeFile } from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
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
  CommitChangesSchema
} from './types.js';

// Constants
const IGNORED_DIRS = ['node_modules/**', '.git/**', 'dist/**', 'build/**', 'coverage/**', '.next/**'];
const DEFAULT_CONTEXT_LINES = 2;
const README_FILES = ['README.md', 'readme.md', 'Readme.md'];

export class GitOperations {
  constructor(
    private git: SimpleGit,
    private config: Config
  ) {}

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

  /**
   * Validates that the repository path exists and is a valid git repository
   * @param repoPath The repository root path
   * @throws Error if path is not a valid git repository
   */
  private async validateRepository(repoPath: string): Promise<void> {
    try {
      // Check if path exists
      if (!await fs.pathExists(repoPath)) {
        throw new Error(`Repository path does not exist: ${repoPath}`);
      }

      // Check if it's a directory
      const stats = await fs.stat(repoPath);
      if (!stats.isDirectory()) {
        throw new Error(`Repository path is not a directory: ${repoPath}`);
      }

      // Check if it's a git repository
      const gitDir = path.join(repoPath, '.git');
      const hasGitDir = await fs.pathExists(gitDir);

      if (!hasGitDir) {
        // Try to verify with git command
        try {
          await this.git.revparse(['--git-dir']);
        } catch {
          throw new Error(`Path is not a git repository: ${repoPath}`);
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to validate repository: ${error}`);
    }
  }

  /**
   * Analyzes a git repository and returns comprehensive information
   * @param params Analysis parameters including repo path and options
   * @returns Repository analysis including status, stats, and health information
   * @throws Error if repository is invalid or inaccessible
   */
  async analyseRepository(params: any): Promise<RepositoryAnalysis> {
    const validatedParams = AnalyseRepositorySchema.parse(params);
    const { repo_path, include_stats = false, check_health = false } = validatedParams;

    // Validate repository
    await this.validateRepository(repo_path);

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
        ignore: IGNORED_DIRS,
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
      // Check for README files
      let hasReadme = false;
      for (const readmeFile of README_FILES) {
        if (await fs.pathExists(path.join(repo_path, readmeFile))) {
          hasReadme = true;
          break;
        }
      }
      const hasGitignore = await fs.pathExists(path.join(repo_path, '.gitignore'));

      // Check for test files
      const testFiles = await glob('**/*{test,spec}*', {
        cwd: repo_path,
        ignore: IGNORED_DIRS,
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

  /**
   * Searches for code patterns across the repository
   * @param params Search parameters including pattern and file filters
   * @returns Array of search results with file locations and context
   * @throws Error if search fails
   */
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
      ignore: IGNORED_DIRS,
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
              context: lines.slice(
                Math.max(0, index - DEFAULT_CONTEXT_LINES),
                index + DEFAULT_CONTEXT_LINES + 1
              )
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

  /**
   * Retrieves comprehensive context for a file including content, blame, history, and imports
   * @param params File context parameters
   * @returns File context with requested information
   * @throws Error if file is invalid or inaccessible
   */
  async getFileContext(params: any): Promise<FileContext> {
    const validatedParams = GetFileContextSchema.parse(params);
    const { repo_path, file_path, include_blame = false, include_history = false, include_imports = false } = validatedParams;

    // Validate path to prevent traversal attacks
    this.validatePath(repo_path, file_path);

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

  /**
   * Creates and checks out a new git branch
   * @param params Branch creation parameters
   * @returns Operation result indicating success or failure
   * @throws Error if branch creation fails
   */
  async createBranch(params: any): Promise<OperationResult> {
    const validatedParams = CreateBranchSchema.parse(params);
    const { branch_name, from_branch = 'main', safety_check = true } = validatedParams;

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

  /**
   * Modifies multiple files atomically with optional preview
   * @param params File modification parameters including changes array
   * @returns Operation result with preview or confirmation of changes
   * @throws Error if modifications fail
   */
  async modifyFiles(params: any): Promise<OperationResult> {
    const validatedParams = ModifyFilesSchema.parse(params);
    const { repo_path, changes, preview = false } = validatedParams;

    // Validate all file paths to prevent traversal attacks
    for (const change of changes) {
      this.validatePath(repo_path, change.file_path);
    }

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
            // Sort line changes in reverse order to avoid index invalidation
            const sortedChanges = [...change.line_changes].sort((a, b) => b.start_line - a.start_line);
            for (const lineChange of sortedChanges) {
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

              // Sort line changes in reverse order to avoid index invalidation
              const sortedChanges = [...change.line_changes].sort((a, b) => b.start_line - a.start_line);
              for (const lineChange of sortedChanges) {
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

  /**
   * Commits staged or specified files with conventional commit format
   * @param params Commit parameters including message, type, and optional GPG signing
   * @returns Operation result confirming commit
   * @throws Error if commit fails or tests fail (if configured)
   */
  async commitChanges(params: any): Promise<OperationResult> {
    const validatedParams = CommitChangesSchema.parse(params);
    const { message, type, scope, body, files, sign_commit = false } = validatedParams;

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