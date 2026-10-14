"""《选》 — procedural score + SFX kit. ONE source of truth (grid, motif, harmony, every event, ducking, mix).
Sound material: CC0 VCSL one-shots + VSCO-2 CE orchestral multisamples + OpenAIR IRs, read from D:/Projects/art-evolution
(read-only) — plus numpy synthesis. Rendered offline at 48 kHz: every event is sample-exact on the 80 BPM grid.
Grid: beat 0.75 s, bar 3.0 s, t = 0 is the downbeat of bar 0. END 517.5 s (172.5 bars).
Key family: D 宫 / B 羽 (D major pentatonic over D major / B minor harmony).
Motif 「选」: D5 . A4 B4 | F#5 ~ ~ E5  (1 5̣ 6̣ 3 2 — reach up a sixth, stay open on 2).
  python -P -E tools/score.py sfx    → public/sfx/*.wav (the SFX kit)
  python -P -E tools/score.py test   → work/score_test.wav (0–45 s, music + voice)
  python -P -E tools/score.py full   → public/music.wav (ducked, 517.5 s) + work/score_preview.wav + feishu mp3s
"""
import json, os, subprocess, sys, shutil
import numpy as np, soundfile as sf, librosa
from scipy.signal import butter, sosfilt, lfilter, oaconvolve
sys.stdout.reconfigure(encoding='utf-8')
EP = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(EP)
AE = 'D:/Projects/art-evolution'
SR = 48000; BPM = 80; BEAT = 0.75; BAR = 3.0; END = 517.5
def bt(b, beat=0.0): return BAR * b + BEAT * beat
MODE = (sys.argv[1:] or ['test'])[0]
GRID = json.load(open('notes/grid.json', encoding='utf-8'))
LINES = {l['id']: l for l in GRID['lines']}
CHARS = {l['id']: l for l in json.load(open('alignment/chars.json', encoding='utf-8'))}

# ---------------------------------------------------------------- pitch helpers
PC = dict(c=0, d=2, e=4, f=5, g=7, a=9, b=11)
def M(n):
    n = n.strip(); p = PC[n[0].lower()]; i = 1
    while i < len(n) and n[i] in '#b': p += 1 if n[i] == '#' else -1; i += 1
    return 12 * (int(n[i:]) + 1) + p
def hz(m): return 440.0 * 2 ** ((m - 69) / 12)

# ---------------------------------------------------------------- samples (read-only from art-evolution)
VC = json.load(open(f'{AE}/music/samples/vcsl/index.json', encoding='utf-8'))
OCT = {'glockenspiel': 12, 'psaltery_pluck': 12, 'ocarina': 12, 'ocarina_vib': 12, 'dantranh': 12, 'dantranh_vibrato': 12, 'dantranh_tremolo': 12, 'recorder_tenor_vib': 12, 'vibraphone': 12}   # glock + psaltery measured an octave above their labels (pyin, 10-14)
_W, _R = {}, {}
def wav(path, norm=True, trim=True):
    key = (path, norm, trim)
    if key in _W: return _W[key]
    y, sr = sf.read(path, dtype='float32', always_2d=True)
    y = y[:, :2] if y.shape[1] > 1 else np.repeat(y, 2, 1)
    if sr != SR: y = librosa.resample(np.ascontiguousarray(y.T), orig_sr=sr, target_sr=SR).T
    y = y - y.mean(0)
    if trim:   # start 1 ms before the onset so the transient lands on the scheduled time
        e = np.abs(y).max(1); i = int(np.argmax(e > e.max() * 0.03)); y = y[max(0, i - 48):]
    if norm: y = y / (np.abs(y).max() + 1e-9)
    _W[key] = np.ascontiguousarray(y, dtype=np.float32); return _W[key]
def smp(inst, key): return wav(f'{AE}/' + VC[inst][str(key)])
def repitch(y, r):
    if abs(r - 1) < 1e-5: return y
    k = (id(y), round(r, 6))
    if k not in _R: _R[k] = np.ascontiguousarray(librosa.resample(np.ascontiguousarray(y.T), orig_sr=SR * r, target_sr=SR, res_type='soxr_hq').T, dtype=np.float32)
    return _R[k]
def pitched(inst, m):
    o = OCT.get(inst, 0); k = min(VC[inst], key=lambda k: (abs(M(k) + o - m), M(k)))
    return repitch(smp(inst, k), 2 ** ((m - M(k) - o) / 12))
ORCH = json.load(open(f'{AE}/music/samples/orch/index.json', encoding='utf-8'))
import re
_VRE, _RRE = re.compile(r'_v(\d)'), re.compile(r'(?:rr|RR)(\d)'); _OE = {}
def _entries(s):
    if s not in _OE:
        o = 0 if s == 'choir' else 12; E = []   # VSCO labels middle C as C3 (measured in art-evolution); the chorus is labelled at pitch
        for e in ORCH.get(s, []):
            f = f'{AE}/' + e['file']
            if 'Rel' in e['name'] or not os.path.exists(f) or os.path.getsize(f) < 1000: continue
            v = _VRE.search(e['name']); r = _RRE.search(e['name']); E.append((M(e['note']) + o, int(v.group(1)) if v else 1, int(r.group(1)) if r else 1, f))
        _OE[s] = E
    return _OE[s]
def osmp(s, m, vel=0.6, rr=0):   # real multisample: nearest note, velocity layer, round-robin
    E = _entries(s); d = min(abs(e[0] - m) for e in E); C = [e for e in E if abs(e[0] - m) == d]
    vs = sorted({e[1] for e in C}); vt = vs[min(len(vs) - 1, int(vel * len(vs)))]; C = [e for e in C if e[1] == vt]; e = C[rr % len(C)]
    return repitch(wav(e[3]), 2 ** ((m - e[0]) / 12))
def extend(y, n, xf=0.3):   # loop-extend a sustained sample (crossfaded repeats of its steady part)
    if len(y) >= n: return y[:n].copy()
    f = int(xf * SR); seg = y[int(len(y) * 0.3):]; out = np.zeros((n, 2), np.float32); out[:len(y)] = y; out[len(y) - f:len(y)] *= np.linspace(1, 0, f)[:, None]; pos = len(y) - f
    while pos < n:
        k = min(len(seg), n - pos); s = seg[:k].copy(); s[:min(f, k)] *= np.linspace(0, 1, min(f, k))[:, None]
        if pos + k < n and k > f: s[-f:] *= np.linspace(1, 0, f)[:, None]
        out[pos:pos + k] += s; pos += max(1, k - f)
    return out
def cut(y, dur, fade=0.05):
    n = min(len(y), int(dur * SR)); y = y[:n].copy(); fl = min(n, int(fade * SR))
    y[n - fl:] *= np.linspace(1, 0, fl)[:, None] ** 2; return y
def varispeed(y, ratio):
    pos = np.concatenate([[0.0], np.cumsum(ratio[:-1])]); pos = pos[pos < len(y) - 2]
    i = pos.astype(int); f = (pos - i)[:, None]
    return (y[i] * (1 - f) + y[i + 1] * f).astype(np.float32)

# ---------------------------------------------------------------- dsp
def sos(kind, fc, order=2): return butter(order, fc, kind, fs=SR, output='sos')
def filt(x, kind, fc, order=2): return sosfilt(sos(kind, fc, order), x, axis=0).astype(np.float32)
def stereo(y): return np.stack([y, y], 1).astype(np.float32)
def noise(n, seed): return np.random.default_rng(seed).standard_normal((n, 2)).astype(np.float32)
def pink(n, seed):
    w = np.random.default_rng(seed).standard_normal((n, 2)); F = np.fft.rfft(w, axis=0); f = np.fft.rfftfreq(n, 1 / SR)
    F[1:] /= np.sqrt(f[1:])[:, None]; F[0] = 0; p = np.fft.irfft(F, n, axis=0); return (p / np.abs(p).max()).astype(np.float32)
