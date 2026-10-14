# Seedream (Volcengine Ark, direct, no proxy) text-to-image. Key: ARK_API_KEY in D:/Projects/ai-film/.env.
# python -P -E seedream.py <prompts.json> <outdir> [--size 1440x2560] [--model ...] [--only a,b] [--jobs 4]
import json, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
HOST = "https://ark.cn-beijing.volces.com/api/v3"
ENV = Path("D:/Projects/ai-film/.env")
OP = urllib.request.build_opener(urllib.request.ProxyHandler({}))
KEY = dict(l.split("=", 1) for l in ENV.read_text("utf-8").splitlines() if "=" in l)["ARK_API_KEY"].strip()
a = sys.argv
prompts = json.loads(Path(a[1]).read_text("utf-8")); out = Path(a[2]); out.mkdir(parents=True, exist_ok=True)
opt = lambda k, d: a[a.index(k) + 1] if k in a else d
size, model = opt("--size", "1440x2560"), opt("--model", "doubao-seedream-5-0-pro-260628")
only = set(opt("--only", "").split(",")) - {""}
def gen(item):
    name, p = item
    dst = out / f"{name}.jpg"
    if dst.exists() and "--force" not in a: return f"skip {name}"
    body = {"model": model, "prompt": p, "size": size, "response_format": "url", "watermark": False}
    for k in range(3):
        try:
            req = urllib.request.Request(HOST + "/images/generations", data=json.dumps(body).encode(),
                                         headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
            r = json.loads(OP.open(req, timeout=180).read())
            url = r["data"][0]["url"]
            dst.write_bytes(OP.open(url, timeout=120).read())
            return f"ok {name}"
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", "replace")[:400]
            if e.code in (400, 401, 403, 404): return f"FAIL {name}: {e.code} {msg}"
            time.sleep(5 * (k + 1))
        except Exception as e:
            time.sleep(5 * (k + 1)); msg = repr(e)
    return f"FAIL {name}: {msg}"
items = [(k, v) for k, v in prompts.items() if not only or k in only]
with ThreadPoolExecutor(int(opt("--jobs", "4"))) as ex:
    for r in ex.map(gen, items): print(r, flush=True)
