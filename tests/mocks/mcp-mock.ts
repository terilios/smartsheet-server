/**
 * Mock infrastructure for MCP (Model Context Protocol) testing
 */

import { jest } from '@jest/globals';
import { 
  CallToolRequest, 
  CallToolResult, 
  Tool, 
  ListToolsResult,
  ErrorCode,
  McpError 
} from '@modelcontextprotocol/sdk/types';

export interface MockMcpServerOptions {
  pythonPath?: string;
  apiKey?: string;
  enableLogging?: boolean;
}

export class MockMcpServer {
  private tools: Tool[] = [];
  private pythonPath: string;
  private apiKey: string;
  private enableLogging: boolean;
  private shouldSimulateFailure: boolean = false;
  private failureScenarios: Map<string, any> = new Map();

  constructor(options: MockMcpServerOptions = {}) {
    this.pythonPath = options.pythonPath || '/usr/bin/python3';
    this.apiKey = options.apiKey || 'test-api-key';
    this.enableLogging = options.enableLogging || false;
  }

  /**
   * Register a tool for testing
   */
  registerTool(tool: Tool): void {
    this.tools.push(tool);
  }

  /**
   * Configure failure scenarios for testing
   */
  setFailureScenario(toolName: string, scenario: 'error' | 'invalid_response' | 'timeout' | 'success_with_error'): void {
    this.failureScenarios.set(toolName, scenario);
  }

  /**
   * Clear all failure scenarios
   */
  clearFailureScenarios(): void {
    this.failureScenarios.clear();
    this.shouldSimulateFailure = false;
  }

  /**
   * Access to internal properties for testing
   */
  get pythonPath(): string { return this.pythonPath; }
  get apiKey(): string { return this.apiKey; }
  set tools(tools: Tool[]) { this.tools = tools; }

  /**
   * Mock list_tools handler
   */
  async listTools(): Promise<ListToolsResult> {
    return {
      tools: this.tools
    };
  }

