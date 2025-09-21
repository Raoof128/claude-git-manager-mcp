# Git Repository Manager MCP

A powerful Model Context Protocol (MCP) server that gives Claude Desktop full control over Git repositories. This MCP enables Claude to read, analyze, modify, commit, branch, merge, and refactor code based on natural language instructions.

## Features

### 🚨 Critical Concept: Claude as Your Git Co-Pilot
Instead of just analyzing git history, this MCP gives Claude full repository control - it can read, write, commit, branch, merge, and refactor code based on your natural language instructions.

### Core Capabilities

#### 📖 Read Operations (Safe)
- **Repository Analysis**: Get comprehensive repo overview with stats and health checks
- **Code Search**: Search patterns across codebase with optional git history
- **File Context**: Get files with git blame, history, and dependency analysis

#### ✏️ Write Operations (Powerful)
- **Branch Management**: Create and manage branches with safety checks
- **File Modifications**: Atomic file changes with diff previews
- **Smart Commits**: Conventional commit format with automated testing
- **Code Refactoring**: TypeScript-aware symbol renaming, function extraction
- **Branch Merging**: Intelligent conflict resolution
- **Pull Requests**: AI-generated descriptions and metadata

#### 🔒 Safety Features
- **Permission Levels**: Read-only, Safe-write, Full-access modes
- **Safety Snapshots**: Automatic tags before destructive operations
- **Auto-stashing**: Preserve uncommitted work
- **Protected Branches**: Prevent accidental changes to main/production
- **Validation Checks**: Clean working directory requirements

## Installation

1. **Clone and setup**:
```bash
git clone <repository-url>
cd git-manager-mcp
npm install
npm run build
```

2. **Configure Claude Desktop**:
Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "git-manager": {
      "command": "node",
      "args": ["/path/to/git-manager-mcp/dist/index.js"],
      "env": {
        "GIT_MANAGER_CONFIG": "{\"permissionLevel\":\"FULL_ACCESS\",\"safety\":{\"require_confirmation\":{\"destructive_operations\":true,\"branch_changes\":false,\"file_modifications\":false},\"backup_strategy\":{\"auto_stash\":true,\"create_snapshots\":true},\"validation\":{\"protected_branches\":[\"main\",\"master\",\"production\"]}}}"
      }
    }
  }
}
```

3. **Restart Claude Desktop**

## Usage Examples

### Example 1: "Fix This Bug"
```
You: "There's a TypeScript error in src/auth/login.ts on line 45. Fix it and commit."

Claude will:
1. Analyze the file and error
2. Show you a diff of the proposed fix
3. Apply the changes
4. Create a proper commit with conventional format
```

### Example 2: "Refactor This Code"
```
You: "The UserService class is too big. Split it into separate concerns."

Claude will:
1. Create a feature branch
2. Analyze the class structure
3. Extract separate service classes
4. Update all imports across the codebase
5. Commit with detailed description
```

### Example 3: "Ship This Feature"
```
You: "Create a PR for my dark mode feature."

Claude will:
1. Analyze branch changes
2. Generate comprehensive PR description
3. Add appropriate labels and reviewers
4. Create the pull request
```

## Configuration

### Permission Levels
- **READ_ONLY**: Analysis and search only
- **SAFE_WRITE**: Branches, commits, file modifications
- **FULL_ACCESS**: All operations including force operations

### Safety Configuration
```typescript
{
  "permissionLevel": "FULL_ACCESS",
  "safety": {
    "require_confirmation": {
      "destructive_operations": true,
      "branch_changes": false,
      "file_modifications": false,
      "git_commands": ["reset --hard", "clean -fd", "push --force"]
    },
    "backup_strategy": {
      "auto_stash": true,
      "create_snapshots": true,
      "max_rollback_depth": 10
    },
    "validation": {
      "check_tests_before_commit": false,
      "lint_before_commit": false,
      "require_clean_working_dir": false,
      "protected_branches": ["main", "master", "production"]
    }
  }
}
```

## Available Tools

### Read Operations
1. **analyse_repository** - Repository overview and health
2. **search_code** - Pattern search across codebase
3. **get_file_context** - File content with git information

### Write Operations
4. **create_branch** - Branch creation with safety checks
5. **modify_files** - Atomic file modifications
6. **commit_changes** - Conventional commits

### Advanced Operations
7. **refactor_code** - TypeScript-aware refactoring
8. **merge_branches** - Intelligent merging
9. **create_pull_request** - AI-enhanced PRs
10. **run_git_command** - Direct git command execution

## TypeScript Integration

The MCP includes sophisticated TypeScript integration for intelligent refactoring:

- **Symbol Analysis**: Find all references across the codebase
- **Type-aware Refactoring**: Safe symbol renaming with conflict detection
- **Import Management**: Automatic import updates
- **Function Extraction**: Smart parameter and return type inference

## Development

### Building
```bash
npm run build
```

### Development Mode
```bash
npm run dev
```

### Testing
```bash
npm test
```

### Linting
```bash
npm run lint
```

## Security Considerations

- All destructive operations can require confirmation
- Protected branches prevent accidental modifications
- Safety snapshots allow easy rollback
- Command whitelist/blacklist for git operations
- Automatic stashing preserves work-in-progress

## Requirements

- Node.js 18+
- Git 2.0+
- Claude Desktop
- Optional: GitHub CLI for PR creation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Architecture

```
You: "Fix the TypeScript errors in auth.ts and commit the changes"
                          ↓
              Claude Desktop (processes intent)
                          ↓
                 Git Manager MCP Server
                          ↓
         ┌────────────────┼────────────────┐
         ↓                ↓                ↓
    Read Git         Modify Files      Execute Git
    History          & Code            Commands
         ↓                ↓                ↓
         └────────────────┼────────────────┘
                          ↓
                 Your Repository
                (actual changes made)
```

This MCP transforms Claude into a powerful AI pair programmer that can understand your codebase, make intelligent changes, and manage your Git workflow - all through natural language conversation.