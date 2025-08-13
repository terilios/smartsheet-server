/**
 * Mock infrastructure for MCP (Model Context Protocol) testing
 */
import { CallToolRequest, CallToolResult, Tool, ListToolsResult } from '@modelcontextprotocol/sdk/types.js';
export interface MockMcpServerOptions {
    pythonPath?: string;
    apiKey?: string;
    enableLogging?: boolean;
}
export declare class MockMcpServer {
    private tools;
    private pythonPath;
    private apiKey;
    private enableLogging;
    constructor(options?: MockMcpServerOptions);
    /**
     * Register a tool for testing
     */
    registerTool(tool: Tool): void;
    /**
     * Mock list_tools handler
     */
    listTools(): Promise<ListToolsResult>;
    /**
     * Mock call_tool handler with validation
     */
    callTool(request: CallToolRequest): Promise<CallToolResult>;
    /**
     * Validate arguments against JSON schema
     */
    private validateArguments;
    /**
     * Route tool calls to mock implementations
     */
    private routeToolCall;
    /**
     * Get mock data based on tool name and arguments
     */
    private getMockData;
    private getMockSheetInfo;
    private getMockWriteResult;
    private getMockSearchResult;
    private getMockCrossReferences;
    private getMockDiscussion;
    private getMockAttachment;
    private getMockWorkspaces;
}
/**
 * Mock exec function for child_process
 */
export declare function createMockExec(): import("jest-mock").Mock<import("jest-mock").UnknownFunction>;
/**
 * Create a complete mock Smartsheet server for testing
 */
export declare function createMockSmartsheetServer(options?: MockMcpServerOptions): MockMcpServer;
/**
 * Helper to create mock CLI responses
 */
export declare function createMockCliResponse(operation: string, success?: boolean, data?: any): string;
declare const _default: {
    MockMcpServer: typeof MockMcpServer;
    createMockExec: typeof createMockExec;
    createMockSmartsheetServer: typeof createMockSmartsheetServer;
    createMockCliResponse: typeof createMockCliResponse;
};
export default _default;
//# sourceMappingURL=mcp-mock.d.ts.map