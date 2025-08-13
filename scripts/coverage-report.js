#!/usr/bin/env node
/**
 * Coverage report generation script
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { 
  generateCoverageSummary, 
  checkCoverageThresholds,
  generateCoverageBadge 
} = require('../coverage-config');

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = '') {
  console.log(`${color}${message}${colors.reset}`);
}

function runCommand(command, description) {
  log(`\n${colors.blue}Running: ${description}${colors.reset}`);
  log(`Command: ${colors.yellow}${command}${colors.reset}`);
  
  try {
    execSync(command, { stdio: 'inherit', cwd: __dirname + '/..' });
    log(`${colors.green}✅ ${description} completed successfully${colors.reset}`);
    return true;
  } catch (error) {
    log(`${colors.red}❌ ${description} failed: ${error.message}${colors.reset}`);
    return false;
  }
}

function generateCombinedReport() {
  log(`\n${colors.bold}🔍 Generating Combined Coverage Report${colors.reset}`);
  
  const summary = generateCoverageSummary();
  const thresholds = checkCoverageThresholds(summary);
  const badge = generateCoverageBadge(summary);

  // Ensure combined coverage directory exists
  const combinedDir = path.join(__dirname, '..', 'coverage-combined');
  if (!fs.existsSync(combinedDir)) {
    fs.mkdirSync(combinedDir, { recursive: true });
  }

  // Write summary
  fs.writeFileSync(
    path.join(combinedDir, 'summary.json'),
    JSON.stringify(summary, null, 2)
  );

  // Write badge data
  fs.writeFileSync(
    path.join(combinedDir, 'badge.json'),
    JSON.stringify(badge, null, 2)
  );

  // Generate HTML report
  const htmlReport = generateHTMLReport(summary, thresholds);
  fs.writeFileSync(
    path.join(combinedDir, 'index.html'),
    htmlReport
  );

  log(`${colors.green}✅ Combined coverage report generated in: ${combinedDir}${colors.reset}`);
  
  return { summary, thresholds, badge };
}

function generateHTMLReport(summary, thresholds) {
  const now = new Date().toLocaleString();
  
  return `<!DOCTYPE html>
<html>
<head>
    <title>Smartsheet MCP Server - Coverage Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .passed { background: #d4edda; border-color: #c3e6cb; }
        .failed { background: #f8d7da; border-color: #f5c6cb; }
        .metric { margin: 5px 0; }
        .percentage { font-weight: bold; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🧪 Smartsheet MCP Server - Coverage Report</h1>
        <p><strong>Generated:</strong> ${now}</p>
        <p><strong>Project:</strong> Bulletproofing Testing Infrastructure</p>
    </div>

    <div class="section">
        <h2>📊 Coverage Summary</h2>
        ${generateCoverageTables(summary)}
    </div>

    <div class="section ${thresholds.typescript.passed && thresholds.python.passed ? 'passed' : 'failed'}">
        <h2>🎯 Threshold Results</h2>
        ${generateThresholdResults(thresholds)}
    </div>

    <div class="section">
        <h2>📈 Coverage Details</h2>
        <h3>TypeScript Coverage</h3>
        <p><a href="../coverage/index.html">View TypeScript Coverage Report</a></p>
        
        <h3>Python Coverage</h3>
        <p><a href="../smartsheet_ops/coverage/index.html">View Python Coverage Report</a></p>
    </div>

    <div class="section">
        <h2>🔧 Technical Details</h2>
        <pre>${JSON.stringify(summary, null, 2)}</pre>
    </div>
</body>
</html>`;
}

function generateCoverageTables(summary) {
  let html = '<table><tr><th>Component</th><th>Lines</th><th>Functions</th><th>Branches</th><th>Statements</th></tr>';
  
  if (summary.typescript) {
    const ts = summary.typescript.total;
    html += `<tr>
      <td>TypeScript</td>
      <td class="percentage">${ts.lines.pct}%</td>
      <td class="percentage">${ts.functions.pct}%</td>
      <td class="percentage">${ts.branches.pct}%</td>
      <td class="percentage">${ts.statements.pct}%</td>
    </tr>`;
  }
  
  if (summary.python && summary.python.summary) {
    const py = summary.python.summary;
    html += `<tr>
      <td>Python</td>
      <td class="percentage">${py.lines || 'N/A'}%</td>
      <td class="percentage">${py.functions || 'N/A'}%</td>
      <td class="percentage">${py.branches || 'N/A'}%</td>
      <td class="percentage">${py.statements || 'N/A'}%</td>
    </tr>`;
  }
  
  if (summary.combined) {
    const combined = summary.combined;
    html += `<tr style="font-weight: bold; background: #f8f9fa;">
      <td>Combined Average</td>
      <td class="percentage">${Math.round(combined.lines.pct)}%</td>
      <td class="percentage">${Math.round(combined.functions.pct)}%</td>
      <td class="percentage">${Math.round(combined.branches.pct)}%</td>
      <td class="percentage">${Math.round(combined.statements.pct)}%</td>
    </tr>`;
  }
  
  html += '</table>';
  return html;
}

function generateThresholdResults(thresholds) {
  let html = '';
  
  ['typescript', 'python', 'combined'].forEach(type => {
    const result = thresholds[type];
    const icon = result.passed ? '✅' : '❌';
    const status = result.passed ? 'PASSED' : 'FAILED';
    
    html += `<div class="metric">
      <strong>${icon} ${type.toUpperCase()}: ${status}</strong>
    </div>`;
    
    if (result.failures.length > 0) {
      html += '<ul>';
      result.failures.forEach(failure => {
        html += `<li>${failure}</li>`;
      });
      html += '</ul>';
    }
  });
  
  return html;
}

function displaySummary(summary, thresholds) {
  log(`\n${colors.bold}📊 Coverage Summary${colors.reset}`);
  
  if (summary.typescript) {
    const ts = summary.typescript.total;
    log(`\n${colors.blue}TypeScript Coverage:${colors.reset}`);
    log(`  Lines: ${ts.lines.pct}% (${ts.lines.covered}/${ts.lines.total})`);
    log(`  Functions: ${ts.functions.pct}% (${ts.functions.covered}/${ts.functions.total})`);
    log(`  Branches: ${ts.branches.pct}% (${ts.branches.covered}/${ts.branches.total})`);
    log(`  Statements: ${ts.statements.pct}% (${ts.statements.covered}/${ts.statements.total})`);
  }

  if (summary.python) {
    log(`\n${colors.blue}Python Coverage:${colors.reset}`);
    log(`  Available in: smartsheet_ops/coverage/`);
  }

  log(`\n${colors.bold}🎯 Threshold Check:${colors.reset}`);
  
  ['typescript', 'python', 'combined'].forEach(type => {
    const result = thresholds[type];
    const icon = result.passed ? '✅' : '❌';
    const color = result.passed ? colors.green : colors.red;
    
    log(`${color}${icon} ${type.toUpperCase()}: ${result.passed ? 'PASSED' : 'FAILED'}${colors.reset}`);
    
    result.failures.forEach(failure => {
      log(`   ${colors.red}• ${failure}${colors.reset}`);
    });
  });
}

async function main() {
  log(`${colors.bold}🧪 Smartsheet MCP Server - Coverage Report Generator${colors.reset}`);
  log(`${colors.blue}Bulletproofing Testing Infrastructure - Phase 5${colors.reset}\n`);

  let success = true;

  // Run TypeScript tests with coverage
  log(`${colors.bold}1. Running TypeScript Tests with Coverage${colors.reset}`);
  success &= runCommand('npm run test:coverage', 'TypeScript coverage');

  // Run Python tests with coverage
  log(`\n${colors.bold}2. Running Python Tests with Coverage${colors.reset}`);
  success &= runCommand('cd smartsheet_ops && /Users/timothydriscoll/anaconda3/envs/smartsheet/bin/python -m pytest --cov=smartsheet_ops --cov-report=html:coverage --cov-report=json:coverage/coverage.json --cov-report=term-missing', 'Python coverage');

  // Generate combined report
  log(`\n${colors.bold}3. Generating Combined Coverage Report${colors.reset}`);
  const { summary, thresholds } = generateCombinedReport();

  // Display summary
  displaySummary(summary, thresholds);

  // Final status
  const overallPassed = thresholds.typescript.passed && thresholds.python.passed;
  
  if (overallPassed) {
    log(`\n${colors.green}${colors.bold}🎉 All coverage thresholds passed!${colors.reset}`);
    process.exit(0);
  } else {
    log(`\n${colors.red}${colors.bold}❌ Some coverage thresholds failed!${colors.reset}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}