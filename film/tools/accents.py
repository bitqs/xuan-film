"""《选》配乐 v2 的重音层：原配乐里写死的重拍（第 0 帧、碎裂、片名、三声重击、拱桥合龙、七问、四个「你为什么」、结尾「选」）
换成「科普悬疑」以后就没了，这里用 CC0 采样（VCSL 锣 / 大鼓 / 定音鼓 / 管钟 / 颤音琴，读 art-evolution 的库）+ numpy 合成补回来。
全部在 A 小调里（低频冲击 A2→A1、钟 A4、颤音琴 A 小调五声），和「科普悬疑」的 Am–G–F–Dm 不打架。
时刻全部取自 alignment/chars.json（字的开口）或场景里已经对好的画面帧；响度按「比人声整轨低多少 LU」给（400 ms 瞬时峰值；负数 = 比人声整轨还响，和 v1 配乐里的重拍力度对齐，略低 1–3 dB）。
被 tools/bed.py 调用：accents(voice_lufs) → (N×2 数组, 清单)
"""
import json, os
import numpy as np
from scipy.signal import lfilter

EP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _helpers():
    """借 score.py 前半段的采样/滤波工具（到「SFX KIT」为止，不触发配乐渲染）"""
    src = open(os.path.join(EP, 'tools/score.py'), encoding='utf-8').read()
    head = src.split('# ================================================================ SFX KIT')[0]
    g = {'__file__': os.path.join(EP, 'tools/score.py'), '__name__': 'score_helpers'}
    exec(compile(head, 'score.py', 'exec'), g)
    return g


H = _helpers()
SR = H['SR']
M, hz, smp, pitched, filt, stereo, reverb, cut, pad_to = (H[k] for k in ('M', 'hz', 'smp', 'pitched', 'filt', 'stereo', 'reverb', 'cut', 'pad_to'))


def kmom_max(x):
    """K 加权 400 ms 瞬时响度的最大值（LUFS）"""
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
    y = lfilter(b2, a2, lfilter(b1, a1, x, axis=0), axis=0)
    p = (y ** 2).sum(1); w = int(0.4 * SR)
    if len(p) < w: p = np.pad(p, (0, w - len(p)))
    c = np.concatenate([[0], np.cumsum(p)]); e = (c[w:] - c[:-w]) / w
    return -0.691 + 10 * np.log10(e.max() + 1e-12)


def at_level(x, lufs):
    return (x * 10 ** ((lufs - kmom_max(x)) / 20)).astype(np.float32)


# ---------------------------------------------------------------- 音色
def boom(dur=2.6, f_hi=110.0, f_lo=55.0):
    """圆润的低频冲击：A2→A1 正弦下滑 + 音乐会大鼓，没有尖锐起音"""
    n = int(dur * SR); t = np.arange(n) / SR
    f = f_lo + (f_hi - f_lo) * np.exp(-t / 0.09)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.7) * np.clip(t / 0.004, 0, 1)
    bd = filt(pad_to(cut(smp('bassdrum2', 3), dur, 0.4), n), 'low', 700, 2)
    return filt(stereo(sub) * 0.9 + bd * 0.6, 'low', 2200, 2)


def hit(dur=2.2):
    """三声重击 / 你为什么：定音鼓 + 大鼓 + 短一点的低频，带一点厅堂"""
    n = int(dur * SR)
    tp = pad_to(cut(smp('timpani', 9), dur, 0.3), n)
    y = boom(dur, 98.0, 55.0) * 0.8 + filt(tp, 'low', 3000, 2) * 0.7
    return reverb(y, 'hall', 0.18)


def gong(dur=6.0, key='2'):
    g = filt(cut(smp('gong', key), dur, 2.5), 'high', 60, 2)
    return reverb(g, 'hall', 0.15)


def bell(note='A4', dur=5.0):
    return reverb(cut(pitched('tubularbells2', M(note)), dur, 1.5), 'hall', 0.25)


def vib(notes, dur=3.2):
    y = sum(pad_to(cut(pitched('vibraphone', M(n)), dur, 0.8), int(dur * SR)) for n in notes)
    return reverb(y, 'hall', 0.3)


def rev_swell(dur=2.0):
    """反向镲的 2 秒上扬，峰值在结尾（让它的结尾落在碎裂那一刻）"""
    cy = filt(smp('sus_cymbal', 5), 'high', 400)
    y = pad_to(cy, int(dur * SR))[::-1].copy()
    return y * np.linspace(0.2, 1, len(y))[:, None] ** 2


# ---------------------------------------------------------------- 时刻
def _chars():
    return {l['id']: l for l in json.load(open(os.path.join(EP, 'alignment/chars.json'), encoding='utf-8'))}


def accents(vI):
    C = _chars()
    END = json.load(open(os.path.join(EP, 'storyboard/scenes.json'), encoding='utf-8'))['end']
    N = int(round(END * SR))
    out = np.zeros((N, 2), np.float64)
    cues = []

    def put(t, y, lu, what):
        y = at_level(y, vI - lu)
        i = int(round(t * SR)); n = min(len(y), N - i)
        out[i:i + n] += y[:n]
        cues.append(dict(t=round(t, 3), what=what, lu_below_voice=lu))

    c2 = [c['start'] for c in C['c2']['chars'] if c['c'] not in '。，']
    ni = [c['start'] for c in C['i10']['chars'] if c['c'] == '你']
    qs = [C[f'h{k}']['start'] for k in range(4, 11)]
    put(0.0, boom(), 3, '第 0 帧：低频冲击')
    sw = rev_swell(); put(4.125 - len(sw) / SR, sw, 2, '碎裂：反向镲上扬，峰值落在 4.125')
    put(4.125, boom(1.8, 92, 55), 1, '碎裂：轻冲击')
    put(19.5, gong(6.0), 1, '片名「选」：锣')
    put(19.5, boom(), 1, '片名「选」：低频冲击')
    put(19.5, bell('A4'), 6, '片名「选」：管钟 A4')
    for k, (t, lu) in enumerate(zip([c2[0], c2[2], c2[3]], [2, 2, 1])):   # 人(选) 祸 天(选)
        put(t, hit(), lu, f'三声重击 {k + 1}/3')
    put(300.0, boom(), 5, '拱桥合龙：低频冲击（底乐 B 段同时鼓进）')
    put(300.0, gong(5.0, '4'), 10, '拱桥合龙：轻锣')
    for k, (t, n) in enumerate(zip(qs[:6], ['A4', 'C5', 'D5', 'E5', 'G5', 'A5'])):
        put(t, vib([n]), 9, f'道痕第 {k + 1} 问：颤音琴 {n}')
    put(qs[6], vib(['A3', 'E4', 'A4', 'C5', 'E5'], 4.5), 7, '道痕第 7 问：颤音琴 Am 和弦')
    for k, (t, lu) in enumerate(zip(ni, [7, 6, 5, 4])):
        put(t, hit(1.6), lu, f'你为什么 {k + 1}/4')
    fin = gong(END - 480.0 + 0.5, '2')
    put(480.0, fin, 0, '结尾「选」：锣（拖到片尾）')
    put(480.0, boom(3.0), 1, '结尾「选」：低频冲击')
    put(480.0, bell('A4', 5.0), 5, '结尾「选」：管钟 A4')
    put(480.0, vib(['A3', 'E4', 'A4'], 5.0), 7, '结尾「选」：颤音琴 A–E–A')
    # 片尾最后 0.6 s 收干净
    f = int(0.6 * SR); out[-f:] *= np.linspace(1, 0, f)[:, None] ** 2
    return out, cues
