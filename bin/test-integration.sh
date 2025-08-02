#!/usr/bin/env bash
# test-integration.sh - 統合テストの実行
# Usage: ./bin/test-integration.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "🔗 Running integration tests for procman..."

# 統合テスト用の環境変数設定
export TEST_ENV=integration

# Vitest 統合テスト
echo ""
echo "🏃 Running integration tests with Vitest..."
if [ -f "vitest.config.ts" ] || [ -f "vite.config.ts" ]; then
    # 統合テストファイルの存在確認
    integration_files=$(find tests -name "*.integration.*" -type f 2>/dev/null | wc -l)
    
    if [ "$integration_files" -gt 0 ]; then
        echo "  📊 Found $integration_files integration test files"
        # 統合テストのみを実行
        npx vitest run --reporter=verbose tests/integration/
        echo "  ✅ Integration tests passed"
    else
        echo "  ⚠️  No integration test files found in tests/integration/"
        echo "  📝 Integration test files should be named *.integration.test.ts"
        echo "  🔧 Please create integration test files first"
        exit 1
    fi
else
    echo "  ⚠️  No Vitest config found"
    echo "  📝 Integration tests require Vitest configuration"
    echo "  🔧 Please set up vitest.config.ts first"
    exit 1
fi

echo ""
echo "✅ All integration tests completed successfully!"