def tv_filter(x, fc, q=0.707, kind='low', blk=128):   # RBJ biquad with per-block coefficients (sweeps)
    y = np.empty_like(x); zi = np.zeros((2, x.shape[1]))
    for s in range(0, len(x), blk):
        f = float(fc[min(s + blk // 2, len(fc) - 1)]); w = 2 * np.pi * min(max(f, 20), SR * 0.45) / SR
        al = np.sin(w) / (2 * q); c = np.cos(w)
        b = {'low': [(1 - c) / 2, 1 - c, (1 - c) / 2], 'high': [(1 + c) / 2, -(1 + c), (1 + c) / 2], 'band': [al, 0, -al]}[kind]
        a = [1 + al, -2 * c, 1 - al]
        for ch in range(x.shape[1]): y[s:s + blk, ch], zi[:, ch] = lfilter(b, a, x[s:s + blk, ch], zi=zi[:, ch])
    return y
def load_ir(name, maxlen=None, lp=None, pre=0.0):
    y, sr = sf.read(f'{AE}/music/samples/ir/{name}.wav', dtype='float32', always_2d=True)
    if y.shape[1] == 1: y = np.repeat(y, 2, 1)
    y = y[:, :2]
    if sr != SR: y = librosa.resample(np.ascontiguousarray(y.T), orig_sr=sr, target_sr=SR).T
    if maxlen and len(y) > maxlen * SR: y = y[:int(maxlen * SR)].copy(); f = int(.3 * SR); y[-f:] *= np.linspace(1, 0, f)[:, None]
    if lp: y = filt(y, 'low', lp, 2)
    if pre: y = np.concatenate([np.zeros((int(pre * SR), 2), np.float32), y])
    return (y / np.sqrt((y ** 2).sum(0).mean())).astype(np.float32)
_IR = {}
def IR(name):
    if name not in _IR:
        _IR[name] = {'hall': lambda: load_ir('hall', pre=0.015), 'big': lambda: load_ir('cathedral', pre=0.02, lp=9000),
                     'church': lambda: load_ir('church', maxlen=6.0, pre=0.01), 'room': lambda: load_ir('room'),
                     'plate': lambda: load_ir('hall', pre=0.03, lp=8000)}[name]()
    return _IR[name]
def reverb(x, name, wet, hp=150):
    w = oaconvolve(filt(x, 'high', hp), IR(name), axes=0)[:len(x)].astype(np.float32)
    return x + wet * w
def pad_to(y, n):
    if len(y) >= n: return y[:n]
    return np.concatenate([y, np.zeros((n - len(y), 2), np.float32)])
def env_ad(n, att, dec, shape=1.0):
    t = np.arange(n) / SR; return (np.clip(t / max(att, 1e-4), 0, 1) ** shape * np.exp(-np.maximum(t - att, 0) / dec)).astype(np.float32)
def panv(y, pan):   # constant-power pan of a stereo buffer
    a = (pan + 1) * np.pi / 4; return np.stack([y[:, 0] * np.cos(a) * np.sqrt(2), y[:, 1] * np.sin(a) * np.sqrt(2)], 1).astype(np.float32)
def norm_peak(y, db=-1.0): return (y / (np.abs(y).max() + 1e-9) * 10 ** (db / 20)).astype(np.float32)
def add(buf, y, t, g=1.0, pan=0.0):
    i = int(round(t * SR))
    if i < 0: y = y[-i:]; i = 0
    n = min(len(y), len(buf) - i)
    if n > 0: buf[i:i + n] += (panv(y[:n], pan) if pan else y[:n]) * g

# ================================================================ SFX KIT
def sfx_kit():
    out = 'public/sfx'; os.makedirs(out, exist_ok=True); rng = np.random.default_rng(7); K = {}
    PENTA = [M(n) for n in ('D6', 'E6', 'F#6', 'A6', 'B6', 'D7', 'E7', 'F#7', 'A7', 'B7', 'D8')]
    def grain(f, dur, dec, ph=0.0):   # glassy sparkle: sine + glock-like 2.76 partial
        n = int(dur * SR); t = np.arange(n) / SR; e = np.exp(-t / dec) * np.clip(t / 0.0015, 0, 1)
        return ((np.sin(2 * np.pi * f * t + ph) + 0.3 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / (dec * 0.4))) * e).astype(np.float32)
    # shimmer — particles gathering: grains accelerate into ~1.2 s, then a bright settle
    n = int(2.6 * SR); y = np.zeros((n, 2), np.float32)
    ts = np.sort(1.25 * (1 - (1 - rng.uniform(0, 1, 70)) ** 0.55))
    for k, t0 in enumerate(ts):
        m = PENTA[int(rng.integers(0, len(PENTA)))]; g = 0.25 + 0.75 * (t0 / 1.25) ** 1.5
        add(y, stereo(grain(hz(m), 0.6, rng.uniform(0.05, 0.22), rng.uniform(0, 6))), t0, g * 0.5, rng.uniform(-0.8, 0.8))
    for m, g in ((M('D7'), .5), (M('A7'), .35), (M('F#7'), .3), (M('D8'), .2)):
        add(y, stereo(grain(hz(m), 1.3, 0.55)), 1.25, g)
    air = filt(noise(n, 3), 'band', [6000, 14000], 2) * np.interp(np.arange(n) / SR, [0, 1.25, 1.4, 2.6], [0, .35, .2, 0])[:, None] ** 1.5
    K['shimmer'] = reverb(y + air * 0.4, 'plate', 0.35)
    # swell — 2 s rise, peaks at the very end (reverse cymbal + rising D-A-F# glass chord + air)
    n = int(2.0 * SR); tt = np.arange(n) / SR; cy = filt(smp('sus_cymbal', 5), 'high', 400)[:n * 2]
    rc = pad_to(cy, n)[::-1].copy() if len(cy) >= n else pad_to(cy, n)[::-1].copy()
    ch = sum(np.sin(2 * np.pi * hz(m) * tt * (1 + 0.004 * tt)) for m in (M('D4'), M('A4'), M('F#5'), M('D6'))) / 4
    rise = (tt / 2.0) ** 2.6
    y = rc * 0.7 + stereo(ch * rise) * 0.5 + filt(pink(n, 4), 'band', [800, 9000], 2) * (rise ** 1.5)[:, None] * 0.6
    y = tv_filter(y, 600 * (14000 / 600) ** (tt / 2.0) ** 1.4, q=0.8); fl = int(0.02 * SR); y[-fl:] *= np.linspace(1, 0.6, fl)[:, None]
    K['swell'] = y
    # boom_soft — rounded low impact (sine drop 66→38 Hz + concert bass drum, no click edge)
    n = int(2.8 * SR); tt = np.arange(n) / SR; f = 36.71 + 36.71 * np.exp(-tt / 0.09)   # D2 → D1: tuned to the key
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.75) * np.clip(tt / 0.004, 0, 1)
    bd = filt(pad_to(smp('bassdrum1', 7), n), 'low', 900, 2)
    K['boom_soft'] = filt(stereo(sub) * 0.9 + bd * 0.5, 'low', 2500, 2)
    # chime — one clear glockenspiel D6 + soft octave halo
    g = cut(pitched('glockenspiel', M('D6')), 2.5, 1.2); h = stereo(grain(hz(M('D7')), 2.5, 0.9)) * 0.18
    K['chime'] = reverb(pad_to(g, int(3.0 * SR)) + pad_to(h, int(3.0 * SR)), 'hall', 0.3)
    # bell — tubular bell A4 (dominant of D: rings "open") with additive halo
    yb = cut(pitched('tubularbells2', M('A4')), 4.5, 1.5); n = len(yb); tt = np.arange(n) / SR; f0 = hz(M('A4')); bz = np.zeros(n)
    for r, a, d in [(0.5, .4, 3.0), (1.0, 1.0, 2.5), (2.0, .4, 1.4), (2.51, .2, .8), (3.01, .12, .6)]: bz += a * np.sin(2 * np.pi * f0 * r * tt + r) * np.exp(-tt / d)
    K['bell'] = reverb(yb + stereo(bz * np.clip(tt / 0.002, 0, 1)) * 0.12, 'hall', 0.3)
    # drop — water drop: rising sine 'bloop' + tiny plip
    n = int(0.7 * SR); tt = np.arange(n) / SR; f = 700 + 1300 * (1 - np.exp(-tt / 0.018))
    d = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.045) * np.clip(tt / 0.001, 0, 1)
    pl = np.sin(2 * np.pi * 2600 * tt) * np.exp(-tt / 0.008) * 0.25
    K['drop'] = reverb(stereo(d + pl), 'room', 0.6)
    # water_loop — 10 s brook, seamless loop (gurgle bands + droplets), crossfaded tail→head
    L = 10.0; n = int((L + 1.0) * SR); tt = np.arange(n) / SR; y = np.zeros((n, 2), np.float32)
    for k, (lo, hi, g) in enumerate([(250, 900, .5), (700, 2200, .45), (1800, 5000, .22)]):
        lfo = 0.55 + 0.45 * np.sin(2 * np.pi * (0.23 + 0.17 * k) * tt + k) * np.sin(2 * np.pi * (1.3 + 0.7 * k) * tt + 2 * k)
        y += filt(noise(n, 10 + k), 'band', [lo, hi], 2) * (g * lfo)[:, None]
    for t0 in np.sort(rng.uniform(0, L + 1.0, 260)):
        f0 = rng.uniform(450, 2400); m = int(0.06 * SR); t1 = np.arange(m) / SR; fr = f0 * (1 + 0.6 * (1 - np.exp(-t1 / 0.01)))
        b = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t1 / rng.uniform(0.008, 0.025))
        add(y, stereo(b), t0, rng.uniform(0.05, 0.35), rng.uniform(-0.9, 0.9))
    y = filt(y, 'low', 7000, 2); f = int(1.0 * SR); head = y[:f].copy(); tail = y[int(L * SR):int(L * SR) + f]
    w = np.linspace(0, 1, f)[:, None]; y = y[:int(L * SR)].copy(); y[:f] = head * np.sqrt(w) + tail * np.sqrt(1 - w)
    K['water_loop'] = y
    # coins — ring partials of a small disc; flip = flick + spinning flutter; land = strike + settling chatter
    def ring(parts, dur, flutter=None, seed=0):
        n = int(dur * SR); tt = np.arange(n) / SR; y = np.zeros(n)
        for f0, a, dcy in parts: y += a * np.sin(2 * np.pi * f0 * tt + seed) * np.exp(-tt / dcy)
        if flutter is not None: y *= flutter(tt)
        return y * np.clip(tt / 0.0006, 0, 1)
    n = int(0.9 * SR); tt = np.arange(n) / SR
    spin = lambda t: 0.45 + 0.55 * np.abs(np.sin(np.pi * np.cumsum(16 - 7 * t / 0.9) / SR))
    fl = ring([(4130, 1, .45), (6260, .6, .3), (8970, .35, .2), (11800, .2, .12)], 0.9, spin)
    flick = filt(noise(n, 21)[:, 0], 'band', [1500, 7000], 2) * np.exp(-tt / 0.004)
    K['coin_flip'] = reverb(filt(stereo(fl * 0.5 + flick * 1.2), 'low', 12000, 2), 'room', 0.35)
    def land(parts, thud_f, lp, seed):
        n = int(0.8 * SR); tt = np.arange(n) / SR; y = np.zeros(n); t0 = 0.0; a = 1.0
        for k, gap in enumerate([0.0, 0.07, 0.05, 0.036, 0.026, 0.019, 0.014, 0.010, 0.008]):
            t0 += gap; i = int(t0 * SR); r = ring(parts, 0.8 - t0, seed=k + seed) * a; y[i:i + len(r)] += r[:n - i]; a *= 0.62
        th = np.sin(2 * np.pi * thud_f * tt) * np.exp(-tt / 0.03) * 0.8 + filt(noise(n, seed)[:, 0], 'band', [600, 4000], 2) * np.exp(-tt / 0.003) * 0.8
        return reverb(filt(stereo(y * 0.45 + th), 'low', lp, 2), 'room', 0.3)
    K['coin_land_hi'] = land([(5200, 1, .35), (7900, .5, .2), (10600, .25, .12)], 260, 13000, 31)
    K['coin_land_lo'] = land([(2900, 1, .3), (4400, .45, .18), (6100, .2, .1)], 140, 6500, 37)
    # scratch — stick-slip micro impulses (a pen/stone scoring a mark), soft
    n = int(0.75 * SR); tt = np.arange(n) / SR; y = np.zeros(n); t0 = 0.02
    envs = lambda t: np.interp(t, [0, .04, .5, .62], [0, 1, .8, 0])
    while t0 < 0.62:
        i = int(t0 * SR); y[i:i + 24] += rng.uniform(.4, 1) * envs(t0) * np.hanning(24) * rng.choice([-1, 1]); t0 += rng.exponential(0.0016)
    y = filt(stereo(y), 'band', [1400, 6500], 2) + filt(noise(n, 41), 'band', [2500, 7000], 2) * envs(tt)[:, None] * 0.05
    K['scratch'] = reverb(y, 'room', 0.25)
    # crack — a stone parting: three soft knocks + crumble grains (no harsh edge)
    n = int(1.0 * SR); tt = np.arange(n) / SR; y = np.zeros((n, 2), np.float32)
    for t0, g in ((0.0, 1.0), (0.045, 0.7), (0.11, 0.55)):
        m = int(0.25 * SR); t1 = np.arange(m) / SR
        kn = np.sin(2 * np.pi * rng.uniform(170, 240) * t1) * np.exp(-t1 / 0.05) + filt(noise(m, int(t0 * 1000))[:, 0], 'band', [700, 3200], 2) * np.exp(-t1 / 0.006) * 1.4
        add(y, stereo(kn), t0, g, rng.uniform(-.3, .3))
    for t0 in np.sort(rng.uniform(0.08, 0.7, 40)):
        m = int(0.03 * SR); gr = filt(noise(m, int(t0 * 1e4))[:, 0], 'band', [1200, 4500], 2) * np.exp(-np.arange(m) / SR / 0.004)
        add(y, stereo(gr), t0, 0.5 * (1 - t0 / 0.75) ** 1.5, rng.uniform(-.7, .7))
    K['crack'] = reverb(filt(y, 'low', 7000, 2), 'room', 0.35)
    # pebbles — small stones clacking onto a pile, irregular
    n = int(1.4 * SR); y = np.zeros((n, 2), np.float32)
    for k, t0 in enumerate([0.0, 0.17, 0.29, 0.47, 0.6, 0.83, 0.95]):
        for j in range(int(rng.integers(1, 3))):
            m = int(0.06 * SR); t1 = np.arange(m) / SR; fc = rng.uniform(2200, 4600)
            cl = filt(noise(m, k * 10 + j)[:, 0], 'band', [fc * 0.85, fc * 1.15], 2) * np.exp(-t1 / rng.uniform(0.006, 0.014)) * 3 + np.sin(2 * np.pi * rng.uniform(550, 900) * t1) * np.exp(-t1 / 0.018) * 0.5
            add(y, stereo(cl), t0 + j * rng.uniform(0.012, 0.03), rng.uniform(0.5, 1.0) * (0.75 + 0.25 * k / 6), rng.uniform(-.5, .5))
    K['pebbles'] = reverb(y, 'room', 0.3)
    # buzz — soft insect hum: wing-beat saw ~190 Hz through a gentle low-pass, drifting closer and away (Doppler + pan)
    n = int(3.0 * SR); tt = np.arange(n) / SR; near = np.exp(-((tt - 1.4) / 0.75) ** 2)
    f = 185 * (1 + 0.04 * np.sin(2 * np.pi * 0.7 * tt) + 0.025 * np.gradient(near) * SR * 0.4 + 0.012 * np.sin(2 * np.pi * 7.3 * tt))
    ph = np.cumsum(f) / SR; s = 2 * (ph % 1) - 1; s = s * (0.75 + 0.25 * np.sin(2 * np.pi * 2 * ph))
    y = filt(stereo(s), 'low', 1700, 2); y = filt(y, 'high', 120, 2) * (0.15 + 0.85 * near)[:, None]
    pan = np.sin(2 * np.pi * 0.33 * tt) * 0.7; a = (pan + 1) * np.pi / 4; y[:, 0] *= np.cos(a) * 1.41; y[:, 1] *= np.sin(a) * 1.41
    y *= np.clip(tt / 0.25, 0, 1)[:, None] * np.clip((3.0 - tt) / 0.4, 0, 1)[:, None]
    K['buzz'] = reverb(y, 'room', 0.2)
    # swat — a hand cutting the air: fast band sweep + soft thump
    n = int(0.55 * SR); tt = np.arange(n) / SR; e = np.exp(-((tt - 0.13) / 0.05) ** 2)
    fc = 350 + 2000 * np.exp(-((tt - 0.13) / 0.07) ** 2)
    y = tv_filter(pink(n, 51), fc, q=1.4, kind='band') * e[:, None] * 2.5 + stereo(np.sin(2 * np.pi * 90 * tt) * np.exp(-np.maximum(tt - 0.16, 0) / 0.04) * (tt > 0.16)) * 0.3
    K['swat'] = reverb(y, 'room', 0.2)
    # page — paper turning: crinkle band + swoosh + soft flap
    n = int(0.85 * SR); tt = np.arange(n) / SR; e = np.exp(-((tt - 0.32) / 0.16) ** 2); cr = np.abs(filt(rng.standard_normal(n), 'low', 60, 2)) * 6
    y = filt(noise(n, 61), 'band', [1800, 7500], 2) * (e * cr)[:, None] * 0.6 + filt(pink(n, 62), 'band', [300, 1600], 2) * e[:, None] * 0.6
    y += stereo(filt(rng.standard_normal(n), 'band', [200, 1200], 2) * np.exp(-np.maximum(tt - 0.55, 0) / 0.02) * (tt > 0.55)) * 0.5
    K['page'] = reverb(y, 'room', 0.25)
    # whoosh_soft — band sweep moving left → right
    n = int(1.2 * SR); tt = np.arange(n) / SR; e = np.exp(-((tt - 0.55) / 0.25) ** 2)
    y = tv_filter(pink(n, 71), 300 + 2400 * e, q=1.0, kind='band') * e[:, None] * 2.2
    a = (np.interp(tt, [0, 1.2], [-0.8, 0.8]) + 1) * np.pi / 4; y[:, 0] *= np.cos(a) * 1.41; y[:, 1] *= np.sin(a) * 1.41
    K['whoosh_soft'] = reverb(y, 'hall', 0.2)
    # tick — clean wooden tick
    n = int(0.2 * SR); tt = np.arange(n) / SR
    y = (np.sin(2 * np.pi * 2100 * tt) + 0.5 * np.sin(2 * np.pi * 3350 * tt)) * np.exp(-tt / 0.006) + filt(rng.standard_normal(n), 'high', 3000) * np.exp(-tt / 0.0012) * 0.4
    K['tick'] = reverb(stereo(y * np.clip(tt / 0.0004, 0, 1)), 'room', 0.15)
    # extra: title hit — 「选」: soft gong + low D + glass halo (the cue the score uses for the title)
    n = int(6.0 * SR); g = pad_to(cut(smp('gong', 2), 6.0, 2.5), n); tt = np.arange(n) / SR
    lo = np.sin(2 * np.pi * hz(M('D2')) * tt) * np.exp(-tt / 1.6) * np.clip(tt / 0.01, 0, 1)
    K['title_hit'] = reverb(g * 0.6 + stereo(lo) * 0.5 + pad_to(K['chime'], n) * 0.3 + pad_to(K['boom_soft'], n) * 0.4, 'big', 0.3)
    rows = []
    for name, y in K.items():
        y = norm_peak(y, -1.0); fl = min(len(y), int(0.01 * SR))
        if name != 'water_loop': y[-fl:] *= np.linspace(1, 0, fl)[:, None]
        sf.write(f'{out}/{name}.wav', y, SR, subtype='PCM_24'); rows.append((name, len(y) / SR))
    return rows


