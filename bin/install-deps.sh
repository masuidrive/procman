#!/usr/bin/env bash
# install-deps.sh - 関係パッケージのインストール
# Usage: ./bin/install-deps.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "📦 Installing project dependencies for procman..."

echo ""
echo "📱 Installing Node.js dependencies..."

if [[ -f "package.json" ]]; then
    echo "  • Running npm install..."
    npm install
    echo "  ✅ Node.js dependencies installed"
else
    echo "  ⏭️  No package.json found, skipping Node.js dependencies"
fi

echo ""
echo "✅ All dependencies installed successfully!"