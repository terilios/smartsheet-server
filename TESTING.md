# Testing Documentation

This document provides comprehensive testing guidance for the Smartsheet MCP Server project, covering both TypeScript and Python components.

## Overview

The Smartsheet MCP Server uses a dual-language testing approach with Jest for TypeScript and pytest for Python, integrated through a comprehensive CI/CD pipeline.

**Current Test Status**: 54/54 TypeScript tests passing, 5/5 Python tests passing

## Test Architecture

### TypeScript Testing Framework (Jest)

**Configuration**: `jest.config.cjs`
- **Test Runner**: Jest with ts-jest preset
- **Environment**: Node.js environment
- **Coverage**: HTML, LCOV, JSON formats
- **Thresholds**: 60% minimum for branches, functions, lines, statements
- **Timeout**: 30 seconds per test
- **Workers**: 50% of available CPUs for optimal performance

**Test Structure**:
```
tests/
├── setup.ts                 # Test environment setup
├── unit/                    # Unit tests
│   ├── server.test.ts       # MCP server core functionality
│   ├── tools.test.ts        # Tool implementations
│   └── validation.test.ts   # Input validation
└── integration/             # Integration tests
    ├── mcp-protocol.test.ts # MCP protocol compliance
    └── python-cli.test.ts   # Python CLI integration
```

### Python Testing Framework (pytest)

**Configuration**: `smartsheet_ops/pytest.ini`
- **Test Runner**: pytest with coverage plugin
- **Coverage**: HTML, XML, JSON, LCOV formats
- **Thresholds**: 80% minimum overall coverage
- **Test Discovery**: Automatic test discovery in `tests/` directory
- **Markers**: Custom markers for test categorization

**Test Structure**:
```
smartsheet_ops/tests/
├── conftest.py                    # Shared fixtures and configuration
├── test_smartsheet.py            # Core Smartsheet operations
├── test_azure_openai_api.py      # Healthcare analytics
├── test_attachments.py           # Attachment management
├── test_discussions_history.py   # Discussions and history
├── test_cross_references.py      # Cross-sheet references
└── integration/                  # Integration test suite
    ├── test_end_to_end.py        # Full workflow testing
    └── test_cli_integration.py   # CLI integration testing
```

## Running Tests

### Quick Testing Commands

For daily development use:

```bash
# Pre-commit validation (recommended before every push)
npm run ci:check

# Watch mode for continuous testing during development
npm run test:watch

# Quick TypeScript unit tests
npm test

# Quick Python tests
npm run test:python
```

### Comprehensive Testing Commands

For thorough testing and CI preparation:

```bash
# Run all tests with coverage
npm run test:all

# Individual language test suites
npm run test:coverage        # TypeScript with coverage
npm run test:python:coverage # Python with coverage

# Coverage analysis and reporting
npm run coverage             # Combined coverage analysis
npm run coverage:open        # View coverage reports in browser
npm run coverage:clean       # Coverage without external uploads
```

### Coverage Commands

```bash
# Generate and view coverage reports
npm run coverage:view        # Open all coverage reports
npm run coverage:combined    # Combined TypeScript and Python coverage
npm run badges:update        # Generate coverage badges for README

# CI/CD specific coverage commands
npm run coverage:ci          # CI-optimized coverage (used in GitHub Actions)
npm run coverage:report      # Generate combined coverage report
```

### Quality Assurance Commands

```bash
# Code quality validation
npm run lint                 # ESLint for TypeScript
npm run lint:fix             # Auto-fix ESLint issues
npm run format               # Prettier code formatting
npm run typecheck            # TypeScript type validation

# Build validation
npm run build                # Build TypeScript
npm run watch                # Development build with watch mode
```

## Test Categories

### Unit Tests

**TypeScript Unit Tests** (54 tests):
- **MCP Server Core**: Tool registration, request handling, error management
- **Tool Implementations**: All 34 tools with comprehensive input/output validation
- **Validation Logic**: Parameter validation, schema compliance, error handling
- **Utility Functions**: Helper functions, data transformation, formatting

