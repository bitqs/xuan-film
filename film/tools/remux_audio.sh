#!/usr/bin/env bash
# 只换声音（画面不变）：Remotion 只渲音频 → 响度到 −12 LUFS（静态增益 + 限幅，补回限幅器 2 ms 前瞻）→
# 装回已有画面：母版 final.mkv 的视频流 → final_v2.mp4；上传版 24 Mbps 视频流 → 选_抖音上传版_v2.mp4；飞书 3 段预览同理。
# 用法：bash tools/remux_audio.sh [版本号，默认 v2]；已经渲过音频就 SKIP_RENDER=1
set -e
V=${1:-v2}
EP=D:/Projects/writingisthinking/studio/episodes/xuan
OUT=$EP/out
cd D:/Projects/writingisthinking/studio
source $EP/tools/env.sh
export TEMP=E:/remotion-tmp/xuan-audio TMP=E:/remotion-tmp/xuan-audio
mkdir -p $TEMP
[ -n "$SKIP_RENDER" ] || EPISODE=xuan npx remotion render episodes/xuan/index.ts Xuan $OUT/mix_$V.wav --codec=wav --concurrency=8 --timeout=300000 --log=error --browser-executable="$REMOTION_HS" --gl=angle
lufs() { ffmpeg -hide_banner -nostats -i "$1" -af ebur128=peak=true -f null - 2>&1 | grep -A1 "Integrated loudness" | grep -o "I: *-\?[0-9.]*" | grep -o "\-\?[0-9.]*$"; }
L=$(lufs $OUT/mix_$V.wav)
G=$(python -c "print(round(-10.0-($L),2))")   # 限幅会再压掉约 2 LU（旁白峰值多），落在 −12.2 左右；v1 是 +6.9 dB 到 −12.3
echo "mix $L LUFS -> gain $G dB"
ffmpeg -v error -y -i $OUT/mix_$V.wav -af "volume=${G}dB,alimiter=limit=0.82:attack=2:release=60:level=disabled,atrim=start_sample=96,apad=pad_len=96" -ar 48000 -c:a pcm_s24le $OUT/master_$V.wav
ffmpeg -hide_banner -nostats -i $OUT/master_$V.wav -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I|Peak):"
# 母版（CRF16 画面）
ffmpeg -v error -y -i $OUT/final.mkv -i $OUT/master_$V.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -shortest -movflags +faststart $OUT/final_$V.mp4
# 抖音上传版（24 Mbps 画面）
ffmpeg -v error -y -i "$OUT/final/选_抖音上传版.mp4" -i $OUT/master_$V.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -shortest -movflags +faststart "$OUT/final/选_抖音上传版_$V.mp4"
# 飞书预览：沿用 3 段 720p 画面，声音按同样的起点/时长切
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 $OUT/final.mp4)
SEG=$(python -c "import math; print(math.ceil($D/3*100)/100)")
for k in 0 1 2; do
  SS=$(python -c "print(round($k*$SEG,2))")
  ffmpeg -v error -y -i $OUT/final_preview_p$((k+1)).mp4 -ss $SS -t $SEG -i $OUT/master_$V.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 96k -shortest -movflags +faststart $OUT/final_preview_${V}_p$((k+1)).mp4
done
ls -la $OUT/final_$V.mp4 "$OUT/final/选_抖音上传版_$V.mp4" $OUT/final_preview_${V}_p*.mp4
