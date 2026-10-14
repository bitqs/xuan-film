// 场景 G1 · 天权：一座桥（全片情感高点前半）。
// 第 0 帧：水面上一白一黑两块字石（左 贪婪 / 右 恐惧），中间是空的；「搬走吗？」两块石头被抬起，又落回去。
// g2「他说」：整本书的一页浮现，原文那句在书里亮起 → 被「拔」出来排成引文（原文 · 第五章）。
// g3：同样拔出「真正的问题是，这两边之间，还有没有……桥」。两块石头里飞出金字，沿着拱一圈圈砌上去——
//     这座拱本身就是第五章原文那一段（书页弯成拱，字序就是书的字序，推近能读），只缺拱心；
//     最后，引文里那个「桥」字落下来嵌进拱心，落在 300.0 s 的小节线上 → 光从拱心扫向两岸，晨雾里的真桥浮出来。
// g4：一个「人」字从白石走过桥到黑石（看见怕），再走回来（看见自己还想要）。
// g5：桥被命名时发光；光从桥上升起，凝成「天权」两个大金字；下面注「天选」「走过去的权利」。
// g6：拱心石掉下去，桥从中间断开；左边的字越冲越快越亮（一路加码），右边的字越退越远越暗（一路后退）。
import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import type {SceneMod, SceneProps} from '../core/timeline';
import {nextBeatF, sceneById} from '../core/timeline';
import {Backdrop, Label, PAL, Plate, SAFE, SERIF, Vignette} from '../core/look';
import {EASE, clamp01, hex, keyframes, mix, prog, smooth} from '../core/anim';
import {BOOK_CHARS, findInBook} from '../core/book';
import {
  Cam, GlyphCanvas, GlyphLayer, Mask, MaskText, N_BOOK, camMix, camZ, hash01, maskTargets, noise3, pageLayout, setChar, textLayout, usePage, useGState, useTextMask,
} from '../core/glyph';

const N = N_BOOK;
// ---------------- 几何（世界坐标：像素，中心原点，y 向上）。和 bridge.jpg（缩放 0.853、左移 70）里的真桥对齐
const CX = -70; // 桥中心（画面 x = 470）
const YW = -90; // 水面（画面 y = 1050）
const AIN = 220; // 拱内沿半椭圆
const BIN = 285;
const AOUT = 262; // 拱外沿
const BOUT = 327;
const AD = 380; // 桥面
const BD = 347;
const ROWS = 5; // 拱圈「书页」：5 行 × 100 列，47..53 列 = 拱心石
const COLS = 100;
const K0 = 47;
const K1 = 53;
const KC = 50;
const CELL = (AOUT - AIN) / ROWS; // 8.4
const ZL = [70, 35, 0, -35, -70]; // 桥的厚度（前 → 后）
const STONES = [
  {x: CX - 282, y: YW + 64, rx: 134, ry: 104, rz: 96, n: 6600}, // 白石 · 贪婪
  {x: CX + 282, y: YW + 60, rx: 128, ry: 98, rz: 92, n: 6600}, // 黑石 · 恐惧
];
const PHOTO = {s: 0.853, x: -70, y: 0};
// G2 第 0 帧（断桥）的位置：白石 (90,1142)、黑石 (910,1142)，桥中心 x≈500，桥面 950(中)–1020(两端)，拱脚 1230 → 场景最后 20 帧落到这里
const STONE_END = [{x: 90 - 540, y: 960 - 1142}, {x: 910 - 540, y: 960 - 1142}];
const G2 = {cx: 500 - 540, deckMid: 950, deckEnd: 1020, feet: 1230, half: 350};
const TQ = {size: 200, x: CX, y: 445}; // 「天权」遮罩（MaskText 用同样参数）
const Q2TEXT = '问题从来不在贪婪，也不在恐惧。人活着，一定会贪，也一定会怕';
const Q3TEXT = '真正的问题是，这两边之间，还有没有桥';
const GOLD = hex(PAL.gold);
const HI = hex(PAL.goldHi);
const CREAM = hex(PAL.cream);
const SLATE = hex(PAL.slate);
const AMBER = hex(PAL.amber);
const FEAR_HI: [number, number, number] = [0.74, 0.82, 0.96];
const RO = {stoneL: 1, stoneR: 2, bridge: 3, key: 4, dust: 6, q2: 7, q3: 8};

// ---------------- 椭圆弧长表（拱圈的字按弧长等距排）
const ellTable = (a: number, b: number, M = 900) => {
  const th = new Float64Array(M + 1);
  const cum = new Float64Array(M + 1);
  let px = 0;
  let py = 0;
  for (let j = 0; j <= M; j++) {
    const t = Math.PI * (1 - j / M); // 左脚 π → 右脚 0
    const x = a * Math.cos(t);
    const y = b * Math.sin(t);
    th[j] = t;
    cum[j] = j ? cum[j - 1] + Math.hypot(x - px, y - py) : 0;
    px = x;
    py = y;
  }
  return {th, cum, L: cum[M], a, b};
};
type ET = ReturnType<typeof ellTable>;
/** 弧长 s 处的 [x, y, 切线角] */
const ellAt = (e: ET, s: number): [number, number, number] => {
  const {th, cum} = e;
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (cum[m] <= s) lo = m;
    else hi = m;
  }
  const u = (s - cum[lo]) / Math.max(1e-9, cum[hi] - cum[lo]);
  const t = th[lo] + (th[hi] - th[lo]) * u;
  return [CX + e.a * Math.cos(t), YW + e.b * Math.sin(t), Math.atan2(-e.b * Math.cos(t), e.a * Math.sin(t))];
};

