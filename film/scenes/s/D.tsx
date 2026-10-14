// 场景 D · 一条河（全片第一个大奇观）。
// 第 0 帧：整本书铺满一屏。「这样选」→ 书里 108 个「选」同时亮一下；「比喻」→ 111 个「河」亮起
// → 镜头扎进第一章原文「人的思想其实就像一条河。不是像，几乎就是。」（旁白跳过的「其实」不亮）
// →「不是像」：整页书从下往上融化、铺展成一条从地平线蜿蜒流向镜头的字河（字躺在水面上，带透视）
// →「河底压着两种石头」：镜头升起俯看，河底凝出两块石头：「贪」「婪」组成的乳白石、「恐」「惧」组成的冷灰蓝石，字流绕石分开
// →「贪婪让人伸手，恐惧让人缩手」：字组成的手伸向白石，黑石荡开一圈冷波纹，手缩回；这句原文从河里被拔出来排成一行（原文 · 序）
// →「借口、理由、自洽」三个词由字浮在水面上，波纹越来越乱，石头被挡住
// →「只看见水面」：镜头压到水面，满眼乱闪的波光，河底什么也看不见。
import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import type {SceneMod, SceneProps} from '../core/timeline';
import {H} from '../core/timeline';
import {Backdrop, Label, PAL, Plate, SAFE, SERIF_BLACK, Vignette} from '../core/look';
import {EASE, hex, keyframes, mix, prog, smooth} from '../core/anim';
import {BOOK_CHARS, BOOK_IDX, chapterOf, findInBook, glyphIdx} from '../core/book';
import {Cam, GlyphCanvas, GlyphLayer, N_BOOK, camMix, camOn, camZ, hash01, maskTargets, noise3, usePage, useGState, useTextMask} from '../core/glyph';

const N = N_BOOK;
// ---- 河（字躺在 z=0 水面上，顺 -y 方向流向镜头）
const COLS = 48; // 河面一行几个字
const ROWS = Math.ceil(N / COLS);
const DU = 10.5; // 横向字距
const HW = ((COLS - 1) / 2) * DU; // 河半宽
const DS = 21; // 顺流行距
const LEN = ROWS * DS; // 河长（循环）
const S_NEAR = -1350; // 近端（镜头背后），流出去的字从远端回来
const V0 = 58; // 河心流速（单位/秒）
const MD = 74; // 融化时长（帧）
// ---- 石头（河底）
const SW = 1000; // 石头所在河段
const SDX = 150; // 两块石头离河心的距离
const RX = 118;
const RY = 92;
const RZ = 64;
const SZ = -120; // 河底深度
const N_ST = 900; // 每块石头的字数
// ---- 手 / 词 / 原文行
const N_HAND = 1700;
const N_WORD = 1500;
const WORDS = ['借口', '理由', '自洽'];
const WSCR: [number, number][] = [
  [444, 700],
  [444, 925],
  [444, 1150],
]; // 三个词在画面上的位置（DOM 坐标）

const GOLD = hex(PAL.gold);
const HI = hex(PAL.goldHi);
const AMB = hex(PAL.amber);
const CREAM = hex(PAL.cream);
const SLATE = hex(PAL.slate);

const xcOf = (s: number, amt: number) => amt * (40 + 420 * smooth(700, 4200, s) + 520 * smooth(4200, 10000, s)) * (Math.sin(s / 1300 + 0.9) + 0.35 * Math.sin(s / 520 - 0.4));
const XS = xcOf(SW, 1); // 石头河段的河心 x
const tauOf = (f: number, f0: number) => {
  const t = (f - f0) / 30;
  const TR = 2.4;
  return t <= 0 ? 0 : t < TR ? (t * t) / (2 * TR) : t - TR / 2;
};
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease3 = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ---- 镜头几何（和 three 的 lookAt 一致，up = +y）：投影 / 反投影，给 DOM 标签和「拔出来」的原文行用
type V3 = [number, number, number];
type Basis = {p: V3; x: V3; y: V3; z: V3; F: number};
const basis = (c: Cam): Basis => {
  const fov = c.fov ?? 40;
  const p = c.pos ?? [0, 0, camZ(fov)];
  const t = c.target ?? [p[0], p[1], 0];
  let zx = p[0] - t[0];
  let zy = p[1] - t[1];
  let zz = p[2] - t[2];
  const zl = Math.hypot(zx, zy, zz) || 1;
  zx /= zl;
  zy /= zl;
  zz /= zl;
  let xx = zz;
  let xz = -zx;
  const xl = Math.hypot(xx, xz) || 1;
  xx /= xl;
  xz /= xl;
  const y: V3 = [zy * xz, zz * xx - zx * xz, -zy * xx];
  return {p, x: [xx, 0, xz], y, z: [zx, zy, zz], F: H / 2 / Math.tan((fov * Math.PI) / 360)};
};
const project = (B: Basis, X: V3): V3 => {
  const dx = X[0] - B.p[0];
  const dy = X[1] - B.p[1];
  const dz = X[2] - B.p[2];
  const cx = dx * B.x[0] + dy * B.x[1] + dz * B.x[2];
  const cy = dx * B.y[0] + dy * B.y[1] + dz * B.y[2];
  const cz = -(dx * B.z[0] + dy * B.z[1] + dz * B.z[2]);
  return [540 + (cx * B.F) / cz, 960 - (cy * B.F) / cz, cz];
};
const unproject = (B: Basis, sx: number, sy: number, depth: number): V3 => {
  const cx = ((sx - 540) * depth) / B.F;
  const cy = ((960 - sy) * depth) / B.F;
  return [0, 1, 2].map((a) => B.p[a] + B.x[a] * cx + B.y[a] * cy - B.z[a] * depth) as V3;
};
const rayPlane = (B: Basis, sx: number, sy: number, zp = 0): {P: V3; sin: number; dist: number} => {
  const cx = (sx - 540) / B.F;
  const cy = (960 - sy) / B.F;
  const d = [0, 1, 2].map((a) => B.x[a] * cx + B.y[a] * cy - B.z[a]);
  const L = Math.hypot(d[0], d[1], d[2]);
  const t = (zp - B.p[2]) / d[2];
  return {P: [B.p[0] + d[0] * t, B.p[1] + d[1] * t, zp], sin: Math.abs(d[2]) / L, dist: t * L};
};

