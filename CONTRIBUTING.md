# Contributing to Smartsheet MCP Server

Welcome to the Smartsheet MCP Server project! We're excited about your interest in contributing to this healthcare-focused Model Context Protocol server.

## Table of Contents

- [Overview](#overview)
- [Development Environment Setup](#development-environment-setup)
- [Code Contribution Process](#code-contribution-process)
- [Code Standards and Quality](#code-standards-and-quality)
- [Testing Requirements](#testing-requirements)
- [Documentation Guidelines](#documentation-guidelines)
- [Pull Request Process](#pull-request-process)
- [Healthcare Use Cases](#healthcare-use-cases)
- [Architecture Guidelines](#architecture-guidelines)
- [Troubleshooting](#troubleshooting)

## Overview

The Smartsheet MCP Server is a dual-language project (TypeScript and Python) that provides intelligent integration between AI systems and Smartsheet's collaboration platform, with specialized healthcare analytics capabilities.

### Project Structure

```
smartsheet-server/
├── src/                     # TypeScript MCP server
├── smartsheet_ops/          # Python operations package
├── tests/                   # TypeScript tests
├── smartsheet_ops/tests/    # Python tests
├── .github/workflows/       # CI/CD pipelines
└── docs/                    # Documentation
```

### Key Technologies

- **TypeScript**: MCP server implementation with Node.js
- **Python**: Smartsheet operations and healthcare analytics
- **Jest**: TypeScript testing framework
- **pytest**: Python testing framework
- **GitHub Actions**: CI/CD pipeline
- **Codecov**: Coverage analysis

## Development Environment Setup

### Prerequisites

- **Node.js** 16+ and npm
- **Python** 3.8+ (recommended: conda for environment management)
- **Git** for version control
- **VS Code** (recommended with extensions)

### Initial Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/terilios/smartsheet-server.git
   cd smartsheet-server
   ```

2. **Create conda environment** (recommended):
   ```bash
   conda create -n smartsheet_dev python=3.12 nodejs -y
   conda activate smartsheet_dev
   ```

3. **Install Node.js dependencies**:
   ```bash
   npm install
   ```

4. **Install Python dependencies**:
   ```bash
   cd smartsheet_ops
   pip install -e .
   pip install -r requirements-test.txt
   cd ..
   ```

5. **Build and verify setup**:
   ```bash
   npm run build
   npm run ci:check
   ```

### VS Code Setup

**Recommended Extensions**:
- TypeScript and JavaScript Language Features
- Python extension by Microsoft
- Jest extension for test support
- ESLint for code quality
- Prettier for code formatting
- GitLens for Git integration

**Workspace Settings** (`.vscode/settings.json`):
```json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "python.defaultInterpreterPath": "./venv/bin/python",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

## Code Contribution Process

### Branching Strategy

We use **GitHub Flow** for simplicity and rapid iteration:

1. **main**: Production-ready code
2. **feature/**: Feature development branches
3. **fix/**: Bug fix branches
4. **docs/**: Documentation updates

### Branch Naming Convention

- `feature/add-batch-analysis` - New features
- `fix/memory-leak-in-processor` - Bug fixes
- `docs/update-api-documentation` - Documentation
- `refactor/simplify-column-validation` - Code improvements

### Workflow Steps

1. **Create Issue**: Describe the problem or feature request
2. **Create Branch**: From main with descriptive name
3. **Develop**: Make changes following code standards
4. **Test**: Ensure all tests pass locally
5. **Submit PR**: Create pull request with detailed description
6. **Review**: Address feedback from code review
7. **Merge**: Maintainer merges after approval

## Code Standards and Quality

### TypeScript Standards

**ESLint Configuration**: Follow `.eslintrc.cjs` rules
- **Style**: Prettier for consistent formatting
- **Imports**: Prefer relative imports for local modules
- **Types**: Use strict TypeScript settings
- **Async/Await**: Prefer over promises chains
- **Error Handling**: Always handle errors explicitly

**Example TypeScript Code**:
```typescript
import { ToolHandler } from '../types';

export const getColumnMapTool: ToolHandler = async (request) => {
  try {
    const { sheet_id } = request.params.arguments as { sheet_id: string };
    
    if (!sheet_id) {
      throw new Error('sheet_id is required');
    }

    const result = await executeCliCommand('get_column_map', { sheet_id });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (error) {
    throw new Error(`Failed to get column map: ${error.message}`);
  }
};
```

### Python Standards

**Code Style**: Follow PEP 8 with Black formatter
- **Black**: Automatic code formatting
- **Flake8**: Linting and style enforcement  
- **MyPy**: Type checking (gradually typed)
- **Docstrings**: Google-style docstrings for public functions
- **Error Handling**: Explicit exception handling

**Example Python Code**:
```python
from typing import Dict, Any, List, Optional
import logging

logger = logging.getLogger(__name__)

class SmartsheetOperations:
    """Core operations for Smartsheet API interactions."""
    
    def get_column_map(self, sheet_id: str) -> Dict[str, Any]:
        """Retrieve column mapping and metadata for a sheet.
        
        Args:
            sheet_id: The Smartsheet ID to analyze
            
        Returns:
            Dictionary containing column mapping and metadata
            
        Raises:
            SmartsheetError: If API request fails
            ValueError: If sheet_id is invalid
        """
        try:
            sheet = self.client.Sheets.get_sheet(sheet_id)
            return self._build_column_map(sheet)
        except Exception as e:
            logger.error(f"Failed to get column map for sheet {sheet_id}: {e}")
            raise
```

### Healthcare Domain Standards

**Data Privacy**: Always consider healthcare data sensitivity
- **PHI Handling**: Never log patient identifiable information
- **Audit Trails**: Maintain comprehensive operation logs
- **Access Control**: Implement proper permission checking
- **Encryption**: Use encrypted communications

**Clinical Workflow**: Understand healthcare contexts
- **Clinical Decision Support**: Ensure AI analysis aids, not replaces clinical judgment
- **Regulatory Compliance**: Consider HIPAA, FDA, and other regulations
- **Workflow Integration**: Design for existing healthcare workflows

## Testing Requirements

### Test Coverage Requirements

**Minimum Coverage**:
- **TypeScript**: 60% for branches, functions, lines, statements
- **Python**: 80% overall coverage
- **New Features**: 90% coverage for new code
- **Bug Fixes**: Include regression tests

### Test Categories

**Unit Tests** (Required for all contributions):
- Test individual functions and methods
- Mock external dependencies
- Cover both success and error paths
- Use descriptive test names

**Integration Tests** (Required for new features):
- Test component interactions
- Validate MCP protocol compliance
- Test Python-TypeScript communication
- Cover real-world usage scenarios

**Healthcare Analytics Tests** (Required for AI features):
- Test Azure OpenAI integration
- Validate batch processing
- Test error handling and recovery
- Cover token counting and content chunking

### Running Tests Before Submission

**Essential Commands**:
```bash
# Pre-submission validation (REQUIRED)
npm run ci:check

# Full test suite
npm run test:all

# Coverage analysis
npm run coverage:clean
```

**Test Requirements for PRs**:
- All existing tests must pass
- New features must include comprehensive tests
- Coverage should not decrease
- No ignored or skipped tests without justification

## Documentation Guidelines

### Code Documentation

**TypeScript Documentation**:
- TSDoc comments for all public interfaces
- Inline comments for complex logic
- README updates for API changes

**Python Documentation**:
- Google-style docstrings for all public functions
- Type hints for function parameters and returns
- Module-level documentation

### User Documentation

**Update Requirements**:
- README.md for feature changes
- CLAUDE.md for development guidance
- API examples for new tools
- Healthcare use case documentation

**Documentation Standards**:
- Clear, concise language
- Practical examples with real data
- Healthcare context when applicable
- Markdown formatting consistency

## Pull Request Process

### PR Checklist

**Before Submitting**:
- [ ] Code follows style guidelines (ESLint, Black, Flake8)
- [ ] All tests pass locally (`npm run ci:check`)
- [ ] Coverage requirements met
- [ ] Documentation updated
- [ ] Healthcare considerations addressed
- [ ] Breaking changes documented

### PR Description Template

```markdown
## Description
Brief description of changes and motivation.

## Healthcare Impact
How does this change affect healthcare workflows or data handling?

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated  
- [ ] Healthcare analytics tests added (if applicable)
- [ ] Manual testing completed

## Coverage Report
Include coverage statistics for changed areas.

## Screenshots/Examples
Include examples of new functionality or API usage.
```

### Review Process

**Automatic Checks**:
- **CI Pipeline**: All 8 stages must pass
- **Code Quality**: ESLint, Black, Flake8, MyPy
- **Security**: npm audit, Python safety checks
- **Coverage**: Codecov analysis

**Manual Review**:
- **Code Quality**: Architecture, maintainability, healthcare considerations
- **Testing**: Test coverage, edge cases, healthcare scenarios
- **Documentation**: Completeness, accuracy, healthcare context
- **Security**: Data handling, authentication, healthcare privacy

### Review Criteria

**Code Review Standards**:
- **Functionality**: Does the code work as intended?
- **Architecture**: Does it fit the overall design?
- **Healthcare Compliance**: Does it handle healthcare data appropriately?
- **Testing**: Are tests comprehensive and meaningful?
- **Documentation**: Is it clear and complete?
- **Performance**: Are there performance implications?

## Healthcare Use Cases

### Clinical Research Analytics

**Contribution Guidelines**:
- Understand clinical trial workflow requirements
- Consider FDA validation and regulatory compliance  
- Design for multi-site collaboration
- Include audit trails for compliance

**Example Areas**:
- Protocol compliance scoring
- Patient data analysis
- Research impact assessment
- Clinical trial data processing

### Hospital Operations

**Contribution Guidelines**:
- Understand hospital workflow integration
- Consider patient safety implications
- Design for 24/7 operations
- Include error handling for critical systems

**Example Areas**:
- Resource utilization analysis
- Patient satisfaction scoring
- Department efficiency metrics
- Quality metrics tracking

### Healthcare Innovation

**Contribution Guidelines**:
- Focus on pediatric healthcare when applicable
- Consider implementation feasibility
- Include safety considerations
- Design for clinical value assessment

**Example Areas**:
- Innovation impact assessment
- Implementation feasibility analysis
- Clinical value scoring
- Research prioritization

## Architecture Guidelines

### MCP Server Architecture

**Tool Design Principles**:
- Each tool should have a single, clear purpose
- Input validation should be comprehensive
- Error handling should be informative
- Healthcare context should be preserved

**Resource Management**:
- Handle large datasets efficiently
- Implement proper timeout handling
- Use appropriate batch processing
- Monitor memory usage

### Python Operations Architecture

**API Integration**:
- Handle rate limiting gracefully
- Implement retry logic for transient failures
- Cache frequently accessed data
- Log operations for audit trails

**Healthcare Analytics**:
- Chunk content appropriately for AI processing
- Handle token limits and costs
- Implement progress tracking
- Provide detailed error reporting

### Integration Patterns

**TypeScript-Python Communication**:
- Use structured JSON for data exchange
- Handle subprocess errors gracefully
- Implement proper timeout management
- Validate data at boundaries

**Error Handling Strategy**:
- Propagate errors with context
- Log errors at appropriate levels
- Return user-friendly error messages
- Preserve stack traces for debugging

## Troubleshooting

### Common Development Issues

**TypeScript Issues**:
- **Build Errors**: Run `npm run typecheck` for detailed errors
- **Test Failures**: Check `tests/setup.ts` for mock configuration
- **Import Issues**: Verify relative import paths

**Python Issues**:
- **Import Errors**: Ensure `pip install -e .` was run
- **Test Failures**: Check `PYTHONPATH` and virtual environment
- **API Issues**: Verify Smartsheet API key configuration

**CI/CD Issues**:
- **Pipeline Failures**: Check GitHub Actions logs for specific stage failures
- **Coverage Issues**: Run `npm run coverage` locally to identify gaps
- **Timeout Issues**: Check for hanging processes or infinite loops

### Getting Help

**Resources**:
- **Documentation**: Check README.md, CLAUDE.md, TESTING.md
- **Issues**: Search existing issues before creating new ones
- **Discussions**: Use GitHub Discussions for questions
- **Code Review**: Request specific feedback in PR comments

**Contact**:
- **Maintainer**: @terilios
- **Issues**: GitHub Issues for bugs and feature requests
- **Discussions**: GitHub Discussions for questions and ideas

## Recognition

### Contributors

We recognize all contributors in our README.md and release notes. Contributions include:
- Code contributions (features, fixes, improvements)
- Documentation improvements
- Bug reports and feature requests
- Testing and quality assurance
- Healthcare domain expertise

### Healthcare Impact

We especially value contributions that advance healthcare applications:
- Clinical workflow integration
- Patient safety improvements
- Regulatory compliance features
- Healthcare innovation support
- Pediatric healthcare focus

## Code of Conduct

### Our Standards

We are committed to providing a welcoming and inclusive environment:
- **Respect**: Treat all participants with respect and consideration
- **Collaboration**: Work together constructively and professionally
- **Healthcare Focus**: Maintain awareness of healthcare data sensitivity
- **Quality**: Strive for excellence in code, documentation, and communication

### Healthcare Ethics

Given our healthcare focus, we especially emphasize:
- **Patient Privacy**: Always protect patient data and privacy
- **Clinical Safety**: Consider patient safety implications
- **Professional Standards**: Maintain healthcare professional standards
- **Regulatory Compliance**: Respect healthcare regulations and guidelines

## License

By contributing to this project, you agree that your contributions will be licensed under the MIT License that covers the project.

---

Thank you for contributing to the Smartsheet MCP Server! Your contributions help advance AI-powered healthcare automation and improve patient outcomes through better data management and analysis.