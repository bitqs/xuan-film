# 字体子集（文件版，staticFile 加载，不内联）：GB2312 全部 6763 字 + 全书 + 文案 + 画面里的中文 + 常用符号。
# 画面里新加了生僻字就重跑：python -P -E tools/fonts.py
import json, re, subprocess, sys, tempfile
from pathlib import Path
EP = Path(__file__).resolve().parent.parent
FACES = {"serif600": EP / "fonts/ttf/NotoSerifSC-600.ttf", "serif900": EP / "fonts/ttf/NotoSerifSC-900.ttf",
         "sans500": Path("D:/Projects/writingisthinking/fonts/SourceHanSansCN-Medium.otf"),
         "sans700": Path("D:/Projects/writingisthinking/fonts/SourceHanSansCN-Bold.otf")}
gb = []
for b1 in range(0xB0, 0xF8):
    for b2 in range(0xA1, 0xFF):
        try: gb.append(bytes([b1, b2]).decode("gb2312"))
        except Exception: pass
text = "".join(gb) + json.loads((EP / "scenes/core/book.json").read_text("utf-8"))["text"]
text += (EP / "script/script.json").read_text("utf-8")
for f in list(EP.joinpath("scenes").rglob("*.tsx")) + list(EP.joinpath("scenes").rglob("*.ts")):
    text += "".join(re.findall(r"[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]", f.read_text(encoding="utf-8")))
text += "".join(chr(c) for c in range(0x20, 0x7F)) + "，。、；：？！“”‘’（）《》【】—…·「」『』／←→↑↓○●◆◇✓✗×÷±≈≠≤≥°%‰•※"
chars = sorted(set(text) - set("\r\n\t"))
with tempfile.TemporaryDirectory() as td:
    cf = Path(td) / "chars.txt"; cf.write_text("".join(chars), encoding="utf-8")
    for name, face in FACES.items():
        dst = EP / "public/fonts" / f"{name}.woff2"
        subprocess.run([sys.executable, "-m", "fontTools.subset", str(face), f"--text-file={cf}", "--flavor=woff2",
                        f"--output-file={dst}", "--layout-features=*", "--no-hinting"], check=True)
        print(name, dst.stat().st_size // 1024, "KB")
print(len(chars), "chars")
