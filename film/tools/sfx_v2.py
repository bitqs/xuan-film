"""《选》音效 v2（2026-10-14 用户反馈：「有个总出现的音效太吵了，换个合理的」+ 配乐换成 A 小调的「科普悬疑」）。
- shimmer（34 次，70 颗高音玻璃粒 + 亮和弦 + 6–14 kHz 气声，只比人声低 6.5 LU）→ gather_1/2/3：
  书页小字「聚拢」的声音 = 纸张飘落声倒放（越聚越密，到成形那一下最满）+ 一张纸轻轻落到桌上，低通 6.5 kHz，没有音高；
  三个变体（长度 / 速度 / 落定声不同），场景里按顺序轮换（scenes/preview.tsx 的 VARIANTS）。比原来轻约 8 dB。
- chime：钟琴 D6 → 颤音琴 A5（更圆，和 A 小调同调），比原来低 3 dB。
- swell：玻璃和弦 D–A–F#–D → 空五度 A–E–A–E（F# 会和底乐的 F/Dm 打架）。
原文件备份在 public/sfx/_v1/。素材：《四象限》音效库（CC0：paper-flutter / paper-place，见 time-quadrant/public/sfx/catalog.json）。
用法：python -P -E tools/sfx_v2.py
"""
import os, shutil, sys
import numpy as np, soundfile as sf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from accents import H, SR, kmom_max, at_level  # noqa: E402  （score.py 的采样/滤波工具）

M, hz, smp, pitched, filt, stereo, reverb, cut, pad_to, noise, pink, tv_filter = (
    H[k] for k in ('M', 'hz', 'smp', 'pitched', 'filt', 'stereo', 'reverb', 'cut', 'pad_to', 'noise', 'pink', 'tv_filter'))
EP = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(EP)
TQ = 'D:/Projects/writingisthinking/studio/episodes/time-quadrant/public/sfx/'
OUT = 'public/sfx/'
os.makedirs(OUT + '_v1', exist_ok=True)
for n in ('shimmer', 'chime', 'swell'):
    if not os.path.exists(OUT + f'_v1/{n}.wav'): shutil.copy2(OUT + f'{n}.wav', OUT + f'_v1/{n}.wav')


def mono(path):
    y, sr = sf.read(path, dtype='float32', always_2d=True)
    assert sr == SR
    return y.mean(1).astype(np.float64)


def resamp(y, r):
    """变速（r > 1 更快更亮）"""
    import librosa
    return librosa.resample(np.ascontiguousarray(y), orig_sr=SR * r, target_sr=SR, res_type='soxr_hq')


PF, PP = mono(TQ + 'paper-flutter.wav'), mono(TQ + 'paper-place.wav')
PK = int(np.argmax(np.abs(PF)))  # 飘落声的起音峰值（约 0.24 s）


def gather(L, r, settle, side_off, seed):
    """L：取飘落声开头 L 秒倒放（峰值落在 L−0.24 s）；r：变速；settle：落定声音量；side_off：侧声道取另一段倒放，越聚越窄"""
    n = int(L * SR)
    mid = PF[:n][::-1].copy()
    side = PF[int(side_off * SR):int(side_off * SR) + n][::-1].copy()
    side = filt(np.stack([side, side], 1), 'high', 1200, 2)[:, 0] if len(side) == n else np.zeros(n)
    t = np.arange(n) / SR
    pk_t = (n - PK) / SR
    narrow = np.clip(1 - t / pk_t, 0, 1) ** 1.5           # 聚拢：开头宽，到成形那一刻收成正中
    fade_in = np.clip(t / 0.35, 0, 1) ** 2                 # 倒放的开头不是零，柔一点进来
    mid *= fade_in; side *= fade_in * narrow * 0.6
    y = np.stack([mid + side, mid - side], 1)
    # 落定：一张纸轻轻放到桌上（峰值处）
    pl = PP[:int(0.5 * SR)] * settle
    i = int(pk_t * SR) - 200
    seg = y[i:i + len(pl)]; seg += pl[:len(seg), None]
    tail = int(0.5 * SR)
    y = np.concatenate([y, np.zeros((tail, 2))])
    y = filt(y, 'high', 160, 2); y = filt(y, 'low', 6500, 2)
    y = reverb(y.astype(np.float32), 'room', 0.12)
    if abs(r - 1) > 1e-6: y = np.stack([resamp(y[:, 0], r), resamp(y[:, 1], r)], 1)
    f = int(0.25 * SR); y[-f:] *= np.linspace(1, 0, f)[:, None] ** 2
    return y.astype(np.float32), pk_t / r


old = {n: sf.read(OUT + f'_v1/{n}.wav', dtype='float32', always_2d=True)[0] for n in ('shimmer', 'chime', 'swell')}
print('旧 shimmer 瞬时峰值', round(kmom_max(old['shimmer']), 1), 'LUFS')
for k, (L, r, settle, so) in enumerate([(1.45, 1.00, 0.35, 0.60), (1.55, 0.93, 0.25, 0.85), (1.30, 1.07, 0.40, 1.05)], 1):
    y, pk = gather(L, r, settle, so, k)
    y = at_level(y, -17.0)
    sf.write(OUT + f'gather_{k}.wav', y, SR, subtype='PCM_24')
    print(f'gather_{k}.wav  {len(y) / SR:.2f} s  成形点 {pk:.2f} s  瞬时峰值 {kmom_max(y):.1f} LUFS  峰 {20 * np.log10(np.abs(y).max()):.1f} dBFS')

# chime：颤音琴 A5 + 很轻的 A6 正弦光晕
n = int(3.0 * SR); t = np.arange(n) / SR
v = pad_to(cut(pitched('vibraphone', M('A5')), 3.0, 1.0), n)
halo = stereo(np.sin(2 * np.pi * hz(M('A6')) * t) * np.exp(-t / 0.9) * np.clip(t / 0.002, 0, 1)) * 0.12
ch = reverb((v + halo).astype(np.float32), 'hall', 0.25)
ch = at_level(ch, kmom_max(old['chime']) - 3.0)
sf.write(OUT + 'chime.wav', ch, SR, subtype='PCM_24')
print(f'chime.wav  颤音琴 A5  瞬时峰值 {kmom_max(ch):.1f}（旧 {kmom_max(old["chime"]):.1f}）')

# swell：反向镲 + 空五度 A–E–A–E 玻璃和弦 + 气声，2 s 上扬，峰值在结尾（配方同 score.py，只换和弦音）
n = int(2.0 * SR); tt = np.arange(n) / SR
cy = filt(smp('sus_cymbal', 5), 'high', 400)[:n * 2]
rc = pad_to(cy, n)[::-1].copy()
chd = sum(np.sin(2 * np.pi * hz(M(m)) * tt * (1 + 0.004 * tt)) for m in ('A3', 'E4', 'A4', 'E5')) / 4
rise = (tt / 2.0) ** 2.6
y = rc * 0.7 + stereo(chd * rise) * 0.5 + filt(pink(n, 4), 'band', [800, 9000], 2) * (rise ** 1.5)[:, None] * 0.6
y = tv_filter(y, 600 * (14000 / 600) ** (tt / 2.0) ** 1.4, q=0.8); fl = int(0.02 * SR); y[-fl:] *= np.linspace(1, 0.6, fl)[:, None]
y = at_level(y, kmom_max(old['swell']))
sf.write(OUT + 'swell.wav', y, SR, subtype='PCM_24')
print(f'swell.wav  A–E 空五度  瞬时峰值 {kmom_max(y):.1f}（旧 {kmom_max(old["swell"]):.1f}）')
