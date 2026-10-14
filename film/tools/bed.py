"""《选》配乐 v2：用户指定换成《写作就是思考本身》的「科普悬疑」（E:/D盘归档/自媒体/科普悬疑.mp3，240 s，180 BPM，A 小调 Am–G–F–Dm）。
不改速、不改调，只在小节线上剪接。分三幕，每幕对齐一个关键时刻，幕与幕之间是故事里本来就该「停」的地方：
  第一幕  0 → 193.15 s：前奏 I3 → 换气 → B 段鼓进 → 间奏 → C 段主旋律（C 段第一拍 = 「人选」84.00，祸/天选正好落在后两个小节头）
          → D 段 → 前奏 I2（E「神农架」讲故事）→ 「蓝光，也没有回来」处停
  第二幕  196.0 → 430.6 s：前奏 I1 → 换气 → B 鼓进（F1 硬币）→ 前奏 I2/I3（F2 堰塞湖、G1 发问）→ 换气 → B 鼓进 = 拱桥合龙 300.00
          → 间奏（G2）→ C1 主旋律（「只要你还能问，桥就还没断」）→ 前奏 I2/I3（H 道痕七问、I1 午后）→ 换气后停（「是一只很大的马蜂」）
  第三幕  437.33 → END：C2 C3 → 乐曲自己的收尾重拍 = 结尾「选」480.00
人声闪避（说话时 −5 dB，150 ms 预读下压、600 ms 释放）+ 2.5 kHz −2.5 dB，静态增益到比人声低 LU_BELOW；
再叠一层不闪避的「重音」（A 小调：低频冲击 / 锣 / 颤音琴），补回原配乐里写死的那些重拍。
输出 public/music.wav（48 kHz 立体声 24-bit，正好 END 秒）、notes/bed.json、work/bed_preview.wav（+人声，审听用）。
用法：python -P -E tools/bed.py [check]
"""
import json, os, subprocess, sys
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt

sys.stdout.reconfigure(encoding='utf-8')
EP = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(EP)
SR = 48000
U = 4 / 3                 # 一小节（4 拍 @180 BPM）
B0 = -0.0166              # 源里第 0 小节头（鼓的起音实测比《四象限》网格晚 17 ms，已并入）
END = json.load(open('storyboard/scenes.json', encoding='utf-8'))['end']
N = int(round(END * SR))
LU_BELOW = 16.5           # 闪避后的整轨响度比人声低多少 LU（写作 17，原配乐约 15）
SRC = np.load('E:/tq/audio/work/bgm/src48k.npy')
def sb(b): return B0 + b * U

# 幕：t0 = 第一段第一小节在成片里的时刻；segs = (起小节, 止小节, 接入这一段时的交叉淡化秒数)
ACTS = [
    dict(name='一', t0=0.0, segs=[(35, 130, 0), (148, 180, 0.12), (16, 48, 0.30)], fade_in=0.5, stop=193.15, fade_out=0.25,
         mute=[(118.667, 121.333)]),                      # 「世界不是银行」抽空两小节
    dict(name='二', t0=196.0, segs=[(6, 16, 0), (48, 82, 0.12), (16, 114, 0.30), (16, 50, 0.30)], fade_in=2.5, stop=430.62, fade_out=0.35),
    dict(name='三', t0=437.333, segs=[(114, 148, 0)], fade_in=1.6, stop=483.6, fade_out=1.2),
]


def render_act(a):
    """拼一幕：返回 (成片起点秒, 立体声数组, 接缝表)"""
    pre = int(0.010 * SR)                                  # 交叉淡化在小节头前 10 ms 结束，新段的起音完整
    out, joints, t = [], [], a['t0']
    for k, (b0, b1, xf) in enumerate(a['segs']):
        i0, i1 = int(round(sb(b0) * SR)), int(round(sb(b1) * SR))
        seg = SRC[max(0, i0):i1].astype(np.float64)
        if i0 < 0: seg = np.concatenate([np.zeros((-i0, 2)), seg])
        if k and xf:
            X = int(xf * SR)
            w = np.linspace(0, np.pi / 2, X)[:, None]
            # 接点前 (X+10 ms)…(10 ms)：上一段等功率淡出、新段的预卷淡入；最后 10 ms 已经全是新段（它的起音可能略早于网格）
            prev = out[-1]
            prev[-(X + pre):-pre] = prev[-(X + pre):-pre] * np.cos(w) + SRC[i0 - pre - X:i0 - pre].astype(np.float64) * np.sin(w)
            prev[-pre:] = SRC[i0 - pre:i0]
            joints.append(dict(t=round(t, 3), src_from=round(sb(a['segs'][k - 1][1]), 3), src_to=round(sb(b0), 3), xf=xf,
                               corr=corr_at(sb(a['segs'][k - 1][1]), sb(b0))))
        out.append(seg)
        t += (b1 - b0) * U
        i_prev_end = i1
    y = np.concatenate(out)
    return a['t0'], y, joints


