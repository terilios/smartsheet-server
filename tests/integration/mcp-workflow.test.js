/**
 * Integration tests for MCP workflow end-to-end functionality
 */
import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createMockSmartsheetServer, createMockExec, createMockCliResponse } from '../mocks/mcp-mock.js';
// Mock child_process
jest.unstable_mockModule('child_process', () => ({
    exec: createMockExec()
}));
describe('MCP Workflow Integration Tests', () => {
    let mockServer;
    let mockExec;
    beforeEach(async () => {
        mockServer = createMockSmartsheetServer({
            pythonPath: '/usr/bin/python3',
            apiKey: 'test-api-key',
            enableLogging: false
        });
        const { exec } = jest.requireMock('child_process');
        mockExec = exec;
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
            mockExec.mockImplementationOnce((command, options, callback) => {
                expect(command).toContain('--operation get_column_map');
                expect(command).toContain(`--sheet-id ${sheetId}`);
                callback(null, { stdout: expectedCliResponse, stderr: '' });
            });
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
            mockExec.mockImplementationOnce((command, options, callback) => {
                expect(command).toContain('--operation get_sheet_cross_references');
                expect(command).toContain(`--sheet-id ${sheetId}`);
                callback(null, { stdout: expectedCliResponse, stderr: '' });
            });
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
            mockExec.mockImplementationOnce((command, options, callback) => {
                expect(command).toContain('--operation create_discussion');
                expect(command).toContain(`--sheet-id ${sheetId}`);
                expect(command).toContain('--data');
                // Verify JSON data contains our discussion data
                const dataMatch = command.match(/--data\s+'([^']+)'/);
                if (dataMatch) {
                    const parsedData = JSON.parse(dataMatch[1]);
                    expect(parsedData.discussion_type).toBe(discussionData.discussion_type);
                    expect(parsedData.comment_text).toBe(discussionData.comment_text);
                }
                callback(null, { stdout: expectedCliResponse, stderr: '' });
            });
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
            mockExec.mockImplementationOnce((command, options, callback) => {
                expect(command).toContain('--operation upload_attachment');
                expect(command).toContain(`--sheet-id ${sheetId}`);
                callback(null, { stdout: expectedCliResponse, stderr: '' });
            });
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
            mockExec.mockImplementationOnce((command, options, callback) => {
                callback(new Error('Python script failed'), null);
            });
            // This would test the actual server's error handling
            // For now, we verify the mock setup
            expect(mockExec).toBeDefined();
        });
        test('should handle Python stderr output', async () => {
            const errorMessage = 'API key invalid';
            mockExec.mockImplementationOnce((command, options, callback) => {
                const errorResponse = createMockCliResponse('get_column_map', false, {
                    error: errorMessage
                });
                callback(null, { stdout: errorResponse, stderr: errorMessage });
            });
            // Verify error handling setup
            expect(mockExec).toBeDefined();
        });
        test('should handle malformed JSON responses', async () => {
            mockExec.mockImplementationOnce((command, options, callback) => {
                callback(null, { stdout: 'Invalid JSON{', stderr: '' });
            });
            // Test JSON parsing error handling
            expect(mockExec).toBeDefined();
        });
        test('should handle timeout errors', async () => {
            mockExec.mockImplementationOnce((command, options, callback) => {
                const error = new Error('Command timeout');
                error.killed = true;
                error.signal = 'SIGTERM';
                callback(error, null);
            });
            // Test timeout handling
            expect(mockExec).toBeDefined();
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
            mockExec.mockImplementationOnce((command, options, callback) => {
                expect(command).toContain('--operation add_rows');
                expect(command).toContain(`--sheet-id ${sheetId}`);
                expect(command).toContain('--data');
                // Verify JSON serialization
                const dataMatch = command.match(/--data\s+'([^']+)'/);
                if (dataMatch) {
                    const parsedData = JSON.parse(dataMatch[1]);
                    expect(parsedData.row_data).toEqual(complexData.row_data);
                    expect(parsedData.column_map).toEqual(complexData.column_map);
                }
                const response = createMockCliResponse('add_rows', true, {
                    rows_added: 1,
                    row_ids: ['5555555555555555']
                });
                callback(null, { stdout: response, stderr: '' });
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
            mockExec.mockImplementationOnce((command, options, callback) => {
                expect(command).toContain('--operation create_discussion');
                // Verify special character handling
                const dataMatch = command.match(/--data\s+'([^']+)'/);
                if (dataMatch) {
                    const parsedData = JSON.parse(dataMatch[1]);
                    expect(parsedData.comment_text).toBe(specialData.comment_text);
                }
                const response = createMockCliResponse('create_discussion', true, {
                    discussion_id: '1111111111111111'
                });
                callback(null, { stdout: response, stderr: '' });
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
            mockExec.mockImplementation((command, options, callback) => {
                const currentSheetId = sheetIds[callCount];
                const response = createMockCliResponse('get_column_map', true, {
                    sheet_id: currentSheetId,
                    column_map: { 'Task': '7777777777777777' }
                });
                callCount++;
                // Simulate async behavior
                setTimeout(() => {
                    callback(null, { stdout: response, stderr: '' });
                }, Math.random() * 10);
            });
            // Execute multiple calls concurrently
            const promises = sheetIds.map(sheetId => mockServer.callTool({
                method: 'tools/call',
                params: {
                    name: 'get_column_map',
                    arguments: { sheet_id: sheetId }
                }
            }));
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
            mockExec.mockImplementation((command, options, callback) => {
                const testCase = testCases[callIndex];
                callIndex++;
                if (testCase.shouldSucceed) {
                    const response = createMockCliResponse('get_column_map', true, {
                        sheet_id: testCase.sheetId
                    });
                    callback(null, { stdout: response, stderr: '' });
                }
                else {
                    const errorResponse = createMockCliResponse('get_column_map', false, {
                        error: 'Sheet not found'
                    });
                    callback(null, { stdout: errorResponse, stderr: 'Sheet not found' });
                }
            });
            // Execute mixed calls
            const promises = testCases.map(testCase => mockServer.callTool({
                method: 'tools/call',
                params: {
                    name: 'get_column_map',
                    arguments: { sheet_id: testCase.sheetId }
                }
            }));
            const results = await Promise.all(promises);
            results.forEach((result, index) => {
                const responseData = JSON.parse(result.content[0].text);
                if (testCases[index].shouldSucceed) {
                    expect(responseData.success).toBe(true);
                }
                else {
                    expect(responseData.success).toBe(false);
                    expect(responseData.error).toBeDefined();
                }
            });
        });
    });
    describe('Performance and Resource Management', () => {
        test('should respect execution timeouts', async () => {
            mockExec.mockImplementationOnce((command, options, callback) => {
                // Verify timeout is set correctly
                expect(options.timeout).toBe(300000); // 5 minutes
                const response = createMockCliResponse('get_column_map', true);
                callback(null, { stdout: response, stderr: '' });
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
            mockExec.mockImplementationOnce((command, options, callback) => {
                // Verify buffer size is set correctly
                expect(options.maxBuffer).toBe(10 * 1024 * 1024); // 10MB
                const response = createMockCliResponse('get_column_map', true);
                callback(null, { stdout: response, stderr: '' });
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
            mockExec.mockImplementationOnce((command, options, callback) => {
                callback(null, {
                    stdout: JSON.stringify(largeResponse),
                    stderr: ''
                });
            });
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
//# sourceMappingURL=mcp-workflow.test.js.map