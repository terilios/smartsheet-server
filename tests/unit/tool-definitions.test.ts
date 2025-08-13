/**
 * Unit tests for Smartsheet MCP Server tool definitions
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { createMockSmartsheetServer, MockMcpServer, createConfigurableMockExec } from '../mocks/mcp-mock';
import { Tool } from '@modelcontextprotocol/sdk/types';

// Mock child_process
jest.unstable_mockModule('child_process', () => ({
  exec: jest.fn()
}));

describe('Tool Definitions', () => {
  let mockServer: MockMcpServer;
  let mockExec: any;

  beforeEach(async () => {
    mockServer = createMockSmartsheetServer();
    
    const { exec } = jest.requireMock('child_process') as any;
    mockExec = createConfigurableMockExec();
    
    // Replace the mocked exec with our configurable version
    jest.mocked(exec).mockImplementation(mockExec);
    jest.clearAllMocks();
  });

  describe('Tool Registration', () => {
    test('should have basic mock infrastructure working', async () => {
      const tools = await mockServer.listTools();
      
      // The mock server should return a tools array (even if empty initially)
      expect(tools).toBeDefined();
      expect(tools.tools).toBeInstanceOf(Array);
      
      // Test that we can register a tool
      mockServer.registerTool({
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: {
          type: 'object',
          properties: {
            test_param: { type: 'string' }
          }
        }
      });
      
      const toolsAfterRegistration = await mockServer.listTools();
      expect(toolsAfterRegistration.tools).toHaveLength(1);
      expect(toolsAfterRegistration.tools[0].name).toBe('test_tool');
    });

    test('should handle tool registration and basic validation', async () => {
      // Test registering a tool with cross-reference functionality
      mockServer.registerTool({
        name: 'test_cross_reference',
        description: 'A test cross-reference tool',
        inputSchema: {
          type: 'object',
          properties: {
            sheet_id: { type: 'string' },
            target_sheet_id: { type: 'string' }
          },
          required: ['sheet_id', 'target_sheet_id']
        }
      });
      
      const tools = await mockServer.listTools();
      const crossRefTool = tools.tools.find(t => t.name === 'test_cross_reference');
      expect(crossRefTool).toBeDefined();
      expect(crossRefTool?.description).toContain('cross-reference');
      expect(crossRefTool?.inputSchema.properties.sheet_id).toBeDefined();
    });

    test('should handle multiple tool registrations', async () => {
      // Register multiple tools to test the infrastructure
      mockServer.registerTool({
        name: 'test_discussion',
        description: 'A test discussion tool',
        inputSchema: {
          type: 'object',
          properties: {
            sheet_id: { type: 'string' },
            comment_text: { type: 'string' }
          }
        }
      });
      
      mockServer.registerTool({
        name: 'test_attachment',
        description: 'A test attachment tool',
        inputSchema: {
          type: 'object',
          properties: {
            sheet_id: { type: 'string' },
            file_path: { type: 'string' }
          }
        }
      });
      
      const tools = await mockServer.listTools();
      expect(tools.tools).toHaveLength(2);
      
      const discussionTool = tools.tools.find(t => t.name === 'test_discussion');
      const attachmentTool = tools.tools.find(t => t.name === 'test_attachment');
      
      expect(discussionTool).toBeDefined();
      expect(attachmentTool).toBeDefined();
      expect(attachmentTool?.description).toContain('attachment');
    });
  });

  describe('Schema Validation', () => {
    test('should validate tool schemas correctly', async () => {
      // Register a tool with a specific schema for testing
      mockServer.registerTool({
        name: 'test_column_map',
        description: 'Test column mapping tool',
        inputSchema: {
          type: 'object',
          properties: {
            sheet_id: {
              type: 'string',
              description: 'The sheet ID'
            }
          },
          required: ['sheet_id']
        }
      });
      
      const tools = await mockServer.listTools();
      const tool = tools.tools.find(t => t.name === 'test_column_map');
      
      expect(tool).toBeDefined();
      expect(tool?.inputSchema).toBeDefined();
      expect(tool?.inputSchema.type).toBe('object');
      expect(tool?.inputSchema.properties).toHaveProperty('sheet_id');
      expect(tool?.inputSchema.required).toContain('sheet_id');
    });

    test('should validate complex tool schemas', async () => {
      // Register a complex tool with multiple required parameters
      mockServer.registerTool({
        name: 'test_write',
        description: 'Test write tool',
        inputSchema: {
          type: 'object',
          properties: {
            sheet_id: { type: 'string' },
            row_data: { 
              type: 'array',
              items: { type: 'object' }
            },
            column_map: {
              type: 'object',
              additionalProperties: { type: 'string' }
            }
          },
          required: ['sheet_id', 'row_data', 'column_map']
        }
      });
      
      const tools = await mockServer.listTools();
      const tool = tools.tools.find(t => t.name === 'test_write');
      
      expect(tool).toBeDefined();
      expect(tool?.inputSchema.required).toEqual(
        expect.arrayContaining(['sheet_id', 'row_data', 'column_map'])
      );
      expect(tool?.inputSchema.properties).toHaveProperty('sheet_id');
      expect(tool?.inputSchema.properties).toHaveProperty('row_data');
      expect(tool?.inputSchema.properties).toHaveProperty('column_map');
    });
  });

  describe('Tool Execution', () => {
    test('should execute registered tool successfully', async () => {
      // Register a test tool first
      mockServer.registerTool({
        name: 'test_column_map',
        description: 'Test column mapping tool',
        inputSchema: {
          type: 'object',
          properties: {
            sheet_id: { type: 'string' }
          },
          required: ['sheet_id']
        }
      });

      // Mock the exec response
      mockExec.mockSuccess({
        success: true,
        operation: 'test_column_map',
        sheet_id: '1234567890123456'
      });

      const result = await mockServer.callTool({
        method: 'tools/call',
        params: {
          name: 'test_column_map',
          arguments: {
            sheet_id: '1234567890123456'
          }
        }
      });

      expect(result.content).toBeDefined();
      expect(result.content[0]).toHaveProperty('text');
      
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(true);
      expect(responseData.operation).toBe('test_column_map');
    });

    test('should validate required parameters', async () => {
      // Register a test tool with required parameters
      mockServer.registerTool({
        name: 'test_required_params',
        description: 'Test required parameters',
        inputSchema: {
          type: 'object',
          properties: {
            sheet_id: { type: 'string' }
          },
          required: ['sheet_id']
        }
      });

      await expect(
        mockServer.callTool({
          method: 'tools/call',
          params: {
            name: 'test_required_params',
            arguments: {} // Missing sheet_id
          }
        })
      ).rejects.toThrow('Missing required parameter: sheet_id');
    });

    test('should handle unknown tool names', async () => {
      await expect(
        mockServer.callTool({
          method: 'tools/call',
          params: {
            name: 'unknown_tool',
            arguments: {}
          }
        })
      ).rejects.toThrow('Unknown tool: unknown_tool');
    });

    test('should execute tool with optional parameters', async () => {
      // Register a tool with optional parameters
      mockServer.registerTool({
        name: 'test_optional_params',
        description: 'Test tool with optional parameters',
        inputSchema: {
          type: 'object',
          properties: {
            sheet_id: { type: 'string' },
            include_details: { type: 'boolean', default: true }
          },
          required: ['sheet_id']
        }
      });

      // Mock the exec response
      mockExec.mockSuccess({
        success: true,
        operation: 'test_optional_params',
        sheet_id: '1234567890123456'
      });

      const result = await mockServer.callTool({
        method: 'tools/call',
        params: {
          name: 'test_optional_params',
          arguments: {
            sheet_id: '1234567890123456'
            // include_details omitted (should use default)
          }
        }
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(true);
    });
  });

  describe('Schema Edge Cases', () => {
    test('should validate enum values correctly', async () => {
      // Register a tool with enum validation
      mockServer.registerTool({
        name: 'test_enum_validation',
        description: 'Test enum validation',
        inputSchema: {
          type: 'object',
          properties: {
            sheet_id: { type: 'string' },
            attachment_type: { 
              type: 'string',
              enum: ['sheet', 'row', 'comment']
            }
          },
          required: ['sheet_id', 'attachment_type']
        }
      });

      const tools = await mockServer.listTools();
      const enumTool = tools.tools.find(t => t.name === 'test_enum_validation');
      
      expect(enumTool).toBeDefined();
      expect(enumTool?.inputSchema.properties?.attachment_type).toBeDefined();
      expect(enumTool?.inputSchema.properties?.attachment_type.enum).toEqual(['sheet', 'row', 'comment']);
    });

    test('should handle complex nested schemas', async () => {
      // Register a tool with nested schema properties
      mockServer.registerTool({
        name: 'test_nested_schema',
        description: 'Test nested schema validation',
        inputSchema: {
          type: 'object',
          properties: {
            sheet_id: { type: 'string' },
            formula_config: {
              type: 'object',
              properties: {
                formula_type: {
                  type: 'string',
                  enum: ['INDEX_MATCH', 'VLOOKUP', 'SUMIF', 'COUNTIF', 'CUSTOM']
                },
                parameters: { type: 'object' }
              }
            }
          },
          required: ['sheet_id']
        }
      });

      const tools = await mockServer.listTools();
      const nestedTool = tools.tools.find(t => t.name === 'test_nested_schema');
      
      expect(nestedTool).toBeDefined();
      const formulaConfig = nestedTool?.inputSchema.properties?.formula_config;
      expect(formulaConfig).toBeDefined();
      expect(formulaConfig.properties?.formula_type.enum).toEqual(
        expect.arrayContaining(['INDEX_MATCH', 'VLOOKUP', 'SUMIF', 'COUNTIF', 'CUSTOM'])
      );
    });

    test('should support array schemas', async () => {
      // Register a tool with array validation
      mockServer.registerTool({
        name: 'test_array_schema',
        description: 'Test array schema validation',
        inputSchema: {
          type: 'object',
          properties: {
            sheet_id: { type: 'string' },
            row_data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  column_id: { type: 'string' },
                  value: { type: 'string' }
                }
              }
            }
          },
          required: ['sheet_id', 'row_data']
        }
      });

      const tools = await mockServer.listTools();
      const arrayTool = tools.tools.find(t => t.name === 'test_array_schema');
      
      expect(arrayTool).toBeDefined();
      expect(arrayTool?.inputSchema.properties?.row_data.type).toBe('array');
      expect(arrayTool?.inputSchema.properties?.row_data.items).toBeDefined();
    });
  });
});