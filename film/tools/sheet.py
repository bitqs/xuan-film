# 联系表：python -P -E tools/sheet.py <帧目录> <输出.jpg> <格宽> <格高> <every|list> [起始帧]
import sys
from pathlib import Path
from PIL import Image, ImageDraw
src, dst, w, h, mode = Path(sys.argv[1]), sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
start = int(sys.argv[6]) if len(sys.argv) > 6 else 0
files = sorted(list(src.glob("*.jpeg")) + list(src.glob("*.jpg")), key=lambda f: int("".join(c for c in f.stem if c.isdigit()) or 0))
cols = 6 if w <= 216 else 4
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * w, max(1, rows) * h), (40, 40, 40))
for k, f in enumerate(files):
    im = Image.open(f).convert("RGB").resize((w, h))
    d = ImageDraw.Draw(im)
    if mode == "list":
        label = str(int(f.stem.lstrip("f") or 0))
    else:
        # remotion --sequence 的文件名是 element-<序号>（0,1,2…），帧号 = 起始帧 + 序号 × every
        digits = "".join(c for c in f.stem if c.isdigit())
        label = str(start + (int(digits) if digits else k) * int(mode))
    d.rectangle((0, 0, 8 + 9 * len(label), 18), fill=(0, 0, 0))
    d.text((4, 3), label, fill=(255, 90, 90))
    sheet.paste(im, ((k % cols) * w, (k // cols) * h))
sheet.save(dst, quality=85)
print(dst, len(files), "frames")
