# 排时间线：把 work/vo.json 的逐句配音放到 80 BPM 网格上（拍 = 0.75 s，小节 = 3 s，t=0 是第 0 小节的强拍）。
# 句首（能量开口）落在半拍上；段落之间至少空一小节给音乐呼吸；道痕七问每问落在拍上。
# 输出：alignment/lines.json、alignment/chars.json（全片秒）、public/voice.wav、storyboard/sections.json、notes/grid.json
import json, sys, wave
from pathlib import Path
import numpy as np
EP = Path(__file__).resolve().parent.parent
SR = 48000
BPM = 80.0; BEAT = 60 / BPM; BAR = 4 * BEAT; HALF = BEAT / 2
vo = {x["id"]: x for x in json.loads((EP / "work/vo.json").read_text("utf-8"))}
# 有声段：能量包络过 5% 峰值（2% 会被片头的小咔哒骗到，早 0.4 s）
for _id, _v in vo.items():
    with wave.open(str(EP / "audio/vo" / f"{_id}.wav")) as _w:
        _x = np.frombuffer(_w.readframes(_w.getnframes()), "<i2").astype(np.float32)
    _e = np.convolve(np.abs(_x), np.ones(480) / 480, "same")
    _on = np.where(_e > _e.max() * 0.05)[0]
    _v["on"], _v["off"] = float(_on[0] / SR), float(_on[-1] / SR)
sc = json.loads((EP / "script/script.json").read_text("utf-8"))
PUN = set("，。：；？！、,.:;?!「」…—“”")
# 特殊排法：段首额外空几小节（音乐/画面独占）；某些句子要更长的停顿
SEC_PAD = {"C": 1, "D": 1, "E": 1, "F": 1, "G": 1, "H": 1, "I": 1}   # 段首前额外空的小节数
EXTRA = {"a2": 0.6, "a4": 0.9, "b10": 0.6, "c2": 0.4, "c3": 0.5, "c6": 0.4, "c9": 0.5, "d2": 0.4, "e5": 0.6, "e6": 0.9,
         "f5": 0.6, "f10": 0.5, "g3": 0.5, "g5": 0.6, "g13": 0.8, "h3": 0.5, "h11": 0.5, "i3": 0.8, "i5": 0.6, "i8": 0.9, "i9": 0.4}
ON_BEAT = {f"h{k}" for k in range(4, 11)} | {"c2", "i10", "g13", "i8"}
ceil_to = lambda t, q: np.ceil(t / q - 1e-9) * q
t_end = 0.0
lines, out_chars, sections = [], [], []
first = True
for s in sc["sections"]:
    sec_start = None
    for k, (lid, text, src) in enumerate(s["lines"]):
        v = vo[lid]
        if first:
            onset = 0.25; first = False           # 第 0 帧就有声音
        elif k == 0:
            onset = ceil_to(t_end + 1.6, BEAT) + SEC_PAD.get(s["id"], 0) * BAR
        else:
            q = BEAT if lid in ON_BEAT else HALF
            onset = ceil_to(t_end + 0.42 + 0.8 * EXTRA.get(lid, 0), q)
        if sec_start is None:
            sec_start = 0.0 if not sections else (onset - BAR * 0.5 if k == 0 else onset)
        clip0 = onset - v["on"]               # 音频片段在全片里的起点
        st, en = onset, clip0 + v["off"]
        # 逐字时间：豆包 words（中文按字）→ 对齐到 text 的每个字符（标点给零长度）
        ws = [w for w in v["words"] if w["w"]]
        flat = []
        for w in ws:
            cs = [c for c in w["w"] if c not in PUN and not c.isspace()]
            if not cs: continue
            d = (w["end"] - w["start"]) / len(cs)
            for j, c in enumerate(cs):
                flat.append((c, w["start"] + j * d, w["start"] + (j + 1) * d))
        chars, fi = [], 0
        last = st
        for c in text:
            if c in PUN or c.isspace():
                chars.append({"c": c, "start": round(last, 3), "end": round(last, 3)}); continue
            # 找下一个相同的字（豆包偶尔把「AI」拆成字母）
            j = fi
            while j < len(flat) and flat[j][0] != c and j < fi + 3: j += 1
            if j < len(flat) and flat[j][0] == c:
                _, a, b = flat[j]; fi = j + 1
                cst, cen = clip0 + a, clip0 + b
            else:
                cst, cen = last, last + 0.12
            chars.append({"c": c, "start": round(cst, 3), "end": round(cen, 3)}); last = cen
        i = len(lines) + 1
        lines.append({"i": i, "id": lid, "sec": s["id"], "text": text, "src": src, "start": round(st, 3), "end": round(en, 3),
                      "clip": round(clip0, 4)})
        out_chars.append({"i": i, "id": lid, "text": text, "start": round(st, 3), "end": round(en, 3), "chars": chars})
        t_end = en
    sections.append({"id": s["id"], "name": s["name"], "start": round(sec_start, 3), "first": lines[-len(s["lines"])]["i"],
                     "last": lines[-1]["i"]})
END = ceil_to(t_end + 2.0, BEAT) + 2 * BAR      # 最后一句后：两小节片尾（「选」）
for k, s in enumerate(sections):
    s["end"] = sections[k + 1]["start"] if k + 1 < len(sections) else round(END, 3)
# 配音总轨
N = int(END * SR) + SR
mix = np.zeros(N, np.float32)
for l in lines:
    with wave.open(str(EP / "audio/vo" / f"{l['id']}.wav")) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(np.float32) / 32768
    a = int(round(l["clip"] * SR)); a0 = max(a, 0); x = x[a0 - a:]
    mix[a0:a0 + len(x)] += x[: N - a0]
mix = mix[: int(END * SR)]
pk = np.abs(mix).max(); mix *= 0.89 / pk
with wave.open(str(EP / "public/voice.wav"), "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype("<i2").tobytes())
(EP / "alignment").mkdir(exist_ok=True); (EP / "storyboard").mkdir(exist_ok=True); (EP / "notes").mkdir(exist_ok=True)
(EP / "alignment/lines.json").write_text(json.dumps(lines, ensure_ascii=False, indent=1), "utf-8")
(EP / "alignment/chars.json").write_text(json.dumps(out_chars, ensure_ascii=False), "utf-8")
(EP / "storyboard/sections.json").write_text(json.dumps({"end": round(END, 3), "sections": sections}, ensure_ascii=False, indent=1), "utf-8")
grid = {"bpm": BPM, "beat": BEAT, "bar": BAR, "t0": 0.0, "end": round(END, 3), "bars": int(round(END / BAR)),
        "sections": [{"id": s["id"], "name": s["name"], "start": s["start"], "end": s["end"], "bar": round(s["start"] / BAR, 2)} for s in sections],
        "lines": [{"id": l["id"], "start": l["start"], "end": l["end"], "text": l["text"]} for l in lines]}
(EP / "notes/grid.json").write_text(json.dumps(grid, ensure_ascii=False, indent=1), "utf-8")
sys.stdout.reconfigure(encoding="utf-8")
for s in sections: print(f"{s['id']} {s['name']:<10} {s['start']:7.2f} → {s['end']:7.2f}  ({s['end'] - s['start']:5.1f}s)  lines {s['first']}-{s['last']}")
print(f"END {END:.2f}s = {int(END // 60)}:{END % 60:04.1f}, {len(lines)} lines")
