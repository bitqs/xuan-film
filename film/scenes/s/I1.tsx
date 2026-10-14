// 场景 I1 · 苍蝇还是马蜂（上）。
// 午后卧室（room_noon）：窗帘缝里一线阳光，光里飘的灰尘 = 第七章的字 → 半睡半醒：眼皮往下沉（暖色眼睑 + 失焦）
// → 嗡嗡：一个由 4200 个字压成的小黑点绕圈飞（拖一点动态模糊），「苍蝇？」标签跟着它 → 闭眼抬手一拍（一道模糊的手影扫过），没拍到
// → 睁开眼：窗前逆光（去掉马蜂的净底 I1/wasp_clean.jpg），小黑点停在光里
// →（拍上）小黑点炸开成一只由书里的字拼成的马蜂：身体是按照片取色的墨字，翅膀和轮廓是逆光的金字 → 真照片淡入，金字留在翅膀上闪，停半拍
// →「要是拍中了」：画面褪成冷灰（假如的世界），马蜂缩回小黑点，一拍，「×」，标签「苍蝇」；真相只剩一道淡金的影子
// → 原文：所有字飞回书页（整本书一屏），第七章那句话在书里逐字亮起，镜头扎进去逐段读，最后拉开看整句。
import React, {useMemo} from 'react';
import {AbsoluteFill, Img} from 'remotion';
import type {SceneMod, SceneProps} from '../core/timeline';
import {nextBeatF} from '../core/timeline';
import {Backdrop, Label, PAL, Plate, SAFE, SERIF, Vignette} from '../core/look';
import {EASE, hex, keyframes, mix, prog, smooth} from '../core/anim';
import {BOOK_CHARS, BOOK_IDX, chapterOf, findInBook} from '../core/book';
import type {Cam, Mask} from '../core/glyph';
import {GlyphCanvas, GlyphLayer, N_BOOK, camMix, camOn, camZ, hash01, maskTargets, noise3, sampleImg, useGState, useImageData} from '../core/glyph';
import MASK from './I1/wasp_mask.json';
// @ts-ignore —— 图片由打包器处理成 URL（wasp.jpg 去掉马蜂后的净底，离线修图生成）
import CLEAN from './I1/wasp_clean.jpg';

