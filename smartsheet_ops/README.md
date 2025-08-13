# Smartsheet Operations Package

Python package providing healthcare analytics operations for Smartsheet integration.

## Installation

```bash
pip install -e .
```

## Configuration

Create a `.env` file with the following variables:

```env
# Smartsheet API Configuration
SMARTSHEET_API_KEY=your-smartsheet-api-key

# Azure OpenAI Configuration
AZURE_OPENAI_API_KEY=your-azure-openai-key
AZURE_OPENAI_API_BASE=your-azure-openai-endpoint
AZURE_OPENAI_API_VERSION=your-api-version
AZURE_OPENAI_DEPLOYMENT=your-deployment-name
```

## Usage

### Command Line Interface

```bash
# Get column mapping
smartsheet-ops --api-key "your-key" --sheet-id "your-sheet" --operation get_column_map

# Start batch analysis
smartsheet-ops --api-key "your-key" --sheet-id "your-sheet" --operation start_analysis --data '{
  "type": "custom",
  "sourceColumns": ["Ideas"],
  "targetColumn": "Score",
  "customGoal": "Score each idea based on healthcare impact"
}'
```

### Python API

```python
from smartsheet_ops import SmartsheetOperations

# Initialize client
ops = SmartsheetOperations(api_key="your-key")

# Get column mapping
result = ops.get_sheet_info(sheet_id="your-sheet")

# Add rows
result = ops.add_rows(
    sheet_id="your-sheet",
    row_data=[{"Column1": "Value1"}],
    column_map={"Column1": "col-id"}
)
```

## Features

### Batch Analysis

- Clinical note summarization
- Patient feedback sentiment analysis
- Protocol compliance scoring
- Research impact assessment
- Pediatric alignment scoring

### Data Operations

- Row management (add/update/delete)
- Column management
- Bulk updates
- Search capabilities

### Healthcare Focus

- Specialized scoring systems
- Clinical data processing
- Research analytics
- Patient feedback analysis

## Development and Testing

### Environment Setup

1. Create conda environment:

```bash
conda create -n smartsheet_dev python=3.12
conda activate smartsheet_dev
```

2. Install in development mode:

```bash
pip install -e .
pip install -r requirements-test.txt
```

### Running Tests

**Current Test Status**: 5/5 core tests passing

```bash
# Run all tests
python -m pytest

# Run tests with coverage
python -m pytest --cov=smartsheet_ops --cov-report=html:coverage --cov-report=term-missing

# Run specific test categories
pytest tests/test_smartsheet.py -v                    # Core operations
pytest tests/test_azure_openai_api.py -v            # Healthcare analytics
pytest tests/test_attachments.py -v                 # Attachment management
pytest tests/test_discussions_history.py -v         # Discussions and history
pytest tests/test_cross_references.py -v            # Cross-sheet references
```

### Quality Assurance

The package follows strict quality standards:

```bash
# Code formatting
black smartsheet_ops/ tests/

# Linting
flake8 smartsheet_ops/ tests/

# Type checking
mypy smartsheet_ops/
```

### CI/CD Integration

This package is integrated with the main project's GitHub Actions pipeline:
- **Matrix Testing**: Python 3.8, 3.9, 3.10, 3.11
- **Coverage Analysis**: 80% minimum coverage with detailed reporting
- **Quality Gates**: Black, Flake8, MyPy validation

## License

MIT License - see LICENSE file for details.
