#!/bin/bash

# Unified Coverage Script for Smartsheet MCP Server
# This script runs all tests with coverage and generates combined reports

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_step() {
    echo -e "${BLUE}[COVERAGE]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TYPESCRIPT_COVERAGE_DIR="${PROJECT_ROOT}/coverage"
PYTHON_COVERAGE_DIR="${PROJECT_ROOT}/smartsheet_ops/coverage"
COMBINED_COVERAGE_DIR="${PROJECT_ROOT}/coverage-combined"
CODECOV_TOKEN="${CODECOV_TOKEN:-}"
CI="${CI:-false}"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to cleanup old coverage reports
cleanup_coverage() {
    print_step "Cleaning up old coverage reports..."
    
    rm -rf "${TYPESCRIPT_COVERAGE_DIR}" 2>/dev/null || true
    rm -rf "${PYTHON_COVERAGE_DIR}" 2>/dev/null || true
    rm -rf "${COMBINED_COVERAGE_DIR}" 2>/dev/null || true
    
    # Clean up any other coverage artifacts
    rm -rf "${PROJECT_ROOT}/.nyc_output" 2>/dev/null || true
    rm -rf "${PROJECT_ROOT}/smartsheet_ops/.coverage" 2>/dev/null || true
    
    print_success "Coverage cleanup completed"
}

# Function to install dependencies if needed
check_dependencies() {
    print_step "Checking dependencies..."
    
    # Check Node.js dependencies
    if [ ! -d "${PROJECT_ROOT}/node_modules" ]; then
        print_step "Installing Node.js dependencies..."
        cd "${PROJECT_ROOT}"
        npm ci
    fi
    
    # Check Python dependencies
    cd "${PROJECT_ROOT}/smartsheet_ops"
    if ! python -c "import pytest, coverage" 2>/dev/null; then
        print_step "Installing Python test dependencies..."
        pip install -r requirements-test.txt
    fi
    
    print_success "Dependencies check completed"
}

# Function to run TypeScript tests with coverage
run_typescript_coverage() {
    print_step "Running TypeScript tests with coverage..."
    
    cd "${PROJECT_ROOT}"
    
    # Run Jest with coverage
    npm run test:coverage
    
    # Verify coverage files exist
    if [ ! -f "${TYPESCRIPT_COVERAGE_DIR}/lcov.info" ]; then
        print_error "TypeScript coverage file not found!"
        return 1
    fi
    
    if [ ! -f "${TYPESCRIPT_COVERAGE_DIR}/coverage-summary.json" ]; then
        print_error "TypeScript coverage summary not found!"
        return 1
    fi
    
    print_success "TypeScript coverage completed"
    
    # Display TypeScript coverage summary
    if command_exists jq && [ -f "${TYPESCRIPT_COVERAGE_DIR}/coverage-summary.json" ]; then
        echo ""
        print_step "TypeScript Coverage Summary:"
        jq -r '.total | "Lines: \(.lines.pct)% | Functions: \(.functions.pct)% | Branches: \(.branches.pct)% | Statements: \(.statements.pct)%"' "${TYPESCRIPT_COVERAGE_DIR}/coverage-summary.json"
    fi
    
    return 0
}

# Function to run Python tests with coverage
run_python_coverage() {
    print_step "Running Python tests with coverage..."
    
    cd "${PROJECT_ROOT}/smartsheet_ops"
    
    # Run pytest with coverage
    python -m pytest \
        --cov=smartsheet_ops \
        --cov-report=html:coverage \
        --cov-report=xml:coverage.xml \
        --cov-report=json:coverage/coverage.json \
        --cov-report=term-missing \
        --cov-report=lcov:coverage.lcov \
        --cov-fail-under=80
    
    # Verify coverage files exist
    if [ ! -f "${PYTHON_COVERAGE_DIR}/coverage.xml" ]; then
        print_error "Python coverage XML not found!"
        return 1
    fi
    
    if [ ! -f "${PYTHON_COVERAGE_DIR}/coverage.json" ]; then
        print_error "Python coverage JSON not found!"
        return 1
    fi
    
    print_success "Python coverage completed"
    
    # Display Python coverage summary
    if command_exists jq && [ -f "${PYTHON_COVERAGE_DIR}/coverage.json" ]; then
        echo ""
        print_step "Python Coverage Summary:"
        jq -r '.totals | "Lines: \(.percent_covered)% (\(.covered_lines)/\(.num_statements)) | Missing: \(.missing_lines)"' "${PYTHON_COVERAGE_DIR}/coverage.json" 2>/dev/null || true
    fi
    
    return 0
}

# Function to generate combined coverage report
generate_combined_report() {
    print_step "Generating combined coverage report..."
    
    cd "${PROJECT_ROOT}"
    
    # Use the existing coverage report script
    if [ -f "scripts/coverage-report.js" ]; then
        node scripts/coverage-report.js
    else
        print_warning "Combined coverage report script not found, skipping..."
    fi
    
    print_success "Combined coverage report generated"
}

# Function to upload coverage to Codecov
upload_to_codecov() {
    if [ "${CI}" = "true" ] || [ -n "${CODECOV_TOKEN}" ]; then
        print_step "Uploading coverage to Codecov..."
        
        # Install codecov if not available
        if ! command_exists codecov; then
            if command_exists npm; then
                npm install -g codecov
            elif command_exists pip; then
                pip install codecov
            else
                print_warning "Cannot install codecov, skipping upload"
                return 0
            fi
        fi
        
        # Upload TypeScript coverage
        if [ -f "${TYPESCRIPT_COVERAGE_DIR}/lcov.info" ]; then
            codecov -f "${TYPESCRIPT_COVERAGE_DIR}/lcov.info" -F typescript -n "typescript-coverage" || print_warning "TypeScript codecov upload failed"
        fi
        
        # Upload Python coverage
        if [ -f "${PYTHON_COVERAGE_DIR}/coverage.xml" ]; then
            codecov -f "${PYTHON_COVERAGE_DIR}/coverage.xml" -F python -n "python-coverage" || print_warning "Python codecov upload failed"
        fi
        
        print_success "Coverage uploaded to Codecov"
    else
        print_step "Skipping Codecov upload (not in CI environment)"
    fi
}

# Function to generate coverage badges
generate_badges() {
    print_step "Generating coverage badges..."
    
    cd "${PROJECT_ROOT}"
    
    # Create badges directory
    mkdir -p "${COMBINED_COVERAGE_DIR}/badges"
    
    # Generate TypeScript badge
    if [ -f "${TYPESCRIPT_COVERAGE_DIR}/coverage-summary.json" ] && command_exists jq; then
        TS_COVERAGE=$(jq -r '.total.lines.pct' "${TYPESCRIPT_COVERAGE_DIR}/coverage-summary.json")
        TS_COLOR="red"
        
        if (( $(echo "${TS_COVERAGE} >= 90" | bc -l) )); then
            TS_COLOR="brightgreen"
        elif (( $(echo "${TS_COVERAGE} >= 80" | bc -l) )); then
            TS_COLOR="green"
        elif (( $(echo "${TS_COVERAGE} >= 70" | bc -l) )); then
            TS_COLOR="yellow"
        elif (( $(echo "${TS_COVERAGE} >= 60" | bc -l) )); then
            TS_COLOR="orange"
        fi
        
        # Generate shield.io URL for TypeScript
        echo "https://img.shields.io/badge/typescript%20coverage-${TS_COVERAGE}%25-${TS_COLOR}" > "${COMBINED_COVERAGE_DIR}/badges/typescript.url"
    fi
    
    # Generate Python badge
    if [ -f "${PYTHON_COVERAGE_DIR}/coverage.json" ] && command_exists jq; then
        PY_COVERAGE=$(jq -r '.totals.percent_covered' "${PYTHON_COVERAGE_DIR}/coverage.json")
        PY_COLOR="red"
        
        if (( $(echo "${PY_COVERAGE} >= 90" | bc -l) )); then
            PY_COLOR="brightgreen"
        elif (( $(echo "${PY_COVERAGE} >= 80" | bc -l) )); then
            PY_COLOR="green"
        elif (( $(echo "${PY_COVERAGE} >= 70" | bc -l) )); then
            PY_COLOR="yellow"
        elif (( $(echo "${PY_COVERAGE} >= 60" | bc -l) )); then
            PY_COLOR="orange"
        fi
        
        # Generate shield.io URL for Python
        echo "https://img.shields.io/badge/python%20coverage-${PY_COVERAGE}%25-${PY_COLOR}" > "${COMBINED_COVERAGE_DIR}/badges/python.url"
    fi
    
    print_success "Coverage badges generated"
}

# Function to display summary
display_summary() {
    echo ""
    print_step "Coverage Summary"
    echo "===================="
    
    if [ -f "${TYPESCRIPT_COVERAGE_DIR}/coverage-summary.json" ] && command_exists jq; then
        echo ""
        echo -e "${BLUE}TypeScript Coverage:${NC}"
        jq -r '.total | "  Lines: \(.lines.pct)% (\(.lines.covered)/\(.lines.total))\n  Functions: \(.functions.pct)% (\(.functions.covered)/\(.functions.total))\n  Branches: \(.branches.pct)% (\(.branches.covered)/\(.branches.total))\n  Statements: \(.statements.pct)% (\(.statements.covered)/\(.statements.total))"' "${TYPESCRIPT_COVERAGE_DIR}/coverage-summary.json"
    fi
    
    if [ -f "${PYTHON_COVERAGE_DIR}/coverage.json" ] && command_exists jq; then
        echo ""
        echo -e "${BLUE}Python Coverage:${NC}"
        jq -r '.totals | "  Lines: \(.percent_covered)% (\(.covered_lines)/\(.num_statements))\n  Missing Lines: \(.missing_lines)"' "${PYTHON_COVERAGE_DIR}/coverage.json"
    fi
    
    echo ""
    print_step "Coverage Reports Available:"
    echo "  TypeScript: file://${TYPESCRIPT_COVERAGE_DIR}/index.html"
    echo "  Python: file://${PYTHON_COVERAGE_DIR}/index.html"
    if [ -f "${COMBINED_COVERAGE_DIR}/index.html" ]; then
        echo "  Combined: file://${COMBINED_COVERAGE_DIR}/index.html"
    fi
    echo ""
}

# Main execution
main() {
    echo ""
    print_step "Starting Smartsheet MCP Server Coverage Analysis"
    echo "================================================="
    
    # Parse command line arguments
    SKIP_CLEANUP=false
    SKIP_TYPESCRIPT=false
    SKIP_PYTHON=false
    SKIP_COMBINED=false
    SKIP_UPLOAD=false
    OPEN_REPORTS=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-cleanup)
                SKIP_CLEANUP=true
                shift
                ;;
            --skip-typescript)
                SKIP_TYPESCRIPT=true
                shift
                ;;
            --skip-python)
                SKIP_PYTHON=true
                shift
                ;;
            --skip-combined)
                SKIP_COMBINED=true
                shift
                ;;
            --skip-upload)
                SKIP_UPLOAD=true
                shift
                ;;
            --open)
                OPEN_REPORTS=true
                shift
                ;;
            -h|--help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --skip-cleanup     Skip cleaning up old coverage reports"
                echo "  --skip-typescript  Skip TypeScript coverage"
                echo "  --skip-python      Skip Python coverage"
                echo "  --skip-combined    Skip combined coverage report"
                echo "  --skip-upload      Skip Codecov upload"
                echo "  --open             Open coverage reports in browser"
                echo "  -h, --help         Show this help message"
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Execute coverage pipeline
    EXIT_CODE=0
    
    if [ "$SKIP_CLEANUP" = false ]; then
        cleanup_coverage || EXIT_CODE=$?
    fi
    
    check_dependencies || EXIT_CODE=$?
    
    if [ "$SKIP_TYPESCRIPT" = false ]; then
        run_typescript_coverage || EXIT_CODE=$?
    fi
    
    if [ "$SKIP_PYTHON" = false ]; then
        run_python_coverage || EXIT_CODE=$?
    fi
    
    if [ "$SKIP_COMBINED" = false ]; then
        generate_combined_report || true  # Don't fail on combined report issues
    fi
    
    if [ "$SKIP_UPLOAD" = false ]; then
        upload_to_codecov || true  # Don't fail on upload issues
    fi
    
    generate_badges || true  # Don't fail on badge generation
    
    display_summary
    
    # Open reports if requested
    if [ "$OPEN_REPORTS" = true ]; then
        if command_exists open; then
            [ -f "${TYPESCRIPT_COVERAGE_DIR}/index.html" ] && open "${TYPESCRIPT_COVERAGE_DIR}/index.html"
            [ -f "${PYTHON_COVERAGE_DIR}/index.html" ] && open "${PYTHON_COVERAGE_DIR}/index.html"
            [ -f "${COMBINED_COVERAGE_DIR}/index.html" ] && open "${COMBINED_COVERAGE_DIR}/index.html"
        elif command_exists xdg-open; then
            [ -f "${TYPESCRIPT_COVERAGE_DIR}/index.html" ] && xdg-open "${TYPESCRIPT_COVERAGE_DIR}/index.html"
            [ -f "${PYTHON_COVERAGE_DIR}/index.html" ] && xdg-open "${PYTHON_COVERAGE_DIR}/index.html"
            [ -f "${COMBINED_COVERAGE_DIR}/index.html" ] && xdg-open "${COMBINED_COVERAGE_DIR}/index.html"
        fi
    fi
    
    if [ $EXIT_CODE -eq 0 ]; then
        print_success "Coverage analysis completed successfully!"
    else
        print_error "Coverage analysis completed with errors (exit code: $EXIT_CODE)"
    fi
    
    exit $EXIT_CODE
}

# Execute main function
main "$@"