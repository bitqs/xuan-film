// 场景 F1 · 一枚硬币（f1–f5）。
// 第 0 帧：书页上空一团字的漩涡 →「硬币」时落成一枚 3D 硬币（币面就是第三章的原文，34952 字里的一段）→ 字取照片的颜色，凝成熊猫纪念币照片
// →「换一辆自行车」：从硬币开一扇圆窗，换成自行车 → 圆窗收回成硬币（交给硬币）。
// 掷硬币：每一次落地都踩在念到的「正」「反」那个字上（atc），书页从落点泛起一圈涟漪；正面 = 字拼成的熊猫纪念币，反面暗金、浮雕「反」。
// 规则卡被划掉、改写（两次正面 → 两次反面 → 一正一反 → 三次不连续相同，全部出自书），越翻越快。
// 「店里的人一看」：推近，币面上的字读得出来（就是书里这件事的原文），一道划痕，金色的字剥落，底下露出银白色的字。
// 原句在币面上亮起（书里真有这句）→ 飞出来组成引文卡。
import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import type {At, Atc, Cue, SceneMod, SceneProps} from '../core/timeline';
import {Backdrop, Label, PAL, Plate, SAFE, SANS, SERIF, SERIF_BLACK, Title, Vignette} from '../core/look';
import {EASE, clamp01, hex, keyframes, mix, prog, smooth} from '../core/anim';
import {findInBook} from '../core/book';
import {Cam, GlyphCanvas, GlyphLayer, Mask, N_BOOK, camMix, camOn, camZ, hash01, noise3, sampleImg, usePage, useGState, useImageData, useTextMask} from '../core/glyph';

const N = N_BOOK;
const R = 250; // 硬币半径（局部单位；静止在书页上时 = 像素）
const CELL = 5.8; // 币面字格
const TH = 18; // 厚度
const K_ROWS = Math.floor((2 * R) / CELL); // 86 行
const RIM_RINGS = 4;
const RIM_PER = Math.ceil((2 * Math.PI * R) / CELL);
const HOME = {x: SAFE.cx - 540, y: 80}; // 掷硬币的位置（中心原点，y 向上）：屏幕 (444, 880)
const PHOTO = {x: 4, y: 8, sx: 276 / R, sy: 294 / R}; // coin_panda.jpg 里那枚币
const GOLD = hex(PAL.gold);
const HI = hex(PAL.goldHi);
const AMB = hex(PAL.amber);
const DARK: [number, number, number] = [mix(AMB[0], GOLD[0], 0.3) * 0.86, mix(AMB[1], GOLD[1], 0.3) * 0.8, mix(AMB[2], GOLD[2], 0.3) * 0.7];
const SILVER: [number, number, number] = [0.93, 0.95, 0.98];
const CARD = {fs: 70, step: 74, y1: 200, y2: 92}; // 引文卡：字号、字距、两行的 y
const CHIP_Y = 1215; // 结果小圆片（DOM y）

const maskAt = (m: Mask, x: number, y: number) => {
  const u = Math.floor(((x + 540) / 1080) * m.w);
  const v = Math.floor(((960 - y) / 1920) * m.h);
  if (u < 0 || v < 0 || u >= m.w || v >= m.h) return 0;
  return m.a[v * m.w + u] / 255;
};

