import { z } from 'zod';

// Permission levels
export enum PermissionLevel {
  READ_ONLY = 'read',
  SAFE_WRITE = 'safe',
  FULL_ACCESS = 'full'
}

// Configuration schemas
export const SafetyConfigSchema = z.object({
  require_confirmation: z.object({
    destructive_operations: z.boolean(),
    branch_changes: z.boolean(),
    file_modifications: z.boolean(),
    git_commands: z.array(z.string())
  }),
  backup_strategy: z.object({
    auto_stash: z.boolean(),
    create_snapshots: z.boolean(),
    max_rollback_depth: z.number()
  }),
  validation: z.object({
    check_tests_before_commit: z.boolean(),
    lint_before_commit: z.boolean(),
    require_clean_working_dir: z.boolean(),
    protected_branches: z.array(z.string())
  })
});

export type SafetyConfig = z.infer<typeof SafetyConfigSchema>;

export const ConfigSchema = z.object({
  permissionLevel: z.nativeEnum(PermissionLevel),
  safety: SafetyConfigSchema
});

export type Config = z.infer<typeof ConfigSchema>;

// Tool parameter schemas
export const AnalyseRepositorySchema = z.object({
  repo_path: z.string(),
  include_stats: z.boolean().optional(),
  check_health: z.boolean().optional()
});

export const SearchCodeSchema = z.object({
  repo_path: z.string(),
  pattern: z.string(),
  file_types: z.array(z.string()).optional(),
  include_git_history: z.boolean().optional()
});

export const GetFileContextSchema = z.object({
  repo_path: z.string(),
  file_path: z.string(),
  include_blame: z.boolean().optional(),
  include_history: z.boolean().optional(),
  include_imports: z.boolean().optional()
});

export const CreateBranchSchema = z.object({
  repo_path: z.string(),
  branch_name: z.string(),
  from_branch: z.string().optional(),
  safety_check: z.boolean().optional()
});

export const ModifyFilesSchema = z.object({
  repo_path: z.string(),
  changes: z.array(z.object({
    file_path: z.string(),
    operation: z.enum(['update', 'create', 'delete']),
    content: z.string().optional(),
    line_changes: z.array(z.object({
      start_line: z.number(),
      end_line: z.number(),
      new_content: z.string()
    })).optional()
  })),
  preview: z.boolean().optional()
});

export const CommitChangesSchema = z.object({
  repo_path: z.string(),
  message: z.string(),
  type: z.enum(['feat', 'fix', 'refactor', 'docs', 'test', 'chore']),
  scope: z.string().optional(),
  body: z.string().optional(),
  files: z.array(z.string()).optional(),
  sign_commit: z.boolean().optional()
});

export const RefactorCodeSchema = z.object({
  repo_path: z.string(),
  operation: z.enum(['rename_symbol', 'extract_function', 'inline_variable', 'move_to_file', 'update_imports']),
  target: z.object({
    file: z.string(),
    symbol: z.string().optional(),
    start_line: z.number().optional(),
    end_line: z.number().optional()
  }),
  new_value: z.string(),
  update_references: z.boolean().optional()
});

export const MergeBranchesSchema = z.object({
  repo_path: z.string(),
  source_branch: z.string(),
  target_branch: z.string(),
  strategy: z.enum(['merge', 'rebase', 'squash']),
  auto_resolve_conflicts: z.boolean().optional(),
  conflict_resolution_preference: z.enum(['ours', 'theirs', 'smart']).optional()
});

export const CreatePullRequestSchema = z.object({
  repo_path: z.string(),
  title: z.string(),
  description: z.string(),
  base_branch: z.string(),
  head_branch: z.string(),
  labels: z.array(z.string()).optional(),
  reviewers: z.array(z.string()).optional()
});

export const RunGitCommandSchema = z.object({
  repo_path: z.string(),
  command: z.string(),
  interactive: z.boolean().optional(),
  dry_run: z.boolean().optional(),
  confirmation_token: z.string().optional()
});

// Response types
export interface RepositoryAnalysis {
  path: string;
  branch: string;
  status: {
    clean: boolean;
    staged: number;
    modified: number;
    untracked: number;
  };
  stats?: {
    total_commits: number;
    contributors: number;
    lines_of_code: number;
    file_count: number;
  };
  health?: {
    has_readme: boolean;
    has_gitignore: boolean;
    has_tests: boolean;
    test_coverage?: number;
  };
}

export interface SearchResult {
  file: string;
  line: number;
  content: string;
  context?: string[];
}

export interface FileContext {
  path: string;
  content: string;
  blame?: Array<{
    line: number;
    author: string;
    commit: string;
    date: string;
  }>;
  history?: Array<{
    commit: string;
    author: string;
    date: string;
    message: string;
  }>;
  imports?: string[];
}

export interface OperationResult {
  success: boolean;
  message: string;
  details?: any;
  preview?: string;
  requires_confirmation?: boolean;
  confirmation_token?: string;
}