  /**
   * Mock call_tool handler with validation
   */
  async callTool(request: CallToolRequest): Promise<CallToolResult> {
    const { name, arguments: args } = request.params;

    // Find the tool
    const tool = this.tools.find(t => t.name === name);
    if (!tool) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Unknown tool: ${name}`
      );
    }

    // Validate arguments against schema
    this.validateArguments(args, tool.inputSchema);

    // Route to appropriate mock handler
    return this.routeToolCall(name, args);
  }

  /**
   * Validate arguments against JSON schema
   */
  private validateArguments(args: any, schema: any): void {
    if (!args || typeof args !== 'object') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid arguments: must be an object'
      );
    }

    // Basic validation for required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in args)) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Missing required parameter: ${field}`
          );
        }
      }
    }
  }

  /**
   * Route tool calls to mock implementations
   */
  private async routeToolCall(toolName: string, args: any): Promise<CallToolResult> {
    // Check for failure scenarios first
    const failureScenario = this.failureScenarios.get(toolName);
    if (failureScenario) {
      return this.handleFailureScenario(failureScenario, toolName, args);
    }

    // Simulate calling the Python CLI if mockExec is available
    const mockData = await this.simulatePythonCliCall(toolName, args);

    // Simulate some processing time
    await new Promise(resolve => setTimeout(resolve, 10));

    // Handle special case for raw responses (like invalid JSON)
    if (mockData && mockData._rawResponse) {
      return {
        content: [
          {
            type: 'text',
            text: mockData._rawResponse
          }
        ]
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(mockData, null, 2)
        }
      ]
    };
  }

  /**
   * Handle failure scenarios for testing
   */
  private async handleFailureScenario(scenario: string, toolName: string, args: any): Promise<CallToolResult> {
    switch (scenario) {
      case 'error':
        throw new McpError(
          ErrorCode.InternalError,
          `Simulated error for ${toolName}`
        );
      
      case 'invalid_response':
        return {
          content: [
            {
              type: 'text',
              text: 'Invalid JSON{'
            }
          ]
        };
      
      case 'timeout':
        throw new McpError(
          ErrorCode.InternalError,
          'Command timeout'
        );
      
      case 'success_with_error':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                operation: toolName,
                error: `Simulated API error for ${toolName}`,
                details: args
              }, null, 2)
            }
          ]
        };
      
      default:
        return this.routeToolCall(toolName, args);
    }
  }

  /**
   * Simulate Python CLI execution if mockExec is available in global scope
   */
  private async simulatePythonCliCall(toolName: string, args: any): Promise<any> {
    // Check if we're in a Jest environment with mocked child_process
    if (typeof jest !== 'undefined') {
      try {
        const { exec } = jest.requireMock('child_process');
        if (exec && typeof exec === 'function') {
          // Build the CLI command that would be executed
          const command = this.buildCliCommand(toolName, args);
          const options = {
            timeout: 300000,
            maxBuffer: 10 * 1024 * 1024
          };

          // Create a promise to handle the mock exec call
          return new Promise((resolve, reject) => {
            const callback = (error: any, result: any, stderr?: any) => {
              if (error) {
                reject(new McpError(ErrorCode.InternalError, error.message));
              } else if (stderr) {
                // Try to parse stderr as JSON error response
                try {
                  const errorData = JSON.parse(stderr);
                  if (!errorData.success) {
                    resolve(errorData);
                  } else {
                    resolve(this.getMockData(toolName, args));
                  }
                } catch {
                  reject(new McpError(ErrorCode.InternalError, stderr));
                }
              } else if (result && result.stdout) {
                try {
                  const parsedResult = JSON.parse(result.stdout);
                  resolve(parsedResult);
                } catch {
                  // If stdout is not valid JSON, return as is for malformed JSON tests
                  if (result.stdout === 'Invalid JSON{') {
                    // Return invalid JSON directly without throwing error
                    resolve({ _rawResponse: result.stdout });
                  } else {
                    resolve(this.getMockData(toolName, args));
                  }
                }
              } else if (typeof result === 'object' && result !== null) {
                // Direct result object
                resolve(result);
              } else {
                resolve(this.getMockData(toolName, args));
              }
            };

            // Simulate the exec call
            try {
              exec(command, options, callback);
            } catch (execError) {
              reject(new McpError(ErrorCode.InternalError, execError.message));
            }
          });
        }
      } catch (error) {
        // Fall back to mock data if Jest mocking isn't set up
      }
    }
    
    // Fall back to mock data
    return this.getMockData(toolName, args);
  }

  /**
   * Build CLI command string for simulation
   */
  private buildCliCommand(toolName: string, args: any): string {
    const operation = this.getOperationFromTool(toolName);
    let command = `${this.pythonPath} -m smartsheet_ops.cli --operation ${operation}`;
    
    if (args.sheet_id) {
      command += ` --sheet-id ${args.sheet_id}`;
    }
    
    if (Object.keys(args).length > 1 || !args.sheet_id) {
      const dataArgs = { ...args };
      if (args.sheet_id) delete dataArgs.sheet_id;
      if (Object.keys(dataArgs).length > 0) {
        command += ` --data '${JSON.stringify(dataArgs)}'`;
      }
    }
    
    return command;
  }

  /**
   * Map tool names to CLI operations
   */
  private getOperationFromTool(toolName: string): string {
    const operationMap: { [key: string]: string } = {
      'get_column_map': 'get_column_map',
      'get_sheet_info': 'get_column_map',
      'smartsheet_write': 'add_rows',
      'smartsheet_search': 'search_sheet',
      'smartsheet_get_sheet_cross_references': 'get_sheet_cross_references',
      'smartsheet_create_discussion': 'create_discussion',
      'smartsheet_upload_attachment': 'upload_attachment',
      'list_workspaces': 'list_workspaces'
    };
    
    return operationMap[toolName] || toolName;
  }

  /**
   * Get mock data based on tool name and arguments
   */
  private getMockData(toolName: string, args: any): any {
    switch (toolName) {
      case 'get_column_map':
      case 'get_sheet_info':
        return this.getMockSheetInfo(args.sheet_id);
      
      case 'smartsheet_write':
        return this.getMockWriteResult(args);
      
      case 'smartsheet_search':
        return this.getMockSearchResult(args);
      
      case 'smartsheet_get_sheet_cross_references':
        return this.getMockCrossReferences(args);
      
      case 'smartsheet_create_discussion':
        return this.getMockDiscussion(args);
      
      case 'smartsheet_upload_attachment':
        return this.getMockAttachment(args);
      
      case 'list_workspaces':
        return this.getMockWorkspaces();
      
      default:
        return {
          success: true,
          operation: toolName,
          message: `Mock result for ${toolName}`,
          data: args
        };
    }
  }

  private getMockSheetInfo(sheetId: string) {
    return {
      success: true,
      sheet_id: sheetId,
      sheet_name: 'Test Sheet',
      column_map: {
        'Task Name': '7777777777777777',
        'Status': '8888888888888888',
        'Due Date': '9999999999999999'
      },
      sample_data: [
        {
          'Task Name': 'Test Task 1',
          'Status': 'In Progress',
          'Due Date': '2024-01-15'
        },
        {
          'Task Name': 'Test Task 2',
          'Status': 'Complete',
          'Due Date': '2024-01-10'
        }
      ],
      metadata: {
        total_columns: 3,
        total_rows: 2,
        system_columns: 0,
        formula_columns: 0
      }
    };
  }

  private getMockWriteResult(args: any) {
    return {
      success: true,
      rows_added: args.row_data?.length || 0,
      message: 'Rows added successfully',
      row_ids: ['5555555555555555', '6666666666666666']
    };
  }

  private getMockSearchResult(args: any) {
    return {
      success: true,
      pattern: args.pattern,
      matches_found: 2,
      matched_row_ids: ['5555555555555555', '6666666666666666'],
      search_details: [
        {
          row_id: '5555555555555555',
          column_matches: ['Task Name'],
          match_text: args.pattern
        }
      ]
    };
  }

  private getMockCrossReferences(args: any) {
    return {
      success: true,
      sheet_id: args.sheet_id,
      sheet_name: 'Test Sheet',
      total_references: 1,
      cross_references: [
        {
          row_id: '5555555555555555',
          column_id: '7777777777777777',
          column_title: 'Referenced Value',
          reference: '[Target Sheet]Column1',
          referenced_sheet_name: 'Target Sheet',
          formula: '=INDEX({[Target Sheet]Column1:Column1}, MATCH([ID]@row, {[Target Sheet]ID:ID}, 0))',
          cell_value: 'Result Value'
        }
      ],
      include_details: args.include_details || true
    };
  }

  private getMockDiscussion(args: any) {
    return {
      success: true,
      discussion_id: '1111111111111111',
      title: args.title || 'Test Discussion',
      comment_count: 1,
      discussion_type: args.discussion_type,
      target_id: args.target_id,
      created_by: 'test@example.com',
      created_at: new Date().toISOString()
    };
  }

  private getMockAttachment(args: any) {
    return {
      success: true,
      attachment_id: '3333333333333333',
      file_name: args.file_name || 'test_file.pdf',
      file_size: 1024,
      attachment_type: args.attachment_type,
      target_id: args.target_id,
      upload_url: 'https://smartsheet.com/attachments/3333333333333333'
    };
  }

  private getMockWorkspaces() {
    return {
      success: true,
      total_workspaces: 2,
      workspaces: [
        {
          workspace_id: '9876543210987654',
          name: 'Test Workspace',
          permalink: 'https://app.smartsheet.com/workspaces/9876543210987654'
        },
        {
          workspace_id: '8876543210987654',
          name: 'Healthcare Workspace',
          permalink: 'https://app.smartsheet.com/workspaces/8876543210987654'
        }
      ]
    };
  }
}

