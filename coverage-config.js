/**
 * Coverage aggregation and reporting configuration
 */

const fs = require('fs');
const path = require('path');

/**
 * Coverage configuration for the Smartsheet MCP Server
 */
const coverageConfig = {
  // TypeScript/Jest Coverage
  typescript: {
    directory: 'coverage',
    threshold: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    reporters: ['text', 'lcov', 'html', 'json-summary'],
    collectFrom: [
      'src/**/*.{ts,tsx}',
      '!src/**/*.d.ts',
      '!src/**/index.ts'
    ]
  },

  // Python/pytest Coverage  
  python: {
    directory: 'smartsheet_ops/coverage',
    threshold: 80,
    formats: ['term-missing', 'html', 'xml', 'json'],
    source: 'smartsheet_ops'
  },

  // Combined Coverage
  combined: {
    directory: 'coverage-combined',
    threshold: 80,
    formats: ['html', 'json']
  }
};

/**
 * Generate coverage report summary
 */
function generateCoverageSummary() {
  const summary = {
    timestamp: new Date().toISOString(),
    typescript: null,
    python: null,
    combined: null
  };

  // Read TypeScript coverage
  try {
    const tsPath = path.join(__dirname, 'coverage', 'coverage-summary.json');
    if (fs.existsSync(tsPath)) {
      summary.typescript = JSON.parse(fs.readFileSync(tsPath, 'utf8'));
    }
  } catch (error) {
    console.warn('TypeScript coverage summary not found:', error.message);
  }

  // Read Python coverage  
  try {
    const pyPath = path.join(__dirname, 'smartsheet_ops', 'coverage', 'coverage.json');
    if (fs.existsSync(pyPath)) {
      summary.python = JSON.parse(fs.readFileSync(pyPath, 'utf8'));
    }
  } catch (error) {
    console.warn('Python coverage summary not found:', error.message);
  }

  // Generate combined metrics
  if (summary.typescript && summary.python) {
    summary.combined = {
      lines: {
        pct: (summary.typescript.total.lines.pct + summary.python.summary?.lines || 0) / 2
      },
      functions: {
        pct: (summary.typescript.total.functions.pct + summary.python.summary?.functions || 0) / 2
      },
      branches: {
        pct: (summary.typescript.total.branches.pct + summary.python.summary?.branches || 0) / 2
      },
      statements: {
        pct: (summary.typescript.total.statements.pct + summary.python.summary?.statements || 0) / 2
      }
    };
  }

  return summary;
}

/**
 * Check coverage thresholds
 */
function checkCoverageThresholds(summary) {
  const results = {
    typescript: { passed: true, failures: [] },
    python: { passed: true, failures: [] },
    combined: { passed: true, failures: [] }
  };

  // Check TypeScript thresholds
  if (summary.typescript) {
    const ts = summary.typescript.total;
    const threshold = coverageConfig.typescript.threshold;
    
    ['lines', 'functions', 'branches', 'statements'].forEach(metric => {
      if (ts[metric].pct < threshold[metric]) {
        results.typescript.passed = false;
        results.typescript.failures.push(
          `${metric}: ${ts[metric].pct}% < ${threshold[metric]}%`
        );
      }
    });
  }

  // Check Python thresholds
  if (summary.python && summary.python.summary) {
    const py = summary.python.summary;
    const threshold = coverageConfig.python.threshold;
    
    ['lines', 'functions', 'branches', 'statements'].forEach(metric => {
      if (py[metric] && py[metric] < threshold) {
        results.python.passed = false;
        results.python.failures.push(
          `${metric}: ${py[metric]}% < ${threshold}%`
        );
      }
    });
  }

  // Check combined thresholds
  if (summary.combined) {
    const combined = summary.combined;
    const threshold = coverageConfig.combined.threshold;
    
    ['lines', 'functions', 'branches', 'statements'].forEach(metric => {
      if (combined[metric] && combined[metric].pct < threshold) {
        results.combined.passed = false;
        results.combined.failures.push(
          `${metric}: ${combined[metric].pct}% < ${threshold}%`
        );
      }
    });
  }

  return results;
}

/**
 * Generate coverage badge data
 */
function generateCoverageBadge(summary) {
  let percentage = 0;
  let color = 'red';

  if (summary.combined && summary.combined.lines) {
    percentage = Math.round(summary.combined.lines.pct);
  } else if (summary.typescript) {
    percentage = Math.round(summary.typescript.total.lines.pct);
  }

  if (percentage >= 90) color = 'brightgreen';
  else if (percentage >= 80) color = 'green';
  else if (percentage >= 70) color = 'yellow';
  else if (percentage >= 60) color = 'orange';

  return {
    schemaVersion: 1,
    label: 'coverage',
    message: `${percentage}%`,
    color: color
  };
}

module.exports = {
  coverageConfig,
  generateCoverageSummary,
  checkCoverageThresholds,
  generateCoverageBadge
};