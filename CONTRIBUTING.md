# Contributing to Claude Git Manager MCP

First off, thank you for considering contributing to Claude Git Manager MCP! It's people like you that make this tool better for everyone.

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the [existing issues](https://github.com/Raoof128/claude-git-manager-mcp/issues) to avoid duplicates.

When you create a bug report, please include:

- **Clear title and description**
- **Steps to reproduce** the issue
- **Expected behavior** vs **actual behavior**
- **Environment details** (Node version, OS, Claude Desktop version)
- **Logs or error messages** if applicable
- **Configuration** you're using (sanitize sensitive data)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

- **Use a clear and descriptive title**
- **Detailed description** of the proposed enhancement
- **Use cases** explaining why this would be useful
- **Examples** of how it would work
- **Potential implementation details** if you have ideas

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Make your changes** following our coding standards
3. **Add tests** if applicable
4. **Update documentation** if you're changing functionality
5. **Run the test suite** and ensure it passes
6. **Run the linter** and fix any issues
7. **Commit with conventional commit messages**
8. **Push to your fork** and submit a pull request

#### Pull Request Process

1. Update the CHANGELOG.md with details of changes
2. Update the README.md if needed
3. Ensure all CI checks pass
4. Request review from maintainers
5. Address any feedback
6. Wait for approval and merge

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- Git
- Claude Desktop (for testing)

### Installation

```bash
# Clone your fork
git clone https://github.com/YOUR-USERNAME/claude-git-manager-mcp.git
cd claude-git-manager-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run linter
npm run lint

# Format code
npm run format
```

### Project Structure

```
claude-git-manager-mcp/
├── src/
│   ├── index.ts                    # Main MCP server
│   ├── git-operations.ts           # Basic git operations
│   ├── advanced-operations.ts      # Advanced refactoring ops
│   ├── safety.ts                   # Safety validation
│   ├── typescript-integration.ts   # TS AST analysis
│   ├── confirmation-manager.ts     # Token management
│   ├── risk-manager.ts             # Risk assessment
│   ├── rollback-manager.ts         # Snapshot management
│   └── types.ts                    # Type definitions
├── tests/                          # Test files
├── examples/                       # Usage examples
└── docs/                           # Additional documentation
```

## Coding Standards

### TypeScript

- Use **TypeScript** for all code
- Enable **strict mode**
- Provide **JSDoc comments** for public APIs
- Use **meaningful variable names**
- Prefer **const** over **let**
- No **any** types without justification

### Code Style

We use ESLint and Prettier for code formatting:

```bash
# Check linting
npm run lint

# Auto-fix linting issues
npm run lint -- --fix

# Format code
npm run format
```

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `perf`: Performance improvements
- `ci`: CI/CD changes

**Examples:**
```
feat(refactoring): add inline variable operation

fix(security): prevent path traversal in file operations

docs(readme): update installation instructions
```

### Testing

- Write tests for new features
- Update tests for bug fixes
- Aim for high code coverage
- Test edge cases and error conditions

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for functions and classes
- Update INSTALLATION.md if setup changes
- Add examples for new features
- Keep CHANGELOG.md updated

## Git Workflow

### Branch Naming

- `feat/feature-name` - New features
- `fix/bug-description` - Bug fixes
- `docs/what-changed` - Documentation
- `refactor/what-changed` - Code refactoring
- `test/what-added` - Tests

### Commit Workflow

```bash
# Create a branch
git checkout -b feat/my-new-feature

# Make changes and commit
git add .
git commit -m "feat(scope): add amazing feature"

# Keep your branch updated
git fetch origin
git rebase origin/main

# Push to your fork
git push origin feat/my-new-feature
```

## Release Process

Maintainers will handle releases:

1. Update version in package.json
2. Update CHANGELOG.md
3. Create a git tag
4. Publish to npm
5. Create GitHub release

## Questions?

Feel free to:
- Open an issue for questions
- Join discussions in existing issues
- Reach out to maintainers

## Recognition

Contributors will be recognized in:
- README.md Contributors section
- GitHub contributors page
- Release notes

Thank you for contributing! 🎉
