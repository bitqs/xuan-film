#!/usr/bin/env bash
# 场景预览片（带旁白+配乐+音效+字幕）：out/previews/<ID>.mp4（1080×1920），再压一份 720p 进飞书队列（自动发给用户）。
# 用法：bash tools/preview.sh <ID> [--no-feishu]
set -e
ID="$1"
EP=D:/Projects/writingisthinking/studio/episodes/xuan
cd D:/Projects/writingisthinking/studio
source $EP/tools/env.sh
export TEMP=E:/remotion-tmp/xuan-$ID TMP=E:/remotion-tmp/xuan-$ID
mkdir -p $TEMP $EP/out/previews
EPISODE=xuan npx remotion render episodes/xuan/dev/$ID.tsx S-$ID $EP/out/previews/$ID.mp4 --gl=angle --browser-executable="$REMOTION_HS" --timeout=120000 --concurrency=3 --log=error
if [ "$2" != "--no-feishu" ]; then
  ffmpeg -v error -y -i $EP/out/previews/$ID.mp4 -vf scale=720:1280 -c:v libx264 -preset medium -crf 21 -maxrate 8M -bufsize 16M -c:a aac -b:a 128k -movflags +faststart $EP/out/feishu_queue/_$ID.mp4
  mv $EP/out/feishu_queue/_$ID.mp4 "$EP/out/feishu_queue/场景$ID-预览.mp4"
fi
echo "preview: $EP/out/previews/$ID.mp4"
