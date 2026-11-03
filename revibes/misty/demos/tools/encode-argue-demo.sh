#!/bin/sh
# Merge the frames and audio from record-argue-demo.mjs into a 1080p MP4. Run in the same folder.
set -e
D=$(python3 -c "import json;d=json.load(open('sync.json'));print(round(d['end']-d['firstFrame'],2))")
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i frames.txt -i audio.webm \
  -filter_complex "[0:v]fps=30,scale=1920:1080:flags=lanczos,format=yuv420p[v];[1:a]loudnorm=I=-16:TP=-1.5,aresample=48000,apad[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -crf 14 -preset slow -profile:v high -c:a aac -b:a 192k -ar 48000 \
  -t "$D" -movflags +faststart argue-demo.mp4
