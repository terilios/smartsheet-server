# Smartsheet MCP Server

A Model Context Protocol (MCP) server that provides seamless integration with Smartsheet, enabling automated operations on Smartsheet documents through a standardized interface. This server bridges the gap between AI-powered automation tools and Smartsheet's powerful collaboration platform.

## Overview

The Smartsheet MCP Server is designed to facilitate intelligent interactions with Smartsheet, providing a robust set of tools for document management, data operations, and column customization. It serves as a critical component in automated workflows, enabling AI systems to programmatically interact with Smartsheet data while maintaining data integrity and enforcing business rules.

### Key Benefits

- **Intelligent Integration**: Seamlessly connects AI systems with Smartsheet's collaboration platform
- **Data Integrity**: Enforces validation rules and maintains referential integrity across operations
- **Formula Management**: Preserves and updates formula references automatically
- **Flexible Configuration**: Supports various column types and complex data structures
- **Error Resilience**: Implements comprehensive error handling and validation at multiple layers
- **Healthcare Analytics**: Specialized analysis capabilities for clinical and research data
- **Batch Processing**: Efficient handling of large healthcare datasets
- **Custom Scoring**: Flexible scoring systems for healthcare initiatives and research

### Use Cases

1. **Clinical Research Analytics**

   - Protocol compliance scoring
   - Patient data analysis
   - Research impact assessment
   - Clinical trial data processing
   - Automated research note summarization

2. **Hospital Operations**

   - Resource utilization analysis
   - Patient satisfaction scoring
   - Department efficiency metrics
   - Staff performance analytics
   - Quality metrics tracking

3. **Healthcare Innovation**

   - Pediatric alignment scoring
   - Innovation impact assessment
   - Research prioritization
   - Implementation feasibility analysis
   - Clinical value assessment

4. **Automated Document Management**

   - Programmatic sheet structure modifications
   - Dynamic column creation and management
   - Automated data validation and formatting

5. **Data Operations**

   - Bulk data updates with integrity checks
   - Intelligent duplicate detection
   - Formula-aware modifications

6. **System Integration**
   - AI-driven sheet customization
   - Automated reporting workflows
   - Cross-system data synchronization

### Integration Points

The server integrates with:

- Smartsheet API for data operations
- MCP protocol for standardized communication
- Local development tools via stdio interface
- Monitoring systems through structured logging

## Features

### Tools (19 Available)

1. `get_column_map` (Read)

   - Retrieves column mapping and sample data from a Smartsheet
   - Provides detailed column metadata including:
     - Column types (system columns, formulas, picklists)
     - Validation rules
     - Format specifications
     - Auto-number configurations
   - Returns sample data for context
   - Includes usage examples for writing data

2. `get_sheet_info` (Read - Alias)

   - Alias for `get_column_map` providing identical functionality
   - Maintains backward compatibility with existing integrations

3. `smartsheet_write` (Create)

   - Writes new rows to Smartsheet with intelligent handling of:
     - System-managed columns
     - Multi-select picklist values
     - Formula-based columns
   - Implements automatic duplicate detection
   - **Appends new rows to the bottom of the sheet** (after existing entries)
   - Returns detailed operation results including row IDs

4. `smartsheet_update` (Update)

   - Updates existing rows in a Smartsheet
   - Supports partial updates (modify specific fields)
   - Maintains data integrity with validation
   - Handles multi-select fields consistently
   - Returns success/failure details per row

5. `smartsheet_delete` (Delete)

   - Deletes rows from a Smartsheet
   - Supports batch deletion of multiple rows
   - Validates row existence and permissions
   - Returns detailed operation results

6. `smartsheet_search` (Search)

   - Performs advanced search across sheets
   - Supports multiple search modes:
     - Text search with regex support
     - Exact value matching for PICKLIST columns
     - Case-sensitive and whole word options
   - Column-specific search capabilities
   - Returns:
     - Matched row IDs (primary result)
     - Detailed match information
     - Search metadata and statistics

7. `smartsheet_add_column` (Column Management)

   - Adds new columns to a Smartsheet
   - Supports all column types:
     - TEXT_NUMBER
     - DATE
     - CHECKBOX
     - PICKLIST
     - CONTACT_LIST
   - Configurable options:
     - Position index
     - Validation rules
     - Formula definitions
     - Picklist options
   - Enforces column limit (400) with validation
   - Returns detailed column information

