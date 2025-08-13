/**
 * Integration tests for MCP workflow end-to-end functionality
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createMockSmartsheetServerWithTools, createConfigurableMockExec, createMockCliResponse } from '../mocks/mcp-mock';
import type { MockMcpServer } from '../mocks/mcp-mock';

// Mock child_process
jest.unstable_mockModule('child_process', () => ({
  exec: jest.fn()
}));

describe('MCP Workflow Integration Tests', () => {
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
    jest.restoreAllMocks();
  });

  describe('Complete Tool Execution Flow', () => {
    test('should execute get_column_map workflow end-to-end', async () => {
      const sheetId = '1234567890123456';
      
      // Mock Python CLI response
      const expectedCliResponse = createMockCliResponse('get_column_map', true, {
        sheet_id: sheetId,
        column_map: {
          'Task Name': '7777777777777777',
          'Status': '8888888888888888'
        },
        sample_data: [
          { 'Task Name': 'Test Task', 'Status': 'In Progress' }
        ]
      });

      mockExec.mockSuccess(JSON.parse(expectedCliResponse));

      // Execute through MCP server
      const result = await mockServer.callTool({
        method: 'tools/call',
        params: {
          name: 'get_column_map',
          arguments: { sheet_id: sheetId }
        }
      });

      // Verify result structure
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(true);
      expect(responseData.sheet_id).toBe(sheetId);
      expect(responseData.column_map).toBeDefined();
    });

    test('should execute cross-reference analysis workflow', async () => {
      const sheetId = '1234567890123456';
      
      const expectedCliResponse = createMockCliResponse('get_sheet_cross_references', true, {
        sheet_id: sheetId,
        total_references: 2,
        cross_references: [
          {
            row_id: '5555555555555555',
            column_id: '7777777777777777',
            reference: '[Target Sheet]Column1',
            referenced_sheet_name: 'Target Sheet'
          }
        ]
      });

      mockExec.mockSuccess(JSON.parse(expectedCliResponse));

      const result = await mockServer.callTool({
        method: 'tools/call',
        params: {
          name: 'smartsheet_get_sheet_cross_references',
          arguments: { 
            sheet_id: sheetId,
            include_details: true
          }
        }
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(true);
      expect(responseData.total_references).toBeGreaterThanOrEqual(0);
      expect(responseData.cross_references).toBeDefined();
    });

    test('should execute discussion creation workflow', async () => {
      const sheetId = '1234567890123456';
      const discussionData = {
        discussion_type: 'sheet',
        comment_text: 'Test discussion',
        title: 'Integration Test Discussion'
      };

      const expectedCliResponse = createMockCliResponse('create_discussion', true, {
        discussion_id: '1111111111111111',
        discussion_type: 'sheet',
        title: discussionData.title,
        comment_count: 1
      });

      mockExec.mockSuccess(JSON.parse(expectedCliResponse));

      const result = await mockServer.callTool({
        method: 'tools/call',
        params: {
          name: 'smartsheet_create_discussion',
          arguments: {
            sheet_id: sheetId,
            ...discussionData
          }
        }
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(true);
      expect(responseData.discussion_id).toBeDefined();
    });

    test('should execute attachment upload workflow', async () => {
      const sheetId = '1234567890123456';
      const attachmentData = {
        file_path: '/tmp/test_file.pdf',
        attachment_type: 'sheet',
        file_name: 'Test Document.pdf'
      };

      const expectedCliResponse = createMockCliResponse('upload_attachment', true, {
        attachment_id: '3333333333333333',
        file_name: attachmentData.file_name,
        attachment_type: 'sheet',
        file_size: 1024
      });

      mockExec.mockSuccess(JSON.parse(expectedCliResponse));

      const result = await mockServer.callTool({
        method: 'tools/call',
        params: {
          name: 'smartsheet_upload_attachment',
          arguments: {
            sheet_id: sheetId,
            ...attachmentData
          }
        }
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(true);
      expect(responseData.attachment_id).toBeDefined();
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle Python execution errors gracefully', async () => {
      mockExec.mockError('Python script failed');

      await expect(
        mockServer.callTool({
          method: 'tools/call',
          params: {
            name: 'get_column_map',
            arguments: { sheet_id: 'test-sheet' }
          }
        })
      ).rejects.toThrow();
    });

    test('should handle Python stderr output', async () => {
      const errorMessage = 'API key invalid';
      
      mockExec.mockStderrError(errorMessage);

      const result = await mockServer.callTool({
        method: 'tools/call',
        params: {
          name: 'get_column_map',
          arguments: { sheet_id: 'test-sheet' }
        }
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(false);
      expect(responseData.error).toBe(errorMessage);
    });

    test('should handle malformed JSON responses', async () => {
      mockExec.mockInvalidJson();

      // This should return invalid JSON response
      const result = await mockServer.callTool({
        method: 'tools/call',
        params: {
          name: 'get_column_map',
          arguments: { sheet_id: 'test-sheet' }
        }
      });

      // Check that we got invalid JSON back
      expect(result.content[0].text).toBe('Invalid JSON{');
    });

    test('should handle timeout errors', async () => {
      mockExec.mockTimeout();

      await expect(
        mockServer.callTool({
          method: 'tools/call',
          params: {
            name: 'get_column_map',
            arguments: { sheet_id: 'test-sheet' }
          }
        })
      ).rejects.toThrow();
    });
  });

  describe('Parameter Serialization', () => {
    test('should correctly serialize complex data parameters', async () => {
      const sheetId = '1234567890123456';
      const complexData = {
        row_data: [
          { 'Task Name': 'Complex Task', 'Status': 'In Progress', 'Priority': 'High' }
        ],
        column_map: {
          'Task Name': '7777777777777777',
          'Status': '8888888888888888',
          'Priority': '9999999999999999'
        }
      };

      mockExec.mockSuccess({
        success: true,
        operation: 'add_rows',
        rows_added: 1,
        row_ids: ['5555555555555555']
      });

      const result = await mockServer.callTool({
        method: 'tools/call',
        params: {
          name: 'smartsheet_write',
          arguments: {
            sheet_id: sheetId,
            ...complexData
          }
        }
      });

      expect(result.content).toBeDefined();
    });

    test('should handle special characters in data', async () => {
      const sheetId = '1234567890123456';
      const specialData = {
        comment_text: 'Test with "quotes" and \'apostrophes\' and newlines\n\nand unicode: 中文',
        discussion_type: 'sheet'
      };

      mockExec.mockSuccess({
        success: true,
        operation: 'create_discussion',
        discussion_id: '1111111111111111'
      });

      const result = await mockServer.callTool({
        method: 'tools/call',
        params: {
          name: 'smartsheet_create_discussion',
          arguments: {
            sheet_id: sheetId,
            ...specialData
          }
        }
      });

      expect(result.content).toBeDefined();
    });
  });

  describe('Concurrent Operations', () => {
    test('should handle multiple concurrent tool calls', async () => {
      const sheetIds = ['1111111111111111', '2222222222222222', '3333333333333333'];
      
      // Mock responses for each call
      let callCount = 0;
      mockExec.mockImplementation((command: string, options: any, callback: any) => {
        const currentSheetId = sheetIds[callCount];
        const response = {
          success: true,
          operation: 'get_column_map',
          sheet_id: currentSheetId,
          column_map: { 'Task': '7777777777777777' }
        };
        callCount++;
        
        // Simulate async behavior
        setTimeout(() => {
          callback(null, { stdout: JSON.stringify(response, null, 2), stderr: '' });
        }, Math.random() * 10);
      });

      // Execute multiple calls concurrently
      const promises = sheetIds.map(sheetId => 
        mockServer.callTool({
          method: 'tools/call',
          params: {
            name: 'get_column_map',
            arguments: { sheet_id: sheetId }
          }
        })
      );

      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result.content).toBeDefined();
        const responseData = JSON.parse(result.content[0].text);
        expect(responseData.sheet_id).toBe(sheetIds[index]);
      });
    });

    test('should handle mixed success and failure scenarios', async () => {
      const testCases = [
        { sheetId: '1111111111111111', shouldSucceed: true },
        { sheetId: 'invalid_sheet', shouldSucceed: false },
        { sheetId: '3333333333333333', shouldSucceed: true }
      ];

      let callIndex = 0;
      mockExec.mockImplementation((command: string, options: any, callback: any) => {
        const testCase = testCases[callIndex];
        callIndex++;

        if (testCase.shouldSucceed) {
          const response = {
            success: true,
            operation: 'get_column_map',
            sheet_id: testCase.sheetId
          };
          callback(null, { stdout: JSON.stringify(response, null, 2), stderr: '' });
        } else {
          const errorResponse = {
            success: false,
            operation: 'get_column_map',
            error: 'Sheet not found'
          };
          callback(null, { stdout: JSON.stringify(errorResponse, null, 2), stderr: 'Sheet not found' });
        }
      });

      // Execute mixed calls
      const promises = testCases.map(testCase => 
        mockServer.callTool({
          method: 'tools/call',
          params: {
            name: 'get_column_map',
            arguments: { sheet_id: testCase.sheetId }
          }
        })
      );

      const results = await Promise.all(promises);
      
      results.forEach((result, index) => {
        const responseData = JSON.parse(result.content[0].text);
        if (testCases[index].shouldSucceed) {
          expect(responseData.success).toBe(true);
        } else {
          expect(responseData.success).toBe(false);
          expect(responseData.error).toBeDefined();
        }
      });
    });
  });

  describe('Performance and Resource Management', () => {
    test('should respect execution timeouts', async () => {
      mockExec.mockImplementation((command: string, options: any, callback: any) => {
        // Verify timeout is set correctly
        expect(options.timeout).toBe(300000); // 5 minutes
        
        const response = {
          success: true,
          operation: 'get_column_map'
        };
        callback(null, { stdout: JSON.stringify(response, null, 2), stderr: '' });
      });

      await mockServer.callTool({
        method: 'tools/call',
        params: {
          name: 'get_column_map',
          arguments: { sheet_id: '1234567890123456' }
        }
      });

      expect(mockExec).toHaveBeenCalled();
    });

    test('should respect buffer size limits', async () => {
      mockExec.mockImplementation((command: string, options: any, callback: any) => {
        // Verify buffer size is set correctly
        expect(options.maxBuffer).toBe(10 * 1024 * 1024); // 10MB
        
        const response = {
          success: true,
          operation: 'get_column_map'
        };
        callback(null, { stdout: JSON.stringify(response, null, 2), stderr: '' });
      });

      await mockServer.callTool({
        method: 'tools/call',
        params: {
          name: 'get_column_map',
          arguments: { sheet_id: '1234567890123456' }
        }
      });

      expect(mockExec).toHaveBeenCalled();
    });

    test('should handle large response payloads', async () => {
      const largeResponse = {
        success: true,
        operation: 'get_column_map',
        column_map: {},
        sample_data: []
      };

      // Generate large sample data
      for (let i = 0; i < 1000; i++) {
        largeResponse.sample_data.push({
          'Task Name': `Large Task ${i}`,
          'Description': `Very long description that repeats many times: ${'Lorem ipsum '.repeat(100)}`,
          'Status': 'In Progress'
        });
        largeResponse.column_map[`Column_${i}`] = `77777777777777${i.toString().padStart(2, '0')}`;
      }

      mockExec.mockSuccess(largeResponse);

      const result = await mockServer.callTool({
        method: 'tools/call',
        params: {
          name: 'get_column_map',
          arguments: { sheet_id: '1234567890123456' }
        }
      });

      expect(result.content).toBeDefined();
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.sample_data).toHaveLength(1000);
    });
  });
});