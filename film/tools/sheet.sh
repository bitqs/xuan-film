#!/usr/bin/env bash
# 场景自检：渲染场景 S-<ID> 每隔 N 帧一张 → 拼成带帧号的联系表 out/sheets/<ID>.jpg（每格 216×384）。
# 用法：bash tools/sheet.sh <ID> [每隔几帧=15] [起始帧] [结束帧]
# 也可以：bash tools/sheet.sh <ID> list 120,240,300   （只渲这几帧，大一点：每格 360×640）
set -e
ID="$1"; EVERY="${2:-15}"
EP=D:/Projects/writingisthinking/studio/episodes/xuan
cd D:/Projects/writingisthinking/studio
source $EP/tools/env.sh
export TEMP=E:/remotion-tmp/xuan-$ID TMP=E:/remotion-tmp/xuan-$ID
mkdir -p $TEMP $EP/out/sheets $EP/out/frames
D=$EP/out/frames/$ID; rm -rf $D; mkdir -p $D
if [ "$EVERY" = "list" ]; then
  for fr in $(echo "$3" | tr ',' ' '); do
    EPISODE=xuan npx remotion still episodes/xuan/dev/$ID.tsx S-$ID $D/f$(printf %05d $fr).jpeg --frame=$fr --image-format=jpeg --gl=angle --browser-executable="$REMOTION_HS" --timeout=120000 --log=error
  done
  python -P -E $EP/tools/sheet.py $D $EP/out/sheets/$ID.jpg 360 640 list
else
  RANGE=""
  [ -n "$3" ] && RANGE="--frames=$3-${4:-$3}"
  EPISODE=xuan npx remotion render episodes/xuan/dev/$ID.tsx S-$ID $D --sequence --every-nth-frame=$EVERY $RANGE --image-format=jpeg --jpeg-quality=80 --gl=angle --browser-executable="$REMOTION_HS" --timeout=120000 --concurrency=2 --log=error
  python -P -E $EP/tools/sheet.py $D $EP/out/sheets/$ID.jpg 216 384 $EVERY ${3:-0}
fi
echo "sheet: $EP/out/sheets/$ID.jpg"