8. `smartsheet_delete_column` (Column Management)

   - Safely deletes columns with dependency checking
   - Validates formula references before deletion
   - Prevents deletion of columns used in formulas
   - Returns detailed dependency information
   - Supports force deletion option

9. `smartsheet_rename_column` (Column Management)

   - Renames columns while preserving relationships
   - Updates formula references automatically
   - Maintains data integrity
   - Validates name uniqueness
   - Returns detailed update information

10. `smartsheet_bulk_update` (Conditional Updates)

    - Performs conditional bulk updates based on rules
    - Supports complex condition evaluation:
      - Multiple operators (equals, contains, greaterThan, etc.)
      - Type-specific comparisons (text, dates, numbers)
      - Empty/non-empty checks
    - Batch processing with configurable size
    - Comprehensive error handling and rollback
    - Detailed operation results tracking

11. `get_all_row_ids` (Utility)

    - Retrieves all row IDs from a Smartsheet
    - Useful for batch operations and data analysis
    - Returns complete list of row identifiers
    - Supports large sheets efficiently

12. `start_batch_analysis` (Healthcare Analytics)

    - Processes entire sheets or selected rows with AI analysis
    - Supports multiple analysis types:
      - Summarization of clinical notes
      - Sentiment analysis of patient feedback
      - Custom scoring for healthcare initiatives
      - Research impact assessment
    - Features:
      - Automatic batch processing (3 rows per batch for optimal performance)
      - Progress tracking and status monitoring
      - Error handling with detailed reporting
      - Customizable analysis goals via Azure OpenAI
      - Support for multiple source columns
      - Token-aware content chunking for large text

13. `get_job_status` (Analysis Monitoring)

    - Tracks batch analysis progress
    - Provides detailed job statistics:
      - Total rows to process
      - Processed row count
      - Failed row count
      - Processing timestamps
    - Real-time status updates
    - Comprehensive error reporting

14. `cancel_batch_analysis` (Job Control)

    - Cancels running batch analysis jobs
    - Graceful process termination
    - Maintains data consistency
    - Returns final job status

15. `list_workspaces` (Workspace Management)

    - Lists all accessible workspaces
    - Returns workspace IDs, names, and permalinks
    - Includes access level information
    - Supports organization-wide workspace discovery

16. `get_workspace` (Workspace Management)

    - Retrieves detailed workspace information
    - Returns contained sheets, folders, reports, and dashboards
    - Provides access level and permission details
    - Supports workspace content exploration

17. `create_workspace` (Workspace Management)

    - Creates a new workspace with specified name
    - Returns the new workspace ID and confirmation
    - Enables programmatic workspace organization
    - Supports migration from deprecated folder endpoints

18. `create_sheet_in_workspace` (Workspace Management)

    - Creates a new sheet directly in a workspace
    - Supports all column types and configurations
    - Returns the new sheet ID and details
    - Enables programmatic sheet creation and organization

19. `list_workspace_sheets` (Workspace Management)
    - Lists all sheets in a specific workspace
    - Returns sheet IDs, names, and permalinks
    - Includes creation and modification timestamps
    - Supports workspace content discovery

### Resources (4 Static + 5 Dynamic Templates)

The server provides both static resources and dynamic resource templates for enhanced data access and contextual information.

#### Static Resources

1. `smartsheet://templates/project-plan` - **Project Plan Template**

   - Pre-built project plan template with best practices
   - Includes optimal column structure for task management
   - Provides guidance on dependencies and resource allocation

2. `smartsheet://templates/task-tracker` - **Task Tracker Template**

   - Simple task tracking template for team collaboration
   - Focused on progress monitoring without complex dependencies
   - Ideal for agile teams and simple workflows

3. `smartsheet://schemas/column-types` - **Column Types Reference**

   - Complete reference of all supported Smartsheet column types
   - Includes API support level for each type (full, limited, read-only)
   - Essential for understanding column capabilities and limitations

