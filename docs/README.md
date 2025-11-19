# Documentation Index

Welcome to the AI Code Review MCP Server documentation. This directory contains all project documentation organized by purpose.

## Quick Links

### For Users
- **[Usage Examples](guides/usage-example.md)** - Real-world examples and common use cases
- **[Project Summary](guides/project-summary.md)** - High-level overview and objectives

### For Developers
- **[Implementation Guide](guides/implementation-guide.md)** - Step-by-step implementation instructions
- **[Architecture](reference/architecture.md)** - System architecture and design patterns
- **[Specifications](reference/SPECIFICATIONS.md)** - Detailed technical specifications

### For Contributors
- **[Development History](history/development/)** - Implementation status and fix summaries
- **[Migration Guides](history/migration/)** - CLI migration documentation

## Directory Structure

```
docs/
|-- README.md                           # This file
|-- guides/                             # User and developer guides
|   |-- implementation-guide.md         # Implementation instructions
|   |-- usage-example.md                # Usage examples
|   \-- project-summary.md              # Project overview
|-- reference/                          # Technical reference
|   |-- architecture.md                 # System architecture
|   \-- SPECIFICATIONS.md               # Technical specifications
\-- history/                            # Development history
    |-- migration/                      # CLI migration docs
    |   |-- cli-auto-detection.md       # Auto-detection implementation
    |   |-- codex-cli-migration.md      # Codex CLI migration
    |   \-- migration-summary.md        # Overall migration summary
    \-- development/                    # Development notes
        |-- final-project-summary.md    # Final project status
        |-- fixes-summary.md            # Summary of all fixes
        |-- round2-fixes.md             # Second round fixes
        |-- round3-fixes.md             # Third round fixes
        \-- implementation-status.md    # Implementation status tracking
```

## Documentation by Audience

### I want to use this MCP server
Start here:
1. Main [README.md](../README.md) - Installation and basic setup
2. [Usage Examples](guides/usage-example.md) - See it in action
3. [Project Summary](guides/project-summary.md) - Understand what it does

### I want to contribute code
Start here:
1. [Architecture](reference/architecture.md) - Understand the system design
2. [Implementation Guide](guides/implementation-guide.md) - Follow development practices
3. [Specifications](reference/SPECIFICATIONS.md) - Technical requirements
4. [Development History](history/development/) - Learn from past iterations

### I want to understand the migration
Start here:
1. [Migration Summary](history/migration/migration-summary.md) - Overview
2. [Codex CLI Migration](history/migration/codex-cli-migration.md) - Codex-specific changes
3. [CLI Auto-detection](history/migration/cli-auto-detection.md) - Auto-detection feature

## Document Descriptions

### Guides

#### Implementation Guide
Comprehensive guide for implementing the MCP server, including:
- Project setup and dependencies
- Code structure and organization
- Testing strategies
- Deployment procedures

#### Usage Example
Real-world examples demonstrating:
- Basic code review operations
- Combined reviewer usage
- Advanced configuration
- Error handling

#### Project Summary
High-level overview covering:
- Project goals and objectives
- Key features
- Technology stack
- Current status

### Reference

#### Architecture
Detailed system architecture including:
- Component design
- Data flow diagrams
- Service interactions
- Design patterns used

#### Specifications
Technical specifications defining:
- API contracts
- Configuration schemas
- Input/output formats
- Error codes and handling

### History

#### Migration Documentation
Chronicles the CLI integration migration:
- Original implementation approach
- Migration rationale and decisions
- Step-by-step migration process
- Lessons learned

#### Development Notes
Historical development records:
- Implementation progress
- Bug fixes and patches
- Performance improvements
- Feature additions

## Keeping Documentation Updated

When contributing to this project:

1. **Update relevant docs** when making code changes
2. **Fix broken links** when moving or renaming files
3. **Add new docs** to this index when creating them
4. **Archive outdated docs** to history/ when superseded

## Documentation Standards

All documentation in this repository follows these guidelines:

- **Markdown format** - GitHub-flavored markdown (.md)
- **Clear headings** - Use hierarchical structure (H1 > H2 > H3)
- **Code examples** - Include syntax highlighting
- **Links** - Use relative paths for internal links
- **TOC** - Add table of contents for long documents
- **Updates** - Include last updated date when appropriate

## Need Help?

- **Issues**: [GitHub Issues](https://github.com/physics91/ai-code-review-mcp/issues)
- **Main README**: [Project README](../README.md)

---

**Last Updated**: 2025-01-19