// ------------------------------------------------------------------ 硬币的几何（币面 = 书的一段，按行排成圆）
const buildCoin = () => {
  const rows: number[] = [];
  for (let k = 0; k < K_ROWS; k++) {
    const v = (K_ROWS / 2 - k - 0.5) * CELL;
    const hw = Math.sqrt(Math.max(0, R * R - v * v)) - CELL * 0.3;
    rows.push(Math.max(0, Math.floor((2 * hw) / CELL)));
  }
  const nF = rows.reduce((a, b) => a + b, 0);
  // 让原句「我不是在等一个答案，我是在等一个理由」正好落在币面正中那一行
  const quote = findInBook('我不是在等一个答案，我是在等一个理由');
  const km = K_ROWS / 2 - 1;
  let g0 = 0;
  for (let k = 0; k < km; k++) g0 += rows[k];
  g0 += Math.floor(rows[km] / 2) - 9;
  const F0 = quote.start - g0;
  const nR = RIM_RINGS * RIM_PER;
  const nC = 2 * nF + nR;
  const lu = new Float32Array(nC);
  const lv = new Float32Array(nC);
  const lw = new Float32Array(nC);
  const dv = new Float32Array(nC); // 这一面朝镜头时的 y（浮雕取样用）
  const kind = new Uint8Array(nC); // 0 正面 1 反面 2 边
  const ring = new Float32Array(nC);
  let c = 0;
  for (let face = 0; face < 2; face++)
    for (let k = 0; k < K_ROWS; k++) {
      const v = (K_ROWS / 2 - k - 0.5) * CELL;
      const L = rows[k];
      for (let j = 0; j < L; j++) {
        lu[c] = -(L * CELL) / 2 + CELL / 2 + j * CELL;
        dv[c] = v;
        lv[c] = face === 0 ? v : -v; // 反面上下颠倒排，翻过来正好正着读
        lw[c] = face === 0 ? TH / 2 : -TH / 2;
        kind[c] = face;
        const r = Math.hypot(lu[c], v);
        ring[c] = Math.min(1, smooth(0.885 * R, 0.915 * R, r) + 0.8 * Math.exp(-(((r - 0.79 * R) / (0.55 * CELL)) ** 2)));
        c++;
      }
    }
  for (let rg = 0; rg < RIM_RINGS; rg++)
    for (let j = 0; j < RIM_PER; j++) {
      const ph = ((j + (rg % 2) * 0.5) / RIM_PER) * Math.PI * 2;
      lu[c] = R * Math.cos(ph);
      lv[c] = R * Math.sin(ph);
      dv[c] = lv[c];
      lw[c] = (-0.5 + (rg + 0.5) / RIM_RINGS) * TH;
      kind[c] = 2;
      c++;
    }
  const center = (r: {start: number; end: number}): [number, number] => {
    let su = 0;
    let sv = 0;
    for (let i = r.start; i < r.end; i++) {
      su += lu[i - F0];
      sv += lv[i - F0];
    }
    return [su / (r.end - r.start), sv / (r.end - r.start)];
  };
  const phrase = findInBook('这不是真金币。这是银币镀金');
  const notGold = findInBook('这不是真金币');
  const plated = findInBook('这是银币镀金');
  const [qu, qv] = center(findInBook('银币镀金'));
  // 划痕：穿过「银币镀金」的一条斜线（左上 → 右下）
  const A = -0.44;
  const ca = Math.cos(A);
  const sa = Math.sin(A);
  const band: number[] = [];
  const bandS: number[] = [];
  const bandOf = new Int32Array(nC).fill(-1);
  const groove = new Float32Array(nC);
  const along = new Float32Array(nC);
  for (let k = 0; k < nF; k++) {
    const du = lu[k] - qu;
    const dd = lv[k] - qv;
    const s = du * ca + dd * sa;
    const d = -du * sa + dd * ca;
    const bw = CELL * (1.0 + 0.35 * noise3(s / 22, 3.1, 0.5, 77));
    along[k] = s;
    const ad = Math.abs(d);
    if (ad >= bw && ad < bw + 1.1 * CELL) groove[k] = 1 - (ad - bw) / (1.1 * CELL);
    if (ad < bw) {
      bandOf[k] = band.length;
      band.push(k);
      bandS.push(s);
    }
  }
  // 引文卡的目标位置（两行；中心对齐安全区 x = 444）
  const nq = quote.end - quote.start;
  const card = new Float32Array(nq * 3);
  const l1 = 10;
  for (let j = 0; j < nq; j++) {
    const line = j < l1 ? 0 : 1;
    const cnt = line === 0 ? l1 : nq - l1;
    const jj = line === 0 ? j : j - l1;
    card[j * 3] = HOME.x - (cnt * CARD.step) / 2 + CARD.step / 2 + jj * CARD.step;
    card[j * 3 + 1] = line === 0 ? CARD.y1 : CARD.y2;
  }
  return {rows, nF, F0, nR, nC, lu, lv, lw, dv, kind, ring, band, bandS, bandOf, groove, along, quote, phrase, notGold, plated, phraseC: center(phrase), quoteC: center(quote), card, nq, l1};
};

// ------------------------------------------------------------------ 掷硬币的时间表（落地帧 = 念到「正」「反」「掷」的那个字）
type Toss = {l: number; air: number; res: 0 | 1; half: number; z: number};
const tossesFrom = (at: At, atc: Atc): Toss[] => {
  const l0 = atc('一正', 0, 'f2')[1];
  const l1 = atc('一反', 0, 'f2')[1];
  const l2 = atc('一正', 0, 'f3')[1];
  const l3 = atc('一反', 0, 'f3')[1];
  const l4 = at('掷', 0, 0, 'f3');
  const l8 = at('掷', 1, 0, 'f3');
  // [落地帧, 空中帧数, 结果 0=正 1=反, 半圈数（奇偶决定朝上的面）]
  const spec: [number, number, 0 | 1, number][] = [
    [l0, 25, 0, 6],
    [l1, l1 - l0 - 2, 1, 3],
    [l2, 28, 0, 7],
    [l3, l3 - l2 - 3, 1, 5],
    [l4, 23, 0, 7],
    [l4 + 15, 13, 0, 4],
    [l8 - 18, 10, 0, 4],
    [l8 - 9, 8, 1, 5],
    [l8, 8, 0, 5],
  ];
  return spec.map(([l, air, res, half]) => ({l, air, res, half, z: Math.min(700, 28 * air)}));
};
const EPOCH_TOSSES = [[0, 1], [2, 3], [4, 5], [6, 7, 8]];
const RULES = ['两次正面', '两次反面', '一正一反', '三次不连续相同'];
const VERDICT = ['不行', '不行', '也不行', ''];

const coinState = (f: number, T: Toss[]) => {
  let acc = 0;
  let lastLand = -999;
  let amp = 0;
  for (let k = 0; k < T.length; k++) {
    const t = T[k];
    const f0 = t.l - t.air;
    if (f < f0) break;
    if (f < t.l) {
      const s = (f - f0) / t.air;
      const z = t.z * 4 * s * (1 - s);
      return {th: acc + t.half * Math.PI * (1 - Math.pow(1 - s, 1.3)), z, y: 0.06 * z, psi: 0.44 * Math.sin(Math.PI * s) * (hash01(k, 61) - 0.5), air: true, lastLand, amp};
    }
    acc += t.half * Math.PI;
    lastLand = t.l;
    amp = Math.min(1, Math.max(0.45, t.air / 24));
  }
  const a = f - lastLand;
  const wob = lastLand > 0 ? 0.26 * amp * Math.exp(-a / 5) * Math.sin(a * 1.5) : 0;
  const bounce = lastLand > 0 ? 22 * amp * Math.exp(-a / 3.5) * Math.abs(Math.sin(a * 0.9)) : 0;
  return {th: acc + wob, z: bounce, y: 0, psi: 0, air: false, lastLand, amp};
};