4. `smartsheet://best-practices/formulas` - **Formula Best Practices**
   - Common formula patterns and calculation examples
   - Best practices for performance and maintainability
   - Cross-sheet reference guidance

#### Dynamic Resource Templates

1. `smartsheet://{sheet_id}/summary` - **Sheet Summary**

   - Auto-generated summary with key metrics and health status
   - Progress indicators and completion statistics
   - Real-time analysis of sheet data

2. `smartsheet://{sheet_id}/gantt-data` - **Gantt Chart Data**

   - Standardized Gantt chart data format for visualization
   - Timeline data optimized for project management tools
   - Dependency relationships and critical path information

3. `smartsheet://{workspace_id}/overview` - **Workspace Overview**

   - Comprehensive overview of workspace contents
   - All sheets, reports, and dashboards in structured format
   - Access levels and organizational hierarchy

4. `smartsheet://{sheet_id}/dependencies` - **Dependency Map**

   - Visual dependency mapping for project sheets
   - Task relationships and critical path analysis
   - Bottleneck identification and optimization suggestions

5. `smartsheet://{sheet_id}/health-report` - **Sheet Health Report**
   - Health analysis identifying data quality issues
   - Missing data detection and broken formula identification
   - Optimization opportunities and recommendations

### Prompts (6 Available)

Intelligent prompt templates that provide guided assistance for common Smartsheet operations and analysis.

1. `create_project_plan` - **Project Plan Creation Guide**

   - Guided project plan creation with best practices
   - Template suggestions based on project type and duration
   - Work breakdown structure recommendations

2. `analyze_project_status` - **Project Health Analysis**

   - Comprehensive project health analysis with recommendations
   - Timeline adherence and resource utilization insights
   - Risk identification and mitigation strategies

3. `optimize_workflow` - **Workflow Optimization**

   - Suggestions for improving sheet structure and workflows
   - Automation opportunities and efficiency improvements
   - User experience enhancement recommendations

4. `generate_insights` - **Data Insights Extraction**

   - Extract key insights and patterns from sheet data
   - Trend analysis and anomaly detection
   - Actionable intelligence and decision support

5. `create_dashboard_summary` - **Executive Dashboard Creation**

   - Generate executive summaries from multiple sheets
   - High-level KPI tracking and strategic insights
   - Leadership-focused reporting and recommendations

6. `setup_conditional_formatting` - **Conditional Formatting Guide**
   - Step-by-step conditional formatting setup
   - Visual data representation best practices
   - Status indicators and progress tracking configuration

### Key Capabilities

- **Column Type Management**

  - Handles system column types (AUTO_NUMBER, CREATED_DATE, etc.)
  - Supports formula parsing and dependency tracking
  - Manages picklist options and multi-select values
  - Comprehensive column operations (add, delete, rename)
  - Formula reference preservation and updates

- **Data Validation**

  - Automatic duplicate detection
  - Column type validation
  - Data format verification
  - Column dependency analysis
  - Name uniqueness validation

- **Search Functionality**

  - Advanced search capabilities
  - Type-aware searching:
    - Exact matching for PICKLIST values
    - Pattern matching for text fields
    - Numeric comparisons
  - Configurable search options:
    - Case sensitivity
    - Whole word matching
    - Column filtering
  - Comprehensive results:
    - Row IDs for matched rows
    - Detailed match context
    - Search statistics

- **Metadata Handling**

  - Extracts and processes column metadata
  - Handles validation rules
  - Manages format specifications
  - Tracks formula dependencies
  - Maintains column relationships

- **Healthcare Analytics**

  - Clinical note summarization using Azure OpenAI
  - Patient feedback sentiment analysis
  - Protocol compliance scoring
  - Research impact assessment
  - Resource utilization analysis
  - Custom analysis with optimized prompt generation

- **Batch Processing**

  - Automatic row batching (3 rows per batch for optimal performance)
  - Progress tracking and monitoring
  - Error handling and recovery
  - Customizable processing goals
  - Multi-column analysis support
  - Token-aware content chunking for large text
  - Background job processing with ThreadPoolExecutor

- **Job Management**
  - Real-time status monitoring
  - Detailed progress tracking
  - Error reporting and logging
  - Job cancellation support
  - Batch operation controls

## Setup

### Prerequisites

