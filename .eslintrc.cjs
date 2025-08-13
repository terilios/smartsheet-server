module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  env: {
    node: true,
    es2022: true
  },
  ignorePatterns: [
    '.eslintrc.cjs',
    'jest.config.cjs',
    'build/',
    'node_modules/',
    'coverage/',
    'smartsheet_ops/',
    'scripts/',
    'tests/'
  ],
  rules: {
    // Basic ESLint rules that work with TypeScript parser
    'no-console': 'off', // Allow console for server applications
    'no-unused-vars': 'warn',
    'prefer-const': 'error',
    'no-var': 'error',
    'eqeqeq': 'error',
    'no-undef': 'off', // TypeScript handles this
    'no-redeclare': 'off' // TypeScript handles this
  }
};