/**
 * Mock exec function for child_process
 */
export function createMockExec(defaultResponse?: any) {
  return jest.fn().mockImplementation((command: string, options: any, callback: any) => {
    // Parse command to determine what operation is being called
    const operationMatch = command.match(/--operation\s+(\w+)/);
    const operation = operationMatch ? operationMatch[1] : 'unknown';
    
    // Create mock response based on operation
    let mockResponse = defaultResponse || {
      success: true,
      operation: operation,
      timestamp: new Date().toISOString(),
      test_mode: true
    };

    // If defaultResponse was provided, use it but ensure it has the right operation
    if (defaultResponse && typeof defaultResponse === 'object') {
      mockResponse = {
        ...defaultResponse,
        operation: operation
      };
    }

    // Simulate async behavior
    process.nextTick(() => {
      if (callback) {
        callback(null, { 
          stdout: JSON.stringify(mockResponse, null, 2), 
          stderr: '' 
        });
      }
    });
  });
}

/**
 * Create a mock exec function that can simulate different scenarios
 */
export function createConfigurableMockExec() {
  const mockExec = jest.fn();
  
  // Helper methods to configure behavior
  mockExec.mockSuccess = (response: any) => {
    mockExec.mockImplementation((command: string, options: any, callback: any) => {
      process.nextTick(() => {
        callback(null, { stdout: JSON.stringify(response, null, 2), stderr: '' });
      });
    });
  };
  
  mockExec.mockError = (error: string | Error) => {
    mockExec.mockImplementation((command: string, options: any, callback: any) => {
      process.nextTick(() => {
        callback(error instanceof Error ? error : new Error(error), null);
      });
    });
  };
  
  mockExec.mockStderrError = (errorMessage: string) => {
    mockExec.mockImplementation((command: string, options: any, callback: any) => {
      const errorResponse = { success: false, error: errorMessage };
      process.nextTick(() => {
        callback(null, { stdout: JSON.stringify(errorResponse, null, 2), stderr: errorMessage });
      });
    });
  };
  
  mockExec.mockInvalidJson = () => {
    mockExec.mockImplementation((command: string, options: any, callback: any) => {
      process.nextTick(() => {
        callback(null, { stdout: 'Invalid JSON{', stderr: '' });
      });
    });
  };
  
  mockExec.mockTimeout = () => {
    mockExec.mockImplementation((command: string, options: any, callback: any) => {
      const error = new Error('Command timeout') as any;
      error.killed = true;
      error.signal = 'SIGTERM';
      process.nextTick(() => {
        callback(error, null);
      });
    });
  };
  
  return mockExec;
}