**Python Unit Tests** (5 core tests):
- **Core Operations**: Basic CRUD operations and API interactions
- **CLI Interface**: Command-line argument parsing and execution
- **Data Validation**: Input validation and type checking
- **Error Handling**: Exception handling and error reporting

### Integration Tests

**MCP Protocol Integration**:
- Server startup and protocol compliance
- Tool execution workflow validation
- Request/response format verification
- Error handling and timeout management

**Cross-Language Integration**:
- TypeScript to Python subprocess communication
- Data serialization and deserialization
- Environment variable handling
- Process lifecycle management

**Healthcare Analytics Integration**:
- Azure OpenAI API integration testing
- Batch processing workflow validation
- Token counting and content chunking
- Job management and status tracking

### Specialized Test Suites

**Attachment Management** (`test_attachments.py`):
- File upload and download operations
- Attachment metadata handling
- Permission validation
- Error scenarios (large files, invalid types)

**Discussions and History** (`test_discussions_history.py`):
- Discussion creation and management
- Comment threading and replies
- Cell history tracking
- User attribution and timestamps

**Cross-Sheet References** (`test_cross_references.py`):
- Formula analysis and dependency mapping
- Reference validation and broken link detection
- Cross-sheet formula generation (INDEX_MATCH, VLOOKUP, SUMIF, COUNTIF)
- Impact analysis across workspaces

## Test Data and Fixtures

### TypeScript Test Fixtures

**Mock Data**: Located in `tests/fixtures/`
- Sample Smartsheet responses
- MCP protocol messages
- Tool input/output examples
- Error response scenarios

**Test Setup**: `tests/setup.ts`
- Environment configuration
- Mock implementations
- Global test utilities
- Cleanup procedures

### Python Test Fixtures

**pytest Fixtures**: Defined in `smartsheet_ops/tests/conftest.py`
- Mock Smartsheet API responses
- Test data generators
- Database fixtures for analytics testing
- Authentication and configuration mocks

**Data Files**: Test data organized by functionality
- Column mapping examples
- Row data samples
- Healthcare analytics test cases
- Error scenario datasets

## Mocking Strategies

### TypeScript Mocking

**External Dependencies**:
- **Python Subprocess**: Mock `spawn` and `exec` calls
- **File System**: Mock file operations using Jest's `fs` mocks
- **Environment Variables**: Mock process.env using Jest environment setup

**MCP Protocol Mocking**:
- Request/response message mocking
- Protocol compliance validation
- Error scenario simulation

### Python Mocking

**Smartsheet API Mocking**:
- HTTP request/response mocking using `responses` library
- API rate limiting simulation
- Error response scenarios

**Azure OpenAI Mocking**:
- AI model response simulation
- Token usage calculation mocking
- Batch processing scenario testing

## Performance Testing

### Startup Performance

**Metrics Tracked**:
- Server initialization time
- Tool registration duration
- Python environment setup time
- Memory usage baseline

**Benchmarking**:
```bash
# Basic performance testing (included in CI)
time node build/index.js --help

# Memory usage monitoring
node --inspect build/index.js --help
```

### Load Testing

**Batch Processing Performance**:
- Large dataset processing benchmarks
- Memory usage during batch operations
- Azure OpenAI API rate limit handling
- Concurrent request processing

## Debugging Tests

### TypeScript Test Debugging

**VS Code Configuration**: `.vscode/launch.json`
```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Jest Tests",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

**Command Line Debugging**:
```bash
# Run specific test file with debugging
npm test -- --testPathPattern=server.test.ts --verbose

# Run tests with coverage and debugging output
npm run test:coverage -- --verbose --no-cache
```

### Python Test Debugging

**Debugging Commands**:
```bash
# Run specific test with verbose output
cd smartsheet_ops
pytest tests/test_smartsheet.py::test_get_column_map -v -s

