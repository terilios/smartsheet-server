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

## Development

1. Create conda environment:

```bash
conda create -n smartsheet_dev python=3.12
conda activate smartsheet_dev
```

2. Install in development mode:

```bash
pip install -e .
```

3. Run tests:

```bash
python -m pytest
```

## License

MIT License - see LICENSE file for details.
