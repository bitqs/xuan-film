#!/usr/bin/env bash
# 成片：Remotion → final.mkv（PCM 母版）→ 响度到 −12 LUFS（静态增益 + 限幅，补回限幅器 2 ms 前瞻延迟）→ final.mp4（AAC 320k）
# 再出一份飞书预览（720p、≤28 MB、两遍编码）。用法：bash tools/render_final.sh [额外的 remotion 参数]
set -e
EP=D:/Projects/writingisthinking/studio/episodes/xuan
cd D:/Projects/writingisthinking/studio
source $EP/tools/env.sh
export TEMP=E:/remotion-tmp/xuan-final TMP=E:/remotion-tmp/xuan-final
mkdir -p $TEMP
OUT=$EP/out
EPISODE=xuan npx remotion render episodes/xuan/index.ts ${COMP:-Xuan} $OUT/final.mkv --codec=h264-mkv --crf=16 --concurrency=${CONC:-8} --timeout=300000 --log=error --browser-executable="$REMOTION_HS" --gl=angle "$@"
lufs() { ffmpeg -hide_banner -nostats -i "$1" -af ebur128=peak=true -f null - 2>&1 | grep -A1 "Integrated loudness" | grep -o "I: *-\?[0-9.]*" | grep -o "\-\?[0-9.]*$"; }
L=$(lufs $OUT/final.mkv)
G=$(python -c "print(round(-10.0-($L),2))")   # v2：限幅会压掉约 2 LU，落在 −12.3 左右（同 tools/remux_audio.sh）
echo "mix $L LUFS -> gain $G dB"
ffmpeg -v error -y -i $OUT/final.mkv -map 0:v -map 0:a -c:v copy -af "volume=${G}dB,alimiter=limit=0.82:attack=2:release=60:level=disabled,atrim=start_sample=96,apad=pad_len=96" -ar 48000 -c:a aac -b:a 320k -movflags +faststart $OUT/final.mp4
echo "final: $(lufs $OUT/final.mp4) LUFS"
# 抖音上传版：2 遍 x264 24 Mbps（母版是 CRF16 的 mkv/mp4）
ffmpeg -v error -y -i $OUT/final.mp4 -c:v libx264 -preset slow -b:v 24M -maxrate 32M -bufsize 48M -pass 1 -an -f null -passlogfile $OUT/_up NUL
ffmpeg -v error -y -i $OUT/final.mp4 -c:v libx264 -preset slow -b:v 24M -maxrate 32M -bufsize 48M -pass 2 -passlogfile $OUT/_up -c:a copy -movflags +faststart "$OUT/final/选_抖音上传版.mp4"
# 飞书预览：切 3 段，每段 ≤ 27 MB（720p，两遍编码），画面细节不至于糊
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 $OUT/final.mp4)
SEG=$(python -c "import math; print(math.ceil($D/3*100)/100)")
VB=$(python -c "print(int((26*8*1024*1024/$SEG - 96000)*0.97))")
for k in 0 1 2; do
  SS=$(python -c "print(round($k*$SEG,2))")
  ffmpeg -v error -y -ss $SS -t $SEG -i $OUT/final.mp4 -vf scale=720:1280 -c:v libx264 -b:v $VB -pass 1 -an -f null -passlogfile $OUT/_pv NUL
  ffmpeg -v error -y -ss $SS -t $SEG -i $OUT/final.mp4 -vf scale=720:1280 -c:v libx264 -b:v $VB -pass 2 -passlogfile $OUT/_pv -c:a aac -b:a 96k -movflags +faststart $OUT/final_preview_p$((k+1)).mp4
done
ls -la $OUT/final.mp4 "$OUT/final/选_抖音上传版.mp4" $OUT/final_preview_p*.mp4