# Run tests with debugging and coverage
pytest --cov=smartsheet_ops --cov-report=term-missing -v -s
```

**Using pdb for Interactive Debugging**:
```python
import pdb; pdb.set_trace()  # Add to test for breakpoint
```

## Test Environment Setup

### Local Development Environment

**Prerequisites**:
- Node.js 16+ and npm
- Python 3.8+ (recommended: conda environment)
- Git for version control

**Setup Steps**:
```bash
# 1. Create conda environment
conda create -n smartsheet_test python=3.12 nodejs -y
conda activate smartsheet_test

# 2. Install Node.js dependencies
npm install

# 3. Install Python dependencies
cd smartsheet_ops
pip install -e .
pip install -r requirements-test.txt
cd ..

# 4. Run initial test suite
npm run ci:check
```

### CI/CD Environment

**GitHub Actions Configuration**: `.github/workflows/ci.yml`
- **Matrix Testing**: Node.js 16, 18, 20 × Python 3.8, 3.9, 3.10, 3.11
- **Parallel Execution**: 8 concurrent jobs for optimal performance
- **Artifact Management**: Test reports and coverage data preserved
- **Notifications**: Automatic status updates and failure alerts

**Environment Variables Required**:
```bash
# For healthcare analytics testing
AZURE_OPENAI_API_KEY=test-key
AZURE_OPENAI_API_BASE=https://test.openai.azure.com/
AZURE_OPENAI_API_VERSION=2024-02-15-preview
AZURE_OPENAI_DEPLOYMENT=test-deployment

# For Smartsheet API testing  
SMARTSHEET_API_KEY=test-key

# For Python environment
PYTHON_PATH=/path/to/python
```

## Coverage Analysis

### Coverage Reports

**TypeScript Coverage** (`coverage/index.html`):
- Line-by-line coverage analysis
- Function and branch coverage
- Uncovered code identification
- Interactive HTML reports

**Python Coverage** (`smartsheet_ops/coverage/index.html`):
- Module-level coverage breakdown
- Missing line identification
- Conditional coverage analysis
- Detailed HTML reports

**Combined Coverage** (`coverage-combined/index.html`):
- Unified cross-language coverage
- Project-wide coverage metrics
- Comparative analysis
- Executive summary dashboard

### Coverage Thresholds

**TypeScript** (Jest configuration):
- **Branches**: 60% minimum
- **Functions**: 60% minimum  
- **Lines**: 60% minimum
- **Statements**: 60% minimum

**Python** (pytest-cov configuration):
- **Overall**: 80% minimum
- **Per-module**: Flexible based on module complexity
- **Missing lines**: Detailed reporting with context

### Improving Coverage

**Strategies for TypeScript**:
- Focus on error handling paths
- Test edge cases and boundary conditions
- Mock external dependencies thoroughly
- Add integration tests for complex workflows

**Strategies for Python**:
- Test exception handling scenarios
- Cover all CLI command variations
- Test API error responses
- Add healthcare analytics edge cases

## Continuous Integration

### Pipeline Stages

**Stage 1: Quality Checks** (Parallel)
- TypeScript: ESLint, TypeScript compiler, Prettier
- Python: Black, Flake8, MyPy

**Stage 2: Unit Testing** (Parallel Matrix)
- TypeScript: Jest across Node.js 16, 18, 20
- Python: pytest across Python 3.8, 3.9, 3.10, 3.11

**Stage 3: Coverage Analysis**
- Combined coverage reporting
- Codecov integration
- Coverage threshold enforcement

**Stage 4: Integration Testing**
- End-to-end workflow validation
- MCP protocol compliance
- Server startup verification

**Stage 5: Security and Performance**
- Dependency vulnerability scanning
- Performance regression detection
- Security linting with Bandit

### Pipeline Optimization

**Performance Optimizations**:
- **Parallel Execution**: Independent jobs run concurrently
- **Intelligent Caching**: Dependencies cached across runs
- **Conditional Execution**: Performance tests only on PRs
- **Matrix Optimization**: Strategic Node.js/Python version selection

**Cost Optimization**:
- **Resource Limits**: Memory and CPU constraints
- **Timeout Management**: Prevent hanging jobs
- **Artifact Cleanup**: Automatic cleanup of old artifacts
- **Selective Testing**: Smart test selection based on changes

## Troubleshooting Common Issues

### TypeScript Test Issues

**Jest Configuration Problems**:
- **ESM/CommonJS Conflicts**: Check `jest.config.cjs` module settings
- **TypeScript Compilation**: Verify `tsconfig.json` compatibility
- **Mock Issues**: Ensure proper mock setup in `tests/setup.ts`

**Common Errors**:
```bash
# Module not found errors
npm install --save-dev @types/jest @types/node

