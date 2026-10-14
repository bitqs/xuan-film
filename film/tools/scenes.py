# 场景切分 → storyboard/scenes.json。段落内的切点：上一句结束和下一句开口之间，取最靠近中点的半拍。
import json, sys
from pathlib import Path
EP = Path(__file__).resolve().parent.parent
sys.stdout.reconfigure(encoding="utf-8")
L = json.loads((EP / "alignment/lines.json").read_text("utf-8"))
S = json.loads((EP / "storyboard/sections.json").read_text("utf-8"))
SPLIT = [("A", "a1", "a4"), ("B1", "b1", "b6"), ("B2", "b7", "b10"), ("C1", "c1", "c6"), ("C2", "c7", "c10"), ("D", "d1", "d7"),
         ("E", "e1", "e7"), ("F1", "f1", "f5"), ("F2", "f6", "f10"), ("G1", "g1", "g6"), ("G2", "g7", "g13"), ("H", "h1", "h12"),
         ("I1", "i1", "i5"), ("I2", "i6", "i10")]
byid = {l["id"]: l for l in L}
sec_start = {s["id"]: s["start"] for s in S["sections"]}
HALF = 0.375
out = []
for k, (sid, a, b) in enumerate(SPLIT):
    la, lb = byid[a], byid[b]
    if la["sec"] != (out[-1]["sec"] if out else None) or k == 0:
        start = sec_start[la["sec"]]
    else:
        prev = L[la["i"] - 2]
        start = round(round(((prev["end"] + la["start"]) / 2) / HALF) * HALF, 3)
    out.append({"id": sid, "sec": la["sec"], "first": la["i"], "last": lb["i"], "start": start})
OVERRIDE_START = {"B1": 20.625}   # A 多留 1 秒给片名「选」（19.5 s 落下）
for s in out:
    if s["id"] in OVERRIDE_START: s["start"] = OVERRIDE_START[s["id"]]
for k, s in enumerate(out):
    s["end"] = out[k + 1]["start"] if k + 1 < len(out) else S["end"]
    s["lines"] = [{"i": l["i"], "id": l["id"], "text": l["text"], "start": l["start"], "end": l["end"], "src": l["src"]} for l in L[s["first"] - 1:s["last"]]]
(EP / "storyboard/scenes.json").write_text(json.dumps({"end": S["end"], "fps": 30, "scenes": out}, ensure_ascii=False, indent=1), "utf-8")
for s in out: print(f"{s['id']:<3} {s['start']:7.2f} → {s['end']:7.2f} ({s['end'] - s['start']:5.1f}s)  {s['lines'][0]['text'][:18]}…")
