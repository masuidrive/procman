#!/bin/bash
set -e

if [ -f "$HOME/.gitconfig.host" ] && [ ! -f "$HOME/.gitconfig" ]; then
    echo "Copying .gitconfig.host to .gitconfig"
    cp "$HOME/.gitconfig.host" "$HOME/.gitconfig"
fi

# プロジェクト依存関係のインストール (install-deps.sh があれば実行)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -x "$SCRIPT_DIR/../../bin/install-deps.sh" ]; then
    echo "Installing project dependencies..."
    "$SCRIPT_DIR/../../bin/install-deps.sh"
else
    echo "No install-deps.sh found, skipping dependency installation"
fi