// ---------------- 一次性布局：每个字粒子的角色、家、来处
const build = () => {
  const role = new Uint8Array(N);
  const kind = new Uint8Array(N); // 桥：0 拱圈正面（原文）1 拱圈后层 2 拱肩 3 栏杆
  const kb = new Uint8Array(N); // 1 = 拱心那一块（最后合拢时才到）
  const home = new Float32Array(N * 3);
  const src = new Float32Array(N * 3);
  const aux = new Float32Array(N * 3); // 引文：行里的位置；尘：聚到桥上的点
  const hrot = new Float32Array(N);
  const hsize = new Float32Array(N);
  const gro = new Float32Array(N); // 0 岸边先到 → 1 拱心最后到
  const gd = new Float32Array(N); // 离拱心的远近 0..1
  const shade = new Float32Array(N);
  const cidx = new Int16Array(N).fill(-1);
  const used = new Uint8Array(N);
  const r2 = findInBook(Q2TEXT);
  const Q2S = r2.start;
  const Q2E = r2.end + 1; // 含句号
  const r3 = findInBook(Q3TEXT);
  const Q3S = r3.start;
  const KEY = r3.end - 1; // 「桥」
  const S0 = KEY - K0; // 拱圈第 0 行第 0 列 = 书的这个字
  const page = pageLayout();
  const setH = (i: number, x: number, y: number, z: number) => {
    home[i * 3] = x;
    home[i * 3 + 1] = y;
    home[i * 3 + 2] = z;
  };
  const stoneSrc = (i: number, s: number) => {
    const S = STONES[s];
    const u = hash01(i, 71) * Math.PI * 2;
    const c = hash01(i, 72) * 2 - 1;
    const sn = Math.sqrt(1 - c * c);
    const r = 0.85 * Math.cbrt(hash01(i, 73));
    src[i * 3] = S.x + sn * Math.cos(u) * r * S.rx;
    src[i * 3 + 1] = S.y + c * r * S.ry;
    src[i * 3 + 2] = sn * Math.sin(u) * r * S.rz;
  };
  // 引文 g2：两行
  const q2a = BOOK_CHARS.slice(Q2S, Q2S + 15).join('');
  const q2b = BOOK_CHARS.slice(Q2S + 15, Q2E).join('');
  const L2 = [textLayout(q2a, {x: -96, y: 520, size: 46}), textLayout(q2b, {x: -96, y: 452, size: 46})];
  for (let i = Q2S; i < Q2E; i++) {
    const c = i - Q2S;
    const L = L2[c < 15 ? 0 : 1];
    const j = c < 15 ? c : c - 15;
    role[i] = RO.q2;
    used[i] = 1;
    cidx[i] = c;
    aux[i * 3] = L.pos[j * 3];
    aux[i * 3 + 1] = L.pos[j * 3 + 1];
    const [px, py] = page.xy(i);
    src[i * 3] = px;
    src[i * 3 + 1] = py;
    src[i * 3 + 2] = -30;
  }
  // 拱圈正面：第五章原文按书的字序弯成拱（拱心空出来留给「桥」）
  const rowsT = Array.from({length: ROWS}, (_, r) => ellTable(AOUT - (r + 0.5) * CELL, BOUT - (r + 0.5) * CELL));
  const slot = (r: number, k: number) => ellAt(rowsT[r], ((k + 0.5) / COLS) * rowsT[r].L);
  const nFront = ROWS * (COLS - (K1 - K0 + 1));
  for (let o = 0; o < nFront; o++) used[S0 + o + (o >= K0 ? 1 : 0)] = 1;
  used[KEY] = 1;
  let p = 0;
  const take = () => {
    while (used[p]) p++;
    used[p] = 1;
    return p++;
  };
  const bridgeList: number[] = [];
  const putBridge = (i: number, x: number, y: number, z: number, rot: number, size: number, kd: number) => {
    if (!role[i]) role[i] = RO.bridge;
    kind[i] = kd;
    setH(i, x, y, z);
    hrot[i] = rot;
    hsize[i] = size;
    const dx = x - CX;
    const th = Math.atan2((y - YW) / BD, dx / AD);
    gd[i] = Math.min(1, Math.abs(th - Math.PI / 2) / (Math.PI / 2));
    gro[i] = clamp01(1 - gd[i] + (hash01(i, 61) - 0.5) * 0.06);
    kb[i] = Math.abs(dx) < 34 ? 1 : 0;
    stoneSrc(i, dx < 0 ? 0 : 1);
    bridgeList.push(i);
  };
  const L3a = textLayout(BOOK_CHARS.slice(Q3S, Q3S + 7).join(''), {x: -96, y: 530, size: 52});
  const L3b = textLayout(BOOK_CHARS.slice(Q3S + 7, KEY).join(''), {x: -96, y: 460, size: 52});
  let o = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let k = 0; k < COLS; k++) {
      if (k >= K0 && k <= K1) continue;
      const i = S0 + o + (o >= K0 ? 1 : 0);
      o++;
      const [x, y, rot] = slot(r, k);
      if (i >= Q3S && i < KEY) {
        role[i] = RO.q3;
        const c = i - Q3S;
        cidx[i] = c;
        const L = c < 7 ? L3a : L3b;
        const j = c < 7 ? c : c - 7;
        aux[i * 3] = L.pos[j * 3];
        aux[i * 3 + 1] = L.pos[j * 3 + 1];
      }
      putBridge(i, x, y, ZL[0], rot, CELL * 0.98, 0);
      gd[i] = Math.abs(k + 0.5 - KC) / KC;
      gro[i] = clamp01(1 - gd[i] + (hash01(i, 61) - 0.5) * 0.04);
      kb[i] = 0;
      if (role[i] === RO.q3) {
        const [px, py] = page.xy(i);
        src[i * 3] = px;
        src[i * 3 + 1] = py;
        src[i * 3 + 2] = -30;
      }
    }
  }
  // 拱心石「桥」
  role[KEY] = RO.key;
  setH(KEY, CX, YW + (BIN + BOUT) / 2 + 4, ZL[0] + 4);
  hsize[KEY] = 52;
  gd[KEY] = 0;
  kb[KEY] = 1;
  aux[KEY * 3] = CX;
  aux[KEY * 3 + 1] = 352;
  {
    const [px, py] = page.xy(KEY);
    src[KEY * 3] = px;
    src[KEY * 3 + 1] = py;
    src[KEY * 3 + 2] = -30;
  }
  // 拱圈后层（给桥厚度）
  for (let l = 1; l < ZL.length; l++) {
    for (let r = 0; r < ROWS; r++) {
      for (let k = 0; k < COLS; k++) {
        const i = take();
        const [x, y, rot] = slot(r, k);
        putBridge(i, x, y, ZL[l], rot, CELL * 0.98, 1);
        gd[i] = Math.abs(k + 0.5 - KC) / KC;
        gro[i] = clamp01(1 - gd[i] + (hash01(i, 61) - 0.5) * 0.04);
        kb[i] = k >= K0 && k <= K1 ? 1 : 0;
      }
    }
  }
  // 拱肩（桥身）
  const step = 8.6;
  for (let l = 0; l < ZL.length; l++) {
    for (let y = YW + 5; y < YW + BD; y += step) {
      for (let x = CX - AD + 4; x < CX + AD; x += step) {
        const dx = x - CX;
        const dy = y - YW;
        if ((dx / AD) ** 2 + (dy / BD) ** 2 >= 0.985) continue;
        if ((dx / (AOUT + 3)) ** 2 + (dy / (BOUT + 3)) ** 2 <= 1) continue;
        const i = take();
        putBridge(i, x + (hash01(i, 62) - 0.5) * 2.4, y + (hash01(i, 63) - 0.5) * 2.4, ZL[l] + (hash01(i, 64) - 0.5) * 10, (hash01(i, 65) - 0.5) * 0.08, 7.8, 2);
      }
    }
  }
  // 栏杆（桥面那一圈，大一点的字）
  const deck = ellTable(AD + 2, BD + 6);
  for (const l of [0, 4]) {
    for (let s = 6; s < deck.L - 6; s += 10.5) {
      const i = take();
      const [x, y, rot] = ellAt(deck, s);
      putBridge(i, x, y, ZL[l], rot, 10.5, 3);
    }
  }
  // 两块字石：椭球壳 + 一点噪声，左上来光
  const Ln = Math.hypot(-0.55, 0.66, 0.5);
  STONES.forEach((S, s) => {
    for (let j = 0; j < S.n; j++) {
      const i = take();
      role[i] = s ? RO.stoneR : RO.stoneL;
      const u = hash01(i, 51) * Math.PI * 2;
      const c = hash01(i, 52) * 2 - 1;
      const sn = Math.sqrt(1 - c * c);
      const dxn = sn * Math.cos(u);
      const dyn = c;
      const dzn = sn * Math.sin(u);
      const w = hash01(i, 53);
      const rr = (1 - 0.42 * w * w) * (1 + 0.1 * noise3(dxn * 1.6 + s * 9, dyn * 1.6, dzn * 1.6, 5));
      let y = S.y + dyn * rr * S.ry;
      if (y < YW - 12) y = YW - 12 + (y - (YW - 12)) * 0.15;
      setH(i, S.x + dxn * rr * S.rx, y, dzn * rr * S.rz);
      const lam = Math.max(0, (dxn * -0.55 + dyn * 0.66 + dzn * 0.5) / Ln);
      shade[i] = (0.22 + 0.78 * lam) * (0.55 + 0.45 * (dzn + 1) * 0.5);
    }
  });
  // 剩下的全是空气里的字尘（后来升起来变成「天权」）
  const dust: number[] = [];
  for (let i = 0; i < N; i++) {
    if (used[i]) continue;
    used[i] = 1;
    role[i] = RO.dust;
    dust.push(i);
    setH(i, -640 + 1280 * hash01(i, 41), -760 + 1520 * hash01(i, 42), -480 + 680 * hash01(i, 43));
    const b = bridgeList[Math.floor(hash01(i, 47) * bridgeList.length)];
    aux[i * 3] = home[b * 3];
    aux[i * 3 + 1] = home[b * 3 + 1];
    aux[i * 3 + 2] = home[b * 3 + 2];
  }
  const dord = new Int32Array(N).fill(-1);
  dust.forEach((i, j) => (dord[i] = j));
  return {role, kind, kb, home, src, aux, hrot, hsize, gro, gd, shade, cidx, dord, nDust: dust.length, Q2S, Q2E, Q3S, KEY};
};
type Geo = ReturnType<typeof build>;