/**
 * Create a complete mock Smartsheet server for testing
 */
export function createMockSmartsheetServer(options: MockMcpServerOptions = {}): MockMcpServer {
  const server = new MockMcpServer(options);
  
  // Don't pre-register tools - let tests register what they need
  // This provides more flexibility and cleaner test isolation
  
  return server;
}

/**
 * Create a mock server with common Smartsheet tools pre-registered for integration tests
 */
export function createMockSmartsheetServerWithTools(options: MockMcpServerOptions = {}): MockMcpServer {
  const server = new MockMcpServer(options);
  
  // Register common tools for integration testing
  const tools: Tool[] = [
    {
      name: 'get_column_map',
      description: 'Get column mapping and sample data from a Smartsheet',
      inputSchema: {
        type: 'object',
        properties: {
          sheet_id: { type: 'string', description: 'Smartsheet sheet ID' }
        },
        required: ['sheet_id']
      }
    },
    {
      name: 'smartsheet_get_sheet_cross_references',
      description: 'Get all cross-sheet references in a sheet',
      inputSchema: {
        type: 'object',
        properties: {
          sheet_id: { type: 'string', description: 'Smartsheet sheet ID to analyze' },
          include_details: { type: 'boolean', description: 'Include detailed formula analysis', default: true }
        },
        required: ['sheet_id']
      }
    },
    {
      name: 'smartsheet_write',
      description: 'Write data to Smartsheet',
      inputSchema: {
        type: 'object',
        properties: {
          sheet_id: { type: 'string', description: 'Smartsheet sheet ID' },
          row_data: { type: 'array', description: 'Array of row data objects' },
          column_map: { type: 'object', description: 'Column mapping object' }
        },
        required: ['sheet_id', 'row_data', 'column_map']
      }
    },
    {
      name: 'smartsheet_create_discussion',
      description: 'Create a discussion on a sheet or row',
      inputSchema: {
        type: 'object',
        properties: {
          sheet_id: { type: 'string', description: 'Smartsheet sheet ID' },
          discussion_type: { type: 'string', enum: ['sheet', 'row'], description: 'Type of discussion' },
          comment_text: { type: 'string', description: 'Discussion comment text' },
          title: { type: 'string', description: 'Discussion title' },
          target_id: { type: 'string', description: 'Target row ID (for row discussions)' }
        },
        required: ['sheet_id', 'discussion_type', 'comment_text']
      }
    },
    {
      name: 'smartsheet_upload_attachment',
      description: 'Upload attachment to sheet, row, or comment',
      inputSchema: {
        type: 'object',
        properties: {
          sheet_id: { type: 'string', description: 'Smartsheet sheet ID' },
          file_path: { type: 'string', description: 'Path to file to upload' },
          attachment_type: { type: 'string', enum: ['sheet', 'row', 'comment'], description: 'Type of attachment' },
          target_id: { type: 'string', description: 'Target ID (row or comment)' },
          file_name: { type: 'string', description: 'Custom file name' }
        },
        required: ['sheet_id', 'file_path', 'attachment_type']
      }
    },
    {
      name: 'list_workspaces',
      description: 'List all available workspaces',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  ];

  tools.forEach(tool => server.registerTool(tool));
  
  return server;
}

/**
 * Helper to create mock CLI responses
 */
export function createMockCliResponse(operation: string, success: boolean = true, data: any = {}) {
  return JSON.stringify({
    success,
    operation,
    timestamp: new Date().toISOString(),
    ...data
  }, null, 2);
}

export default {
  MockMcpServer,
  createMockExec,
  createMockSmartsheetServer,
  createMockCliResponse
};