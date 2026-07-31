#!/usr/bin/env bash
# 撮影→エンコード→仕様チェックを、途中で落ちても中断地点から再開できる形で回す。
#
#   scripts/instagram/run-reel-batch.sh <reel名> [<reel名> ...]
#
# reel名は marketing/instagram/reels/<名前>.reel.json の <名前>。
# 撮影は REEL_RESUME=1 で走るので、同じコマンドを再実行すれば残りだけ撮る。
# ヘッドレス（REEL_HEADLESS=1）にはしない。GPUの無い環境では xvfb-run を挟む。
set -u

DEV_URL="http://127.0.0.1:5173/"
RUNNER=""
if [ -z "${DISPLAY:-}" ] && command -v xvfb-run > /dev/null; then
  RUNNER="xvfb-run -a --server-args=-screen 0 1600x2400x24"
fi

ensure_dev() {
  for _ in $(seq 1 30); do
    if curl -sf -o /dev/null "$DEV_URL"; then return 0; fi
    sleep 2
  done
  echo "devサーバが $DEV_URL で応答しない。別ターミナルで npm run dev を起動する。" >&2
  return 1
}

capture() {
  local config="$1"
  # ブラウザが落ちた場合に備えて数回だけ回す。REEL_RESUME=1 なので撮り直しにはならない。
  for attempt in 1 2 3 4 5 6 7 8; do
    ensure_dev || return 1
    if [ -n "$RUNNER" ]; then
      xvfb-run -a --server-args="-screen 0 1600x2400x24" \
        env REEL_CONFIG="$config" REEL_RESUME=1 node scripts/instagram/capture-decision-reel.mjs && return 0
    else
      REEL_CONFIG="$config" REEL_RESUME=1 node scripts/instagram/capture-decision-reel.mjs && return 0
    fi
    echo "撮影が落ちた（$attempt 回目）。再開する。" >&2
    sleep 3
  done
  return 1
}

for name in "$@"; do
  config="marketing/instagram/reels/${name}.reel.json"
  [ -f "$config" ] || { echo "設定が無い: $config" >&2; exit 1; }

  echo "===== ${name} 撮影 $(date -u +%H:%M:%S) ====="
  capture "$config" || { echo "${name}: 撮影に失敗" >&2; exit 1; }

  # ffmpeg は撮影と取り合いになるので、撮り終えてから回す。
  echo "===== ${name} エンコード $(date -u +%H:%M:%S) ====="
  REEL_CONFIG="$config" node scripts/instagram/encode-reel.mjs || exit 1

  echo "===== ${name} 仕様チェック $(date -u +%H:%M:%S) ====="
  REEL_CONFIG="$config" node scripts/instagram/check-reel-output.mjs || exit 1

  echo "===== ${name} 完了 $(date -u +%H:%M:%S) ====="
done
