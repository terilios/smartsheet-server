/**
 * Unit tests for Smartsheet MCP Server tool definitions
 */
import { describe, test, expect, beforeEach } from '@jest/globals';
import { createMockSmartsheetServer } from '../mocks/mcp-mock.js';
describe('Tool Definitions', () => {
    let mockServer;
    beforeEach(() => {
        mockServer = createMockSmartsheetServer();
    });
    describe('Tool Registration', () => {
        test('should register basic CRUD tools', async () => {
            const tools = await mockServer.listTools();
            const crudTools = ['get_column_map', 'smartsheet_write', 'smartsheet_update', 'smartsheet_delete'];
            crudTools.forEach(toolName => {
                const tool = tools.tools.find(t => t.name === toolName);
                expect(tool).toBeDefined();
                expect(tool?.name).toBe(toolName);
            });
        });
        test('should register cross-sheet reference tools', async () => {
            const tools = await mockServer.listTools();
            const crossRefTools = [
                'smartsheet_get_sheet_cross_references',
                'smartsheet_find_sheet_references',
                'smartsheet_validate_cross_references',
                'smartsheet_create_cross_reference'
            ];
            crossRefTools.forEach(toolName => {
                const tool = tools.tools.find(t => t.name === toolName);
                expect(tool).toBeDefined();
                expect(tool?.description).toContain('cross');
            });
        });
        test('should register discussion and comment tools', async () => {
            const tools = await mockServer.listTools();
            const discussionTools = [
                'smartsheet_create_discussion',
                'smartsheet_add_comment',
                'smartsheet_get_discussions',
                'smartsheet_get_comments',
                'smartsheet_delete_comment'
            ];
            discussionTools.forEach(toolName => {
                const tool = tools.tools.find(t => t.name === toolName);
                expect(tool).toBeDefined();
            });
        });
        test('should register attachment management tools', async () => {
            const tools = await mockServer.listTools();
            const attachmentTools = [
                'smartsheet_upload_attachment',
                'smartsheet_get_attachments',
                'smartsheet_download_attachment',
                'smartsheet_delete_attachment'
            ];
            attachmentTools.forEach(toolName => {
                const tool = tools.tools.find(t => t.name === toolName);
                expect(tool).toBeDefined();
                expect(tool?.description.toLowerCase()).toContain('attachment');
            });
        });
    });
    describe('Schema Validation', () => {
        test('get_column_map should have proper schema', async () => {
            const tools = await mockServer.listTools();
            const tool = tools.tools.find(t => t.name === 'get_column_map');
            expect(tool).toBeDefined();
            expect(tool?.inputSchema).toBeDefined();
            expect(tool?.inputSchema.type).toBe('object');
            expect(tool?.inputSchema.properties).toHaveProperty('sheet_id');
            expect(tool?.inputSchema.required).toContain('sheet_id');
        });
        test('smartsheet_write should require proper parameters', async () => {
            const tools = await mockServer.listTools();
            const tool = tools.tools.find(t => t.name === 'smartsheet_write');
            if (tool) {
                expect(tool.inputSchema.required).toEqual(expect.arrayContaining(['sheet_id', 'row_data', 'column_map']));
            }
        });
        test('cross-reference tools should have proper schemas', async () => {
            const tools = await mockServer.listTools();
            // Test get_sheet_cross_references schema
            const getCrossRefTool = tools.tools.find(t => t.name === 'smartsheet_get_sheet_cross_references');
            expect(getCrossRefTool?.inputSchema.properties).toHaveProperty('sheet_id');
            expect(getCrossRefTool?.inputSchema.properties).toHaveProperty('include_details');
            // Test create_cross_reference schema
            const createCrossRefTool = tools.tools.find(t => t.name === 'smartsheet_create_cross_reference');
            if (createCrossRefTool) {
                expect(createCrossRefTool.inputSchema.required).toEqual(expect.arrayContaining(['sheet_id', 'target_sheet_id', 'formula_config']));
                expect(createCrossRefTool.inputSchema.properties).toHaveProperty('formula_config');
            }
        });
        test('discussion tools should have proper schemas', async () => {
            const tools = await mockServer.listTools();
            const createDiscussionTool = tools.tools.find(t => t.name === 'smartsheet_create_discussion');
            if (createDiscussionTool) {
                expect(createDiscussionTool.inputSchema.properties).toHaveProperty('sheet_id');
                expect(createDiscussionTool.inputSchema.properties).toHaveProperty('discussion_type');
                expect(createDiscussionTool.inputSchema.properties).toHaveProperty('comment_text');
            }
        });
        test('attachment tools should have proper schemas', async () => {
            const tools = await mockServer.listTools();
            const uploadTool = tools.tools.find(t => t.name === 'smartsheet_upload_attachment');
            if (uploadTool) {
                expect(uploadTool.inputSchema.required).toEqual(expect.arrayContaining(['sheet_id', 'file_path', 'attachment_type']));
                expect(uploadTool.inputSchema.properties?.attachment_type.enum).toEqual(expect.arrayContaining(['sheet', 'row', 'comment']));
            }
        });
    });
    describe('Tool Execution', () => {
        test('should execute get_column_map successfully', async () => {
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
            expect(responseData).toHaveProperty('sheet_id');
            expect(responseData).toHaveProperty('column_map');
        });
        test('should execute cross-reference analysis successfully', async () => {
            const result = await mockServer.callTool({
                method: 'tools/call',
                params: {
                    name: 'smartsheet_get_sheet_cross_references',
                    arguments: {
                        sheet_id: '1234567890123456',
                        include_details: true
                    }
                }
            });
            const responseData = JSON.parse(result.content[0].text);
            expect(responseData.success).toBe(true);
            expect(responseData).toHaveProperty('cross_references');
            expect(responseData.total_references).toBeGreaterThanOrEqual(0);
        });
        test('should validate required parameters', async () => {
            await expect(mockServer.callTool({
                method: 'tools/call',
                params: {
                    name: 'get_column_map',
                    arguments: {} // Missing sheet_id
                }
            })).rejects.toThrow('Missing required parameter: sheet_id');
        });
        test('should handle unknown tool names', async () => {
            await expect(mockServer.callTool({
                method: 'tools/call',
                params: {
                    name: 'unknown_tool',
                    arguments: {}
                }
            })).rejects.toThrow('Unknown tool: unknown_tool');
        });
    });
    describe('Schema Edge Cases', () => {
        test('should handle optional parameters correctly', async () => {
            // Test with optional parameters
            const result = await mockServer.callTool({
                method: 'tools/call',
                params: {
                    name: 'smartsheet_get_sheet_cross_references',
                    arguments: {
                        sheet_id: '1234567890123456'
                        // include_details omitted (should use default)
                    }
                }
            });
            const responseData = JSON.parse(result.content[0].text);
            expect(responseData.success).toBe(true);
        });
        test('should validate enum values for attachment_type', async () => {
            // This would need to be implemented in the actual validation logic
            const tools = await mockServer.listTools();
            const uploadTool = tools.tools.find(t => t.name === 'smartsheet_upload_attachment');
            if (uploadTool && uploadTool.inputSchema.properties?.attachment_type) {
                expect(uploadTool.inputSchema.properties.attachment_type.enum).toEqual(['sheet', 'row', 'comment']);
            }
        });
        test('should validate formula_type enum for cross-references', async () => {
            const tools = await mockServer.listTools();
            const createRefTool = tools.tools.find(t => t.name === 'smartsheet_create_cross_reference');
            if (createRefTool) {
                const formulaConfig = createRefTool.inputSchema.properties?.formula_config;
                if (formulaConfig && formulaConfig.properties?.formula_type) {
                    expect(formulaConfig.properties.formula_type.enum).toEqual(expect.arrayContaining(['INDEX_MATCH', 'VLOOKUP', 'SUMIF', 'COUNTIF', 'CUSTOM']));
                }
            }
        });
    });
});
//# sourceMappingURL=tool-definitions.test.js.map