#!/usr/bin/env bash
set -euo pipefail

SKILL="$(cd "$(dirname "$0")" && pwd)"
B="$SKILL/brand"
OUT="${VIDEO_OUT_DIR:-$SKILL/.out}"
key="$1" label="$2" title="$3" name="$4"
mkdir -p "$OUT"

slate() {
  swift "$B/title_slate.swift" "$B/logo_full.png" "$B/fonts/azoft-sans.ttf" "$B/fonts/azoft-sans-bold.ttf" "$1" "$label" "$title" ${2:-} </dev/null >/dev/null
}
slate "$OUT/title_$key.png"
slate "$OUT/poster_$key.png" white
ffmpeg -nostdin -v error -y -i "$OUT/poster_$key.png" -q:v 3 "$OUT/$name.jpg"

V="$(ls -t "$OUT/raw/$key"/*.webm | head -1)"
DUR="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$V" </dev/null)"
FO="$(python3 -c "print(round($DUR-0.5,2))")"

ffmpeg -nostdin -v error -y \
  -f lavfi -i "color=white:s=1440x900:r=25:d=4" -loop 1 -t 4 -i "$OUT/title_$key.png" -i "$V" \
  -f lavfi -i "color=white:s=1440x900:r=25:d=3.5" -loop 1 -t 3.5 -i "$B/slate.png" \
  -filter_complex "\
[1]format=rgba,fade=in:st=0.3:d=0.7:alpha=1,fade=out:st=3.3:d=0.6:alpha=1[l1];\
[0][l1]overlay=0:0:shortest=1,fps=25,format=yuv420p,setsar=1[intro];\
[2]fps=25,scale=1440:900,fade=in:st=0:d=0.5:color=white,fade=out:st=$FO:d=0.5:color=white,format=yuv420p,setsar=1[mid];\
[4]format=rgba,fade=in:st=0.2:d=0.7:alpha=1[l2];\
[3][l2]overlay=0:0:shortest=1,fps=25,format=yuv420p,setsar=1[outro];\
[intro][mid][outro]concat=n=3:v=1:a=0[v]" \
  -map "[v]" -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -movflags +faststart "$OUT/$name.mp4"

echo "$OUT/$name.mp4 $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/$name.mp4" </dev/null)s"
echo "$OUT/$name.jpg"
