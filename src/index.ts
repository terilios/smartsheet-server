#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { promisify } from 'util';
import { exec } from 'child_process';
import path from 'path';

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
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
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
        }
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;
        
        // Validate and extract required arguments
        if (!args || typeof args !== 'object') {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Invalid arguments'
          );
        }

        const sheet_id = args.sheet_id as string;
        
        if (!sheet_id) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Missing required parameter: sheet_id'
          );
        }
        
        // Map tool names to CLI operations
        const operationMap: Record<string, string> = {
          'get_column_map': 'get_column_map',
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
          'get_job_status': 'get_job_status'
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
        let command = `${this.pythonPath} -m smartsheet_ops.cli --api-key "${this.apiKey}" --sheet-id "${sheet_id}" --operation ${operation}`;
        
        // Add data based on operation
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
                // Escape special characters and properly quote the JSON data
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
          // Escape special characters and properly quote the JSON data
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
          // Escape special characters and properly quote the JSON data
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
        
        // Execute command with environment variables
        const { stdout, stderr } = await execAsync(command, {
          env: {
            ...process.env,  // Include existing environment
            ...env  // Add Azure OpenAI variables
          },
          shell: '/bin/bash'  // Use bash shell to ensure environment variables are passed correctly
        });
        
        // Try to parse stdout as JSON
        try {
          const result = JSON.parse(stdout);
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
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Smartsheet MCP server running on stdio');
  }
}

const server = new SmartsheetServer();
server.run().catch(console.error);
