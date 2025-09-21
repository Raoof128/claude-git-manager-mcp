#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import simpleGit from 'simple-git';

import { GitOperations } from './git-operations.js';
import { AdvancedOperations } from './advanced-operations.js';
import { SafetyValidator } from './safety.js';
import { TypeScriptIntegration } from './typescript-integration.js';
import { Config, PermissionLevel, ConfigSchema } from './types.js';

// Default configuration
const defaultConfig: Config = {
  permissionLevel: PermissionLevel.FULL_ACCESS,
  safety: {
    require_confirmation: {
      destructive_operations: true,
      branch_changes: false,
      file_modifications: false,
      git_commands: ['reset --hard', 'clean -fd', 'push --force']
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
      protected_branches: ['main', 'master', 'production']
    }
  }
};

class GitManagerServer {
  private server: Server;
  private config: Config;

  constructor() {
    this.config = this.loadConfig();
    this.server = new Server(
      {
        name: 'git-manager',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupHandlers();
  }

  private loadConfig(): Config {
    try {
      // Try to load config from environment or file
      const envConfig = process.env.GIT_MANAGER_CONFIG;
      if (envConfig) {
        const parsed = JSON.parse(envConfig);
        return ConfigSchema.parse(parsed);
      }
    } catch (error) {
      console.warn('Failed to load config, using defaults:', error);
    }

    return defaultConfig;
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'analyse_repository',
          description: 'Get comprehensive repository overview including stats and health check',
          inputSchema: {
            type: 'object',
            properties: {
              repo_path: { type: 'string', description: 'Path to the repository' },
              include_stats: { type: 'boolean', description: 'Include repository statistics' },
              check_health: { type: 'boolean', description: 'Perform repository health check' }
            },
            required: ['repo_path']
          }
        },
        {
          name: 'search_code',
          description: 'Search for patterns across the codebase with optional git history',
          inputSchema: {
            type: 'object',
            properties: {
              repo_path: { type: 'string', description: 'Path to the repository' },
              pattern: { type: 'string', description: 'Search pattern (regex supported)' },
              file_types: { type: 'array', items: { type: 'string' }, description: 'File extensions to search' },
              include_git_history: { type: 'boolean', description: 'Search in git commit messages' }
            },
            required: ['repo_path', 'pattern']
          }
        },
        {
          name: 'get_file_context',
          description: 'Get file content with git blame, history, and dependency analysis',
          inputSchema: {
            type: 'object',
            properties: {
              repo_path: { type: 'string', description: 'Path to the repository' },
              file_path: { type: 'string', description: 'Path to the file relative to repo' },
              include_blame: { type: 'boolean', description: 'Include git blame information' },
              include_history: { type: 'boolean', description: 'Include file commit history' },
              include_imports: { type: 'boolean', description: 'Extract import/dependency information' }
            },
            required: ['repo_path', 'file_path']
          }
        },
        {
          name: 'create_branch',
          description: 'Create and checkout a new branch with safety checks',
          inputSchema: {
            type: 'object',
            properties: {
              repo_path: { type: 'string', description: 'Path to the repository' },
              branch_name: { type: 'string', description: 'Name of the new branch' },
              from_branch: { type: 'string', description: 'Source branch (default: main)' },
              safety_check: { type: 'boolean', description: 'Perform safety checks before creation' }
            },
            required: ['repo_path', 'branch_name']
          }
        },
        {
          name: 'modify_files',
          description: 'Modify multiple files with atomic changes and preview support',
          inputSchema: {
            type: 'object',
            properties: {
              repo_path: { type: 'string', description: 'Path to the repository' },
              changes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    file_path: { type: 'string', description: 'File to modify' },
                    operation: { type: 'string', enum: ['update', 'create', 'delete'] },
                    content: { type: 'string', description: 'New file content' },
                    line_changes: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          start_line: { type: 'number' },
                          end_line: { type: 'number' },
                          new_content: { type: 'string' }
                        },
                        required: ['start_line', 'end_line', 'new_content']
                      }
                    }
                  },
                  required: ['file_path', 'operation']
                }
              },
              preview: { type: 'boolean', description: 'Show diff preview without applying changes' }
            },
            required: ['repo_path', 'changes']
          }
        },
        {
          name: 'commit_changes',
          description: 'Stage and commit changes with conventional commit format',
          inputSchema: {
            type: 'object',
            properties: {
              repo_path: { type: 'string', description: 'Path to the repository' },
              message: { type: 'string', description: 'Commit message' },
              type: { type: 'string', enum: ['feat', 'fix', 'refactor', 'docs', 'test', 'chore'] },
              scope: { type: 'string', description: 'Commit scope (optional)' },
              body: { type: 'string', description: 'Detailed commit description' },
              files: { type: 'array', items: { type: 'string' }, description: 'Specific files to commit' },
              sign_commit: { type: 'boolean', description: 'Sign the commit with GPG' }
            },
            required: ['repo_path', 'message', 'type']
          }
        },
        {
          name: 'refactor_code',
          description: 'Automated refactoring operations with TypeScript support',
          inputSchema: {
            type: 'object',
            properties: {
              repo_path: { type: 'string', description: 'Path to the repository' },
              operation: {
                type: 'string',
                enum: ['rename_symbol', 'extract_function', 'inline_variable', 'move_to_file', 'update_imports']
              },
              target: {
                type: 'object',
                properties: {
                  file: { type: 'string', description: 'Target file' },
                  symbol: { type: 'string', description: 'Symbol name for rename operations' },
                  start_line: { type: 'number', description: 'Start line for extraction' },
                  end_line: { type: 'number', description: 'End line for extraction' }
                },
                required: ['file']
              },
              new_value: { type: 'string', description: 'New name or target location' },
              update_references: { type: 'boolean', description: 'Update all references' }
            },
            required: ['repo_path', 'operation', 'target', 'new_value']
          }
        },
        {
          name: 'merge_branches',
          description: 'Merge branches with conflict resolution support',
          inputSchema: {
            type: 'object',
            properties: {
              repo_path: { type: 'string', description: 'Path to the repository' },
              source_branch: { type: 'string', description: 'Branch to merge from' },
              target_branch: { type: 'string', description: 'Branch to merge into' },
              strategy: { type: 'string', enum: ['merge', 'rebase', 'squash'] },
              auto_resolve_conflicts: { type: 'boolean', description: 'Attempt automatic conflict resolution' },
              conflict_resolution_preference: { type: 'string', enum: ['ours', 'theirs', 'smart'] }
            },
            required: ['repo_path', 'source_branch', 'target_branch', 'strategy']
          }
        },
        {
          name: 'create_pull_request',
          description: 'Create a pull request with AI-generated description',
          inputSchema: {
            type: 'object',
            properties: {
              repo_path: { type: 'string', description: 'Path to the repository' },
              title: { type: 'string', description: 'Pull request title' },
              description: { type: 'string', description: 'Pull request description' },
              base_branch: { type: 'string', description: 'Target branch' },
              head_branch: { type: 'string', description: 'Source branch' },
              labels: { type: 'array', items: { type: 'string' }, description: 'PR labels' },
              reviewers: { type: 'array', items: { type: 'string' }, description: 'Requested reviewers' }
            },
            required: ['repo_path', 'title', 'description', 'base_branch', 'head_branch']
          }
        },
        {
          name: 'run_git_command',
          description: 'Execute any git command with safety checks',
          inputSchema: {
            type: 'object',
            properties: {
              repo_path: { type: 'string', description: 'Path to the repository' },
              command: { type: 'string', description: 'Git command to execute' },
              interactive: { type: 'boolean', description: 'Whether command requires interaction' },
              dry_run: { type: 'boolean', description: 'Show what would be executed without running' },
              confirmation_token: { type: 'string', description: 'Confirmation token for destructive operations' }
            },
            required: ['repo_path', 'command']
          }
        },
        {
          name: 'rollback_operation',
          description: 'Rollback to a previous safety snapshot',
          inputSchema: {
            type: 'object',
            properties: {
              repo_path: { type: 'string', description: 'Path to the repository' },
              snapshot_tag: { type: 'string', description: 'Safety snapshot tag to rollback to' }
            },
            required: ['repo_path', 'snapshot_tag']
          }
        },
        {
          name: 'list_snapshots',
          description: 'List available safety snapshots for rollback',
          inputSchema: {
            type: 'object',
            properties: {
              repo_path: { type: 'string', description: 'Path to the repository' }
            },
            required: ['repo_path']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        if (!args || typeof args !== 'object' || !args.repo_path) {
          throw new Error('repo_path is required');
        }

        // Initialize git instance
        const git = simpleGit(args.repo_path as string);

        // Initialize components
        const safetyValidator = new SafetyValidator(git, this.config);
        const gitOps = new GitOperations(git, this.config);
        const advancedOps = new AdvancedOperations(git, this.config);

        // Validate operation
        const validationResult = await safetyValidator.validateOperation(name, args);
        if (validationResult && !validationResult.success) {
          return {
            content: [
              {
                type: 'text',
                text: `Operation blocked: ${validationResult.message}`
              }
            ]
          };
        }

        // Create safety snapshot if needed
        const snapshot = await safetyValidator.createSnapshot(args.repo_path as string, name);

        // Auto-stash if configured
        const stashName = await safetyValidator.autoStash();

        let result;

        // Execute the requested operation
        switch (name) {
          case 'analyse_repository':
            result = await gitOps.analyseRepository(args);
            break;

          case 'search_code':
            result = await gitOps.searchCode(args);
            break;

          case 'get_file_context':
            result = await gitOps.getFileContext(args);
            break;

          case 'create_branch':
            result = await gitOps.createBranch(args);
            break;

          case 'modify_files':
            result = await gitOps.modifyFiles(args);
            break;

          case 'commit_changes':
            result = await gitOps.commitChanges(args);
            break;

          case 'refactor_code':
            result = await advancedOps.refactorCode(args);
            break;

          case 'merge_branches':
            result = await advancedOps.mergeBranches(args);
            break;

          case 'create_pull_request':
            result = await advancedOps.createPullRequest(args);
            break;

          case 'run_git_command':
            result = await advancedOps.runGitCommand(args);
            break;

          case 'rollback_operation':
            result = await safetyValidator.rollback(args.snapshot_tag as string);
            break;

          case 'list_snapshots':
            const snapshots = await safetyValidator.getRollbackManager().listSnapshots();
            result = {
              success: true,
              message: `Found ${snapshots.length} safety snapshots`,
              details: { snapshots }
            };
            break;

          default:
            result = {
              success: false,
              message: `Unknown tool: ${name}`
            };
        }

        // Add safety information to result
        if (snapshot || stashName) {
          if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
            (result as any).details = {
              ...(result as any).details,
              safety: {
                snapshot,
                stash: stashName,
                rollback_available: !!snapshot,
                rollback_instructions: snapshot
                  ? `To rollback this operation, use: rollback_operation with snapshot_tag: "${snapshot}"`
                  : undefined
              }
            };
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };

      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Git Manager MCP server running on stdio');
  }
}

async function main(): Promise<void> {
  const server = new GitManagerServer();
  await server.run();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}