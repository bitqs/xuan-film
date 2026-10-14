# 《选》旁白：豆包语音 2.0「高冷沉稳」（和《足够震撼》、游戏论序章同一个声音），风格指令改成纪录片讲述、语速适中。
# 逐句合成到 audio/vo/<id>.wav（48 kHz 单声道），时长、有声段、逐字时间写进 work/vo.json；文字没变的句子不重做。
# 句子来自 script/script.json。密钥读 D:/Projects/ai-film/.env 的 VOLC_SPEECH_API_KEY（国内服务，不走代理）。
# 用法：python -P -E tools/tts.py [--force] [--jobs 6]
import base64, hashlib, json, sys, urllib.request, uuid, wave
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import numpy as np

EP = Path(__file__).resolve().parent.parent
ENV = Path("D:/Projects/ai-film/.env")
SR = 48000
RATE = 12  # 豆包 speech_rate：0 = 原速，100 = 2 倍；12 ≈ 1.12 倍
PUNCT = "，。：；？！、,.:;?!「」"
VOICE = dict(resource="seed-tts-2.0", speaker="zh_male_gaolengchenwen_uranus_bigtts",
             style="用冷静、克制、清楚的语气讲一个真实的故事，像纪录片旁白，吐字清晰，语速适中。")


def env() -> dict:
    return dict(l.split("=", 1) for l in ENV.read_text("utf-8").splitlines() if "=" in l and not l.startswith("#"))


KEY = env()["VOLC_SPEECH_API_KEY"]


def synth(text: str):
    rp = {"text": text, "speaker": VOICE["speaker"],
          "audio_params": {"format": "pcm", "sample_rate": SR, "enable_subtitle": True, "speech_rate": RATE},
          "additions": json.dumps({"context_texts": [VOICE["style"]]}, ensure_ascii=False)}
    req = urllib.request.Request("https://openspeech.bytedance.com/api/v3/tts/unidirectional",
                                 data=json.dumps({"user": {"uid": "xuan"}, "req_params": rp}).encode(),
                                 headers={"X-Api-Key": KEY, "X-Api-Resource-Id": VOICE["resource"],
                                          "X-Api-Request-Id": str(uuid.uuid4()), "Content-Type": "application/json"})
    pcm, words, last = b"", [], None
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=120) as r:
        for line in r:
            if not line.strip():
                continue
            j = json.loads(line)
            last = j
            if j.get("data"):
                pcm += base64.b64decode(j["data"])
            for w in (j.get("sentence") or {}).get("words") or []:
                words.append({"w": w["word"].strip(), "start": round(w["startTime"], 4), "end": round(w["endTime"], 4)})
    if not pcm or (last or {}).get("code") != 20000000:
        raise RuntimeError(f"doubao: {last}")
    return np.frombuffer(pcm[: len(pcm) // 2 * 2], dtype="<i2"), words


def job(item):
    id_, text, old, force = item
    key = hashlib.sha1(f"{VOICE}|{RATE}|{text}".encode()).hexdigest()[:12]
    wav = EP / "audio" / "vo" / f"{id_}.wav"
    if not force and old and old.get("key") == key and wav.exists():
        return old
    for attempt in range(5):
        try:
            x, words = synth(text)
            break
        except Exception as e:
            print(f"{id_} retry {attempt}: {e!r}"[:200], flush=True)
    else:
        raise SystemExit(f"tts failed: {id_}")
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(x.tobytes())
    env_ = np.convolve(np.abs(x.astype(np.float32)), np.ones(480) / 480, "same")
    on = np.where(env_ > env_.max() * .02)[0]
    r = {"id": id_, "say": text, "key": key, "dur": round(len(x) / SR, 4),
         "on": round(on[0] / SR, 4), "off": round(on[-1] / SR, 4), "words": words}
    print(f"{id_}  {r['dur']:.2f}s  {text}", flush=True)
    return r


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    force = "--force" in sys.argv
    jobs = int(sys.argv[sys.argv.index("--jobs") + 1]) if "--jobs" in sys.argv else 6
    (EP / "audio" / "vo").mkdir(parents=True, exist_ok=True)
    out = EP / "work" / "vo.json"
    old = {x["id"]: x for x in json.loads(out.read_text("utf-8"))} if out.exists() else {}
    sc = json.loads((EP / "script" / "script.json").read_text("utf-8"))
    items = [(i, t, old.get(i), force) for s in sc["sections"] for i, t, _ in s["lines"]]
    with ThreadPoolExecutor(jobs) as ex:
        res = list(ex.map(job, items))
    out.write_text(json.dumps(res, ensure_ascii=False, indent=1), "utf-8")
    tot = sum(x["dur"] for x in res)
    voiced = sum(x["off"] - x["on"] for x in res)
    chars = sum(len([c for c in x["say"] if c not in PUNCT + "　 "]) for x in res)
    print(f"total {tot:.1f}s  voiced {voiced:.1f}s  {chars} chars  {chars / voiced:.2f} 字/秒")


main()
