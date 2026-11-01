#!/usr/bin/env bash
# usage: contact-sheet.sh chNN-name [n frames] -> /private/tmp/claude-503/demo/<name>-sheet.png
f="$(dirname "$0")/../public/recordings/$1.mp4"; n=${2:-9}
d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
ffmpeg -loglevel error -y -i "$f" -vf "fps=$n/$d,scale=640:-1,tile=3x$(( (n+2)/3 ))" -frames:v 1 "/private/tmp/claude-503/demo/$1-sheet.png"
