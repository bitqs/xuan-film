// 场景 F2 · 硬币的两面 → 大石头 / 小石头 → 堰塞湖 → 碎成无数细小的恐惧（agent F2）
// 第 0 帧：一枚由书里的字组成的方孔钱（3D，有厚度），正面「贪 婪」→ 念到「恐惧」翻成背面「恐 惧」
// →「两面」：硬币一分为二，两面同时朝着你 →「只是某一刻」合回去 →「哪一面朝上」抛起、转、落在「贪婪」那面（拍上）
// → 硬币化成一条字的河：贪婪那面变成河里的大白石（水绕着它分开），恐惧那面碎成河床上上百颗深色小石子（小、碎、会藏）
// → f8 镜头扎进河床：河床的「沙」就是第三章原文那一段，念到哪句亮哪句，「再等等/还没准备好/更谨慎一点」从书页上飘起来
// → f9「怎么做的」时刻：小石子一颗颗飞去堆成坝，下游干了、上游漫成湖、水流慢下来停住 → 一道光从坝往上扫，
//   流动的字一行行冻成一面静止的湖（字的颜色取自 lake_mirror 照片）→ 真照片淡入
// → f10 全书 34952 个字聚成一块大白石，三次冲击三道发光的裂缝，「碎」：炸成满屏细小的深色字粒
// → 落回整本书的一页，原文那句在第三章里亮起来，镜头贴近读过去。
import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import type {SceneMod, SceneProps} from '../core/timeline';
import {Backdrop, Label, PAL, Plate, SAFE, SERIF_BLACK, Vignette} from '../core/look';
import {EASE, hex, keyframes, mix, prog, smooth} from '../core/anim';
import {BOOK_CHARS, findInBook} from '../core/book';
import type {Cam, Mask} from '../core/glyph';
import {GlyphCanvas, GlyphLayer, N_BOOK, camMix, camOn, camZ, hash01, noise3, sampleImg, useGState, useImageData, usePage, useTextMask} from '../core/glyph';

type V3 = [number, number, number];
const N = N_BOOK;
const PI = Math.PI;
const GOLD = hex(PAL.gold);
const HI = hex(PAL.goldHi);
const CREAM = hex(PAL.cream);
const SLATE = hex(PAL.slate);
const AMBER = hex(PAL.amber);
const SLATE_HI: V3 = [0.84, 0.89, 0.97];
const FACEF: V3 = [mix(GOLD[0], CREAM[0], 0.3), mix(GOLD[1], CREAM[1], 0.3), mix(GOLD[2], CREAM[2], 0.3)];
const RIMF: V3 = [mix(GOLD[0], AMBER[0], 0.35), mix(GOLD[1], AMBER[1], 0.35), mix(GOLD[2], AMBER[2], 0.35)];
const RIMB: V3 = [SLATE[0] * 0.9, SLATE[1] * 0.9, SLATE[2] * 0.95];

// 硬币（方孔钱）：中心、半径、方孔、内外郭、厚度；面文「贪/婪」「恐/惧」上下各一字
const CX = -96;
const CY = 150;
const R = 300;
const HOLE = 62;
const IRIM = 86;
const ORIM = 266;
const HT = 20;
const CH = 172;
const CHY = 170;
// 河（俯视，从上往下流）
const SY = 250; // 大石头
const A1 = 190;
const B1 = 150;
const DY = -200; // 坝
const PC = 15; // 河床上的原文（第三章那一段）：16 列 × 9 行，格 15
const PCOLS = 16;
const PROWS = 9;
const PY = -400;
const NPEB = 120;
// f10 的大白石
const X2 = -96;
const Y2 = 110;
const A2 = 285;
const B2 = 230;
const ROLE_F = 0;
const ROLE_B = 1;
const ROLE_R = 2;
const ROLE_W = 3;
const ROLE_P = 4;

const riverX = (y: number) => -190 + 150 * Math.sin(y / 560 + 0.5) + 45 * Math.sin(y / 230 + 1.3);
const riverW = (y: number) => 360 + 50 * Math.sin(y / 400) + 300 * Math.exp(-(((y - SY) / 230) ** 2));
const SX = riverX(SY);
const PX = riverX(PY);
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const io = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const stag = (p: number, r: number, s: number) => clamp01(p * (1 + s) - s * r);
const pulse = (f: number, t0: number, k = 14) => (f >= t0 - 1 ? Math.exp(-Math.max(0, f - t0) / k) : 0);
const maskAt = (m: Mask, x: number, y: number) => {
  const u = Math.floor(((x + 540) / 1080) * m.w);
  const v = Math.floor(((960 - y) / 1920) * m.h);
  if (u < 0 || v < 0 || u >= m.w || v >= m.h) return 0;
  return m.a[v * m.w + u] / 255;
};
// 裂缝（大白石局部坐标，单位 = 半径）
const CRACKS: [number, number][][] = [
  [[-0.98, 0.24], [-0.64, 0.12], [-0.42, 0.27], [-0.14, 0.06], [0.16, 0.15], [0.48, -0.05], [0.86, 0.06]],
  [[-0.58, 0.82], [-0.44, 0.52], [-0.27, 0.37], [-0.14, 0.06], [-0.2, -0.3], [0.02, -0.58], [-0.08, -0.97]],
  [[0.16, 0.15], [0.34, 0.44], [0.6, 0.56], [0.72, 0.7], [-0.2, -0.3], [-0.5, -0.4], [-0.86, -0.48]],
];
const A_ = new Float32Array(9);
const B_ = new Float32Array(9);