# ================================================================ SCORE ENGINE (all timing from notes/grid.json + alignment/chars.json)
END = float(GRID['end'])
SEC = {s['id']: (float(s['start']), float(s['end'])) for s in GRID['sections']}
REND = min(45.0, END) if MODE == 'test' else END
N = int((REND + 9) * SR)
BUS = {}
def bus(k):
    if k not in BUS: BUS[k] = np.zeros((N, 2), np.float32)
    return BUS[k]
def put(y, t, g=1.0, pan=0.0, send=None):
    if g <= 0 or t > REND + 1: return
    i = int(round(t * SR))
    if i < 0: y = y[-i:]; i = 0
    n = min(len(y), N - i)
    if n <= 0: return
    z = (panv(y[:n], pan) if pan else y[:n]) * g
    bus('dry')[i:i + n] += z
    for k, s in (send or {}).items(): bus(k)[i:i + n] += z * s
S_STR = {'hall': .32, 'big': .10}; S_PL = {'hall': .30, 'plate': .06}; S_KEY = {'hall': .30}; S_BELL = {'big': .25, 'hall': .15}
S_GLASS = {'big': .5, 'plate': .2}; S_PERC = {'hall': .14}; S_PAD = {'hall': .35}
def L(i): return float(LINES[i]['start']), float(LINES[i]['end'])
def ct(i, ch, k=0):
    cs = [c['start'] for c in CHARS[i]['chars'] if c['c'] == ch]; return float(cs[min(k, len(cs) - 1)])
def qb(t, d=1): q = BEAT / d; return round(t / q) * q
def cb(t, d=1): q = BEAT / d; return float(np.ceil(t / q - 1e-6) * q)
CUES = []
def cue(t, what): CUES.append(dict(t=round(float(t), 4), bar=round(t / BAR, 3), what=what))
HR = np.random.default_rng(2026)
def ht(t, sd=0.004): return t + float(np.clip(HR.normal(0, sd), -0.01, 0.01))
def hg(g, db=0.8): return g * 10 ** (HR.normal(0, db) / 20)
PENT_PC = {2, 4, 6, 9, 11}   # D E F# A B
def pent(lo, hi): return [m for m in range(lo, hi + 1) if m % 12 in PENT_PC]

# ---------------------------------------------------------------- instruments
def zheng(m, t, g, pan=-0.25, dur=2.4, scoop=0.0, send=S_PL):
    y = pitched('dantranh', m)
    if scoop:
        n = min(len(y) - 4, int((dur + 0.1) * SR)); tt = np.arange(n) / SR; y = varispeed(y, 2 ** (scoop * np.exp(-tt / 0.07) / 12))
    put(cut(y, dur, min(0.8, dur / 3)), ht(t), hg(g), pan, send)
def harp(m, t, g, pan=0.2, dur=2.5, send=S_PL): put(cut(pitched('harp', m), dur, min(.7, dur / 3)), ht(t, .003), hg(g), pan, send)
def piano(m, t, g, pan=0.0, dur=3.0, lp=None, send=S_KEY):
    y = cut(pitched('steinway', m), dur, min(1.2, dur / 2))
    if lp: y = filt(y, 'low', lp)
    put(y, ht(t, .003), hg(g, .5), pan, send)
def glock(m, t, g, pan=0.3, dur=2.5, send=S_BELL): put(cut(pitched('glockenspiel', m), dur, min(1.0, dur / 2)), ht(t, .002), hg(g, .6), pan, send)
def vibe(m, t, g, pan=-0.2, dur=3.5, send=S_KEY): put(cut(pitched('vibraphone', m), dur, min(1.2, dur / 2)), ht(t, .003), hg(g, .6), pan, send)
def tbell(m, t, g, pan=0.0, dur=6.0, send=S_BELL): put(cut(pitched('tubularbells2', m), dur, 2.0), t, g, pan, send)
def psal(m, t, g, pan=0.35, dur=1.4, send=S_PL): put(cut(pitched('psaltery_pluck', m), dur, .5), ht(t, .003), hg(g), pan, send)
def flute(m, t, dur, g, pan=-0.1, scoop=-0.7, vib=0.16, rel=0.09, breath=1.0):   # ocarina (陶笛): sample + scoop + late vibrato + breath
    n = int((dur + rel + 0.02) * SR); tt = np.arange(n) / SR; src = extend(pitched('ocarina', m), n + SR)
    semis = scoop * np.exp(-tt / 0.07) + vib * np.sin(2 * np.pi * 5.0 * tt) * np.clip((tt - 0.45) / 0.6, 0, 1)
    y = varispeed(src, 2 ** (semis / 12)); n = min(n, len(y)); y = y[:n]; tt = tt[:n]
    env = np.clip(tt / 0.06, 0, 1) * np.clip((dur + 0.02 - tt) / rel + 1, 0, 1) ** 1.5
    nz = pink(n, int(m * 7 + t * 100) % 99991); br = filt(nz, 'band', [hz(m) * 0.75, hz(m) * 1.35], 2) * 2.2 + filt(nz, 'band', [1800, 6500], 2) * 0.9
    br *= (breath * (0.10 + 0.55 * np.exp(-tt / 0.06)))[:, None]
    put((y + 0.5 * br) * env[:, None], t - 0.02, g, pan, {'hall': .35, 'big': .12})
def sec_of(m): return 'cb' if m < 40 else 'vc' if m < 55 else 'vla' if m < 62 else 'vln'
SEAT = {'vln': -0.4, 'vla': 0.15, 'vc': 0.35, 'cb': 0.5, 'hn': -0.15, 'choir': 0.0}
def strings(notes, t0, t1, g, att=0.9, rel=1.4, lp=None, send=S_STR, vel=None, inst=None):
    dur = max(t1 - t0, 0.1); n = int((dur + rel) * SR); tt = np.arange(n) / SR
    v = vel if vel is not None else float(np.clip(0.2 + g * 1.2, 0, 0.95))
    for k, m in enumerate(notes):
        s = inst or sec_of(m); key = {'hn': 'hn_sus', 'choir': 'choir'}.get(s, f'{s}_sus')
        y = extend(osmp(key, m, v, k), n); a = att * HR.uniform(0.85, 1.2)
        env = np.clip(tt / a, 0, 1) ** 1.5 * np.clip((dur + rel - tt) / rel, 0, 1) ** 1.3
        if lp: y = filt(y, 'low', lp, 1)
        put(y * env[:, None], ht(t0, .006), hg(g, .5) / np.sqrt(len(notes)), SEAT[s] + HR.uniform(-.12, .12), send)
def horn(notes, t0, t1, g, att=0.6, rel=1.4): strings(notes, t0, t1, g, att, rel, inst='hn')
def choir(notes, t0, t1, g, att=0.9, rel=1.6): strings(notes, t0, t1, g, att, rel, inst='choir', send={'hall': .4, 'big': .2})
def spic(notes, t, g, dur=0.3, send=S_STR):
    for k, m in enumerate(notes):
        s = sec_of(m); y = cut(osmp(f'{s}_spic', m, min(.95, .4 + g), int(HR.integers(0, 4))), dur + .3, .15)
        put(y, ht(t, .003), hg(g, .7) / np.sqrt(len(notes)), SEAT[s] * .6, send)
def pizz(m, t, g, dur=1.2, pan=0.4): put(cut(osmp('cb_pizz', m, .6, int(HR.integers(0, 3))), dur, .3), ht(t, .004), hg(g), pan, S_STR)
def saw(f, n, ph0=0.0):
    dt = np.full(n, f / SR); ph = (ph0 + np.cumsum(dt) - dt) % 1.0; y = 2 * ph - 1
    m = ph < dt; t = ph[m] / dt[m]; y[m] -= t + t - t * t - 1
    m = ph > 1 - dt; t = (ph[m] - 1) / dt[m]; y[m] -= t * t + t + t + 1
    return y.astype(np.float32)
def spad(notes, t0, t1, g, att=1.5, rel=2.0, lp=1300, send=S_PAD):   # warm analog-style pad (detuned saws, low-passed)
    dur = max(t1 - t0, .1); n = int((dur + rel) * SR); tt = np.arange(n) / SR
    env = (np.clip(tt / att, 0, 1) ** 2 * np.clip((dur + rel - tt) / rel, 0, 1) ** 1.5).astype(np.float32); y = np.zeros((n, 2), np.float32)
    for m in notes:
        for d, ch in ((-6, 0), (5, 1), (-2, 1), (3, 0)): y[:, ch] += saw(hz(m) * 2 ** (d / 1200), n, HR.uniform(0, 1))
    y = filt(filt(y, 'low', lp, 2), 'high', 90, 1)
    put(y * env[:, None] * (0.25 / np.sqrt(len(notes))), t0, g, 0, send)
def sub(m, t0, t1, g, att=0.3, rel=1.0):
    dur = max(t1 - t0, .1); n = int((dur + rel) * SR); tt = np.arange(n) / SR
    put(stereo(np.sin(2 * np.pi * hz(m) * tt) * np.clip(tt / att, 0, 1) ** 1.5 * np.clip((dur + rel - tt) / rel, 0, 1)), t0, g)
_BOOM = {}
def boom(t, g=1.0):   # rounded low impact: sine drop 66→38 Hz + concert bass drum
    if 'b' not in _BOOM:
        n = int(2.8 * SR); tt = np.arange(n) / SR; f = 36.71 + 36.71 * np.exp(-tt / 0.09)   # D2 → D1: tuned to the key
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.75) * np.clip(tt / 0.004, 0, 1)
        _BOOM['b'] = filt(stereo(s) * 0.9 + pad_to(filt(smp('bassdrum1', 7), 'low', 900, 2), n) * 0.5, 'low', 2500, 2)
    put(_BOOM['b'], t, g, 0, {'hall': .08})
def timp(m, t, g, dur=3.0):   # tuned timpani (synth membrane modes + mallet)
    n = int(dur * SR); tt = np.arange(n) / SR; f = hz(m) * (1 + 0.03 * np.exp(-tt / 0.05)); ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph) * np.exp(-tt / 0.9) + 0.5 * np.sin(1.504 * ph) * np.exp(-tt / 0.45) + 0.3 * np.sin(1.742 * ph) * np.exp(-tt / 0.3) + 0.2 * np.sin(2.0 * ph) * np.exp(-tt / 0.35)
    mal = filt(np.random.default_rng(int(t * 100) % 9973).standard_normal(n), 'band', [120, 1400], 2) * np.exp(-tt / 0.012) * 0.7
    put(stereo((y * np.clip(tt / 0.003, 0, 1) + mal) * 0.6), ht(t, .002), g, 0.1, S_PERC)
def timp_roll(m, t0, t1, g0, g1):
    t = t0; k = 0
    while t < t1 - 1e-6:
        fr = (t - t0) / max(t1 - t0, 1e-3); timp(m, t, (g0 + (g1 - g0) * fr ** 1.6) * (0.8 + 0.2 * (k % 2)), dur=0.8); t += BEAT / 4; k += 1
