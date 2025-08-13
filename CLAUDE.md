# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Smartsheet MCP (Model Context Protocol) server that enables automated operations on Smartsheet documents through a standardized interface. It bridges AI-powered automation tools with Smartsheet's collaboration platform, with specialized healthcare analytics capabilities including clinical research analytics, hospital operations, and healthcare innovation scoring.

**Current Version**: v0.3.0 - Now includes 34 tools with comprehensive cross-sheet reference management capabilities.

## Architecture

### Server Structure
- **TypeScript MCP Server** (`src/index.ts`): Main server implementing MCP protocol with both STDIO and HTTP transport modes
- **Python Operations Layer** (`smartsheet_ops/`): Python package handling Smartsheet API operations and batch analysis
- **Dual Transport Support**: STDIO for local CLI usage, HTTP for web-based clients

### Key Components
- **MCP Server** (`src/index.ts`): Handles tool registration, request routing, and error handling
- **CLI Operations** (`smartsheet_ops/smartsheet_ops/cli.py`): Python CLI for Smartsheet operations
- **Batch Analysis** (`smartsheet_ops/smartsheet_ops/batch_analysis.py`): Healthcare analytics with Azure OpenAI integration
- **Operations Core** (`smartsheet_ops/smartsheet_ops/__init__.py`): Core Smartsheet API operations

## Common Development Tasks

### Build and Run

```bash
# Install dependencies
npm install
cd smartsheet_ops && pip install -e . && cd ..

# Build TypeScript server
npm run build

# Watch mode for development
npm run watch

# Run MCP inspector
npm run inspector

# Start server with STDIO transport (default)
PYTHON_PATH=/path/to/python SMARTSHEET_API_KEY=your-key node build/index.js

# Start server with HTTP transport
PYTHON_PATH=/path/to/python SMARTSHEET_API_KEY=your-key node build/index.js --transport http --port 3000
```

### Environment Setup

Required environment variables:
- `SMARTSHEET_API_KEY`: Smartsheet API access token
- `PYTHON_PATH`: Path to Python executable with smartsheet_ops installed
- `AZURE_OPENAI_API_KEY`: Azure OpenAI key (for batch analysis features)
- `AZURE_OPENAI_API_BASE`: Azure OpenAI endpoint
- `AZURE_OPENAI_API_VERSION`: API version
- `AZURE_OPENAI_DEPLOYMENT`: Deployment name

### Working with Tools

The server provides 19 tools for Smartsheet operations. When implementing new tools:

1. Add tool definition in `setupToolHandlersForServer()` method in `src/index.ts`
2. Implement corresponding Python operation in `smartsheet_ops/smartsheet_ops/cli.py`
3. Add operation to choices list in `parse_args()` function
4. Handle the operation in the main() function

### Key Implementation Patterns

#### Tool Registration Pattern
```typescript
tools.push({
  name: 'tool_name',
  description: 'Tool description',
  inputSchema: {
    type: 'object',
    properties: {
      // Define parameters
    },
    required: ['required_params']
  }
});
```

#### Python CLI Operation Pattern
```python
elif args.operation == 'operation_name':
    # Parse input data
    data = json.loads(args.data)
    # Execute operation
    result = ops.operation_method(args.sheet_id, data)
    # Return JSON response
    print(json.dumps(result, indent=2))
```

## Phase 2 Features: Comments, Discussions & Cell History

### Discussion Management
- **Create Discussion**: Start threaded conversations on sheets or rows
- **Add Comments**: Reply to existing discussions with text and attachments
- **List Discussions**: Retrieve all discussions with optional comment inclusion
- **Get Comments**: Fetch all comments in a thread with attachment details
- **Delete Comments**: Remove specific comments (with proper permissions)

### Cell History & Audit Tracking  
- **Cell History**: Complete modification history for individual cells
- **Row History**: Timeline view of all changes across row columns
- **User Attribution**: Track who made changes and when
- **Formula Tracking**: History includes formula changes and calculations

### Cross-Sheet References (Phase 3 - v0.3.0)
- **Reference Analysis**: Identify and analyze all cross-sheet formulas in sheets
- **Dependency Mapping**: Find all sheets that reference a specific target sheet
- **Link Validation**: Check for broken cross-sheet references and suggest fixes
- **Formula Generation**: Create INDEX_MATCH, VLOOKUP, SUMIF, COUNTIF formulas programmatically
- **Impact Analysis**: Understand cross-sheet dependencies across workspaces
- **Custom Templates**: Support for custom formula patterns and advanced references

### Healthcare Use Cases Enabled
- **Clinical Notes**: Threaded discussions on patient records with full audit trails
- **Case Reviews**: Team collaboration with file attachments and change tracking
- **Compliance**: Complete audit history for regulatory requirements (HIPAA, FDA)
- **Research**: Collaborative discussions on research data with version history
- **Multi-Center Studies**: Cross-sheet references for linking patient data across hospital systems
- **Protocol Tracking**: Reference master protocol sheets from multiple study sites
- **Data Integration**: Link clinical trial data with regulatory submission sheets

### Error Handling

