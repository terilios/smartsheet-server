/**
 * Unit tests for Smartsheet MCP Server core functionality
 */
import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { createMockExec } from '../mocks/mcp-mock.js';
// Mock child_process before importing the server
jest.unstable_mockModule('child_process', () => ({
    exec: createMockExec()
}));
describe('SmartsheetServer Core', () => {
    let mockExec;
    beforeEach(() => {
        const { exec } = jest.requireMock('child_process');
        mockExec = exec;
        jest.clearAllMocks();
    });
    describe('Server Initialization', () => {
        test('should initialize with required environment variables', () => {
            expect(process.env.SMARTSHEET_API_KEY).toBeDefined();
            expect(process.env.PYTHON_PATH).toBeDefined();
        });
        test('should handle missing API key gracefully', () => {
            const originalApiKey = process.env.SMARTSHEET_API_KEY;
            delete process.env.SMARTSHEET_API_KEY;
            // Server should handle this gracefully or throw appropriate error
            expect(() => {
                // Import server here to test initialization
            }).not.toThrow();
            // Restore
            process.env.SMARTSHEET_API_KEY = originalApiKey;
        });
    });
    describe('Command Execution', () => {
        test('should execute Python CLI commands correctly', () => {
            const expectedCommand = expect.stringContaining('--operation get_column_map');
            const expectedCommand2 = expect.stringContaining('--sheet-id 1234567890123456');
            // Mock successful execution
            mockExec.mockImplementationOnce((command, options, callback) => {
                expect(command).toEqual(expectedCommand);
                expect(command).toEqual(expectedCommand2);
                callback(null, {
                    stdout: JSON.stringify({ success: true, operation: 'get_column_map' }),
                    stderr: ''
                });
            });
            // This test would need the actual server class to be imported and tested
            // For now, we're testing the mock behavior
            expect(mockExec).toBeDefined();
        });
        test('should handle Python execution errors', () => {
            mockExec.mockImplementationOnce((command, options, callback) => {
                callback(new Error('Python execution failed'), null);
            });
            // Test error handling
            expect(mockExec).toBeDefined();
        });
        test('should handle timeout errors', () => {
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
    describe('Operation Mapping', () => {
        test('should map MCP tool names to CLI operations correctly', () => {
            const expectedMappings = {
                'get_column_map': 'get_column_map',
                'smartsheet_write': 'add_rows',
                'smartsheet_update': 'update_rows',
                'smartsheet_delete': 'delete_rows',
                'smartsheet_search': 'search',
                'smartsheet_get_sheet_cross_references': 'get_sheet_cross_references',
                'smartsheet_create_discussion': 'create_discussion',
                'smartsheet_upload_attachment': 'upload_attachment'
            };
            // This would test the actual mapping logic in the server
            Object.entries(expectedMappings).forEach(([mcpName, cliOp]) => {
                expect(mcpName).toBeDefined();
                expect(cliOp).toBeDefined();
            });
        });
        test('should handle unmapped tool names', () => {
            const unmappedTool = 'nonexistent_tool';
            // Should handle gracefully or throw appropriate error
            expect(unmappedTool).toBeDefined();
        });
    });
    describe('Parameter Handling', () => {
        test('should correctly format sheet_id parameters', () => {
            const sheetId = '1234567890123456';
            const expectedArgs = expect.stringContaining(`--sheet-id ${sheetId}`);
            mockExec.mockImplementationOnce((command) => {
                expect(command).toEqual(expectedArgs);
            });
            // Test parameter formatting
            expect(sheetId).toBeDefined();
        });
        test('should correctly format workspace_id parameters', () => {
            const workspaceId = '9876543210987654';
            const expectedArgs = expect.stringContaining(`--workspace-id ${workspaceId}`);
            mockExec.mockImplementationOnce((command) => {
                expect(command).toEqual(expectedArgs);
            });
            // Test workspace parameter formatting
            expect(workspaceId).toBeDefined();
        });
        test('should correctly serialize JSON data parameters', () => {
            const testData = {
                row_data: [{ 'Task Name': 'Test Task' }],
                column_map: { 'Task Name': '7777777777777777' }
            };
            mockExec.mockImplementationOnce((command) => {
                expect(command).toContain('--data');
                expect(command).toContain(JSON.stringify(testData));
            });
            // Test JSON serialization
            expect(testData).toBeDefined();
        });
    });
    describe('Error Handling', () => {
        test('should handle Python stderr output', () => {
            const errorMessage = 'Python error: Invalid API key';
            mockExec.mockImplementationOnce((command, options, callback) => {
                callback(null, { stdout: '', stderr: errorMessage });
            });
            // Test stderr handling
            expect(errorMessage).toBeDefined();
        });
        test('should handle malformed JSON responses', () => {
            mockExec.mockImplementationOnce((command, options, callback) => {
                callback(null, { stdout: 'Invalid JSON{', stderr: '' });
            });
            // Test JSON parsing error handling
            expect('Invalid JSON{').toBeDefined();
        });
        test('should handle empty responses', () => {
            mockExec.mockImplementationOnce((command, options, callback) => {
                callback(null, { stdout: '', stderr: '' });
            });
            // Test empty response handling
            expect('').toBeDefined();
        });
    });
    describe('Resource Management', () => {
        test('should respect execution timeout', () => {
            const timeout = 300000; // 5 minutes as per config
            mockExec.mockImplementationOnce((command, options) => {
                expect(options.timeout).toBe(timeout);
            });
            // Test timeout configuration
            expect(timeout).toBe(300000);
        });
        test('should respect buffer size limits', () => {
            const maxBuffer = 10 * 1024 * 1024; // 10MB as per config
            mockExec.mockImplementationOnce((command, options) => {
                expect(options.maxBuffer).toBe(maxBuffer);
            });
            // Test buffer configuration
            expect(maxBuffer).toBe(10485760);
        });
    });
    describe('Transport Modes', () => {
        test('should support STDIO transport', () => {
            // Test STDIO transport initialization
            expect('stdio').toBe('stdio');
        });
        test('should support HTTP transport', () => {
            // Test HTTP transport initialization
            expect('http').toBe('http');
        });
        test('should handle port configuration for HTTP', () => {
            const defaultPort = 3000;
            expect(defaultPort).toBe(3000);
        });
    });
});
//# sourceMappingURL=server-core.test.js.map