# 全书 → scenes/core/book.json（字流 + 段落 + 章节）+ public/glyph/atlas.png/json（每个字一个 96px 格：R=字形，G=光晕）。
# 原文：work/book_raw.txt（PDF 抽字，已 NFKC，已去水印行）。修正 PDF 抽字错误（口→又），统一「贪梦」→「贪婪」（作者后几章自己改成贪婪）。
import json, re, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
EP = Path(__file__).resolve().parent.parent
sys.stdout.reconfigure(encoding="utf-8")
raw = (EP / "work/book_raw.txt").read_text("utf-8")
lines = raw.splitlines()
CJK = r"\u3000-\u303f\u4e00-\u9fff\uff00-\uffef“”‘’—…·"
def norm(s):
    s = s.replace("贪梦", "贪婪")
    for a, b in [("借又", "借口"), ("上又", "上口"), ("又头禅", "口头禅"), ("江又市", "江口市"), ("路又", "路口"), ("档又", "档口"), ("门又", "门口")]:
        s = s.replace(a, b)
    s = re.sub(rf"\s*([{CJK}])\s*", r"\1", s)
    for a, b in [(",", "，"), (":", "："), (";", "；"), ("?", "？"), ("!", "！"), ("(", "（"), (")", "）")]:
        s = re.sub(rf"(?<=[{CJK}a-zA-Z0-9]){re.escape(a)}|{re.escape(a)}(?=[{CJK}])", b, s)
    return s.strip()
chapters, cur, out = [], None, []
i = 0
# 正文从「第 1 篇」开始；之前是封面和目录
while i < len(lines) and not re.match(r"^第\s*1\s*篇", lines[i]): i += 1
paras = []   # (chapter_idx, text)
buf = ""
def flush():
    global buf
    if buf: paras.append((len(chapters) - 1, buf)); buf = ""
while i < len(lines):
    L = lines[i].rstrip()
    if re.match(r"^=== p\d+ ===$", L): i += 1; continue
    m = re.match(r"^第\s*(\d+)\s*篇$", L)
    if m:
        flush()
        title = norm(lines[i + 1]); meta = lines[i + 2]
        date = (re.search(r"(\d{4}-\d{2}-\d{2})", meta) or [None, ""])[1] if re.search(r"\d{4}-\d{2}-\d{2}", meta) else ""
        chapters.append({"n": int(m.group(1)), "title": title.replace("人选天选论 - 序", "序"), "date": date})
        i += 4  # 篇号、标题、《》作者日期行、HTTPS 行
        paras.append((len(chapters) - 1, chapters[-1]["title"]))   # 章名单独一段
        continue
    s = norm(L)
    if not s: i += 1; continue
    buf += s
    if len(s) < 44 or s.endswith(("。”", "：")) and len(s) < 48: flush()
    i += 1
flush()
text, breaks, ch_ranges = "", [], {}
for ci, p in paras:
    breaks.append(len(text))
    a = len(text); text += p
    r = ch_ranges.setdefault(ci, [a, a]); r[1] = len(text)
for ci, c in enumerate(chapters):
    c["start"], c["end"] = ch_ranges[ci]
# 跨行被拆开的词（PDF 换行处）再统一修一遍；都是等长替换，字的下标不变
for a, b in [("贪梦", "贪婪"), ("借又", "借口"), ("上又", "上口"), ("又头禅", "口头禅"), ("江又市", "江口市"), ("路又", "路口"), ("档又", "档口"), ("门又", "门口")]:
    assert len(a) == len(b)
    text = text.replace(a, b)
han = len(re.findall(r"[\u4e00-\u9fff]", text))
script = json.loads((EP / "script/script.json").read_text("utf-8"))
stext = "".join(t for s in script["sections"] for _, t, _ in s["lines"])
EXTRA = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz，。、；：？！“”‘’（）《》【】—…·「」『』／/-+×=%:.,!?'\"()[] ←→↑↓○●◆◇✓✗×万亿年月日号元公斤次选祸福贪惧怕权桥河石光币天人"
chars = sorted(set(text + stext + EXTRA) - {"\n", "\r", "\t"})
if " " in chars: chars.remove(" "); chars.insert(0, " ")
# 字序钉死：已经发出去的格号不能变（场景代码在运行时按 atlas.json 查格号，png 和 json 必须一一对应）。新字只往后追加。
PIN = EP / "public/glyph/atlas_order.txt"
if PIN.exists():
    pinned = list(PIN.read_text("utf-8"))
    chars = pinned + sorted(set(chars) - set(pinned))
CELL, FS = 96, 74
cols = 48; rows = (len(chars) + cols - 1) // cols
font = ImageFont.truetype(str(EP / "fonts/ttf/NotoSerifSC-600.ttf"), FS)
sharp = Image.new("L", (cols * CELL, rows * CELL), 0)
# 统一基线：用「国」的墨迹框把汉字垂直居中（所有字同一个偏移，标点/字母保持相对位置），每个字画在自己的格子里再裁边，绝不越界
gb = font.getbbox("国")
dy = (CELL - (gb[1] + gb[3])) / 2
for k, c in enumerate(chars):
    x, y = (k % cols) * CELL, (k // cols) * CELL
    w = font.getlength(c)
    tile = Image.new("L", (CELL, CELL), 0)
    ImageDraw.Draw(tile).text(((CELL - w) / 2, dy), c, font=font, fill=255)
    m = Image.new("L", (CELL, CELL), 0); ImageDraw.Draw(m).rectangle((3, 3, CELL - 4, CELL - 4), fill=255)
    sharp.paste(tile, (x, y), m)
glow = sharp.filter(ImageFilter.GaussianBlur(8))
g = np.asarray(glow).astype(np.float32); g = np.clip(g * 2.0, 0, 255)
cm = np.zeros((CELL, CELL), np.float32); yy, xx = np.mgrid[0:CELL, 0:CELL]
cm = np.clip((CELL / 2 - 4 - np.maximum(abs(xx - CELL / 2 + .5), abs(yy - CELL / 2 + .5))) / 6, 0, 1)
g = (g * np.tile(cm, (rows, cols))).astype(np.uint8)
rgb = np.stack([np.asarray(sharp), g, np.zeros_like(g)], -1)
(EP / "public/glyph").mkdir(parents=True, exist_ok=True)
Image.fromarray(rgb, "RGB").save(EP / "public/glyph/atlas.png", optimize=True)
(EP / "public/glyph/atlas.json").write_text(json.dumps({"cell": CELL, "cols": cols, "rows": rows, "w": cols * CELL, "h": rows * CELL, "chars": "".join(chars)}, ensure_ascii=False), "utf-8")
(EP / "scenes/core/book.json").write_text(json.dumps({"text": text, "breaks": breaks, "chapters": chapters, "han": han}, ensure_ascii=False), "utf-8")
print(f"glyph stream {len(text)} chars, {han} 汉字, {len(paras)} paragraphs, {len(chapters)} chapters, atlas {len(chars)} chars {cols * CELL}x{rows * CELL}")
for c in chapters: print(c)
print(text[:300])
