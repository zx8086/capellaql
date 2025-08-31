#!/bin/bash
# K6 Performance Test Suite - Setup Verification Script

echo "🔍 K6 Performance Test Suite - Setup Verification"
echo "=================================================="

# Check if K6 is installed
if ! command -v k6 &> /dev/null; then
    echo "❌ K6 is not installed. Please install K6 first."
    echo "   Install: brew install k6 (macOS) or visit https://k6.io/docs/getting-started/installation/"
    exit 1
fi

echo "✅ K6 is installed: $(k6 version)"
echo ""

# Test TypeScript module resolution for each test
echo "🧪 Testing TypeScript Module Resolution:"
echo "----------------------------------------"

tests=(
    "test/k6/smoke/health-smoke.ts"
    "test/k6/smoke/graphql-smoke.ts"
    "test/k6/load/health-load.ts"
    "test/k6/load/graphql-load.ts"
    "test/k6/load/complete-graphql-coverage.ts"
    "test/k6/stress/system-stress.ts"
    "test/k6/scenarios/fashion-buyer-journey.ts"
    "test/k6/scenarios/database-connection-stress.ts"
)

failed_tests=0
passed_tests=0

for test in "${tests[@]}"; do
    echo -n "Testing $test ... "
    
    # Run test with 1 VU, 1 iteration, and capture stderr
    result=$(k6 run --vus 1 --iterations 1 "$test" 2>&1)
    
    # Check if there are module resolution errors
    if echo "$result" | grep -q "opening file via launcher's bridge\|no such file or directory\|cannot resolve"; then
        echo "❌ Module resolution failed"
        failed_tests=$((failed_tests + 1))
    else
        echo "✅ Module resolution successful"
        passed_tests=$((passed_tests + 1))
    fi
done

echo ""
echo "📊 Test Results Summary:"
echo "------------------------"
echo "✅ Passed: $passed_tests tests"
echo "❌ Failed: $failed_tests tests"
echo "Total: $((passed_tests + failed_tests)) tests"

if [ $failed_tests -eq 0 ]; then
    echo ""
    echo "🎉 All TypeScript tests are properly configured!"
    echo "   Ready to run performance tests with:"
    echo "   • bun run k6:smoke:health"
    echo "   • bun run k6:load:coverage"  
    echo "   • bun run k6:scenario:buyer"
    echo "   • bun run k6:all:modern"
else
    echo ""
    echo "⚠️  Some tests have module resolution issues."
    echo "   Check import paths in failed tests."
fi

echo ""
echo "🚀 Available Bun Scripts:"
echo "-------------------------"
echo "Modern TypeScript Tests:"
echo "  bun run k6:smoke:health     - Health endpoint smoke test"
echo "  bun run k6:smoke:graphql    - GraphQL operations smoke test"
echo "  bun run k6:load:health      - Health endpoint load test"
echo "  bun run k6:load:graphql     - GraphQL operations load test"
echo "  bun run k6:load:coverage    - Complete GraphQL coverage test"
echo "  bun run k6:stress:system    - System stress test"
echo "  bun run k6:scenario:buyer   - Fashion buyer journey"
echo "  bun run k6:scenario:database - Database connection stress"
echo "  bun run k6:all:modern       - Full modern test suite"
echo ""
echo "Legacy JavaScript Tests:"
echo "  bun run k6:smoke            - Legacy smoke test"
echo "  bun run k6:load             - Legacy load test"
echo "  bun run k6:graphql          - Legacy GraphQL test"
echo "  bun run k6:all:legacy       - Legacy test suite"

echo ""
echo "📚 Documentation:"
echo "  • test/k6/README.md - Comprehensive usage guide"
echo "  • test/k6/MODERNIZATION_SUMMARY.md - Implementation details"