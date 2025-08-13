#!/usr/bin/env node

/**
 * Coverage badges generator for README.md
 * Generates shield.io URLs for coverage badges
 */

const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  typescript: {
    coverageFile: path.join(__dirname, '..', 'coverage', 'coverage-summary.json'),
    badgeLabel: 'TypeScript Coverage',
    shortLabel: 'TS Coverage'
  },
  python: {
    coverageFile: path.join(__dirname, '..', 'smartsheet_ops', 'coverage', 'coverage.json'),
    badgeLabel: 'Python Coverage',
    shortLabel: 'Python Coverage'
  }
};

// Badge color mapping based on coverage percentage
function getCoverageColor(percentage) {
  if (percentage >= 95) return 'brightgreen';
  if (percentage >= 90) return 'green';
  if (percentage >= 80) return 'yellowgreen';
  if (percentage >= 70) return 'yellow';
  if (percentage >= 60) return 'orange';
  return 'red';
}

// Generate TypeScript coverage badge
function generateTypeScriptBadge() {
  const coverageFile = config.typescript.coverageFile;
  
  if (!fs.existsSync(coverageFile)) {
    console.warn('TypeScript coverage file not found:', coverageFile);
    return null;
  }
  
  try {
    const coverage = JSON.parse(fs.readFileSync(coverageFile, 'utf8'));
    const percentage = Math.round(coverage.total.lines.pct);
    const color = getCoverageColor(percentage);
    
    return {
      type: 'typescript',
      percentage,
      color,
      url: `https://img.shields.io/badge/TypeScript_Coverage-${percentage}%25-${color}?style=flat-square&logo=typescript&logoColor=white`,
      codecovUrl: `https://codecov.io/gh/terilios/smartsheet-server/branch/main/graph/badge.svg?flag=typescript`,
      details: {
        lines: coverage.total.lines,
        functions: coverage.total.functions,
        branches: coverage.total.branches,
        statements: coverage.total.statements
      }
    };
  } catch (error) {
    console.error('Error reading TypeScript coverage:', error.message);
    return null;
  }
}

// Generate Python coverage badge
function generatePythonBadge() {
  const coverageFile = config.python.coverageFile;
  
  if (!fs.existsSync(coverageFile)) {
    console.warn('Python coverage file not found:', coverageFile);
    return null;
  }
  
  try {
    const coverage = JSON.parse(fs.readFileSync(coverageFile, 'utf8'));
    const percentage = Math.round(coverage.totals.percent_covered);
    const color = getCoverageColor(percentage);
    
    return {
      type: 'python',
      percentage,
      color,
      url: `https://img.shields.io/badge/Python_Coverage-${percentage}%25-${color}?style=flat-square&logo=python&logoColor=white`,
      codecovUrl: `https://codecov.io/gh/terilios/smartsheet-server/branch/main/graph/badge.svg?flag=python`,
      details: {
        lines: {
          covered: coverage.totals.covered_lines,
          total: coverage.totals.num_statements,
          pct: coverage.totals.percent_covered
        },
        missing: coverage.totals.missing_lines
      }
    };
  } catch (error) {
    console.error('Error reading Python coverage:', error.message);
    return null;
  }
}

// Generate combined coverage badge
function generateCombinedBadge(tsBadge, pyBadge) {
  if (!tsBadge || !pyBadge) {
    return null;
  }
  
  const combinedPercentage = Math.round((tsBadge.percentage + pyBadge.percentage) / 2);
  const color = getCoverageColor(combinedPercentage);
  
  return {
    type: 'combined',
    percentage: combinedPercentage,
    color,
    url: `https://img.shields.io/badge/Combined_Coverage-${combinedPercentage}%25-${color}?style=flat-square&logo=codecov&logoColor=white`,
    codecovUrl: `https://codecov.io/gh/terilios/smartsheet-server/branch/main/graph/badge.svg`,
    components: {
      typescript: tsBadge.percentage,
      python: pyBadge.percentage
    }
  };
}

// Generate additional status badges
function generateStatusBadges() {
  return {
    ci: {
      url: 'https://github.com/terilios/smartsheet-server/workflows/CI%2FCD%20Pipeline/badge.svg',
      alt: 'CI/CD Pipeline'
    },
    codecov: {
      url: 'https://codecov.io/gh/terilios/smartsheet-server/branch/main/graph/badge.svg',
      alt: 'Codecov Coverage'
    },
    license: {
      url: 'https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square',
      alt: 'MIT License'
    },
    version: {
      url: 'https://img.shields.io/badge/version-0.3.0-blue.svg?style=flat-square',
      alt: 'Version 0.3.0'
    },
    node: {
      url: 'https://img.shields.io/badge/Node.js-16%20%7C%2018%20%7C%2020-green.svg?style=flat-square&logo=node.js&logoColor=white',
      alt: 'Node.js Versions'
    },
    python: {
      url: 'https://img.shields.io/badge/Python-3.8%20%7C%203.9%20%7C%203.10%20%7C%203.11-blue.svg?style=flat-square&logo=python&logoColor=white',
      alt: 'Python Versions'
    }
  };
}

