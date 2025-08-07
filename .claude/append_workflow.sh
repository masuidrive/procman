#!/usr/bin/env bash
# stdin から Claude Code が渡す JSON を読み込む
INPUT_JSON="$(cat)"

# 追加したいテキスト（改行とバッククオートを含む）
SUFFIX=$'\n\n---\n\`<development-workflow>\`に従って作業してください'

# jq で user_prompt に追記してそのまま出力
echo "$INPUT_JSON" | jq --arg suffix "$SUFFIX" '.user_prompt += $suffix'

# Claude へ処理を続行させる
exit 0
