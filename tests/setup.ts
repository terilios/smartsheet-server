// Test setup file for Jest
import { jest } from '@jest/globals';

// Set up test environment
process.env.NODE_ENV = 'test';

// Mock environment variables for testing
process.env.SMARTSHEET_API_KEY = 'test-api-key';
process.env.PYTHON_PATH = '/usr/bin/python3';
process.env.AZURE_OPENAI_API_KEY = 'test-azure-key';
process.env.AZURE_OPENAI_API_BASE = 'https://test.openai.azure.com';
process.env.AZURE_OPENAI_API_VERSION = '2024-02-15-preview';
process.env.AZURE_OPENAI_DEPLOYMENT = 'test-deployment';

// Global test timeout
jest.setTimeout(30000);

// Suppress console.log in tests unless explicitly testing logging
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeEach(() => {
  // Reset mocks before each test
  jest.clearAllMocks();
  jest.clearAllTimers();
  
  // Suppress logs unless NODE_ENV=test-verbose
  if (process.env.NODE_ENV !== 'test-verbose') {
    console.log = jest.fn();
    console.error = jest.fn();
  }
});

afterEach(() => {
  // Restore console methods
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  
  // Clean up any pending timers only if fake timers are active
  try {
    if (jest.isMockFunction(setTimeout)) {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    }
  } catch (error) {
    // Silently ignore timer cleanup errors
  }
});

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit in tests, just log
});

export {};