// 场景 E · 蓝光。全片最安静、最美的一段；moon 蓝只在这里出现。
// 0–140    two_boys：林间光束里的浮尘是书的字；「十六岁」逐字落下。
// 122–218  river_aerial：神农架航拍，书的字沿着河道流向镜头；镜头往河里扎。
// 198–354  stream_blue：清澈溪水的波光全是书里的字（顺水流、闪烁）。「有一块石头」→ 水里的字游到石头上，
//          排成书里写这块石头的那段原文；「蓝光」（拍上）石头亮起 moon 蓝，一圈光沿水面荡开，之后像呼吸；
//          「像月光石」推近：石头上正好是原文「很像月光石」五个字，随旁白一个个亮起来。←「这怎么做出来的」
// 340–458  hand_cold：指尖一碰水，字排成的水纹一圈圈荡开；「冷」：冷白的字像寒气散开（就是书里「太冷了」那句的字）。
// 444–730  stream_gray：照片在水下、模糊；「跳下水」字花溅起；「捞了上来」照片浮上来变清楚；灰白色 / 几点云母 / 没有蓝光。
// 700–880  stream_blue 去色：放回水里一圈灰水纹；「蓝光」只闪了一下就灭；配乐停半小节，水流也停住。
// 843–1068 原文 e6：水里的字升起来铺成整本书，镜头扎进第二章，那句话在书里是 moon 蓝；一个字一个字被拔出来排成大字。
// 1068–    原文 e7：结果 ← 原因 ← 证据（粒子写字 + 金色细箭头从下往上指 = 倒着找）。
import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import type {SceneMod, SceneProps} from '../core/timeline';
import {nextBeatF} from '../core/timeline';
import {Backdrop, Label, PAL, Plate, SAFE, SERIF, Title, Vignette} from '../core/look';
import {EASE, clamp01, hex, mix, prog, smooth} from '../core/anim';
import {BOOK_CHARS, findInBook} from '../core/book';
import {GlyphCanvas, GlyphLayer, MaskText, N_BOOK, camMix, camOn, camZ, hash01, maskTargets, noise3, setChar, textLayout, useGState, useImageData, usePage, useTextMask} from '../core/glyph';
import type {Cam, Img, V3} from '../core/glyph';

