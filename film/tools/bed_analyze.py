# 「科普悬疑」逐小节体检：小节网格 bar(b) = B0 + b·U（180 BPM，4 拍一小节；相位沿用《四象限》的分析），
# 每小节各频段能量（dB）+ 底鼓/军鼓起音强度，用来核对段落图（前奏/换气/B/间奏/C/收尾重拍/D）。
# 用法：python -P -E tools/bed_analyze.py
import sys
import numpy as np
from scipy.signal import stft

sys.stdout.reconfigure(encoding='utf-8')
SR = 48000
U = 4 / 3
B0 = 0.2992 + 3 / 3 - U  # 《四象限》：第一拍 0.2992 s，小节头在第 3 拍相位 → −0.0341 s
x = np.load('E:/tq/audio/work/bgm/src48k.npy').astype(np.float64)
m = x.mean(1)
s = x[:, 0] - x[:, 1]
hop = 480
f, t, Z = stft(m, fs=SR, nperseg=4096, noverlap=4096 - hop, boundary=None)
P = np.abs(Z) ** 2
fps = SR / hop
bands = {'sub': (30, 120), 'low': (120, 400), 'mid': (400, 2000), 'hi': (2000, 6000), 'air': (6000, 16000)}
BE = {k: P[(f >= a) & (f < b)].sum(0) for k, (a, b) in bands.items()}
mag = np.log1p(1e3 * np.abs(Z))
flux_lo = np.maximum(0, np.diff(mag[(f >= 40) & (f < 130)], axis=1)).sum(0)
flux_sn = np.maximum(0, np.diff(mag[(f >= 1500) & (f < 6000)], axis=1)).sum(0)
nb = int((len(m) / SR - B0) / U)
print('bar  src_s   ' + ' '.join(f'{k:>5s}' for k in bands) + '   kick(1234)        snare(1234)       side')
ref = {k: np.median(BE[k]) for k in bands}
for b in range(1, nb):
    a0, a1 = B0 + b * U, B0 + (b + 1) * U
    i0, i1 = max(0, int(a0 * fps)), min(P.shape[1], int(a1 * fps))
    if i1 <= i0: continue
    e = [10 * np.log10(BE[k][i0:i1].mean() / ref[k] + 1e-12) for k in bands]
    kk = [flux_lo[max(0, int((a0 + q / 3) * fps) - 2):int((a0 + q / 3) * fps) + 3].max() for q in range(4)]
    sn = [flux_sn[max(0, int((a0 + q / 3) * fps) - 2):int((a0 + q / 3) * fps) + 3].max() for q in range(4)]
    j0, j1 = int(max(a0, 0) * SR), int(a1 * SR)
    side = 10 * np.log10((s[j0:j1] ** 2).mean() / ((m[j0:j1] ** 2).mean() + 1e-12) + 1e-12)
    print(f'{b:3d} {a0:7.2f} ' + ' '.join(f'{v:+5.1f}' for v in e) + '   ' + ' '.join(f'{v:4.0f}' for v in kk) + '   ' + ' '.join(f'{v:4.0f}' for v in sn) + f'  {side:+5.1f}')