const titleTargets = (mask: Mask, G: Geo) => {
  const n = G.nDust;
  const tgt = maskTargets(mask, n, 31, 1.0);
  const ch = new Uint8Array(n);
  const rk = new Float32Array(n);
  let y0 = 1e9;
  let y1 = -1e9;
  for (let j = 0; j < n; j++) {
    y0 = Math.min(y0, tgt[j * 3 + 1]);
    y1 = Math.max(y1, tgt[j * 3 + 1]);
  }
  for (let j = 0; j < n; j++) {
    ch[j] = tgt[j * 3] < CX ? 0 : 1;
    rk[j] = ((tgt[j * 3 + 1] - y0) / Math.max(1, y1 - y0)) * 0.8 + hash01(j, 77) * 0.2; // 下面先到：从桥上升起来
  }
  return {tgt, ch, rk};
};

const pulse = (f: number, t0: number, decay = 24) => (f < t0 - 5 ? 0 : smooth(t0 - 5, t0 + 1, f) * Math.exp(-Math.max(0, f - t0 - 1) / decay));

const C: React.FC<SceneProps> = ({f, dur, at, atc, lineAt, def}) => {
  const st = useGState();
  const refl = useGState();
  const pg = useGState();
  const fx = useGState(2);
  const page = usePage();
  const tqMask = useTextMask('天权', {size: TQ.size, x: TQ.x, y: TQ.y});
  const G = useMemo(build, []);
  const T = useMemo(() => (tqMask ? titleTargets(tqMask, G) : null), [tqMask, G]);
  useMemo(() => {
    pg.pos.set(page.pos);
    for (let i = 0; i < N; i++) {
      pg.pos[i * 3 + 2] = -30;
      pg.size[i] = page.cell;
      pg.halo[i] = 0;
      pg.col[i * 4] = GOLD[0];
      pg.col[i * 4 + 1] = GOLD[1];
      pg.col[i * 4 + 2] = GOLD[2];
    }
  }, [pg, page]);
  useMemo(() => {
    setChar(fx, 0, '人');
    fx.n = 1;
  }, [fx]);

  // ---------------- 时间（全部从旁白取）
  const tm = useMemo(() => {
    const fBridge = at('桥');
    return {
      fMove: at('搬走'),
      fSaid: at('他说'),
      kQ2: atc('问题从来不在贪婪，也不在恐惧。人活着，一定会贪，也一定会怕。'),
      fTanLan: at('贪婪'),
      fKongJu: at('恐惧'),
      fTan2: at('一定会贪', 0, 1),
      fPa2: at('一定会怕', 0, 1),
      g2End: lineAt('g2', 'end'),
      fReal: at('真正'),
      kQ3: atc('真正的问题是，这两边之间，还有没有桥。'),
      fBetween: at('这两边'),
      fBridge,
      LOCK: nextBeatF(def, fBridge),
      fWalk: at('贪的时候'),
      fSeeFear: at('看见怕'),
      fBack: at('也能走回来'),
      fWant: at('自己还想要'),
      fName: at('这座桥'),
      fTQ: at('天权'),
      kTQ: atc('天权'),
      fTian: at('天，指的是天选'),
      fQuan: at('权，指的是'),
      fWalkOver: at('走过去的权利'),
      fBreak: at('断'),
      fExtreme: at('走极端'),
      fGreed: at('只剩贪'),
      fUp: at('一路加码'),
      fFear: at('只剩怕'),
      fBackOff: at('一路后退'),
    };
  }, [at, atc, lineAt, def]);
  const {fMove, fSaid, kQ2, fTanLan, fKongJu, fTan2, fPa2, g2End, fReal, kQ3, fBetween, fBridge, LOCK, fWalk, fSeeFear, fBack, fWant, fName, fTQ, kTQ, fTian, fQuan, fWalkOver, fBreak, fExtreme, fGreed, fFear} = tm;

  if (!T) return <Backdrop light={[0.44, 0.52]} />;

  const t = f / 30;
  const B0 = fBetween + 2; // 第一批字落到岸边
  const B1 = fBridge; // 最后一批（拱心旁）
  const FL = 22; // 每个字从石头飞到桥上的帧数

  // 搬走吗：两块石头被抬起、往外挪，又落回来
  const lift = keyframes(f, [[fMove - 8, 0], [fMove + 18, 1], [fSaid - 2, 1], [fSaid + 24, 0]]);
  // 石头的光（被念到 / 小人走到）
  const W0 = fWalk + 6;
  const W1 = fSeeFear + 9;
  const W2 = fBack - 14;
  const W3 = fWant - 6;
  const glowL = Math.min(1.4, pulse(f, fTanLan) + pulse(f, fTan2) + 1.2 * pulse(f, W3 + 4, 40));
  const glowR = Math.min(1.4, pulse(f, fKongJu) + pulse(f, fPa2) + 1.2 * pulse(f, W1, 40));
  // 小人
  const wdx = f < W2 ? mix(-338, 338, prog(f, W0, W1, EASE.sine)) : mix(338, -338, prog(f, W2, W3, EASE.sine));
  const walking = (f > W0 && f < W1) || (f > W2 && f < W3);
  const wH = BD * Math.sqrt(Math.max(0, 1 - (wdx / AD) ** 2));
  const wx = CX + wdx;
  const wy = YW + wH + 24 + (walking ? 7 * Math.abs(Math.sin(f * 0.4)) : 0);
  const wVis = smooth(fWalk - 10, fWalk + 2, f) * (1 - smooth(fName - 14, fName + 4, f));
  // 走过去的权利：一道光走过桥面
  const trailX = CX - AD + 2 * AD * prog(f, fWalkOver - 6, fWalkOver + 22, EASE.inOut);
  const trailA = smooth(fWalkOver - 8, fWalkOver, f) * (1 - smooth(fWalkOver + 18, fWalkOver + 30, f));
  const named = smooth(fName - 6, fName + 12, f) * (1 - smooth(fTQ + 10, fTQ + 50, f));
  const brk = smooth(fBreak, fBreak + 30, f);
  const reflA = 0.26 * (1 - smooth(fBreak + 20, fGreed, f));
  const slide = smooth(fExtreme - 8, fExtreme + 40, f); // 走极端：两边让开到画面边上
  const heatL = smooth(fGreed, fGreed + 40, f) * (1 - smooth(dur - 20, dur, f));
  const dimR = smooth(fFear, fFear + 40, f) * (1 - smooth(dur - 16, dur + 4, f));
  const streamEnd = 1 - smooth(dur - 18, dur + 2, f);

  // ---------------- 每个字
  for (let i = 0; i < N; i++) {
    const k3 = i * 3;
    const k4 = i * 4;
    const ro = G.role[i];
    const h = hash01(i, 3);
    let x = G.home[k3];
    let y = G.home[k3 + 1];
    let z = G.home[k3 + 2];
    let size = 6;
    let rot = 0;
    let a = 0;
    let r = GOLD[0];
    let g = GOLD[1];
    let b = GOLD[2];
    let halo = 0.5;
    let side = 0;
    let built = false; // 已经是桥的一部分（会断、会被两极带走）
    let mirror = false;

    if (ro === RO.stoneL || ro === RO.stoneR) {
      const s = ro === RO.stoneL ? 0 : 1;
      side = s ? 1 : -1;
      mirror = true;
      const S = STONES[s];
      x = S.x + (x - S.x) * (1 + 0.12 * slide) + (STONE_END[s].x - S.x) * slide;
      y = S.y + (y - S.y) * (1 + 0.12 * slide) + (STONE_END[s].y - S.y) * slide;
      x += side * 55 * lift + 1.2 * Math.sin(t * 1.3 + h * 6.283);
      y += 85 * lift + 1.2 * Math.cos(t * 1.1 + h * 9.1);
      const sh = G.shade[i];
      const gl = s ? glowR : glowL;
      if (!s) {
        r = CREAM[0] * (0.5 + 0.5 * sh);
        g = CREAM[1] * (0.5 + 0.5 * sh);
        b = CREAM[2] * (0.48 + 0.45 * sh);
        a = (0.18 + 0.22 * h) * (0.4 + 0.6 * sh);
        size = 5.2 + 6 * h * h * h;
        r = mix(r, HI[0], 0.45 * gl);
        g = mix(g, HI[1], 0.45 * gl);
        b = mix(b, HI[2], 0.45 * gl);
      } else {
        r = SLATE[0] * (0.42 + 0.5 * sh);
        g = SLATE[1] * (0.42 + 0.5 * sh);
        b = SLATE[2] * (0.45 + 0.5 * sh);
        a = (0.14 + 0.2 * h) * (0.4 + 0.6 * sh);
        size = 4 + 4.4 * h * h * h;
        r = mix(r, FEAR_HI[0], 0.5 * gl);
        g = mix(g, FEAR_HI[1], 0.5 * gl);
        b = mix(b, FEAR_HI[2], 0.5 * gl);
      }
      a *= 1 + 0.55 * gl;
      halo = 0.3 + 0.8 * gl;
      if (!s && heatL > 0) {
        r = mix(r, 1, 0.35 * heatL);
        g = mix(g, 0.9, 0.3 * heatL);
        b = mix(b, AMBER[2], 0.3 * heatL);
        a *= 1 + 0.5 * heatL;
      }
      if (s && dimR > 0) {
        a *= 1 - 0.45 * dimR;
        size *= 1 - 0.12 * dimR;
        x = STONE_END[1].x + (x - STONE_END[1].x) * (1 - 0.2 * dimR);
        y = STONE_END[1].y + (y - STONE_END[1].y) * (1 - 0.2 * dimR);
        z -= 260 * dimR;
      }
    } else if (ro === RO.bridge || ro === RO.q3 || ro === RO.key) {
      mirror = ro === RO.bridge;
      const hx = x;
      const hy = y;
      const hz = z;
      side = hx < CX ? -1 : 1;
      const kd = G.kind[i];
      const baseA = kd === 0 ? 0.62 : kd === 1 ? 0.22 : kd === 2 ? (hz > 50 ? 0.36 : 0.16) : 0.72;
      size = G.hsize[i];
      rot = G.hrot[i];
      let a0 = G.kb[i] ? LOCK : B0 + (B1 - B0) * G.gro[i];
      if (ro === RO.bridge) {
        const q = clamp01((f - (a0 - FL)) / FL);
        if (q <= 0) {
          a = 0;
        } else {
          const e = 1 - (1 - q) ** 3;
          const arc = Math.sin(Math.PI * q);
          x = mix(G.src[k3], hx, e);
          y = mix(G.src[k3 + 1], hy, e) + 90 * arc * (0.4 + h);
          z = mix(G.src[k3 + 2], hz, e) + 170 * arc;
          rot = G.hrot[i] * e;
          a = baseA * Math.min(1, q * 2.5);
        }
      } else {
        // 引文里的字（q3）和拱心石「桥」：书页 → 引文行 → 落进拱里
        const c = ro === RO.key ? 17 : G.cidx[i];
        const lx = G.aux[k3];
        const ly = G.aux[k3 + 1];
        const lsize = ro === RO.key ? 84 : 52;
        const tA = fReal - 16;
        const tF0 = fReal - 8 + c * 0.5;
        const tF1 = tF0 + 20;
        const tD0 = ro === RO.key ? LOCK - 14 : fBridge + 2 + c * 0.5;
        a0 = LOCK;
        const kq = kQ3[Math.min(c, kQ3.length - 1)];
        const lit = smooth(kq - 4, kq + 4, f);
        rot = 0;
        if (f < tA) {
          a = 0;
        } else if (f < tF0) {
          x = G.src[k3];
          y = G.src[k3 + 1];
          z = -30;
          size = page.cell * 1.15;
          a = smooth(tA, tA + 8, f);
          r = HI[0];
          g = HI[1];
          b = HI[2];
          halo = 2.5;
        } else if (f < tF1) {
          const q = (f - tF0) / (tF1 - tF0);
          const e = EASE.inOut(q);
          x = mix(G.src[k3], lx, e) + 40 * Math.sin(Math.PI * q) * (h - 0.5);
          y = mix(G.src[k3 + 1], ly, e);
          z = mix(-30, 0, e) + 280 * Math.sin(Math.PI * q);
          size = mix(page.cell * 1.15, lsize, e);
          a = mix(1, 0.6, e);
          r = HI[0];
          g = HI[1];
          b = HI[2];
          halo = mix(2.5, 0.3, e);
        } else if (f < tD0) {
          x = lx;
          y = ly + 1.5 * Math.sin(t * 1.4 + c);
          z = 0;
          size = lsize * (1 + 0.08 * pulse(f, kq, 10));
          a = 0.55 + 0.45 * lit;
          r = mix(GOLD[0], HI[0], lit);
          g = mix(GOLD[1], HI[1], lit);
          b = mix(GOLD[2], HI[2], lit);
          halo = 0.25 + (ro === RO.key ? 2.4 * lit : 0.5 * pulse(f, kq, 10));
        } else {
          const q = prog(f, tD0, LOCK, EASE.in);
          mirror = true;
          x = mix(lx, hx, q);
          y = mix(ly, hy, q) + (ro === RO.key ? 0 : 40 * Math.sin(Math.PI * q));
          z = mix(0, hz, q);
          size = mix(lsize, size, q);
          rot = mix(0, G.hrot[i], q);
          a = mix(1, ro === RO.key ? 1 : baseA + 0.3, q);
          r = HI[0];
          g = HI[1];
          b = HI[2];
          halo = ro === RO.key ? 3 : 0.6;
        }
      }
      if (f >= a0 && a > 0) {
        built = true;
        // 刚落位的字亮一下（生长的前沿）
        const fr = Math.exp(-(f - a0) / 9);
        a *= 1 + 1.2 * fr;
        r = mix(r, HI[0], fr);
        g = mix(g, HI[1], fr);
        b = mix(b, HI[2], fr);
        halo *= 1 + 3 * fr;
        if (ro === RO.q3) a = Math.max(a, mix(baseA + 0.3, baseA + 0.12, smooth(LOCK, LOCK + 60, f)));
        if (ro === RO.key) {
          a = 1;
          r = HI[0];
          g = HI[1];
          b = HI[2];
          halo = 2 + 4 * Math.exp(-(f - LOCK) / 14);
        }
        // 合拢：光从拱心扫向两岸
        const lw = Math.exp(-(((f - LOCK) - 22 * G.gd[i]) ** 2) / 30);
        const lg = f >= LOCK ? Math.exp(-(f - LOCK) / 30) : 0;
        a *= 1 + 1.1 * lw + 0.5 * lg;
        halo *= 1 + 4 * lw;
        r = mix(r, HI[0], 0.8 * lw);
        g = mix(g, HI[1], 0.8 * lw);
        b = mix(b, HI[2], 0.8 * lw);
        // 呼吸、被命名时发光、小人身边亮、「走过去」的光
        a *= 0.92 + 0.08 * Math.sin(t * 1.7 + h * 6.283) + 0.5 * named;
        if (wVis > 0) {
          const d2 = (hx - wx) ** 2 + (hy - wy) ** 2;
          const wl = wVis * Math.exp(-d2 / (2 * 46 * 46));
          a *= 1 + 1.6 * wl;
          r = mix(r, HI[0], wl);
          g = mix(g, HI[1], wl);
          b = mix(b, HI[2], wl);
          halo *= 1 + 2 * wl;
        }
        if (trailA > 0) {
          const tl = trailA * Math.exp(-(((hx - trailX) / 42) ** 2));
          a *= 1 + 1.5 * tl;
          halo *= 1 + 2.5 * tl;
        }
      }
    } else if (ro === RO.dust) {
      // 空气里的字尘（缓缓上升）→ 聚到桥上 → 升起来凝成「天权」
      const j = G.dord[i];
      const Lh = 1520;
      let px = x + 18 * Math.sin(t * 0.35 + h * 6.283);
      let py = ((((y + 760 + t * (8 + 14 * h)) % Lh) + Lh) % Lh) - 760;
      let pz = z;
      const tw = 0.6 + 0.4 * Math.sin(t * (1.5 + h) + h * 40);
      a = hash01(i, 48) < 0.28 ? (0.05 + 0.12 * hash01(i, 44)) * tw : 0;
      size = 3 + 3.5 * hash01(i, 45);
      const g0 = fName - 12 + 14 * hash01(i, 46);
      const q1 = prog(f, g0, g0 + 22, EASE.inOut);
      if (q1 > 0) {
        px = mix(px, G.aux[k3], q1);
        py = mix(py, G.aux[k3 + 1], q1);
        pz = mix(pz, G.aux[k3 + 2], q1);
        a = mix(a, 0.2, q1);
        size = mix(size, 5, q1);
      }
      const c = T.ch[j];
      const t0 = kTQ[c] - 10 + 18 * T.rk[j];
      const q2 = prog(f, t0, t0 + 20, EASE.out);
      if (q2 > 0) {
        const lf = Math.sin(Math.PI * q2);
        px = mix(G.aux[k3], T.tgt[j * 3], q2);
        py = mix(G.aux[k3 + 1], T.tgt[j * 3 + 1], q2);
        pz = mix(G.aux[k3 + 2], 0, q2) + 320 * lf * (0.4 + h);
        a = mix(0.2, 0.3 + 0.1 * h, q2);
        size = mix(5, 5.6 + 1.6 * h, q2);
        const fl = pulse(f, c === 0 ? fTian : fQuan, 20) + 0.8 * Math.exp(-Math.max(0, f - (t0 + 20)) / 10) * smooth(t0 + 14, t0 + 20, f);
        a *= 1 + 0.9 * fl;
        r = mix(GOLD[0], HI[0], 0.5 + 0.5 * Math.min(1, fl));
        g = mix(GOLD[1], HI[1], 0.5 + 0.5 * Math.min(1, fl));
        b = mix(GOLD[2], HI[2], 0.5 + 0.5 * Math.min(1, fl));
        halo = 0.4 + 1.5 * fl;
        // 桥断时，「天权」像金粉一样落下去
        const tC = f - (fBreak - 12 + 18 * hash01(i, 49));
        if (tC > 0) {
          py -= 0.32 * tC * tC;
          px += (hash01(i, 50) - 0.5) * 1.2 * tC;
          a *= 1 - smooth(4, 34, tC);
        }
      }
      // 两个极端：白石喷出越来越快、越来越亮、冲向镜头的字（一路加码）；黑石的字越退越远、越小越暗（一路后退）
      const u = hash01(i, 80);
      if (f >= fGreed && u < 0.24) {
        const tt = (f - fGreed - 55 * hash01(i, 81)) / 30;
        if (tt > 0) {
          const ph = (0.32 * tt + 0.22 * tt * tt) % 1;
          const ex = STONE_END[0].x + 40 + (hash01(i, 83) - 0.5) * 160;
          const ey = STONE_END[0].y + 20 + (hash01(i, 84) - 0.5) * 120;
          px = ex + ph * (470 + 90 * (h - 0.5));
          py = ey + ph * (420 + 140 * (hash01(i, 85) - 0.5));
          pz = 40 + ph * 2150;
          size = 4.5 + 4 * h;
          const heat = Math.min(1, 0.3 + 0.18 * tt + 0.5 * ph);
          r = mix(CREAM[0], 1, heat);
          g = mix(CREAM[1], 0.9, heat);
          b = mix(CREAM[2], 0.6, heat);
          a = (0.14 + 0.26 * ph + 0.06 * tt) * smooth(0, 0.06, ph) * (1 - smooth(0.72, 0.97, ph)) * streamEnd;
          halo = 0.6 + 1.6 * ph;
        }
      } else if (f >= fFear && u >= 0.5 && u < 0.85) {
        const tt = (f - fFear - 45 * hash01(i, 86)) / 30;
        if (tt > 0) {
          const ph = (0.4 * tt + 0.3 * tt * tt) % 1;
          const ex = STONE_END[1].x - 30 + (hash01(i, 87) - 0.5) * 210;
          const ey = STONE_END[1].y + (hash01(i, 88) - 0.35) * 160;
          px = ex - ph * 160;
          py = ey + ph * 80;
          pz = -ph * 4200;
          size = 7 - 2.5 * ph;
          r = mix(FEAR_HI[0], SLATE[0] * 0.5, ph);
          g = mix(FEAR_HI[1], SLATE[1] * 0.5, ph);
          b = mix(FEAR_HI[2], SLATE[2] * 0.55, ph);
          a = 0.6 * smooth(0, 0.08, ph) * (1 - ph) * streamEnd;
          halo = 0.9 * (1 - ph);
        }
      }
      x = px;
      y = py;
      z = pz;
    } else if (ro === RO.q2) {
      // 引文 g2：书页 → 拔出来 → 两行引文（念到的字亮）
      const c = G.cidx[i];
      const tA = fSaid - 4;
      const tF0 = fSaid + 8 + c * 0.5;
      const tF1 = tF0 + 24;
      const tO0 = g2End;
      if (f < tA) {
        a = 0;
      } else if (f < tF0) {
        x = G.src[k3];
        y = G.src[k3 + 1];
        z = -30;
        size = page.cell * 1.15;
        a = smooth(tA, tA + 8, f);
        r = HI[0];
        g = HI[1];
        b = HI[2];
        halo = 2.5;
      } else {
        const q = clamp01((f - tF0) / (tF1 - tF0));
        const e = EASE.inOut(q);
        x = mix(G.src[k3], G.aux[k3], e) + 40 * Math.sin(Math.PI * q) * (h - 0.5);
        y = mix(G.src[k3 + 1], G.aux[k3 + 1], e) + 1.5 * Math.sin(t * 1.4 + c) * e;
        z = mix(-30, 0, e) + 280 * Math.sin(Math.PI * q);
        size = mix(page.cell * 1.15, 46, e);
        const kq = kQ2[Math.min(c, kQ2.length - 1)];
        const lit = smooth(kq - 4, kq + 4, f);
        a = q < 1 ? mix(1, 0.6, e) : 0.5 + 0.5 * lit;
        const greed = c === 6 || c === 7 || c === 22;
        const fear = c === 12 || c === 13 || c === 28;
        const tgt = greed ? CREAM : fear ? FEAR_HI : HI;
        r = mix(HI[0], mix(GOLD[0], tgt[0], lit), e);
        g = mix(HI[1], mix(GOLD[1], tgt[1], lit), e);
        b = mix(HI[2], mix(GOLD[2], tgt[2], lit), e);
        halo = mix(2.5, 0.25 + 0.6 * pulse(f, kq, 10), e);
        const qo = prog(f, tO0, tO0 + 14, EASE.in);
        y += 40 * qo;
        a *= 1 - qo;
      }
    }

    // ---------------- 桥断：拱心一带掉下去（落在断口下面），两半先往外垂，「走极端」时摊平、让开，落到 G2 第 0 帧断桥的位置
    if (built && f >= fBreak) {
      const hx = G.home[k3];
      const hy = G.home[k3 + 1];
      const dxh = hx - CX;
      const crownR = 58 + 46 * hash01(i, 21);
      if (Math.abs(dxh) < crownR || ro === RO.key) {
        const tF = f - (fBreak + 1 + (9 * Math.abs(dxh)) / 100 + 5 * hash01(i, 22));
        if (tF > 0) {
          const gy = 960 - 1236 - 34 * hash01(i, 25);
          x = mix(x, G2.cx + dxh * 0.6, smooth(0, 40, tF)) + (hash01(i, 23) - 0.5) * Math.min(tF, 30) * 1.4;
          y = Math.max(gy, y - 0.5 * tF * tF);
          z *= 0.6;
          rot += (hash01(i, 24) - 0.5) * 0.12 * Math.min(tF, 26);
          a *= 1 - 0.62 * smooth(8, 34, tF);
          halo *= 0.5;
        }
      } else {
        const ang = side * 0.11 * brk;
        const pxv = CX + side * 372;
        const ox = x - pxv;
        const oy = y - YW;
        const cs = Math.cos(ang);
        const sn = Math.sin(ang);
        x = pxv + ox * cs - oy * sn + side * 34 * brk;
        y = YW + ox * sn + oy * cs;
        rot += ang;
        if (slide > 0) {
          const ydk = YW + BD * Math.sqrt(Math.max(0, 1 - (dxh / AD) ** 2));
          const v = clamp01((hy - YW) / Math.max(1, ydk - YW));
          const dxp = dxh * (G2.half / AD);
          const deck = G2.deckMid + (G2.deckEnd - G2.deckMid) * Math.min(1, Math.abs(dxp) / G2.half);
          x = mix(x, G2.cx + dxp + side * 10, slide);
          y = mix(y, 960 - (G2.feet - v * (G2.feet - deck)), slide);
          z = mix(z, G.home[k3 + 2] * 0.6, slide);
          rot = mix(rot, G.hrot[i] * 0.35, slide);
        }
      }
    }

    st.pos[k3] = x;
    st.pos[k3 + 1] = y;
    st.pos[k3 + 2] = z;
    st.size[i] = size;
    st.rot[i] = rot;
    st.halo[i] = halo;
    st.col[k4] = r;
    st.col[k4 + 1] = g;
    st.col[k4 + 2] = b;
    st.col[k4 + 3] = a;
    // 倒影（水面以下，镜像 + 波纹）
    if (mirror && a > 0.004 && y > YW - 8 && reflA > 0) {
      const my = 2 * YW - y;
      const depth = YW - my;
      refl.pos[k3] = x + 3 * Math.sin(my * 0.09 + t * 2.2) + 1.5 * Math.sin(my * 0.31 - t * 3.1);
      refl.pos[k3 + 1] = my;
      refl.pos[k3 + 2] = z;
      refl.size[i] = size;
      refl.rot[i] = Math.PI - rot;
      refl.halo[i] = 0;
      refl.col[k4] = r;
      refl.col[k4 + 1] = g;
      refl.col[k4 + 2] = b;
      refl.col[k4 + 3] = a * reflA * Math.exp(-depth / 330);
    } else refl.col[k4 + 3] = 0;
  }

  // 书页（拔原文用）：只在两次「拔」的时候出现
  const pv = Math.max(smooth(fSaid - 18, fSaid - 2, f) * (1 - smooth(fSaid + 30, fSaid + 66, f)), smooth(fReal - 32, fReal - 16, f) * (1 - smooth(fReal + 10, fReal + 38, f)));
  if (pv > 0.002) {
    pg.n = N;
    for (let i = 0; i < N; i++) {
      const ro = G.role[i];
      pg.col[i * 4 + 3] = ro === RO.q2 || ro === RO.q3 || ro === RO.key ? 0 : pv * (0.08 + 0.12 * hash01(i, 8));
    }
  } else pg.n = 0;

  // 小人
  fx.pos[0] = wx;
  fx.pos[1] = wy;
  fx.pos[2] = ZL[0] + 14;
  fx.size[0] = 50;
  fx.rot[0] = 0;
  fx.halo[0] = 1.1;
  fx.col[0] = HI[0];
  fx.col[1] = HI[1];
  fx.col[2] = HI[2];
  fx.col[3] = wVis;

  // ---------------- 镜头：拔原文时正对；搭桥时绕到侧面看厚度，合拢那一拍回到正面（和真桥照片对齐）；小人走时轻推
  const full: Cam = {pos: [0, 0, camZ()]};
  const sideCam: Cam = {pos: [CX - 740, -170, camZ() * 0.95], target: [CX, 60, 0]};
  const walkCam: Cam = {pos: [CX * 0.7, 60, camZ() / 1.1]};
  const seq: [number, Cam][] = [
    [0, full],
    [fBetween - 20, full],
    [fBetween + 26, sideCam],
    [LOCK, full],
    [fWalk + 10, full],
    [fSeeFear, walkCam],
    [fWant + 8, walkCam],
    [fName - 8, full],
  ];
  let cam = full;
  for (let k = 1; k < seq.length; k++) {
    if (f <= seq[k][0]) {
      const [f0, c0] = seq[k - 1];
      const [f1, c1] = seq[k];
      cam = camMix(c0, c1, EASE.inOut(Math.min(1, Math.max(0, (f - f0) / Math.max(1, f1 - f0)))));
      break;
    }
    cam = seq[k][1];
  }
  const cp = cam.pos ?? [0, 0, camZ()];
  const ctg = cam.target ?? [cp[0], cp[1], 0];
  const kz = camZ() / Math.max(1, cp[2] - ctg[2]);

  // ---------------- DOM
  const photoA = 0.5 * prog(f, LOCK - 2, LOCK + 40, EASE.out) * (1 - prog(f, fBreak - 8, fBreak + 22));
  const plateKB = {s: PHOTO.s * kz, x: kz * (PHOTO.x - cp[0]), y: kz * (PHOTO.y - cp[1])};
  const nounA = 1 - smooth(fBreak - 10, fBreak + 6, f);
  const upA = prog(f, fGreed + 12, fGreed + 26) * (1 - smooth(dur - 16, dur, f));
  const backA = prog(f, fFear + 10, fFear + 24) * (1 - smooth(dur - 16, dur, f));
  const srcA = prog(f, fSaid - 2, fSaid + 12) * (1 - prog(f, fBreak - 14, fBreak));
  const tqA = 0.6 * prog(f, kTQ[0] + 8, kTQ[1] + 28) * (1 - prog(f, fBreak - 16, fBreak + 2));
  const n1A = prog(f, fTian + 4, fTian + 16) * (1 - prog(f, fBreak - 16, fBreak + 2));
  const n2A = prog(f, fQuan + 4, fQuan + 16) * (1 - prog(f, fBreak - 16, fBreak + 2));
  const tag = (text: string, x: number, y: number, op: number, color: string, size = 50) =>
    op > 0.01 ? (
      <div style={{position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) translateY(${(1 - op) * 10}px)`, opacity: op, fontFamily: SERIF, fontSize: size, letterSpacing: '0.12em', color, textShadow: '0 2px 18px rgba(0,0,0,.85)', whiteSpace: 'nowrap'}}>
        {text}
      </div>
    ) : null;
  const domX = (wxw: number) => 540 + wxw;
  return (
    <AbsoluteFill>
      <Backdrop light={[0.44, 0.5]} glow={1 + 0.35 * (f >= LOCK ? Math.exp(-(f - LOCK) / 24) : 0)} />
      <Plate
        src="img/bridge.jpg"
        p={0}
        from={plateKB}
        to={plateKB}
        opacity={photoA}
        grade="sepia(.25) saturate(.85) brightness(.82)"
        blur={1.2}
        style={{maskImage: 'radial-gradient(ellipse 58% 46% at 43.5% 54%, #000 50%, transparent 100%)', WebkitMaskImage: 'radial-gradient(ellipse 58% 46% at 43.5% 54%, #000 50%, transparent 100%)'}}
      />
      <GlyphCanvas camera={cam}>
        <GlyphLayer state={refl} glow={0.2} renderOrder={0} />
        {pg.n > 0 ? <GlyphLayer state={pg} glow={0.2} renderOrder={2} /> : null}
        <GlyphLayer state={st} glow={0.55} halo={0.16} haloSize={3.2} renderOrder={4} />
        <GlyphLayer state={fx} glow={0.6} halo={0.22} haloSize={3.4} renderOrder={8} />
      </GlyphCanvas>
      <Vignette amount={0.5} />
      {srcA > 0.01 ? <Label text="原文 · 《人选天选论》第五章" x={SAFE.x0 + 8} y={352} p={srcA} size={30} /> : null}
      {tag('贪婪', domX(STONES[0].x), 1150, nounA, PAL.cream)}
      {tag('恐惧', domX(STONES[1].x) - 30, 1150, nounA, '#AFBDD3')}
      {tag('一路加码', 236, 1290, upA, '#FFE2B0')}
      {tag('一路后退', 676, 1290, backA, '#AFBDD3')}
      {tqA > 0.01 ? <MaskText text="天权" size={TQ.size} x={TQ.x} y={TQ.y} opacity={tqA} /> : null}
      {tag('天选', domX(TQ.x) - TQ.size / 2, 960 - TQ.y + 142, n1A, PAL.gold, 46)}
      {tag('走过去的权利', domX(TQ.x) + TQ.size / 2, 960 - TQ.y + 142, n2A, PAL.gold, 46)}
    </AbsoluteFill>
  );
};

const DEF = sceneById('G1');
export const S: SceneMod = {
  C,
  hideSubs: ['g2', 'g3'],
  sfx: ({at}) => {
    const LOCK = nextBeatF(DEF, at('桥'));
    return [
      [at('搬走') - 4, 'whoosh_soft', 0.1, 36],
      [at('他说') - 4, 'gather', 0.16, 78],
      [at('真正') - 4, 'gather', 0.15, 78],
      [LOCK - 60, 'swell', 0.15, 62],
      [LOCK, 'bell', 0.17, 135],
      [at('看见怕') + 9, 'chime', 0.1, 70],
      [at('自己还想要') - 2, 'chime', 0.1, 70],
      [at('天权') - 12, 'gather', 0.22, 80],
      [at('断'), 'crack', 0.18, 30],
      [at('只剩贪'), 'swell', 0.11, 62],
      [at('只剩怕') + 4, 'whoosh_soft', 0.1, 36],
    ];
  },
};
