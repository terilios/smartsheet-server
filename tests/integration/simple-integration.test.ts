/**
 * Simple integration test for MCP server functionality
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createMockSmartsheetServerWithTools, createConfigurableMockExec, createMockCliResponse } from '../mocks/mcp-mock';
import type { MockMcpServer } from '../mocks/mcp-mock';

// Mock child_process
jest.unstable_mockModule('child_process', () => ({
  exec: jest.fn()
}));

describe('Simple MCP Integration Tests', () => {
  let mockServer: MockMcpServer;
  let mockExec: any;

  beforeEach(async () => {
    mockServer = createMockSmartsheetServerWithTools({
      pythonPath: '/usr/bin/python3',
      apiKey: 'test-api-key',
      enableLogging: false
    });

    const { exec } = jest.requireMock('child_process') as any;
    mockExec = createConfigurableMockExec();
    
    // Replace the mocked exec with our configurable version
    jest.mocked(exec).mockImplementation(mockExec);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Server Initialization', () => {
    test('should initialize server with required tools', async () => {
      const tools = await mockServer.listTools();
      expect(tools.tools.length).toBeGreaterThan(0);
      
      // Check that we have some basic tools registered
      const toolNames = tools.tools.map(t => t.name);
      expect(toolNames).toContain('get_column_map');
    });

    test('should validate server configuration', () => {
      expect(mockServer.pythonPath).toBe('/usr/bin/python3');
      expect(mockServer.apiKey).toBe('test-api-key');
    });
  });

  describe('Basic Tool Execution', () => {
    test('should execute a simple tool successfully', async () => {
      // Mock the exec response for successful execution
      mockExec.mockSuccess({
        success: true,
        sheet_id: '1234567890123456',
        column_map: { 'Name': 'string', 'Date': 'date' }
      });

      const result = await mockServer.callTool({
        method: 'tools/call',
        params: {
          name: 'get_column_map',
          arguments: {
            sheet_id: '1234567890123456'
          }
        }
      });

      expect(result.content).toBeDefined();
      expect(result.content[0]).toHaveProperty('text');
      
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(true);
      expect(responseData).toHaveProperty('column_map');
      expect(mockExec).toHaveBeenCalled();
    });

    test('should handle tool errors gracefully', async () => {
      // Mock error response
      mockExec.mockError('Smartsheet API error');

      await expect(
        mockServer.callTool({
          method: 'tools/call',
          params: {
            name: 'get_column_map',
            arguments: {
              sheet_id: 'invalid-id'
            }
          }
        })
      ).rejects.toThrow();
    });

    test('should validate required parameters', async () => {
      await expect(
        mockServer.callTool({
          method: 'tools/call',
          params: {
            name: 'smartsheet_write',
            arguments: {
              // Missing required sheet_id
              row_data: { 'Name': 'Test' },
              column_map: { 'Name': 'string' }
            }
          }
        })
      ).rejects.toThrow('Missing required parameter: sheet_id');
    });
  });

  describe('Server Lifecycle', () => {
    test('should handle server initialization and cleanup', async () => {
      // Test that server can be initialized
      const tools = await mockServer.listTools();
      expect(tools).toBeDefined();
      
      // Mock server cleanup (if there was a cleanup method)
      // For now, just test that we can clear tools
      mockServer.tools = [];
      const emptyTools = await mockServer.listTools();
      expect(emptyTools.tools).toHaveLength(0);
    });

    test('should handle concurrent tool registration', async () => {
      const toolsToRegister = [
        { name: 'test1', description: 'Test 1', inputSchema: { type: 'object', properties: {} } },
        { name: 'test2', description: 'Test 2', inputSchema: { type: 'object', properties: {} } },
        { name: 'test3', description: 'Test 3', inputSchema: { type: 'object', properties: {} } }
      ];

      // Register tools concurrently
      await Promise.all(
        toolsToRegister.map(tool => 
          Promise.resolve(mockServer.registerTool(tool))
        )
      );

      const tools = await mockServer.listTools();
      const registeredNames = tools.tools.map(t => t.name);
      
      expect(registeredNames).toContain('test1');
      expect(registeredNames).toContain('test2');
      expect(registeredNames).toContain('test3');
    });
  });

  describe('Python CLI Integration', () => {
    test('should construct correct CLI command', async () => {
      mockExec.mockSuccess({
        success: true,
        sheet_id: '1234567890123456',
        rows_written: 1
      });

      await mockServer.callTool({
        method: 'tools/call',
        params: {
          name: 'smartsheet_write',
          arguments: {
            sheet_id: '1234567890123456',
            row_data: [{ 'Name': 'Test User' }],
            column_map: { 'Name': 'string' }
          }
        }
      });

      // Verify exec was called with correct Python path
      expect(mockExec).toHaveBeenCalled();
      const [command] = mockExec.mock.calls[0];
      expect(command).toContain('/usr/bin/python3');
      expect(command).toContain('--operation add_rows');
    });

    test('should handle Python script errors', async () => {
      mockExec.mockStderrError('Python error: Module not found');

      const result = await mockServer.callTool({
        method: 'tools/call',
        params: {
          name: 'get_column_map',
          arguments: { sheet_id: '123' }
        }
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(false);
      expect(responseData.error).toBe('Python error: Module not found');
    });
  });
});