def corr_at(ta, tb, win=1.0):
    m = SRC.mean(1).astype(np.float64)
    A = m[int((ta - win) * SR):int((ta + win) * SR)]; Bv = m[int((tb - win) * SR):int((tb + win) * SR)]
    n = min(len(A), len(Bv)); A, Bv = A[:n], Bv[:n]
    return round(float(np.dot(A, Bv) / (np.linalg.norm(A) * np.linalg.norm(Bv) + 1e-12)), 3)


def build_bed():
    bed = np.zeros((N, 2))
    info = []
    for a in ACTS:
        t0, y, joints = render_act(a)
        i0 = int(round(t0 * SR))
        n = min(len(y), int(round(a['stop'] * SR)) - i0)
        y = y[:n].copy()
        fi, fo = int(a['fade_in'] * SR), int(a['fade_out'] * SR)
        y[:fi] *= (np.sin(np.linspace(0, np.pi / 2, fi)) ** 2)[:, None]
        y[-fo:] *= (np.cos(np.linspace(0, np.pi / 2, fo)) ** 2)[:, None]
        for m0, m1 in a.get('mute', []):
            g = np.ones(n); j0, j1 = int(m0 * SR) - i0, int(m1 * SR) - i0; r, r2 = int(0.02 * SR), int(0.003 * SR)
            g[j0:j1] = 0; g[j0 - r:j0] = np.linspace(1, 0, r); g[j1 - r2:j1] = np.linspace(0, 1, r2)   # 回来的那一拍提前 3 ms 起
            y *= g[:, None]
        bed[i0:i0 + n] += y
        info.append(dict(act=a['name'], start=round(t0, 3), stop=a['stop'], joints=joints,
                         segs=[dict(film=round(t0 + sum((s[1] - s[0]) * U for s in a['segs'][:k]), 3), bars=[s[0], s[1]],
                                    src=[round(sb(s[0]), 3), round(sb(s[1]), 3)]) for k, s in enumerate(a['segs'])]))
    return bed, info


def duck(bed):
    lines = json.load(open('alignment/lines.json', encoding='utf-8'))
    reg = []
    for l in lines:
        if reg and l['start'] - reg[-1][1] <= 0.6: reg[-1][1] = max(reg[-1][1], l['end'])
        else: reg.append([l['start'], l['end']])
    D = 5.0
    ms = np.zeros(int(END * 1000) + 2)
    for s, e in reg: ms[int(s * 1000):int(e * 1000) + 1] = D
    g = np.zeros_like(ms); up, dn = D / 600, D / 150
    for k in range(1, len(ms)): g[k] = ms[k] if ms[k] >= g[k - 1] else max(ms[k], g[k - 1] - up)
    for k in range(len(ms) - 2, -1, -1): g[k] = max(g[k], g[k + 1] - dn)
    gain = 10 ** (-np.interp(np.arange(N) / SR * 1000, np.arange(len(g)), g) / 20)
    return bed * gain[:, None], len(reg)


def peq(x, f0, gdb, bw_oct):
    """RBJ 峰值 EQ（双声道）"""
    from scipy.signal import lfilter
    A = 10 ** (gdb / 40); w = 2 * np.pi * f0 / SR; al = np.sin(w) * np.sinh(np.log(2) / 2 * bw_oct * w / np.sin(w))
    b = [1 + al * A, -2 * np.cos(w), 1 - al * A]; a = [1 + al / A, -2 * np.cos(w), 1 - al / A]
    return lfilter(b, a, x, axis=0)


