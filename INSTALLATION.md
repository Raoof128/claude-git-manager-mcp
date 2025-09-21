# Installation Guide for Git Manager MCP

## Quick Setup

### 1. Build the Project
```bash
cd /Users/raoof.r12/Desktop/Raouf/Github_MCP
npm install
npm run build
```

### 2. Configure Claude Desktop

**macOS**: Edit `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: Edit `%APPDATA%/Claude/claude_desktop_config.json`

Add this configuration:

```json
{
  "mcpServers": {
    "git-manager": {
      "command": "node",
      "args": ["/Users/raoof.r12/Desktop/Raouf/Github_MCP/dist/index.js"],
      "env": {
        "GIT_MANAGER_CONFIG": "{\"permissionLevel\":\"FULL_ACCESS\",\"safety\":{\"require_confirmation\":{\"destructive_operations\":true,\"branch_changes\":false,\"file_modifications\":false,\"git_commands\":[\"reset --hard\",\"clean -fd\",\"push --force\"]},\"backup_strategy\":{\"auto_stash\":true,\"create_snapshots\":true,\"max_rollback_depth\":10},\"validation\":{\"check_tests_before_commit\":false,\"lint_before_commit\":false,\"require_clean_working_dir\":false,\"protected_branches\":[\"main\",\"master\",\"production\"]}}}"
      }
    }
  }
}
```

### 3. Restart Claude Desktop

### 4. Test the Installation

Open Claude Desktop and try these commands:

1. **Basic repository analysis**:
   ```
   Analyze this repository: /path/to/your/git/repo
   ```

2. **Search for code patterns**:
   ```
   Search for "function" in all TypeScript files in /path/to/your/repo
   ```

3. **Get file context**:
   ```
   Show me the context for src/index.ts including git blame
   ```

## Configuration Options

### Permission Levels
- `READ_ONLY`: Only analysis and search operations
- `SAFE_WRITE`: Basic file modifications and commits
- `FULL_ACCESS`: All operations including destructive commands

### Safety Features
- **Auto-stashing**: Automatically stash uncommitted changes before operations
- **Snapshots**: Create git tags before destructive operations
- **Protected branches**: Prevent modifications to specified branches
- **Confirmation requirements**: Require explicit confirmation for dangerous operations

### Example Configurations

#### Conservative Setup (Recommended for Production)
```json
{
  "permissionLevel": "SAFE_WRITE",
  "safety": {
    "require_confirmation": {
      "destructive_operations": true,
      "branch_changes": true,
      "file_modifications": true
    },
    "backup_strategy": {
      "auto_stash": true,
      "create_snapshots": true,
      "max_rollback_depth": 20
    },
    "validation": {
      "check_tests_before_commit": true,
      "lint_before_commit": true,
      "require_clean_working_dir": true,
      "protected_branches": ["main", "master", "production", "staging"]
    }
  }
}
```

#### Development Setup (Maximum Freedom)
```json
{
  "permissionLevel": "FULL_ACCESS",
  "safety": {
    "require_confirmation": {
      "destructive_operations": false,
      "branch_changes": false,
      "file_modifications": false
    },
    "backup_strategy": {
      "auto_stash": false,
      "create_snapshots": false,
      "max_rollback_depth": 5
    },
    "validation": {
      "check_tests_before_commit": false,
      "lint_before_commit": false,
      "require_clean_working_dir": false,
      "protected_branches": []
    }
  }
}
```

## Troubleshooting

### Common Issues

1. **"repo_path is required" error**
   - Ensure you provide a valid repository path in your commands
   - Example: "Analyze the repository at /Users/username/my-project"

2. **Permission denied errors**
   - Check that Claude has access to the directory
   - Verify the permission level in your configuration

3. **Git command failures**
   - Ensure git is installed and accessible from command line
   - Check that the repository is properly initialized

4. **TypeScript integration not working**
   - Ensure there's a tsconfig.json in the repository
   - Check that TypeScript files are properly formatted

### Debug Mode

To enable debug logging, set the NODE_ENV environment variable:

```json
{
  "mcpServers": {
    "git-manager": {
      "command": "node",
      "args": ["/Users/raoof.r12/Desktop/Raouf/Github_MCP/dist/index.js"],
      "env": {
        "NODE_ENV": "development",
        "GIT_MANAGER_CONFIG": "..."
      }
    }
  }
}
```

## Advanced Usage

### Working with Multiple Repositories

You can use the MCP with multiple repositories by specifying different repo_path values:

```
Analyze repository A at /path/to/repo-a
Search for "TODO" in repository B at /path/to/repo-b
```

### Integration with CI/CD

The MCP can be used to:
- Create feature branches for automated fixes
- Generate pull requests with AI-written descriptions
- Perform automated refactoring across large codebases

### Custom Git Workflows

Examples of complex workflows:

1. **Feature Development**:
   ```
   Create a new branch called "feature/user-auth" from main
   Modify the authentication files to add OAuth support
   Commit the changes with type "feat" and scope "auth"
   Create a pull request for the feature
   ```

2. **Bug Fixes**:
   ```
   Search for the error "Cannot read property" in all JavaScript files
   Fix the null pointer exception in src/utils/helper.js
   Commit with type "fix" and a descriptive message
   ```

3. **Refactoring**:
   ```
   Rename the function "getData" to "fetchUserData" across the entire codebase
   Extract the validation logic from UserService into a separate ValidationService
   Update all imports to use the new structure
   ```

## Security Considerations

- Never commit sensitive information (API keys, passwords)
- Use protected branches for production code
- Enable confirmation for destructive operations
- Regularly review git history for unauthorized changes
- Consider using signed commits for important repositories

## Performance Tips

- Use file type filters when searching large codebases
- Limit repository analysis to necessary statistics
- Consider excluding node_modules and build directories from searches
- Use preview mode for large file modifications before applying