const N = N_BOOK;
const MOON = hex(PAL.moon);
const GOLD = hex(PAL.gold);
const HI = hex(PAL.goldHi);
const ICE: V3 = [0.86, 0.94, 1];
const PUN = /[，。、；：？！“”‘’（）《》「」『』…—·,.;:?!'"()\s\-]/;

// 照片里的位置（照片坐标 = 1080×1920 画面坐标：中心原点、y 向上）
const STONE = {x: 6, y: -34, rx: 132, ry: 80}; // stream_blue：发蓝光的石头
const FINGER = {x: -54, y: -118}; // hand_cold：指尖入水处
const RIVER_DOM: [number, number][] = [[452, 690], [440, 800], [470, 880], [560, 950], [680, 1040], [640, 1130], [590, 1230], [530, 1320], [490, 1420], [520, 1520], [600, 1650], [680, 1780], [740, 1940]];
// stream_gray 灰石头上的点（照片坐标）：标注锚点 + 云母闪光
const MICA: [number, number][] = [[60, 200], [-120, 140], [-30, 232], [112, 92], [-160, 12], [22, 42], [-70, -88]];
const ANCH = {gray: [-200, 160] as [number, number], mica: MICA[0], none: [-150, -150] as [number, number]};
// 结果 / 原因 / 证据
const WSZ = 170;
const WX = SAFE.cx - 540;
const WY = [350, 70, -210];
// 引文排版（y 向上）
const QS = 60;
const QX = SAFE.cx - 540;
const QY = 150;
// fx 粒子分段
const FX = {mote: [0, 1200], ring: [1200, 1860], frost: [1860, 3360], splash: [3360, 4860], mica: [4860, 4867]} as const;
const FXN = 4870;
const RING_N = 220;

type View = {s: number; cx: number; cy: number};
const kb = (v: View) => ({s: v.s, x: -v.s * v.cx, y: -v.s * v.cy});
const vlerp = (a: View, b: View, t: number): View => ({s: Math.exp(mix(Math.log(a.s), Math.log(b.s), t)), cx: mix(a.cx, b.cx, t), cy: mix(a.cy, b.cy, t)});
const vkeys = (f: number, keys: [number, View][], ease: (t: number) => number = EASE.inOut): View => {
  if (f <= keys[0][0]) return keys[0][1];
  for (let k = 1; k < keys.length; k++) if (f <= keys[k][0]) return vlerp(keys[k - 1][1], keys[k][1], ease((f - keys[k - 1][0]) / Math.max(1, keys[k][0] - keys[k - 1][0])));
  return keys[keys.length - 1][1];
};
const ease3 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const toDom = (v: View, p: [number, number]): [number, number] => [540 + v.s * (p[0] - v.cx), 960 - v.s * (p[1] - v.cy)];

// 溪水里一个字的位置（照片坐标）：u = 0 远处（画面上方）→ 1 近处（下方），越近越大越快
const WSC = {x: 0, y: 0, s: 0, u: 0};
const waterAt = (i: number, ft: number, P: {H1: Float32Array; H2: Float32Array; SPD: Float32Array; SZ: Float32Array}) => {
  const u = (P.H1[i] + ft * P.SPD[i]) % 1;
  const y = 1080 - 2200 * Math.pow(u, 1.25);
  const xb = (P.H2[i] - 0.5) * 1400;
  WSC.x = xb * (0.72 + 0.4 * u) - 90 * (u - 0.5) + (10 + 30 * u) * Math.sin(y / 140 + ft * 1.2 + P.H1[i] * 6.283);
  WSC.y = y;
  WSC.s = (3.4 + 9.5 * Math.pow(u, 1.5)) * P.SZ[i];
  WSC.u = u;
};
const SMP: V3 = [0, 0, 0];
const sample = (img: Img, x: number, y: number) => {
  const u = Math.min(img.w - 1, Math.max(0, Math.floor(((x + 540) / 1080) * img.w)));
  const v = Math.min(img.h - 1, Math.max(0, Math.floor(((960 - y) / 1920) * img.h)));
  const k = (v * img.w + u) * 4;
  SMP[0] = img.d[k] / 255;
  SMP[1] = img.d[k + 1] / 255;
  SMP[2] = img.d[k + 2] / 255;
  return SMP;
};

/** 标注：一根细线从石头上的点连到文字 */
const Callout: React.FC<{text: string; tx: number; ty: number; lx: number; ly: number; ax: number; ay: number; p: number; out: number; swatch?: string}> = ({text, tx, ty, lx, ly, ax, ay, p, out, swatch}) => {
  if (p <= 0.001 || out >= 0.999) return null;
  const q = EASE.out(clamp01(p * 1.4));
  const ex = mix(ax, lx, q);
  const ey = mix(ay, ly, q);
  const ta = smooth(0.45, 1, p) * (1 - out);
  return (
    <>
      <svg width={1080} height={1920} style={{position: 'absolute', left: 0, top: 0, opacity: 1 - out}}>
        <circle cx={ax} cy={ay} r={7} fill="none" stroke={PAL.goldHi} strokeWidth={2.5} opacity={Math.min(1, p * 3)} />
        <line x1={ax} y1={ay} x2={ex} y2={ey} stroke={PAL.goldHi} strokeWidth={2.5} strokeLinecap="round" opacity={0.9} />
      </svg>
      <div style={{position: 'absolute', left: tx, top: ty, opacity: ta, transform: `translateY(${(1 - ta) * 10}px)`, fontFamily: SERIF, fontSize: 50, color: PAL.cream, letterSpacing: '0.08em', textShadow: '0 2px 14px rgba(0,0,0,.85), 0 0 3px rgba(0,0,0,.6)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 14}}>
        {swatch ? <span style={{display: 'inline-block', width: 22, height: 22, borderRadius: 11, background: swatch, boxShadow: '0 0 10px rgba(0,0,0,.6)'}} /> : null}
        {text}
      </div>
    </>
  );
};

/** 往上指的金色细箭头（y0 下端 → y1 上端，DOM 坐标），p = 画出进度 */
const UpArrow: React.FC<{x: number; y0: number; y1: number; p: number; o: number}> = ({x, y0, y1, p, o}) => {
  if (p <= 0.001) return null;
  const yy = mix(y0, y1, EASE.out(p));
  const head = smooth(0.7, 1, p);
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', left: 0, top: 0, opacity: o, filter: 'drop-shadow(0 0 6px rgba(255,200,120,.55))'}}>
      <line x1={x} y1={y0} x2={x} y2={yy} stroke={PAL.goldHi} strokeWidth={4} strokeLinecap="round" />
      <polyline points={`${x - 16},${y1 + 18} ${x},${y1} ${x + 16},${y1 + 18}`} fill="none" stroke={PAL.goldHi} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" opacity={head} />
    </svg>
  );
};

const C: React.FC<SceneProps> = ({f, def, at, atc}) => {
  const wat = useGState();
  const fx = useGState(FXN);
  const page = usePage();
  const imgBlue = useImageData('img/stream_blue.jpg', 270, 480);
  const mW1 = useTextMask('结果', {size: WSZ, x: WX, y: WY[0]});
  const mW2 = useTextMask('原因', {size: WSZ, x: WX, y: WY[1]});
  const mW3 = useTextMask('证据', {size: WSZ, x: WX, y: WY[2]});

  // ---------------- 时间（全部来自旁白）
  const K = useMemo(() => {
    const blue = at('蓝光', 0, 0, 'e2');
    const blue5 = at('蓝光', 0, 0, 'e5');
    const stop = nextBeatF(def, blue5); // 配乐「蓝光，也没有回来」停半小节（2 拍）
    return {
      sixteen: atc('十六岁'),
      shen: atc('神农架'),
      clear: at('清澈'),
      stone: at('一块石头'),
      blue,
      blueHit: nextBeatF(def, blue),
      like: atc('像月光石'),
      touch: at('捞', 0, 0, 'e3'),
      cold: at('冷'),
      back: at('缩回'),
      day2: at('第二天'),
      jump: at('下水'),
      lift: at('捞了上来'),
      gray: at('灰白色'),
      mica: at('几点云母'),
      noBlue: at('没有蓝光'),
      putBack: at('放回水里'),
      water5: at('水里', 0, 0, 'e5'),
      blue5,
      stop,
      res: stop + 45,
      wrote: at('后来写'),
      q6: atc('那道蓝光，好像从来就不在石头上，也不在水里，它只在我心里'),
      heart: at('心', 0, 0, 'e6'),
      w: [at('结果'), at('原因'), at('证据')],
    };
  }, [at, atc, def]);
  const LIFT0 = K.wrote + 81; // 引文开始被拔出书页（镜头同时拉回）
  const QOUT0 = K.w[0] - 12; // 引文淡出（「结果」开口前一点）
  const flyLen = (ls: number) => (ls > LIFT0 + 40 ? 16 : 26);

  // 水流时间：配乐停的那半小节，水也停
  const flowT = useMemo(() => {
    const arr = new Float32Array(1500);
    let acc = 0;
    for (let k = 0; k < arr.length; k++) {
      arr[k] = acc;
      const sp = 1 - smooth(K.stop - 8, K.stop + 1, k) * (1 - smooth(K.res, K.res + 36, k));
      acc += sp / 30;
    }
    return arr;
  }, [K]);

  // ---------------- 每字固定参数
  const P = useMemo(() => {
    const H1 = new Float32Array(N);
    const H2 = new Float32Array(N);
    const H3 = new Float32Array(N);
    const SPD = new Float32Array(N);
    const SZ = new Float32Array(N);
    const RK = new Float32Array(N);
    const RIV = new Uint8Array(N);
    const ROT = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      H1[i] = hash01(i, 1);
      H2[i] = hash01(i, 2);
      H3[i] = hash01(i, 3);
      SPD[i] = 0.04 + 0.025 * hash01(i, 4);
      const h = hash01(i, 5);
      SZ[i] = 0.72 + 0.6 * h * h;
      RK[i] = hash01(i, 6);
      RIV[i] = hash01(i, 41) < 0.24 ? 1 : 0;
      ROT[i] = (hash01(i, 7) - 0.5) * 0.7;
    }
    return {H1, H2, H3, SPD, SZ, RK, RIV, ROT};
  }, []);

  // 石头上的原文：书里写这块石头的那段，排成 7 行贴在石头上，中间一行正好是「很像月光石」
  const SL = useMemo(() => {
    const cell = 22;
    const slots: [number, number][] = [];
    const rows: {s0: number; n: number}[] = [];
    const nr = Math.floor((2 * STONE.ry) / cell);
    for (let r = 0; r < nr; r++) {
      const y = ((nr - 1) / 2 - r) * cell;
      const half = STONE.rx * Math.sqrt(Math.max(0, 1 - (y / STONE.ry) ** 2)) - cell * 0.3;
      const n = Math.max(0, Math.floor((2 * half) / cell));
      rows.push({s0: slots.length, n});
      for (let c = 0; c < n; c++) {
        const x = (c - (n - 1) / 2) * cell;
        slots.push([STONE.x + x, STONE.y + y + 6 * (1 - (x / STONE.rx) ** 2)]);
      }
    }
    const mid = rows[Math.floor(rows.length / 2)];
    const moonAt = findInBook('很像月光石').start;
    const start = moonAt - (mid.s0 + Math.floor(mid.n / 2) - 2);
    return {cell, slots, start, n: slots.length, moonAt};
  }, []);

  // 河道（航拍照片坐标）
  const RV = useMemo(() => {
    const pts = RIVER_DOM.map(([x, y]) => [x - 540, 960 - y] as [number, number]);
    const L = [0];
    for (let k = 1; k < pts.length; k++) L.push(L[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    return {pts, L, total: L[L.length - 1]};
  }, []);
  const RVO = {x: 0, y: 0, nx: 0, ny: 0};
  const riverAt = (s: number) => {
    const d = s * RV.total;
    let k = 1;
    while (k < RV.pts.length - 1 && RV.L[k] < d) k++;
    const [x0, y0] = RV.pts[k - 1];
    const [x1, y1] = RV.pts[k];
    const tt = clamp01((d - RV.L[k - 1]) / Math.max(1, RV.L[k] - RV.L[k - 1]));
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    RVO.x = mix(x0, x1, tt);
    RVO.y = mix(y0, y1, tt);
    RVO.nx = -(y1 - y0) / len;
    RVO.ny = (x1 - x0) / len;
  };

  // 引文 e6：书里那句话的字（含书里的标点），排成 4 行
  const Q = useMemo(() => {
    const r = findInBook('那道蓝光，好像从来就不在石头上，也不在水里，它只在我心里');
    const chars = BOOK_CHARS.slice(r.start, r.end);
    const lines: number[][] = [[]];
    chars.forEach((c, k) => {
      lines[lines.length - 1].push(k);
      if (c === '，' && k < chars.length - 1) lines.push([]);
    });
    const pos = new Float32Array(chars.length * 3);
    const lh = QS * 1.62;
    lines.forEach((ln, li) => {
      const s = ln.map((k) => chars[k]).join('');
      const y = QY + ((lines.length - 1) / 2 - li) * lh;
      const trail = PUN.test(s[s.length - 1]) ? QS / 2 : 0; // 行尾逗号不算进居中
      const tl = textLayout(s, {x: QX + trail, y, size: QS});
      ln.forEach((k, j) => {
        pos[k * 3] = tl.pos[j * 3];
        pos[k * 3 + 1] = tl.pos[j * 3 + 1];
      });
    });
    let sx = 0;
    let sy = 0;
    for (let i = r.start; i < r.end; i++) {
      const [x, y] = page.xy(i);
      sx += x;
      sy += y;
    }
    return {r, chars, pos, n: chars.length, cx: sx / chars.length, cy: sy / chars.length};
  }, [page]);
  // 每个字被念到的帧
  const QF = useMemo(() => {
    const said = [...'那道蓝光，好像从来就不在石头上，也不在水里，它只在我心里'];
    const fr = K.q6.filter((_, k) => !PUN.test(said[k]));
    const out: number[] = [];
    let j = 0;
    let last = K.q6[0];
    Q.chars.forEach((c) => {
      if (PUN.test(c)) out.push(last + 3);
      else {
        last = fr[Math.min(j, fr.length - 1)];
        j++;
        out.push(last);
      }
    });
    return out;
  }, [K, Q]);

  // 三个词的粒子：书页里约 27% 的字，分三组飞进「结果」「原因」「证据」的笔画
  const WT = useMemo(() => {
    if (!mW1 || !mW2 || !mW3) return null;
    const grp = new Uint8Array(N);
    const members: number[][] = [[], [], []];
    for (let i = 0; i < N; i++) {
      if (i >= Q.r.start && i < Q.r.end) continue;
      if (hash01(i, 31) < 0.27) {
        const g = Math.min(2, Math.floor(hash01(i, 32) * 3));
        grp[i] = g + 1;
        members[g].push(i);
      }
    }
    const tgt = new Float32Array(N * 3);
    [mW1, mW2, mW3].forEach((m, g) => {
      const t = maskTargets(m, members[g].length, 17 + g, 1.1);
      members[g].forEach((i, k) => {
        tgt[i * 3] = t[k * 3];
        tgt[i * 3 + 1] = t[k * 3 + 1];
      });
    });
    return {grp, tgt};
  }, [mW1, mW2, mW3, Q]);

  // fx 的字：寒气 = 书里「太冷了」那句，水花 = 「笑着一步跳下水中」，云母 = 「细细的云母片，闪着一点碎光」
  useMemo(() => {
    const put = (from: number, to: number, q: string) => {
      const r = findInBook(q);
      const cs = BOOK_CHARS.slice(r.start, r.end).filter((c) => !PUN.test(c));
      for (let i = from; i < to; i++) setChar(fx, i, cs[(i - from) % cs.length]);
    };
    put(FX.frost[0], FX.frost[1], '刚一碰到水，我就立刻缩了回来，太冷了');
    put(FX.splash[0], FX.splash[1], '笑着一步跳下水中');
    put(FX.mica[0], FX.mica[1], '细细的云母片，闪着一点碎光');
  }, [fx]);

  if (!imgBlue || !WT) return <Backdrop />;

  const t = f / 30;
  const ft = flowT[Math.max(0, Math.min(flowT.length - 1, Math.round(f)))];

  // ---------------- 各照片的镜头（照片 Ken Burns 和字用同一个 view，严丝合缝）
  const vT = vkeys(f, [[0, {s: 1.13, cx: 28, cy: 50}], [150, {s: 1.03, cx: 8, cy: 12}]], EASE.linear);
  const vA = vkeys(f, [[122, {s: 1.04, cx: 0, cy: 60}], [218, {s: 1.9, cx: 40, cy: -160}]], EASE.in);
  const vB = vkeys(f, [
    [198, {s: 1.55, cx: 0, cy: 300}],
    [264, {s: 1.17, cx: 4, cy: 12}],
    [K.blueHit, {s: 1.13, cx: 6, cy: -8}],
    [K.like[0] - 6, {s: 1.14, cx: 6, cy: -14}],
    [K.like[0] + 26, {s: 2.0, cx: STONE.x, cy: STONE.y}],
    [362, {s: 2.08, cx: STONE.x - 4, cy: STONE.y - 4}],
  ]);
  const vH = vkeys(f, [[338, {s: 1.1, cx: 0, cy: -40}], [K.back, {s: 1.035, cx: 0, cy: -60}], [K.back + 22, {s: 1.0, cx: 0, cy: -112}], [462, {s: 0.995, cx: 0, cy: -118}]]);
  const vG = vkeys(f, [
    [444, {s: 1.14, cx: 0, cy: 250}],
    [K.lift - 4, {s: 1.12, cx: 0, cy: 230}],
    [K.lift + 26, {s: 1.05, cx: 0, cy: 10}],
    [K.putBack - 10, {s: 1.1, cx: -10, cy: 22}],
    [K.putBack + 18, {s: 1.16, cx: -10, cy: 340}],
  ]);
  const vB2: View = {s: 1.15 + 0.012 * (ft - flowT[700]), cx: 6, cy: -18};

  // 蓝光强度（e2）：石头被认出来时淡淡亮起，拍上点亮，然后呼吸
  const breath = 0.84 + 0.16 * Math.sin(((f - K.blueHit) / 30) * 2.4);
  const Lb = (0.3 * smooth(K.stone - 2, K.blue + 4, f) + 0.7 * smooth(K.blueHit - 5, K.blueHit + 7, f)) * breath * (1 - smooth(342, 356, f));
  const ringAge = f - K.blueHit;
  const ringR = 30 + ringAge * 15;
  const ringAmp = ringAge >= 0 ? Math.exp(-ringAge / 24) : 0;

  // ================================================================ wat：书的字
  let watOn = false;
  if (f >= 118 && f < 360) {
    watOn = true;
    const rivA = smooth(122, 140, f) * (1 - smooth(204, 218, f));
    const strA = smooth(200, 216, f) * (1 - smooth(340, 354, f));
    const qR = prog(f, 196, 222, EASE.linear);
    const gp = prog(f, K.stone - 4, K.blue + 10, EASE.linear);
    const litAny = smooth(K.like[0] - 6, K.like[0] + 4, f);
    for (let i = 0; i < N; i++) {
      const k3 = i * 3;
      const k4 = i * 4;
      waterAt(i, ft, P);
      let x = WSC.x;
      let y = WSC.y;
      let sz = WSC.s;
      const u = WSC.u;
      const glint = smooth(0.15, 0.7, noise3(x / 55, (y + ft * 60) / 55, ft * 0.35, 21));
      const c = sample(imgBlue, x, y);
      let r = Math.min(1, c[0] * 1.35 + 0.12);
      let g = Math.min(1, c[1] * 1.35 + 0.12);
      let b = Math.min(1, c[2] * 1.35 + 0.14);
      const dd = Math.hypot(x - STONE.x, (y - STONE.y) / 0.62);
      let bk = Lb * Math.exp(-dd / 200) * (0.55 + 0.45 * Math.sin(dd / 26 - t * 3.2)) + ringAmp * Math.exp(-(((dd - ringR) / 42) ** 2));
      bk = Math.min(1, bk);
      const mb = Math.min(1, bk * 1.4);
      r = mix(r, MOON[0], mb);
      g = mix(g, MOON[1], mb);
      b = mix(b, MOON[2], mb);
      let a = (0.03 + 0.5 * glint * (0.35 + 0.65 * u) + 0.34 * bk) * strA;
      let halo = 0.35 + 1.3 * bk;
      sz *= 1 + 0.25 * bk;
      let rot = P.ROT[i] + 0.25 * Math.sin(ft * 0.9 + P.H1[i] * 9);
      // 石头上的原文：从水里游过来贴到石头上
      const sj = i - SL.start;
      if (sj >= 0 && sj < SL.n) {
        const q = ease3(gp * 1.7 - 0.7 * P.RK[i]);
        const [tx, ty] = SL.slots[sj];
        const arc = Math.sin(Math.PI * q) * 140 * (P.H2[i] - 0.5);
        x = mix(x, tx, q) + arc;
        y = mix(y, ty, q) - arc * 0.4;
        const mi = i - SL.moonAt; // 「很像月光石」随旁白亮
        const lit = mi >= 0 && mi < 5 ? smooth(0, 6, f - (mi === 0 ? K.like[0] - 3 : K.like[mi - 1]) + 2) : 0;
        const on = 0.35 + 0.65 * Math.min(1, Lb / 0.84);
        const wm = 0.85 * lit;
        r = mix(r, mix(mix(MOON[0], ICE[0], 0.25 * on), 1, wm), q);
        g = mix(g, mix(mix(MOON[1], ICE[1], 0.25 * on), 1, wm), q);
        b = mix(b, mix(mix(MOON[2], ICE[2], 0.25 * on), 1, wm), q);
        a = mix(a, Math.min(1, (0.28 + 0.5 * on) * (1 - 0.45 * litAny * (1 - lit)) + 0.4 * lit) * strA, q);
        halo = mix(halo, 0.2 + 0.45 * on + 0.5 * lit, q);
        sz = mix(sz, SL.cell * 0.9 * (1 + 0.3 * lit), q);
        rot = mix(rot, 0, q);
      }
      // 航拍：一部分字沿河道流，镜头扎进河里时散成溪水
      let X = vB.s * (x - vB.cx);
      let Y = vB.s * (y - vB.cy);
      let S = sz * vB.s;
      if (P.RIV[i] && qR < 1) {
        const s = (P.H1[i] + ft * 0.05) % 1;
        riverAt(s);
        const lat = (P.H2[i] - 0.5) * (14 + 120 * s);
        const rx = RVO.x + RVO.nx * lat;
        const ry = RVO.y + RVO.ny * lat;
        const q = ease3(qR * 1.5 - 0.5 * P.RK[i]);
        X = mix(vA.s * (rx - vA.cx), X, q);
        Y = mix(vA.s * (ry - vA.cy), Y, q);
        S = mix((2.6 + 7 * s) * vA.s * P.SZ[i], S, q);
        const ra = (0.3 + 0.55 * glint) * rivA;
        a = mix(ra, a, q);
        r = mix(mix(GOLD[0], ICE[0], 0.35), r, q);
        g = mix(mix(GOLD[1], ICE[1], 0.35), g, q);
        b = mix(mix(GOLD[2], ICE[2], 0.35), b, q);
        halo = mix(0.8, halo, q);
      }
      wat.pos[k3] = X;
      wat.pos[k3 + 1] = Y;
      wat.pos[k3 + 2] = 0;
      wat.size[i] = S;
      wat.rot[i] = rot;
      wat.halo[i] = halo;
      wat.col[k4] = r;
      wat.col[k4 + 1] = g;
      wat.col[k4 + 2] = b;
      wat.col[k4 + 3] = a;
    }
  } else if (f >= 700) {
    watOn = true;
    const grayA = smooth(708, 726, f);
    const pg = prog(f, K.wrote - 4, K.wrote + 36, EASE.linear);
    const ripAge = f - K.water5;
    const ripR = 20 + ripAge * 8;
    const ripAmp = ripAge >= 0 ? 0.55 * Math.exp(-ripAge / 26) : 0;
    const ghost = smooth(K.blue5 - 2, K.blue5 + 4, f) * (1 - smooth(K.blue5 + 6, K.stop + 2, f));
    const near = smooth(K.wrote + 20, K.wrote + 46, f) * (1 - smooth(LIFT0, LIFT0 + 36, f));
    const pageDim = (1 - 0.76 * smooth(LIFT0 + 4, LIFT0 + 50, f)) * (1 - 0.75 * smooth(1062, 1110, f));
    const qBlue = smooth(K.wrote + 8, K.wrote + 32, f);
    const qOut = smooth(QOUT0, QOUT0 + 18, f);
    const cell = page.cell * 0.98;
    for (let i = 0; i < N; i++) {
      const k3 = i * 3;
      const k4 = i * 4;
      const h = P.H3[i];
      const px = page.pos[k3];
      const py = page.pos[k3 + 1];
      let x = px;
      let y = py;
      let z = 0;
      let sz = cell;
      let r = GOLD[0];
      let g = GOLD[1];
      let b = GOLD[2];
      const pageA = (0.3 + 0.22 * h) * (1 - 0.3 * near);
      let a = pageA;
      let halo = 0.6 + 0.8 * h;
      let rot = 0;
      if (pg < 1) {
        // 灰了的溪水（去色照片上的字），石头上的原文也灰了
        waterAt(i, ft, P);
        let wx = WSC.x;
        let wy = WSC.y;
        let ws = WSC.s;
        const glint = smooth(0.15, 0.7, noise3(wx / 55, (wy + ft * 60) / 55, ft * 0.35, 21));
        const c = sample(imgBlue, wx, wy);
        const l = Math.min(1, (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) * 1.15 + 0.1);
        const dd = Math.hypot(wx - STONE.x, (wy - STONE.y) / 0.62);
        const rip = ripAmp * Math.exp(-(((dd - ripR) / 36) ** 2));
        let wa = (0.03 + 0.42 * glint * (0.35 + 0.65 * WSC.u) + 0.5 * rip) * grayA;
        let wr = l;
        let wg = l;
        let wb = l * 1.02;
        let wh = 0.3 + rip * 2;
        let wrot = P.ROT[i] + 0.25 * Math.sin(ft * 0.9 + P.H1[i] * 9);
        const sj = i - SL.start;
        if (sj >= 0 && sj < SL.n) {
          [wx, wy] = SL.slots[sj];
          ws = SL.cell * 0.9;
          wr = mix(0.62, MOON[0], ghost * 0.6);
          wg = mix(0.63, MOON[1], ghost * 0.6);
          wb = mix(0.65, MOON[2], ghost * 0.6);
          wa = (0.26 + 0.2 * ghost + 0.4 * ripAmp) * grayA;
          wh = 0.4 + 1.2 * ghost;
          wrot = 0;
        }
        const WX_ = vB2.s * (wx - vB2.cx);
        const WY_ = vB2.s * (wy - vB2.cy);
        const q = ease3(pg * 1.7 - 0.7 * P.RK[i]);
        x = mix(WX_, px, q);
        y = mix(WY_, py, q);
        z = 380 * Math.sin(Math.PI * q) * (0.3 + P.H2[i]);
        sz = mix(ws * vB2.s, cell, q);
        a = mix(wa, pageA, q);
        r = mix(wr, GOLD[0], q);
        g = mix(wg, GOLD[1], q);
        b = mix(wb, GOLD[2], q);
        halo = mix(wh, halo, q);
        rot = mix(wrot, 0, q);
      }
      const qi = i - Q.r.start;
      if (qi >= 0 && qi < Q.n) {
        // 那句原文：在书里是 moon 蓝，被念到时更亮，然后被拔出来排成大字
        const said = QF[qi];
        const lit = smooth(said - 2, said + 6, f);
        r = mix(r, mix(MOON[0], ICE[0], 0.5 * lit), qBlue);
        g = mix(g, mix(MOON[1], ICE[1], 0.5 * lit), qBlue);
        b = mix(b, mix(MOON[2], ICE[2], 0.5 * lit), qBlue);
        a = mix(a, 0.75 + 0.25 * lit, qBlue);
        halo = mix(halo, 0.45 + 0.9 * lit, qBlue);
        sz *= 1 + 0.12 * lit * qBlue;
        const ls = Math.max(LIFT0 + qi * 1.2, said + 2);
        const qf = ease3((f - ls) / flyLen(ls));
        if (qf > 0) {
          x = mix(x, Q.pos[qi * 3], qf);
          y = mix(y, Q.pos[qi * 3 + 1], qf);
          z = 240 * Math.sin(Math.PI * qf);
          sz = mix(sz, QS, qf);
          const fl = flyLen(ls);
          const dom = smooth(Math.max(ls + fl - 8, LIFT0 + 40), Math.max(ls + fl + 4, LIFT0 + 52), f);
          a *= 1 - 0.97 * dom;
          halo = mix(halo, 1.6, qf);
          const heart = qi === Q.n - 2 ? Math.exp(-Math.max(0, f - K.heart) / 18) * smooth(K.heart - 3, K.heart + 2, f) : 0;
          halo *= 1 + 2 * heart;
        }
        a *= 1 - qOut;
      } else {
        a *= pageDim;
        const gi = WT.grp[i];
        if (gi) {
          // 三个词：从书页飞进笔画
          const wf = K.w[gi - 1] - 10;
          const qw = ease3(((f - wf) / 28) * 1.5 - 0.5 * P.RK[i]);
          if (qw > 0) {
            const tx = WT.tgt[k3];
            const ty = WT.tgt[k3 + 1];
            const arc = Math.sin(Math.PI * qw);
            x = mix(x, tx, qw) + arc * 160 * (P.H2[i] - 0.5);
            y = mix(y, ty, qw);
            z = mix(z, 0, qw) + arc * 300 * (0.4 + P.H1[i]);
            sz = mix(sz, 4.6 + 3.4 * h * h * h, qw);
            const land = smooth(wf + 20, wf + 44, f);
            const pulse = 0.9 + 0.1 * Math.sin(t * 2 + h * 6.28);
            a = mix(a, (0.42 + 0.3 * h) * pulse, qw);
            r = mix(r, mix(GOLD[0], HI[0], 0.6), qw);
            g = mix(g, mix(GOLD[1], HI[1], 0.6), qw);
            b = mix(b, mix(GOLD[2], HI[2], 0.6), qw);
            halo = mix(halo, 1 + 2.5 * Math.exp(-Math.max(0, f - wf - 26) / 12) * land, qw);
          }
        }
      }
      wat.pos[k3] = x;
      wat.pos[k3 + 1] = y;
      wat.pos[k3 + 2] = z;
      wat.size[i] = sz;
      wat.rot[i] = rot;
      wat.halo[i] = halo;
      wat.col[k4] = r;
      wat.col[k4 + 1] = g;
      wat.col[k4 + 2] = b;
      wat.col[k4 + 3] = a;
    }
  }

  // ================================================================ fx：浮尘 / 水纹 / 寒气 / 水花 / 云母
  const fxOn = f < 150 || (f >= 360 && f < 560) || (f >= 600 && f < 736);
  if (fxOn) {
    fx.col.fill(0);
    const moteA = 1 - smooth(118, 140, f);
    if (moteA > 0) {
      for (let i = FX.mote[0]; i < FX.mote[1]; i++) {
        const h = hash01(i, 51);
        const h2 = hash01(i, 52);
        const h3 = hash01(i, 53);
        const y = -520 + ((h2 + t * (0.012 + 0.02 * h3)) % 1) * 1560;
        const x = (h - 0.5) * 1180 + 26 * Math.sin(t * 0.4 + h * 20);
        const beam = Math.exp(-(((x - 40 + (y - 600) * 0.35) / 240) ** 2));
        const tw = 0.6 + 0.4 * Math.sin(t * 2.1 + h * 40);
        fx.pos[i * 3] = x;
        fx.pos[i * 3 + 1] = y;
        fx.pos[i * 3 + 2] = 0;
        fx.size[i] = (5 + 9 * h3 * h3) * vT.s;
        fx.rot[i] = (h2 - 0.5) * 0.8 + 0.3 * Math.sin(t * 0.5 + h * 7);
        fx.halo[i] = 0.8 + 1.4 * beam;
        fx.col[i * 4] = mix(GOLD[0], HI[0], beam);
        fx.col[i * 4 + 1] = mix(GOLD[1], HI[1], beam);
        fx.col[i * 4 + 2] = mix(GOLD[2], HI[2], beam);
        fx.col[i * 4 + 3] = (0.1 + 0.5 * beam) * tw * moteA;
      }
    }
    const handA = smooth(342, 356, f) * (1 - smooth(444, 458, f));
    if (handA > 0) {
      // 水纹：三圈，从指尖荡开（照片是俯视斜看，圈是扁的）
      for (let j = 0; j < 3 * RING_N; j++) {
        const i = FX.ring[0] + j;
        const ring = Math.floor(j / RING_N);
        const age = f - (K.touch + ring * 13);
        if (age < 0) continue;
        const R = 16 + 200 * (1 - Math.exp(-age / 26));
        const th = ((j % RING_N) / RING_N) * Math.PI * 2 + hash01(j, 61) * 0.04;
        const xp = FINGER.x + R * Math.cos(th);
        const yp = FINGER.y + R * 0.34 * Math.sin(th);
        fx.pos[i * 3] = vH.s * (xp - vH.cx);
        fx.pos[i * 3 + 1] = vH.s * (yp - vH.cy);
        fx.pos[i * 3 + 2] = 0;
        fx.size[i] = 9 * vH.s;
        fx.rot[i] = Math.atan2(0.34 * Math.cos(th), -Math.sin(th));
        fx.halo[i] = 1;
        fx.col[i * 4] = ICE[0];
        fx.col[i * 4 + 1] = ICE[1];
        fx.col[i * 4 + 2] = ICE[2];
        fx.col[i * 4 + 3] = 0.5 * Math.exp(-age / 40) * smooth(0, 5, age) * handA;
      }
      // 寒气：「冷」的一瞬间，冷白的字从指尖散开、往上飘；「缩回」时往回收一点
      const age = (f - K.cold) / 30;
      if (age >= 0) {
        const back = smooth(K.back, K.back + 22, f) * 0.3;
        for (let i = FX.frost[0]; i < FX.frost[0] + 800; i++) {
          const h = hash01(i, 71);
          const h2 = hash01(i, 72);
          const h3 = hash01(i, 73);
          const ang = Math.PI * (0.04 + 0.92 * h);
          const sp = 260 + 700 * h2 * h2;
          const d = 30 + 40 * h3 + sp * 0.4 * (1 - Math.exp(-age / 0.4));
          let x = FINGER.x + Math.cos(ang) * d * 1.3 + 22 * noise3(i * 0.13, age * 0.8, 0, 7);
          let y = FINGER.y + Math.sin(ang) * d * 0.9 + 46 * age;
          x = mix(x, FINGER.x, back);
          y = mix(y, FINGER.y, back);
          fx.pos[i * 3] = vH.s * (x - vH.cx);
          fx.pos[i * 3 + 1] = vH.s * (y - vH.cy);
          fx.pos[i * 3 + 2] = 0;
          fx.size[i] = (6 + 10 * hash01(i, 74) ** 2) * vH.s;
          fx.rot[i] = (h - 0.5) * 2 + age * (h2 - 0.5) * 2;
          fx.halo[i] = 0.5;
          const m = 0.35 * h3;
          fx.col[i * 4] = mix(ICE[0], MOON[0], m);
          fx.col[i * 4 + 1] = mix(ICE[1], MOON[1], m);
          fx.col[i * 4 + 2] = mix(ICE[2], MOON[2], m);
          fx.col[i * 4 + 3] = 0.6 * Math.exp(-age / 0.9) * smooth(0, 0.12, age) * handA;
        }
      }
    }
    // 水花：朋友跳下水
    const sAge0 = (f - (K.jump + 2)) / 30;
    if (sAge0 >= 0 && sAge0 < 1.6) {
      for (let i = FX.splash[0]; i < FX.splash[0] + 520; i++) {
        const h = hash01(i, 81);
        const h2 = hash01(i, 82);
        const h3 = hash01(i, 83);
        const sAge = sAge0 - 0.14 * hash01(i, 84);
        if (sAge <= 0) continue;
        const vx = (h - 0.5) * 520 + (h3 - 0.5) * 200;
        const vy = 850 + 950 * h2;
        fx.pos[i * 3] = (h - 0.5) * 900 - 40 + vx * sAge;
        fx.pos[i * 3 + 1] = -1080 + vy * sAge - 1500 * sAge * sAge;
        fx.pos[i * 3 + 2] = 0;
        fx.size[i] = 10 + 22 * h3 * h3;
        fx.rot[i] = (h2 - 0.5) * 3 + sAge * (h - 0.5) * 6;
        fx.halo[i] = 0.8;
        fx.col[i * 4] = ICE[0];
        fx.col[i * 4 + 1] = ICE[1];
        fx.col[i * 4 + 2] = ICE[2];
        fx.col[i * 4 + 3] = 0.85 * (1 - smooth(0.55, 1.15, sAge));
      }
    }
    // 云母：几点碎光（「几点云母」时一颗颗亮）
    const micaA = smooth(K.mica - 4, K.mica + 4, f) * (1 - smooth(K.putBack - 4, K.putBack + 14, f));
    if (micaA > 0) {
      for (let j = 0; j < MICA.length; j++) {
        const i = FX.mica[0] + j;
        const on = smooth(K.mica + j * 4, K.mica + j * 4 + 5, f);
        const tw = 0.55 + 0.45 * Math.sin(t * 5 + j * 2.1);
        fx.pos[i * 3] = vG.s * (MICA[j][0] - vG.cx);
        fx.pos[i * 3 + 1] = vG.s * (MICA[j][1] - vG.cy);
        fx.pos[i * 3 + 2] = 0;
        fx.size[i] = 22 * vG.s * (0.85 + 0.3 * tw);
        fx.rot[i] = 0.2 * Math.sin(t + j);
        fx.halo[i] = 2.5 + 2 * tw;
        fx.col[i * 4] = 1;
        fx.col[i * 4 + 1] = 0.97;
        fx.col[i * 4 + 2] = 0.9;
        fx.col[i * 4 + 3] = micaA * on * (0.55 + 0.45 * tw);
      }
    }
  }

  // ---------------- 镜头（e6 起才动；之前字和照片同一个 view，镜头不动）
  const full: Cam = {pos: [0, 0, camZ()]};
  const cQ = camOn(Q.cx + (540 - SAFE.cx) * (page.cell / 30), Q.cy - 30, page.cell, 30);
  const seq: [number, Cam][] = [
    [0, full],
    [K.wrote + 20, full],
    [K.wrote + 46, cQ],
    [LIFT0, cQ],
    [LIFT0 + 40, full],
  ];
  let cam = full;
  for (let k = 1; k < seq.length; k++) {
    if (f <= seq[k][0]) {
      const [f0, c0] = seq[k - 1];
      const [f1, c1] = seq[k];
      cam = camMix(c0, c1, EASE.inOut(clamp01((f - f0) / Math.max(1, f1 - f0))));
      break;
    }
    cam = seq[k][1];
  }

  // ---------------- 照片
  const oT = f < 142 ? 1 : 0;
  const oA = smooth(122, 140, f) * (f < 220 ? 1 : 0);
  const oB = smooth(198, 216, f) * (f < 358 ? 1 : 0);
  const oH = smooth(340, 354, f) * (f < 460 ? 1 : 0);
  const oG = smooth(444, 458, f) * (f < 732 ? 1 : 0);
  const oB2 = smooth(708, 728, f) * (1 - smooth(K.wrote - 2, K.wrote + 30, f));
  const gLift = smooth(K.lift - 2, K.lift + 20, f) * (1 - smooth(K.putBack - 6, K.putBack + 14, f));
  const [stX, stY] = toDom(vB, [STONE.x, STONE.y]);
  const glowR = 300 * vB.s * (0.92 + 0.08 * breath);
  const shadeA = smooth(K.stone + 4, K.blue + 10, f);
  const litMask = `radial-gradient(ellipse ${glowR * 1.1}px ${glowR * 0.75}px at ${stX}px ${stY}px, #000 0%, rgba(0,0,0,.85) 35%, rgba(0,0,0,0) 100%)`;

  // ---------------- DOM 叠层
  const aiA = 1 - smooth(K.wrote - 2, K.wrote + 24, f);
  const stoneSrc = smooth(K.like[0] - 4, K.like[0] + 8, f) * (1 - smooth(340, 352, f));
  const srcA = smooth(K.wrote + 26, K.wrote + 40, f);
  const qOutD = smooth(QOUT0, QOUT0 + 18, f);
  const day2A = smooth(K.day2 - 2, K.day2 + 10, f) * (1 - smooth(K.lift + 10, K.lift + 24, f));
  const call = (fr: number) => prog(f, fr - 3, fr + 14, EASE.linear);
  const callOut = smooth(K.putBack - 8, K.putBack + 6, f);
  const aG = (p: [number, number]) => toDom(vG, p);
  const [g1x, g1y] = aG(ANCH.gray);
  const [g2x, g2y] = aG(ANCH.mica);
  const [g3x, g3y] = aG(ANCH.none);
  const wordA = (k: number) => smooth(K.w[k] + 6, K.w[k] + 30, f);
  const arrow1 = prog(f, K.w[1] + 10, K.w[1] + 26, EASE.linear);
  const arrow2 = prog(f, K.w[2] + 10, K.w[2] + 26, EASE.linear);
  const wy = WY.map((y) => 960 - y);

  return (
    <AbsoluteFill>
      <Backdrop light={[0.5, 0.45]} />
      {oT > 0 ? <Plate src="img/two_boys.jpg" from={kb(vT)} to={kb(vT)} grade="saturate(.85) brightness(.8) sepia(.12)" /> : null}
      {oA > 0 ? <Plate src="img/river_aerial.jpg" from={kb(vA)} to={kb(vA)} opacity={oA} grade="saturate(.9) brightness(.86)" /> : null}
      {oB > 0 ? (
        <>
          <Plate src="img/stream_blue.jpg" from={kb(vB)} to={kb(vB)} opacity={oB} grade="saturate(.42) brightness(.8)" />
          <Plate src="img/stream_blue.jpg" from={kb(vB)} to={kb(vB)} opacity={oB * Math.min(1, Lb * 1.15)} grade="saturate(1.6) brightness(.98)" style={{maskImage: litMask, WebkitMaskImage: litMask}} />
          <AbsoluteFill style={{opacity: oB * shadeA, background: `radial-gradient(ellipse ${STONE.rx * 1.25 * vB.s}px ${STONE.ry * 1.3 * vB.s}px at ${stX}px ${stY}px, rgba(3,10,26,.72) 0%, rgba(3,10,26,.5) 55%, rgba(3,10,26,0) 100%)`}} />
          <AbsoluteFill style={{opacity: oB * Lb, mixBlendMode: 'screen', background: `radial-gradient(ellipse ${glowR}px ${glowR * 0.7}px at ${stX}px ${stY}px, rgba(156,211,255,.26) 0%, rgba(120,180,255,.1) 40%, rgba(0,0,0,0) 100%)`}} />
        </>
      ) : null}
      {oH > 0 ? <Plate src="img/hand_cold.jpg" from={kb(vH)} to={kb(vH)} opacity={oH} grade="saturate(.85) brightness(.82)" /> : null}
      {oG > 0 ? <Plate src="img/stream_gray.jpg" from={kb(vG)} to={kb(vG)} opacity={oG} grade={`saturate(${mix(0.7, 0.88, gLift)}) brightness(${mix(0.6, 0.9, gLift)})`} blur={mix(9, 0, gLift)} /> : null}
      {oB2 > 0 ? <Plate src="img/stream_blue.jpg" from={kb(vB2)} to={kb(vB2)} opacity={oB2} grade="grayscale(.92) brightness(.68) contrast(1.05)" /> : null}
      <GlyphCanvas camera={cam}>
        {watOn ? <GlyphLayer state={wat} glow={0.5} halo={0.17} haloSize={3} renderOrder={2} /> : null}
        {fxOn ? <GlyphLayer state={fx} glow={0.6} halo={0.22} haloSize={3.2} renderOrder={6} /> : null}
      </GlyphCanvas>
      <Vignette amount={0.45} />

      {/* 十六岁 / 神农架 */}
      {f < 140 ? <Title text="十六岁" f={f} charStarts={K.sixteen} size={150} x={SAFE.cx} y={610} out={124} /> : null}
      {f > 150 && f < 214 ? <Title text="神农架" f={f} charStarts={K.shen} size={150} x={SAFE.cx} y={1130} out={198} /> : null}
      {aiA > 0.01 ? <Label text="AI 示意图" x={SAFE.x0 + 8} y={356} size={30} p={aiA * 0.9} /> : null}
      {stoneSrc > 0.01 ? <Label text="石头上的字 =《人选天选论》第二章原文" x={SAFE.x0 + 8} y={412} size={30} p={stoneSrc} /> : null}
      {day2A > 0.01 ? <Label text="第二天" x={SAFE.x0 + 8} y={412} size={34} p={day2A} /> : null}

      {/* 灰白色 / 几点云母 / 没有蓝光 */}
      {f >= K.gray - 4 && f < K.putBack + 8 ? (
        <>
          <Callout text="灰白色" tx={96} ty={520} lx={190} ly={590} ax={g1x} ay={g1y} p={call(K.gray)} out={callOut} />
          <Callout text="几点云母" tx={560} ty={470} lx={660} ly={540} ax={g2x} ay={g2y} p={call(K.mica)} out={callOut} />
          <Callout text="没有蓝光" tx={96} ty={1206} lx={220} ly={1196} ax={g3x} ay={g3y} p={call(K.noBlue)} out={callOut} swatch={f < K.noBlue + 10 ? PAL.moon : PAL.slate} />
        </>
      ) : null}

      {/* 原文 e6：落定的字换成锐利的 DOM 字（逐字，位置和粒子一样） */}
      {srcA > 0.01 ? <Label text="《人选天选论》· 第二章 · 原文" x={SAFE.x0 + 8} y={392} p={srcA} size={32} /> : null}
      {f >= LIFT0 + 30 && f < QOUT0 + 24
        ? Q.chars.map((c, qi) => {
            const ls = Math.max(LIFT0 + qi * 1.2, QF[qi] + 2);
            const fl = flyLen(ls);
            const o = smooth(Math.max(ls + fl - 8, LIFT0 + 40), Math.max(ls + fl + 4, LIFT0 + 52), f) * (1 - qOutD);
            if (o <= 0.005) return null;
            const heart = qi === Q.n - 2 ? Math.exp(-Math.max(0, f - K.heart) / 18) * smooth(K.heart - 3, K.heart + 2, f) : 0;
            return (
              <div key={qi} style={{position: 'absolute', left: 540 + Q.pos[qi * 3], top: 960 - Q.pos[qi * 3 + 1] - 40 * qOutD, transform: 'translate(-50%, -50%)', opacity: o, fontFamily: SERIF, fontSize: QS, lineHeight: 1, color: '#D8EEFF', textShadow: `0 0 ${14 + 26 * heart}px rgba(156,211,255,${0.75 + 0.25 * heart}), 0 2px 14px rgba(0,0,0,.8)`}}>
                {c}
              </div>
            );
          })
        : null}

      {/* 原文 e7：结果 ← 原因 ← 证据 */}
      {f >= K.w[0] ? (
        <>
          <MaskText text="结果" size={WSZ} x={WX} y={WY[0]} opacity={0.5 * wordA(0)} />
          <MaskText text="原因" size={WSZ} x={WX} y={WY[1]} opacity={0.5 * wordA(1)} />
          <MaskText text="证据" size={WSZ} x={WX} y={WY[2]} opacity={0.5 * wordA(2)} />
          <UpArrow x={SAFE.cx} y0={wy[1] - WSZ * 0.55} y1={wy[0] + WSZ * 0.55} p={arrow1} o={1} />
          <UpArrow x={SAFE.cx} y0={wy[2] - WSZ * 0.55} y1={wy[1] + WSZ * 0.55} p={arrow2} o={1} />
        </>
      ) : null}
    </AbsoluteFill>
  );
};

export const S: SceneMod = {
  C,
  hideSubs: ['e6'],
  sfx: ({at}) => {
    const blue = at('蓝光', 0, 0, 'e2');
    return [
      [at('清澈') - 4, 'water_loop', 0.07, 150],
      [blue - 26, 'gather', 0.22, 78],
      [at('捞', 0, 0, 'e3'), 'drop', 0.15, 21],
      [at('冷'), 'whoosh_soft', 0.1, 36],
      [at('下水') + 2, 'drop', 0.2, 21],
      [at('几点云母'), 'chime', 0.12, 80],
      [at('放回水里') - 2, 'water_loop', 0.06, 50],
      [at('水里', 0, 0, 'e5'), 'drop', 0.15, 21],
      [at('后来写') + 6, 'page', 0.15, 26],
      [at('后来写') + 20, 'gather', 0.2, 78],
      [at('结果'), 'tick', 0.1, 6],
      [at('原因'), 'tick', 0.1, 6],
      [at('证据'), 'tick', 0.1, 6],
    ];
  },
};