const C: React.FC<SceneProps> = ({f, at, atc, lineAt}) => {
  const st = useGState();
  const page = usePage({cols: 137}); // 137 列：f10 那句原文正好落在同一行、居中
  const mT = useTextMask('贪', {size: CH, x: CX, y: CY + CHY});
  const mL = useTextMask('婪', {size: CH, x: CX, y: CY - CHY});
  const mK = useTextMask('恐', {size: CH, x: CX, y: CY + CHY});
  const mJ = useTextMask('惧', {size: CH, x: CX, y: CY - CHY});
  const lake = useImageData('img/lake_mirror.jpg', 270, 480);

  // 原文位置
  const Q = useMemo(() => {
    const q8 = findInBook('它很少说：我害怕。它更常说的是：再等等，还没准备好，更谨慎一点');
    const q10 = findInBook('很多人不是不贪了，是贪婪在一次次冲击之后，碎成了无数细小的恐惧');
    const seg = BOOK_CHARS.slice(q8.start, q8.end).join('');
    const sub = (s: string) => {
      const k = seg.indexOf(s);
      if (k < 0) throw new Error('F2: 原文里找不到 ' + s);
      return {start: q8.start + k, end: q8.start + k + s.length};
    };
    const p8s = q8.start - PCOLS * 2;
    return {q8, q10, p8s, p8e: p8s + PCOLS * PROWS, parts: ['它很少说', '我害怕', '它更常说的是', '再等等', '还没准备好', '更谨慎一点'].map(sub)};
  }, []);

  const P = useMemo(() => {
    if (!mT || !mL || !mK || !mJ || !lake) return null;
    const role = new Uint8Array(N);
    const lx = new Float32Array(N);
    const ly = new Float32Array(N);
    const lz = new Float32Array(N);
    const txt = new Float32Array(N);
    const raised = new Uint8Array(N);
    const phi = new Float32Array(N);
    const fronts: number[] = [];
    const backs: number[] = [];
    for (let i = 0; i < N; i++) {
      if (i >= Q.p8s && i < Q.p8e) {
        role[i] = ROLE_P;
        continue;
      }
      const h = hash01(i, 101);
      role[i] = h < 0.18 ? ROLE_F : h < 0.36 ? ROLE_B : h < 0.43 ? ROLE_R : ROLE_W;
      if (role[i] === ROLE_F) fronts.push(i);
      else if (role[i] === ROLE_B) backs.push(i);
      else if (role[i] === ROLE_R) {
        const a = 2 * PI * hash01(i, 41);
        phi[i] = a;
        lx[i] = R * Math.cos(a);
        ly[i] = R * Math.sin(a);
        lz[i] = (hash01(i, 42) * 2 - 1) * HT;
      }
    }
    const face = (list: number[], side: number, m1: Mask, m2: Mask) => {
      const M = list.length;
      const total = Math.ceil(M / 0.94) + 80;
      let k = 0;
      for (let j = 0; j < total && k < M; j++) {
        const r = R * 0.985 * Math.sqrt((j + 0.5) / total);
        const a = j * 2.399963;
        const x = r * Math.cos(a);
        const y = r * Math.sin(a);
        if (Math.abs(x) < HOLE && Math.abs(y) < HOLE) continue;
        const i = list[k++];
        lx[i] = x;
        ly[i] = y;
        const rs = r > ORIM || (Math.abs(x) < IRIM && Math.abs(y) < IRIM) ? 1 : 0;
        raised[i] = rs;
        lz[i] = side * (HT + rs * 4);
        const sx = CX + x;
        const sy = side > 0 ? CY + y : CY - y; // 背面：翻过来以后读起来是正的
        txt[i] = rs ? 0 : Math.max(maskAt(m1, sx, sy), maskAt(m2, sx, sy));
      }
      while (k < M) {
        const i = list[k++];
        const a = 2 * PI * hash01(i, 43);
        lx[i] = R * 0.97 * Math.cos(a);
        ly[i] = R * 0.97 * Math.sin(a);
        lz[i] = side * (HT + 4);
        raised[i] = 1;
      }
    };
    face(fronts, 1, mT, mL);
    face(backs, -1, mK, mJ);

    // 小石子（背面的字）：河床上的位置、碎开的方向、坝上的槽位、飞过去的时刻
    const pk = new Uint16Array(N);
    const pox = new Float32Array(N);
    const poy = new Float32Array(N);
    const frag = new Int8Array(N);
    const pbx = new Float32Array(NPEB);
    const pby = new Float32Array(NPEB);
    const prr = new Float32Array(NPEB);
    const pdx = new Float32Array(NPEB);
    const pdy = new Float32Array(NPEB);
    const dmx = new Float32Array(NPEB);
    const dmy = new Float32Array(NPEB);
    const ord = new Float32Array(NPEB);
    const dx0 = riverX(DY);
    const dwh = riverW(DY) / 2 + 60;
    for (let k = 0; k < NPEB; k++) {
      const y = -40 - 600 * hash01(k, 31);
      let x = riverX(y) + (hash01(k, 32) - 0.5) * riverW(y) * 1.15;
      if (Math.abs(y - PY) < (PC * PROWS) / 2 + 24 && Math.abs(x - PX) < (PC * PCOLS) / 2 + 24) x = PX + (x < PX ? -1 : 1) * ((PC * PCOLS) / 2 + 30 + 40 * hash01(k, 34));
      pbx[k] = x;
      pby[k] = y;
      prr[k] = 8 + 13 * hash01(k, 33);
      const da = 2 * PI * hash01(k, 35);
      pdx[k] = Math.cos(da);
      pdy[k] = Math.sin(da);
      const row = Math.floor(k / 16);
      const col = k % 16;
      dmx[k] = dx0 - dwh + (col + 0.5 + (row % 2) * 0.5) * ((2 * dwh) / 16.5) + (hash01(k, 36) - 0.5) * 8;
      dmy[k] = DY - 64 + row * 19 + (hash01(k, 37) - 0.5) * 8;
      ord[k] = k / NPEB + 0.02 * hash01(k, 38);
    }
    for (const i of backs) {
      const k = Math.min(NPEB - 1, Math.floor(hash01(i, 21) * NPEB));
      pk[i] = k;
      const rr = Math.sqrt(hash01(i, 22));
      const aa = 2 * PI * hash01(i, 23);
      const rot = 2 * PI * hash01(k, 39);
      const ex = rr * prr[k] * 1.3 * Math.cos(aa);
      const ey = rr * prr[k] * Math.sin(aa);
      pox[i] = ex * Math.cos(rot) - ey * Math.sin(rot);
      poy[i] = ex * Math.sin(rot) + ey * Math.cos(rot);
      frag[i] = pox[i] * pdx[k] + poy[i] * pdy[k] > 0 ? 1 : -1;
    }

    // 大石头（f7，正面的字）
    const Ln = Math.hypot(-0.45, 0.55, 0.7);
    const LX = -0.45 / Ln;
    const LY = 0.55 / Ln;
    const LZ = 0.7 / Ln;
    const s1 = new Float32Array(N * 3);
    const s1sh = new Float32Array(N);
    for (const i of fronts) {
      const rr = Math.sqrt(hash01(i, 61));
      const aa = 2 * PI * hash01(i, 62);
      const b = 1 + 0.08 * Math.sin(3 * aa + 0.7) + 0.05 * Math.sin(5 * aa + 2.1);
      const nz = Math.sqrt(Math.max(0, 1 - rr * rr));
      s1[i * 3] = SX + A1 * rr * b * Math.cos(aa);
      s1[i * 3 + 1] = SY + B1 * rr * b * Math.sin(aa);
      s1[i * 3 + 2] = 90 * nz;
      s1sh[i] = Math.max(0, rr * Math.cos(aa) * LX + rr * Math.sin(aa) * LY + nz * LZ);
    }
    // 大白石（f10，全书）+ 裂缝距离
    const s2 = new Float32Array(N * 3);
    const s2sh = new Float32Array(N);
    const scat = new Float32Array(N * 3);
    const cd = new Float32Array(N * 3);
    const cs = new Float32Array(N * 3);
    const crk = CRACKS.map((c) => c.map(([u, v]) => [X2 + A2 * u, Y2 + B2 * v] as [number, number]));
    const clen = crk.map((c) => {
      const L: number[] = [0];
      for (let j = 1; j < c.length; j++) L.push(L[j - 1] + Math.hypot(c[j][0] - c[j - 1][0], c[j][1] - c[j - 1][1]));
      return L;
    });
    for (let i = 0; i < N; i++) {
      const rr = Math.sqrt(hash01(i, 71));
      const aa = 2 * PI * hash01(i, 72);
      const b = 1 + 0.07 * Math.sin(3 * aa + 1.9) + 0.045 * Math.sin(7 * aa + 0.3);
      const nz = Math.sqrt(Math.max(0, 1 - rr * rr));
      const x = X2 + A2 * rr * b * Math.cos(aa);
      const y = Y2 + B2 * rr * b * Math.sin(aa);
      s2[i * 3] = x;
      s2[i * 3 + 1] = y;
      s2[i * 3 + 2] = 150 * nz;
      s2sh[i] = Math.max(0, rr * Math.cos(aa) * LX + rr * Math.sin(aa) * LY + nz * LZ);
      scat[i * 3] = (hash01(i, 81) - 0.5) * 1300;
      scat[i * 3 + 1] = (hash01(i, 82) - 0.5) * 2150;
      scat[i * 3 + 2] = (hash01(i, 83) - 0.5) * 700;
      for (let k = 0; k < 3; k++) {
        const c = crk[k];
        let best = 1e9;
        let bs = 0;
        for (let j = 1; j < c.length; j++) {
          const ax = c[j - 1][0];
          const ay = c[j - 1][1];
          const ddx = c[j][0] - ax;
          const ddy = c[j][1] - ay;
          const l2 = ddx * ddx + ddy * ddy;
          const tt = clamp01(((x - ax) * ddx + (y - ay) * ddy) / l2);
          const d = Math.hypot(x - ax - tt * ddx, y - ay - tt * ddy);
          if (d < best) {
            best = d;
            bs = (clen[k][j - 1] + tt * Math.sqrt(l2)) / clen[k][c.length - 1];
          }
        }
        cd[i * 3 + k] = best;
        cs[i * 3 + k] = bs;
      }
    }
    // 照片色（整页排布时每个字取 lake_mirror 的颜色）
    const pcol = new Float32Array(N * 3);
    const palpha = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const [r, g, b] = sampleImg(lake, page.pos[i * 3], page.pos[i * 3 + 1]);
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      pcol[i * 3] = Math.min(1, r * 1.2);
      pcol[i * 3 + 1] = Math.min(1, g * 1.2);
      pcol[i * 3 + 2] = Math.min(1, b * 1.2);
      palpha[i] = 0.38 + 0.62 * Math.min(1, l * 1.5);
    }
    return {role, lx, ly, lz, txt, raised, phi, pk, pox, poy, frag, pbx, pby, prr, pdx, pdy, dmx, dmy, ord, s1, s1sh, s2, s2sh, scat, cd, cs, pcol, palpha};
  }, [mT, mL, mK, mJ, lake, page, Q]);

  // ---------------- 时间（全部从旁白取）
  const fTan = at('贪婪');
  const fKong = at('恐惧');
  const fTwo = at('两面');
  const fTong = at('同时');
  const fZhi = at('只是');
  const fKe = at('一刻');
  const TOSS0 = at('哪一面') - 12;
  const TOSS1 = at('朝上', 0, 1);
  const M7_0 = TOSS1 + 4;
  const M7_1 = M7_0 + 52;
  const fSee = at('一眼');
  const fSmall = at('小石头');
  const fXiao = at('小', 1);
  const fSui = at('碎');
  const fHide = at('更会藏');
  const f8a = lineAt('f8');
  const f8b = lineAt('f8', 'end');
  const fDui = at('小石头会堆');
  const DAM0 = fDui + 2;
  const DAM1 = at('河就') + 6;
  const fLake = at('堰塞湖');
  const FZ0 = fLake - 6;
  const FZ1 = FZ0 + 56;
  const PL0 = at('看起来') + 4;
  const fKan = at('看淡');
  const M10_0 = lineAt('f9', 'end') + 2;
  const M10_1 = M10_0 + 54;
  const imp = [atc('一次次')[0], atc('一次次')[2], at('击')];
  const SH = at('碎', 1);
  const ST0 = SH + 24;
  const ST1 = ST0 + 40;
  const QL = ST1 - 4;
  const whisper = [at('再等等'), at('还没准备好'), at('更谨慎一点')];
  const partAt = [at('它很少说'), at('我害怕'), at('它更常说'), whisper[0], whisper[1], whisper[2]];

  if (!P) return <Backdrop />;
  const t = f / 30;

  // ---------------- 硬币参数（两组：正面 g=0 / 背面 g=1，分开时各走各的）
  const T0 = 0.42;
  const F1a = fKong - 12;
  const F1b = fKong + 12;
  const PE0 = fTwo - 8;
  const PE1 = fTwo + 22;
  const JO0 = fZhi - 4;
  const JO1 = fKe + 11;
  const tossP = prog(f, TOSS0, TOSS1, EASE.out);
  const tossL = prog(f, TOSS0, TOSS1, EASE.linear);
  const spin = 5 * PI * tossP;
  const thF = keyframes(f, [[0, T0], [F1a, T0], [F1b, PI + T0], [PE0, PI + T0], [PE1, 2 * PI + 0.22], [JO0, 2 * PI + 0.22], [JO1, 3 * PI + T0]]) + spin;
  const thB = keyframes(f, [[0, T0], [F1a, T0], [F1b, PI + T0], [PE0, PI + T0], [PE1, PI + 0.22], [JO0, PI + 0.22], [JO1, PI + T0]]) + spin;
  const scl = keyframes(f, [[PE0, 1], [PE1, 0.6], [JO0, 0.6], [JO1, 1]]) * (1 + 0.07 * Math.sin(PI * tossL));
  const sep = keyframes(f, [[PE0, 0], [PE1, 212], [JO0, 212], [JO1, 0]]);
  const hold = smooth(PE0, PE1, f) * (1 - smooth(JO0, JO1, f));
  const hop = 170 * Math.sin(PI * tossL) + (f > TOSS1 ? 12 * Math.exp(-(f - TOSS1) / 5) * Math.abs(Math.sin((f - TOSS1) * 0.7)) : 0);
  const psi = 0.15 * Math.sin(t * 0.55 + 0.4) * (1 - 0.5 * hold);
  const cp = Math.cos(psi);
  const sp = Math.sin(psi);
  const GF = {th: thF, c: Math.cos(thF), s: Math.sin(thF), sc: scl, ox: -sep, oy: hop + 6 * hold * Math.sin(t * 1.7)};
  const GB = {th: thB, c: Math.cos(thB), s: Math.sin(thB), sc: scl, ox: sep, oy: hop + 6 * hold * Math.sin(t * 1.7 + PI)};
  const flashF = Math.max(pulse(f, fTan), 0.8 * pulse(f, fTan + 6), 0.9 * pulse(f, fTong), pulse(f, TOSS1, 18));
  const flashB = Math.max(pulse(f, fKong), 0.8 * pulse(f, fKong + 7), 0.9 * pulse(f, fTong));

  // ---------------- 河的参数
  const BASE = 0.0022;
  const SL0 = at('堆多了');
  const SL1 = FZ0 + 10;
  const flowPhase = (() => {
    const a = Math.max(0, f - M7_0);
    const s0 = Math.max(1, SL0 - M7_0);
    const L = SL1 - SL0;
    if (a < s0) return BASE * a;
    const d = Math.min(a - s0, L);
    let v = BASE * (s0 + d - (0.92 * d * d) / (2 * L));
    if (a - s0 > L) v += BASE * 0.08 * (a - s0 - L);
    return v;
  })();
  const LK = prog(f, SL0 - 8, fLake + 4, EASE.inOut); // 上游漫成湖
  const LKd = prog(f, DAM0 + 20, fLake, EASE.inOut); // 下游干掉
  const F8 = smooth(f8a - 8, f8a + 22, f) * (1 - smooth(f8b + 2, f8b + 30, f)); // 镜头贴近河床
  const swp = mix(-1.5, 1.5, prog(f, fSee, fSee + 30, EASE.inOut));
  const swOn = smooth(fSee - 4, fSee + 4, f) * (1 - smooth(fSee + 26, fSee + 36, f));
  const pebA = keyframes(f, [[M7_0, 0.26], [fSmall - 4, 0.26], [fSmall + 10, 0.62], [fHide, 0.6], [fHide + 20, 0.17], [f8a, 0.17], [f8a + 20, 0.4], [f8b, 0.4], [f8b + 20, 0.3]]);
  const shr = 1 - 0.3 * prog(f, fXiao, fXiao + 12, EASE.out);
  const spl = prog(f, fSui, fSui + 10, EASE.out);
  const plate = prog(f, PL0, PL0 + 34, EASE.inOut) * (1 - prog(f, M10_0, M10_0 + 26, EASE.inOut));
  // 大白石：冲击抖动
  let shx = 0;
  let shy = 0;
  let flashS = 0;
  for (let k = 0; k < 3; k++) {
    if (f >= imp[k]) {
      const d = f - imp[k];
      const e = Math.exp(-d / 4.5);
      shx += 13 * e * Math.cos(d * 1.9) * (k === 1 ? -0.6 : 1);
      shy += -7 * e * Math.sin(d * 2.3);
      flashS += Math.exp(-d / 7);
    }
  }
  const grow = imp.map((t0) => prog(f, t0, t0 + 9, EASE.out));

  // ---------------- 每种排布写进 o = [x,y,z,size,r,g,b,a,halo]
  const set = (o: Float32Array, x: number, y: number, z: number, s: number, c: V3 | Float32Array, ci: number, a: number, hl: number) => {
    o[0] = x;
    o[1] = y;
    o[2] = z;
    o[3] = s;
    o[4] = c[ci];
    o[5] = c[ci + 1];
    o[6] = c[ci + 2];
    o[7] = a;
    o[8] = hl;
  };
  const coinL = (i: number, h: number, rl: number, o: Float32Array) => {
    if (rl === ROLE_W || rl === ROLE_P) {
      set(o, (hash01(i, 51) - 0.5) * 2600, (hash01(i, 52) - 0.5) * 3600 + 14 * t, -700 - hash01(i, 53) * 2600, 7 + 6 * h, GOLD, 0, 0.035 + 0.055 * hash01(i, 54), 0);
      return;
    }
    const g = rl === ROLE_F ? 0 : rl === ROLE_B ? 1 : P.lz[i] >= 0 ? 0 : 1;
    const G = g === 0 ? GF : GB;
    const x = P.lx[i] * G.sc;
    const y = P.ly[i] * G.sc;
    const z = P.lz[i] * G.sc;
    const y1 = y * G.c - z * G.s;
    const z1 = y * G.s + z * G.c;
    const wx = CX + G.ox + x * cp + z1 * sp;
    const wy = CY + G.oy + y1;
    const wz = -x * sp + z1 * cp;
    if (rl === ROLE_R) {
      const ph = P.phi[i];
      const nz = -Math.cos(ph) * sp + Math.sin(ph) * G.s * cp;
      const vis = smooth(-0.22, 0.25, nz);
      set(o, wx, wy, wz, 6.2 * G.sc, g === 0 ? RIMF : RIMB, 0, (0.3 + 0.2 * h) * vis * (0.65 + 0.35 * Math.abs(nz)), 0.5);
      return;
    }
    const nz = (g === 0 ? 1 : -1) * G.c * cp;
    const vis = smooth(0.02, 0.34, nz);
    const tx = P.txt[i];
    const rs = P.raised[i];
    const fl = g === 0 ? flashF : flashB;
    const gpos = Math.sin(G.th * 1.3 + psi * 2) * 1.2;
    const gd = ((P.lx[i] + P.ly[i]) * 0.707) / R - gpos;
    const gl = Math.exp(-gd * gd * 14);
    const base = g === 0 ? (tx > 0.5 ? CREAM : FACEF) : tx > 0.5 ? SLATE_HI : SLATE;
    const a = vis * (tx * (0.82 + 0.18 * fl) + (1 - tx) * (rs ? 0.5 : 0.16 + 0.1 * h)) * (0.62 + 0.38 * nz + 0.45 * gl + 0.3 * fl);
    const sz = (rs ? 6.6 : 5.6 + 1.6 * h + 2.4 * tx) * (0.6 + 0.4 * Math.max(0, nz)) * G.sc;
    set(o, wx, wy, wz, sz, base, 0, Math.min(1, a), 0.3 + 1.2 * tx + 1.6 * fl * tx);
  };
  const riverL = (i: number, h: number, rl: number, o: Float32Array) => {
    if (rl === ROLE_W || rl === ROLE_R) {
      const spd = 0.7 + 0.6 * hash01(i, 13);
      const u = (hash01(i, 11) + flowPhase * spd) % 1;
      let y = 1180 - u * 2360;
      const v = hash01(i, 12) - 0.5;
      const up = LK * smooth(DY - 10, DY + 260, y);
      const w = riverW(y) * (1 + 1.75 * up);
      let x = riverX(y) * (1 - 0.6 * up) + v * w + 9 * noise3(v * 6, y / 140, t * 0.4, 5) * (1 - up);
      let foam = 0;
      let under = 0;
      const k1 = 1 - LK;
      if (k1 > 0) {
        // 大石头把水顶开：石头底下的水看不见，上游一侧起一道弧形的浪，两边的水往外让
        const ex = (x - SX) / (A1 * 0.86);
        const ey = (y - SY) / (B1 * 0.86);
        const d = Math.sqrt(ex * ex + ey * ey) + 1e-4;
        if (d < 1) under = k1;
        else if (d < 1.6) {
          const bw = (1.6 - d) / 0.6;
          x += Math.sign(ex) * bw * bw * 30 * k1;
          foam = bw * bw * smooth(-0.35, 0.7, ey / d) * k1;
        }
      }
      const dry = 1 - LKd * smooth(DY + 20, DY - 140, y);
      const a = ((0.12 + 0.16 * hash01(i, 14)) * (1 + 0.6 * up) * (1 - 0.88 * F8) + 0.32 * foam * (1 - 0.8 * F8)) * dry * (1 - under);
      const c = foam > 0.25 ? HI : GOLD;
      set(o, x, y, 0, 4.6 + 6 * h * h * h + 0.8 * up, c, 0, a, 0.35 + 1.2 * foam);
      return;
    }
    if (rl === ROLE_F) {
      const x = P.s1[i * 3];
      const sh = P.s1sh[i];
      const sw = Math.exp(-(((x - SX) / A1 - swp) ** 2) * 9) * swOn;
      const a = (0.11 + 0.36 * sh + 0.3 * sw) * (1 - 0.86 * LK) * (1 - 0.6 * F8);
      set(o, x, P.s1[i * 3 + 1], P.s1[i * 3 + 2], 5.4 + 2.2 * h, sw > 0.3 ? HI : CREAM, 0, a, 0.5 + 1.8 * sw);
      return;
    }
    if (rl === ROLE_B) {
      const k = P.pk[i];
      const r0 = P.prr[k];
      const ak = mix(DAM0, DAM1, P.ord[k]);
      const dq = prog(f, ak, ak + 18, EASE.inOut);
      const sp2 = spl * (1 - 0.6 * dq);
      let x = P.pbx[k] + P.pox[i] * shr + P.frag[i] * P.pdx[k] * r0 * 0.6 * sp2;
      let y = P.pby[k] + P.poy[i] * shr + P.frag[i] * P.pdy[k] * r0 * 0.6 * sp2;
      let z = 0;
      if (dq > 0) {
        x = mix(x, P.dmx[k] + P.pox[i] * 0.9, dq);
        y = mix(y, P.dmy[k] + P.poy[i] * 0.9, dq);
        z = 130 * Math.sin(PI * dq);
      }
      const land = pulse(f, ak + 18, 8);
      const wg = F8 * Math.max(pulse(f, whisper[0], 16), pulse(f, whisper[1], 16), pulse(f, whisper[2], 16)) * (hash01(k, 44) < 0.35 ? 1 : 0);
      const a = mix(pebA, 0.66, dq) + 0.3 * land + 0.35 * wg;
      set(o, x, y, z, (3.5 + 1.5 * h) * mix(shr, 1, dq), land + wg > 0.3 ? SLATE_HI : SLATE, 0, a, 0.3 + land + wg);
      return;
    }
    // 河床上的原文（第三章）：书的本来字序
    const m = i - Q.p8s;
    const cc = m % PCOLS;
    const r = (m / PCOLS) | 0;
    let x = PX + (cc - (PCOLS - 1) / 2) * PC;
    let y = PY + ((PROWS - 1) / 2 - r) * PC;
    let z = 0;
    let s = PC * 0.9;
    let a = (0.1 + 0.08 * h) * (1 - 0.5 * LK) + 0.34 * F8;
    let c: V3 = GOLD;
    let hl = 0.2;
    for (let k = 0; k < 6; k++) {
      const pr = Q.parts[k];
      if (i < pr.start || i >= pr.end) continue;
      const t0 = partAt[k];
      const lit = smooth(t0 - 3, t0 + 8, f) * (1 - smooth(f8b + 4, f8b + 24, f));
      if (k === 1) {
        // 「我害怕」：它很少说出口 → 亮一下就暗回去
        const l2 = lit * (1 - 0.65 * smooth(t0 + 22, t0 + 40, f));
        a = mix(a, 0.95, l2);
        c = l2 > 0.2 ? SLATE_HI : GOLD;
        hl = 0.2 + l2;
      } else if (k >= 3) {
        // 三句「悄悄话」从书页里飘出来，排成一行一行浮在石子之间
        const wi = k - 3;
        const lift = prog(f, t0, t0 + 20, EASE.out) * (1 - prog(f, f8b + 2, f8b + 24, EASE.inOut));
        const j = i - pr.start;
        const L = pr.end - pr.start;
        const tx = PX + [-40, 28, -10][wi] + (j - (L - 1) / 2) * PC * 1.3;
        const ty = PY + (PROWS / 2) * PC + 26 + 30 * (2 - wi);
        x = mix(x, tx, lift);
        y = mix(y, ty, lift) + 3 * lift * Math.sin(t * 1.6 + wi * 2);
        z = 30 * lift;
        s *= 1 + 0.3 * lift;
        a = mix(a, 1, lit);
        c = lit > 0.2 ? CREAM : GOLD;
        hl = 0.2 + 2.6 * lift;
      } else {
        a = mix(a, 1, lit);
        c = lit > 0.2 ? HI : GOLD;
        hl = 0.2 + lit;
      }
    }
    set(o, x, y, z, s, c, 0, a, hl);
  };
  const pageL = (i: number, o: Float32Array) => {
    set(o, page.pos[i * 3], page.pos[i * 3 + 1], 0, page.cell * 0.98, P.pcol, i * 3, P.palpha[i] * (1 - 0.6 * plate), 0);
  };
  const stoneEnd = (i: number, h: number, o: Float32Array) => {
    let gap = 0;
    let edge = 0;
    for (let k = 0; k < 3; k++) {
      if (grow[k] <= 0 || P.cs[i * 3 + k] > grow[k]) continue;
      const d = P.cd[i * 3 + k];
      if (d < 3.4) gap = 1;
      else if (d < 11) edge = Math.max(edge, 1 - (d - 3.4) / 7.6);
    }
    const sh = P.s2sh[i];
    const a = (0.08 + 0.2 * sh) * (1 + 0.7 * flashS) * (1 - gap) + 0.55 * edge;
    set(o, P.s2[i * 3] + shx, P.s2[i * 3 + 1] + shy, P.s2[i * 3 + 2], 4.2 + 1.8 * h, edge > 0.3 ? AMBER : CREAM, 0, a, 0.45 + 2.4 * edge);
  };
  const scatL = (i: number, h: number, o: Float32Array) => {
    stoneEnd(i, h, o);
    const r = hash01(i, 85);
    const e = EASE.out(clamp01((f - SH - 5 * r) / 24));
    if (e <= 0) return;
    const k = i * 3;
    const dx = 14 * noise3(i * 0.001, t * 0.3, 1, 7);
    o[0] = mix(o[0], P.scat[k] + dx, e);
    o[1] = mix(o[1], P.scat[k + 1] + 6 * noise3(i * 0.001, t * 0.3, 2, 7), e);
    o[2] = mix(o[2], P.scat[k + 2], e) + 320 * Math.sin(PI * e) * (0.4 + h);
    o[3] = mix(o[3], 3.6 + 3 * h, e);
    o[4] = mix(o[4], SLATE[0], e);
    o[5] = mix(o[5], SLATE[1], e);
    o[6] = mix(o[6], SLATE[2], e);
    o[7] = mix(o[7], 0.55 + 0.35 * h, e);
    o[8] = mix(o[8], 0.7, e);
  };
  const finalL = (i: number, h: number, o: Float32Array) => {
    const inQ = i >= Q.q10.start && i < Q.q10.end;
    const lit = inQ ? smooth(QL - 4, QL + 12, f) : 0;
    const dim = 1 - 0.3 * smooth(QL, QL + 16, f);
    set(o, page.pos[i * 3], page.pos[i * 3 + 1], 0, page.cell * 0.95 * (1 + 0.1 * lit), lit > 0.3 ? HI : SLATE, 0, mix((0.26 + 0.18 * h) * dim, 1, lit), 0.05 + 2 * lit);
  };

  // ---------------- 主循环
  for (let i = 0; i < N; i++) {
    const h = hash01(i, 3);
    const rl = P.role[i];
    let q = -1;
    let lift = 0;
    let swirl = 0;
    let xf = false;
    if (f < M7_0) coinL(i, h, rl, A_);
    else if (f < M7_1) {
      coinL(i, h, rl, A_);
      riverL(i, h, rl, B_);
      const rk = rl === ROLE_F ? 0.35 * hash01(i, 77) : rl === ROLE_B ? 0.3 + 0.4 * hash01(i, 77) : 0.25 + 0.75 * hash01(i, 77);
      q = stag(prog(f, M7_0, M7_1, EASE.linear), rk, 0.5);
      lift = rl === ROLE_W || rl === ROLE_P ? 0 : 260;
      swirl = 110;
    } else if (f < FZ0) riverL(i, h, rl, A_);
    else if (f < FZ1) {
      riverL(i, h, rl, A_);
      pageL(i, B_);
      const ry = (page.pos[i * 3 + 1] + 960) / 1920;
      q = clamp01((f - FZ0 - 40 * ry) / 12);
      xf = true;
    } else if (f < M10_0) pageL(i, A_);
    else if (f < M10_1) {
      pageL(i, A_);
      stoneEnd(i, h, B_);
      q = stag(prog(f, M10_0, M10_1, EASE.linear), hash01(i, 78), 0.55);
      lift = 380;
      swirl = 160;
    } else if (f < SH) stoneEnd(i, h, A_);
    else if (f < ST0) scatL(i, h, A_);
    else if (f < ST1) {
      scatL(i, h, A_);
      finalL(i, h, B_);
      q = stag(prog(f, ST0, ST1, EASE.linear), hash01(i, 79), 0.6);
      swirl = 70;
    } else finalL(i, h, A_);

    const k3 = i * 3;
    const k4 = i * 4;
    if (xf && q >= 0) {
      // 冻结：扫光经过的地方，流动的字淡出，静止的字（照片色）从镜头前落进格子
      // 流动的字：光线扫到它「现在」的位置就淡掉；静止的字：光线扫到它的格子才落下来
      const ryB = (page.pos[k3 + 1] + 960) / 1920;
      const ryA = (A_[1] + 960) / 1920;
      const qOut = clamp01((f - FZ0 - 40 * ryA) / 5);
      const qIn = clamp01((f - FZ0 - 40 * ryB - 4) / 8);
      const edge = qIn > 0 ? Math.exp(-(f - FZ0 - 40 * ryB - 4) / 4) : 0; // 落进格子的那一下亮一下
      const S = qIn > 0 ? B_ : A_;
      const w = qIn > 0 ? qIn : 1 - qOut;
      const drop = qIn > 0 ? 110 * (1 - io(qIn)) : 0;
      st.pos[k3] = S[0];
      st.pos[k3 + 1] = S[1];
      st.pos[k3 + 2] = S[2] + drop;
      st.size[i] = S[3];
      st.col[k4] = Math.min(1, S[4] + 0.5 * edge);
      st.col[k4 + 1] = Math.min(1, S[5] + 0.45 * edge);
      st.col[k4 + 2] = Math.min(1, S[6] + 0.3 * edge);
      st.col[k4 + 3] = Math.min(1, S[7] * w + 0.55 * edge);
      st.halo[i] = S[8] + 4.5 * edge;
    } else if (q < 0) {
      st.pos[k3] = A_[0];
      st.pos[k3 + 1] = A_[1];
      st.pos[k3 + 2] = A_[2];
      st.size[i] = A_[3];
      st.col[k4] = A_[4];
      st.col[k4 + 1] = A_[5];
      st.col[k4 + 2] = A_[6];
      st.col[k4 + 3] = A_[7];
      st.halo[i] = A_[8];
    } else {
      const e = io(q);
      let x = A_[0] + (B_[0] - A_[0]) * e;
      let y = A_[1] + (B_[1] - A_[1]) * e;
      let z = A_[2] + (B_[2] - A_[2]) * e;
      if ((swirl || lift) && e > 0 && e < 1) {
        const arc = Math.sin(PI * e);
        if (swirl) {
          const dx = B_[0] - A_[0];
          const dy = B_[1] - A_[1];
          const L = Math.hypot(dx, dy) + 1e-6;
          const side = (hash01(i, 7) - 0.5) * 2;
          x += (-dy / L) * swirl * side * arc;
          y += (dx / L) * swirl * side * arc;
        }
        z += lift * arc * (0.5 + hash01(i, 9));
      }
      const edge = 0;
      st.pos[k3] = x;
      st.pos[k3 + 1] = y;
      st.pos[k3 + 2] = z;
      st.size[i] = A_[3] + (B_[3] - A_[3]) * e;
      st.col[k4] = Math.min(1, A_[4] + (B_[4] - A_[4]) * e + 0.5 * edge);
      st.col[k4 + 1] = Math.min(1, A_[5] + (B_[5] - A_[5]) * e + 0.45 * edge);
      st.col[k4 + 2] = Math.min(1, A_[6] + (B_[6] - A_[6]) * e + 0.3 * edge);
      st.col[k4 + 3] = Math.min(1, A_[7] + (B_[7] - A_[7]) * e + 0.6 * edge);
      st.halo[i] = A_[8] + (B_[8] - A_[8]) * e + 3 * edge;
    }
  }

  // ---------------- 镜头
  const full: Cam = {pos: [0, 0, camZ()]};
  const coinCam: Cam = {pos: [0, 10, camZ() * 0.95], target: [0, 10, 0]};
  const peb: Cam = {pos: [-60, -130, camZ() / 1.1], target: [-60, -130, 0]};
  const patch = camOn(PX, PY + PC * 1.5, PC, 44);
  const zoomLake: Cam = {pos: [0, 0, camZ() / 1.05], target: [0, 0, 0]};
  const qa = page.xy(Q.q10.start + 10);
  const qb = page.xy(Q.q10.end - 11);
  const camQ0 = camOn(qa[0], qa[1] - 40 / 5.2, page.cell, 40);
  const camQ1 = camOn(qb[0], qb[1] - 40 / 5.2, page.cell, 40);
  const seq: [number, Cam][] = [
    [0, full],
    [TOSS1 - 30, coinCam],
    [M7_0 + 20, full],
    [fSmall - 6, full],
    [fSmall + 30, peb],
    [f8a - 10, peb],
    [f8a + 24, patch],
    [f8b + 2, patch],
    [f8b + 34, full],
    [PL0, full],
    [M10_0, zoomLake],
    [M10_0 + 40, full],
    [ST1 + 2, full],
    [ST1 + 34, camQ0],
    [ST1 + 82, camQ1],
  ];
  let cam = full;
  for (let k = 1; k < seq.length; k++) {
    if (f <= seq[k][0]) {
      const [f0, c0] = seq[k - 1];
      const [f1, c1] = seq[k];
      const e = k === seq.length - 1 ? EASE.sine : EASE.inOut;
      cam = camMix(c0, c1, e(Math.min(1, Math.max(0, (f - f0) / Math.max(1, f1 - f0)))));
      break;
    }
    cam = seq[k][1];
  }
  // 世界坐标 → 屏幕（镜头都是正对 z=0 平面的）
  const cpos = cam.pos ?? [0, 0, camZ()];
  const ctar = cam.target ?? [cpos[0], cpos[1], 0];
  const zoom = camZ() / (cpos[2] - ctar[2]);
  const scr = (x: number, y: number): [number, number] => [540 + (x - ctar[0]) * zoom, 960 - (y - ctar[1]) * zoom];

  // ---------------- DOM 叠层
  const tagGreed = prog(f, at('大石头') - 6, at('大石头') + 8) * (1 - prog(f, f8a - 14, f8a));
  const tagFear = prog(f, fSmall - 2, fSmall + 12) * (1 - prog(f, f8a - 14, f8a));
  const [gx, gy] = scr(SX, SY + B1 + 70);
  const [fx, fy] = scr(60, -250);
  const scanR = (f - FZ0 - 4) / 40;
  const scanA = f >= FZ0 - 2 && f <= FZ1 + 4 ? smooth(-0.06, 0.04, scanR) * (1 - smooth(0.94, 1.06, scanR)) : 0;
  const src8 = smooth(f8a + 10, f8a + 26, f) * (1 - smooth(f8b, f8b + 14, f));
  const src10 = smooth(ST1 + 6, ST1 + 24, f);
  const tag = (txt: string, x: number, y: number, p: number, c: string, size: number) =>
    p > 0.01 ? (
      <div style={{position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) scale(${mix(1.08, 1, p)})`, opacity: p, fontFamily: SERIF_BLACK, fontSize: size, letterSpacing: '0.12em', color: c, whiteSpace: 'nowrap', textShadow: '0 2px 18px rgba(0,0,0,.85)', filter: `blur(${(1 - p) * 6}px)`}}>
        {txt}
      </div>
    ) : null;
  return (
    <AbsoluteFill>
      <Backdrop light={[0.5, 0.42]} glow={1 + 0.3 * flashS * (f < SH ? 1 : 0)} />
      {plate > 0.001 ? <Plate src="img/lake_mirror.jpg" p={prog(f, PL0, M10_0, EASE.linear)} from={{s: 1}} to={{s: 1.05}} opacity={plate * 0.92} grade="saturate(.92) brightness(.9)" /> : null}
      <GlyphCanvas camera={cam}>
        <GlyphLayer state={st} glow={0.5} halo={0.15} haloSize={3} />
      </GlyphCanvas>
      <Vignette amount={0.5} />
      {scanA > 0.01 ? (
        <div style={{position: 'absolute', left: 0, top: 1920 * (1 - scanR) - 45, width: 1080, height: 90, opacity: scanA, mixBlendMode: 'screen', background: 'linear-gradient(180deg, rgba(255,233,184,0) 0%, rgba(255,233,184,.35) 44%, rgba(255,246,222,.85) 50%, rgba(255,233,184,.35) 56%, rgba(255,233,184,0) 100%)'}} />
      ) : null}
      {tag('贪婪', gx, gy, tagGreed, PAL.cream, 76)}
      {tag('恐惧', fx, fy, tagFear, '#C9D4E6', 64)}
      {src8 > 0.01 ? <Label text="《人选天选论》· 第三章 · 原文" x={SAFE.x0 + 8} y={392} p={src8} size={32} /> : null}
      {src10 > 0.01 ? <Label text="《人选天选论》· 第三章 · 原文" x={SAFE.x0 + 8} y={392} p={src10} size={32} /> : null}
    </AbsoluteFill>
  );
};

export const S: SceneMod = {
  C,
  hideSubs: [],
  sfx: ({at, atc, lineAt}) => {
    const imp = [atc('一次次')[0], atc('一次次')[2], at('击')];
    const fDui = at('小石头会堆');
    return [
      [at('恐惧') - 12, 'coin_flip', 0.14, 27],
      [at('两面') - 8, 'whoosh_soft', 0.12, 36],
      [at('同时') - 4, 'gather', 0.16, 78],
      [at('哪一面') - 12, 'coin_flip', 0.2, 27],
      [at('朝上', 0, 1), 'coin_land_hi', 0.2, 24],
      [at('朝上', 0, 1) + 6, 'whoosh_soft', 0.1, 36],
      [at('大石头') - 6, 'water_loop', 0.07, 300],
      [at('碎'), 'crack', 0.1, 30],
      [lineAt('f8') + 60, 'water_loop', 0.05, 240],
      [at('再等等'), 'chime', 0.1, 70],
      [at('还没准备好'), 'chime', 0.1, 70],
      [at('更谨慎一点'), 'chime', 0.1, 70],
      [fDui + 4, 'pebbles', 0.2, 42],
      [fDui + 30, 'pebbles', 0.18, 42],
      [at('堆多了') + 4, 'pebbles', 0.22, 42],
      [at('河就') + 2, 'pebbles', 0.18, 42],
      [at('堰塞湖') - 4, 'gather', 0.22, 78],
      [imp[0], 'crack', 0.15, 30],
      [imp[1], 'crack', 0.17, 30],
      [imp[2], 'crack', 0.2, 30],
      [at('碎', 1) - 1, 'crack', 0.22, 30],
      [at('碎', 1) + 4, 'gather', 0.18, 78],
      [lineAt('f10', 'end') + 14, 'chime', 0.13, 80],
    ];
  },
};