def limit(x, ceil_db=-1.0, look=0.005, rel=0.12):
    """预读峰值限幅（不引入延迟）：增益 = 窗口内最小的 ceil/|x|，再平滑；只在重音叠加的瞬间起作用"""
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    c = 10 ** (ceil_db / 20)
    a = np.abs(x).max(1)
    g = np.minimum(1.0, c / np.maximum(a, 1e-9))
    L = int(look * SR)
    g = minimum_filter1d(g, 2 * L + 1)
    g = uniform_filter1d(g, L)                      # 起音平滑（仍在预读窗口内）
    R = int(rel * SR); k = np.exp(-1 / R)            # 释放：一阶回升
    out = g.copy()
    idx = np.nonzero(g < 1.0)[0]
    i = 0
    while i < len(idx):                               # 只在需要压的地方附近逐采样跑释放
        s = idx[i]; e = s
        while i < len(idx) and idx[i] <= e + 6 * R: e = idx[i]; i += 1
        prev = 1.0
        for j in range(s, min(len(g), e + 6 * R)):
            prev = g[j] if g[j] < prev else min(g[j], prev * k + (1 - k))
            out[j] = prev
    return x * out[:, None], float(-20 * np.log10(out.min()))


def lufs(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                       capture_output=True, text=True, encoding='utf-8', errors='replace').stderr
    I = [l for l in r.splitlines() if l.strip().startswith('I:')][-1]
    pk = [l for l in r.splitlines() if l.strip().startswith('Peak:')][-1]
    return float(I.split()[1]), float(pk.split()[1])


if __name__ == '__main__':
    mode = (sys.argv[1:] or ['full'])[0]
    bed, info = build_bed()
    for a in info:
        print(f"第{a['act']}幕 {a['start']:.2f} → {a['stop']:.2f}")
        for s in a['segs']: print(f"   成片 {s['film']:7.2f}  小节 {s['bars'][0]:>3}–{s['bars'][1]:<3}  源 {s['src'][0]:7.2f}–{s['src'][1]:7.2f}")
        for j in a['joints']: print(f"   接缝 {j['t']:7.2f}  源 {j['src_from']:.2f} → {j['src_to']:.2f}  相关 {j['corr']}  淡化 {j['xf']} s")
    if mode == 'check': sys.exit()
    sys.path.insert(0, os.path.join(EP, 'tools')); from accents import accents   # 同目录 tools/accents.py（-P 不会自动加脚本目录）
    yd, nreg = duck(bed)
    yd = peq(yd, 2500, -2.5, 1.3)
    sf.write('work/_bed_duck.wav', yd.astype(np.float32), SR, subtype='FLOAT')
    vI, _ = lufs('work/_voice_st.wav') if os.path.exists('work/_voice_st.wav') else (None, None)
    if vI is None:
        v, _ = sf.read('public/voice.wav', dtype='float32', always_2d=True)
        sf.write('work/_voice_st.wav', np.repeat(v[:, :1], 2, 1), SR, subtype='FLOAT'); vI, _ = lufs('work/_voice_st.wav')
    bI, _ = lufs('work/_bed_duck.wav')
    gdb = vI - LU_BELOW - bI
    yd *= 10 ** (gdb / 20)
    acc, cues = accents(vI)
    mix, gr = limit(yd + acc)
    pk = np.abs(mix).max()
    print(f'人声 {vI:.1f} LUFS；底乐闪避后 {bI:.1f} → 增益 {gdb:+.2f} dB；重音 {len(cues)} 个；限幅最多压 {gr:.1f} dB；峰值 {20*np.log10(pk):.1f} dBFS；闪避区段 {nreg}')
    sf.write('public/music.wav', mix.astype(np.float32), SR, subtype='PCM_24')
    mI, mTP = lufs('public/music.wav')
    v, _ = sf.read('work/_voice_st.wav', dtype='float32', always_2d=True)
    n = min(len(v), len(mix))
    sf.write('work/bed_preview.wav', (v[:n] + mix[:n]).astype(np.float32), SR, subtype='FLOAT')
    json.dump(dict(source='E:/D盘归档/自媒体/科普悬疑.mp3（同《写作就是思考本身》，用户提供）', bpm=180, bar_s=U, bar0_src=B0, end=END,
                   lu_below_voice=LU_BELOW, voice_lufs=vI, bed_gain_db=round(gdb, 2), music_lufs=mI, music_tp=mTP,
                   acts=info, accents=cues), open('notes/bed.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'public/music.wav {mI:.1f} LUFS, TP {mTP:.1f} dBTP；notes/bed.json 已写')
