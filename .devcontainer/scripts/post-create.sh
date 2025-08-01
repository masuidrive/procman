#!/bin/bash
set -e

if [ -d "$HOME/.nvm" ]; then
    source "$HOME/.nvm/nvm.sh"

    npm install -g -qq \
        npm @anthropic-ai/claude-code
fi

# TypeScript and Vitest development tools
if [ -d "$HOME/.nvm" ]; then
    source "$HOME/.nvm/nvm.sh"
    
    # Install global development tools for TypeScript projects
    npm install -g -qq \
        typescript \
        tsx \
        @types/node \
        vitest \
        eslint \
        prettier
fi