def gong(t, g, i=2, dur=7.0): put(cut(filt(smp('gong', i), 'low', 5000), dur, dur / 2), t, g, 0.1, S_BELL)
NF, NS = len(VC['framedrum']), len(VC['shaker_small'])
def frame(t, g, i=0, pan=-0.1): put(cut(smp('framedrum', i % NF), 1.0, .4), ht(t, .004), hg(g, 1.0), pan, S_PERC)
def shaker(t, g, i=0, pan=0.35): put(cut(filt(smp('shaker_small', i % NS), 'high', 2000), 0.35, .1), ht(t, .006), hg(g, 1.2), pan, S_PERC)
def revcym(t_peak, g, dur=2.0, hp=400):
    y = pad_to(filt(smp('sus_cymbal', 5), 'high', hp), int(dur * SR))[::-1].copy(); y *= (np.linspace(0, 1, len(y)) ** 1.5)[:, None]
    put(y, t_peak - dur, g, 0, {'hall': .2})
def grain(f, dur, dec, ph=0.0):
    n = int(dur * SR); t = np.arange(n) / SR; e = np.exp(-t / dec) * np.clip(t / 0.0015, 0, 1)
    return ((np.sin(2 * np.pi * f * t + ph) + 0.3 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / (dec * 0.4))) * e).astype(np.float32)
def sparkle(t0, dur, g, dens=30, lo=None, hi=None, shape='burst', seed=0, send=S_GLASS):
    r = np.random.default_rng(seed); P = pent(lo or M('D6'), hi or M('D8')); u = r.uniform(0, 1, max(1, int(dens * dur)))
    ts = t0 + dur * {'burst': u ** 2.2, 'gather': 1 - (1 - u) ** 0.45, 'even': u}[shape]
    for t in ts:
        fr = (t - t0) / dur; a = {'burst': (1 - fr) ** 1.5, 'gather': 0.3 + 0.7 * fr ** 1.5, 'even': 1.0}[shape]
        put(stereo(grain(hz(P[int(r.integers(0, len(P)))]), .6, r.uniform(.05, .25), r.uniform(0, 6))), t, g * a * 0.35, r.uniform(-.8, .8), send)
def buzzvoice(m, t0, t1, g):   # the 'fly' as a soft musical timbre: wing-flutter saw hum, drifting and panning
    n = int((t1 - t0) * SR); tt = np.arange(n) / SR
    f = hz(m) * (1 + 0.012 * np.sin(2 * np.pi * 0.45 * tt) + 0.006 * np.sin(2 * np.pi * 6.5 * tt)); ph = np.cumsum(f) / SR
    s = (2 * (ph % 1) - 1) * (0.75 + 0.25 * np.sin(2 * np.pi * 2 * ph)); y = filt(filt(stereo(s), 'low', 1400, 2), 'high', 150, 1)
    a = (np.sin(2 * np.pi * 0.27 * tt) * 0.7 + 1) * np.pi / 4; y[:, 0] *= np.cos(a) * 1.41; y[:, 1] *= np.sin(a) * 1.41
    y *= (np.clip(tt / 1.2, 0, 1) * np.clip((t1 - t0 - tt) / 0.05, 0, 1) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.9 * tt)))[:, None]
    put(y, t0, g, 0, {'hall': .2})

# ---------------------------------------------------------------- harmony (D 宫 / B 羽 family) — voicings keep common tones for smooth voice-leading
V = {'D': ('D2', 'A3 D4 F#4 A4'), 'Dadd9': ('D2', 'A3 E4 F#4 A4'), 'D/F#': ('F#2', 'A3 D4 F#4 A4'), 'Dmaj9': ('D2', 'A3 C#4 E4 F#4'),
     'D/A': ('A1', 'A3 D4 F#4 A4'), 'G': ('G2', 'B3 D4 G4 B4'), 'Gmaj7': ('G2', 'B3 D4 F#4 A4'), 'Gmaj9': ('G2', 'B3 F#4 A4 D5'),
     'G/D': ('D2', 'B3 D4 G4 B4'), 'Gmaj7#11': ('G2', 'B3 C#4 F#4 A4'), 'G/A': ('A2', 'B3 D4 G4 A4'), 'A': ('A2', 'A3 C#4 E4 A4'),
     'Asus4': ('A2', 'A3 D4 E4 A4'), 'A7sus4': ('A2', 'G3 D4 E4 A4'), 'A/C#': ('C#3', 'A3 E4 A4'), 'Bm': ('B1', 'B3 D4 F#4 B4'),
     'Bm7': ('B1', 'A3 D4 F#4 B4'), 'Bm11': ('B1', 'A3 D4 E4 F#4'), 'Em7': ('E2', 'G3 B3 D4 F#4'), 'Em9': ('E2', 'G3 D4 F#4 B4'),
     'F#m7': ('F#2', 'A3 C#4 E4 F#4'), 'Em7/D': ('D2', 'G3 B3 E4 F#4'), 'A/D': ('D2', 'A3 C#4 E4 A4')}
def chd(nm): b, u = V[nm]; return M(b), [M(x) for x in u.split()]
def pad_prog(prog, t_end, g, lp=None, att=1.0, rel=1.6, bass_g=0.7, oct=0, synth=0.0, slp=1300, sub_g=0.0):
    for k, (t, nm) in enumerate(prog):
        t1 = prog[k + 1][0] if k + 1 < len(prog) else t_end
        if nm is None or t1 <= t: continue
        b, up = chd(nm); gg = g(t) if callable(g) else g
        strings([m + 12 * oct for m in up], t, t1, gg, att, rel, lp)
        if bass_g: strings([b], t, t1, gg * bass_g, att, rel, lp)
        if synth: spad([b + 12] + up, t, t1, synth, att=att * 1.5, rel=rel, lp=slp)
        if sub_g: sub(b, t, t1, sub_g)
def chord_at(prog, t):
    nm = prog[0][1]
    for tt, n in prog:
        if tt <= t + 1e-6: nm = n
    return nm
def tones(nm, lo, hi):   # chord tones (bass + voicing pitch classes) inside [lo, hi]
    b, up = chd(nm); pcs = {b % 12} | {m % 12 for m in up}; return [m for m in range(lo, hi + 1) if m % 12 in pcs]
MOT_Q = [(0, 0, 1.5), (1.5, -5, .5), (2, -3, 1), (3, 4, 3), (6, 2, 2)]   # 「选」: D . A B | F# ~ E   (question: reach a sixth, stay open)
MOT_A = [(0, 0, 1.5), (1.5, -5, .5), (2, -3, 1), (3, 2, 3), (6, 0, 2)]   # answer: D . A B | E ~ D
MOT_F = [(0, 0, 1), (1, -5, .5), (1.5, -3, .5), (2, 2, 1), (3, 0, 4)]    # finale answer, compressed: D A B E | D
def motif(s, base, fn, form=MOT_Q):
    for b, d, du in form: fn(base + d, s + b * BEAT, du * BEAT)
GATE = []
def gate(t0, t1, floor=0.0, fo=0.04, fi=0.3): GATE.append((t0, t1, floor, fo, fi))
DUCKX = []   # (t0, t1, mid depth dB) — lighter ducking where the music must swell under a line
def title_hit(t, g=1.0, tail=3.0):
    gong(t, 0.30 * g); timp(M('D2'), t, 0.75 * g); boom(t, 0.6 * g)
    tbell(M('D5'), t, 0.22 * g); glock(M('D6'), t, 0.20 * g, .3); glock(M('A6'), t, 0.14 * g, -.3)
    sparkle(t, 2.2, 0.5 * g, dens=24, seed=int(t))
    strings([M('D2'), M('A2')], t, t + tail, 0.40 * g, att=0.05, rel=3.0)
    cue(t, '片名「选」：锣 + 低音 D + 钟')

# ================================================================ SECTIONS (every anchor = a line start / a character onset / a section edge)
def T(i): return L(i)[0]
def harp_gliss(t_end, lo, hi, g, dur=0.9, pan=0.3):   # pentatonic glissando that lands on t_end
    P = pent(lo, hi)
    for k, m in enumerate(P): harp(m, t_end - dur + dur * k / len(P), g * (0.5 + 0.5 * k / len(P)), pan, dur=2.0)
def sec_A():
    a0, a1e = SEC['A']
    boom(0.0, 1.0); timp(M('D2'), 0.0, 0.6); sparkle(0.0, 1.8, 0.8, dens=30, seed=1)
    glock(M('D6'), 0.0, 0.20, 0.3); glock(M('A6'), 0.0, 0.15, -0.3); cue(0.0, 'A 第0帧：低频冲击 + 闪光')
    strings([M('D2'), M('A2')], 0.0, 6.0, 0.28, att=1.0, rel=2.0)
    spad([M('D3'), M('A3'), M('E4')], 0.0, 5.0, 0.5, att=1.5, lp=900)
    th = 4.125   # the sentence shatters into the book's 30k characters（半拍，紧跟「天选福」念完；A 场 SHATTER = 第 124 帧）
    revcym(th, 0.18, 1.8, hp=2000); sparkle(th - 1.5, 1.5, 0.5, dens=26, lo=M('A6'), shape='gather', seed=2)
    boom(th, 0.55); sparkle(th, 2.6, 0.9, dens=60, lo=M('A6'), seed=3)
    cas = list(reversed(pent(M('A5'), M('D7'))))
    for k, m in enumerate(cas): (harp if k % 2 else glock)(m, th + k * BEAT / 6, 0.10 * (1 - k / (len(cas) + 2)), pan=(-.5 if k % 2 else .5))
    cue(th, 'A 一句话碎成三万字（swell 顶点 + 闪光爆开）')
    s = bt(2)
    motif(s, M('D6'), lambda m, t, d: (glock(m, t, 0.20, .25, dur=d + 1.5), zheng(m - 12, t, 0.22, -.25, dur=d + 1.2, scoop=-0.6 if d > 1 else 0)))
    cue(s, 'A 动机首次亮出（钟琴 + 筝）')
    prog = [(th, 'Dadd9'), (bt(3), 'Gmaj7'), (bt(3, 2), 'Asus4'), (bt(4), 'Bm7'), (bt(5), 'Gmaj9'), (bt(5, 3), 'A7sus4')]
    pad_prog(prog, a1e, 0.17, att=1.2, rel=1.8, bass_g=0.8, synth=0.35, slp=1100)
    up = pent(M('A3'), M('D7')); t = T('a4'); k = 0   # a4: rising arpeggio into the title
    while t < a1e - 1e-6 and k < len(up):
        (harp if k % 2 == 0 else zheng)(up[k], t, 0.08 + 0.12 * k / len(up), pan=(.3 if k % 2 == 0 else -.3), dur=2.0)
        t += BEAT / 2 if t < a1e - BAR / 2 - 1e-6 else BEAT / 4; k += 1
    revcym(a1e, 0.22, 2.0); timp_roll(M('A1'), a1e - BAR / 2, a1e, 0.05, 0.22)
    title_hit(a1e, 0.8, tail=3.0)

def sec_B():
    b0, b1e = SEC['B']; t0 = T('b1'); B_ = lambda k: t0 + BAR * k
    tq = cb(L('b10')[1])
    prog = [(b0, 'Dadd9'), (B_(0), 'D'), (B_(1), 'D/F#'), (B_(2), 'G'), (B_(3), 'A'), (B_(4), 'D'), (B_(5), 'D/F#'), (B_(6), 'G'), (B_(7), 'A'),
            (B_(8), 'D'), (B_(8.5), 'D/F#'), (B_(9), 'G'), (B_(9.5), 'A'), (B_(10), 'Dadd9'), (B_(11), 'Bm7'), (B_(12), 'Em7'), (B_(13), 'Gmaj7'),
            (B_(13.5), 'A7sus4'), (B_(14), 'D'), (B_(15), 'Gmaj7'), (B_(16), 'D/F#'), (B_(17), 'Gmaj7'), (tq, 'Asus4')]
    voy = B_(10)
    gB = lambda t: 0.15 if t < B_(8) else 0.21 if t < B_(11) else 0.14
    pad_prog([p for p in prog if p[0] >= b0 + 0.5], b1e, gB, att=1.0, rel=1.6, bass_g=0.75, synth=0.3, slp=1300)
    t = t0; k = 0   # zheng rolling ostinato (8ths): the documentary engine
    while t < B_(17) - 1e-6:
        b, up = chd(chord_at(prog, t)); v = sorted({m + 12 for m in up})
        pat = [v[0], v[2], v[1], v[3], v[2], v[1], v[3], v[2]] if len(v) >= 4 else [v[0], v[1], v[2], v[1]] * 2
        g = (0.13 if k % 2 == 0 else 0.085) * (0.8 if t < B_(2) else 1.0) * (0.75 if B_(11) <= t < B_(14) else 1.0) * (0.6 if t >= B_(15) else 1.0)
        zheng(pat[k % 8], t, g, pan=-0.3 if k % 2 else -0.1, dur=1.2); t += BEAT / 2; k += 1
    for bb in range(4, 17):   # frame drum from b3 (the boat), pizz bass
        tb = B_(bb)
        if B_(11) <= tb < B_(13): continue
        for o, gg, i in ((0, .42, 0), (1.5, .18, 3), (2, .30, 1), (3.5, .16, 5)): frame(tb + o * BEAT, gg * (0.8 if bb >= 15 else 1), i + bb)
        b = chd(chord_at(prog, tb))[0]; pizz(b + (12 if b < 40 else 0), tb, 0.30 if bb >= 5 else 0.0)
    for k in range(int(round((B_(15) - B_(5)) / (BEAT / 2)))):
        tk = B_(5) + k * BEAT / 2
        if not (B_(11) <= tk < B_(13)): shaker(tk, 0.10 if k % 2 == 0 else 0.065, k)
    timp_roll(M('A1'), voy - BAR / 2, voy, 0.04, 0.20); revcym(voy, 0.18, 1.5); timp(M('D2'), voy, 0.4); boom(voy, 0.25)
    horn([M('D4'), M('F#4'), M('A4')], voy, voy + BAR, 0.16, att=0.4); horn([M('B3'), M('D4'), M('F#4')], voy + BAR, voy + 2 * BAR, 0.12)
    motif(voy, M('D6'), lambda m, t, d: glock(m, t, 0.14, .3, dur=d + 1.0), MOT_A)
    cue(voy, 'B 环球出发：定音鼓滚奏 + 圆号 + 钟琴动机')
    motif(tq, M('D5'), lambda m, t, d: (piano(m, t, 0.22, dur=d + 2.0), zheng(m + 12, t, 0.09, .3, dur=d + 1.0)), MOT_A)
    cue(tq, 'B 尾：动机「答句」（钢琴），轻轻收住')