// ------------------------------------------------------------------ DOM 小件
const Chip: React.FC<{x: number; res: -1 | 0 | 1; p: number; dim: number; glow: number}> = ({x, res, p, dim, glow}) => {
  const base: React.CSSProperties = {position: 'absolute', left: x - 48, top: CHIP_Y - 48, width: 96, height: 96, borderRadius: 48, boxSizing: 'border-box'};
  const slot = <div style={{...base, border: '3px dashed rgba(242,217,160,.38)', opacity: dim}} />;
  if (res < 0 || p <= 0.001) return slot;
  const s = 1 + 0.4 * (1 - p);
  const face: React.CSSProperties =
    res === 0
      ? {background: 'radial-gradient(circle at 34% 30%, #FFF8E2 0%, #F2D9A0 45%, #C08A45 100%)', color: '#2A1D0E', boxShadow: `0 0 ${20 + 40 * glow}px rgba(255,205,130,${0.4 + 0.4 * glow})`}
      : {background: 'radial-gradient(circle at 34% 30%, #5E4428 0%, #2B1F13 75%)', border: '3px solid rgba(232,164,90,.9)', color: PAL.amber, boxShadow: `0 0 ${14 + 40 * glow}px rgba(232,164,90,${0.25 + 0.4 * glow})`};
  return (
    <>
      {p < 1 ? slot : null}
      <div style={{...base, ...face, opacity: Math.min(1, p * 1.5) * dim, transform: `scale(${s})`, fontFamily: SERIF_BLACK, fontSize: 56, lineHeight: '90px', textAlign: 'center'}}>{res === 0 ? '正' : '反'}</div>
    </>
  );
};

