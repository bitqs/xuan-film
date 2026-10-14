# 成片质检：逐帧（缩到 270×480 灰度）算清晰度（拉普拉斯方差）和亮度，找：
#  1) 单帧清晰度骤降（字没画出来、只剩光晕那种坏帧）：比前后两帧都低 35% 以上
#  2) 近黑帧（平均亮度 < 4）
#  3) 静止段（连续 ≥ 3 s 几乎没有变化）
# 用法：python -P -E tools/qa.py out/final.mp4
import subprocess, sys
import numpy as np
src = sys.argv[1]
W, H = 270, 480
p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", src, "-vf", f"scale={W}:{H},format=gray", "-f", "rawvideo", "-"], stdout=subprocess.PIPE)
sharp, mean, diff = [], [], []
prev = None
while True:
    b = p.stdout.read(W * H)
    if len(b) < W * H: break
    f = np.frombuffer(b, np.uint8).astype(np.float32).reshape(H, W)
    lap = f[1:-1, 1:-1] * 4 - f[:-2, 1:-1] - f[2:, 1:-1] - f[1:-1, :-2] - f[1:-1, 2:]
    sharp.append(float(lap.var())); mean.append(float(f.mean()))
    diff.append(0.0 if prev is None else float(np.abs(f - prev).mean())); prev = f
s = np.array(sharp); m = np.array(mean); d = np.array(diff)
n = len(s)
print(f"{n} frames ({n / 30:.1f} s)")
bad = [i for i in range(1, n - 1) if s[i] < 0.65 * s[i - 1] and s[i] < 0.65 * s[i + 1]]
print("single-frame sharpness dips:", [(i, round(i / 30, 2)) for i in bad][:40])
blk = np.where(m < 4)[0]
print("near-black frames:", len(blk), [(int(i), round(i / 30, 2)) for i in blk[:20]])
still, run = [], 0
for i in range(n):
    run = run + 1 if d[i] < 0.15 else 0
    if run == 90: still.append(round((i - 89) / 30, 2))
print("static stretches >= 3 s start at:", still)
