#!/bin/bash
# claude.sh - Claude Code実行ヘルパー
# Usage: ./bin/claude.sh [claude options]

claude --dangerously-skip-permissions --append-system-prompt "You're main-agent. follow \`<main-agent>\` instructions." "$@" 