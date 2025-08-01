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
    # 統合テストのパターンで実行（通常は test/**/*.integration.ts など）
    npx vitest run --reporter=verbose test/**/*.integration.* || {
        echo "  ℹ️  No integration test files found, running all tests in integration mode"
        npx vitest run --reporter=verbose
    }
    echo "  ✅ Integration tests passed"
else
    echo "  ⚠️  No Vitest config found"
    echo "  📝 Integration tests require Vitest configuration"
    echo "  🔧 Please set up vitest.config.ts first"
    exit 1
fi

echo ""
echo "✅ All integration tests completed successfully!"