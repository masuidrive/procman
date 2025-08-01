#!/usr/bin/env bash
# test-unit.sh - ユニットテストと静的解析の実行
# Usage: ./bin/test-unit.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "🧪 Running unit tests and static analysis for procman..."

# TypeScript型チェック
echo ""
echo "📝 Running TypeScript type check..."
if [ -f "tsconfig.json" ]; then
    npx tsc --noEmit
    echo "  ✅ TypeScript type check passed"
else
    echo "  ⏭️  No tsconfig.json found, skipping type check"
fi

# ESLint
echo ""
echo "🔍 Running ESLint..."
if [ -f ".eslintrc.js" ] || [ -f ".eslintrc.json" ] || [ -f "eslint.config.js" ]; then
    npx eslint . --ext .ts,.js
    echo "  ✅ ESLint passed"
else
    echo "  ⏭️  No ESLint config found, skipping linting"
fi

# Prettier フォーマットチェック
echo ""
echo "💅 Checking code formatting with Prettier..."
if [ -f ".prettierrc" ] || [ -f ".prettierrc.js" ] || [ -f ".prettierrc.json" ]; then
    npx prettier --check "src/**/*.{ts,js,json}" "tests/**/*.{ts,js,json}" || {
        echo "  ❌ Code formatting issues found. Run 'npx prettier --write .' to fix."
        exit 1
    }
    echo "  ✅ Code formatting is correct"
else
    echo "  ⏭️  No Prettier config found, skipping format check"
fi

# Vitest ユニットテスト
echo ""
echo "🏃 Running unit tests with Vitest..."
if [ -f "vitest.config.ts" ] || [ -f "vite.config.ts" ]; then
    npx vitest run --reporter=verbose
    echo "  ✅ Unit tests passed"
else
    echo "  ⏭️  No Vitest config found, skipping unit tests"
fi

echo ""
echo "✅ All unit tests and static analysis completed successfully!"