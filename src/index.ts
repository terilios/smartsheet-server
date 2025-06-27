#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  GetPromptRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { promisify } from 'util';
import { exec, ExecOptions } from 'child_process';
import express from 'express';
import cors from 'cors';
import path from 'path';

// Configure execution options
const execOptions: ExecOptions = {
  maxBuffer: 10 * 1024 * 1024, // 10MB buffer
  timeout: 300000 // 5 minutes timeout
};

const execAsync = promisify(exec);

interface SmartsheetArgs {
  sheet_id: string;
  row_data?: any[];
  column_map?: Record<string, string>;
  updates?: Array<{
    row_id: string;
    data: Record<string, any>;
  }>;
  row_ids?: string[];
  pattern?: string;
  options?: {
    columns?: string[];
    case_sensitive?: boolean;
    regex?: boolean;
    whole_word?: boolean;
    include_system?: boolean;
  };
}

class SmartsheetServer {
  private server: Server;
  private apiKey: string;
  private pythonPath: string;

  constructor() {
    // Get API key from environment variable
    const apiKey = process.env.SMARTSHEET_API_KEY;
    if (!apiKey) {
      throw new Error('SMARTSHEET_API_KEY environment variable is required');
    }
    this.apiKey = apiKey;

    // Get Python path from environment variable
    const pythonPath = process.env.PYTHON_PATH;
    if (!pythonPath) {
      throw new Error('PYTHON_PATH environment variable is required');
    }
    this.pythonPath = pythonPath;

    this.server = new Server(
      {
        name: 'smartsheet',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.setupToolHandlers();
    
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.setupToolHandlersForServer(this.server);
  }

  async runStdio() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Smartsheet MCP server running on stdio');
  }

  async runHttp(port: number = 3000) {
    const app = express();
    
    // Enable CORS for all origins
    app.use(cors());
    
    // Parse JSON bodies
    app.use(express.json({ limit: '10mb' }));

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', server: 'smartsheet-mcp' });
    });

