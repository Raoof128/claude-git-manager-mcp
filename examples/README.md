# Configuration Examples

This directory contains example configurations for different use cases.

## Available Configurations

### Read-Only Configuration (`config-read-only.json`)

Use this for browsing and analyzing repositories without making changes.

**Permissions:**
- ✅ Analyze repository
- ✅ Search code
- ✅ Get file context
- ❌ Create branches
- ❌ Modify files
- ❌ Commit changes

**Safety:**
- No modifications allowed
- No snapshots needed

**Use Cases:**
- Exploring unfamiliar codebases
- Code review and analysis
- Learning from open-source projects

### Development Configuration (`config-development.json`)

Balanced configuration for active development with safety guardrails.

**Permissions:**
- ✅ Full access to all operations
- ⚠️ Confirmation required for destructive operations

**Safety:**
- Auto-stash enabled
- Safety snapshots enabled
- Protected branches: main, master
- Rollback depth: 10

**Use Cases:**
- Daily development work
- Feature development
- Bug fixes

### Production Configuration (`config-production.json`)

Maximum safety for production repositories.

**Permissions:**
- ✅ Safe write operations only
- ⚠️ Confirmation required for all modifications

**Safety:**
- Auto-stash enabled
- Safety snapshots enabled
- Protected branches: main, master, production, develop
- Tests required before commit
- Lint required before commit
- Clean working directory required

**Use Cases:**
- Working with critical repositories
- Team collaboration
- Production deployments

## Installation

1. Choose the configuration that matches your use case
2. Copy the configuration to your Claude Desktop config file
3. Update the path to point to your installation:
   ```
   "/path/to/claude-git-manager-mcp/dist/index.js"
   ```
4. Restart Claude Desktop

## Configuration Files

### macOS/Linux
```bash
~/.config/claude/claude_desktop_config.json
```

### Windows
```bash
%APPDATA%\Claude\claude_desktop_config.json
```

## Customization

### Permission Levels

- `read` - Read-only access
- `safe` - Safe write operations (branches, files, commits)
- `full` - Full access including advanced operations

### Safety Options

```json
{
  "require_confirmation": {
    "destructive_operations": true,  // reset, clean, force push
    "branch_changes": false,         // merge, rebase
    "file_modifications": false,     // modify, delete files
    "git_commands": []               // specific commands to confirm
  },
  "backup_strategy": {
    "auto_stash": true,              // auto-stash before operations
    "create_snapshots": true,        // create rollback points
    "max_rollback_depth": 10         // number of snapshots to keep
  },
  "validation": {
    "check_tests_before_commit": false,
    "lint_before_commit": false,
    "require_clean_working_dir": false,
    "protected_branches": ["main"]
  }
}
```

## Tips

1. **Start Conservative**: Begin with read-only or safe-write permissions
2. **Test First**: Try operations on a test repository first
3. **Use Snapshots**: Enable safety snapshots for easy rollback
4. **Protect Branches**: Always include main/master in protected branches
5. **Review Changes**: Use preview mode when available

## Troubleshooting

### Permission Denied

- Check your permission level
- Verify protected branch settings
- Check if confirmation token is required

### Snapshots Not Working

- Ensure `create_snapshots: true`
- Check git tag permissions
- Verify rollback depth setting

### Stash Conflicts

- Clean working directory before operations
- Use `require_clean_working_dir: true`
- Manually resolve stash conflicts if needed

## Advanced Usage

### Environment Variables

Set configuration via environment variable:

```bash
export GIT_MANAGER_CONFIG='{"permissionLevel":"full",...}'
```

### Multiple Configurations

Use different configurations for different repositories by maintaining separate Claude Desktop configs.

## Support

For issues or questions:
- Check [INSTALLATION.md](../INSTALLATION.md)
- Review [SECURITY.md](../SECURITY.md)
- Open an issue on GitHub