// 手（右手掌心朝下，手指朝 +y；局部坐标，手腕在原点）：胶囊拼成
const HAND_SEGS: [number, number, number, number, number][] = [
  [0, -330, 0, -40, 70], // 小臂
  [0, 10, 0, 150, 98], // 手掌
  [-62, 190, -74, 340, 22], // 食指
  [-20, 200, -24, 372, 23], // 中指
  [22, 195, 30, 356, 22], // 无名指
  [62, 172, 78, 300, 19], // 小指
  [-86, 70, -158, 192, 24], // 拇指
];
const segDist = (x: number, y: number, s: [number, number, number, number, number]) => {
  const [x0, y0, x1, y1] = s;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const t = clamp01(((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy || 1));
  return Math.hypot(x - x0 - dx * t, y - y0 - dy * t);
};

const C: React.FC<SceneProps> = ({f, dur, at, atc, lineAt}) => {
  const st = useGState();
  const sto = useGState(N_ST * 2);
  const hd = useGState(N_HAND);
  const wd = useGState(N_WORD * 3);
  const qt = useGState(13);
  const page = usePage();
  const m0 = useTextMask(WORDS[0], {size: 300});
  const m1 = useTextMask(WORDS[1], {size: 300});
  const m2 = useTextMask(WORDS[2], {size: 300});

  // ---------------- 原文位置
  const R = useMemo(() => {
    const a = findInBook('人的思想');
    const b = findInBook('就像一条河。不是像，几乎就是');
    const d5 = findInBook('人伸手，恐惧让人缩手');
    return {a, b, row0: a.start, row1: b.end + 1, line0: d5.start - 3, line1: d5.end};
  }, []);

  // ---------------- 每个字的固定参数
  const P = useMemo(() => {
    const s0 = new Float32Array(N);
    const u = new Float32Array(N);
    const vf = new Float32Array(N);
    const rank = new Float32Array(N);
    const isX = new Uint8Array(N);
    const isH = new Uint8Array(N);
    let nX = 0;
    let nH = 0;
    for (let i = 0; i < N; i++) {
      const row = Math.floor(i / COLS);
      const col = i % COLS;
      s0[i] = S_NEAR + (ROWS - 1 - row) * DS + (hash01(i, 41) - 0.5) * DS * 0.45;
      u[i] = ((col - (COLS - 1) / 2) * DU + (hash01(i, 42) - 0.5) * DU * 0.5) / HW;
      vf[i] = V0 * (1 - 0.42 * u[i] * u[i]) * (0.93 + 0.14 * hash01(i, 43));
      rank[i] = clamp01(((page.pos[i * 3 + 1] + 964) / 1928) * 0.8 + hash01(i, 44) * 0.2);
      const c = BOOK_CHARS[i];
      if (c === '选') {
        isX[i] = 1;
        nX++;
      }
      if (c === '河') {
        isH[i] = 1;
        nH++;
      }
    }
    for (let i = R.row0; i < R.row1; i++) rank[i] = 1;
    return {s0, u, vf, rank, isX, isH, nX, nH};
  }, [page, R]);

  // 石头：单位椭球里的点（体积均匀，底部压平）+ 明暗
  const SP = useMemo(() => {
    const n = N_ST * 2;
    const loc = new Float32Array(n * 3);
    const shade = new Float32Array(n);
    const L = [-0.42, -0.35, 0.84];
    for (let k = 0; k < n; k++) {
      const id = k < N_ST ? 0 : 1;
      let a = 0;
      let b = 0;
      let c = 0;
      for (let tr = 0; tr < 12; tr++) {
        a = hash01(k * 13 + tr, 61) * 2 - 1;
        b = hash01(k * 13 + tr, 62) * 2 - 1;
        c = hash01(k * 13 + tr, 63) * 2 - 1;
        if (a * a + b * b + c * c <= 1) break;
      }
      c = Math.max(c, -0.5);
      const r = 1 + 0.13 * noise3(a * 1.4 + id * 9, b * 1.4, c * 1.4, 64);
      loc[k * 3] = a * r;
      loc[k * 3 + 1] = b * r;
      loc[k * 3 + 2] = c * r;
      const nl = Math.hypot(a, b, c) || 1;
      shade[k] = 0.5 + 0.5 * clamp01((a * L[0] + b * L[1] + c * L[2]) / nl);
      sto.idx[k] = glyphIdx(id === 0 ? (hash01(k, 65) < 0.5 ? '贪' : '婪') : hash01(k, 65) < 0.5 ? '恐' : '惧');
    }
    return {loc, shade};
  }, [sto]);

  // 手：胶囊里均匀取点（确定性）
  const HP = useMemo(() => {
    const loc = new Float32Array(N_HAND * 2);
    const W8 = [0.45, 1.25, 2.6, 2.6, 2.6, 2.6, 2.4]; // 手指多给点字，轮廓才清楚
    const areas = HAND_SEGS.map(([x0, y0, x1, y1, r], si) => (2 * r * Math.hypot(x1 - x0, y1 - y0) + Math.PI * r * r) * W8[si]);
    const tot = areas.reduce((p, v) => p + v, 0);
    let k = 0;
    HAND_SEGS.forEach((s, si) => {
      const cnt = si === HAND_SEGS.length - 1 ? N_HAND - k : Math.round((areas[si] / tot) * N_HAND);
      const [x0, y0, x1, y1, r] = s;
      const bx0 = Math.min(x0, x1) - r;
      const by0 = Math.min(y0, y1) - r;
      const bw = Math.abs(x1 - x0) + 2 * r;
      const bh = Math.abs(y1 - y0) + 2 * r;
      for (let j = 0; j < cnt && k < N_HAND; j++, k++) {
        let x = 0;
        let y = 0;
        for (let tr = 0; tr < 16; tr++) {
          x = bx0 + hash01(k * 17 + tr, 71) * bw;
          y = by0 + hash01(k * 17 + tr, 72) * bh;
          if (segDist(x, y, s) <= r) break;
        }
        loc[k * 2] = x;
        loc[k * 2 + 1] = y;
      }
    });
    return {loc};
  }, []);

  // 三个词：遮罩里取点（局部像素坐标），左半边的粒子显示第一个字，右半边显示第二个字
  const WP = useMemo(() => {
    if (!m0 || !m1 || !m2) return null;
    const loc = new Float32Array(N_WORD * 3 * 2);
    [m0, m1, m2].forEach((m, w) => {
      const t = maskTargets(m, N_WORD, 80 + w, 1.2);
      for (let j = 0; j < N_WORD; j++) {
        const k = w * N_WORD + j;
        loc[k * 2] = t[j * 3];
        loc[k * 2 + 1] = t[j * 3 + 1];
        wd.idx[k] = glyphIdx(WORDS[w][t[j * 3] < 0 ? 0 : 1]);
      }
    });
    return {loc};
  }, [m0, m1, m2, wd]);

  // 原文行（d5）：书里的 13 个字；PDF 抽字把「贪婪」抽成了「贪梦」，这里显示成「贪婪」
  useMemo(() => {
    for (let k = 0; k < 13; k++) {
      const c = BOOK_CHARS[R.line0 + k];
      qt.idx[k] = c === '梦' ? glyphIdx('婪') : BOOK_IDX[R.line0 + k];
    }
  }, [qt, R]);

  // ---------------- 时间（全部来自旁白）
  const fXuan = at('这样选') + 5;
  const fBiyu = at('比喻');
  const cRen = atc('人的思想');
  const cHe = atc('就像一条河');
  const cBu = atc('不是像');
  const cJi = atc('几乎就是');
  const MELT = cBu[0] + 4;
  const fHedi = at('河底');
  const fStone = at('两种石头');
  const fBai = at('白的');
  const fTanlan = at('贪婪');
  const fHei = at('黑的');
  const fKongju = at('恐惧');
  const fD5 = lineAt('d5');
  const fShen = at('伸手');
  const fKong2 = at('恐惧', 1);
  const fSuo = at('缩手');
  const fD6 = lineAt('d6');
  const fLuan = at('乱七八糟');
  const fBowen = at('波纹');
  const fJie = at('借口');
  const fLi = at('理由');
  const fZi = at('自洽');
  const fD7 = lineAt('d7');
  const fShuimian = at('水面', 1);
  const wordF = [fJie, fLi, fZi];

  // 原文那一行每个字被念到的帧（「其实」旁白没念：不点亮）
  const litF = useMemo(() => {
    const m = new Map<number, number>();
    cRen.forEach((v, k) => m.set(R.a.start + k, v));
    cHe.forEach((v, k) => m.set(R.b.start + k, v));
    m.set(R.b.start + 5, cHe[4] + 4);
    cBu.forEach((v, k) => m.set(R.b.start + 6 + k, v));
    m.set(R.b.start + 9, cBu[2] + 4);
    cJi.forEach((v, k) => m.set(R.b.start + 10 + k, v));
    m.set(R.b.start + 14, cJi[3] + 4);
    return m;
  }, [R, cRen.join(), cHe.join(), cBu.join(), cJi.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------- 镜头
  const [qx0, qy] = page.xy(R.a.start);
  const cell = page.cell;
  const Z = 46;
  const shiftX = ((540 - SAFE.cx) * cell) / Z; // 让字落在安全区中线 x=444
  const cQ1 = camOn(qx0 + 5.5 * cell + shiftX, qy - 62, cell, Z);
  const cQ1b = camOn(qx0 + 7.5 * cell + shiftX, qy - 62, cell, Z);
  const cQ2 = camOn(qx0 + 16 * cell + shiftX, qy - 62, cell, Z);
  const full: Cam = {pos: [0, 0, camZ()]};
  const cRiver: Cam = {pos: [0, -1500, 430], target: [0, 227, 0], fov: 55};
  const cRiver2: Cam = {pos: [30, -900, 480], target: [50, 950, 0], fov: 55};
  const cStones: Cam = {pos: [XS, SW + 60 - 1250, -60 + 1550], target: [XS, SW + 60, -60], fov: 42};
  const cWhite: Cam = {pos: [XS - SDX, SW - 560, SZ + 840], target: [XS - SDX, SW, SZ], fov: 42};
  const cBlack: Cam = {pos: [XS + SDX, SW - 560, SZ + 840], target: [XS + SDX, SW, SZ], fov: 42};
  const cRipple: Cam = {pos: [XS, SW + 120 - 1450, 1180], target: [XS, SW + 120, 0], fov: 45};
  const cSurface: Cam = {pos: [XS * 0.3, SW - 1900, 300], target: [XS * 0.5, SW - 700, 0], fov: 50};
  const cSurface2: Cam = {pos: [XS * 0.3, SW - 1640, 285], target: [XS * 0.5, SW - 450, 0], fov: 50};
  const seq: [number, Cam][] = [
    [0, full],
    [96, {pos: [0, 30, camZ() * 0.93]}],
    [150, cQ1],
    [cBu[0] - 30, cQ1b],
    [MELT - 2, cQ2],
    [MELT + 66, cRiver],
    [fHedi + 40, cRiver2],
    [fBai + 16, cStones],
    [fTanlan - 2, cStones],
    [fTanlan + 20, cWhite],
    [fHei - 4, cWhite],
    [fKongju - 4, cBlack],
    [fKongju + 12, cBlack],
    [fShen - 12, cStones],
    [fD6 + 10, cStones],
    [fZi + 8, cRipple],
    [fShuimian + 4, cSurface],
    [dur + 14, cSurface2],
  ];
  const camAt = (fr: number): Cam => {
    for (let k = 1; k < seq.length; k++) {
      if (fr <= seq[k][0]) {
        const [f0, c0] = seq[k - 1];
        const [f1, c1] = seq[k];
        return camMix(c0, c1, EASE.inOut(clamp01((fr - f0) / Math.max(1, f1 - f0))));
      }
    }
    return seq[seq.length - 1][1];
  };
  const cam = camAt(f);
  const B = basis(cam);

  if (!WP) return <Backdrop />;

  // ---------------- 全局量
  const t = f / 30;
  const tau = tauOf(f, MELT);
  const MA = smooth(MELT + 6, MELT + 84, f); // 蜿蜒程度
  const pm = (f - MELT) / MD; // 融化进度（0..1，逐字错峰）
  const SG = 0.75;
  const closeUp = smooth(120, 150, f) * (1 - smooth(MELT + 6, MELT + 40, f));
  const xuanLit = smooth(fXuan - 3, fXuan + 5, f) * (1 - smooth(fXuan + 22, fXuan + 40, f));
  const heLit = smooth(fBiyu - 2, fBiyu + 8, f) * (1 - smooth(150, 176, f));
  const quoteFade = 1 - smooth(MELT + 30, MELT + 70, f);
  const seeThru = smooth(fHedi - 6, fHedi + 30, f);
  const wordDim = smooth(fJie - 16, fJie + 14, f) * (1 - smooth(fD7 + 6, fShuimian + 6, f));
  const T = 0.45 * smooth(fLuan - 6, fBowen + 14, f) + 0.55 * smooth(fD7 - 10, fShuimian + 40, f); // 水面乱的程度
  const push = smooth(fStone, fStone + 40, f) * (1 - smooth(fLuan, fZi + 6, f)); // 字流绕开石头
  const stoneA = smooth(fStone - 4, fStone + 36, f) * (1 - smooth(fJie - 6, fZi + 18, f));
  const whiteOn = smooth(fBai - 2, fBai + 12, f);
  const blackOn = smooth(fHei - 2, fHei + 12, f);
  const ring = f >= fKong2 ? (f - fKong2) * 15 : -1; // 恐惧：黑石荡开的一圈冷波纹
  const ringAmp = f >= fKong2 ? Math.exp(-(f - fKong2) / 26) : 0;
  // 河面上看到的石头中心（视线穿过水面的位置，避免视差把石头挡住）
  const stones: V3[] = [
    [XS - SDX, SW, SZ],
    [XS + SDX, SW, SZ],
  ];
  const holes = stones.map((s) => {
    const k = B.p[2] / Math.max(1, B.p[2] - s[2]);
    return [B.p[0] + (s[0] - B.p[0]) * k, B.p[1] + (s[1] - B.p[1]) * k];
  });
  const [ex, ey, ez] = B.p;

  // 原文行（d5）的 HUD 目标
  const qIn = (k: number) => prog(f, fD5 - 22 + k * 1.6, fD5 + 10 + k * 1.6, EASE.inOut);
  const qOut = 1 - smooth(fD6 - 6, fD6 + 14, f);
  const qOn = f >= fD5 - 24 && qOut > 0;
  const qStart = new Float32Array(13 * 3);

  // ---------------- 书 = 河
  for (let i = 0; i < N; i++) {
    const k = i * 3;
    const h = hash01(i, 3);
    const px = page.pos[k];
    const py = page.pos[k + 1];
    let x = px;
    let y = py;
    let z = 0;
    let q = 0;
    let rx = 0;
    let ry = 0;
    let rz = 0;
    let rot = 0;
    let glint = 0;
    let ringHit = 0;
    if (f >= MELT) {
      let s = P.s0[i] - P.vf[i] * tau - S_NEAR;
      s -= LEN * Math.floor(s / LEN);
      s += S_NEAR;
      const au = Math.abs(P.u[i]);
      const edge = smooth(0.68, 1, au);
      rx = xcOf(s, MA) + P.u[i] * HW * (1 + 0.45 * edge * hash01(i, 47));
      ry = s;
      // 轻微的水流摆动
      const nx = rx / 150;
      const ny = ry / 150;
      rx += 6 * noise3(nx, ny, t * 0.45, 5);
      rz = 5 * Math.sin(ry / 160 + t * 1.6 + P.u[i] * 2);
      // 绕石分流（保面积的推开：r → sqrt(r² + R²w)）
      if (push > 0.001) {
        for (let m = 0; m < 2; m++) {
          const dx = rx - holes[m][0];
          const dy = (ry - holes[m][1]) * (RX / RY);
          const r2 = dx * dx + dy * dy + 1;
          const fac = Math.sqrt(1 + (RX * RX * 1.25 * push) / r2);
          rx = holes[m][0] + dx * fac;
          ry = holes[m][1] + (dy * fac * RY) / RX;
        }
      }
      // 恐惧：一圈冷波纹
      if (ringAmp > 0.01) {
        const dx = rx - holes[1][0];
        const dy = ry - holes[1][1];
        const d = Math.hypot(dx, dy) + 1e-3;
        ringHit = ringAmp * Math.exp(-((d - ring) * (d - ring)) / 2200);
        rx += (dx / d) * 22 * ringHit;
        ry += (dy / d) * 22 * ringHit;
        rz += 14 * ringHit;
      }
      // 乱七八糟的波纹
      if (T > 0.001) {
        const n1 = noise3(rx / 170, ry / 170, t * 0.9, 31);
        const n2 = noise3(rx / 170 + 17, ry / 170 - 9, t * 0.9, 32);
        rx += 34 * T * n1;
        ry += 34 * T * n2;
        rz += 34 * T * Math.sin(rx / 70 + t * 2.3 + 4 * n2) * Math.sin(ry / 95 - t * 1.7);
        rot = 1.1 * T * noise3(rx / 120, ry / 120, t * 0.7, 33);
      }
      glint = Math.max(0, noise3(rx / 80, ry / 80 - t * 0.9, t * 1.3, 34)) * (1 + 0.6 * Math.exp(-Math.abs(P.u[i]) * 2.5) * smooth(2500, 9000, ry));
      q = pm * (1 + SG) - SG * P.rank[i];
      q = q <= 0 ? 0 : q >= 1 ? 1 : ease3(q);
      if (q >= 1) {
        x = rx;
        y = ry;
        z = rz;
      } else if (q > 0) {
        const arc = Math.sin(Math.PI * q);
        x = px + (rx - px) * q + (hash01(i, 45) - 0.5) * 140 * arc;
        y = py + (ry - py) * q;
        z = rz * q + 190 * arc * (0.4 + hash01(i, 46));
      }
    }
    st.pos[k] = x;
    st.pos[k + 1] = y;
    st.pos[k + 2] = z;
    st.rot[i] = rot * q;

    // ---- 大小 / 颜色
    const pageSize = cell * 0.98;
    const riverSize = 7.2 + 5.2 * h * h;
    let size = pageSize + (riverSize - pageSize) * q;
    let r = GOLD[0];
    let g = GOLD[1];
    let b = GOLD[2];
    let halo = 0.6 + 0.8 * h;
    // 书页
    let aPage = (0.36 + 0.22 * h) * (1 - 0.62 * closeUp);
    let lit = 0;
    if (P.isX[i]) lit = Math.max(lit, xuanLit);
    if (P.isH[i]) lit = Math.max(lit, heLit);
    if (i >= R.row0 && i < R.row1) {
      const lf = litF.get(i);
      const ql = lf === undefined ? 0.16 * smooth(cHe[0] - 4, cHe[0] + 8, f) : smooth(lf - 3, lf + 6, f);
      lit = Math.max(lit, ql * quoteFade);
    }
    if (lit > 0) {
      aPage = aPage + (1 - aPage) * lit;
      r = mix(r, HI[0], lit);
      g = mix(g, HI[1], lit);
      b = mix(b, HI[2], lit);
      halo *= 1 + (2.2 + 4 * (1 - closeUp)) * lit;
      size *= 1 + (0.12 + 0.8 * (1 - closeUp) * (1 - smooth(MELT - 20, MELT, f))) * lit;
    }
    let a = aPage;
    if (q > 0) {
      // 河：远处更淡（雾）、偏琥珀；水面波光
      const dist = Math.hypot(x - ex, y - ey, z - ez);
      const fog = Math.exp(-Math.max(0, dist - 2600) / 8500);
      const far = clamp01((y - 3000) / 9000);
      const edge = smooth(0.68, 1.02, Math.abs(P.u[i]));
      let aR = (0.52 + 0.42 * h) * fog * (1 - 0.55 * edge) * (1 - 0.32 * seeThru * (1 - T)) * (1 + 0.5 * T) * (1 - 0.38 * wordDim);
      const gl = glint * glint * glint * (1.6 + 2.6 * T);
      aR = Math.min(1, aR * (1 + gl));
      a = mix(aPage, aR, q);
      const wR = mix(GOLD[0], AMB[0], far * 0.6);
      const wG = mix(GOLD[1], AMB[1], far * 0.6);
      const wB = mix(GOLD[2], AMB[2], far * 0.6);
      r = mix(r, mix(wR, HI[0], Math.min(1, gl)), q);
      g = mix(g, mix(wG, HI[1], Math.min(1, gl)), q);
      b = mix(b, mix(wB, HI[2], Math.min(1, gl)), q);
      if (ringHit > 0.01) {
        r = mix(r, SLATE[0], ringHit * 0.8);
        g = mix(g, SLATE[1], ringHit * 0.8);
        b = mix(b, SLATE[2], ringHit * 0.8);
        a = Math.min(1, a + 0.3 * ringHit);
      }
      halo *= mix(1, 0.7 + 2.2 * gl, q);
    }
    // 被「拔出来」的原文行：在河里先藏起来
    if (i >= R.line0 && i < R.line1) {
      qStart[(i - R.line0) * 3] = x;
      qStart[(i - R.line0) * 3 + 1] = y;
      qStart[(i - R.line0) * 3 + 2] = z;
      if (qOn && qIn(i - R.line0) > 0) a = 0;
    }
    st.size[i] = size;
    st.halo[i] = halo;
    st.col[i * 4] = r;
    st.col[i * 4 + 1] = g;
    st.col[i * 4 + 2] = b;
    st.col[i * 4 + 3] = a;
  }

  // ---------------- 石头（河底，字永远正对镜头）
  for (let k = 0; k < N_ST * 2; k++) {
    const id = k < N_ST ? 0 : 1;
    const h = hash01(k, 66);
    const c = stones[id];
    const tx = c[0] + SP.loc[k * 3] * RX;
    const ty = c[1] + SP.loc[k * 3 + 1] * RY;
    const tz = c[2] + SP.loc[k * 3 + 2] * RZ;
    // 从上游水面沉下来聚成石头
    const sx = c[0] + (hash01(k, 67) - 0.5) * 640;
    const sy = c[1] + 380 + hash01(k, 68) * 1500;
    let e = clamp01((f - (fStone - 8) - 44 * hash01(k, 69)) / 30);
    e = ease3(e);
    const arc = Math.sin(Math.PI * e);
    sto.pos[k * 3] = sx + (tx - sx) * e + 3 * noise3(k * 0.1, t * 0.3, 0, 70) * (1 - e);
    sto.pos[k * 3 + 1] = sy + (ty - sy) * e;
    sto.pos[k * 3 + 2] = tz * e + 60 * arc;
    const sh = SP.shade[k];
    const on = id === 0 ? whiteOn : blackOn;
    const reach = id === 0 ? smooth(fShen - 10, fShen + 10, f) * (1 - smooth(fSuo, fSuo + 14, f)) : 0;
    const pulse = id === 1 ? ringAmp : 0;
    const base = id === 0 ? CREAM : SLATE;
    const lum = id === 0 ? mix(0.55, 1, on) * sh : mix(0.5, 0.78, on) * sh;
    const tint = mix(0.35, 1, on);
    sto.col[k * 4] = mix(GOLD[0] * 0.7, base[0], tint) * lum;
    sto.col[k * 4 + 1] = mix(GOLD[1] * 0.7, base[1], tint) * lum;
    sto.col[k * 4 + 2] = mix(GOLD[2] * 0.7, base[2], tint) * lum;
    const aBase = id === 0 ? mix(0.1, 0.22, on) : mix(0.1, 0.2, on);
    sto.col[k * 4 + 3] = stoneA * e * (aBase + 0.2 * reach + 0.25 * pulse) * (0.75 + 0.5 * h);
    sto.size[k] = 10 + 6 * h * h;
    sto.halo[k] = (id === 0 ? 0.55 : 0.3) * (1 + 1.5 * reach + 2 * pulse);
  }

  // ---------------- 手（伸向白石，缩回）
  const reach = prog(f, fShen - 18, fShen + 12, EASE.out);
  const back = prog(f, fSuo - 3, fSuo + 13, EASE.out);
  const flinch = f >= fSuo - 3 ? Math.sin((f - fSuo) * 1.3) * Math.exp(-Math.max(0, f - fSuo) / 6) : 0;
  const hold = f >= fShen + 12 && f < fSuo ? Math.sin((f - fShen) / 9) * 6 : 0;
  const TH = 0.2 + flinch * 0.05; // 手从右下方斜着伸向白石
  const cs = Math.cos(TH);
  const sn = Math.sin(TH);
  const tipX = XS - SDX + 18;
  const tipY = SW - RY - 34 + hold;
  const ox = tipX - (-24 * cs - 395 * sn);
  const oy = tipY - (-24 * sn + 395 * cs);
  const along = mix(-1100, 0, reach) - back * 1200; // 沿手的方向前后
  const hA = smooth(fShen - 18, fShen - 4, f) * (1 - smooth(fSuo + 8, fSuo + 18, f));
  const suo = f >= fSuo - 2;
  for (let k = 0; k < N_HAND; k++) {
    const h = hash01(k, 73);
    const lx = HP.loc[k * 2];
    const ly = HP.loc[k * 2 + 1] + along;
    hd.pos[k * 3] = ox + lx * cs - ly * sn + 2 * noise3(k * 0.07, t * 0.8, 1, 74);
    hd.pos[k * 3 + 1] = oy + lx * sn + ly * cs;
    hd.pos[k * 3 + 2] = 70 + 0.02 * HP.loc[k * 2 + 1];
    const fade = clamp01((HP.loc[k * 2 + 1] + 330) / 200); // 小臂末端淡出
    const tipGlow = smooth(260, 380, HP.loc[k * 2 + 1]) * reach * (1 - back);
    hd.col[k * 4] = mix(CREAM[0], HI[0], 0.5);
    hd.col[k * 4 + 1] = mix(CREAM[1], HI[1], 0.5);
    hd.col[k * 4 + 2] = mix(CREAM[2], HI[2], 0.5);
    hd.col[k * 4 + 3] = hA * fade * (0.26 + 0.26 * h + 0.3 * tipGlow);
    hd.size[k] = 7.5 + 3.5 * h * h;
    hd.halo[k] = 0.7 + 1.5 * tipGlow;
    hd.idx[k] = glyphIdx(h < 0.5 ? (suo ? '缩' : '伸') : '手');
  }

  // ---------------- 原文行（从河里拔出来，正对镜头排成一行）
  if (qOn) {
    const D = 620;
    const px = 58;
    for (let k = 0; k < 13; k++) {
      const e = qIn(k);
      const tgt = unproject(B, SAFE.cx + (k - 6) * 58, 446, D);
      const arc = Math.sin(Math.PI * e);
      qt.pos[k * 3] = qStart[k * 3] + (tgt[0] - qStart[k * 3]) * e;
      qt.pos[k * 3 + 1] = qStart[k * 3 + 1] + (tgt[1] - qStart[k * 3 + 1]) * e;
      qt.pos[k * 3 + 2] = qStart[k * 3 + 2] + (tgt[2] - qStart[k * 3 + 2]) * e + 120 * arc;
      qt.size[k] = mix(10, (px * D) / B.F, e);
      qt.col[k * 4] = HI[0];
      qt.col[k * 4 + 1] = HI[1];
      qt.col[k * 4 + 2] = HI[2];
      qt.col[k * 4 + 3] = (e > 0 ? 0.5 + 0.5 * e : 0) * qOut;
      qt.halo[k] = 0.5 + 1.5 * arc;
    }
  } else qt.col.fill(0);

  // ---------------- 三个词（浮在水面上，跟着波纹扭）
  const wRef = basis(camAt(fLi));
  const dissolve = smooth(fD7 + 6, fShuimian + 6, f);
  for (let w = 0; w < 3; w++) {
    const hit = rayPlane(wRef, WSCR[w][0], WSCR[w][1], 0);
    const kx = (hit.dist / wRef.F) * 0.6;
    const ky = kx / Math.max(0.35, hit.sin);
    const fw = wordF[w];
    for (let j = 0; j < N_WORD; j++) {
      const k = w * N_WORD + j;
      const h = hash01(k, 81);
      const lx = WP.loc[k * 2];
      const ly = WP.loc[k * 2 + 1];
      let tx = hit.P[0] + lx * kx;
      let ty = hit.P[1] + ly * ky;
      const sx = hit.P[0] + (hash01(k, 82) - 0.5) * 900;
      const sy = hit.P[1] + (hash01(k, 83) - 0.5) * 700 + 260;
      let e = clamp01((f - (fw - 18) - 16 * hash01(k, 84)) / 22);
      e = ease3(e);
      // 波纹扭动；结尾被打散
      const n1 = noise3(tx / 130, ty / 130, t * 0.8, 85);
      const n2 = noise3(tx / 130 + 7, ty / 130 - 3, t * 0.8, 86);
      const amp = 6 + 10 * T + 150 * dissolve;
      tx += amp * n1;
      ty += amp * n2;
      wd.pos[k * 3] = sx + (tx - sx) * e;
      wd.pos[k * 3 + 1] = sy + (ty - sy) * e;
      wd.pos[k * 3 + 2] = 8 + 10 * T * Math.sin(tx / 80 + t * 2) + 40 * dissolve * n2;
      wd.rot[k] = (0.5 * T + 1.5 * dissolve) * n1;
      wd.size[k] = (4 + 8 * h * h * h) * kx * 1.6;
      wd.col[k * 4] = mix(GOLD[0], HI[0], 0.6);
      wd.col[k * 4 + 1] = mix(GOLD[1], HI[1], 0.6);
      wd.col[k * 4 + 2] = mix(GOLD[2], HI[2], 0.6);
      wd.col[k * 4 + 3] = e * (0.42 + 0.4 * h) * (1 - dissolve);
      wd.halo[k] = 0.7;
    }
  }

  // ---------------- DOM 叠层
  const light = keyframes(f, [
    [0, 0.42],
    [MELT + 10, 0.42],
    [MELT + 60, 0.27],
    [fHedi + 40, 0.3],
    [fBai + 16, 0.46],
    [fZi + 8, 0.4],
    [fShuimian, 0.24],
  ]);
  const photoA = 0.34 * smooth(MELT + 24, MELT + 70, f) * (1 - smooth(fHedi + 34, fBai + 10, f)) + 0.26 * smooth(fZi + 10, fShuimian + 10, f);
  const lblX = smooth(fXuan - 3, fXuan + 8, f) * (1 - smooth(fBiyu - 8, fBiyu + 2, f));
  const lblH = smooth(fBiyu, fBiyu + 10, f) * (1 - smooth(140, 150, f));
  const lblQ = smooth(146, 158, f) * (1 - smooth(MELT - 2, MELT + 10, f));
  const lblD5 = smooth(fD5 + 4, fD5 + 18, f) * qOut;
  // 石头标签：跟着石头在画面上的位置
  const sLbl = (id: number, p: number, text: string, color: string) => {
    if (p <= 0.01) return null;
    const c = stones[id];
    const [sx0, sy0, depth] = project(B, [c[0], c[1] - RY * 0.2, c[2] - RZ]);
    if (depth <= 0) return null;
    const rad = (RY * B.F) / depth;
    const x = Math.max(SAFE.x0 + 90, Math.min(SAFE.x1 - 90, sx0));
    const y = Math.max(SAFE.y0 + 40, Math.min(1290, sy0 + rad * 0.95 + 46));
    return (
      <div style={{position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) scale(${mix(1.1, 1, p)})`, opacity: p, fontFamily: SERIF_BLACK, fontSize: 80, letterSpacing: '0.1em', color, textShadow: '0 0 26px rgba(0,0,0,.85), 0 0 12px rgba(0,0,0,.6)', whiteSpace: 'nowrap', filter: `blur(${(1 - p) * 6}px)`}}>
        {text}
      </div>
    );
  };
  const lblFade = 1 - smooth(fLuan - 10, fLuan + 10, f);
  const pT = smooth(fTanlan - 2, fTanlan + 10, f) * lblFade;
  const pK = smooth(fKongju - 2, fKongju + 10, f) * lblFade;

  return (
    <AbsoluteFill>
      <Backdrop light={[0.5, light]} glow={1 + 0.25 * smooth(MELT + 20, MELT + 70, f)} />
      <Plate
        src="img/river_aerial.jpg"
        p={prog(f, MELT, dur, EASE.linear)}
        from={{s: 1.12, y: 120}}
        to={{s: 1.04, y: 160}}
        opacity={photoA}
        grade="sepia(.3) saturate(.75) brightness(.85)"
        style={{WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, #000 22%, transparent 40%)', maskImage: 'linear-gradient(to bottom, #000 0%, #000 22%, transparent 40%)'}}
      />
      <GlyphCanvas camera={cam}>
        <GlyphLayer state={sto} glow={0.6} halo={0.22} haloSize={3} face renderOrder={1} />
        <GlyphLayer state={st} glow={0.6} halo={0.17} haloSize={3} renderOrder={4} />
        <GlyphLayer state={wd} glow={0.5} halo={0.1} haloSize={2.6} renderOrder={6} />
        <GlyphLayer state={hd} glow={0.6} halo={0.2} haloSize={3} renderOrder={8} />
        <GlyphLayer state={qt} glow={0.45} halo={0.25} haloSize={2.4} face renderOrder={10} />
      </GlyphCanvas>
      <Vignette amount={0.5} />
      {lblX > 0.01 ? <Label text={`书里的 ${P.nX} 个「选」`} x={SAFE.x0 + 8} y={392} p={lblX} size={32} /> : null}
      {lblH > 0.01 ? <Label text={`书里的 ${P.nH} 个「河」`} x={SAFE.x0 + 8} y={392} p={lblH} size={32} /> : null}
      {lblQ > 0.01 ? <Label text={`原文 · ${chapterOf(R.a.start).title.replace('·', ' · ')}`} x={SAFE.x0 + 8} y={392} p={lblQ} size={32} /> : null}
      {sLbl(0, pT, '贪婪', PAL.cream)}
      {sLbl(1, pK, '恐惧', '#B9C6DA')}
      {lblD5 > 0.01 ? <Label text="原文 · 序" x={SAFE.cx} y={500} p={lblD5} size={30} align="center" /> : null}
    </AbsoluteFill>
  );
};

export const S: SceneMod = {
  C,
  hideSubs: ['d5'],
  sfx: ({at, atc, lineAt}) => {
    const melt = atc('不是像')[0] + 4;
    return [
      [at('这样选') + 4, 'chime', 0.1, 70],
      [at('比喻'), 'gather', 0.16, 78],
      [melt + 6, 'swell', 0.14, 62],
      [melt + 20, 'water_loop', 0.07, 300],
      [melt + 318, 'water_loop', 0.08, 300],
      [melt + 616, 'water_loop', 0.09, 300],
      [at('两种石头') + 6, 'pebbles', 0.14, 45],
      [at('白的') + 2, 'drop', 0.16, 25],
      [at('黑的') + 2, 'drop', 0.12, 25],
      [lineAt('d5') - 10, 'chime', 0.12, 80],
      [at('伸手') - 14, 'whoosh_soft', 0.1, 36],
      [at('缩手') - 3, 'whoosh_soft', 0.13, 36],
      [at('借口'), 'drop', 0.1, 25],
      [at('理由'), 'drop', 0.1, 25],
      [at('自洽'), 'drop', 0.1, 25],
    ];
  },
};