- Node.js and npm
- Conda (for environment management)
- Smartsheet API access token
- Azure OpenAI API access (for batch analysis features)

### Environment Setup

1. Create a dedicated conda environment:

```bash
conda create -n cline_mcp_env python=3.12 nodejs -y
conda activate cline_mcp_env
```

2. Install Node.js dependencies:

```bash
npm install
```

3. Install Python dependencies:

```bash
cd smartsheet_ops
pip install -e .
cd ..
```

Note: The Python package includes dependencies for:

- `smartsheet-python-sdk` - Smartsheet API client
- `python-dotenv` - Environment variable management
- `openai` - Azure OpenAI integration
- `tiktoken` - Token counting for AI analysis

4. Build the TypeScript server:

```bash
npm run build
```

### Configuration

The server supports two transport modes:

- **STDIO Transport** (default): For local development and CLI usage
- **HTTP Transport**: For web-based clients and network access

#### 1. Get Your Smartsheet API Key

1. Log in to [Smartsheet](https://app.smartsheet.com)
2. Go to Account → Personal Settings → API Access
3. Generate a new access token

#### 2. Configure for STDIO Transport (Cline/Local)

The configuration path depends on your operating system:

**macOS**:

```
~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json
```

**Windows**:

```
%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json
```

**Linux**:

```
~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json
```

```json
{
  "mcpServers": {
    "smartsheet": {
      "command": "/Users/[username]/anaconda3/envs/cline_mcp_env/bin/node",
      "args": [
        "/path/to/smartsheet-server/build/index.js",
        "--transport",
        "stdio"
      ],
      "env": {
        "PYTHON_PATH": "/Users/[username]/anaconda3/envs/cline_mcp_env/bin/python3",
        "SMARTSHEET_API_KEY": "your-api-key",
        "AZURE_OPENAI_API_KEY": "your-azure-openai-key",
        "AZURE_OPENAI_API_BASE": "your-azure-openai-endpoint",
        "AZURE_OPENAI_API_VERSION": "your-api-version",
        "AZURE_OPENAI_DEPLOYMENT": "your-deployment-name"
      },
      "disabled": false,
      "autoApprove": [
        "get_column_map",
        "smartsheet_write",
        "smartsheet_update",
        "smartsheet_delete",
        "smartsheet_search",
        "smartsheet_add_column",
        "smartsheet_delete_column",
        "smartsheet_rename_column",
        "smartsheet_bulk_update",
        "start_batch_analysis",
        "get_job_status",
        "cancel_batch_analysis",
        "get_all_row_ids",
        "list_workspaces",
        "get_workspace",
        "create_workspace",
        "create_sheet_in_workspace",
        "list_workspace_sheets"
      ]
    }
  }
}
```

#### 3. Configure for HTTP Transport

For web-based MCP clients or network access, use the HTTP transport mode:

**Start the server:**

```bash
# Start with default port (3000)
SMARTSHEET_API_KEY=your-api-key PYTHON_PATH=/path/to/python smartsheet-server --transport http

# Start with custom port
SMARTSHEET_API_KEY=your-api-key PYTHON_PATH=/path/to/python smartsheet-server --transport http --port 8080
```

**Client Configuration:**

```json
{
  "mcpServers": {
    "smartsheet-server": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer your-optional-auth-token"
      }
    }
  }
}
```

**Health Check:**

The HTTP server provides a health check endpoint:

```bash
curl http://localhost:3000/health
# Response: {"status":"ok","server":"smartsheet-mcp"}
```

### Starting the Server

#### STDIO Transport (Default)

The server will start automatically when Cline or Claude Desktop needs it. However, you can also start it manually for testing.

**macOS/Linux**:

```bash
# Activate the environment
conda activate cline_mcp_env

# Start with STDIO transport (default)
PYTHON_PATH=/Users/[username]/anaconda3/envs/cline_mcp_env/bin/python3 SMARTSHEET_API_KEY=your-api-key node build/index.js

# Or explicitly specify STDIO transport
PYTHON_PATH=/Users/[username]/anaconda3/envs/cline_mcp_env/bin/python3 SMARTSHEET_API_KEY=your-api-key node build/index.js --transport stdio
```

**Windows**:

```cmd
:: Activate the environment
conda activate cline_mcp_env

:: Start with STDIO transport
set PYTHON_PATH=C:\Users\[username]\anaconda3\envs\cline_mcp_env\python.exe
set SMARTSHEET_API_KEY=your-api-key
node build\index.js --transport stdio
```

#### HTTP Transport

For web-based clients or network access:

**macOS/Linux**:

```bash
# Activate the environment
conda activate cline_mcp_env

# Start HTTP server on default port (3000)
PYTHON_PATH=/Users/[username]/anaconda3/envs/cline_mcp_env/bin/python3 SMARTSHEET_API_KEY=your-api-key node build/index.js --transport http

# Start HTTP server on custom port
PYTHON_PATH=/Users/[username]/anaconda3/envs/cline_mcp_env/bin/python3 SMARTSHEET_API_KEY=your-api-key node build/index.js --transport http --port 8080
```

**Windows**:

```cmd
:: Activate the environment
conda activate cline_mcp_env

:: Start HTTP server
set PYTHON_PATH=C:\Users\[username]\anaconda3\envs\cline_mcp_env\python.exe
set SMARTSHEET_API_KEY=your-api-key
node build\index.js --transport http --port 3000
```

#### Command Line Options

```bash
# View help
node build/index.js --help

# Available options:
--transport <type>    # "stdio" (default) or "http"
--port <number>       # HTTP port (default: 3000, only used with --transport http)
--help, -h            # Show help message
```

### Verifying Installation

#### STDIO Transport

1. The server should output "Smartsheet MCP server running on stdio" when started
2. Test the connection using any MCP tool (e.g., get_column_map)

#### HTTP Transport

1. The server should output "Smartsheet MCP server running on HTTP port 3000" when started
2. Test the health endpoint: `curl http://localhost:3000/health`
3. Expected response: `{"status":"ok","server":"smartsheet-mcp"}`

#### Python Environment

Check the Python environment has the required packages installed:

```bash
conda activate cline_mcp_env
pip show smartsheet-python-sdk openai tiktoken python-dotenv
```

The Python package should include these key dependencies:

- `smartsheet-python-sdk>=2.105.1` - Smartsheet API client
- `openai>=1.0.0` - Azure OpenAI integration
- `tiktoken>=0.5.0` - Token counting for AI analysis
- `python-dotenv>=1.0.0` - Environment variable management

## Usage Examples

### Getting Column Information (Read)

```typescript
// Get column mapping and sample data
const result = await use_mcp_tool({
  server_name: "smartsheet",
  tool_name: "get_column_map",
  arguments: {
    sheet_id: "your-sheet-id",
  },
});
```

### Writing Data (Create)

```typescript
// Write new rows to Smartsheet
const result = await use_mcp_tool({
  server_name: "smartsheet",
  tool_name: "smartsheet_write",
  arguments: {
    sheet_id: "your-sheet-id",
    column_map: {
      "Column 1": "1234567890",
      "Column 2": "0987654321",
    },
    row_data: [
      {
        "Column 1": "Value 1",
        "Column 2": "Value 2",
      },
    ],
  },
});
```

### Searching Data

```typescript
// Basic text search
const result = await use_mcp_tool({
  server_name: "smartsheet",
  tool_name: "smartsheet_search",
  arguments: {
    sheet_id: "your-sheet-id",
    pattern: "search text",
    options: {
      case_sensitive: false,
      whole_word: false,
      columns: ["Column1", "Column2"], // Optional: limit search to specific columns
    },
  },
});

// Search PICKLIST column with exact matching
const result = await use_mcp_tool({
  server_name: "smartsheet",
  tool_name: "smartsheet_search",
  arguments: {
    sheet_id: "your-sheet-id",
    pattern: "In Progress",
    options: {
      columns: ["Status"], // PICKLIST column
      case_sensitive: true,
      whole_word: true,
    },
  },
});
```

### Updating Data (Update)

```typescript
// Update existing rows
const result = await use_mcp_tool({
  server_name: "smartsheet",
  tool_name: "smartsheet_update",
  arguments: {
    sheet_id: "your-sheet-id",
    column_map: {
      Status: "850892021780356",
      Notes: "6861293012340612",
    },
    updates: [
      {
        row_id: "7670198317295492",
        data: {
          Status: "In Progress",
          Notes: "Updated via MCP server",
        },
      },
    ],
  },
});
```

### Deleting Data (Delete)

```typescript
// Delete rows from Smartsheet
const result = await use_mcp_tool({
  server_name: "smartsheet",
  tool_name: "smartsheet_delete",
  arguments: {
    sheet_id: "your-sheet-id",
    row_ids: ["7670198317295492", "7670198317295493"],
  },
});
```

### Healthcare Analytics Examples

```typescript
// Example 1: Pediatric Innovation Scoring
const result = await use_mcp_tool({
  server_name: "smartsheet",
  tool_name: "start_batch_analysis",
  arguments: {
    sheet_id: "your-sheet-id",
    type: "custom",
    sourceColumns: ["Ideas", "Implementation_Details"],
    targetColumn: "Pediatric_Score",
    rowIds: ["row1", "row2", "row3"], // Optional: specify rows, or omit for all rows
    customGoal:
      "Score each innovation 1-100 based on pediatric healthcare impact. Consider: 1) Direct benefit to child patients, 2) Integration with pediatric workflows, 3) Implementation feasibility in children's hospital, 4) Safety considerations for pediatric use. Return only a number.",
  },
});

// Example 2: Clinical Note Summarization
const result = await use_mcp_tool({
  server_name: "smartsheet",
  tool_name: "start_batch_analysis",
  arguments: {
    sheet_id: "your-sheet-id",
    type: "summarize",
    sourceColumns: ["Clinical_Notes"],
    targetColumn: "Note_Summary",
    rowIds: ["row1", "row2"], // Optional: specify rows, or omit for all rows
  },
});

// Example 3: Patient Satisfaction Analysis
const result = await use_mcp_tool({
  server_name: "smartsheet",
  tool_name: "start_batch_analysis",
  arguments: {
    sheet_id: "your-sheet-id",
    type: "sentiment",
    sourceColumns: ["Patient_Feedback"],
    targetColumn: "Satisfaction_Score",
    rowIds: ["row1", "row2"], // Optional: specify rows, or omit for all rows
  },
});

// Example 4: Get All Row IDs for Batch Processing
const allRows = await use_mcp_tool({
  server_name: "smartsheet",
  tool_name: "get_all_row_ids",
  arguments: {
    sheet_id: "your-sheet-id",
  },
});

// Example 5: Monitor Analysis Job Progress
const jobStatus = await use_mcp_tool({
  server_name: "smartsheet",
  tool_name: "get_job_status",
  arguments: {
    sheet_id: "your-sheet-id",
    jobId: "job-uuid-from-start-analysis",
  },
});
```

### Workspace Management Examples

```typescript
// List all accessible workspaces
const workspaces = await use_mcp_tool({
  server_name: "smartsheet",
  tool_name: "list_workspaces",
  arguments: {},
});

// Get details of a specific workspace
const workspace = await use_mcp_tool({
  server_name: "smartsheet",
  tool_name: "get_workspace",
  arguments: {
    workspace_id: "6621332407379844",
  },
});

// Create a new workspace
const newWorkspace = await use_mcp_tool({
  server_name: "smartsheet",
  tool_name: "create_workspace",
  arguments: {
    name: "Project Management",
  },
});

// Create a sheet in a workspace
const newSheet = await use_mcp_tool({
  server_name: "smartsheet",
  tool_name: "create_sheet_in_workspace",
  arguments: {
    workspace_id: "6621332407379844",
    name: "Task Tracker",
    columns: [
      { title: "Task Name", type: "TEXT_NUMBER" },
      { title: "Due Date", type: "DATE" },
      {
        title: "Status",
        type: "PICKLIST",
        options: ["Not Started", "In Progress", "Completed"],
      },
    ],
  },
});

// List all sheets in a workspace
const sheets = await use_mcp_tool({
  server_name: "smartsheet",
  tool_name: "list_workspace_sheets",
  arguments: {
    workspace_id: "6621332407379844",
  },
});
```

### Resources Usage Examples

```typescript
// Access static resources
const projectTemplate = await access_mcp_resource({
  server_name: "smartsheet",
  uri: "smartsheet://templates/project-plan",
});

const columnTypes = await access_mcp_resource({
  server_name: "smartsheet",
  uri: "smartsheet://schemas/column-types",
});

const formulaGuide = await access_mcp_resource({
  server_name: "smartsheet",
  uri: "smartsheet://best-practices/formulas",
});

// Access dynamic resources
const sheetSummary = await access_mcp_resource({
  server_name: "smartsheet",
  uri: "smartsheet://8596778555232132/summary",
});

const ganttData = await access_mcp_resource({
  server_name: "smartsheet",
  uri: "smartsheet://8596778555232132/gantt-data",
});

const workspaceOverview = await access_mcp_resource({
  server_name: "smartsheet",
  uri: "smartsheet://6621332407379844/overview",
});

const dependencyMap = await access_mcp_resource({
  server_name: "smartsheet",
  uri: "smartsheet://8596778555232132/dependencies",
});

const healthReport = await access_mcp_resource({
  server_name: "smartsheet",
  uri: "smartsheet://8596778555232132/health-report",
});
```

### Prompts Usage Examples

```typescript
// Project plan creation guidance
const projectPlanPrompt = await use_mcp_tool({
  server_name: "smartsheet",
  tool_name: "get_prompt",
  arguments: {
    name: "create_project_plan",
    arguments: {
      project_name: "Website Redesign",
      project_type: "software",
      duration_estimate: "3 months",
    },
  },
});

// Project health analysis
const analysisPrompt = await use_mcp_tool({
  server_name: "smartsheet",
  tool_name: "get_prompt",
  arguments: {
    name: "analyze_project_status",
    arguments: {
      sheet_id: "8596778555232132",
      focus_area: "timeline",
    },
  },
});

// Workflow optimization suggestions
const optimizationPrompt = await use_mcp_tool({
  server_name: "smartsheet",
  tool_name: "get_prompt",
  arguments: {
    name: "optimize_workflow",
    arguments: {
      sheet_id: "8596778555232132",
      workflow_type: "approval",
    },
  },
});

// Data insights extraction
const insightsPrompt = await use_mcp_tool({
  server_name: "smartsheet",
  tool_name: "get_prompt",
  arguments: {
    name: "generate_insights",
    arguments: {
      sheet_id: "8596778555232132",
      insight_type: "bottlenecks",
    },
  },
});

// Executive dashboard creation
const dashboardPrompt = await use_mcp_tool({
  server_name: "smartsheet",
  tool_name: "get_prompt",
  arguments: {
    name: "create_dashboard_summary",
    arguments: {
      workspace_id: "6621332407379844",
      summary_focus: "risks",
    },
  },
});

// Conditional formatting setup
const formattingPrompt = await use_mcp_tool({
  server_name: "smartsheet",
  tool_name: "get_prompt",
  arguments: {
    name: "setup_conditional_formatting",
    arguments: {
      sheet_id: "8596778555232132",
      formatting_goal: "status indicators",
    },
  },
});
```

## Development

For development with auto-rebuild:

```bash
npm run watch
```

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. The server implements comprehensive error logging and provides detailed error messages through the MCP protocol.

Key debugging features:

- Error logging to stderr
- Detailed error messages in MCP responses
- Type validation at multiple levels
- Comprehensive operation result reporting
- Dependency analysis for column operations
- Formula reference tracking

## Error Handling

The server implements a multi-layer error handling approach:

1. MCP Layer

   - Validates tool parameters
   - Handles protocol-level errors
   - Provides formatted error responses
   - Manages timeouts and retries

2. CLI Layer

   - Validates command arguments
   - Handles execution errors
   - Formats error messages as JSON
   - Validates column operations

3. Operations Layer
   - Handles Smartsheet API errors
   - Validates data types and formats
   - Provides detailed error context
   - Manages column dependencies
   - Validates formula references
   - Ensures data integrity

## Contributing

Contributions are welcome! Please ensure:

1. TypeScript/Python code follows existing style
2. New features include appropriate error handling
3. Changes maintain backward compatibility
4. Updates include appropriate documentation
5. Column operations maintain data integrity
6. Formula references are properly handled