const N = N_BOOK;
const NB = 4200; // 马蜂身体（墨字，normal 混合）= 小黑点
const NW = 3600; // 翅膀（金字，加色）
const NR = 1500; // 逆光轮廓（金字，加色）
const DOT_S = 0.034; // 小黑点 = 缩成 3.4% 的马蜂
const SW_END = 1.035; // 窗前那几秒的极慢推近（照片与字同步）
const GOLD = hex(PAL.gold);
const HI = hex(PAL.goldHi);
const DUSTC: [number, number, number] = [1, 0.92, 0.74];
const INK: [number, number, number] = [0.075, 0.055, 0.04];
const GREY: [number, number, number] = [0.2, 0.2, 0.21];
// 光柱（引擎坐标：中心原点，y 向上）：从窗帘缝斜着落到床边
const BO: [number, number] = [100, 480];
const BD: [number, number] = [-0.42, -0.91];
const BP: [number, number] = [0.91, -0.42];
const BL = 760;
const PUN = /[，。、；：？！“”‘’（）《》「」『』…—·,.;:?!'"()\s\-]/;

type MaskJ = {w: number; h: number; body: number[]; wing: number[]; rim: number[]};
const MJ = MASK as MaskJ;
const toMask = (runs: number[]): Mask => {
  const ins: number[] = [];
  for (let k = 0; k < runs.length; k += 3) for (let x = runs[k + 1]; x < runs[k + 2]; x++) ins.push(runs[k] * MJ.w + x);
  return {w: MJ.w, h: MJ.h, a: new Uint8Array(0), inside: Int32Array.from(ins)};
};
const rankBy = (n: number, key: (i: number) => number, seed: number) => {
  const ord = Array.from({length: n}, (_, i) => i).sort((a, b) => key(a) - key(b));
  const r = new Float32Array(n);
  ord.forEach((i, k) => (r[i] = (k / Math.max(1, n - 1)) * 0.85 + hash01(i, seed) * 0.15));
  return r;
};
/** 逐字错峰变形 a → b，写进 out（从 off 个字开始），每字进度写进 q（用来同步颜色/透明度） */
const morphQ = (
  out: Float32Array, a: Float32Array, b: Float32Array, n: number, p: number, rk: Float32Array, q: Float32Array,
  o: {s: number; swirl: number; lift: number; seed: number; ease?: (t: number) => number; off?: number; scale?: number},
) => {
  const ease = o.ease ?? EASE.inOut;
  const off = o.off ?? 0;
  const sc = o.scale ?? 1;
  for (let i = 0; i < n; i++) {
    let t = p * (1 + o.s) - o.s * rk[i];
    t = t <= 0 ? 0 : t >= 1 ? 1 : ease(t);
    q[i] = t;
    const k = i * 3;
    const ax = a[k];
    const ay = a[k + 1];
    const bx = b[k];
    const by = b[k + 1];
    let x = ax + (bx - ax) * t;
    let y = ay + (by - ay) * t;
    let z = a[k + 2] + (b[k + 2] - a[k + 2]) * t;
    if (t > 0 && t < 1) {
      const arc = Math.sin(Math.PI * t);
      const dx = bx - ax;
      const dy = by - ay;
      const L = Math.hypot(dx, dy) + 1e-6;
      const side = (hash01(i, o.seed) - 0.5) * 2;
      x += (-dy / L) * o.swirl * side * arc;
      y += (dx / L) * o.swirl * side * arc;
      z += o.lift * arc * (0.5 + hash01(i, o.seed + 1));
    }
    const ko = (i + off) * 3;
    out[ko] = x * sc;
    out[ko + 1] = y * sc;
    out[ko + 2] = z;
  }
};

/** 照片底（打包进来的 URL 版 Plate） */
const PlateURL: React.FC<{src: string; s: number; opacity: number; filter?: string}> = ({src, s, opacity, filter}) =>
  opacity <= 0.001 ? null : (
    <AbsoluteFill style={{opacity, overflow: 'hidden'}}>
      <Img src={src} style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${s})`, filter}} />
    </AbsoluteFill>
  );
/** 闭眼抬手一拍：一团模糊的手影快速扫过 */
const Swipe: React.FC<{f: number; f0: number; x0: number; y0: number; x1: number; y1: number; len?: number}> = ({f, f0, x0, y0, x1, y1, len = 10}) => {
  const p = (f - f0) / len;
  if (p <= 0 || p >= 1) return null;
  const e = EASE.inOut(p);
  const x = mix(x0, x1, e);
  const y = mix(y0, y1, e);
  const ang = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
  const o = Math.sin(Math.PI * p);
  return (
    <div
      style={{
        position: 'absolute', left: x - 340, top: y - 130, width: 680, height: 260, borderRadius: '50%',
        background: 'radial-gradient(ellipse 50% 50% at 42% 50%, rgba(18,9,4,.95) 0%, rgba(18,9,4,.7) 45%, rgba(18,9,4,0) 100%), radial-gradient(ellipse 22% 46% at 84% 50%, rgba(255,196,128,.75) 0%, rgba(255,196,128,0) 100%)',
        filter: 'blur(12px)', transform: `rotate(${ang}deg) scaleX(${1 + 0.9 * o})`, opacity: o,
      }}
    />
  );
};
const Cross: React.FC<{x: number; y: number; p1: number; p2: number; opacity: number; size?: number}> = ({x, y, p1, p2, opacity, size = 150}) => {
  if (opacity <= 0.001) return null;
  const pad = 12;
  const L = Math.hypot(size - 2 * pad, size - 2 * pad);
  const line = (x1: number, y1: number, x2: number, y2: number, p: number) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(240,234,224,.95)" strokeWidth={9} strokeLinecap="round" strokeDasharray={L} strokeDashoffset={L * (1 - p)} />
  );
  return (
    <svg width={size} height={size} style={{position: 'absolute', left: x - size / 2, top: y - size / 2, opacity, overflow: 'visible', filter: 'drop-shadow(0 3px 12px rgba(0,0,0,.45))'}}>
      {line(pad, pad, size - pad, size - pad, p1)}
      {line(size - pad, pad, pad, size - pad, p2)}
    </svg>
  );
};

const C: React.FC<SceneProps> = ({f, dur, def, at, atc}) => {
  const st = useGState();
  const fly = useGState(NB);
  const img = useImageData('img/wasp.jpg', 540, 960);

  // ---------------- 原文（第七章）
  const R = useMemo(() => {
    const r = findInBook('一个“错误”的世界，就这样形成了。没有人欺骗我，也没有人害我，只是因为我没有看见');
    const ch = chapterOf(r.start);
    // 句子里第 k 个非标点字在书里的下标
    const nonP: number[] = [];
    for (let i = r.start; i < r.end; i++) if (!PUN.test(BOOK_CHARS[i])) nonP.push(i);
    return {...r, ch, nonP};
  }, []);

  // ---------------- 马蜂的字：目标位置 / 小黑点 / 先后顺序
  const T = useMemo(() => {
    const body = maskTargets(toMask(MJ.body), NB, 5, 1);
    const wing = maskTargets(toMask(MJ.wing), NW, 6, 1);
    const rim = maskTargets(toMask(MJ.rim), NR, 7, 1);
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < NB; i++) {
      cx += body[i * 3];
      cy += body[i * 3 + 1];
    }
    cx /= NB;
    cy /= NB;
    const shrink = (src: Float32Array, n: number) => {
      const o = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        o[i * 3] = cx + (src[i * 3] - cx) * DOT_S;
        o[i * 3 + 1] = cy + (src[i * 3 + 1] - cy) * DOT_S;
      }
      return o;
    };
    const dist = (src: Float32Array) => (i: number) => Math.hypot(src[i * 3] - cx, src[i * 3 + 1] - cy);
    const rkB = rankBy(NB, dist(body), 11);
    return {
      body, wing, rim, cx, cy,
      dotB: shrink(body, NB), dotW: shrink(wing, NW), dotR: shrink(rim, NR),
      rkB, rkBin: Float32Array.from(rkB, (v) => 1 - v), rkW: rankBy(NW, dist(wing), 12), rkR: rankBy(NR, dist(rim), 13),
      qB: new Float32Array(NB), qW: new Float32Array(NW), qR: new Float32Array(NR),
    };
  }, []);
  const COL = useMemo(() => {
    if (!img) return null;
    const b = new Float32Array(NB * 3);
    const w = new Float32Array(NW * 3);
    for (let i = 0; i < NB; i++) b.set(sampleImg(img, T.body[i * 3], T.body[i * 3 + 1]), i * 3);
    for (let i = 0; i < NW; i++) w.set(sampleImg(img, T.wing[i * 3], T.wing[i * 3 + 1]), i * 3);
    return {b, w};
  }, [img, T]);
  // 翅膀/轮廓用的字：均匀撒在全书里（之后回到书页时散落各处，不会挤成一条带）
  const WI = useMemo(() => {
    const idx = Int32Array.from({length: NW + NR}, (_, j) => Math.floor(((j + 0.5) * N) / (NW + NR)));
    const flag = new Uint8Array(N);
    idx.forEach((i) => (flag[i] = 1));
    return {idx, flag, buf: new Float32Array((NW + NR) * 3)};
  }, []);
  // 小黑点 / 马蜂身体用第七章的字
  useMemo(() => {
    const len = R.ch.end - R.ch.start;
    for (let i = 0; i < NB; i++) fly.idx[i] = BOOK_IDX[R.ch.start + (i % len)];
  }, [fly, R]);
  // 灰尘 = 第七章的字（书里第 ch.start.. 个字）
  const DUST = useMemo(() => {
    const d: number[] = [];
    for (let i = R.ch.start; i < R.ch.end; i++) if (hash01(i, 31) < 0.5) d.push(i);
    return Int32Array.from(d);
  }, [R]);
  // 整本书一屏，但字流整体循环平移：第七章那句话落在书页正中（推近时四周都有字，不会露出书页的底边）
  const PAGE = useMemo(() => {
    const cols = 140;
    const cell = 1080 / cols;
    const rows = Math.ceil(N / cols);
    const x0 = (-cols * cell) / 2 + cell / 2;
    const y0 = (rows * cell) / 2 - cell / 2;
    const off = ((((Math.floor(rows / 2) * cols + cols / 2 - 20 - R.start) % N) + N) % N);
    const xy = (i: number): [number, number] => {
      const sl = (i + off) % N;
      return [x0 + (sl % cols) * cell, y0 - Math.floor(sl / cols) * cell];
    };
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const [x, y] = xy(i);
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
    }
    return {pos, cell, xy};
  }, [R]);
  // 书页从那个被拍死的小黑点开始，一圈一圈向外长出来
  const PG = useMemo(() => {
    const ox = T.cx * SW_END;
    const oy = T.cy * SW_END;
    const d = new Float32Array(N);
    let dm = 1;
    for (let i = 0; i < N; i++) {
      d[i] = Math.hypot(PAGE.pos[i * 3] - ox, PAGE.pos[i * 3 + 1] - oy);
      dm = Math.max(dm, d[i]);
    }
    return {rk: Float32Array.from(d, (v, i) => (v / dm) * 0.88 + hash01(i, 64) * 0.12), q: new Float32Array(N)};
  }, [PAGE, T]);
  // 整页成形的起点：翅膀/轮廓的字从马蜂的影子出发，其余从远处飞来
  const SRC = useMemo(() => {
    const s = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const k = i * 3;
      s[k] = PAGE.pos[k];
      s[k + 1] = PAGE.pos[k + 1];
      s[k + 2] = -70 - 150 * hash01(i, 63);
    }
    for (let j = 0; j < NW + NR; j++) {
      const k = WI.idx[j] * 3;
      const src = j < NW ? T.wing : T.rim;
      const jj = (j < NW ? j : j - NW) * 3;
      s[k] = src[jj] * SW_END;
      s[k + 1] = src[jj + 1] * SW_END;
      s[k + 2] = 0;
    }
    return s;
  }, [T, PAGE, WI]);

  // ---------------- 时间点（全部来自旁白）
  const fLast = at('最后一章');
  const fHalf = at('半睡半醒');
  const fBuzz = at('嗡嗡响');
  const fFly = at('苍蝇');
  const fClose = at('闭着眼');
  const fSwat = at('拍');
  const fOpen = at('睁开眼');
  const fWasp = at('马蜂');
  const fIf = at('要是');
  const fHit = at('拍中');
  const fLife = at('这辈子');
  const fFly2 = at('苍蝇', 1);
  const fDead = at('拍死');
  const fForm = at('形成了');
  const fNo1 = at('没有人欺骗我');
  const fSee = at('只是因为我没有看见');
  const REV_LAND = nextBeatF(def, fWasp - 3); // 马蜂成形，拍上
  const REV_START = REV_LAND - 28;
  const PAGE_LAND = nextBeatF(def, fForm - 26); // 书页成形，拍上（≈「就这样形成了」）
  const PAGE_START = PAGE_LAND - 50;
  const L0 = fBuzz - 18; // 小黑点飞进来

  const t = f / 30;
  // 眼皮：0 = 睁开，0.62 = 闭上（只剩中间一道缝，暖色透光）
  const lid = keyframes(f, [
    [0, 0], [fHalf - 2, 0], [fHalf + 16, 0.2], [fHalf + 38, 0.09], [fBuzz - 4, 0.17], [fBuzz + 24, 0.08],
    [fClose - 4, 0.13], [fClose + 12, 0.62], [fOpen - 2, 0.62], [fOpen + 14, 0],
  ]);
  const shut = smooth(0.3, 0.6, lid); // 闭眼程度
  const drowsy = smooth(fHalf, fHalf + 26, f) * (1 - smooth(fOpen, fOpen + 20, f));
  const cleanA = smooth(fClose + 28, fOpen - 6, f); // 闭眼时房间换成窗前
  const sW = mix(1, SW_END, prog(f, fOpen - 10, PAGE_START, EASE.linear));
  const kbP = prog(f, 0, fOpen, EASE.linear);
  const kbS = mix(1, 1.07, kbP);
  const kbY = mix(0, 26, kbP);
  const waspA = smooth(REV_LAND, REV_LAND + 18, f) * (1 - smooth(fIf + 4, fIf + 24, f));
  const grey = smooth(fIf - 2, fIf + 20, f); // 假如的世界
  const plateOut = 1 - smooth(PAGE_START + 2, PAGE_START + 30, f);

  // ---------------- 小黑点的轨迹（引擎坐标）
  const loopPos = (ff: number): [number, number] => {
    const u = ff - L0;
    const w = (2 * Math.PI) / 58;
    const cx = 40 + 50 * Math.sin(u * 0.013);
    return [cx + 190 * Math.sin(w * u) + 34 * noise3(ff / 11, 1.3, 0, 41), 215 + 92 * Math.sin(2 * w * u + 0.6) + 34 * noise3(ff / 11, 7.1, 0, 42)];
  };
  const dotPos = (ff: number): [number, number] => {
    const enter = smooth(L0, L0 + 24, ff);
    let [x, y] = loopPos(ff);
    x = mix(780, x, enter);
    y = mix(330, y, enter);
    if (ff > fSwat - 3) {
      const k = ff - (fSwat - 3);
      const imp = (1 - Math.exp(-k / 2.5)) * Math.exp(-k / 26);
      x += 190 * imp;
      y += 130 * imp;
    }
    const hv = smooth(fOpen - 46, fOpen + 16, ff);
    const amp = 16 * (1 - smooth(REV_START - 22, REV_START - 2, ff));
    const hx = T.cx + amp * noise3(ff / 9, 3.3, 0, 43);
    const hy = T.cy + amp * noise3(ff / 9, 9.9, 0, 44);
    return [mix(x, hx, hv) * sW, mix(y, hy, hv) * sW];
  };

  // ================= 主字层（加色）：灰尘 / 翅膀与轮廓 / 整页
  for (let i = 0; i < N; i++) st.col[i * 4 + 3] = 0;
  if (f < PAGE_START) {
    // ---- 灰尘：第七章的字在光柱里慢慢飘、翻、闪
    const dustA = (1 - 0.7 * shut) * (1 - cleanA) * (1 + 0.25 * smooth(at('午后') - 6, at('午后') + 20, f));
    if (dustA > 0.002) {
      for (let k = 0; k < DUST.length; k++) {
        const i = DUST[k];
        const h1 = hash01(i, 32);
        const h2 = hash01(i, 33);
        const h3 = hash01(i, 34);
        const h4 = hash01(i, 35);
        const u = 0.1 + 0.9 * Math.pow(h1, 0.75);
        const wv = 60 + 210 * u;
        const v = (h2 - 0.5) * wv;
        let x = BO[0] + BD[0] * u * BL + BP[0] * v;
        let y = BO[1] + BD[1] * u * BL + BP[1] * v;
        x += 24 * noise3(x / 170, y / 170, t * 0.12 + h3 * 9, 51);
        y += 24 * noise3(x / 170 + 9, y / 170 - 4, t * 0.12 + h3 * 9, 52) - 4.5 * t * (0.3 + h4);
        const big = h4 > 0.975;
        const tw = 0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(t * (0.9 + 1.7 * h2) + h1 * 40), 3);
        const edge = Math.exp(-Math.pow(v / (0.5 * wv), 2) * 1.3);
        const kk = i * 3;
        st.pos[kk] = x * kbS;
        st.pos[kk + 1] = y * kbS + kbY;
        st.pos[kk + 2] = (h3 - 0.5) * 260;
        st.size[i] = big ? 15 + 9 * h3 : 4.6 + 8 * h3 * h3 * h3;
        st.rot[i] = (h1 - 0.5) * 1.4 + t * (h2 - 0.5) * 0.9;
        st.halo[i] = 1 + 2.2 * tw;
        st.col[i * 4] = DUSTC[0];
        st.col[i * 4 + 1] = DUSTC[1];
        st.col[i * 4 + 2] = DUSTC[2];
        st.col[i * 4 + 3] = Math.min(1, dustA * (0.28 + 0.6 * h4) * tw * edge * (big ? 0.45 : 1));
      }
    }
    // ---- 翅膀和逆光轮廓：小黑点炸开时一起飞出来
    if (f >= REV_START) {
      const pr = prog(f, REV_START, REV_LAND, EASE.linear);
      const mo = {s: 0.5, swirl: 70, lift: 260, ease: EASE.out, scale: sW};
      morphQ(WI.buf, T.dotW, T.wing, NW, pr, T.rkW, T.qW, {...mo, seed: 71});
      morphQ(WI.buf, T.dotR, T.rim, NR, pr, T.rkR, T.qR, {...mo, seed: 73, off: NW});
      for (let j = 0; j < NW + NR; j++) {
        const k = WI.idx[j] * 3;
        st.pos[k] = WI.buf[j * 3];
        st.pos[k + 1] = WI.buf[j * 3 + 1];
        st.pos[k + 2] = WI.buf[j * 3 + 2];
      }
      const land = f >= REV_LAND ? Math.exp(-(f - REV_LAND) / 12) : 0;
      const settle = smooth(REV_LAND, REV_LAND + 24, f); // 照片进来后金字退成闪光
      const ghost = smooth(fIf + 2, fIf + 22, f);
      for (let j = 0; j < NW + NR; j++) {
        const isW = j < NW;
        const q = isW ? T.qW[j] : T.qR[j - NW];
        const h = hash01(j, 74);
        const tw = 0.55 + 0.45 * Math.sin(t * (5 + 7 * h) + h * 30);
        let r: number;
        let g: number;
        let b: number;
        if (isW && COL) {
          r = mix(GOLD[0], Math.min(1, COL.w[j * 3] * 1.35), 0.4);
          g = mix(GOLD[1], Math.min(1, COL.w[j * 3 + 1] * 1.35), 0.4);
          b = mix(GOLD[2], Math.min(1, COL.w[j * 3 + 2] * 1.35), 0.4);
        } else {
          r = HI[0];
          g = HI[1];
          b = HI[2];
        }
        // 假如的世界：褪成灰金的影子
        r = mix(r, 0.78, ghost * 0.6);
        g = mix(g, 0.76, ghost * 0.6);
        b = mix(b, 0.72, ghost * 0.6);
        let a = (isW ? 0.5 : 0.75) * smooth(0, 0.45, q);
        a *= mix(1, isW ? 0.28 + 0.2 * tw : 0.22 + 0.22 * tw, settle);
        a = mix(a, (isW ? 0.07 : 0.12) * (1 - 0.45 * smooth(fDead, fDead + 30, f)), ghost); // 「拍死」之后，真相的影子更淡
        a = Math.min(1, a + land * 0.35 * q);
        const i = WI.idx[j];
        st.size[i] = isW ? 4.2 + 3.2 * h * h : 3.6 + 2.4 * h;
        st.rot[i] = 0;
        st.halo[i] = (isW ? 0.8 : 1.5) * (1 + 1.2 * land) * (1 - 0.5 * ghost);
        st.col[i * 4] = r;
        st.col[i * 4 + 1] = g;
        st.col[i * 4 + 2] = b;
        st.col[i * 4 + 3] = a;
      }
    }
  } else {
    // ---- 整页：一个「错误」的世界，就这样形成了（字从影子和远处飞回书页）
    const pp = prog(f, PAGE_START, PAGE_LAND, EASE.linear);
    morphQ(st.pos, SRC, PAGE.pos, N, pp, PG.rk, PG.q, {s: 0.8, swirl: 26, lift: 0, seed: 65, ease: EASE.out});
    // 句子逐字亮起：念到哪个字亮哪个（落页前已经念过的字，落页后一个接一个补亮）
    const spoken = [...atc('一个错误的世界'), ...atc('就这样形成了'), ...atc('没有人欺骗我'), ...atc('也没有人害我'), ...atc('只是因为我没有看见')];
    const tc = new Float32Array(R.end - R.start);
    let k = 0;
    for (let j = 0; j < tc.length; j++) {
      const isP = PUN.test(BOOK_CHARS[R.start + j]);
      const base = isP ? (k > 0 ? spoken[k - 1] + 3 : spoken[0]) : spoken[Math.min(k, spoken.length - 1)];
      if (!isP) k++;
      tc[j] = Math.max(base, PAGE_LAND - 6 + j * 1.1);
    }
    const closeUp = smooth(PAGE_LAND - 4, PAGE_LAND + 22, f);
    const seeEnd = R.nonP[R.nonP.length - 4]; // 「没有看见」从这里起
    const endGlow = smooth(fSee + 40, fSee + 62, f);
    for (let i = 0; i < N; i++) {
      const q = PG.q[i];
      const h = hash01(i, 3);
      const fromGhost = WI.flag[i] === 1;
      let size = mix(fromGhost ? 4.5 : 6, PAGE.cell * 0.98, q);
      const front = q > 0 && q < 1 ? Math.sin(Math.PI * q) : 0; // 正在长出来的那一圈更亮
      let a = (0.36 + 0.22 * h) * (fromGhost ? mix(0.35, 1, q) : smooth(0, 0.6, q)) * (1 + 0.3 * front) * (1 - 0.55 * plateOut);
      let r = GOLD[0];
      let g = GOLD[1];
      let b = GOLD[2];
      let halo = (0.6 + 0.8 * h) * (1 + 1.2 * front);
      const lit = i >= R.start && i < R.end ? smooth(tc[i - R.start] - 3, tc[i - R.start] + 9, f) : 0;
      a = mix(a * (1 - 0.62 * closeUp), 1, lit);
      r = mix(r, HI[0], lit);
      g = mix(g, HI[1], lit);
      b = mix(b, HI[2], lit);
      halo *= 1 - 0.7 * lit;
      size *= 1 + 0.12 * lit;
      if (i >= seeEnd && i < R.end) halo *= 1 + 2.2 * endGlow * (0.75 + 0.25 * Math.sin(t * 3));
      st.size[i] = size;
      st.rot[i] = 0;
      st.halo[i] = halo;
      st.col[i * 4] = r;
      st.col[i * 4 + 1] = g;
      st.col[i * 4 + 2] = b;
      st.col[i * 4 + 3] = a;
    }
  }

  // ================= 小黑点 / 马蜂身体（墨字，normal 混合）
  const flyA = (f < L0 ? 0 : 1) * (1 - smooth(PAGE_START, PAGE_START + 22, f));
  let squash = 0;
  if (flyA > 0) {
    const BUCK = 7;
    const P: [number, number][] = [];
    for (let bk = 0; bk < BUCK; bk++) P.push(dotPos(f - bk * 0.5));
    const soft = shut; // 闭眼时小黑点更虚
    if (f < REV_START) {
      for (let i = 0; i < NB; i++) {
        const lag = hash01(i, 21) < 0.45 ? hash01(i, 22) * (BUCK - 1.001) : 0; // 0..6 个半帧：连续的拖影
        const b0 = Math.floor(lag);
        const fr = lag - b0;
        const px = mix(P[b0][0], P[b0 + 1][0], fr);
        const py = mix(P[b0][1], P[b0 + 1][1], fr);
        const lagB = lag / 2;
        const k = i * 3;
        const jit = hash01(i, 23) < 0.5 ? 1.3 : 0;
        fly.pos[k] = px + (T.dotB[k] - T.cx) * sW + jit * (hash01(i + f * 7919, 24) - 0.5) * 2;
        fly.pos[k + 1] = py + (T.dotB[k + 1] - T.cy) * sW + jit * (hash01(i + f * 7919, 25) - 0.5) * 2;
        fly.pos[k + 2] = 0;
        fly.size[i] = mix(2.4, 3.4, soft);
        fly.rot[i] = 0;
        fly.halo[i] = 0;
        fly.col[i * 4] = INK[0];
        fly.col[i * 4 + 1] = INK[1];
        fly.col[i * 4 + 2] = INK[2];
        fly.col[i * 4 + 3] = flyA * mix(0.72, 0.42, soft) * (1 - lagB * 0.17);
      }
    } else {
      // 炸开成马蜂（拍上落定）→ 照片接手 →（假如）缩回小黑点 → 拍中，压扁
      const pr = prog(f, REV_START, REV_LAND, EASE.linear);
      const pc = prog(f, fIf, fIf + 17, EASE.linear);
      squash = smooth(fHit + 1, fHit + 5, f);
      if (f < fIf) morphQ(fly.pos, T.dotB, T.body, NB, pr, T.rkB, T.qB, {s: 0.5, swirl: 70, lift: 260, seed: 75, ease: EASE.out, scale: sW});
      else morphQ(fly.pos, T.body, T.dotB, NB, pc, T.rkBin, T.qB, {s: 0.4, swirl: 40, lift: 0, seed: 77, ease: EASE.inOut, scale: sW});
      const bodyVis = 1 - 0.9 * waspA;
      for (let i = 0; i < NB; i++) {
        const k = i * 3;
        const q = f < fIf ? T.qB[i] : 1 - T.qB[i]; // 1 = 在马蜂上
        const h = hash01(i, 26);
        if (squash > 0) {
          const ox = fly.pos[k] - T.cx * sW;
          const oy = fly.pos[k + 1] - T.cy * sW;
          fly.pos[k] = T.cx * sW + ox * (1 + 0.9 * squash);
          fly.pos[k + 1] = T.cy * sW + oy * (1 - 0.6 * squash);
        }
        const pc3 = COL ? [COL.b[k], COL.b[k + 1], COL.b[k + 2]] : INK;
        let r = mix(INK[0], pc3[0], q);
        let g = mix(INK[1], pc3[1], q);
        let b = mix(INK[2], pc3[2], q);
        r = mix(r, GREY[0], grey);
        g = mix(g, GREY[1], grey);
        b = mix(b, GREY[2], grey);
        fly.size[i] = mix(2.4, 4.6 + 3.6 * h * h, q);
        fly.rot[i] = 0;
        fly.halo[i] = 0;
        fly.col[i * 4] = r;
        fly.col[i * 4 + 1] = g;
        fly.col[i * 4 + 2] = b;
        fly.col[i * 4 + 3] = flyA * mix(0.72, 0.86, q) * (f < fIf ? mix(1, bodyVis, q) : 1);
      }
    }
  } else {
    for (let i = 0; i < NB; i++) fly.col[i * 4 + 3] = 0;
  }

  // ================= 镜头（只在书页阶段动；之前固定，DOM 标签和字对齐）
  const full: Cam = {pos: [0, 0, camZ()]};
  const ctr = (a: number, b: number): [number, number] => {
    let sx = 0;
    let sy = 0;
    for (let i = a; i < b; i++) {
      const [x, y] = PAGE.xy(i);
      sx += x;
      sy += y;
    }
    return [sx / (b - a), sy / (b - a)];
  };
  const Z = 46;
  const segCam = (a: number, b: number, z = Z, off = 34) => {
    const [x, y] = ctr(a, b);
    return camOn(x, y - off * (Z / z), PAGE.cell, z);
  };
  const s1 = R.nonP[13]; // 「没」：第二段起点
  const s2 = R.nonP[25]; // 「只」：第三段起点
  const c1 = segCam(R.start, s1);
  const c2 = segCam(s1, s2);
  const c3 = segCam(s2, R.end);
  const cAll = (() => {
    const zz = 19;
    const [x, y] = ctr(R.start, R.end);
    const tx = x + ((540 - SAFE.cx) * PAGE.cell) / zz; // 让整句的中心落在安全区中线 x≈444
    return camOn(tx, y - (180 * PAGE.cell) / zz, PAGE.cell, zz);
  })();
  const seq: [number, Cam][] = [
    [0, full],
    [PAGE_LAND - 2, full],
    [PAGE_LAND + 26, c1],
    [fNo1 - 8, c1],
    [fNo1 + 10, c2],
    [fSee - 5, c2],
    [fSee + 13, c3],
    [fSee + 66, c3],
    [dur - 2, cAll],
  ];
  let cam = full;
  for (let k = 1; k < seq.length; k++) {
    if (f <= seq[k][0]) {
      const [f0, a0] = seq[k - 1];
      const [f1, a1] = seq[k];
      cam = camMix(a0, a1, EASE.inOut(Math.min(1, Math.max(0, (f - f0) / Math.max(1, f1 - f0)))));
      break;
    }
    cam = seq[k][1];
  }

  // ================= DOM
  const domX = (x: number) => 540 + x;
  const domY = (y: number) => 960 - y;
  const [sx0, sy0] = dotPos(fSwat - 2); // 拍下去的那一刻小黑点在哪
  // 「苍蝇？」标签：跟着小黑点（取前几帧的平均，稳一点）
  let lx = 0;
  let ly = 0;
  for (const lag of [2, 5, 8, 11, 14]) {
    const [x, y] = dotPos(f - lag);
    lx += x / 5;
    ly += y / 5;
  }
  const tagA = smooth(fFly - 6, fFly + 6, f) * (1 - smooth(REV_START - 2, REV_START + 6, f));
  const tagX = Math.max(SAFE.x0 + 90, Math.min(SAFE.x1 - 90, domX(lx)));
  const tagY = Math.max(SAFE.y0 + 40, Math.min(1250, domY(ly) + 66));
  const wx = domX(T.cx * sW);
  const wy = domY(T.cy * sW);
  const bloom = smooth(REV_START + 4, REV_LAND, f) * (1 - 0.6 * smooth(REV_LAND, REV_LAND + 30, f)) * (1 - grey);
  const crossA = smooth(fHit + 4, fHit + 7, f) * plateOut;
  const flyTagA = smooth(fLife - 6, fLife + 8, f) * plateOut;
  const flyTagHit = f >= fFly2 ? Math.exp(-(f - fFly2) / 14) : 0;
  const chapA = smooth(fLast - 4, fLast + 10, f) * (1 - smooth(fHalf + 30, fHalf + 44, f));
  const srcA = smooth(PAGE_LAND + 14, PAGE_LAND + 30, f);
  const chName = R.ch.title.split('·')[0];
  const lidRy = (1 - lid) * 78; // 眼睛开口（椭圆的纵向半径，%）
  const roomBlur = 3.2 * drowsy + 9 * shut;
  const cleanBlur = 12 * (1 - smooth(fOpen + 2, fOpen + 28, f));
  const greyF = grey > 0.001 ? ` grayscale(${0.85 * grey}) brightness(${1 - 0.12 * grey})` : '';
  const cleanDim = keyframes(f, [[REV_START - 4, 1], [REV_LAND - 8, 0.48], [REV_LAND + 4, 0.5], [REV_LAND + 26, 1]]);

  return (
    <AbsoluteFill>
      <Backdrop light={[0.5, 0.45]} />
      {/* 午后卧室 → 闭眼时换成窗前 → 马蜂照片 */}
      <Plate src="img/room_noon.jpg" p={kbP} from={{s: 1}} to={{s: 1.07, y: 26}} opacity={1 - cleanA} grade="saturate(.95) brightness(.97)" blur={roomBlur} />
      {cleanA < 0.999 ? (
        <div
          style={{
            position: 'absolute', left: 640 - 170, top: 430, width: 340, height: 1000, transformOrigin: '50% 0%', transform: 'rotate(24.8deg)',
            background: 'radial-gradient(ellipse 50% 50% at 50% 34%, rgba(255,228,172,.62) 0%, rgba(255,228,172,0) 100%)',
            mixBlendMode: 'screen', filter: 'blur(18px)', opacity: (0.42 + 0.1 * Math.sin(t * 0.9)) * (1 - cleanA) * (1 - 0.6 * shut) * (1 + 0.35 * smooth(at('午后') - 6, at('午后') + 20, f)),
          }}
        />
      ) : null}
      <PlateURL src={CLEAN as string} s={sW} opacity={cleanA * plateOut} filter={`brightness(${cleanDim}) blur(${cleanBlur.toFixed(2)}px)${greyF}`} />
      <Plate src="img/wasp.jpg" p={1} from={{s: sW}} to={{s: sW}} opacity={waspA * plateOut} grade={`brightness(${cleanDim})${greyF}`} />
      {grey > 0.001 ? <AbsoluteFill style={{background: 'rgb(118,132,156)', opacity: 0.16 * grey * plateOut}} /> : null}
      {bloom > 0.002 ? (
        <AbsoluteFill style={{background: `radial-gradient(circle 430px at ${wx}px ${wy}px, rgba(255,206,140,.55) 0%, rgba(255,206,140,0) 72%)`, mixBlendMode: 'screen', opacity: bloom}} />
      ) : null}
      <GlyphCanvas camera={cam} style={{filter: drowsy + shut > 0.01 ? `blur(${(0.8 * drowsy + 1.6 * shut).toFixed(2)}px)` : undefined}}>
        <GlyphLayer state={st} glow={0.55} halo={0.17} haloSize={3.2} />
      </GlyphCanvas>
      {/* 眼皮：中间留一道椭圆的缝，闭上时透着暖光 */}
      {lid > 0.002 ? (
        <>
          <AbsoluteFill style={{background: `radial-gradient(ellipse 125% ${lidRy}% at 50% 47%, rgba(70,36,18,0) 60%, rgba(70,36,18,.88) 100%)`, opacity: smooth(0, 0.06, lid)}} />
          <AbsoluteFill style={{background: '#FFC796', mixBlendMode: 'multiply', opacity: 0.6 * shut}} />
        </>
      ) : null}
      <GlyphCanvas camera={full}>
        <GlyphLayer state={fly} glow={0} blend="normal" />
      </GlyphCanvas>
      <Swipe f={f} f0={fSwat - 6} x0={domX(sx0) + 420} y0={domY(sy0) + 560} x1={domX(sx0) - 560} y1={domY(sy0) - 300} />
      <Swipe f={f} f0={fHit - 5} x0={wx + 420} y0={wy + 560} x1={wx - 560} y1={wy - 300} />
      <Vignette amount={0.45} />
      {tagA > 0.01 ? (
        <div style={{position: 'absolute', left: tagX, top: tagY, transform: 'translateX(-50%)', opacity: tagA, fontFamily: SERIF, fontSize: 44, color: '#FFF3DC', letterSpacing: '0.08em', textShadow: '0 2px 14px rgba(0,0,0,.75)', whiteSpace: 'nowrap'}}>
          苍蝇？
        </div>
      ) : null}
      <Cross x={wx} y={wy} p1={prog(f, fHit + 5, fHit + 10, EASE.out)} p2={prog(f, fHit + 10, fHit + 15, EASE.out)} opacity={crossA} />
      {flyTagA > 0.01 ? (
        <div style={{position: 'absolute', left: wx, top: wy + 104, transform: `translateX(-50%) scale(${1 + 0.06 * flyTagHit})`, opacity: flyTagA, filter: `blur(${(1 - smooth(fLife - 6, fLife + 8, f)) * 6}px)`, fontFamily: SERIF, fontSize: 72, color: '#F1ECE4', letterSpacing: '0.22em', textShadow: `0 2px 16px rgba(0,0,0,.6), 0 0 ${24 * flyTagHit}px rgba(255,240,220,.6)`, whiteSpace: 'nowrap'}}>
          苍蝇
        </div>
      ) : null}
      {chapA > 0.01 ? <Label text={`《人选天选论》· ${R.ch.title.replace('·', ' · ')}`} x={SAFE.x0 + 8} y={392} p={chapA} size={32} /> : null}
      {plateOut > 0.01 ? <Label text="AI 示意图" x={SAFE.x1} y={1262} p={plateOut * 0.9} size={30} align="right" /> : null}
      {srcA > 0.01 ? <Label text={`《人选天选论》· ${chName} · 原文`} x={SAFE.x0 + 8} y={392} p={srcA} size={32} /> : null}
    </AbsoluteFill>
  );
};

export const S: SceneMod = {
  C,
  hideSubs: [],
  sfx: ({at}) => {
    const land = at('马蜂');
    return [
      [at('嗡嗡响') - 12, 'buzz', 0.14, 90],
      [at('拍') - 5, 'swat', 0.2, 17],
      [at('没拍到') - 4, 'buzz', 0.1, 75],
      [land - 36, 'gather', 0.2, 80],
      [at('拍中') - 3, 'swat', 0.16, 17],
      [at('拍中') + 6, 'scratch', 0.1, 22],
      [at('一个错误的世界') - 2, 'page', 0.14, 26],
      [at('没有看见') + 4, 'chime', 0.12, 80],
    ];
  },
};
