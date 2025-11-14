# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive debugging and refactoring improvements
- Path traversal validation for security
- Repository validation before operations
- JSDoc documentation for all public methods
- Enhanced error handling with detailed context
- Improved TypeScript integration features

### Fixed
- Entry point check in index.ts (import.meta.url comparison)
- GitHub CLI check to properly detect gh CLI
- Line changes splice bug in file modifications
- Conflict resolver smart resolution logic

### Changed
- Improved code organization with constants
- Enhanced search context with configurable line numbers
- Better README file detection

## [1.0.0] - 2024-11-14

### Added
- Initial release of Claude Git Manager MCP
- Full git repository management capabilities
- 12 core tools for git operations
- Multi-layered safety system with risk assessment
- Token-based confirmation for destructive operations
- Safety snapshots and rollback functionality
- TypeScript-aware code refactoring
- Branch protection and validation
- Conventional commits support
- Conflict resolution with multiple strategies
- Pull request creation via GitHub CLI
- Direct git command execution with safety checks

### Security
- Permission levels (READ_ONLY, SAFE_WRITE, FULL_ACCESS)
- Protected branch validation
- Dangerous command detection
- Auto-stash and snapshot creation
- Single-use confirmation tokens with expiry

[Unreleased]: https://github.com/Raoof128/claude-git-manager-mcp/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Raoof128/claude-git-manager-mcp/releases/tag/v1.0.0