// Generate README badges section
function generateReadmeBadgesSection(badges, statusBadges) {
  const lines = [];
  
  lines.push('<!-- Coverage and Status Badges -->');
  
  // Primary badges row
  const primaryBadges = [];
  if (badges.combined) {
    primaryBadges.push(`[![${statusBadges.codecov.alt}](${badges.combined.codecovUrl})](https://codecov.io/gh/terilios/smartsheet-server)`);
  }
  primaryBadges.push(`[![${statusBadges.ci.alt}](${statusBadges.ci.url})](https://github.com/terilios/smartsheet-server/actions)`);
  primaryBadges.push(`[![${statusBadges.license.alt}](${statusBadges.license.url})](LICENSE)`);
  primaryBadges.push(`[![${statusBadges.version.alt}](${statusBadges.version.url})](https://github.com/terilios/smartsheet-server/releases)`);
  
  if (primaryBadges.length > 0) {
    lines.push(primaryBadges.join(' '));
    lines.push('');
  }
  
  // Coverage details row
  const coverageBadges = [];
  if (badges.typescript) {
    coverageBadges.push(`[![TypeScript Coverage](${badges.typescript.url})](./coverage/index.html)`);
  }
  if (badges.python) {
    coverageBadges.push(`[![Python Coverage](${badges.python.url})](./smartsheet_ops/coverage/index.html)`);
  }
  if (badges.combined) {
    coverageBadges.push(`[![Combined Coverage](${badges.combined.url})](./coverage-combined/index.html)`);
  }
  
  if (coverageBadges.length > 0) {
    lines.push(coverageBadges.join(' '));
    lines.push('');
  }
  
  // Technology badges row
  const techBadges = [];
  techBadges.push(`[![${statusBadges.node.alt}](${statusBadges.node.url})](package.json)`);
  techBadges.push(`[![${statusBadges.python.alt}](${statusBadges.python.url})](smartsheet_ops/setup.py)`);
  
  if (techBadges.length > 0) {
    lines.push(techBadges.join(' '));
    lines.push('');
  }
  
  lines.push('<!-- End Coverage and Status Badges -->');
  
  return lines.join('\n');
}

// Save badges to JSON file for external use
function saveBadgesData(badges, statusBadges) {
  const badgesDir = path.join(__dirname, '..', 'coverage-combined', 'badges');
  if (!fs.existsSync(badgesDir)) {
    fs.mkdirSync(badgesDir, { recursive: true });
  }
  
  const badgesData = {
    timestamp: new Date().toISOString(),
    coverage: badges,
    status: statusBadges,
    readme: generateReadmeBadgesSection(badges, statusBadges)
  };
  
  fs.writeFileSync(
    path.join(badgesDir, 'badges.json'),
    JSON.stringify(badgesData, null, 2)
  );
  
  return badgesData;
}

// Display coverage summary
function displayCoverageSummary(badges) {
  console.log('\n📊 Coverage Summary:');
  console.log('===================');
  
  if (badges.typescript) {
    console.log(`\n🔹 TypeScript: ${badges.typescript.percentage}%`);
    const ts = badges.typescript.details;
    console.log(`   Lines: ${ts.lines.pct}% (${ts.lines.covered}/${ts.lines.total})`);
    console.log(`   Functions: ${ts.functions.pct}% (${ts.functions.covered}/${ts.functions.total})`);
    console.log(`   Branches: ${ts.branches.pct}% (${ts.branches.covered}/${ts.branches.total})`);
    console.log(`   Statements: ${ts.statements.pct}% (${ts.statements.covered}/${ts.statements.total})`);
  }
  
  if (badges.python) {
    console.log(`\n🔹 Python: ${badges.python.percentage}%`);
    const py = badges.python.details;
    console.log(`   Lines: ${py.lines.pct}% (${py.lines.covered}/${py.lines.total})`);
    console.log(`   Missing: ${py.missing} lines`);
  }
  
  if (badges.combined) {
    console.log(`\n🔹 Combined Average: ${badges.combined.percentage}%`);
  }
  
  console.log('\n🏷️  Badge URLs Generated:');
  if (badges.typescript) console.log(`   TypeScript: ${badges.typescript.url}`);
  if (badges.python) console.log(`   Python: ${badges.python.url}`);
  if (badges.combined) console.log(`   Combined: ${badges.combined.url}`);
}

// Main execution
function main() {
  console.log('🏷️  Generating coverage badges...');
  
  const tsBadge = generateTypeScriptBadge();
  const pyBadge = generatePythonBadge();
  const combinedBadge = generateCombinedBadge(tsBadge, pyBadge);
  const statusBadges = generateStatusBadges();
  
  const badges = {};
  if (tsBadge) badges.typescript = tsBadge;
  if (pyBadge) badges.python = pyBadge;
  if (combinedBadge) badges.combined = combinedBadge;
  
  if (Object.keys(badges).length === 0) {
    console.error('❌ No coverage data found. Run tests first.');
    process.exit(1);
  }
  
  const badgesData = saveBadgesData(badges, statusBadges);
  displayCoverageSummary(badges);
  
  console.log('\n📋 README Badges Section:');
  console.log('========================');
  console.log(badgesData.readme);
  
  console.log('\n✅ Badges generated successfully!');
  console.log(`   Data saved to: coverage-combined/badges/badges.json`);
  
  return badgesData;
}

// Export for use as module
module.exports = {
  generateTypeScriptBadge,
  generatePythonBadge,
  generateCombinedBadge,
  generateStatusBadges,
  generateReadmeBadgesSection,
  saveBadgesData,
  main
};

// Run if called directly
if (require.main === module) {
  main();
}