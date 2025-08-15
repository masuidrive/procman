#!/usr/bin/env bash
# test-e2e.sh - E2Eテストの実行
# Usage: ./bin/test-e2e.sh [test-file-name] or ./bin/test-e2e.sh --grep <pattern>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "🚀 Running E2E tests for procman..."

# E2Eテスト用の環境変数設定
export TEST_ENV=e2e
export NODE_ENV=test

# ビルドが必要かチェック
if [ ! -d "dist" ] || [ ! -f "dist/src/cli/index.js" ]; then
    echo "📦 Building project for E2E tests..."
    npm run build
fi

# C言語テストユーティリティのビルド
if [ ! -f "tests/e2e/fixtures/memory-eater" ]; then
    echo "🔨 Building C test utilities..."
    if command -v gcc >/dev/null 2>&1; then
        cd tests/e2e/fixtures
        make clean >/dev/null 2>&1 || true
        if make memory-eater; then
            echo "  ✅ memory-eater built successfully"
        else
            echo "  ⚠️  Failed to build memory-eater, related tests may fail"
        fi
        cd - >/dev/null
    else
        echo "  ⚠️  gcc not found, C test utilities will not be available"
    fi
fi

# Vitest E2Eテスト
echo ""
echo "🏃 Running E2E tests with Vitest..."
if [ -f "vitest.config.ts" ] || [ -f "vite.config.ts" ]; then
    # E2Eテストファイルの存在確認
    e2e_files=$(find tests -name "*.e2e.*" -type f 2>/dev/null | wc -l)
    
    if [ "$e2e_files" -gt 0 ]; then
        echo "  📊 Found $e2e_files E2E test files"
        
        # 引数処理
        if [ $# -eq 0 ]; then
            # 全E2Eテストを実行
            npx vitest run --reporter=verbose tests/e2e/
        elif [ "$1" = "--grep" ] && [ $# -eq 2 ]; then
            # パターンマッチでテストを実行
            npx vitest run --reporter=verbose tests/e2e/ -t "$2"
        else
            # 特定のテストファイルを実行
            test_file="$1"
            if [[ ! "$test_file" == *.e2e.* ]]; then
                test_file="tests/e2e/${test_file}.e2e.test.ts"
            fi
            if [ -f "$test_file" ]; then
                npx vitest run --reporter=verbose "$test_file"
            else
                echo "  ❌ Test file not found: $test_file"
                echo "  📝 Available E2E test files:"
                find tests/e2e -name "*.e2e.*" -type f 2>/dev/null || echo "    (none)"
                exit 1
            fi
        fi
        echo "  ✅ E2E tests passed"
    else
        echo "  ⚠️  No E2E test files found in tests/e2e/"
        echo "  📝 E2E test files should be named *.e2e.test.ts"
        echo "  🔧 Please create E2E test files first"
        exit 1
    fi
else
    echo "  ⚠️  No Vitest config found"
    echo "  📝 E2E tests require Vitest configuration"
    echo "  🔧 Please set up vitest.config.ts first"
    exit 1
fi

echo ""
echo "✅ All E2E tests completed successfully!"