def sec_C():
    c0, c1e = SEC['C']; h = [ct('c2', '人'), ct('c2', '祸'), ct('c2', '天')]
    spad([M('B2'), M('F#3'), M('A3'), M('D4'), M('E4')], c0, h[0], 0.45, att=2.0, rel=0.6, lp=900)
    strings([M('B1'), M('F#2')], c0, h[0], 0.22, att=1.5, rel=0.5); strings([M('A3'), M('D4'), M('E4'), M('F#4')], c0, h[0], 0.10, att=2.0, rel=0.5)
    revcym(h[0], 0.16, 2.5)
    for k, (t, (root, nm)) in enumerate(zip(h, ((M('B1'), 'Bm'), (M('G1'), 'G'), (M('D2'), 'Dadd9')))):
        timp(root + 12 if root < 38 else root, t, 0.55 + 0.1 * k); boom(t, 0.55 if k < 2 else 0.45)
        spic([root, root + 7, root + 12], t, 0.55); piano(root - 12, t, 0.35, dur=2.5, lp=1800); piano(root, t, 0.25, dur=2.5, lp=2500)
        b, up = chd(nm); strings([b] + up, t, t + (1.0 if k < 2 else 3.0), 0.24, att=0.04, rel=1.2 if k < 2 else 2.0)
        if k == 1: gong(t, 0.18, i=1)
        if k == 2: tbell(M('D5'), t, 0.16); glock(M('A6'), t, 0.12); sparkle(t, 1.8, 0.4, dens=20, seed=7)
        cue(t, f'C 三声重击 {k + 1}/3（{["人选", "祸", "天选"][k]}）')
    prog = [(T('c3'), 'Dadd9'), (T('c4'), 'A/C#'), (T('c5'), 'Bm7'), (T('c5') + BAR, 'Gmaj7'), (T('c6'), 'D/F#'), (T('c6') + BAR, 'Em7'),
            (T('c7'), 'Bm7'), (T('c7') + BAR, 'Gmaj7'), (T('c8'), 'Em9'), (T('c8') + BAR, 'A7sus4'), (T('c9'), 'Bm7')]
    te = qb(ct('c9', '世'))
    pad_prog(prog, te, lambda t: 0.11 if t < T('c7') else 0.14, att=1.2, rel=0.9, bass_g=0.85, synth=0.28, slp=1000)
    tk = cb(T('c3') + 0.1); k = 0   # a quiet clock: one high piano tone on beats 2 and 4
    while tk < te - 0.2:
        if k % 2 == 1: piano(min(tones(chord_at(prog, tk), M('E5'), M('B5')), key=lambda m: abs(m - M('A5'))), tk, 0.075, pan=.25, dur=1.4)
        tk += BEAT; k += 1
    for t, nm in prog: piano(chd(nm)[0] + 12, t, 0.16, pan=-.2, dur=2.8, lp=2200)
    gate(te, T('c10'), floor=0.04, fo=0.35, fi=0.25); cue(te, 'C「世界不是银行」音乐抽空')
    ts = qb(ct('c10', '稳'))
    prog2 = [(T('c10'), 'Dadd9'), (ts, 'G/D'), (ts + 2 * BEAT, 'Em7/D'), (ts + 4 * BEAT, 'A/D'), (ts + 6 * BEAT, 'Dadd9')]
    pad_prog(prog2, c1e, 0.20, att=0.9, rel=2.0, bass_g=0.9, synth=0.35, slp=1300, sub_g=0.10)
    horn([M('D3'), M('A3')], ts, c1e, 0.10, att=1.0)
    for t, nm in prog2:
        for j, m in enumerate(tones(nm, M('D4'), M('D6'))[:6]): harp(m, t + j * BEAT / 2, 0.07, .3, dur=2.2)
    cue(ts, 'C「稳定的结构」D 持续低音上的温暖进行')

def sec_D():
    d0, d1e = SEC['D']; tw, tb = qb(ct('d4', '白'), 2), qb(ct('d4', '黑'), 2)
    prog = [(d0, 'Dadd9'), (T('d2') + BAR, 'Bm7'), (T('d4'), 'Gmaj7'), (tw, 'Em9'), (tb, 'Bm7'), (T('d5'), 'Gmaj7'),
            (T('d6'), 'D/F#'), (T('d6') + BAR, 'Em7'), (T('d7'), 'Gmaj7'), (T('d7') + BAR, 'A7sus4')]
    pad_prog(prog, d1e, 0.11, att=1.5, rel=1.8, bass_g=0.7, synth=0.3, slp=1100)
    P = pent(M('D4'), M('B5')); t = d0 + BEAT; k = 0; t16 = cb(T('d2')); tend = d1e - BAR / 2
    while t < tend - 1e-6:   # the river: harp + zheng, pentatonic ripples; 16ths from 「一条河」
        step = BEAT / 4 if t >= t16 else BEAT / 2; nm = chord_at(prog, t)
        x = 6 + 3.2 * np.sin(2 * np.pi * k / 16) + 1.6 * np.sin(2 * np.pi * k / 6.3 + 1); m = P[int(np.clip(round(x), 0, len(P) - 1))]
        if k % 4 == 0: m = min(tones(nm, M('D4'), M('B5')), key=lambda q: abs(q - m))
        acc = ((1.0, .55, .75, .55)[k % 4] if step < BEAT / 2 else (1.0, .7)[k % 2]) * float(np.clip((tend - t) / BAR, 0.3, 1))
        if k % 2 == 0: harp(m, t, 0.085 * acc, pan=.25, dur=1.6)
        else: zheng(m, t, 0.06 * acc, pan=-.25, dur=1.2)
        t += step; k += 1
    cue(t16, 'D 河流：竖琴/筝 十六分音符')
    for i, m in enumerate((M('F#6'), M('B6'), M('D7'))): glock(m, tw + i * BEAT / 4, 0.16, .4)
    piano(M('B0'), tb, 0.40, dur=3.5, lp=1500); piano(M('B1'), tb, 0.25, dur=3.5, lp=1800); strings([M('B1')], tb, tb + 2.5, 0.25, att=0.05); timp(M('B1'), tb, 0.25)
    cue(tw, 'D 白石：高音区'); cue(tb, 'D 黑石：低音区')
    tr, tl = qb(ct('d5', '伸'), 2), qb(ct('d5', '缩'), 2)
    for i, m in enumerate((M('A5'), M('B5'), M('D6'))): harp(m, tr + i * BEAT / 4, 0.14, .4)
    for i, m in enumerate((M('D4'), M('B3'), M('A3'))): harp(m, tl + i * BEAT / 4, 0.14, -.3)
    sparkle(T('d6'), L('d6')[1] - T('d6'), 0.22, dens=7, lo=M('A6'), hi=M('D8'), shape='even', seed=11)
    piano(M('D1'), qb(ct('d7', '底'), 2), 0.30, dur=3.0, lp=1200)