    // StreamableHTTP MCP endpoint (modern approach)
    app.all('/mcp', async (req, res) => {
      try {
        // Create new server and transport instances for each request (stateless mode)
        const server = new Server(
          {
            name: 'smartsheet',
            version: '0.1.0',
          },
          {
            capabilities: {
              tools: {},
              resources: {},
              prompts: {},
            },
          }
        );

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined, // Stateless mode
        });

        // Set up tool handlers for this request
        this.setupToolHandlersForServer(server);

        // Clean up when connection closes
        res.on('close', () => {
          transport.close();
          server.close();
        });

        // Handle the MCP request
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (error: any) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
          res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
          });
        }
      }
    });

    app.listen(port, () => {
      console.error(`Smartsheet MCP server running on HTTP port ${port}`);
      console.error(`Health check: http://localhost:${port}/health`);
      console.error(`StreamableHTTP endpoint: http://localhost:${port}/mcp`);
    });
  }

  private setupToolHandlersForServer(server: Server) {
    // Tool handlers
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.getToolDefinitions(),
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return this.handleToolCall(request);
    });

    // Resource handlers
    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: this.getStaticResources(),
    }));

    server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
      resourceTemplates: this.getResourceTemplates(),
    }));

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      return this.handleResourceRead(request);
    });

    // Prompt handlers
    server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: this.getPromptDefinitions(),
    }));

    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      return this.handlePromptRequest(request);
    });

    server.onerror = (error) => console.error('[MCP Error]', error);
  }

  private getToolDefinitions() {
    return [
      {
        name: 'smartsheet_add_column',
        description: 'Add a new column to a Smartsheet',
        inputSchema: {
          type: 'object',
          properties: {
            sheet_id: {
              type: 'string',
              description: 'Smartsheet sheet ID'
            },
            title: {
              type: 'string',
              description: 'Column title'
            },
            type: {
              type: 'string',
              description: 'Column type',
              enum: ['TEXT_NUMBER', 'DATE', 'CHECKBOX', 'PICKLIST', 'CONTACT_LIST']
            },
            index: {
              type: 'number',
              description: 'Optional position index'
            },
            validation: {
              type: 'boolean',
              description: 'Enable validation'
            },
            formula: {
              type: 'string',
              description: 'Formula for calculated columns'
            },
            options: {
              type: 'array',
              description: 'Options for PICKLIST type',
              items: {
                type: 'string'
              }
            }
          },
          required: ['sheet_id', 'title', 'type']
        }
      },
      {
        name: 'smartsheet_delete_column',
        description: 'Delete a column from a Smartsheet',
        inputSchema: {
          type: 'object',
          properties: {
            sheet_id: {
              type: 'string',
              description: 'Smartsheet sheet ID'
            },
            column_id: {
              type: 'string',
              description: 'Column ID to delete'
            },
            validate_dependencies: {
              type: 'boolean',
              description: 'Check for formula/dependency impacts',
              default: true
            }
          },
          required: ['sheet_id', 'column_id']
        }
      },
      {
        name: 'smartsheet_rename_column',
        description: 'Rename a column in a Smartsheet',
        inputSchema: {
          type: 'object',
          properties: {
            sheet_id: {
              type: 'string',
              description: 'Smartsheet sheet ID'
            },
            column_id: {
              type: 'string',
              description: 'Column ID to rename'
            },
            new_title: {
              type: 'string',
              description: 'New column title'
            },
            update_references: {
              type: 'boolean',
              description: 'Update formulas referencing this column',
              default: true
            }
          },
          required: ['sheet_id', 'column_id', 'new_title']
        }
      },
      {
        name: 'get_column_map',
        description: 'Get column mapping and sample data from a Smartsheet',
        inputSchema: {
          type: 'object',
          properties: {
            sheet_id: {
              type: 'string',
              description: 'Smartsheet sheet ID',
            }
          },
          required: ['sheet_id'],
        },
      },
      {
        name: 'get_sheet_info',
        description: 'Get column mapping and sample data from a Smartsheet (alias for get_column_map)',
        inputSchema: {
          type: 'object',
          properties: {
            sheet_id: {
              type: 'string',
              description: 'Smartsheet sheet ID',
            }
          },
          required: ['sheet_id'],
        },
      },
      {
        name: 'smartsheet_write',
        description: 'Write data to a Smartsheet',
        inputSchema: {
          type: 'object',
          properties: {
            sheet_id: {
              type: 'string',
              description: 'Smartsheet sheet ID',
            },
            row_data: {
              type: 'array',
              description: 'Array of objects containing the data to write',
              items: {
                type: 'object'
              }
            },
            column_map: {
              type: 'object',
              description: 'Object mapping data fields to Smartsheet column IDs',
              additionalProperties: {
                type: 'string'
              }
            }
          },
          required: ['sheet_id', 'row_data', 'column_map'],
        },
      },
      {
        name: 'smartsheet_update',
        description: 'Update existing rows in a Smartsheet',
        inputSchema: {
          type: 'object',
          properties: {
            sheet_id: {
              type: 'string',
              description: 'Smartsheet sheet ID',
            },
            updates: {
              type: 'array',
              description: 'Array of updates containing row_id and data',
              items: {
                type: 'object',
                properties: {
                  row_id: {
                    type: 'string',
                    description: 'Row ID to update'
                  },
                  data: {
                    type: 'object',
                    description: 'Data to update in the row'
                  }
                },
                required: ['row_id', 'data']
              }
            },
            column_map: {
              type: 'object',
              description: 'Object mapping data fields to Smartsheet column IDs',
              additionalProperties: {
                type: 'string'
              }
            }
          },
          required: ['sheet_id', 'updates', 'column_map'],
        },
      },
      {
        name: 'smartsheet_delete',
        description: 'Delete rows from a Smartsheet',
        inputSchema: {
          type: 'object',
          properties: {
            sheet_id: {
              type: 'string',
              description: 'Smartsheet sheet ID',
            },
            row_ids: {
              type: 'array',
              description: 'Array of row IDs to delete',
              items: {
                type: 'string'
              }
            }
          },
          required: ['sheet_id', 'row_ids'],
        },
      },
      {
        name: 'smartsheet_search',
        description: 'Search for content in a Smartsheet',
        inputSchema: {
          type: 'object',
          properties: {
            sheet_id: {
              type: 'string',
              description: 'Smartsheet sheet ID',
            },
            pattern: {
              type: 'string',
              description: 'Search pattern (text or regex)',
            },
            options: {
              type: 'object',
              description: 'Search options',
              properties: {
                columns: {
                  type: 'array',
                  description: 'Specific columns to search (default: all)',
                  items: {
                    type: 'string'
                  }
                },
                case_sensitive: {
                  type: 'boolean',
                  description: 'Case sensitive search (default: false)'
                },
                regex: {
                  type: 'boolean',
                  description: 'Use regex pattern matching (default: false)'
                },
                whole_word: {
                  type: 'boolean',
                  description: 'Match whole words only (default: false)'
                },
                include_system: {
                  type: 'boolean',
                  description: 'Include system-managed columns (default: false)'
                }
              }
            }
          },
          required: ['sheet_id', 'pattern'],
        },
      },
      {
        name: 'start_batch_analysis',
        description: 'Start a batch analysis job using Azure OpenAI',
        inputSchema: {
          type: 'object',
          properties: {
            sheet_id: {
              type: 'string',
              description: 'Smartsheet sheet ID'
            },
            type: {
              type: 'string',
              description: 'Analysis type',
              enum: ['summarize', 'sentiment', 'interpret', 'custom']
            },
            sourceColumns: {
              type: 'array',
              description: 'Columns to analyze',
              items: {
                type: 'string'
              }
            },
            targetColumn: {
              type: 'string',
              description: 'Column to store results'
            },
            rowIds: {
              type: 'array',
              description: 'Rows to process',
              items: {
                type: 'string'
              }
            },
            customGoal: {
              type: 'string',
              description: 'Custom analysis goal for custom analysis type'
            }
          },
          required: ['sheet_id', 'type', 'sourceColumns', 'targetColumn', 'rowIds']
        }
      },
      {
        name: 'cancel_batch_analysis',
        description: 'Cancel a running batch analysis job',
        inputSchema: {
          type: 'object',
          properties: {
            sheet_id: {
              type: 'string',
              description: 'Smartsheet sheet ID'
            },
            jobId: {
              type: 'string',
              description: 'Job to cancel'
            }
          },
          required: ['sheet_id', 'jobId']
        }
      },
      {
        name: 'get_job_status',
        description: 'Get the status of a batch analysis job',
        inputSchema: {
          type: 'object',
          properties: {
            sheet_id: {
              type: 'string',
              description: 'Smartsheet sheet ID'
            },
            jobId: {
              type: 'string',
              description: 'Job to check status for'
            }
          },
          required: ['sheet_id', 'jobId']
        }
      },
      {
        name: 'smartsheet_bulk_update',
        description: 'Perform conditional bulk updates on a Smartsheet',
        inputSchema: {
          type: 'object',
          properties: {
            sheet_id: {
              type: 'string',
              description: 'Smartsheet sheet ID'
            },
            rules: {
              type: 'array',
              description: 'List of update rules',
              items: {
                type: 'object',
                properties: {
                  conditions: {
                    type: 'array',
                    description: 'Conditions to evaluate (AND logic)',
                    items: {
                      type: 'object',
                      properties: {
                        columnId: {
                          type: 'string',
                          description: 'Column ID to check'
                        },
                        operator: {
                          type: 'string',
                          description: 'Comparison operator',
                          enum: ['equals', 'contains', 'greaterThan', 'lessThan', 'isEmpty', 'isNotEmpty']
                        },
                        value: {
                          type: ['string', 'number', 'boolean', 'null'],
                          description: 'Value to compare against (not needed for isEmpty/isNotEmpty)'
                        }
                      },
                      required: ['columnId', 'operator']
                    }
                  },
                  updates: {
                    type: 'array',
                    description: 'Updates to apply when conditions are met',
                    items: {
                      type: 'object',
                      properties: {
                        columnId: {
                          type: 'string',
                          description: 'Column ID to update'
                        },
                        value: {
                          type: ['string', 'number', 'boolean', 'null'],
                          description: 'New value to set'
                        }
                      },
                      required: ['columnId', 'value']
                    }
                  }
                },
                required: ['conditions', 'updates']
              }
            },
            options: {
              type: 'object',
              description: 'Update options',
              properties: {
                lenientMode: {
                  type: 'boolean',
                  description: 'Allow partial success',
                  default: false
                },
                batchSize: {
                  type: 'number',
                  description: 'Number of rows per batch',
                  default: 500
                }
              }
            }
          },
          required: ['sheet_id', 'rules']
        }
      },
      {
        name: 'get_all_row_ids',
        description: 'Get all row IDs from a Smartsheet',
        inputSchema: {
          type: 'object',
          properties: {
            sheet_id: {
              type: 'string',
              description: 'Smartsheet sheet ID'
            }
          },
          required: ['sheet_id']
        }
      },
      {
        name: 'list_workspaces',
        description: 'List all accessible workspaces',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'get_workspace',
        description: 'Get details of a specific workspace',
        inputSchema: {
          type: 'object',
          properties: {
            workspace_id: {
              type: 'string',
              description: 'Workspace ID'
            }
          },
          required: ['workspace_id']
        }
      },
      {
        name: 'create_workspace',
        description: 'Create a new workspace',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Workspace name'
            }
          },
          required: ['name']
        }
      },
      {
        name: 'create_sheet_in_workspace',
        description: 'Create a sheet in a workspace',
        inputSchema: {
          type: 'object',
          properties: {
            workspace_id: {
              type: 'string',
              description: 'Workspace ID'
            },
            name: {
              type: 'string',
              description: 'Sheet name'
            },
            columns: {
              type: 'array',
              description: 'Column definitions',
              items: {
                type: 'object',
                properties: {
                  title: {
                    type: 'string',
                    description: 'Column title'
                  },
                  type: {
                    type: 'string',
                    description: 'Column type',
                    enum: ['TEXT_NUMBER', 'DATE', 'CHECKBOX', 'PICKLIST', 'CONTACT_LIST']
                  },
                  options: {
                    type: 'array',
                    description: 'Options for PICKLIST type',
                    items: {
                      type: 'string'
                    }
                  }
                },
                required: ['title', 'type']
              }
            }
          },
          required: ['workspace_id', 'name', 'columns']
        }
      },
      {
        name: 'list_workspace_sheets',
        description: 'List all sheets in a workspace',
        inputSchema: {
          type: 'object',
          properties: {
            workspace_id: {
              type: 'string',
              description: 'Workspace ID'
            }
          },
          required: ['workspace_id']
        }
      }
    ];
  }

  private async handleToolCall(request: any) {
    try {
      const { name, arguments: args } = request.params;
      
      // Validate and extract required arguments
      if (!args || typeof args !== 'object') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Invalid arguments'
        );
      }

      // Extract sheet_id for operations that require it
      const sheet_id = args.sheet_id as string;
      
      // Only validate sheet_id for operations that require it
      // Workspace operations don't require sheet_id
      // Note: Prompts should never reach this handler - they have their own handler
      const requiresSheetId = !['list_workspaces', 'get_workspace', 'create_workspace', 
                              'create_sheet_in_workspace', 'list_workspace_sheets'].includes(name);
      
      if (requiresSheetId && !sheet_id) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing required parameter: sheet_id'
        );
      }
      
      // Map tool names to CLI operations
      const operationMap: Record<string, string> = {
        'get_column_map': 'get_column_map',
        'get_sheet_info': 'get_column_map', // Alias for get_column_map
        'smartsheet_write': 'add_rows',
        'smartsheet_update': 'update_rows',
        'smartsheet_delete': 'delete_rows',
        'smartsheet_search': 'search',
        'smartsheet_add_column': 'add_column',
        'smartsheet_delete_column': 'delete_column',
        'smartsheet_rename_column': 'rename_column',
        'smartsheet_bulk_update': 'bulk_update',
        'start_batch_analysis': 'start_analysis',
        'cancel_batch_analysis': 'cancel_analysis',
        'get_job_status': 'get_job_status',
        'get_all_row_ids': 'get_all_row_ids',
        'list_workspaces': 'list_workspaces',
        'get_workspace': 'get_workspace',
        'create_workspace': 'create_workspace',
        'create_sheet_in_workspace': 'create_sheet_in_workspace',
        'list_workspace_sheets': 'list_workspace_sheets'
      };

      const operation = operationMap[name];
      if (!operation) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Unknown operation: ${name}`
        );
      }
      
      // Build command using the configured Python path and environment variables
      const env = {
        AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY,
        AZURE_OPENAI_API_BASE: process.env.AZURE_OPENAI_API_BASE,
        AZURE_OPENAI_API_VERSION: process.env.AZURE_OPENAI_API_VERSION
      };
      
      // Determine if we need sheet_id or workspace_id
      let command = '';
      if (['list_workspaces', 'create_workspace'].includes(name)) {
        // These operations don't require sheet_id or workspace_id
        command = `${this.pythonPath} -m smartsheet_ops.cli --api-key "${this.apiKey}" --operation ${operation}`;
      } else if (['get_workspace', 'create_sheet_in_workspace', 'list_workspace_sheets'].includes(name)) {
        // These operations require workspace_id instead of sheet_id
        const workspace_id = args.workspace_id as string;
        if (!workspace_id) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Missing required parameter: workspace_id'
          );
        }
        command = `${this.pythonPath} -m smartsheet_ops.cli --api-key "${this.apiKey}" --workspace-id "${workspace_id}" --operation ${operation}`;
      } else {
        // Standard operations that require sheet_id
        command = `${this.pythonPath} -m smartsheet_ops.cli --api-key "${this.apiKey}" --sheet-id "${sheet_id}" --operation ${operation}`;
      }
      
      // Add data based on operation (same logic as before)
      if (name === 'smartsheet_write') {
        const row_data = args.row_data as any[];
        const column_map = args.column_map as Record<string, string>;
        
        if (!row_data || !column_map) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Missing required parameters for write operation: row_data and column_map'
          );
        }
        
        const data = { row_data, column_map };
        const escapedData = JSON.stringify(data).replace(/'/g, "'\\''");
        command += ` --data '${escapedData}'`;
      }
      else if (name === 'smartsheet_update') {
        const updates = args.updates as Array<{ row_id: string; data: Record<string, any> }>;
        const column_map = args.column_map as Record<string, string>;
        
        if (!updates || !column_map) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Missing required parameters for update operation: updates and column_map'
          );
        }
        
        const data = { updates, column_map };
        const escapedData = JSON.stringify(data).replace(/'/g, "'\\''");
        command += ` --data '${escapedData}'`;
      }
      else if (name === 'smartsheet_delete') {
        const row_ids = args.row_ids as string[];
        
        if (!row_ids) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Missing required parameter for delete operation: row_ids'
          );
        }
        
        const data = { row_ids };
        const escapedData = JSON.stringify(data).replace(/'/g, "'\\''");
        command += ` --data '${escapedData}'`;
      }
      else if (name === 'smartsheet_search') {
        const pattern = args.pattern as string;
        const options = args.options;
        
        if (!pattern) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Missing required parameter: pattern'
          );
        }
        
        const data = { pattern, options };
        command += ` --data '${JSON.stringify(data)}'`;
      }
      else if (name === 'smartsheet_add_column') {
        const { title, type, index, validation, formula, options } = args;
        const data = { title, type, index, validation, formula, options };
        command += ` --data '${JSON.stringify(data)}'`;
      }
      else if (name === 'smartsheet_delete_column') {
        const { column_id, validate_dependencies } = args;
        const data = { column_id, validate_dependencies };
        command += ` --data '${JSON.stringify(data)}'`;
      }
      else if (name === 'smartsheet_rename_column') {
        const { column_id, new_title, update_references } = args;
        const data = { column_id, new_title, update_references };
        command += ` --data '${JSON.stringify(data)}'`;
      }
      else if (name === 'smartsheet_bulk_update') {
        const { rules, options } = args;
        const data = { rules, options };
        command += ` --data '${JSON.stringify(data)}'`;
      }
      else if (name === 'start_batch_analysis') {
        const { type, sourceColumns, targetColumn, rowIds, customGoal } = args;
        const data = { type, sourceColumns, targetColumn, rowIds, customGoal };
        command += ` --data '${JSON.stringify(data)}'`;
      }
      else if (name === 'cancel_batch_analysis') {
        const { jobId } = args;
        const data = { jobId };
        command += ` --data '${JSON.stringify(data)}'`;
      }
      else if (name === 'get_job_status') {
        const { jobId } = args;
        const data = { jobId };
        command += ` --data '${JSON.stringify(data)}'`;
      }
      else if (name === 'create_workspace') {
        const name = args.name as string;
        if (!name) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Missing required parameter: name'
          );
        }
        const data = { name };
        command += ` --data '${JSON.stringify(data)}'`;
      }
      else if (name === 'create_sheet_in_workspace') {
        const sheetName = args.name as string;
        const columns = args.columns as Array<{
          title: string;
          type: string;
          options?: string[];
        }>;
        
        if (!sheetName || !columns) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Missing required parameters for create_sheet_in_workspace: name and columns'
          );
        }
        
        const data = { 
          name: sheetName,
          columns 
        };
        command += ` --data '${JSON.stringify(data)}'`;
      }
      
      // Execute command with environment variables and increased buffer size
      const { stdout, stderr } = await execAsync(command, {
        ...execOptions,
        env: {
          ...process.env,  // Include existing environment
          ...env  // Add Azure OpenAI variables
        },
        shell: '/bin/bash'  // Use bash shell to ensure environment variables are passed correctly
      });
      
      // Try to parse stdout as JSON
      try {
        const result = JSON.parse(stdout);
        
        // Handle the new response format
        if (result.hasOwnProperty('success')) {
          if (result.success) {
            // Operation succeeded, possibly with warnings
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    ...result,
                    timestamp: new Date().toISOString(),
                    execution_source: 'mcp_server'
                  }, null, 2),
                },
              ],
              // Don't set isError for warnings
            };
          } else {
            // Operation failed with error
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    ...result,
                    timestamp: new Date().toISOString(),
                    execution_source: 'mcp_server'
                  }, null, 2),
                },
              ],
              isError: true,
            };
          }
        }
        
        // Handle legacy format
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ...result,
                timestamp: new Date().toISOString(),
                execution_source: 'mcp_server'
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        // If stdout is not valid JSON or there's an error, return error
        return {
          content: [
            {
              type: 'text',
              text: stderr || stdout,
            },
          ],
          isError: true,
        };
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error occurred';
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to execute Smartsheet operation: ${errorMessage}`
      );
    }
  }

  private getStaticResources() {
    return [
      {
        uri: 'smartsheet://templates/project-plan',
        name: 'Project Plan Template',
        mimeType: 'application/json',
        description: 'Pre-built project plan template with best practices for task management, dependencies, and resource allocation'
      },
      {
        uri: 'smartsheet://templates/task-tracker',
        name: 'Task Tracker Template',
        mimeType: 'application/json',
        description: 'Simple task tracking template for team collaboration and progress monitoring'
      },
      {
        uri: 'smartsheet://schemas/column-types',
        name: 'Column Types Reference',
        mimeType: 'application/json',
        description: 'Complete reference of all supported Smartsheet column types with usage examples'
      },
      {
        uri: 'smartsheet://best-practices/formulas',
        name: 'Formula Best Practices',
        mimeType: 'text/markdown',
        description: 'Common formula patterns and best practices for Smartsheet calculations'
      },
      {
        uri: 'smartsheet://guides/project-hierarchy',
        name: 'Project Hierarchy Guide',
        mimeType: 'application/json',
        description: 'Comprehensive guide for creating and managing hierarchical project structures in Smartsheet'
      }
    ];
  }

  private getResourceTemplates() {
    return [
      {
        uriTemplate: 'smartsheet://{sheet_id}/summary',
        name: 'Sheet Summary',
        mimeType: 'application/json',
        description: 'Auto-generated summary with key metrics, progress indicators, and health status for any sheet'
      },
      {
        uriTemplate: 'smartsheet://{sheet_id}/gantt-data',
        name: 'Gantt Chart Data',
        mimeType: 'application/json',
        description: 'Standardized Gantt chart data format for project timeline visualization'
      },
      {
        uriTemplate: 'smartsheet://{workspace_id}/overview',
        name: 'Workspace Overview',
        mimeType: 'application/json',
        description: 'Comprehensive overview of workspace contents including all sheets, reports, and dashboards'
      },
      {
        uriTemplate: 'smartsheet://{sheet_id}/dependencies',
        name: 'Dependency Map',
        mimeType: 'application/json',
        description: 'Visual dependency mapping for project sheets showing task relationships and critical path'
      },
      {
        uriTemplate: 'smartsheet://{sheet_id}/health-report',
        name: 'Sheet Health Report',
        mimeType: 'application/json',
        description: 'Health analysis identifying missing data, broken formulas, and optimization opportunities'
      }
    ];
  }

  private async handleResourceRead(request: any) {
    const uri = request.params.uri;
    
    try {
      // Handle static resources
      if (uri === 'smartsheet://templates/project-plan') {
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              name: 'Project Plan Template',
              columns: [
                { title: 'Task Name', type: 'TEXT_NUMBER', primary: true },
                { title: 'Duration', type: 'DURATION' },
                { title: 'Start', type: 'ABSTRACT_DATETIME' },
                { title: 'Finish', type: 'ABSTRACT_DATETIME' },
                { title: 'Predecessors', type: 'PREDECESSOR' },
                { title: 'Assigned To', type: 'CONTACT_LIST' },
                { title: '% Complete', type: 'TEXT_NUMBER' },
                { title: 'Status', type: 'PICKLIST', options: ['Not Started', 'In Progress', 'Completed', 'On Hold'] }
              ],
              hierarchical_structure: {
                description: "Project plans use indentation levels to create parent-child relationships between tasks",
                indentation_levels: {
                  "0": "Project/Phase level (no indentation)",
                  "1": "Major task/milestone (1 level indent)",
                  "2": "Subtask (2 levels indent)",
                  "3": "Sub-subtask (3 levels indent)",
                  "4+": "Additional nesting levels as needed"
                },
                nesting_examples: [
                  {
                    level: 0,
                    task: "Phase 1: Planning",
                    description: "Top-level phase - no indentation"
                  },
                  {
                    level: 1,
                    task: "  Requirements Gathering",
                    description: "Major task under Phase 1 - 1 indent level"
                  },
                  {
                    level: 2,
                    task: "    Stakeholder Interviews",
                    description: "Subtask under Requirements - 2 indent levels"
                  },
                  {
                    level: 2,
                    task: "    Document Requirements",
                    description: "Another subtask - same level as interviews"
                  },
                  {
                    level: 1,
                    task: "  Design Architecture",
                    description: "Another major task under Phase 1"
                  },
                  {
                    level: 0,
                    task: "Phase 2: Development",
                    description: "Next top-level phase"
                  }
                ],
                api_considerations: {
                  creation: "Use smartsheet_write tool to add rows. Indentation is controlled by the 'indent' property in row data",
                  parent_child: "Parent rows automatically calculate rollup values (duration, dates) from child tasks",
                  dependencies: "Predecessor relationships work across hierarchy levels",
                  limitations: "API cannot create indentation directly - must be set in Smartsheet UI or via specific indent operations"
                }
              },
              work_breakdown_structure: {
                recommended_levels: [
                  "Level 0: Project phases (Planning, Design, Development, Testing, Deployment)",
                  "Level 1: Major deliverables or work packages within each phase",
                  "Level 2: Specific tasks required to complete each deliverable",
                  "Level 3: Detailed subtasks or activities (use sparingly)"
                ],
                naming_conventions: [
                  "Use clear, action-oriented task names",
                  "Include deliverable type in name (e.g., 'Design Database Schema')",
                  "Keep names concise but descriptive",
                  "Use consistent terminology across similar tasks"
                ]
              },
              best_practices: [
                'Use hierarchical structure for phases and tasks with clear indentation levels',
                'Limit nesting to 3-4 levels maximum for readability',
                'Parent tasks should represent logical groupings of child tasks',
                'Set durations on leaf tasks (lowest level) - parent durations auto-calculate',
                'Use consistent naming conventions across hierarchy levels',
                'Assign resources to specific tasks, not high-level phases',
                'Regular status updates and progress tracking at task level'
              ],
              hierarchy_tips: [
                'Start with major phases at level 0',
                'Break phases into logical work packages at level 1',
                'Define specific tasks at level 2',
                'Use level 3+ only for complex tasks requiring detailed breakdown',
                'Ensure each parent has at least 2 child tasks',
                'Review hierarchy for logical flow and dependencies'
              ]
            }, null, 2)
          }]
        };
      }

      if (uri === 'smartsheet://templates/task-tracker') {
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              name: 'Task Tracker Template',
              columns: [
                { title: 'Task', type: 'TEXT_NUMBER', primary: true },
                { title: 'Assigned To', type: 'CONTACT_LIST' },
                { title: 'Due Date', type: 'DATE' },
                { title: 'Priority', type: 'PICKLIST', options: ['High', 'Medium', 'Low'] },
                { title: 'Status', type: 'PICKLIST', options: ['To Do', 'In Progress', 'Done'] },
                { title: 'Comments', type: 'TEXT_NUMBER' }
              ],
              usage: 'Simple task tracking for teams without complex dependencies'
            }, null, 2)
          }]
        };
      }

      if (uri === 'smartsheet://schemas/column-types') {
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              column_types: {
                'TEXT_NUMBER': { description: 'Flexible text and numeric values', api_support: 'full' },
                'DATE': { description: 'Calendar dates', api_support: 'full' },
                'CHECKBOX': { description: 'Boolean true/false values', api_support: 'full' },
                'PICKLIST': { description: 'Single selection from predefined options', api_support: 'full' },
                'MULTI_PICKLIST': { description: 'Multiple selections from predefined options', api_support: 'full' },
                'CONTACT_LIST': { description: 'Single contact assignment', api_support: 'full' },
                'MULTI_CONTACT_LIST': { description: 'Multiple contact assignments', api_support: 'full' },
                'DURATION': { description: 'Task duration (project plans only)', api_support: 'read_only' },
                'ABSTRACT_DATETIME': { description: 'Start/Finish dates (project plans only)', api_support: 'limited' },
                'PREDECESSOR': { description: 'Task dependencies (project plans only)', api_support: 'read_only' },
                'CREATED_DATE': { description: 'System creation timestamp', api_support: 'read_only' },
                'MODIFIED_DATE': { description: 'System modification timestamp', api_support: 'read_only' },
                'AUTO_NUMBER': { description: 'Auto-incrementing unique identifiers', api_support: 'read_only' },
                'FORMULA': { description: 'Calculated columns', api_support: 'full' }
              }
            }, null, 2)
          }]
        };
      }

      if (uri === 'smartsheet://best-practices/formulas') {
        return {
          contents: [{
            uri,
            mimeType: 'text/markdown',
            text: `# Smartsheet Formula Best Practices

## Common Patterns

### Conditional Logic
\`\`\`
=IF([Status]@row = "Complete", "✓", IF([Status]@row = "In Progress", "⚠", "○"))
\`\`\`

### Date Calculations
\`\`\`
=NETWORKDAYS([Start Date]@row, [End Date]@row)
=TODAY() + 30
\`\`\`

### Progress Tracking
\`\`\`
=COUNTIF([Status]:[Status], "Complete") / COUNT([Status]:[Status])
\`\`\`

### Cross-Sheet References
\`\`\`
=SUMIF({Other Sheet Range}, "Criteria", {Other Sheet Values})
\`\`\`

## Best Practices
- Use column references instead of cell references when possible
- Test formulas with sample data before applying to entire columns
- Document complex formulas with comments
- Consider performance impact of cross-sheet references
`
          }]
        };
      }

      if (uri === 'smartsheet://guides/project-hierarchy') {
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              title: "Project Hierarchy Guide",
              description: "Comprehensive guide for creating and managing hierarchical project structures in Smartsheet",
              overview: {
                purpose: "Project hierarchies organize tasks into logical parent-child relationships, enabling better project management through visual structure and automatic rollup calculations",
                benefits: [
                  "Visual organization of project phases and tasks",
                  "Automatic rollup of durations, dates, and progress",
                  "Improved project tracking and reporting",
                  "Clear work breakdown structure (WBS)",
                  "Better resource allocation and dependency management"
                ]
              },
              hierarchy_levels: {
                "level_0": {
                  name: "Project/Phase Level",
                  description: "Top-level project phases or major milestones",
                  indentation: "No indentation",
                  examples: [
                    "Project Initiation",
                    "Planning Phase", 
                    "Development Phase",
                    "Testing Phase",
                    "Deployment Phase"
                  ],
                  best_practices: [
                    "Use broad, high-level phase names",
                    "Limit to 5-7 major phases for clarity",
                    "Represent major project deliverables",
                    "Should span significant time periods"
                  ]
                },
                "level_1": {
                  name: "Work Package/Deliverable Level",
                  description: "Major work packages or deliverables within each phase",
                  indentation: "1 level (single indent)",
                  examples: [
                    "  Requirements Gathering",
                    "  System Design",
                    "  Database Development",
                    "  User Interface Development",
                    "  Integration Testing"
                  ],
                  best_practices: [
                    "Represent logical groupings of related tasks",
                    "Should have clear deliverable outcomes",
                    "Typically 2-5 work packages per phase",
                    "Can be assigned to specific teams or leads"
                  ]
                },
                "level_2": {
                  name: "Task Level",
                  description: "Specific tasks required to complete each work package",
                  indentation: "2 levels (double indent)",
                  examples: [
                    "    Conduct stakeholder interviews",
                    "    Document functional requirements",
                    "    Create database schema",
                    "    Develop user authentication",
                    "    Perform unit testing"
                  ],
                  best_practices: [
                    "Actionable, specific tasks",
                    "Should be assignable to individuals",
                    "Typically 1-10 days duration",
                    "Clear start and end criteria"
                  ]
                },
                "level_3": {
                  name: "Subtask Level",
                  description: "Detailed subtasks for complex tasks (use sparingly)",
                  indentation: "3 levels (triple indent)",
                  examples: [
                    "      Prepare interview questions",
                    "      Schedule stakeholder meetings",
                    "      Conduct interviews",
                    "      Analyze interview results",
                    "      Document findings"
                  ],
                  best_practices: [
                    "Use only for complex tasks requiring breakdown",
                    "Keep to minimum for readability",
                    "Should be very specific and actionable",
                    "Typically less than 3 days duration"
                  ]
                }
              },
              api_workflow: {
                overview: "To create hierarchy, you MUST use parentId attributes. Without parentId, all rows are created flat (no indentation).",
                step_1: {
                  title: "Create Parent Row via API",
                  description: "Use smartsheet_write tool to create the top-level parent task",
                  example: {
                    tool: "smartsheet_write",
                    data: [
                      { 
                        "Task Name": "BCH Prior Authorization Automation Project",
                        "Duration": "77d",
                        "Status": "Not Started",
                        "toBottom": true
                      }
                    ]
                  },
                  result: "Returns row_id (e.g., '1234567890123456') - SAVE THIS ID!",
                  note: "Parent row is created at the bottom of the sheet with no indentation"
                },
                step_2: {
                  title: "Create Child Rows with parentId",
                  description: "Add child tasks using the parent row ID to establish hierarchy",
                  example: {
                    tool: "smartsheet_write",
                    data: [
                      {
                        "Task Name": "Phase 1: Foundation & Design",
                        "Duration": "15d",
                        "Status": "Not Started",
                        "parentId": "1234567890123456",
                        "toTop": true
                      }
                    ]
                  },
                  result: "Returns child row_id (e.g., '2345678901234567') - SAVE THIS ID!",
                  note: "Child rows are automatically indented under their parent when parentId is specified"
                },
                step_3: {
                  title: "Create Grandchild Rows",
                  description: "Add deeper hierarchy levels using child row IDs as parents",
                  example: {
                    tool: "smartsheet_write",
                    data: [
                      {
                        "Task Name": "Week 1: Project Initiation",
                        "Duration": "5d",
                        "Status": "Not Started",
                        "parentId": "2345678901234567",
                        "toTop": true
                      }
                    ]
                  },
                  result: "Returns grandchild row_id for further nesting if needed",
                  note: "Multiple hierarchy levels can be created by chaining parentId references"
                },
                step_4: {
                  title: "Verify Hierarchy",
                  description: "Confirm proper nesting and rollup behavior",
                  checks: [
                    "Parent tasks show rollup durations from children",
                    "Start dates roll up to earliest child start",
                    "Finish dates roll up to latest child finish",
                    "Progress percentages calculate from child completion",
                    "Visual indentation is visible in Smartsheet UI"
                  ]
                }
              },
              critical_requirements: {
                parentId_mandatory: "To create hierarchy, you MUST include parentId in row data",
                without_parentId: "Rows without parentId are created flat (no indentation)",
                step_by_step_creation: "Create parent first, get its ID, then create children with that parentId",
                batch_limitation: "Cannot mix different parentId values in single API call - create one level at a time"
              },
              api_hierarchy_attributes: {
                parentId: {
                  description: "ID of the parent row to create indentation hierarchy",
                  type: "string (converted to integer internally)",
                  usage: "Set to parent row ID to make current row a child",
                  example: "parentId: '1234567890123456'"
                },
                toTop: {
                  description: "Position row at top of its hierarchy level",
                  type: "boolean",
                  usage: "Use with parentId to position at top of parent's children",
                  example: "toTop: true"
                },
                toBottom: {
                  description: "Position row at bottom of its hierarchy level",
                  type: "boolean", 
                  usage: "Use with parentId to position at bottom of parent's children",
                  example: "toBottom: true"
                },
                siblingId: {
                  description: "ID of sibling row for relative positioning",
                  type: "string",
                  usage: "Use with above/below for precise positioning",
                  example: "siblingId: '1234567890123456'"
                },
                above: {
                  description: "Position above the specified sibling",
                  type: "boolean",
                  usage: "Use with siblingId for relative positioning",
                  example: "above: true"
                },
                below: {
                  description: "Position below the specified sibling", 
                  type: "boolean",
                  usage: "Use with siblingId for relative positioning",
                  example: "below: true"
                }
              },
              api_limitations: {
                batch_positioning: {
                  issue: "Cannot mix different positioning attributes in single API call",
                  error: "Specifying multiple row locations is not yet supported",
                  solution: "Create rows with identical positioning or create one-by-one",
                  example: "All rows must use same parentId, or all use toBottom, etc."
                },
                attribute_conversion: {
                  issue: "Python SDK uses snake_case, API uses camelCase",
                  mapping: {
                    "parentId": "parent_id",
                    "toTop": "to_top",
                    "toBottom": "to_bottom",
                    "siblingId": "sibling_id"
                  },
                  note: "MCP server handles conversion automatically"
                },
                type_conversion: {
                  issue: "parentId must be integer in Python SDK",
                  solution: "MCP server automatically converts string IDs to integers",
                  note: "Pass parentId as string in API calls - conversion is handled internally"
                }
              },
              real_world_example: {
                project: "Website Redesign Project",
                structure: [
                  {
                    level: 0,
                    task: "Phase 1: Discovery & Planning",
                    duration: "15d",
                    children: [
                      {
                        level: 1,
                        task: "  Requirements Analysis",
                        duration: "8d",
                        children: [
                          { level: 2, task: "    Stakeholder interviews", duration: "3d" },
                          { level: 2, task: "    Current site audit", duration: "2d" },
                          { level: 2, task: "    Requirements documentation", duration: "3d" }
                        ]
                      },
                      {
                        level: 1,
                        task: "  Project Planning",
                        duration: "7d",
                        children: [
                          { level: 2, task: "    Create project timeline", duration: "2d" },
                          { level: 2, task: "    Resource allocation", duration: "2d" },
                          { level: 2, task: "    Risk assessment", duration: "3d" }
                        ]
                      }
                    ]
                  },
                  {
                    level: 0,
                    task: "Phase 2: Design & Development",
                    duration: "25d",
                    children: [
                      {
                        level: 1,
                        task: "  UI/UX Design",
                        duration: "10d",
                        children: [
                          { level: 2, task: "    Wireframe creation", duration: "4d" },
                          { level: 2, task: "    Visual design", duration: "6d" }
                        ]
                      },
                      {
                        level: 1,
                        task: "  Development",
                        duration: "15d",
                        children: [
                          { level: 2, task: "    Frontend development", duration: "8d" },
                          { level: 2, task: "    Backend development", duration: "7d" }
                        ]
                      }
                    ]
                  }
                ]
              },
              troubleshooting: {
                common_issues: [
                  {
                    issue: "Parent durations not calculating correctly",
                    cause: "Child tasks don't have proper start/end dates",
                    solution: "Ensure all leaf tasks have specific start and finish dates"
                  },
                  {
                    issue: "Cannot indent tasks via API",
                    cause: "API limitation - indentation must be set in UI",
                    solution: "Create tasks via API, then manually indent in Smartsheet UI"
                  },
                  {
                    issue: "Hierarchy appears flat after API creation",
                    cause: "Normal behavior - API creates all tasks at same level",
                    solution: "Use Smartsheet UI to establish parent-child relationships"
                  },
                  {
                    issue: "Dependencies not working across hierarchy levels",
                    cause: "Predecessor references may be incorrect",
                    solution: "Use row numbers or task IDs for predecessor relationships"
                  }
                ]
              },
              best_practices_summary: [
                "Plan your hierarchy before creating tasks",
                "Limit nesting to 3-4 levels maximum",
                "Use consistent naming conventions at each level",
                "Set durations on leaf tasks only - parents auto-calculate",
                "Assign resources to specific tasks, not high-level phases",
                "Create logical groupings that reflect actual work breakdown",
                "Review hierarchy regularly for optimization opportunities",
                "Use dependencies to show task relationships across hierarchy levels"
              ]
            }, null, 2)
          }]
        };
      }

      // Handle dynamic resources with URI templates
      const sheetSummaryMatch = uri.match(/^smartsheet:\/\/([^\/]+)\/summary$/);
      if (sheetSummaryMatch) {
        const sheetId = sheetSummaryMatch[1];
        const summaryData = await this.generateSheetSummary(sheetId);
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(summaryData, null, 2)
          }]
        };
      }

      const ganttDataMatch = uri.match(/^smartsheet:\/\/([^\/]+)\/gantt-data$/);
      if (ganttDataMatch) {
        const sheetId = ganttDataMatch[1];
        const ganttData = await this.generateGanttData(sheetId);
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(ganttData, null, 2)
          }]
        };
      }

      const workspaceOverviewMatch = uri.match(/^smartsheet:\/\/([^\/]+)\/overview$/);
      if (workspaceOverviewMatch) {
        const workspaceId = workspaceOverviewMatch[1];
        const overviewData = await this.generateWorkspaceOverview(workspaceId);
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(overviewData, null, 2)
          }]
        };
      }

      const dependenciesMatch = uri.match(/^smartsheet:\/\/([^\/]+)\/dependencies$/);
      if (dependenciesMatch) {
        const sheetId = dependenciesMatch[1];
        const dependencyData = await this.generateDependencyMap(sheetId);
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(dependencyData, null, 2)
          }]
        };
      }

      const healthReportMatch = uri.match(/^smartsheet:\/\/([^\/]+)\/health-report$/);
      if (healthReportMatch) {
        const sheetId = healthReportMatch[1];
        const healthData = await this.generateHealthReport(sheetId);
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(healthData, null, 2)
          }]
        };
      }

      throw new McpError(ErrorCode.InvalidRequest, `Unknown resource URI: ${uri}`);
    } catch (error: any) {
      throw new McpError(ErrorCode.InternalError, `Failed to read resource: ${error.message}`);
    }
  }

  private getPromptDefinitions() {
    return [
      {
        name: 'create_project_plan',
        description: 'Guided project plan creation with best practices and template suggestions',
        arguments: [
          {
            name: 'project_name',
            description: 'Name of the project',
            required: true
          },
          {
            name: 'project_type',
            description: 'Type of project (software, construction, marketing, etc.)',
            required: false
          },
          {
            name: 'duration_estimate',
            description: 'Estimated project duration',
            required: false
          }
        ]
      },
      {
        name: 'analyze_project_status',
        description: 'Comprehensive project health analysis with recommendations',
        arguments: [
          {
            name: 'sheet_id',
            description: 'Project sheet ID to analyze',
            required: true
          },
          {
            name: 'focus_area',
            description: 'Specific area to focus on (timeline, resources, risks, etc.)',
            required: false
          }
        ]
      },
      {
        name: 'optimize_workflow',
        description: 'Suggestions for improving sheet structure and workflows',
        arguments: [
          {
            name: 'sheet_id',
            description: 'Sheet ID to optimize',
            required: true
          },
          {
            name: 'workflow_type',
            description: 'Type of workflow (approval, tracking, reporting, etc.)',
            required: false
          }
        ]
      },
      {
        name: 'generate_insights',
        description: 'Extract key insights and patterns from sheet data',
        arguments: [
          {
            name: 'sheet_id',
            description: 'Sheet ID to analyze',
            required: true
          },
          {
            name: 'insight_type',
            description: 'Type of insights to generate (trends, bottlenecks, performance, etc.)',
            required: false
          }
        ]
      },
      {
        name: 'create_dashboard_summary',
        description: 'Generate executive summary from multiple sheets',
        arguments: [
          {
            name: 'workspace_id',
            description: 'Workspace ID containing sheets to summarize',
            required: true
          },
          {
            name: 'summary_focus',
            description: 'Focus area for summary (progress, risks, resources, etc.)',
            required: false
          }
        ]
      },
      {
        name: 'setup_conditional_formatting',
        description: 'Guide users through conditional formatting setup',
        arguments: [
          {
            name: 'sheet_id',
            description: 'Sheet ID to configure formatting for',
            required: true
          },
          {
            name: 'formatting_goal',
            description: 'Goal for formatting (status indicators, progress tracking, etc.)',
            required: false
          }
        ]
      }
    ];
  }

  private async handlePromptRequest(request: any) {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'create_project_plan':
          return this.generateProjectPlanPrompt(args);
        case 'analyze_project_status':
          return this.generateProjectAnalysisPrompt(args);
        case 'optimize_workflow':
          return this.generateWorkflowOptimizationPrompt(args);
        case 'generate_insights':
          return this.generateInsightsPrompt(args);
        case 'create_dashboard_summary':
          return this.generateDashboardSummaryPrompt(args);
        case 'setup_conditional_formatting':
          return this.generateConditionalFormattingPrompt(args);
        default:
          throw new McpError(ErrorCode.InvalidRequest, `Unknown prompt: ${name}`);
      }
    } catch (error: any) {
      throw new McpError(ErrorCode.InternalError, `Failed to generate prompt: ${error.message}`);
    }
  }

  // Helper methods for generating dynamic resource content
  private async generateSheetSummary(sheetId: string) {
    try {
      // Get sheet structure
      const structureCommand = `${this.pythonPath} -m smartsheet_ops.cli --api-key "${this.apiKey}" --sheet-id "${sheetId}" --operation get_column_map`;
      const { stdout: structureData } = await execAsync(structureCommand, execOptions);
      const sheetData = JSON.parse(structureData);

      // Validate data structure
      if (!sheetData || typeof sheetData !== 'object') {
        throw new Error('Invalid sheet data structure received');
      }

      // Extract columns from column_info structure
      const columnInfo = sheetData.column_info || {};
      const columns = Object.entries(columnInfo).map(([title, info]: [string, any]) => ({
        title: title,
        type: info?.debug?._type_ || info?.type || 'TEXT_NUMBER',
        id: info?.id
      }));

      // Calculate summary metrics with safe defaults
      const totalRows = sheetData.row_count || 0;
      const sampleData = Array.isArray(sheetData.sample_data) ? sheetData.sample_data : [];

      // Analyze column types and usage with safe access
      const columnAnalysis = columns.map((col: any) => ({
        name: col?.title || 'Unknown Column',
        type: col?.type || 'UNKNOWN',
        hasData: Array.isArray(sampleData) && sampleData.some((row: any) => 
          row && typeof row === 'object' && row[col?.title] !== null && row[col?.title] !== ''
        )
      }));

      // Generate status distribution if status column exists
      let statusDistribution = null;
      const statusColumn = columns.find((col: any) => 
        col.title.toLowerCase().includes('status') || 
        col.type === 'PICKLIST'
      );
      
      // For now, we'll skip status distribution since we don't have options data
      // This would need to be enhanced to get actual picklist options from the API
      if (statusColumn && sampleData.length > 0) {
        // Get unique values from sample data for status analysis
        const statusValues = [...new Set(sampleData
          .map((row: any) => row[statusColumn.title])
          .filter((val: any) => val !== null && val !== undefined && val !== ''))];
        
        if (statusValues.length > 0) {
          statusDistribution = statusValues.map((status: any) => ({
            status: status.toString(),
            count: sampleData.filter((row: any) => row[statusColumn.title] === status).length
          }));
        }
      }

      return {
        sheet_id: sheetId,
        metadata: {
          total_rows: totalRows,
          total_columns: columns.length,
          last_updated: new Date().toISOString()
        },
        column_analysis: columnAnalysis,
        status_distribution: statusDistribution,
        health_indicators: {
          completion_rate: statusDistribution ? 
            (statusDistribution.find((s: any) => s.status.toLowerCase().includes('complete'))?.count || 0) / totalRows * 100 : null,
          data_completeness: columnAnalysis.filter((c: any) => c.hasData).length / columns.length * 100,
          structure_type: columns.some((c: any) => c.type === 'PREDECESSOR') ? 'project_plan' : 'general'
        },
        insights: this.generateSheetInsights(sheetData),
        generated_at: new Date().toISOString()
      };
    } catch (error: any) {
      throw new Error(`Failed to generate sheet summary: ${error.message}`);
    }
  }

  private generateSheetInsights(sheetData: any): string[] {
    const insights = [];
    
    // Safely extract data with fallbacks
    const columnInfo = sheetData?.column_info || {};
    const sampleData = Array.isArray(sheetData?.sample_data) ? sheetData.sample_data : [];
    const rowCount = sheetData?.row_count || 0;
    
    // Convert column_info to columns array format
    const columns = Object.entries(columnInfo).map(([title, info]: [string, any]) => ({
      title: title,
      type: info?.debug?._type_ || info?.type || 'TEXT_NUMBER',
      id: info?.id
    }));

    // Check for project plan structure
    if (Array.isArray(columns) && columns.some((c: any) => c.type === 'PREDECESSOR')) {
      insights.push("This appears to be a project plan with dependency tracking");
    }

    // Check data completeness
    if (Array.isArray(columns) && Array.isArray(sampleData)) {
      const emptyColumns = columns.filter((col: any) => 
        !sampleData.some((row: any) => 
          row && typeof row === 'object' && row[col.title] !== null && row[col.title] !== ''
        )
      );
      if (emptyColumns.length > 0) {
        insights.push(`${emptyColumns.length} columns appear to have no data`);
      }
    }

    // Check for potential issues
    if (typeof rowCount === 'number' && rowCount > 1000) {
      insights.push("Large sheet - consider performance optimization");
    }

    // Check for hierarchy indicators
    if (Array.isArray(columns) && columns.some((c: any) => 
      c.title && typeof c.title === 'string' && c.title.toLowerCase().includes('parent')
    )) {
      insights.push("Sheet may have hierarchical structure");
    }

    // Add insight about data availability
    if (sampleData.length === 0) {
      insights.push("No sample data available - sheet may be empty or access limited");
    }

    return insights;
  }

  private async generateGanttData(sheetId: string) {
    try {
      const structureCommand = `${this.pythonPath} -m smartsheet_ops.cli --api-key "${this.apiKey}" --sheet-id "${sheetId}" --operation get_column_map`;
      const { stdout } = await execAsync(structureCommand, execOptions);
      const sheetData = JSON.parse(stdout);

      // Safely extract data with fallbacks
      const columnInfo = sheetData?.column_info || {};
      const sampleData = Array.isArray(sheetData?.sample_data) ? sheetData.sample_data : [];
      
      // Convert column_info to columns array format
      const columns = Object.entries(columnInfo).map(([title, info]: [string, any]) => ({
        title: title,
        type: info?.debug?._type_ || info?.type || 'TEXT_NUMBER',
        id: info?.id,
        primary: title === 'Task Name' // Assume Task Name is primary
      }));
      
      // Find relevant columns for Gantt chart with safe access
      const taskNameCol = Array.isArray(columns) ? columns.find((c: any) => 
        c.primary || (c.title && c.title.toLowerCase().includes('task'))
      ) : null;
      
      const startCol = Array.isArray(columns) ? columns.find((c: any) => 
        c.type === 'ABSTRACT_DATETIME' && c.title && c.title.toLowerCase().includes('start')
      ) : null;
      
      const endCol = Array.isArray(columns) ? columns.find((c: any) => 
        c.type === 'ABSTRACT_DATETIME' && c.title && c.title.toLowerCase().includes('finish')
      ) : null;
      
      const durationCol = Array.isArray(columns) ? columns.find((c: any) => 
        c.type === 'DURATION'
      ) : null;
      
      const predecessorCol = Array.isArray(columns) ? columns.find((c: any) => 
        c.type === 'PREDECESSOR'
      ) : null;
      
      const assignedCol = Array.isArray(columns) ? columns.find((c: any) => 
        c.type === 'CONTACT_LIST'
      ) : null;

      if (!taskNameCol) {
        return {
          sheet_id: sheetId,
          gantt_data: {
            tasks: [],
            timeline: { project_start: null, project_end: null, total_duration: null, milestones: [] },
            critical_path: { has_critical_path: false, critical_tasks: [], bottlenecks: [] },
            resource_allocation: { total_resources: 0, resource_utilization: [], overallocated_resources: [] }
          },
          metadata: {
            total_tasks: 0,
            has_dependencies: false,
            has_resources: false,
            date_range: { earliest: null, latest: null, span_days: null }
          },
          message: "No task name column found - cannot generate Gantt data",
          generated_at: new Date().toISOString()
        };
      }

      // Transform data for Gantt visualization with safe access
      const ganttTasks = Array.isArray(sampleData) ? sampleData.map((row: any, index: number) => ({
        id: index + 1,
        name: (row && typeof row === 'object' && row[taskNameCol.title]) || `Task ${index + 1}`,
        start: startCol && row && typeof row === 'object' ? row[startCol.title] : null,
        end: endCol && row && typeof row === 'object' ? row[endCol.title] : null,
        duration: durationCol && row && typeof row === 'object' ? row[durationCol.title] : null,
        dependencies: predecessorCol && row && typeof row === 'object' ? row[predecessorCol.title] : null,
        assignee: assignedCol && row && typeof row === 'object' ? row[assignedCol.title] : null,
        progress: this.calculateProgress(row, columns)
      })).filter((task: any) => task.name && task.name.trim() !== '') : [];

      return {
        sheet_id: sheetId,
        gantt_data: {
          tasks: ganttTasks,
          timeline: this.calculateTimeline(ganttTasks),
          critical_path: this.identifyCriticalPath(ganttTasks),
          resource_allocation: this.analyzeResourceAllocation(ganttTasks)
        },
        metadata: {
          total_tasks: ganttTasks.length,
          has_dependencies: !!predecessorCol,
          has_resources: !!assignedCol,
          date_range: this.getDateRange(ganttTasks)
        },
        generated_at: new Date().toISOString()
      };
    } catch (error: any) {
      throw new Error(`Failed to generate Gantt data: ${error.message}`);
    }
  }

  private calculateProgress(row: any, columns: any[]): number {
    const progressCol = columns.find((c: any) => 
      c.title.toLowerCase().includes('progress') || 
      c.title.toLowerCase().includes('complete')
    );
    
    if (progressCol && row[progressCol.title]) {
      const value = row[progressCol.title];
      if (typeof value === 'string' && value.includes('%')) {
        return parseInt(value.replace('%', ''));
      }
      if (typeof value === 'number') {
        return value > 1 ? value : value * 100;
      }
    }
    
    return 0;
  }

  private calculateTimeline(ganttTasks: any[]): any {
    const tasksWithDates = ganttTasks.filter(task => task.start || task.end);
    
    if (tasksWithDates.length === 0) {
      return {
        project_start: null,
        project_end: null,
        total_duration: null,
        milestones: []
      };
    }

    const startDates = tasksWithDates.map(task => task.start).filter(Boolean);
    const endDates = tasksWithDates.map(task => task.end).filter(Boolean);
    
    const projectStart = startDates.length > 0 ? new Date(Math.min(...startDates.map((d: string) => new Date(d).getTime()))) : null;
    const projectEnd = endDates.length > 0 ? new Date(Math.max(...endDates.map((d: string) => new Date(d).getTime()))) : null;
    
    const totalDuration = projectStart && projectEnd ? 
      Math.ceil((projectEnd.getTime() - projectStart.getTime()) / (1000 * 60 * 60 * 24)) : null;

    // Identify potential milestones (tasks with 0 duration or specific keywords)
    const milestones = ganttTasks.filter(task => 
      task.duration === '0d' || 
      task.duration === 0 ||
      task.name.toLowerCase().includes('milestone') ||
      task.name.toLowerCase().includes('kickoff') ||
      task.name.toLowerCase().includes('delivery') ||
      task.name.toLowerCase().includes('launch')
    );

    return {
      project_start: projectStart?.toISOString().split('T')[0],
      project_end: projectEnd?.toISOString().split('T')[0],
      total_duration: totalDuration,
      milestones: milestones.map(m => ({
        name: m.name,
        date: m.start || m.end,
        type: this.getMilestoneType(m.name)
      }))
    };
  }

  private getMilestoneType(taskName: string): string {
    const name = taskName.toLowerCase();
    if (name.includes('kickoff') || name.includes('start')) return 'project_start';
    if (name.includes('delivery') || name.includes('launch') || name.includes('go-live')) return 'delivery';
    if (name.includes('review') || name.includes('approval')) return 'checkpoint';
    return 'milestone';
  }

  private identifyCriticalPath(ganttTasks: any[]): any {
    // Simplified critical path analysis
    const tasksWithDependencies = ganttTasks.filter(task => task.dependencies);
    
    if (tasksWithDependencies.length === 0) {
      return {
        has_critical_path: false,
        critical_tasks: [],
        bottlenecks: []
      };
    }

    // Find tasks that are dependencies for multiple other tasks
    const dependencyCount: Record<string, number> = {};
    tasksWithDependencies.forEach(task => {
      if (task.dependencies) {
        const deps = task.dependencies.toString().split(',');
        deps.forEach((dep: string) => {
          const depId = dep.trim();
          dependencyCount[depId] = (dependencyCount[depId] || 0) + 1;
        });
      }
    });

    const bottlenecks = Object.entries(dependencyCount)
      .filter(([_, count]) => count > 1)
      .map(([taskId, count]) => ({
        task_id: taskId,
        dependent_tasks: count,
        task_name: ganttTasks.find(t => t.id.toString() === taskId)?.name || `Task ${taskId}`
      }));

    return {
      has_critical_path: tasksWithDependencies.length > 0,
      critical_tasks: tasksWithDependencies.slice(0, 5), // Top 5 for brevity
      bottlenecks: bottlenecks
    };
  }

  private analyzeResourceAllocation(ganttTasks: any[]): any {
    const tasksWithAssignees = ganttTasks.filter(task => task.assignee);
    
    if (tasksWithAssignees.length === 0) {
      return {
        total_resources: 0,
        resource_utilization: [],
        overallocated_resources: []
      };
    }

    // Count tasks per assignee
    const resourceCount: Record<string, number> = {};
    tasksWithAssignees.forEach(task => {
      const assignee = task.assignee.toString();
      resourceCount[assignee] = (resourceCount[assignee] || 0) + 1;
    });

    const resourceUtilization = Object.entries(resourceCount).map(([resource, taskCount]) => ({
      resource: resource,
      assigned_tasks: taskCount,
      utilization_level: taskCount > 5 ? 'high' : taskCount > 2 ? 'medium' : 'low'
    }));

    const overallocatedResources = resourceUtilization.filter(r => r.utilization_level === 'high');

    return {
      total_resources: Object.keys(resourceCount).length,
      resource_utilization: resourceUtilization,
      overallocated_resources: overallocatedResources
    };
  }

  private getDateRange(ganttTasks: any[]): any {
    const dates = ganttTasks.flatMap(task => [task.start, task.end]).filter(Boolean);
    
    if (dates.length === 0) {
      return { earliest: null, latest: null, span_days: null };
    }

    const sortedDates = dates.map(d => new Date(d)).sort((a, b) => a.getTime() - b.getTime());
    const earliest = sortedDates[0];
    const latest = sortedDates[sortedDates.length - 1];
    const spanDays = Math.ceil((latest.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24));

    return {
      earliest: earliest.toISOString().split('T')[0],
      latest: latest.toISOString().split('T')[0],
      span_days: spanDays
    };
  }

  private async generateWorkspaceOverview(workspaceId: string) {
    try {
      // Get workspace details
      const workspaceCommand = `${this.pythonPath} -m smartsheet_ops.cli --api-key "${this.apiKey}" --workspace-id "${workspaceId}" --operation get_workspace`;
      const { stdout: workspaceData } = await execAsync(workspaceCommand, execOptions);
      const workspace = JSON.parse(workspaceData);

      // Get sheets in workspace
      const sheetsCommand = `${this.pythonPath} -m smartsheet_ops.cli --api-key "${this.apiKey}" --workspace-id "${workspaceId}" --operation list_workspace_sheets`;
      const { stdout: sheetsData } = await execAsync(sheetsCommand, execOptions);
      const sheets = JSON.parse(sheetsData);

      // Analyze sheet types and health
      const sheetAnalysis = await Promise.all(
        (sheets.sheets || []).slice(0, 10).map(async (sheet: any) => {
          try {
            const summaryData = await this.generateSheetSummary(sheet.id);
            return {
              id: sheet.id,
              name: sheet.name,
              type: summaryData.health_indicators.structure_type,
              health_score: this.calculateSheetHealthScore(summaryData),
              last_modified: sheet.modifiedAt,
              row_count: summaryData.metadata.total_rows
            };
          } catch (error) {
            return {
              id: sheet.id,
              name: sheet.name,
              type: 'unknown',
              health_score: 0,
              last_modified: sheet.modifiedAt,
              row_count: 0,
              error: 'Failed to analyze'
            };
          }
        })
      );

      return {
        workspace_id: workspaceId,
        workspace_name: workspace.name || 'Unknown Workspace',
        summary: {
          total_sheets: sheets.sheets?.length || 0,
          project_plans: sheetAnalysis.filter(s => s.type === 'project_plan').length,
          general_sheets: sheetAnalysis.filter(s => s.type === 'general').length,
          average_health_score: sheetAnalysis.reduce((sum, s) => sum + s.health_score, 0) / sheetAnalysis.length
        },
        sheet_analysis: sheetAnalysis,
        recommendations: this.generateWorkspaceRecommendations(sheetAnalysis),
        generated_at: new Date().toISOString()
      };
    } catch (error: any) {
      throw new Error(`Failed to generate workspace overview: ${error.message}`);
    }
  }

  private calculateSheetHealthScore(summaryData: any): number {
    let score = 100;
    
    // Deduct points for data completeness issues
    if (summaryData.health_indicators.data_completeness < 80) {
      score -= (80 - summaryData.health_indicators.data_completeness);
    }
    
    // Deduct points for empty sheets
    if (summaryData.metadata.total_rows < 5) {
      score -= 20;
    }
    
    // Add points for good structure
    if (summaryData.health_indicators.structure_type === 'project_plan') {
      score += 10;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  private generateWorkspaceRecommendations(sheetAnalysis: any[]): string[] {
    const recommendations = [];
    
    const lowHealthSheets = sheetAnalysis.filter(s => s.health_score < 60);
    if (lowHealthSheets.length > 0) {
      recommendations.push(`${lowHealthSheets.length} sheets have low health scores and may need attention`);
    }
    
    const emptySheets = sheetAnalysis.filter(s => s.row_count === 0);
    if (emptySheets.length > 0) {
      recommendations.push(`${emptySheets.length} sheets appear to be empty and could be archived`);
    }
    
    const projectPlans = sheetAnalysis.filter(s => s.type === 'project_plan');
    if (projectPlans.length > 0) {
      recommendations.push(`Consider creating a portfolio dashboard to track ${projectPlans.length} project plans`);
    }
    
    return recommendations;
  }

  private async generateDependencyMap(sheetId: string) {
    try {
      const structureCommand = `${this.pythonPath} -m smartsheet_ops.cli --api-key "${this.apiKey}" --sheet-id "${sheetId}" --operation get_column_map`;
      const { stdout } = await execAsync(structureCommand, execOptions);
      const sheetData = JSON.parse(stdout);

      const { columns, sample_data: sampleData } = sheetData;
      const predecessorCol = columns.find((c: any) => c.type === 'PREDECESSOR');
      
      if (!predecessorCol) {
        return {
          sheet_id: sheetId,
          has_dependencies: false,
          message: "No dependency column found in this sheet",
          generated_at: new Date().toISOString()
        };
      }

      // Analyze dependencies
      const dependencyMap = sampleData
        .filter((row: any) => row[predecessorCol.title])
        .map((row: any, index: number) => ({
          task_id: index + 1,
          task_name: row[columns.find((c: any) => c.primary)?.title] || `Task ${index + 1}`,
          dependencies: row[predecessorCol.title].toString().split(',').map((d: string) => d.trim()),
          dependency_type: this.analyzeDependencyType(row[predecessorCol.title])
        }));

      return {
        sheet_id: sheetId,
        has_dependencies: true,
        dependency_analysis: {
          total_dependent_tasks: dependencyMap.length,
          dependency_map: dependencyMap,
          critical_path_indicators: this.identifyCriticalPath(sampleData),
          potential_bottlenecks: this.identifyBottlenecks(dependencyMap)
        },
        generated_at: new Date().toISOString()
      };
    } catch (error: any) {
      throw new Error(`Failed to generate dependency map: ${error.message}`);
    }
  }

  private analyzeDependencyType(dependencyValue: any): string {
    const depStr = dependencyValue.toString();
    if (depStr.includes('FS')) return 'Finish-to-Start';
    if (depStr.includes('SS')) return 'Start-to-Start';
    if (depStr.includes('FF')) return 'Finish-to-Finish';
    if (depStr.includes('SF')) return 'Start-to-Finish';
    return 'Finish-to-Start'; // Default assumption
  }

  private identifyBottlenecks(dependencyMap: any[]): any[] {
    const dependencyCounts: Record<string, number> = {};
    
    dependencyMap.forEach(task => {
      task.dependencies.forEach((dep: string) => {
        dependencyCounts[dep] = (dependencyCounts[dep] || 0) + 1;
      });
    });

    return Object.entries(dependencyCounts)
      .filter(([_, count]) => count > 2)
      .map(([taskId, count]) => ({
        task_id: taskId,
        blocking_tasks: count,
        risk_level: count > 4 ? 'high' : count > 2 ? 'medium' : 'low'
      }));
  }

  private async generateHealthReport(sheetId: string) {
    try {
      const structureCommand = `${this.pythonPath} -m smartsheet_ops.cli --api-key "${this.apiKey}" --sheet-id "${sheetId}" --operation get_column_map`;
      const { stdout } = await execAsync(structureCommand, execOptions);
      const sheetData = JSON.parse(stdout);

      const { columns, sample_data: sampleData, row_count } = sheetData;

      // Analyze data quality
      const dataQuality = this.analyzeDataQuality(columns, sampleData);
      
      // Check for formula issues
      const formulaHealth = this.analyzeFormulaHealth(columns, sampleData);
      
      // Performance analysis
      const performanceMetrics = this.analyzePerformance(sheetData);
      
      // Structure analysis
      const structureHealth = this.analyzeStructureHealth(columns, sampleData);

      const overallHealthScore = this.calculateOverallHealthScore({
        dataQuality,
        formulaHealth,
        performanceMetrics,
        structureHealth
      });

      return {
        sheet_id: sheetId,
        health_score: overallHealthScore,
        analysis: {
          data_quality: dataQuality,
          formula_health: formulaHealth,
          performance_metrics: performanceMetrics,
          structure_health: structureHealth
        },
        recommendations: this.generateHealthRecommendations({
          dataQuality,
          formulaHealth,
          performanceMetrics,
          structureHealth
        }),
        generated_at: new Date().toISOString()
      };
    } catch (error: any) {
      throw new Error(`Failed to generate health report: ${error.message}`);
    }
  }

  private analyzeDataQuality(columns: any[], sampleData: any[]): any {
    const totalCells = columns.length * sampleData.length;
    let filledCells = 0;
    let inconsistentData = 0;

    columns.forEach(col => {
      const columnData = sampleData.map(row => row[col.title]).filter(val => val !== null && val !== '');
      filledCells += columnData.length;

      // Check for data type consistency
      if (col.type === 'DATE') {
        const invalidDates = columnData.filter(val => val && isNaN(Date.parse(val))).length;
        inconsistentData += invalidDates;
      }
    });

    return {
      completeness_percentage: totalCells > 0 ? (filledCells / totalCells) * 100 : 0,
      consistency_issues: inconsistentData,
      empty_columns: columns.filter(col => 
        !sampleData.some(row => row[col.title] !== null && row[col.title] !== '')
      ).length
    };
  }

  private analyzeFormulaHealth(columns: any[], sampleData: any[]): any {
    const formulaColumns = columns.filter(col => col.type === 'FORMULA');
    
    return {
      total_formula_columns: formulaColumns.length,
      has_formulas: formulaColumns.length > 0,
      potential_circular_references: 0, // Would need more complex analysis
      formula_complexity: formulaColumns.length > 5 ? 'high' : formulaColumns.length > 2 ? 'medium' : 'low'
    };
  }

  private analyzePerformance(sheetData: any): any {
    const { row_count, columns } = sheetData;
    const totalCells = row_count * columns.length;

    return {
      total_rows: row_count,
      total_columns: columns.length,
      total_cells: totalCells,
      size_category: totalCells > 50000 ? 'large' : totalCells > 10000 ? 'medium' : 'small',
      performance_risk: totalCells > 100000 ? 'high' : totalCells > 50000 ? 'medium' : 'low'
    };
  }

  private analyzeStructureHealth(columns: any[], sampleData: any[]): any {
    const hasProjectStructure = columns.some(c => c.type === 'PREDECESSOR');
    const hasDates = columns.some(c => c.type === 'DATE');
    const hasAssignments = columns.some(c => c.type === 'CONTACT_LIST');
    const hasStatus = columns.some(c => c.type === 'PICKLIST');

    return {
      is_project_plan: hasProjectStructure,
      has_date_tracking: hasDates,
      has_resource_assignments: hasAssignments,
      has_status_tracking: hasStatus,
      structure_completeness: [hasProjectStructure, hasDates, hasAssignments, hasStatus].filter(Boolean).length / 4 * 100
    };
  }

  private calculateOverallHealthScore(analysis: any): number {
    const weights = {
      dataQuality: 0.4,
      formulaHealth: 0.2,
      performanceMetrics: 0.2,
      structureHealth: 0.2
    };

    let score = 0;
    
    // Data quality score
    score += (analysis.dataQuality.completeness_percentage * 0.8 + 
             (100 - analysis.dataQuality.consistency_issues * 10)) * weights.dataQuality / 100;
    
    // Formula health score (simplified)
    const formulaScore = analysis.formulaHealth.has_formulas ? 80 : 100;
    score += formulaScore * weights.formulaHealth / 100;
    
    // Performance score
    const perfScore = analysis.performanceMetrics.performance_risk === 'low' ? 100 : 
                     analysis.performanceMetrics.performance_risk === 'medium' ? 70 : 40;
    score += perfScore * weights.performanceMetrics / 100;
    
    // Structure score
    score += analysis.structureHealth.structure_completeness * weights.structureHealth / 100;

    return Math.round(score);
  }

  private generateHealthRecommendations(analysis: any): string[] {
    const recommendations = [];

    if (analysis.dataQuality.completeness_percentage < 80) {
      recommendations.push("Improve data completeness - consider making key fields required");
    }

    if (analysis.dataQuality.empty_columns > 0) {
      recommendations.push(`Remove or populate ${analysis.dataQuality.empty_columns} empty columns`);
    }

    if (analysis.performanceMetrics.performance_risk === 'high') {
      recommendations.push("Consider archiving old data or splitting into multiple sheets for better performance");
    }

    if (!analysis.structureHealth.has_status_tracking) {
      recommendations.push("Add status tracking column for better project visibility");
    }

    if (analysis.formulaHealth.formula_complexity === 'high') {
      recommendations.push("Review complex formulas for optimization opportunities");
    }

    return recommendations;
  }

  // Helper methods for generating prompts
  private generateProjectPlanPrompt(args: any) {
    const projectName = args.project_name || 'New Project';
    const projectType = args.project_type || 'general';
    const duration = args.duration_estimate || 'not specified';

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `I need help creating a project plan for "${projectName}". This is a ${projectType} project with an estimated duration of ${duration}. 

Please guide me through the best practices for setting up the project structure, defining tasks, setting dependencies, and assigning resources. Specifically help me with:

1. **Hierarchical Structure**: How to organize tasks in a logical hierarchy with proper indentation levels (phases → work packages → tasks → subtasks)

2. **Column Setup**: What columns should I include for effective project management (Task Name, Duration, Start/Finish dates, Predecessors, Assigned To, % Complete, Status)

3. **Work Breakdown Structure**: How to break down the project into manageable phases and tasks with clear parent-child relationships

4. **Nesting Best Practices**: 
   - Level 0: Major project phases
   - Level 1: Work packages or deliverables within phases  
   - Level 2: Specific tasks required for each deliverable
   - Level 3: Detailed subtasks (use sparingly)

5. **Dependencies & Scheduling**: How to set up predecessor relationships and realistic durations

6. **Resource Assignment**: Best practices for assigning team members to specific tasks

7. **API Hierarchy Creation**: How to use the Smartsheet API to create hierarchical structures directly using parentId attributes

Please provide specific examples of how to structure the hierarchy for this ${projectType} project, including sample task names and their appropriate nesting levels.

**CRITICAL FOR HIERARCHY**: The Smartsheet API CAN create hierarchical indentation directly! You MUST use parentId attributes:

⚠️ **WITHOUT parentId**: All rows are created flat (no indentation) - this is what happened in your example!
✅ **WITH parentId**: Rows are automatically indented under their parent

**Correct API workflow**:
1. Create parent: \`{ "Task Name": "BCH Prior Authorization Automation Project", "toBottom": true }\`
   → Returns row_id: "1234567890123456" (SAVE THIS!)

2. Create child: \`{ "Task Name": "Phase 1: Foundation & Design", "parentId": "1234567890123456", "toTop": true }\`
   → Returns row_id: "2345678901234567" (SAVE THIS!)

3. Create grandchild: \`{ "Task Name": "Week 1: Project Initiation", "parentId": "2345678901234567", "toTop": true }\`

**Your data was missing parentId attributes** - that's why it created flat rows. To create hierarchy, you must:
- Create parent first, get its row_id
- Create children with parentId set to parent's row_id
- Create grandchildren with parentId set to child's row_id

**Cannot create hierarchy in single API call** - must create level by level, using returned row_ids as parentId for next level.`
          }
        }
      ]
    };
  }

  private generateProjectAnalysisPrompt(args: any) {
    const sheetId = args.sheet_id;
    const focusArea = args.focus_area || 'overall health';

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please analyze the project in sheet ${sheetId} with a focus on ${focusArea}. I need insights on project health, potential risks, timeline adherence, resource utilization, and recommendations for improvement. What patterns do you see in the data and what actions should I take?`
          }
        }
      ]
    };
  }

  private generateWorkflowOptimizationPrompt(args: any) {
    const sheetId = args.sheet_id;
    const workflowType = args.workflow_type || 'general';

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `I want to optimize the ${workflowType} workflow in sheet ${sheetId}. Please analyze the current structure and suggest improvements for better efficiency, automation opportunities, and user experience. What changes would make this workflow more effective?`
          }
        }
      ]
    };
  }

  private generateInsightsPrompt(args: any) {
    const sheetId = args.sheet_id;
    const insightType = args.insight_type || 'general trends';

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please analyze sheet ${sheetId} and extract key insights focusing on ${insightType}. I'm looking for patterns, trends, anomalies, and actionable intelligence from the data. What story does this data tell and what decisions should I make based on these insights?`
          }
        }
      ]
    };
  }

  private generateDashboardSummaryPrompt(args: any) {
    const workspaceId = args.workspace_id;
    const summaryFocus = args.summary_focus || 'overall progress';

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Create an executive dashboard summary for workspace ${workspaceId} focusing on ${summaryFocus}. I need a high-level overview that executives can quickly understand, including key metrics, status indicators, risk areas, and strategic recommendations. What are the most important insights for leadership?`
          }
        }
      ]
    };
  }

  private generateConditionalFormattingPrompt(args: any) {
    const sheetId = args.sheet_id;
    const formattingGoal = args.formatting_goal || 'status visualization';

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Help me set up conditional formatting for sheet ${sheetId} to achieve ${formattingGoal}. I want to make the data more visually intuitive and easier to understand at a glance. What formatting rules should I create and how should I configure them for maximum impact?`
          }
        }
      ]
    };
  }
}

