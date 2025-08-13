module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx)',
    '**/*.(test|spec).+(ts|tsx)'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        module: 'CommonJS',
        target: 'ES2022',
        moduleResolution: 'node',
        isolatedModules: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      }
    }]
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60
    }
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testTimeout: 30000,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^@modelcontextprotocol/sdk/types.js$': '@modelcontextprotocol/sdk/types'
  },
  // Performance optimizations
  maxWorkers: '50%',
  cache: true,
  cacheDirectory: '<rootDir>/node_modules/.cache/jest',
  clearMocks: true,
  restoreMocks: true,
  // Better error reporting
  verbose: false,
  silent: false,
  errorOnDeprecated: true,
  // Test execution optimizations
  testSequencer: '@jest/test-sequencer',
  forceExit: true,
  detectOpenHandles: false,
  // Additional optimizations
  workerIdleMemoryLimit: '512MB',
  logHeapUsage: false,
  testRunner: 'jest-circus/runner',
  // Optimized test patterns
  watchPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/build/',
    '<rootDir>/coverage/',
    '<rootDir>/smartsheet_ops/__pycache__/'
  ]
};