The server implements multi-layer error handling:
- **MCP Layer**: Protocol validation and formatted error responses
- **CLI Layer**: Argument validation and JSON error formatting  
- **Operations Layer**: Smartsheet API errors and data validation

Always wrap operations in try-catch blocks and return proper error codes.

### Adding New Features

When adding new functionality:
1. Check if it fits existing tool patterns (Read/Create/Update/Delete/Management)
2. Ensure proper validation at all layers
3. Maintain backward compatibility (see `get_sheet_info` alias for example)
4. Add appropriate error handling and logging
5. Update tool count in README.md features section
6. Consider healthcare analytics implications if applicable

### Healthcare Analytics Features

The server includes specialized healthcare analytics via Azure OpenAI:
- Batch processing with automatic chunking (3 rows per batch)
- Token-aware content handling for large text
- Background job processing with ThreadPoolExecutor
- Support for summarization, sentiment analysis, and custom scoring

When working with batch analysis, ensure proper job management and status tracking.

## Important Conventions

- **Column Operations**: Always validate formula references and dependencies before deletion/rename
- **Batch Operations**: Use 3-row batches for optimal Azure OpenAI performance
- **Row Positioning**: New rows are appended to the bottom of sheets (maintaining natural ordering)
- **Duplicate Detection**: Automatic duplicate checking before write operations
- **Resource Management**: 10MB buffer, 5-minute timeout for operations
- **Python Package**: Use editable install (`pip install -e .`) for development

## Testing and Quality Assurance

The project maintains comprehensive test coverage with automated CI/CD pipelines ensuring code quality and reliability.

### Test Infrastructure Status

**Current Test Status**: 54/54 TypeScript tests passing, 5/5 Python tests passing

### Testing Framework Architecture

**TypeScript Testing (Jest)**:
- **54 Unit Tests**: Complete coverage of MCP server implementation
- **Integration Tests**: Cross-component validation and protocol compliance
- **Coverage Reporting**: HTML, LCOV, JSON formats with 60% minimum threshold
- **Mock Strategy**: Comprehensive mocking of external dependencies and Python subprocess calls

**Python Testing (pytest)**:
- **5 Core Tests**: Essential operations and CLI functionality validation  
- **Specialized Test Suites**:
  - `test_attachments.py`: Attachment management operations
  - `test_discussions_history.py`: Discussion, comment, and cell history features
  - `test_cross_references.py`: Cross-sheet reference analysis and formula creation
  - `test_smartsheet.py`: Core Smartsheet API operations
  - `test_azure_openai_api.py`: Healthcare analytics and AI integration
- **Coverage Analysis**: 80% minimum with detailed line-by-line reporting

### Development Testing Workflow

**Daily Development Commands**:
```bash
# Essential pre-commit validation
npm run ci:check              # Comprehensive validation before push

# Continuous development testing  
npm run test:watch           # Auto-rerun tests on file changes
npm run coverage:clean       # Quick coverage without external uploads
npm test                     # Fast TypeScript unit tests
```

**Comprehensive Testing Commands**:
```bash
# Full test suite execution
npm run test:all             # All tests with coverage
npm run test:coverage        # TypeScript with detailed coverage
npm run test:python:coverage # Python with detailed coverage

# Quality assurance validation
npm run lint                 # ESLint TypeScript validation
npm run typecheck           # TypeScript strict type checking
npm run format              # Prettier code formatting
```

### CI/CD Integration

**8-Stage Pipeline**:
1. **Quality Gates**: ESLint, TypeScript, Black, Flake8, MyPy validation
2. **Matrix Testing**: Node.js 16/18/20, Python 3.8/3.9/3.10/3.11
3. **Coverage Analysis**: Combined TypeScript and Python reporting
4. **Integration Validation**: MCP protocol and server startup testing
5. **Security Scanning**: npm audit, Python safety, Bandit analysis
6. **Performance Testing**: Startup time and benchmark validation
7. **Build Verification**: Artifact creation and deployment readiness
8. **Notification System**: Comprehensive status reporting

### Testing Tools and Utilities

**MCP Inspector**: Interactive tool testing and protocol validation
```bash
npm run inspector            # Launch MCP Inspector for manual tool testing
```

**Direct CLI Testing**: Python operations testing
```bash
cd smartsheet_ops
python -m smartsheet_ops.cli --operation get_column_map --sheet-id [id]
```

**Coverage Visualization**:
```bash
npm run coverage:view        # Open all coverage reports in browser
npm run coverage:combined    # View unified coverage dashboard
```

### Quality Standards and Enforcement

**Code Quality Requirements**:
- **TypeScript**: ESLint rules, strict type checking, Prettier formatting
- **Python**: Black formatting, Flake8 linting, MyPy type validation
- **Security**: Regular vulnerability scanning with automated alerts
- **Performance**: Startup time monitoring and regression detection

**Coverage Thresholds**:
- **TypeScript**: 60% minimum (branches, functions, lines, statements)
- **Python**: 80% overall with detailed reporting
- **Combined**: Unified reporting with Codecov integration

**Automated Quality Gates**: All quality checks must pass before merge, with automatic PR status updates and detailed failure reporting.