def sec_E():
    e0, e1e = SEC['E']; tb2 = qb(ct('e2', '蓝'), 2); tstop = qb(ct('e5', '蓝'), 2); tres = tstop + 2 * BEAT
    s = cb(T('e6')); tx = s + 8 * BEAT
    hi = [(e0, 'Gmaj7#11'), (e0 + BAR, 'D/F#'), (e0 + 2 * BAR, 'Em9'), (tb2, 'Gmaj7#11'), (T('e3'), 'Bm11')]
    lo = [(T('e4'), 'G'), (T('e4') + BAR, 'Em7'), (T('e4') + 2 * BAR, 'Asus4')]
    pad_prog(hi, T('e4'), 0.10, att=1.8, rel=1.5, bass_g=0.6, synth=0.0)
    for t, nm in hi:   # glass: high strings, pad, vibraphone
        b, up = chd(nm); t1 = min([p[0] for p in hi if p[0] > t] + [T('e4')])
        strings([m + 12 for m in up], t, t1, 0.07, att=1.5, rel=1.5, lp=3500, send=S_GLASS)
        spad([m + 12 for m in up], t, t1, 0.35, att=2.0, rel=2.0, lp=2600, send=S_GLASS)
        for j, m in enumerate(sorted(m + 12 for m in up)): vibe(m, t + j * BEAT / 3, 0.05, -.2 + .15 * j, send=S_GLASS)
    gl = [M(x) for x in ('D6', 'E6', 'F#6', 'A6', 'B6', 'C#7')]; t = e0 + BEAT; j = 2
    rr = np.random.default_rng(5)
    while t < T('e4') - 1e-6:
        j = int(np.clip(j + rr.choice([-2, -1, 1, 2]), 0, len(gl) - 1)); glock(gl[j], t, 0.06, rr.uniform(-.6, .6), dur=3.0, send=S_GLASS); t += 2 * BEAT
    sparkle(tb2, 1.6, 0.5, dens=26, seed=13); vibe(M('C#6'), tb2, 0.10, send=S_GLASS); glock(M('F#6'), tb2, 0.10); glock(M('C#7'), tb2 + BEAT / 2, 0.08)
    cue(tb2, 'E 蓝光（G 利底亚 #11 色彩）')
    pad_prog(lo, T('e5'), 0.11, att=1.2, rel=1.2, bass_g=0.7, synth=0.25, slp=900)
    cue(T('e4'), 'E 灰白色：魔幻层撤掉，只剩朴素三和弦')
    b, up = chd('Gmaj7#11'); strings(up, T('e5'), tstop, 0.10, att=1.0, rel=0.3); spad([m + 12 for m in up], T('e5'), tstop, 0.3, att=1.0, rel=0.3, lp=2400, send=S_GLASS)
    strings([b], T('e5'), tstop, 0.08, att=1.0, rel=0.3); glock(M('C#7'), T('e5') + BEAT, 0.05)
    gate(tstop, tres, floor=0.0, fo=0.03, fi=0.02); cue(tstop, 'E「蓝光，也没有回来」音乐停半小节')
    strings([M('A1'), M('D3')], tres, s, 0.12, att=0.8, rel=1.0); spad([M('D3'), M('A3')], tres, s, 0.3, att=1.0, lp=800)
    prog = [(s, 'Dadd9'), (s + 3 * BEAT, 'Gmaj7'), (s + 6 * BEAT, 'Asus4'), (tx, 'Dmaj9')]
    pad_prog(prog, T('e7'), 0.09, att=1.2, rel=1.5, bass_g=0.6, synth=0.25, slp=1000)
    motif(s, M('D5'), lambda m, t, d: piano(m, t, 0.30, dur=d + 1.8, pan=.1))
    for t, nm in prog:
        b, up = chd(nm); piano(b, t, 0.16, -.2, dur=3.5, lp=2500); piano(b + 7 if nm != 'Dmaj9' else b + 12, t + BEAT / 2, 0.11, -.15, dur=3.0, lp=2500)
    for j, m in enumerate((M('F#4'), M('A4'), M('C#5'), M('E5'))): piano(m, tx + BEAT + j * BEAT / 3, 0.09, .2, dur=3.0)
    cue(s, 'E 原文引句：钢琴动机'); cue(tx, 'E「它只在我心里」Dmaj9')
    pe = [(T('e7'), 'Em7'), (T('e7') + 2 * BEAT, 'F#m7'), (T('e7') + 4 * BEAT, 'Gmaj7'), (T('e7') + 6 * BEAT, 'A7sus4')]
    pad_prog(pe, e1e, 0.10, att=0.8, rel=1.2, bass_g=0.8, synth=0.25, slp=1100)
    t = T('e7'); k = 0
    while t < e1e - BEAT - 1e-6:
        c = tones(chord_at(pe, t), M('E4'), M('E6')); harp(c[(k * 2) % len(c)] if (k // 4) % 2 == 0 else c[-1 - (k * 2) % len(c)], t, 0.065, .25, dur=1.6)
        t += BEAT / 2; k += 1

def sec_F():
    f0, f1e = SEC['F']
    prog1 = [(f0, 'D'), (T('f1') + BAR, 'G/D'), (T('f1') + 2 * BAR, 'A/C#'), (T('f1') + 3 * BAR, 'D')]
    pad_prog(prog1, T('f2'), 0.10, att=0.8, rel=1.2, bass_g=0.6)
    t = T('f1'); k = 0; pat = [M(x) for x in ('D5', 'F#5', 'A5', 'F#5', 'E5', 'A5', 'B5', 'A5')]
    while t < T('f2') - 1e-6:   # f1: a boy's wish — light, playful plucks
        m = min(tones(chord_at(prog1, t), M('C#5'), M('B5')), key=lambda q: abs(q - pat[k % 8]))
        zheng(m, t, 0.08 if k % 2 == 0 else 0.055, -.2, dur=0.45)
        if k % 4 == 2: glock(m + 12, t, 0.05, .35, dur=1.0)
        t += BEAT / 2; k += 1
    tq0, t8, t16, tstop = cb(T('f2')), cb(T('f3')), qb(ct('f3', '改')), T('f4')
    seq = ['D', 'Em7', 'F#m7', 'G', 'A', 'Bm7', 'A', 'G', 'A', 'Bm7', 'A7sus4', 'Bm7', 'A', 'G', 'A7sus4', 'Bm7']
    pc = []; t = tq0
    while t < tstop - 1e-6: pc.append(t); t += BAR if t < t8 - 1e-6 else BAR / 2 if t < t16 - 1e-6 else BEAT
    prog_c = [(tt, seq[i % len(seq)]) for i, tt in enumerate(pc)]
    pad_prog([p for p in prog_c if p[0] < t8], t8, 0.10, att=0.5, rel=0.8, bass_g=0.6)
    for tt, nm in prog_c:
        b, up = chd(nm); spic([b + 12, up[1], up[2]], tt, 0.22 if tt >= t8 else 0.15); pizz(b + (12 if b < 40 else 0), tt, 0.28)
    t = tq0; k = 0   # the coin is the beat: heads high, tails low; the rule keeps changing → faster
    while t < tstop - 1e-6:
        step = BEAT if t < t8 - 1e-6 else BEAT / 2 if t < t16 - 1e-6 else BEAT / 4; hd = k % 2 == 0
        glock(M('A6') if hd else M('E6'), t, 0.07 if hd else 0.055, .35 if hd else -.35, dur=0.6); psal(M('A5') if hd else M('E5'), t, 0.06, .2 if hd else -.2, dur=0.5)
        if step < BEAT: shaker(t, 0.05, k)
        t += step; k += 1
    cue(tq0, 'F 掷币节拍：四分'); cue(t8, 'F 掷币节拍：八分'); cue(t16, 'F 掷币节拍：十六分（改规则，再掷）'); cue(tstop, 'F 节拍停')
    td = qb(ct('f4', '银'), 2)
    pad_prog([(tstop, 'Gmaj7')], td, 0.12, att=0.3, rel=0.6, bass_g=0.6)
    n = int(1.6 * SR); y = extend(osmp('vln_sus', M('A5'), 0.5, 0), n * 2); tt = np.arange(n) / SR   # deflate: strings sigh down a fifth
    z = varispeed(y, 2 ** (-7 * np.clip(tt / 1.2, 0, 1) ** 1.5 / 12))[:n]; z = z * (np.clip(tt / 0.05, 0, 1) * np.clip((len(z) / SR - tt[:len(z)]) / 0.5, 0, 1))[:, None]
    put(z, td, 0.20, -0.3, S_STR); pizz(M('D2'), td + 1.2, 0.35); piano(M('D2'), td + 1.2, 0.2, lp=1500)
    cue(td, 'F「银币镀金」泄气（弦乐下滑五度）')
    tbig, tsm, thz, tsh = qb(ct('f7', '大'), 2), qb(ct('f7', '小'), 2), qb(ct('f9', '堰'), 2), qb(ct('f10', '碎'), 2)
    prog5 = [(td + 1.2, 'Bm7'), (T('f5'), 'Gmaj7'), (T('f5') + BAR, 'Em9'), (T('f6'), 'D'), (T('f6') + BAR, 'Bm7'), (T('f6') + 2 * BAR, 'D'), (tbig, 'Gmaj7'), (tsm, 'Em9')]
    pad_prog(prog5, T('f8'), 0.11, att=1.0, rel=1.2, bass_g=0.7, synth=0.25, slp=1000)
    for t, nm in prog5[1:3]:
        b, up = chd(nm)
        for j, m in enumerate([b, b + 7] + up): piano(m, t + j * 0.06, 0.10 if j > 1 else 0.14, dur=3.5, lp=3000)
    for i in range(3):   # two faces of a coin: D rises, Bm falls
        t = T('f6') + i * BAR; c = tones('D' if i % 2 == 0 else 'Bm7', M('B3'), M('D5'))
        for j, m in enumerate(c if i % 2 == 0 else c[::-1]): harp(m, t + j * BEAT / 2, 0.07, .3 if i % 2 == 0 else -.3, dur=2.0)
    piano(M('G0'), tbig, 0.40, dur=3.5, lp=1500); piano(M('G1'), tbig, 0.25, dur=3.5, lp=1800); timp(M('G1'), tbig, 0.3); strings([M('G1')], tbig, tbig + 3, 0.22, att=0.05)
    cue(tbig, 'F 大石头：低音'); cue(tsm, 'F 小石头：拨弦开始一层层叠')
    progL = [(T('f8'), 'Bm11'), (T('f8') + 2 * BAR, 'Em9')]
    pad_prog(progL, thz, 0.10, att=1.0, rel=0.5, bass_g=0.7, synth=0.22, slp=1000)
    starts = [tsm, T('f8'), qb(ct('f8', '再')), qb(ct('f8', '还')), qb(ct('f8', '更', 1))]
    def layer(i, t, k):
        if i == 0: psal(M('F#5') if k % 2 else M('A5'), t, 0.045, .4, dur=0.8)
        elif i == 1: zheng(M('E5') if k % 2 else M('D5'), t + BEAT / 2, 0.045, -.35, dur=0.6)
        elif i == 2:
            m = [M('B5'), None, M('A5'), None, M('F#5'), None, None, M('E5')][k % 8]
            if m: harp(m, t, 0.04, .2, dur=1.0)
        elif i == 3:
            if k % 2 == 0: pizz(M('E2') if k % 4 == 0 else M('B2'), t, 0.2)
        else:
            if k % 3 == 0: glock(M('D7') if k % 2 else M('B6'), t, 0.035, -.4, dur=1.2)
    for i, t0 in enumerate(starts):
        step = BEAT / 4 if i in (2, 4) else BEAT / 2; t = cb(t0, 4 if step < BEAT / 2 else 2); k = 0
        while t < thz - 1e-6: layer(i, t, k); t += step; k += 1
    cue(thz, 'F 堰塞湖：一切静止，长和弦')
    b, up = chd('Em9'); strings([b, b + 7] + up, thz, tsh, 0.11, att=1.2, rel=0.4); horn([M('E3'), M('B3')], thz, tsh, 0.07, att=1.5, rel=0.4)
    spad([b + 12] + up, thz, tsh, 0.3, att=1.5, rel=0.4, lp=900); strings([M('A5')], thz + BAR, tsh, 0.04, att=2.0, rel=0.4)
    sparkle(tsh, 1.2, 0.16, dens=40, lo=M('A6'), hi=M('D8'), seed=17)   # a soft crack under 「碎」 — the words stay on top
    ta = cb(L('f10')[1]); sparkle(ta, 2.8, 0.24, dens=50, lo=M('D6'), hi=M('D8'), seed=19)   # the full shower once the line is out
    cas = list(reversed(pent(M('D4'), M('B6')))); rr = np.random.default_rng(3)
    for k, m in enumerate(cas): [zheng, harp, glock][k % 3](m + int(rr.choice([0, 0, 12])) if m < M('D5') else m, ta + k * BEAT / 8 + rr.uniform(0, .03), 0.03 * (1 - k / len(cas)) + 0.008, pan=float(rr.uniform(-.7, .7)))
    cue(tsh, 'F「碎」轻裂'); cue(ta, 'F 碎成无数细小的颗粒（句子说完后）')
    strings([M('B1'), M('F#2')], tsh + BAR / 2, f1e + 1.0, 0.10, att=1.5, rel=1.5)

def sec_G():
    g0, g1e = SEC['G']; s1 = cb(T('g3')); tpk = qb(ct('g5', '天')); s2 = tpk - 3 * BEAT
    prog = [(g0, 'Bm11'), (g0 + BAR, 'Gmaj7'), (g0 + 2 * BAR, 'D/F#'), (g0 + 3 * BAR, 'Em7'), (g0 + 4 * BAR, 'A7sus4'), (s1, 'D'), (s1 + 3 * BEAT, 'Gmaj7'),
            (300.0, 'Dadd9'), (s1 + 8 * BEAT, 'Bm7'), (s1 + 11 * BEAT, 'Gmaj7'), (s2 - 2 * BEAT, 'A7sus4'), (s2, 'D'), (tpk, 'Gmaj9'),
            (tpk + 3 * BEAT, 'A'), (tpk + 5 * BEAT, 'D/F#'), (tpk + 7 * BEAT, 'Bm7')]
    prog = [p for p in prog if p[0] < T('g6')]
    gG = lambda t: 0.10 + 0.10 * np.clip((t - g0) / max(s2 - g0, 1), 0, 1) if t < tpk else 0.30 if t < tpk + 3 * BEAT else 0.18
    pad_prog(prog, T('g6'), gG, att=1.2, rel=1.6, bass_g=0.8, synth=0.3, slp=1300)
    motif(s1, M('D5'), lambda m, t, d: strings([m], t, t + d, 0.13, att=0.25, rel=0.7, vel=0.35)); cue(s1, 'G 弦乐动机（弱）')
    tk = 300.0   # G1 场：金字拱桥合龙（场景第 495 帧 = 第 100 小节强拍）→ 暖的 Dadd9 + 管钟 + 竖琴滑音落在这里（g4 0.4 s 后开口，保持轻）
    harp_gliss(tk, M('D4'), M('D6'), 0.09, dur=1.0); tbell(M('D5'), tk, 0.10); strings([M('D4'), M('F#4'), M('A4')], tk, tk + 2 * BEAT, 0.09, att=0.05, rel=1.4)
    cue(tk, 'G 拱桥合龙：Dadd9 + 管钟 + 竖琴')
    motif(s2, M('D5'), lambda m, t, d: (strings([m], t, t + d, 0.22, att=0.12, rel=0.9, vel=0.7), strings([m + 12], t, t + d, 0.15, att=0.12, rel=0.9, vel=0.7),
                                        horn([m - 12], t, t + d, 0.12, att=0.15, rel=0.9)))
    timp_roll(M('A1'), s2, tpk, 0.05, 0.28); revcym(tpk, 0.22, 2.2); harp_gliss(tpk, M('D4'), M('D6'), 0.10)
    boom(tpk, 0.3); timp(M('G1'), tpk, 0.4); choir([M('B4'), M('D5'), M('F#5'), M('A5')], tpk, tpk + 4 * BEAT, 0.12, att=0.3, rel=2.0)
    b, up = chd('Gmaj9'); strings([m + 12 for m in up[:3]], tpk, tpk + 3 * BEAT, 0.12, att=0.1, rel=1.5)
    DUCKX.append((s2 - 0.3, tpk + 6 * BEAT, 8.5)); cue(tpk, 'G「天权」高点：弦乐 + 圆号 + 合唱')
    t6, t7 = T('g6'), T('g7')   # two poles: high and low, nothing in the middle
    strings([M('D6'), M('A5')], t6, t7, 0.08, att=1.0, rel=1.2); strings([M('D2'), M('A1')], t6, t7, 0.22, att=1.0, rel=1.2); sub(M('D2'), t6, t7, 0.08)
    ta, tb = qb(ct('g6', '加'), 2), qb(ct('g6', '后'), 2)
    for i, m in enumerate(pent(M('A6'), M('A7'))): glock(m, ta + i * BEAT / 4, 0.10, .45, dur=1.5)
    for i, m in enumerate((M('D2'), M('B1'), M('A1'), M('F#1'), M('D1'))): piano(m, tb + i * BEAT / 2, 0.25, -.2, dur=2.0, lp=1500)
    cue(t6, 'G 两极：高音区/低音区，中间空'); cue(ta, 'G「一路加码」上行'); cue(tb, 'G「一路后退」下行')
    pp = [(t7, 'Bm7'), (t7 + BAR, 'Gmaj7'), (T('g8'), 'D/F#'), (T('g8') + BAR, 'Em7'), (T('g8') + 2 * BAR, 'Gmaj7'), (T('g9'), 'Bm7'), (T('g9') + BAR, 'Gmaj7'), (T('g9') + 2 * BAR, 'Asus4')]
    for k, (t, nm) in enumerate(pp):   # quiet piano
        b, up = chd(nm); piano(b, t, 0.15, -.2, dur=3.5, lp=2500); piano(b + 7 if b + 7 < 55 else b + 12, t, 0.10, -.1, dur=3.5, lp=2500)
        for j, m in enumerate(up): piano(m, t + BEAT * (1 + j * 0.5), 0.075, .15, dur=2.5)
    motif(T('g9'), M('D5'), lambda m, t, d: piano(m, t, 0.11, .2, dur=d + 1.0), [(0, 0, 1.5), (1.5, -5, .5), (2, -3, 2)])
    cue(t7, 'G 安静的钢琴')
    p10 = [(T('g10'), 'Gmaj7'), (T('g10') + BAR, 'Dmaj9'), (T('g11'), 'Em7'), (T('g11') + BAR, 'F#m7'), (T('g11') + 2 * BAR, 'Gmaj7')]
    pad_prog(p10, T('g12'), lambda t: 0.08 + 0.06 * np.clip((t - T('g10')) / 10, 0, 1), att=1.5, rel=1.5, bass_g=0.7, synth=0.3, slp=1200)
    tres = qb(ct('g13', '桥'))
    pad_prog([(T('g12'), 'G/A')], tres, 0.15, att=1.5, rel=0.8, bass_g=0.8, synth=0.3, slp=1200)
    c = tones('G/A', M('A3'), M('A5')); t = T('g12'); k = 0
    while t < tres - BEAT - 1e-6: harp(c[[0, 2, 4, 3, 5, 4, 2, 1][k % 8] % len(c)], t, 0.06, .3, dur=2.0); t += BEAT / 2; k += 1
    tbell(M('A5'), qb(ct('g12', '问'), 2), 0.12); cue(T('g12'), 'G 提问：挂留和弦 G/A')
    harp_gliss(tres, M('D3'), M('D6'), 0.12, dur=1.2)
    b, up = chd('Dadd9'); strings([b, b + 7] + up + [m + 12 for m in up], tres, g1e + BAR, 0.30, att=0.5, rel=2.5)
    horn([M('D3'), M('F#3'), M('A3')], tres, g1e + BAR, 0.16, att=0.6, rel=2.0); choir([M('A4'), M('D5'), M('F#5')], tres, g1e, 0.10, att=1.0, rel=2.0)
    tbell(M('D5'), tres, 0.12); timp(M('D2'), tres, 0.25); spad([M('D3'), M('A3'), M('E4'), M('F#4')], tres, g1e + BAR, 0.4, att=0.8, rel=2.5, lp=1600)
    cue(tres, 'G「桥就还没断」解决到 D 大调')

def sec_H():
    h0, h1e = SEC['H']; qs = [T(f'h{k}') for k in range(4, 10)]; tg = T('h10')
    prog = [(T('h1'), 'D'), (T('h1') + BAR, 'Bm7'), (T('h2'), 'Gmaj7'), (T('h2') + BAR, 'D/F#'), (T('h3'), 'Em7'), (T('h3') + BAR, 'A7sus4')]
    prog += list(zip(qs, ['D', 'D/F#', 'Gmaj7', 'Em7', 'Bm7', 'A7sus4'])) + [(tg, 'Dmaj9'), (T('h11'), 'G/D'), (T('h11') + BAR, 'Dmaj9'),
             (T('h12'), 'Bm7'), (T('h12') + BAR, 'Gmaj7'), (T('h12') + 2 * BAR, 'A7sus4')]
    pad_prog(prog, h1e, lambda t: 0.20 if tg <= t < T('h11') else 0.08 if qs[0] <= t < tg else 0.10, att=1.0, rel=1.4, bass_g=0.7, synth=0.3, slp=1300)
    for a, z in ((T('h1'), qs[0] - BEAT), (T('h11'), h1e - BAR)):   # 'every day, one stone': a calm piano figure
        t = cb(a); k = 0
        while t < z - 1e-6:
            c = tones(chord_at(prog, t), M('D3'), M('A4')); piano(c[[0, 2, 4, 5, 4, 2, 3, 1][k % 8] % len(c)], t, 0.055, .1, dur=2.0); t += BEAT / 2; k += 1
    for i, (q, m) in enumerate(zip(qs, ['D5', 'E5', 'F#5', 'A5', 'B5', 'D6'])):
        tbell(M(m), q, 0.16, pan=-.2 + .08 * i); glock(M(m) + 12, q, 0.06, .3); cue(q, f'H 第{i + 1}问：钟')
    harp_gliss(tg, M('D4'), M('D6'), 0.10, dur=1.0)
    tbell(M('D5'), tg, 0.14); tbell(M('A5'), tg, 0.10, .2)
    for j, m in enumerate(('D6', 'F#6', 'A6', 'C#7')): glock(M(m), tg + j * BEAT / 4, 0.07, -.3 + .2 * j)
    for j, m in enumerate(('F#5', 'A5', 'C#6', 'E6')): vibe(M(m), tg + j * 0.05, 0.08, -.2 + .12 * j, dur=4.0)
    b, up = chd('Dmaj9'); strings([m + 12 for m in up], tg, T('h11'), 0.10, att=0.4, rel=2.0); spad([m + 12 for m in up], tg, T('h11'), 0.3, att=0.5, rel=2.0, lp=3000)
    cue(tg, 'H 第7问：金色和弦 Dmaj9')

def sec_I():
    i0, i1e = SEC['I']; tz = qb(ct('i2', '嗡'), 2); tst, trs = T('i3'), T('i4')
    p1 = [(i0, 'Gmaj7'), (i0 + 2 * BAR, 'D/F#'), (i0 + 3 * BAR, 'Em7')]
    pad_prog(p1, tst, 0.07, att=2.0, rel=0.3, bass_g=0.7, synth=0.4, slp=1000)
    for t, nm in p1:   # lazy afternoon: vibraphone, slow harp yawns
        b, up = chd(nm)
        for j, m in enumerate(sorted(m + 12 for m in up)): vibe(m, t + j * 0.09, 0.05, -.3 + .2 * j, dur=4.0)
        for j, m in enumerate(tones(nm, M('D4'), M('A5'))[:5]): harp(m, t + BAR / 2 + j * BEAT / 2, 0.05, .3, dur=2.5)
    buzzvoice(M('A3'), tz, tst, 0.05); cue(tz, 'I 嗡嗡声：柔和的音色（A）')
    gate(tst, trs, floor=0.0, fo=0.03, fi=0.5); cue(tst, 'I「是一只很大的马蜂」音乐停')
    s5 = cb(T('i5'))
    p2 = [(trs, 'Bm11'), (s5, 'Bm7'), (s5 + 3 * BEAT, 'Em9'), (s5 + 6 * BEAT, 'F#m7'), (s5 + 8 * BEAT, 'Gmaj7'), (T('i6'), 'Gmaj7'), (T('i6') + BAR, 'A7sus4')]
    pad_prog(p2, T('i7'), 0.09, att=1.5, rel=1.4, bass_g=0.8, synth=0.3, slp=1000)
    motif(s5, M('D5'), lambda m, t, d: (piano(m, t, 0.20, .1, dur=d + 1.5), glock(m + 12, t, 0.04, .3, dur=d + 1.0)))
    cue(s5, 'I 动机重新配和声（Bm7 – Em9 – F#m7）')
    p3 = [(T('i7'), 'D'), (T('i7') + BAR, 'Bm7'), (T('i7') + 2 * BAR, 'Gmaj7'), (T('i8'), 'A7sus4')]
    pad_prog(p3, cb(T('i9')), lambda t: 0.10 + 0.08 * np.clip((t - T('i7')) / 10, 0, 1), att=1.0, rel=1.4, bass_g=0.8, synth=0.3, slp=1400)
    t = T('i7'); k = 0
    while t < cb(T('i9')) - 1e-6:   # the build: harp 8ths, low string pulse, frame drum
        nm = chord_at(p3, t); c = tones(nm, M('D4'), M('D6')); fr = (t - T('i7')) / (cb(T('i9')) - T('i7'))
        harp(c[(k * 3) % len(c)], t, 0.05 + 0.04 * fr, .25, dur=1.4)
        if k % 2 == 0: spic([chd(nm)[0] + 12], t, 0.10 + 0.12 * fr)
        if k % 4 == 0 and fr > 0.3: frame(t, 0.25 + 0.2 * fr, k)
        t += BEAT / 2; k += 1
    timp_roll(M('A1'), T('i8'), cb(T('i9')), 0.04, 0.22); revcym(cb(T('i9')), 0.18, 2.0)
    s9 = cb(T('i9')); ny = [ct('i10', '你', k) for k in range(4)]
    p4 = [(s9, 'D'), (s9 + 3 * BEAT, 'Gmaj7'), (s9 + 6 * BEAT, 'A7sus4')]
    pad_prog(p4, ny[0], 0.22, att=0.6, rel=0.8, bass_g=0.9, synth=0.3, slp=1600, sub_g=0.08)
    motif(s9, M('D5'), lambda m, t, d: (strings([m], t, t + d, 0.22, att=0.1, rel=0.8, vel=0.7), strings([m + 12], t, t + d, 0.14, att=0.1, rel=0.8, vel=0.7),
                                        horn([m - 12], t, t + d, 0.16, att=0.12, rel=0.8), glock(m + 12, t, 0.06, .3, dur=d + 1)))
    choir([M('A4'), M('D5'), M('F#5')], s9, ny[0], 0.12, att=1.0, rel=0.6); timp(M('D2'), s9, 0.35); boom(s9, 0.25)
    DUCKX.append((s9 - 0.3, L('i10')[1] + 0.2, 7.0)); cue(s9, 'I 全体：动机再现')
    for k, (t, nm, bell) in enumerate(zip(ny, ['G', 'Em7', 'Bm7', 'Asus4'], ['D5', 'E5', 'F#5', 'A5'])):
        b, up = chd(nm); t1 = ny[k + 1] if k < 3 else cb(L('i10')[1])
        timp(b + 12 if b < 38 else b, t, 0.45); boom(t, 0.25); spic([b, b + 7, b + 12], t, 0.45)
        tbell(M(bell), t, 0.14); glock(M(bell) + 12, t, 0.07, .3)
        strings([b] + up, t, t1, 0.22, att=0.05, rel=0.8); horn([m - 12 for m in up[1:3]], t, t1, 0.10, att=0.1, rel=0.8)
        cue(t, f'I「你为什么」第{k + 1}下')
    sF = cb(L('i10')[1]); tT = sF + 3 * BEAT
    pF = [(sF, 'Gmaj7'), (sF + 2 * BEAT, 'A7sus4')]
    pad_prog(pF, tT, 0.24, att=0.2, rel=0.6, bass_g=0.9, synth=0.3, slp=1600)
    motif(sF, M('D5'), lambda m, t, d: (strings([m], t, t + d, 0.24, att=0.06, rel=0.6, vel=0.75), strings([m + 12], t, t + d, 0.16, att=0.06, rel=0.6, vel=0.75),
                                        horn([m - 12], t, t + d, 0.16, att=0.08, rel=0.6), zheng(m, t, 0.10, -.3, dur=d + 0.8), glock(m + 12, t, 0.06, .3, dur=d + 1)), MOT_F)
    title_hit(tT, 0.55, tail=4.0); tail = END - tT
    b, up = chd('Dadd9'); strings([b, b + 7] + up + [m + 12 for m in up], tT, END - 1.0, 0.17, att=0.05, rel=1.6)
    choir([M('D4'), M('F#4'), M('A4'), M('D5')], tT, END - 1.2, 0.10, att=0.3, rel=1.5); horn([M('D3'), M('A3')], tT, END - 1.2, 0.10, att=0.2, rel=1.5)
    spad([M('D3'), M('A3'), M('E4'), M('F#4'), M('A4')], tT, END - 1.0, 0.3, att=0.3, rel=1.5, lp=1800)
    cue(tT, f'I 结尾：片名「选」，长尾音 {tail:.2f} s 收在 END')

def transitions():   # the motif on ocarina in the long pauses between sections (≥ 4 s): the music comes forward, then hands back to the voice
    FR = [(0, 0, 1.5), (1.5, -5, .5), (2, -3, 1)]
    def ph(t_after, t_next, tail, g=0.17):
        s = cb(t_after + 0.4); notes = FR + [tail]
        if s + (notes[-1][0] + notes[-1][2]) * BEAT > t_next + 0.05: return
        motif(s, M('D5'), lambda m, t, d: flute(m, t, d, g), notes); cue(s, '过渡：陶笛动机')
    ph(L('c10')[1], T('d1'), (3, 2, 2))            # C→D: … E (open) — 「人为什么会这样选？」
    ph(L('d7')[1], T('e1'), (3, 4, 3))             # D→E: … F# rings into the blue Gmaj7#11
    ph(L('e7')[1], T('f1'), (3, 2, 2))             # E→F: … E over D
    ph(L('h12')[1], T('i1'), (3, 4, 3))            # H→I: … F# lands on the afternoon Gmaj7
    print('transitions:', [c for c in CUES if c['what'].startswith('过渡')])

# ================================================================ MIX
def kw(x):   # BS.1770 K-weighting at SR
    import math
    f0, G, Q = 1681.974450955533, 3.999843853973347, 0.7071752369554196; K = math.tan(math.pi * f0 / SR); Vh = 10 ** (G / 20); Vb = Vh ** 0.4996667741545416
    a0 = 1 + K / Q + K * K; x = lfilter([(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0], [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0], x, axis=0)
    f0, Q = 38.13547087602444, 0.5003270373238773; K = math.tan(math.pi * f0 / SR); a0 = 1 + K / Q + K * K
    return lfilter([1, -2, 1], [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0], x, axis=0)
def lufs_of(xk, mask=None):
    p = (xk ** 2).sum(1) if xk.ndim == 2 else xk ** 2
    if mask is not None: p = p[mask]
    return -0.691 + 10 * np.log10(p.mean() + 1e-12)
def limit(x, thr_db=-1.5, look=0.003):
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    thr = 10 ** (thr_db / 20); need = np.minimum(1.0, thr / np.maximum(np.abs(x).max(1), 1e-9)).astype(np.float32)
    if need.min() >= 1.0: return x
    w = int(look * SR); g = uniform_filter1d(minimum_filter1d(need, 2 * w + 1), w + 1)
    return (x * np.minimum(g, need)[:, None]).astype(np.float32)
def speech_mask(n, pre=0.10, post=0.08):
    m = np.zeros(n, bool)
    for l in GRID['lines']: m[max(0, int((l['start'] - pre) * SR)):int((l['end'] + post) * SR)] = True
    return m
def mixdown():
    for k in ('hall', 'big', 'plate'): bus(k)
    mix = BUS['dry'].copy(); RV = {'hall': 0.8, 'big': 0.7, 'plate': 0.6}
    for k in ('hall', 'big', 'plate'):
        mix += RV[k] * oaconvolve(filt(BUS[k], 'high', 160), IR(k), axes=0)[:N].astype(np.float32); BUS[k] = None
    g = np.ones(N, np.float32)
    for t0, t1, fl, fo, fi in GATE:
        i0, i1 = int(t0 * SR), int(t1 * SR); a, b = int(fo * SR), int(fi * SR)
        if i0 >= N: continue
        g[i0:i0 + a] = np.minimum(g[i0:i0 + a], np.linspace(1, fl, a)[:len(g[i0:i0 + a])]); g[i0 + a:i1] = np.minimum(g[i0 + a:i1], fl)
        g[i1:i1 + b] = np.minimum(g[i1:i1 + b], np.linspace(fl, 1, b)[:len(g[i1:i1 + b])])
    if MODE == 'full':
        i0, i1 = int((END - 1.6) * SR), int(END * SR); g[i0:i1] *= np.linspace(1, 0, i1 - i0) ** 2; g[i1:] = 0
    mix *= g[:, None]
    # line-driven 3-band ducking: the voice band (300 Hz–3 kHz) opens a hole while a line is spoken
    ctrl = 1000; nc = int(N / SR * ctrl) + 1; act = np.zeros(nc)
    for l in GRID['lines']: act[max(0, int((l['start'] - 0.10) * ctrl)):int((l['end'] + 0.08) * ctrl)] = 1
    on = np.flatnonzero(np.diff(np.concatenate([[0], act, [0]])) == 1); off = np.flatnonzero(np.diff(np.concatenate([[0], act, [0]])) == -1)
    for a_, b_ in zip(off[:-1], on[1:]):
        if b_ - a_ < 0.7 * ctrl: act[a_:b_] = 1   # gaps under 0.7 s stay ducked
    sm = np.zeros(nc); aa = 1 - np.exp(-1 / (0.06 * ctrl)); ar = 1 - np.exp(-1 / (0.40 * ctrl)); v = 0.0
    for i in range(nc): v += (aa if act[i] > v else ar) * (act[i] - v); sm[i] = v
    tt = np.arange(nc) / ctrl; dmid = np.full(nc, 9.5)
    for t0, t1, d in DUCKX: dmid[(tt >= t0) & (tt < t1)] = d
    curve = lambda db: np.interp(np.arange(N) / SR, tt, 10 ** (-db * sm / 20)).astype(np.float32)
    lo = sosfilt(butter(4, 300, 'low', fs=SR, output='sos'), mix, axis=0).astype(np.float32)
    hi = sosfilt(butter(4, 3000, 'high', fs=SR, output='sos'), mix, axis=0).astype(np.float32)
    mid = mix - lo - hi
    out = lo * curve(3.0)[:, None] + mid * curve(dmid)[:, None] + hi * curve(4.5)[:, None]
    return out

def write_outputs(music):
    n = int(round(REND * SR)); music = music[:n]
    vo, vsr = sf.read('public/voice.wav', dtype='float32', always_2d=True); vo = vo[:n, 0]
    if len(vo) < n: vo = np.concatenate([vo, np.zeros(n - len(vo), np.float32)])
    mk = speech_mask(n); mk = mk[:n]
    km, kv = kw(music), kw(vo)
    Lm, Lv = lufs_of(km, mk), lufs_of(kv, mk) + 10 * np.log10(2)   # voice is mono → counted on both channels in the final mix
    # per-section level: music under the voice sits TGT LU below it (story dynamics), 3 s crossfades between sections
    TGT = {'A': -11.0, 'B': -13.0, 'C': -13.0, 'D': -13.0, 'E': -14.0, 'F': -13.5, 'G': -12.5, 'H': -14.0, 'I': -12.5}
    from scipy.ndimage import uniform_filter1d
    trim = np.zeros(n, np.float32); rows = []
    for s_ in GRID['sections']:
        a, b = int(s_['start'] * SR), min(int(s_['end'] * SR), n)
        if a >= n: break
        d = (Lv + TGT[s_['id']]) - lufs_of(km[a:b], mk[a:b]) if mk[a:b].any() else 0.0
        trim[a:b] = d; rows.append(f"{s_['id']}{d:+.1f}")
    trim = uniform_filter1d(trim, int(3.0 * SR), mode='nearest')
    music = limit(music * (10 ** (trim / 20))[:, None], -1.5); print('section trims (dB):', ' '.join(rows), f'| voice {Lv:.1f} LUFS-k (ungated)')
    os.makedirs('work', exist_ok=True)
    tgt = 'public/music.wav' if MODE == 'full' else 'work/score_test_music.wav'
    sf.write(tgt, music, SR, subtype='PCM_24')
    mix = music + np.stack([vo, vo], 1)
    km = kw(music); kx = kw(mix); g12 = 10 ** ((-12.0 - lufs_of(kx)) / 20)   # quick ungated estimate, refined by ffmpeg below
    prev = 'work/score_preview.wav' if MODE == 'full' else 'work/score_test.wav'
    sf.write(prev, limit(mix * g12, -2.0), SR, subtype='PCM_24')
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', prev, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True, encoding='utf-8', errors='ignore').stderr
    I = float([l for l in r.splitlines() if l.strip().startswith('I:')][-1].split()[1]); g12 *= 10 ** ((-12.0 - I) / 20)
    sf.write(prev, limit(mix * g12, -2.0), SR, subtype='PCM_24')
    # ---- report (analysis instead of ears)
    def meas(path):
        r = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True, encoding='utf-8', errors='ignore').stderr
        I = [l.strip() for l in r.splitlines() if l.strip().startswith('I:')][-1]; P = [l.strip() for l in r.splitlines() if l.strip().startswith('Peak:')][-1]
        return I, P
    print('music  :', *meas(tgt)); print('preview:', *meas(prev))
    bp = lambda x: sosfilt(butter(4, [300, 3000], 'band', fs=SR, output='sos'), x, axis=0)
    mb, vb = bp(music.mean(1)), bp(vo)
    print('section  music(LUFS-k)  speech  gaps   midband music-vs-voice in speech   centroid')
    for s in GRID['sections']:
        a, b = int(s['start'] * SR), min(int(s['end'] * SR), n)
        if a >= n: break
        m_ = mk[a:b]; seg = km[a:b]
        sp = lufs_of(seg, m_) if m_.any() else float('nan'); gp = lufs_of(seg, ~m_) if (~m_).any() else float('nan')
        ratio = 10 * np.log10((mb[a:b][m_] ** 2).mean() / ((vb[a:b][m_] ** 2).mean() + 1e-12) + 1e-12) if m_.any() else float('nan')
        S = np.abs(np.fft.rfft(music[a:b].mean(1)[:2 ** 21])); fr = np.fft.rfftfreq(min(b - a, 2 ** 21), 1 / SR)
        print(f'{s["id"]} {s["name"][:6]:8s} {lufs_of(seg):7.1f} {sp:8.1f} {gp:6.1f}   {ratio:6.1f} dB   {(S * fr).sum() / S.sum():7.0f} Hz')
    wl = []   # per line: music vs voice inside 300 Hz–3 kHz
    for l in GRID['lines']:
        a, b = int(l['start'] * SR), min(int(l['end'] * SR), n)
        if b > a: wl.append((10 * np.log10((mb[a:b] ** 2).mean() / ((vb[a:b] ** 2).mean() + 1e-12) + 1e-12), l['id']))
    print('worst lines (mid-band music vs voice):', ', '.join(f'{i} {r:.1f}' for r, i in sorted(wl, reverse=True)[:6]))
    st = []   # short-term (3 s) maxima per section, relative to the voice
    for s_ in GRID['sections']:
        a, b = int(s_['start'] * SR), min(int(s_['end'] * SR), n)
        if a >= n: break
        v = max(lufs_of(km[i:i + 3 * SR]) for i in range(a, max(a + 1, b - 3 * SR), SR)); st.append(f"{s_['id']}{v - Lv:+.1f}")
    print('short-term (3 s) music max vs voice, LU:', ' '.join(st))
    jumps = []
    for s in GRID['sections'][1:]:
        a = int(s['start'] * SR)
        if a + SR < n: jumps.append(f'{s["id"]}:{lufs_of(km[a:a + SR]) - lufs_of(km[a - SR:a]):+.1f}')
    print('level change across section edges (1 s after − 1 s before):', ' '.join(jumps))
    print('clipped samples:', int((np.abs(music) >= 0.999).sum()), ' music peak dBFS:', round(20 * np.log10(np.abs(music).max()), 2), ' length:', len(music) / SR)
    return prev

def publish(prev):
    q = 'out/feishu_queue'; os.makedirs(q, exist_ok=True)
    for name, extra in (('配乐试听-前90秒', ['-t', '90']), ('配乐试听-全曲', [])):
        tmp = f'{q}/_tmp_{name}.mp3'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', prev, *extra, '-c:a', 'libmp3lame', '-b:a', '192k', tmp], check=True)
        os.replace(tmp, f'{q}/{name}.mp3'); print('queued', name, os.path.getsize(f'{q}/{name}.mp3') // 1024, 'KB')

if MODE == 'sfx':
    for nm, d in sfx_kit(): print(f'{nm:14s} {d:5.2f} s')
    sys.exit(0)
import time; _t0 = time.time()
for fn, sid in ((sec_A, 'A'), (sec_B, 'B'), (sec_C, 'C'), (sec_D, 'D'), (sec_E, 'E'), (sec_F, 'F'), (sec_G, 'G'), (sec_H, 'H'), (sec_I, 'I')):
    if SEC[sid][0] < REND: fn(); print(f'section {sid} scheduled  ({time.time() - _t0:.0f} s)', flush=True)
if REND > 200: transitions()
music = mixdown(); print(f'mixdown done ({time.time() - _t0:.0f} s)', flush=True)
prev = write_outputs(music)
CUES.sort(key=lambda c: c['t'])
json.dump(dict(bpm=BPM, beat=BEAT, bar=BAR, end=END, key='D 宫 / B 羽', motif='D5 . A4 B4 | F#5 ~ E5', cues=CUES),
          open('notes/score_cues.json' if MODE == 'full' else 'work/score_test_cues.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
if MODE == 'full' and '--no-send' not in sys.argv: publish(prev)
print(f'done in {time.time() - _t0:.0f} s')
