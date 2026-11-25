#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg belum terpasang. Install dulu, lalu jalankan lagi." >&2
  exit 1
fi

ffmpeg -hide_banner -loglevel error -loop 1 -i fixtures/sheet.png \
  -vf scale=1280:720 -t 2 -r 10 -pix_fmt yuv420p \
  -f yuv4mpegpipe fixtures/scan.y4m -y

echo "fixtures/scan.y4m siap ($(du -h fixtures/scan.y4m | cut -f1))"
