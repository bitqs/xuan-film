# 封面：就一个「选」。由 2× 渲染的 9:16 底图（scenes/coverglyph.tsx）裁/拼成 9:16、3:4、4:3（都是 2 倍分辨率，抖音不会嫌低）。
# 用法：python -P -E tools/covers.py <底图.png> <后缀>
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter
src, tag = Path(sys.argv[1]), sys.argv[2]
out = Path(__file__).resolve().parent.parent / "out/final"; out.mkdir(parents=True, exist_ok=True)
im = Image.open(src).convert("RGB")   # 2160×3840，「选」中心在 y≈1780
W, H = im.size
cy = 1780
im.save(out / f"封面_9x16_{tag}.jpg", quality=95)
im.crop((0, cy - 1440, W, cy + 1440)).save(out / f"封面_3x4_{tag}.jpg", quality=95)
# 4:3：用小一号「选」的底图（CoverGlyphSmall，字高 620）中间裁 2160×1620
if len(sys.argv) > 3:
    sm = Image.open(sys.argv[3]).convert("RGB")
    sm.crop((0, cy - 810, W, cy + 810)).save(out / f"封面_4x3_{tag}.jpg", quality=95)
print("ok", [p.name for p in sorted(out.glob(f'封面_*_{tag}.jpg'))])
