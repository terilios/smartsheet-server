/**
 * Mock infrastructure for MCP (Model Context Protocol) testing
 */
import { jest } from '@jest/globals';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
export class MockMcpServer {
    tools = [];
    pythonPath;
    apiKey;
    enableLogging;
    constructor(options = {}) {
        this.pythonPath = options.pythonPath || '/usr/bin/python3';
        this.apiKey = options.apiKey || 'test-api-key';
        this.enableLogging = options.enableLogging || false;
    }
    /**
     * Register a tool for testing
     */
    registerTool(tool) {
        this.tools.push(tool);
    }
    /**
     * Mock list_tools handler
     */
    async listTools() {
        return {
            tools: this.tools
        };
    }
    /**
     * Mock call_tool handler with validation
     */
    async callTool(request) {
        const { name, arguments: args } = request.params;
        // Find the tool
        const tool = this.tools.find(t => t.name === name);
        if (!tool) {
            throw new McpError(ErrorCode.InvalidRequest, `Unknown tool: ${name}`);
        }
        // Validate arguments against schema
        this.validateArguments(args, tool.inputSchema);
        // Route to appropriate mock handler
        return this.routeToolCall(name, args);
    }
    /**
     * Validate arguments against JSON schema
     */
    validateArguments(args, schema) {
        if (!args || typeof args !== 'object') {
            throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments: must be an object');
        }
        // Basic validation for required fields
        if (schema.required) {
            for (const field of schema.required) {
                if (!(field in args)) {
                    throw new McpError(ErrorCode.InvalidParams, `Missing required parameter: ${field}`);
                }
            }
        }
    }
    /**
     * Route tool calls to mock implementations
     */
    async routeToolCall(toolName, args) {
        const mockData = this.getMockData(toolName, args);
        // Simulate some processing time
        await new Promise(resolve => setTimeout(resolve, 10));
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
     * Get mock data based on tool name and arguments
     */
    getMockData(toolName, args) {
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
    getMockSheetInfo(sheetId) {
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
    getMockWriteResult(args) {
        return {
            success: true,
            rows_added: args.row_data?.length || 0,
            message: 'Rows added successfully',
            row_ids: ['5555555555555555', '6666666666666666']
        };
    }
    getMockSearchResult(args) {
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
    getMockCrossReferences(args) {
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
    getMockDiscussion(args) {
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
    getMockAttachment(args) {
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
    getMockWorkspaces() {
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
export function createMockExec() {
    return jest.fn().mockImplementation((command, options, callback) => {
        // Parse command to determine what operation is being called
        const operationMatch = command.match(/--operation\s+(\w+)/);
        const operation = operationMatch ? operationMatch[1] : 'unknown';
        // Create mock response based on operation
        const mockResponse = {
            success: true,
            operation: operation,
            timestamp: new Date().toISOString(),
            test_mode: true
        };
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
 * Create a complete mock Smartsheet server for testing
 */
export function createMockSmartsheetServer(options = {}) {
    const server = new MockMcpServer(options);
    // Register all 34 tools
    const tools = [
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
        }
        // Add more tools as needed for testing
    ];
    tools.forEach(tool => server.registerTool(tool));
    return server;
}
/**
 * Helper to create mock CLI responses
 */
export function createMockCliResponse(operation, success = true, data = {}) {
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
//# sourceMappingURL=mcp-mock.js.map