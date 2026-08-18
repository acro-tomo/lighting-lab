#!/usr/bin/env bash
# リール制作のローカル工程を Codex 等のローカルエージェントに渡す。
#
# 使い方:
#   scripts/instagram/handoff-to-codex.sh            # そのまま起動
#   scripts/instagram/handoff-to-codex.sh --print    # 渡すプロンプトを表示するだけ
#   CODEX_CMD="codex exec" scripts/instagram/handoff-to-codex.sh
#
# 呼び出し形式は環境によって違うので CODEX_CMD で差し替えられるようにしてある。
set -euo pipefail

BRIEF="marketing/instagram/reels/HANDOFF-local-codex.md"
CODEX_CMD="${CODEX_CMD:-codex exec}"

if [ ! -f "$BRIEF" ]; then
  echo "指示書が無い: $BRIEF（リポジトリのルートで実行する）" >&2
  exit 1
fi

# 指示書末尾のコードブロック（そのまま渡すプロンプト）を取り出す。
PROMPT=$(awk '/^## そのまま渡すプロンプト$/{found=1} found && /^```$/{n++; next} found && n==1' "$BRIEF")

if [ -z "$PROMPT" ]; then
  echo "指示書からプロンプトを取り出せなかった。$BRIEF の見出しを確認する。" >&2
  exit 1
fi

if [ "${1:-}" = "--print" ]; then
  printf '%s\n' "$PROMPT"
  exit 0
fi

# shellcheck disable=SC2086
if ! command -v ${CODEX_CMD%% *} >/dev/null 2>&1; then
  echo "'${CODEX_CMD%% *}' が PATH に無い。CODEX_CMD で呼び出し形式を指定する。" >&2
  echo "プロンプトだけ見たい場合は --print を付ける。" >&2
  exit 127
fi

echo "起動: $CODEX_CMD"
# shellcheck disable=SC2086
exec $CODEX_CMD "$PROMPT"
