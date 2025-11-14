# Security Policy

## Supported Versions

We release patches for security vulnerabilities for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please follow these steps:

### DO NOT

- **Do not** open a public GitHub issue
- **Do not** disclose the vulnerability publicly until it has been addressed

### DO

1. **Email** the security concern to the maintainers (create a private security advisory on GitHub)
2. **Include** detailed information:
   - Type of vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if you have one)
3. **Wait** for acknowledgment (we aim to respond within 48 hours)
4. **Work with us** to verify and address the issue

### What to Expect

- **Acknowledgment** within 48 hours
- **Initial assessment** within 7 days
- **Regular updates** on progress
- **Credit** in release notes (unless you prefer to remain anonymous)
- **Coordinated disclosure** after fix is deployed

## Security Best Practices

### For Users

When using Claude Git Manager MCP, follow these security practices:

#### 1. Configuration Security

```json
{
  "permissionLevel": "READ_ONLY",  // Start with minimal permissions
  "safety": {
    "require_confirmation": {
      "destructive_operations": true,  // Always require confirmation
      "branch_changes": true,
      "file_modifications": true
    },
    "backup_strategy": {
      "auto_stash": true,              // Enable automatic backups
      "create_snapshots": true,
      "max_rollback_depth": 10
    },
    "validation": {
      "check_tests_before_commit": true,  // Run tests before commits
      "lint_before_commit": true,
      "require_clean_working_dir": true,
      "protected_branches": ["main", "master", "production", "develop"]
    }
  }
}
```

#### 2. Repository Access

- **Never** use on repositories with sensitive credentials
- **Always** review changes before committing
- **Use** protected branches for critical code
- **Enable** branch protection rules on GitHub
- **Limit** permission levels based on use case

#### 3. Confirmation Tokens

- Confirmation tokens expire after 5 minutes
- Tokens are single-use only
- Tokens are stored locally in `~/.git-manager-mcp/`
- Never share confirmation tokens

#### 4. Safety Snapshots

- Safety snapshots are created automatically
- Maximum of 10 snapshots retained
- Use `rollback_operation` to undo changes
- Snapshots include git tags and stash entries

### For Developers

When contributing to this project:

#### 1. Input Validation

- **Always** validate user input with Zod schemas
- **Never** trust file paths without validation
- **Check** for path traversal attempts
- **Sanitize** all inputs before use

#### 2. Command Injection Prevention

```typescript
// ❌ NEVER DO THIS
const result = await exec(`git ${userInput}`);

// ✅ DO THIS
const result = await git.raw(userInput.split(' '));
```

#### 3. Sensitive Data

- **Never** commit API keys, tokens, or credentials
- **Use** environment variables for sensitive config
- **Exclude** sensitive files in .gitignore
- **Review** diffs before committing

#### 4. Dependencies

- Keep dependencies up to date
- Review dependency changes
- Use `npm audit` regularly
- Pin dependency versions in package.json

## Security Features

### Built-in Protection

1. **Path Traversal Prevention**
   - All file paths validated before access
   - Paths must be within repository bounds

2. **Permission System**
   - Three permission levels (READ_ONLY, SAFE_WRITE, FULL_ACCESS)
   - Operations restricted by permission level

3. **Protected Branches**
   - Configurable protected branch list
   - Prevents direct commits to protected branches
   - Requires pull requests for changes

4. **Dangerous Command Detection**
   - Identifies potentially destructive commands
   - Requires confirmation tokens
   - Includes:
     - `reset --hard`
     - `clean -fd`
     - `push --force`
     - Custom dangerous commands

5. **Risk Assessment**
   - Five risk levels (SAFE, LOW, MEDIUM, HIGH, CRITICAL)
   - Automatic risk evaluation
   - Confirmation required for high-risk operations

6. **Safety Snapshots**
   - Automatic snapshot creation before operations
   - Git tags for rollback points
   - Stash integration for uncommitted changes

7. **Token-based Confirmation**
   - Cryptographically random tokens
   - Time-limited (5 minutes)
   - Single-use only
   - Persistent storage with cleanup

## Known Limitations

1. **GitHub CLI Dependency**
   - Pull request creation requires `gh` CLI
   - Must be installed and authenticated separately

2. **File System Access**
   - MCP has access to file system
   - Limited by OS permissions
   - Cannot access files outside repository without proper paths

3. **Git Operations**
   - All git operations run with user's permissions
   - Cannot bypass git hooks or protections

## Dependency Security

We regularly monitor dependencies for vulnerabilities:

```bash
# Check for vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix

# Update dependencies
npm update
```

### Dependency Review

Before adding dependencies, we consider:
- Maintenance status
- Security track record
- Community adoption
- License compatibility
- Bundle size impact

## Vulnerability Disclosure Timeline

1. **Day 0**: Vulnerability reported
2. **Day 2**: Acknowledgment sent
3. **Day 7**: Initial assessment complete
4. **Day 14-30**: Fix developed and tested
5. **Day 30-45**: Coordinated disclosure and patch release

## Security Updates

Security updates are:
- **Prioritized** over feature development
- **Tested** thoroughly before release
- **Documented** in CHANGELOG.md
- **Announced** in release notes
- **Tagged** with `security` label

## Contact

For security concerns, please:
1. Create a [GitHub Security Advisory](https://github.com/Raoof128/claude-git-manager-mcp/security/advisories/new)
2. Or email the maintainers (check package.json for contact)

## Hall of Fame

We recognize security researchers who responsibly disclose vulnerabilities:

<!-- Security researchers will be listed here -->

Thank you for helping keep Claude Git Manager MCP secure! 🔒