# TypeScript compilation errors in tests
npm run typecheck
npm run build
```

### Python Test Issues

**pytest Configuration Problems**:
- **Import Errors**: Verify `pip install -e .` for editable install
- **Coverage Issues**: Check `pytest.ini` and `.coveragerc` settings
- **Path Problems**: Ensure proper `PYTHONPATH` configuration

**Common Errors**:
```bash
# Missing dependencies
pip install -r requirements-test.txt

# Import path issues
export PYTHONPATH="${PYTHONPATH}:$(pwd)/smartsheet_ops"
```

### CI/CD Issues

**Pipeline Failures**:
- **Timeout Issues**: Check for hanging processes or infinite loops
- **Resource Constraints**: Monitor memory and CPU usage
- **Dependency Issues**: Verify package-lock.json and requirements.txt

**Environment Issues**:
- **Node.js Version Conflicts**: Use `.nvmrc` for version consistency
- **Python Environment**: Use conda for consistent environment management
- **Environment Variables**: Verify all required variables are set

## Best Practices

### Test Writing Guidelines

**TypeScript Tests**:
- Use descriptive test names that explain the expected behavior
- Follow AAA pattern: Arrange, Act, Assert
- Mock external dependencies completely
- Test both success and error scenarios
- Use type assertions for better TypeScript integration

**Python Tests**:
- Use pytest fixtures for common setup
- Test edge cases and boundary conditions
- Mock external API calls consistently
- Use parametrized tests for multiple input scenarios
- Include docstrings for complex test scenarios

### Test Maintenance

**Regular Maintenance Tasks**:
- Review and update test fixtures quarterly
- Remove or update deprecated test patterns
- Monitor test execution time and optimize slow tests
- Update mocks when external APIs change
- Review coverage reports for missed edge cases

**Code Review Guidelines**:
- All new features must include comprehensive tests
- Test coverage should not decrease without justification
- Mock strategies should be consistent across similar tests
- Integration tests should be included for complex features
- Performance implications of new tests should be considered

### Testing Anti-Patterns

**Avoid These Common Mistakes**:
- **Testing Implementation Details**: Focus on behavior, not internal structure
- **Brittle Tests**: Tests should not break with minor refactoring
- **Incomplete Mocking**: All external dependencies should be mocked
- **Slow Tests**: Optimize test execution time with proper mocking
- **Test Interdependence**: Tests should be independent and run in any order

## Resources and References

### Documentation Links
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [pytest Documentation](https://pytest.org/)
- [MCP Protocol Specification](https://modelcontextprotocol.io/docs)
- [Smartsheet API Documentation](https://smartsheet.redoc.ly/)

### Internal Resources
- [CLAUDE.md](./CLAUDE.md) - Claude Code development guidance
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guidelines
- [README.md](./README.md) - Project overview and setup

### Testing Tools
- **MCP Inspector**: Interactive tool testing
- **Codecov**: Coverage analysis and reporting
- **GitHub Actions**: CI/CD pipeline
- **VS Code**: Integrated debugging environment