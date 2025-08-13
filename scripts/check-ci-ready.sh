#!/bin/bash

# CI Readiness Check Script
# Runs the same checks that CI will run to catch issues early

set -e

echo "🔍 Checking CI readiness for Smartsheet MCP Server..."
echo "=================================================="

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

success_count=0
total_checks=0

check() {
    local name="$1"
    local command="$2"
    total_checks=$((total_checks + 1))
    
    echo -n "Checking $name... "
    
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        success_count=$((success_count + 1))
    else
        echo -e "${RED}✗${NC}"
        echo -e "${RED}  Failed: $command${NC}"
    fi
}

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "smartsheet_ops" ]; then
    echo -e "${RED}Error: Run this script from the root of the smartsheet-server repository${NC}"
    exit 1
fi

echo "📦 Installing dependencies..."
npm ci > /dev/null 2>&1 || { echo -e "${RED}Failed to install Node.js dependencies${NC}"; exit 1; }
cd smartsheet_ops
pip install -e . > /dev/null 2>&1 || { echo -e "${RED}Failed to install Python package${NC}"; exit 1; }
pip install -r requirements-test.txt > /dev/null 2>&1 || { echo -e "${RED}Failed to install Python test dependencies${NC}"; exit 1; }
cd ..

echo -e "\n🧹 Running quality checks..."
echo "=============================="

# TypeScript checks
check "TypeScript compilation" "npm run build"
check "ESLint" "npm run lint"
check "TypeScript type checking" "npm run typecheck"
check "Prettier formatting" "npm run format -- --check"

# Python checks
check "Black formatting" "cd smartsheet_ops && black --check smartsheet_ops/ tests/"
check "Flake8 linting" "cd smartsheet_ops && flake8 smartsheet_ops/ tests/"
check "MyPy type checking" "cd smartsheet_ops && mypy smartsheet_ops/"

echo -e "\n🧪 Running tests..."
echo "==================="

# TypeScript tests
check "TypeScript unit tests" "npm test -- --testPathPattern=unit --silent"
check "TypeScript integration tests" "npm test -- --testPathPattern=integration --silent"

# Python tests
check "Python unit tests" "cd smartsheet_ops && pytest tests/unit/ -q"
check "Python integration tests" "cd smartsheet_ops && pytest tests/integration/ -q"

echo -e "\n🔒 Running security checks..."
echo "=============================="

check "npm audit" "npm audit --audit-level moderate"
check "Python safety check" "cd smartsheet_ops && safety check --json"

echo -e "\n🏗️ Build verification..."
echo "========================="

check "Server startup test" "timeout 5s node build/index.js --help"

# Summary
echo -e "\n📊 Summary"
echo "==========="
echo -e "Passed: ${GREEN}$success_count${NC}/$total_checks checks"

if [ $success_count -eq $total_checks ]; then
    echo -e "${GREEN}🎉 All checks passed! Your code is ready for CI.${NC}"
    exit 0
else
    failed_count=$((total_checks - success_count))
    echo -e "${RED}❌ $failed_count checks failed. Please fix the issues above.${NC}"
    
    echo -e "\n💡 Quick fixes:"
    echo "  - Run 'npm run lint:fix' to auto-fix ESLint issues"
    echo "  - Run 'npm run format' to fix formatting"
    echo "  - Run 'cd smartsheet_ops && black smartsheet_ops/ tests/' to fix Python formatting"
    echo "  - Check the specific error messages above for other issues"
    
    exit 1
fi