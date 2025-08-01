#!/bin/sh

npx -y @bloom-and-co/code-review@latest --dotenv \
  --ticket current-ticket.md \
  --git-diff "main" \
  --add-files "docs/**/*.md" \
  --add-files "tickets/**/*.md" \
  "$@"
