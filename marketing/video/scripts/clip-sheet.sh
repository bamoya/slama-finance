#!/usr/bin/env bash
# usage: clip-sheet.sh clipId [n] -> /tmp/clipsheets/<clip>.png (n evenly spaced frames, 3 per row)
mkdir -p /tmp/clipsheets
f="$(dirname "$0")/../public/clips/$1.mp4"; n=${2:-9}
d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
ffmpeg -loglevel error -y -i "$f" -vf "fps=$n/$d,scale=640:-1,tile=3x$(( (n+2)/3 ))" -frames:v 1 "/tmp/clipsheets/$1.png"
