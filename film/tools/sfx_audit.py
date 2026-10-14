# 音效体检：按 work/sfx_cues.json（tools/sfx_cues.ts 导出）把全片音效按实际音量叠成一轨，
# 逐个音效统计：出现次数、K 加权瞬时响度峰值（400 ms）、比当时的人声高/低多少、4 kHz 以上能量占比、累计时长。
# 用法：python -P -E tools/sfx_audit.py [cues.json]
import json, sys, collections
import numpy as np, soundfile as sf
from scipy.signal import lfilter

SR = 48000
sys.stdout.reconfigure(encoding="utf-8")
EP = 'D:/Projects/writingisthinking/studio/episodes/xuan/'
cues = json.load(open(sys.argv[1] if len(sys.argv) > 1 else EP + 'work/sfx_cues.json', encoding='utf-8'))


def kw(x):
    """BS.1770 K 加权（48 kHz 系数）"""
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
    return lfilter(b2, a2, lfilter(b1, a1, x, axis=0), axis=0)


def mom(x, hop=0.1):
    """400 ms 瞬时响度（LUFS），每 hop 秒一个值"""
    y = kw(x)
    p = (y ** 2).sum(1)
    w, h = int(0.4 * SR), int(hop * SR)
    c = np.concatenate([[0], np.cumsum(p)])
    n = max(1, (len(p) - w) // h + 1)
    e = np.array([(c[i * h + w] - c[i * h]) / w for i in range(n)])
    return -0.691 + 10 * np.log10(e + 1e-12)


voice, _ = sf.read(EP + 'public/voice.wav', dtype='float32', always_2d=True)
music, _ = sf.read(EP + 'public/music.wav', dtype='float32', always_2d=True)
if voice.shape[1] == 1: voice = np.repeat(voice, 2, 1)  # 单声道旁白在成片里两个声道都有
vm, mm = mom(voice), mom(music)
lib = {}
for name in sorted({c['name'] for c in cues}):
    x, sr = sf.read(EP + f'public/sfx/{name}.wav', dtype='float32', always_2d=True)
    assert sr == SR
    if x.shape[1] == 1: x = np.repeat(x, 2, 1)
    X = np.abs(np.fft.rfft(x.mean(1)))
    fr = np.fft.rfftfreq(len(x), 1 / SR)
    lib[name] = (x, float((X[fr > 4000] ** 2).sum() / (X ** 2).sum()))

stem = np.zeros((len(voice) + 10 * SR, 2), np.float32)
rows = collections.defaultdict(list)
for c in cues:
    x, hf = lib[c['name']]
    n = min(len(x), int(c['len'] / 30 * SR))
    g = c['vol'] * np.clip((c['len'] / 30 * SR - np.arange(n)) / (8 / 30 * SR), 0, 1)[:, None]
    seg = x[:n] * g
    i0 = int(round(c['t'] * SR))
    stem[i0:i0 + n] += seg
    m = mom(np.pad(seg, ((0, max(0, int(0.4 * SR) - n)), (0, 0))))
    k0, k1 = int(c['t'] / 0.1), int((c['t'] + n / SR) / 0.1) + 1
    v = np.median(vm[max(0, k0 - 5):k1 + 5]) if k0 < len(vm) else -70
    mu = np.median(mm[max(0, k0 - 5):k1 + 5]) if k0 < len(mm) else -70
    rows[c['name']].append((float(m.max()), float(m.max() - max(v, -40)), float(m.max() - mu), n / SR, c['t'], c['scene']))

print(f"voice 中位瞬时响度（有声段）{np.median(vm[vm > -40]):.1f} LUFS；music 中位 {np.median(mm[mm > -60]):.1f} LUFS")
print(f"{'音效':14s} {'次数':>4s} {'峰值LUFS':>8s} {'比人声':>6s} {'比配乐':>6s} {'>4k占比':>7s} {'累计秒':>6s}  最响的几次")
for name, r in sorted(rows.items(), key=lambda kv: -len(kv[1])):
    pk = np.array([a[0] for a in r]); dv = np.array([a[1] for a in r]); dm = np.array([a[2] for a in r])
    top = sorted(r, key=lambda a: -a[0])[:3]
    print(f"{name:14s} {len(r):4d} {np.median(pk):8.1f} {np.median(dv):+6.1f} {np.median(dm):+6.1f} {lib[name][1]:7.0%} {sum(a[3] for a in r):6.1f}  "
          + '  '.join(f"{a[4]:.1f}s[{a[5]}]{a[0]:.0f}" for a in top))
sf.write(EP + 'work/sfx_stem.wav', stem[:len(voice)], SR, subtype='PCM_16')
