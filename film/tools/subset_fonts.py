"""按本期用字子集化思源黑体（Bold/Heavy）→ WOFF2 base64 → fonts/fonts-inline.ts。
用字：script/source_v3.md + script/locked.txt + scenes/**/*.tsx|ts 里的中文 + episode.json + 常用标点数字。
画面里新出现了字，必须重跑：python episodes/maihu/tools/subset_fonts.py"""
import base64, json, re, subprocess, sys, tempfile
from pathlib import Path
EP = Path(__file__).resolve().parent.parent
FONTS = Path("D:/Projects/writingisthinking/fonts")
FACES = {"SHS_BOLD_B64": FONTS / "SourceHanSansCN-Bold.otf", "SHS_HEAVY_B64": FONTS / "SourceHanSansCN-Heavy.otf", "SHS_MED_B64": FONTS / "SourceHanSansCN-Medium.otf",
         "WK_B64": Path("D:/Projects/writingisthinking/studio/kit/fonts/LXGWWenKai-Medium.ttf")}
BASE = ("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
        "，。、；：？！“”‘’（）《》【】—…·「」『』／/-–+×÷=%:.,!?'\"()[] ▸▶→←↑↓℃°¥$#&*<>~|_")
text = (EP / "script/source_v3.md").read_text(encoding="utf-8") + (EP / "script/locked.txt").read_text(encoding="utf-8")
text += json.dumps(json.loads((EP / "episode.json").read_text(encoding="utf-8")), ensure_ascii=False)
for f in list(EP.joinpath("scenes").rglob("*.tsx")) + list(EP.joinpath("scenes").rglob("*.ts")):
    text += "".join(re.findall(r"[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]", f.read_text(encoding="utf-8")))
chars = sorted(set(c for c in text + BASE if c not in "\r\n\t"))
out = ["// 由 tools/subset_fonts.py 生成，勿手改。"]
with tempfile.TemporaryDirectory() as td:
    cf = Path(td) / "chars.txt"
    cf.write_text("".join(chars), encoding="utf-8")
    for var, face in FACES.items():
        dst = Path(td) / (var + ".woff2")
        subprocess.run([sys.executable, "-m", "fontTools.subset", str(face), f"--text-file={cf}", "--flavor=woff2",
                        f"--output-file={dst}", "--layout-features=*", "--no-hinting"], check=True)
        b = dst.read_bytes()
        out.append(f"export const {var} = '{base64.b64encode(b).decode()}';")
        print(var, len(b) // 1024, "KB")
(EP / "fonts/fonts-inline.ts").write_text("\n".join(out) + "\n", encoding="utf-8")
print(len(chars), "chars")
