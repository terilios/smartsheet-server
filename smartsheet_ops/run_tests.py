#!/usr/bin/env python3
"""
Simple test runner for smartsheet_ops tests
"""

import subprocess
import sys
import os

def run_command(cmd, description):
    """Run a command and return the result"""
    print(f"\n🔄 {description}")
    print(f"Running: {cmd}")
    print("-" * 50)
    
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        
        if result.stdout:
            print(result.stdout)
        if result.stderr:
            print("STDERR:", result.stderr)
            
        print(f"Return code: {result.returncode}")
        return result.returncode == 0
        
    except Exception as e:
        print(f"❌ Error running command: {e}")
        return False

def main():
    """Main test runner"""
    print("🧪 Smartsheet Operations Test Runner")
    print("=" * 50)
    
    # Change to the correct directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    # Test configurations
    test_configs = [
        {
            "cmd": "python -m pytest tests/unit/test_core_operations.py::TestSmartsheetOperations::test_initialization -v",
            "description": "Test basic initialization (should pass)"
        },
        {
            "cmd": "python -m pytest tests/unit/test_core_operations.py::TestSmartsheetOperations::test_initialization_with_invalid_api_key -v",
            "description": "Test initialization with invalid key (should pass)"
        },
        {
            "cmd": "python -m pytest tests/unit/ --tb=short -x",
            "description": "Run all unit tests (stop on first failure)"
        },
        {
            "cmd": "python -c 'from smartsheet_ops import SmartsheetOperations; print(\"✅ Import successful\")'",
            "description": "Test basic import"
        }
    ]
    
    # Run tests
    results = []
    for config in test_configs:
        success = run_command(config["cmd"], config["description"])
        results.append((config["description"], success))
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 TEST SUMMARY")
    print("=" * 50)
    
    passed = 0
    failed = 0
    
    for description, success in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {description}")
        if success:
            passed += 1
        else:
            failed += 1
    
    print(f"\nTotal: {len(results)}, Passed: {passed}, Failed: {failed}")
    
    if failed > 0:
        print("\n⚠️  Some tests failed. Check the output above for details.")
        return 1
    else:
        print("\n🎉 All tests passed!")
        return 0

if __name__ == "__main__":
    sys.exit(main())