const C: React.FC<SceneProps> = ({f, at, atc}) => {
  const st = useGState();
  const pg = useGState();
  const page = usePage();
  const G = useMemo(buildCoin, []);
  const sv = useGState(G.band.length);
  const mZ = useTextMask('正', {size: 300, y: -6});
  const mF = useTextMask('反', {size: 300, y: -6});
  const panda = useImageData('img/coin_panda.jpg', 270, 480);
  const EMB = useMemo(() => {
    if (!mZ || !mF) return null;
    const e = new Float32Array(G.nC);
    for (let c = 0; c < 2 * G.nF; c++) e[c] = maskAt(G.kind[c] === 0 ? mZ : mF, G.lu[c], G.dv[c]);
    return e;
  }, [mZ, mF, G]);
  const PC = useMemo(() => {
    if (!panda) return null;
    const out = new Float32Array(G.nF * 4);
    for (let c = 0; c < G.nF; c++) {
      const [pr, pgc, pb] = sampleImg(panda, PHOTO.x + G.lu[c] * PHOTO.sx, PHOTO.y + G.dv[c] * PHOTO.sy);
      out[c * 4] = Math.min(1, pr * 1.22);
      out[c * 4 + 1] = Math.min(1, pgc * 1.2);
      out[c * 4 + 2] = Math.min(1, pb * 1.15);
      out[c * 4 + 3] = 0.2126 * pr + 0.7152 * pgc + 0.0722 * pb;
    }
    return out;
  }, [panda, G]);
  const T = useMemo(() => tossesFrom(at, atc), [at, atc]);
  const K = useMemo(() => {
    const strikes = [0, at('那就', 0, 0, 'f3'), at('改规则'), at('再改')];
    const writes = [atc('两次正面', 0, 'f2'), atc('两次反面', 0, 'f3'), [0, 3, 6, 9].map((d) => strikes[2] + 5 + d), [0, 2, 4, 6, 8, 10, 12].map((d) => strikes[3] + 4 + d)];
    const verdict = [T[1].l + 8, T[3].l + 8, T[5].l + 6, T[8].l + 3];
    return {
      strikes,
      writes,
      verdict,
      sell: atc('就去卖', 0, 'f2'),
      twelve: atc('十二岁'),
      panda: at('熊猫'),
      swap: at('换'),
      hand: at('交给'),
      coin2: at('硬币', 1),
      zheng: atc('两次正面', 0, 'f2')[2],
      last: at('最后'),
      soldF: at('卖了'),
      look: at('看'),
      notGold: at('金币'),
      silver: at('银'),
      plated: at('镀金'),
      said: at('他说'),
      qSpoken: atc('我不是在等一个答案，我是在等一个理由', 0, 'f5'),
    };
  }, [at, atc, T]);

  if (!EMB || !PC) return <Backdrop />;
  const t = f / 30;

  // ---------------- 硬币这一帧的姿态
  const FORM = 64; // 字漩涡落成硬币（「硬币」的「币」）
  const REFORM = K.hand - 4; // 圆窗收回，硬币重新出现
  let cx = HOME.x;
  let cy = HOME.y;
  let cz = 0;
  let sx = 1;
  let sy = 1;
  let th = 0;
  let psi = 0;
  let vis = 1;
  let lastLand = -999;
  let amp = 0.8;
  let inAir = false;
  if (f < REFORM) {
    cx = PHOTO.x;
    cy = PHOTO.y;
    const ov = prog(f, 100, 134);
    sx = mix(1.14, PHOTO.sx, ov);
    sy = mix(1.14, PHOTO.sy, ov);
    psi = 0.5 * Math.sin(Math.PI * clamp01((f - 68) / 62));
    vis = 1 - prog(f, K.panda - 6, K.panda + 14, EASE.inOut);
    if (f >= FORM) lastLand = FORM;
  } else {
    const s = coinState(f, T);
    th = s.th;
    cz = s.z;
    cy += s.y;
    psi = s.psi;
    inAir = s.air;
    if (s.lastLand > 0) {
      lastLand = s.lastLand;
      amp = s.amp;
    }
  }
  // 结尾：硬币往下、往后退，让出引文
  const rec = prog(f, 838, 886, EASE.inOut);
  cy = mix(cy, -330, rec);
  cz = mix(cz, -420, rec);
  vis *= 1 - 0.5 * rec;
  const reform = prog(f, REFORM, REFORM + 26, EASE.linear);

  const cT = Math.cos(th);
  const sT = Math.sin(th);
  const cP = Math.cos(psi);
  const sP = Math.sin(psi);
  const nzF = cT * cP;
  const visF = smooth(-0.05, 0.4, nzF);
  const visB = smooth(-0.05, 0.4, -nzF);
  const edgeOn = 1 - Math.abs(nzF);
  const sizeK = 0.55 + 0.45 * Math.abs(nzF);
  const sAvg = (sx + sy) / 2;
  const flash = lastLand > 0 ? Math.exp(-(f - lastLand) / 6) * amp : 0;
  const embK = smooth(REFORM + 6, REFORM + 26, f) * (1 - smooth(K.last + 4, K.last + 44, f));
  const ringK = 0.55 + 0.45 * (1 - smooth(K.last + 4, K.last + 44, f));
  const closeUp = smooth(K.last + 10, K.last + 56, f) * (1 - smooth(836, 868, f));
  // 光泽：翻转时一道斜光扫过币面；念到「正面」时也扫一下
  const spinG = inAir ? ((((th / Math.PI) % 1) + 1) % 1) * 2.8 * R - 1.4 * R : 9999;
  const sweep = f > K.zheng - 4 && f < K.zheng + 30 ? mix(-1.4 * R, 1.4 * R, prog(f, K.zheng - 4, K.zheng + 26)) : 9999;
  const pForm = prog(f, 2, FORM, EASE.linear);
  const photoMix = f < REFORM ? prog(f, K.panda - 34, K.panda - 12) : 0.92 * (1 - smooth(K.last + 4, K.last + 40, f));
  const hiPhrase = (i: number) =>
    (i >= G.notGold.start && i < G.notGold.end ? smooth(K.notGold - 12, K.notGold - 2, f) : 0) + (i >= G.plated.start && i < G.plated.end ? smooth(K.silver - 10, K.silver, f) : 0);
  const phraseOff = 1 - smooth(800, 816, f);
  const quoteLit = smooth(806, 820, f);
  const otherDim = 1 - 0.55 * quoteLit * (1 - smooth(846, 880, f));
  const pFly = prog(f, 828, 880, EASE.linear);
  const toDom = prog(f, 878, 892);
  const peel0 = K.look + 1;
  const silverFlash = f >= K.silver ? Math.exp(-(f - K.silver) / 14) : 0;

  const xf = (u: number, v: number, w: number, out: Float32Array, k3: number) => {
    const y1 = v * cT - w * sT;
    const z1 = v * sT + w * cT;
    out[k3] = cx + u * cP + z1 * sP;
    out[k3 + 1] = cy + y1;
    out[k3 + 2] = cz - u * sP + z1 * cP;
  };

  for (let c = 0; c < G.nC; c++) {
    const i = G.F0 + c;
    const k3 = i * 3;
    const k4 = i * 4;
    const kd = G.kind[c];
    const h = hash01(i, 3);
    let u = G.lu[c] * sx;
    let v = G.lv[c] * sy;
    let w = G.lw[c] * sAvg;
    let rot = 0;
    let peelA = 1;
    let peelHi = 0;
    // 划痕：金字剥落（只在正面）
    const b = G.bandOf[c];
    if (b >= 0 && f >= peel0) {
      const tp = peel0 + 18 * clamp01((G.bandS[b] + 70) / 140) + 3 * hash01(i, 41);
      if (f >= tp) {
        const age = f - tp;
        w += 70 * (1 - Math.exp(-age / 7)) + 1.4 * age;
        u += age * 1.3 * (hash01(i, 42) - 0.3);
        v -= age * 0.8 * hash01(i, 43);
        rot = (hash01(i, 44) - 0.5) * 0.16 * age;
        peelA = Math.exp(-age / 20);
        peelHi = Math.exp(-age / 4);
      }
    }
    xf(u, v, w, st.pos, k3);
    // 颜色 / 大小
    const e = kd === 1 ? Math.min(1, Math.max(EMB[c] * embK, G.ring[c] * ringK)) : kd === 0 ? G.ring[c] * ringK * 0.55 : 0;
    let r: number;
    let g: number;
    let bl: number;
    let a: number;
    if (kd === 0) {
      r = mix(GOLD[0], HI[0], e);
      g = mix(GOLD[1], HI[1], e);
      bl = mix(GOLD[2], HI[2], e);
      a = (0.55 + 0.2 * h + 0.3 * e) * visF;
    } else if (kd === 1) {
      r = mix(DARK[0], GOLD[0], e);
      g = mix(DARK[1], GOLD[1], e);
      bl = mix(DARK[2], GOLD[2], e);
      a = (0.36 + 0.16 * h + 0.6 * e) * visB;
    } else {
      r = mix(AMB[0], GOLD[0], 0.5);
      g = mix(AMB[1], GOLD[1], 0.5);
      bl = mix(AMB[2], GOLD[2], 0.5);
      a = 0.1 + 0.6 * edgeOn + 0.1 * h;
    }
    let size = CELL * mix(0.98, 0.9, closeUp) * sAvg * (kd < 2 ? sizeK : 1);
    let halo = (0.7 + 1.5 * e) * (1 + 2.5 * flash);
    // 光泽
    if (kd < 2) {
      const pj = (G.lu[c] + G.dv[c]) * 0.707;
      const gl = Math.exp(-(((pj - spinG) / 42) ** 2)) + 0.8 * Math.exp(-(((pj - sweep) / 50) ** 2));
      if (gl > 0.01) {
        a = Math.min(1, a + 0.45 * gl * (kd === 0 ? visF : visB));
        r = mix(r, 1, 0.5 * gl);
        g = mix(g, 0.97, 0.5 * gl);
        bl = mix(bl, 0.88, 0.5 * gl);
      }
    }
    // 近景：书里这件事的原文亮起来
    if (kd === 0 && closeUp > 0) {
      a = mix(a, 0.5 + 0.12 * h, closeUp);
      r = mix(r, mix(GOLD[0], AMB[0], 0.35), closeUp);
      g = mix(g, mix(GOLD[1], AMB[1], 0.35), closeUp);
      bl = mix(bl, mix(GOLD[2], AMB[2], 0.35), closeUp);
      if (G.groove[c] > 0 && f >= peel0) {
        const tg = peel0 + 18 * clamp01((G.along[c] + 70) / 140);
        a *= 1 - 0.7 * G.groove[c] * smooth(tg, tg + 8, f);
      }
      const lit = hiPhrase(i) * phraseOff;
      if (lit > 0) {
        a = mix(a, 1, lit);
        size *= 1 + 0.08 * lit;
        r = mix(r, HI[0], lit);
        g = mix(g, HI[1], lit);
        bl = mix(bl, HI[2], lit);
      }
    }
    halo *= 1 - 0.85 * closeUp;
    // 原句：亮起 → 飞出去组成引文卡
    const isQ = i >= G.quote.start && i < G.quote.end;
    if (isQ) {
      a = mix(a, 1, quoteLit);
      r = mix(r, HI[0], quoteLit);
      g = mix(g, HI[1], quoteLit);
      bl = mix(bl, HI[2], quoteLit);
      if (pFly > 0) {
        const j = i - G.quote.start;
        let q = pFly * 1.45 - 0.45 * (j / (G.nq - 1));
        q = q <= 0 ? 0 : q >= 1 ? 1 : EASE.inOut(q);
        const fx = HOME.x + G.lu[c];
        const fy = HOME.y + G.lv[c];
        st.pos[k3] = mix(fx, G.card[j * 3], q);
        st.pos[k3 + 1] = mix(fy, G.card[j * 3 + 1], q);
        st.pos[k3 + 2] = mix(TH / 2, 0, q) + 300 * Math.sin(Math.PI * q);
        size = mix(size, CARD.fs / 0.8333, q);
        a = (1 - toDom) * Math.max(a, q);
        halo = 0.6 * (1 - q) + 0.25;
      }
    } else a *= otherDim;
    if (peelA < 1 || peelHi > 0) {
      a *= peelA;
      r = mix(r, HI[0], 0.6);
      g = mix(g, HI[1], 0.6);
      bl = mix(bl, HI[2], 0.6);
      halo *= 1 + 5 * peelHi;
      size *= 1 + 0.25 * (1 - peelA);
    }
    // 第 0 帧：字的漩涡 → 落成硬币
    if (f < FORM + 2) {
      const h1 = hash01(i, 31);
      const h3 = hash01(i, 33);
      const rs = 330 + 640 * Math.pow(h1, 0.75);
      const arm = hash01(i, 32) < 0.5 ? 0 : Math.PI;
      const ang = arm + 2.6 * Math.log(rs / 330) + (hash01(i, 36) - 0.5) * (0.5 + rs / 900) + t * (1.2 - rs / 1300);
      let q = pForm * 1.6 - 0.6 * hash01(i, 34);
      q = q <= 0 ? 0 : q >= 1 ? 1 : EASE.inOut(q);
      st.pos[k3] = mix(cx + rs * Math.cos(ang), st.pos[k3], q);
      st.pos[k3 + 1] = mix(cy + rs * Math.sin(ang) * 1.15, st.pos[k3 + 1], q);
      st.pos[k3 + 2] = mix((h3 - 0.5) * 520, st.pos[k3 + 2], q) + 420 * Math.sin(Math.PI * q) * (0.4 + h3);
      size = mix(4.5 + 9 * h * h * h, size, q);
      a = mix(0.3 + 0.4 * h, a, q);
      halo = mix(1 + 1.5 * h, halo, q);
    }
    // 字取照片的颜色 → 凝成熊猫纪念币
    if (photoMix > 0 && kd === 0 && peelA === 1) {
      const lum = PC[c * 4 + 3];
      r = mix(r, PC[c * 4], photoMix);
      g = mix(g, PC[c * 4 + 1], photoMix);
      bl = mix(bl, PC[c * 4 + 2], photoMix);
      a = mix(a, (0.22 + 0.78 * Math.min(1, lum * 1.5)) * visF, photoMix);
    }
    // 圆窗收回后，硬币一粒粒落回来
    if (f >= REFORM && f < REFORM + 30) {
      let q = reform * 1.6 - 0.6 * hash01(i, 35);
      q = q <= 0 ? 0 : q >= 1 ? 1 : EASE.out(q);
      st.pos[k3 + 2] += (1 - q) * 160;
      a *= q;
    }
    a *= vis;
    st.size[i] = size;
    st.rot[i] = rot;
    st.halo[i] = halo;
    st.col[k4] = r;
    st.col[k4 + 1] = g;
    st.col[k4 + 2] = bl;
    st.col[k4 + 3] = f >= REFORM - 60 && f < REFORM ? 0 : Math.max(0, Math.min(1, a));
  }

  // ---------------- 银：划痕下面露出来的字
  for (let b2 = 0; b2 < G.band.length; b2++) {
    const c = G.band[b2];
    const i = G.F0 + c;
    const tp = peel0 + 18 * clamp01((G.bandS[b2] + 70) / 140) + 3 * hash01(i, 41);
    const show = f >= peel0 ? smooth(tp + 1, tp + 10, f) : 0;
    xf(G.lu[c] * sx, G.lv[c] * sy, (TH / 2 - 0.6) * sAvg, sv.pos, b2 * 3);
    sv.idx[b2] = st.idx[i];
    sv.size[b2] = CELL * 0.98 * sAvg * sizeK;
    sv.halo[b2] = 0.4 + 1.4 * silverFlash;
    const isQ = i >= G.quote.start && i < G.quote.end;
    sv.col[b2 * 4] = SILVER[0];
    sv.col[b2 * 4 + 1] = SILVER[1];
    sv.col[b2 * 4 + 2] = SILVER[2];
    sv.col[b2 * 4 + 3] = isQ ? 0 : Math.min(1, (0.9 + 0.1 * silverFlash) * show * visF * vis * (1 - 0.75 * quoteLit * (1 - smooth(846, 880, f))));
  }

  // ---------------- 书页（桌面）：硬币的影子 + 每次落地的涟漪
  const pageVis = f < 200 ? 1 - smooth(K.panda - 34, K.panda - 8, f) : smooth(REFORM + 4, REFORM + 30, f) * (1 - 0.45 * smooth(840, 880, f));
  if (pageVis > 0.001) {
    const ripples: [number, number, number, number][] = [];
    if (f >= FORM && f < FORM + 60) ripples.push([FORM, PHOTO.x, PHOTO.y, 0.8]);
    for (const tt of T) if (f >= tt.l && f < tt.l + 60) ripples.push([tt.l, HOME.x, HOME.y, Math.min(1, Math.max(0.45, tt.air / 24))]);
    const shX = cx + 0.22 * cz;
    const shY = cy - 0.12 * cz - 6;
    const shR = R * sAvg * (1 + 0.25 * (cz / 700)) * (0.7 + 0.3 * Math.abs(nzF));
    const shSoft = 22 + 0.12 * Math.max(0, cz);
    const shK = (0.92 - 0.5 * Math.min(1, Math.max(0, cz) / 700)) * vis * (f < REFORM ? smooth(0.55, 1, pForm) * (1 - prog(f, K.panda - 6, K.panda + 14)) : reform);
    for (let i = 0; i < N; i++) {
      const k3 = i * 3;
      const x = page.pos[k3];
      const y = page.pos[k3 + 1];
      const h = hash01(i, 5);
      let z = 0;
      let a = (0.09 + 0.13 * h) * pageVis;
      let lit = 0;
      for (const [rf, rx, ry, ra] of ripples) {
        const age = f - rf;
        const d = Math.hypot(x - rx, y - ry);
        const front = 0.9 * R + 30 * age;
        const wv = Math.exp(-(((d - front) / 60) ** 2)) * Math.exp(-age / 20) * ra;
        z += 50 * wv;
        lit += wv;
      }
      const ds = Math.hypot(x - shX, y - shY);
      const sh = 1 - smooth(shR - shSoft, shR + shSoft, ds);
      a *= 1 - shK * sh;
      a = Math.min(1, a + 0.45 * lit * pageVis);
      pg.pos[k3] = x;
      pg.pos[k3 + 1] = y;
      pg.pos[k3 + 2] = z;
      pg.size[i] = page.cell * 0.96 * (1 + 0.3 * lit);
      pg.halo[i] = 0.3 + 3 * lit;
      pg.col[i * 4] = mix(GOLD[0], HI[0], lit);
      pg.col[i * 4 + 1] = mix(GOLD[1], HI[1], lit);
      pg.col[i * 4 + 2] = mix(GOLD[2], HI[2], lit);
      pg.col[i * 4 + 3] = a;
    }
  }

  // ---------------- 镜头
  const full: Cam = {pos: [0, 0, camZ()]};
  const scrX = HOME.x + G.phraseC[0] + ((540 - SAFE.cx) * CELL) / 50;
  const scrY = HOME.y + G.phraseC[1] - (40 * CELL) / 50;
  const cScr = camOn(scrX, scrY, CELL, 50);
  const quoX = HOME.x + G.quoteC[0] + ((540 - SAFE.cx) * CELL) / 42;
  const quoY = HOME.y + G.quoteC[1] - (10 * CELL) / 42;
  const cQuo = camOn(quoX, quoY, CELL, 42);
  const seq: [number, Cam][] = [
    [0, full],
    [K.last + 4, full],
    [K.last + 58, cScr],
    [782, cScr],
    [808, cQuo],
    [832, cQuo],
    [884, full],
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
  const dr = closeUp * 1.2 * Math.sin(t * 0.6);
  cam = {...cam, pos: [cam.pos![0] + dr, cam.pos![1], cam.pos![2]], target: [(cam.target ? cam.target[0] : cam.pos![0]) + dr, cam.target ? cam.target[1] : cam.pos![1], 0]};

  // ---------------- DOM
  const pandaOp = prog(f, K.panda - 30, K.panda + 8) * (1 - smooth(K.swap + 19, K.swap + 22, f));
  const opening = f < REFORM;
  const irisR = opening ? keyframes(f, [[K.swap - 1, 292], [K.swap + 21, 1300]]) : keyframes(f, [[REFORM - 18, 1300], [REFORM + 4, 250]]);
  const irisX = opening ? 544 : mix(544, SAFE.cx, prog(f, REFORM - 18, REFORM + 4));
  const irisY = opening ? 952 : mix(952, 960 - HOME.y, prog(f, REFORM - 18, REFORM + 4));
  const bikeOp = prog(f, K.swap - 3, K.swap + 4) * (1 - prog(f, REFORM + 2, REFORM + 16));
  const aiTag = prog(f, K.panda - 20, K.panda - 8) * (1 - prog(f, REFORM - 6, REFORM + 6));
  const cardA = 1 - prog(f, K.last + 16, K.last + 34);
  const sold = smooth(K.last, K.last + 10, f);
  const ruleIdx = f < K.strikes[1] ? 0 : f < K.strikes[2] ? 1 : f < K.strikes[3] ? 2 : 3;
  const ruleWidth = (s: string) => [...s].length * 88 * 1.04;
  const tagGold = prog(f, K.notGold - 4, K.notGold + 8) * (1 - prog(f, 790, 806));
  const tagSilver = prog(f, K.silver - 2, K.silver + 10) * (1 - prog(f, 790, 806));
  const srcTag = smooth(806, 818, f);
  const qMark = prog(f, 872, 888);
  const qSrc = prog(f, 884, 900);
  const showQ = f >= 870;

  const chipRows = EPOCH_TOSSES.map((ids, e) => {
    const start = e === 0 ? K.writes[0][1] : K.writes[e][0];
    const end = e < 3 ? K.strikes[e + 1] : 9999;
    if (f < start - 2 || f > end + 14) return null;
    const rowA = prog(f, start - 2, start + 6) * (1 - prog(f, end + 4, end + 14)) * cardA;
    const n = ids.length;
    const total = n * 96 + (n - 1) * 30;
    const x0 = SAFE.cx - total / 2 + 48;
    const failed = e < 3 && f >= K.verdict[e];
    const ok = e === 3 && f >= K.verdict[3];
    const dim = failed ? 0.5 : 1;
    const glow = ok ? 0.6 + 0.4 * Math.exp(-(f - K.verdict[3]) / 10) + 0.4 * sold : 0;
    return (
      <div key={e} style={{position: 'absolute', left: 0, top: 0, width: 1080, height: 1920, opacity: rowA}}>
        {ids.map((id, j) => {
          const tt = T[id];
          const landed = f >= tt.l;
          return <Chip key={j} x={x0 + j * 126} res={landed ? tt.res : -1} p={landed ? prog(f, tt.l - 1, tt.l + 5, EASE.out) : 0} dim={dim} glow={glow + (landed ? Math.exp(-(f - tt.l) / 5) : 0)} />;
        })}
        {VERDICT[e] && f >= K.verdict[e] ? (
          <div style={{position: 'absolute', left: SAFE.cx + total / 2 + 26, top: CHIP_Y, transform: 'translateY(-50%)', fontFamily: SERIF, fontSize: 44, color: 'rgba(242,217,160,.82)', opacity: prog(f, K.verdict[e], K.verdict[e] + 6), letterSpacing: '0.08em', textShadow: '0 2px 12px rgba(0,0,0,.8)', whiteSpace: 'nowrap'}}>
            {VERDICT[e]}
          </div>
        ) : null}
      </div>
    );
  });

  return (
    <AbsoluteFill>
      <Backdrop light={[0.45, 0.45]} />
      <Plate src="img/coin_panda.jpg" p={prog(f, K.panda - 30, K.swap + 20, EASE.linear)} from={{s: 1}} to={{s: 1.04}} opacity={pandaOp} grade="saturate(1.05) brightness(.88)" />
      {bikeOp > 0.001 ? (
        <Plate src="img/bicycle.jpg" p={prog(f, K.swap - 2, REFORM + 16, EASE.linear)} from={{s: 1.07}} to={{s: 1}} opacity={bikeOp} grade="saturate(1.05) brightness(.92)" style={{clipPath: `circle(${irisR}px at ${irisX}px ${irisY}px)`}} />
      ) : null}
      <GlyphCanvas camera={cam}>
        {pageVis > 0.001 ? <GlyphLayer state={pg} glow={0.25} halo={0.08} haloSize={2.6} /> : null}
        <GlyphLayer state={st} glow={0.55} halo={0.16} haloSize={3.2} renderOrder={4} />
        <GlyphLayer state={sv} glow={0.5} halo={0.14} haloSize={2.6} renderOrder={8} />
      </GlyphCanvas>
      <Vignette amount={0.5} />

      {/* f1：12 岁 / AI 示意图 */}
      {f >= K.twelve[0] - 3 && f < REFORM + 14 ? (
        <Title text="12 岁" f={f} at={K.twelve[0]} charStarts={[K.twelve[0], K.twelve[1], K.twelve[2], K.twelve[2]]} size={120} x={SAFE.cx} y={470} out={REFORM - 8} style={{filter: 'drop-shadow(0 4px 22px rgba(0,0,0,.85))'}} />
      ) : null}
      {aiTag > 0.01 ? <Label text="AI 示意图" x={SAFE.x0 + 8} y={352} p={aiTag} size={30} /> : null}

      {/* f2–f3：规则卡 */}
      {f >= K.writes[0][0] - 3 && cardA > 0.001 ? (
        <div style={{position: 'absolute', left: 0, top: 0, width: 1080, height: 1920, opacity: cardA}}>
          <div style={{position: 'absolute', left: SAFE.cx, top: 382, transform: 'translateX(-50%)', fontFamily: SANS, fontSize: 30, letterSpacing: '0.3em', color: 'rgba(242,217,160,.78)', textShadow: '0 2px 10px rgba(0,0,0,.8)', whiteSpace: 'nowrap'}}>
            规则 {ruleIdx + 1}
          </div>
          {RULES.map((txt, e) => {
            const from = e === 0 ? 0 : K.strikes[e];
            const nextS = e < 3 ? K.strikes[e + 1] : 99999;
            if (f < from || f > nextS + 16) return null;
            const out = prog(f, nextS + 6, nextS + 16, EASE.in);
            const strike = prog(f, nextS, nextS + 7, EASE.out);
            const wpx = ruleWidth(txt);
            return (
              <div key={e} style={{position: 'absolute', left: SAFE.cx, top: 470 - 30 * out, transform: 'translate(-50%, -50%)', opacity: 1 - out, whiteSpace: 'nowrap'}}>
                {[...txt].map((ch, j) => {
                  const t0 = K.writes[e][Math.min(j, K.writes[e].length - 1)];
                  const p = prog(f, t0 - 2, t0 + 6, EASE.out);
                  return (
                    <span key={j} style={{display: 'inline-block', fontFamily: SERIF_BLACK, fontSize: 88, lineHeight: 1.2, letterSpacing: '0.04em', color: 'transparent', backgroundImage: `linear-gradient(180deg, #FFF6DC 0%, ${PAL.gold} 45%, ${PAL.amber} 100%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', opacity: p, transform: `translateY(${(1 - p) * 16}px) scale(${mix(1.15, 1, p)})`, filter: `blur(${(1 - p) * 6}px) drop-shadow(0 3px 14px rgba(0,0,0,.75))`}}>
                      {ch}
                    </span>
                  );
                })}
                {strike > 0 ? <div style={{position: 'absolute', left: -6, top: '52%', width: (wpx + 12) * strike, height: 6, borderRadius: 3, background: PAL.amber, boxShadow: '0 0 12px rgba(232,164,90,.8)'}} /> : null}
              </div>
            );
          })}
          <div style={{position: 'absolute', left: SAFE.cx, top: 560, transform: `translate(-50%, -50%) scale(${1 + 0.14 * sold})`, whiteSpace: 'nowrap', fontFamily: SERIF, fontSize: 48, letterSpacing: '0.2em', textShadow: '0 2px 14px rgba(0,0,0,.85)'}}>
            {[...'就去卖'].map((ch, j) => (
              <span key={j} style={{opacity: prog(f, K.sell[j] - 2, K.sell[j] + 6, EASE.out), color: j === 2 && sold > 0 ? PAL.goldHi : PAL.gold, textShadow: sold > 0 ? `0 0 ${24 * sold}px rgba(255,210,140,${0.8 * sold})` : undefined}}>
                {ch}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {chipRows}

      {/* f4：镀金 / 银 */}
      {tagGold > 0.01 ? <Label text="镀金" x={560} y={560} p={tagGold} size={38} color={PAL.goldHi} bg="rgba(40,28,14,.78)" /> : null}
      {tagSilver > 0.01 ? <Label text="银" x={150} y={770} p={tagSilver} size={42} color="#F2F5F8" bg="rgba(40,44,50,.8)" /> : null}

      {/* f5：原文 */}
      {srcTag > 0.01 ? <Label text="原文 · 第三章" x={SAFE.x0 + 8} y={392} p={srcTag} size={32} /> : null}
      {showQ ? (
        <>
          <div style={{position: 'absolute', left: SAFE.x0 + 4, top: 960 - CARD.y1 - 150, fontFamily: SERIF_BLACK, fontSize: 150, lineHeight: 1, color: PAL.amber, opacity: 0.85 * qMark}}>“</div>
          {Array.from({length: G.nq}, (_, j) => {
            const ch = [...'我不是在等一个答案，我是在等一个理由'][j];
            const x = 540 + G.card[j * 3];
            const y = 960 - G.card[j * 3 + 1];
            const sp = K.qSpoken[Math.min(j, K.qSpoken.length - 1)];
            const lit = smooth(sp - 2, sp + 6, f);
            const p = prog(f, 874 + j * 0.6, 886 + j * 0.6);
            return (
              <div key={j} style={{position: 'absolute', left: x - CARD.step / 2, top: y - CARD.fs / 2, width: CARD.step, height: CARD.fs, fontFamily: SERIF, fontSize: CARD.fs, lineHeight: `${CARD.fs}px`, textAlign: 'center', opacity: p, color: lit > 0.5 ? '#FFF4D6' : PAL.gold, textShadow: `0 2px 16px rgba(0,0,0,.75), 0 0 ${22 * lit}px rgba(255,214,150,${0.55 * lit})`}}>
                {ch}
              </div>
            );
          })}
          <div style={{position: 'absolute', left: SAFE.cx, top: 960 - CARD.y2 + 78, transform: 'translateX(-50%)', fontFamily: SANS, fontSize: 30, letterSpacing: '0.06em', color: 'rgba(242,217,160,.78)', opacity: qSrc, whiteSpace: 'nowrap', textShadow: '0 2px 10px rgba(0,0,0,.8)'}}>
            —— 姜蓝《人选天选论》· 第三章 · 硬币世界
          </div>
        </>
      ) : null}
    </AbsoluteFill>
  );
};

export const S: SceneMod = {
  C,
  hideSubs: ['f5'],
  sfx: ({at, atc}) => {
    const T = tossesFrom(at, atc);
    const cues: Cue[] = [
      [0, 'gather', 0.2, 80],
      [58, 'chime', 0.13, 80],
      [at('熊猫') - 34, 'gather', 0.16, 70],
      [at('换') - 3, 'whoosh_soft', 0.13, 36],
      [at('交给') - 22, 'whoosh_soft', 0.1, 36],
      [at('交给') - 2, 'gather', 0.16, 70],
    ];
    T.forEach((t) => {
      if (t.air >= 12) cues.push([t.l - t.air, 'coin_flip', 0.16, 27]);
      cues.push([t.l, t.res ? 'coin_land_lo' : 'coin_land_hi', 0.18, 24]);
    });
    [at('那就', 0, 0, 'f3'), at('改规则'), at('再改')].forEach((s) => cues.push([s, 'scratch', 0.08, 22]));
    cues.push([at('看') + 1, 'scratch', 0.17, 24]);
    cues.push([at('银') - 2, 'gather', 0.15, 70]);
    cues.push([806, 'chime', 0.13, 80]);
    cues.push([830, 'whoosh_soft', 0.1, 36]);
    return cues;
  },
};