// Parse command line arguments
function parseArgs(): { transport: 'stdio' | 'http', port?: number } {
  const args = process.argv.slice(2);
  const result: { transport: 'stdio' | 'http', port?: number } = { transport: 'stdio' };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--transport') {
      const transport = args[i + 1];
      if (transport === 'http' || transport === 'stdio') {
        result.transport = transport;
        i++; // Skip next argument since we consumed it
      } else {
        console.error('Invalid transport. Use "stdio" or "http"');
        process.exit(1);
      }
    } else if (arg === '--port') {
      const port = parseInt(args[i + 1]);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error('Invalid port number');
        process.exit(1);
      }
      result.port = port;
      i++; // Skip next argument since we consumed it
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Smartsheet MCP Server

Usage: smartsheet-server [options]

Options:
  --transport <type>    Transport type: "stdio" (default) or "http"
  --port <number>       HTTP port (default: 3000, only used with --transport http)
  --help, -h            Show this help message

Examples:
  smartsheet-server                           # Run with stdio transport
  smartsheet-server --transport stdio        # Run with stdio transport (explicit)
  smartsheet-server --transport http         # Run with HTTP transport on port 3000
  smartsheet-server --transport http --port 8080  # Run with HTTP transport on port 8080

Environment Variables:
  SMARTSHEET_API_KEY    Required: Your Smartsheet API key
  PYTHON_PATH           Required: Path to Python executable with smartsheet_ops installed
  AZURE_OPENAI_API_KEY  Optional: For batch analysis features
  AZURE_OPENAI_API_BASE Optional: Azure OpenAI endpoint
  AZURE_OPENAI_API_VERSION Optional: Azure OpenAI API version
      `);
      process.exit(0);
    }
  }
  
  return result;
}

const { transport, port } = parseArgs();
const server = new SmartsheetServer();

if (transport === 'http') {
  server.runHttp(port).catch(console.error);
} else {
  server.runStdio().catch(console.error);
}
