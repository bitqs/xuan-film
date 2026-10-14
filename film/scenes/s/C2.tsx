// 场景 C2 ·「世界只收代价」→「不是交易」→「福是稳定的结构」
// c7：镜头贴在序那一页上，原文逐字亮起；「立刻支付」：这四个字和书页上一批字当场熄灭；
//     「很多年以后才结算」：另一批字离开书页，慢慢漂向远处，很久才暗。
// c8：整页书的字取了照片的颜色，凝成台灯下那本空白账本；账本被一行行写满（书里那句「账单」的字），
//     空中浮现一笔账「今天吃苦 ↓ 以后补偿」（几千个书里的字拼成，每个字落在念到它的那一帧）。
// c9：「世界不是银行」：那笔账散成粒子；账本从右往左一页页被吹空（墨字离开纸面变成金光飘走）；
//     原文那句从账本上升起，逐字落成引文（就是书里第 2121–2145 个字本身）。
// c10：所有字聚成一个「福」→ 福拆开重搭成一座三角网格穹顶（稳定的结构），其余的字散成风；
//     风从左边吹过、绕开穹顶，穹顶纹丝不动；「日子有秩序」：一圈圈按顺序亮起；「睡得着」：风停，光变成呼吸。
import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import type {SceneMod, SceneProps} from '../core/timeline';
import {Backdrop, Label, PAL, Plate, SAFE, Title, Vignette} from '../core/look';
import {EASE, hex, mix, prog, smooth} from '../core/anim';
import {BOOK_CHARS, BOOK_IDX, findInBook} from '../core/book';
import {
  Cam, GlyphCanvas, GlyphLayer, MaskText, N_BOOK, camMix, camOn, camZ, hash01, maskTargets, morphPos, noise3, sampleImg, useGState, useImageData, usePage, useTextMask,
} from '../core/glyph';

const N = N_BOOK;
const GOLD = hex(PAL.gold);
const HI = hex(PAL.goldHi);
const AMB = hex(PAL.amber);
const INKC = hex(PAL.inkText);
const PUN = /[，。、；：？！“”‘’（）《》「」『』…—·,.;:?!'"()\s\-]/;

// 那笔账（引擎坐标：中心原点、y 向上）
const ES = 150;
const EX = SAFE.cx - 540;
const EY1 = 960 - 560;
const EY2 = 960 - 820;
const E1 = '今天吃苦';
const E2 = '以后补偿';
// 引文（DOM 坐标）
const QS = 58;
const QX0 = 90;
const QY = [468, 550, 632];
// 福 / 穹顶
const FX = -60;
const FU_S = 640;
const FU_Y = 40;
const DY = -215; // 穹顶底面
const DR = 330; // 穹顶半径
const INK_MAX = 900;

// 账本照片里两页纸的四个角（DOM 像素，未缩放照片；TL→TR = 行方向，TL→BL = 往下）
type P2 = [number, number];
const PAGES: {TL: P2; TR: P2; BL: P2; BR: P2}[] = [
  {TL: [47, 1067], TR: [427, 952], BL: [300, 1373], BR: [735, 1280]},
  {TL: [427, 948], TR: [757, 880], BL: [740, 1280], BR: [1053, 1133]},
];
const bil = (pg: number, u: number, v: number): P2 => {
  const {TL, TR, BL, BR} = PAGES[pg];
  return [
    (1 - v) * ((1 - u) * TL[0] + u * TR[0]) + v * ((1 - u) * BL[0] + u * BR[0]),
    (1 - v) * ((1 - u) * TL[1] + u * TR[1]) + v * ((1 - u) * BL[1] + u * BR[1]),
  ];
};

// 三角网格穹顶（lamella 式）：4 圈节点交错 + 顶点；返回沿杆件均匀排布的字位置
const buildDome = () => {
  const M = 12;
  const lats = [0, 22, 44, 64];
  const K = lats.length;
  const nodes: [number, number, number][] = [];
  const lv: number[] = [];
  lats.forEach((lat, k) => {
    const ph = (lat * Math.PI) / 180;
    for (let j = 0; j < M; j++) {
      const th = (2 * Math.PI * j) / M + ((k % 2) * Math.PI) / M;
      nodes.push([DR * Math.cos(ph) * Math.cos(th), DR * Math.sin(ph), DR * Math.cos(ph) * Math.sin(th)]);
      lv.push(k);
    }
  });
  const apex = nodes.length;
  nodes.push([0, DR, 0]);
  lv.push(K);
  const ring = (k: number, j: number) => k * M + (((j % M) + M) % M);
  const edges: [number, number][] = [];
  for (let k = 0; k < K; k++) for (let j = 0; j < M; j++) edges.push([ring(k, j), ring(k, j + 1)]);
  for (let k = 0; k < K - 1; k++)
    for (let j = 0; j < M; j++) {
      edges.push([ring(k, j), ring(k + 1, j)]);
      edges.push([ring(k, j), ring(k + 1, k % 2 === 0 ? j - 1 : j + 1)]);
    }
  for (let j = 0; j < M; j++) edges.push([ring(K - 1, j), apex]);
  const pts: {x: number; y: number; z: number; lv: number; node: number}[] = [];
  const SP = 7.2;
  edges.forEach(([a, b]) => {
    const A = nodes[a];
    const B = nodes[b];
    const len = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
    const n = Math.max(2, Math.round(len / SP));
    for (let m = 0; m < n; m++) {
      const t = (m + 0.5) / n;
      pts.push({x: A[0] + (B[0] - A[0]) * t, y: A[1] + (B[1] - A[1]) * t, z: A[2] + (B[2] - A[2]) * t, lv: (lv[a] + lv[b]) / 2, node: 0});
    }
  });
  nodes.forEach((P, k) => {
    for (let m = 0; m < 12; m++) {
      const h1 = hash01(k * 31 + m, 5) - 0.5;
      const h2 = hash01(k * 31 + m, 6) - 0.5;
      const h3 = hash01(k * 31 + m, 7) - 0.5;
      pts.push({x: P[0] + h1 * 9, y: P[1] + h2 * 9, z: P[2] + h3 * 9, lv: lv[k], node: 1});
    }
  });
  pts.sort((p, q) => q.y - p.y); // 从上到下，和「福」的阅读顺序对应
  return pts;
};

const C: React.FC<SceneProps> = ({f, dur, at, atc}) => {
  const st = useGState();
  const ink = useGState(INK_MAX);
  const page = usePage();
  const img = useImageData('img/workshop_ledger.jpg', 270, 480);
  const m1 = useTextMask(E1, {size: ES, x: EX, y: EY1});
  const m2 = useTextMask(E2, {size: ES, x: EX, y: EY2});
  const mFu = useTextMask('福', {size: FU_S, x: FX, y: FU_Y});

  // ---------------- 几何（只算一次）
  const G = useMemo(() => {
    if (!m1 || !m2 || !mFu) return null;
    const q1 = findInBook('世界从来不奖励谁。世界只收代价');
    const q2 = findInBook('有的立刻支付，有的很多年以后才结算');
    const q9 = findInBook('世界不是银行。祸和福之间，没有可以回头核对的账本');
    const withPunct = (r: {start: number; end: number}) => (PUN.test(BOOK_CHARS[r.end]) ? r.end + 1 : r.end);
    const L1: number[] = [];
    const L2: number[] = [];
    for (let i = q1.start; i < withPunct(q1); i++) L1.push(i);
    for (let i = q2.start; i < withPunct(q2); i++) L2.push(i);
    const QT: number[] = [];
    for (let i = q9.start; i < withPunct(q9); i++) QT.push(i);
    // role：0 书页 1 立刻支付（熄灭）2 多年后结算（漂远）3 那笔账 4 c9 原文
    const role = new Uint8Array(N);
    const litK = new Int16Array(N).fill(-1);
    L1.forEach((i, k) => (litK[i] = k));
    L2.forEach((i, k) => (litK[i] = 100 + k));
    const qtK = new Int16Array(N).fill(-1);
    QT.forEach((i, k) => {
      qtK[i] = k;
      role[i] = 4;
    });
    const pay0 = q2.start + 2; // 立刻支付
    const later0 = q2.start + 9; // 很多年以后才结算
    for (let i = 0; i < N; i++) {
      if (role[i] === 4) continue;
      if (litK[i] >= 0) {
        if (i >= pay0 && i < pay0 + 4) role[i] = 1;
        else if (i >= later0 && i < later0 + 8) role[i] = 2;
        continue;
      }
      const h = hash01(i, 41);
      if (h < 0.15) role[i] = 1;
      else if (h > 0.905) role[i] = 2;
    }
    // 那笔账：从剩下的书页字里挑，按书的顺序对应到笔画里（阅读顺序 → 变形不乱）
    const eL1: number[] = [];
    const eL2: number[] = [];
    for (let i = 0; i < N; i++) {
      if (role[i] !== 0 || litK[i] >= 0) continue;
      if (hash01(i, 43) < 0.185) (hash01(i, 44) < 0.5 ? eL1 : eL2).push(i);
    }
    const T1 = maskTargets(m1, eL1.length, 31, 1);
    const T2 = maskTargets(m2, eL2.length, 37, 1);
    const eTgt = new Float32Array(N * 3);
    const eSlot = new Int8Array(N).fill(-1); // 0..3 第一行，4..7 第二行
    const put = (list: number[], T: Float32Array, off: number) =>
      list.forEach((i, k) => {
        role[i] = 3;
        eTgt[i * 3] = T[k * 3];
        eTgt[i * 3 + 1] = T[k * 3 + 1];
        eSlot[i] = off + Math.max(0, Math.min(3, Math.floor((T[k * 3] - (EX - 2 * ES)) / ES)));
      });
    put(eL1, T1, 0);
    put(eL2, T2, 4);
    // c9 原文：落位（引擎坐标）和起飞点
    const qtPos = new Float32Array(QT.length * 3);
    const qtSrc = new Float32Array(QT.length * 3);
    const lineOf = (k: number) => (k < 7 ? 0 : k < 13 ? 1 : 2);
    const colOf = (k: number) => (k < 7 ? k : k < 13 ? k - 7 : k - 13);
    QT.forEach((_, k) => {
      const ln = lineOf(k);
      qtPos[k * 3] = QX0 - 540 + QS * 1.04 * (colOf(k) + 0.5);
      qtPos[k * 3 + 1] = 960 - QY[ln];
      if (ln === 0) {
        qtSrc[k * 3] = EX + (hash01(k, 51) - 0.5) * 560;
        qtSrc[k * 3 + 1] = (EY1 + EY2) / 2 + (hash01(k, 52) - 0.5) * 300;
      } else {
        const [px, py] = bil(k % 2, 0.2 + 0.6 * hash01(k, 53), 0.25 + 0.5 * hash01(k, 54));
        qtSrc[k * 3] = px - 540;
        qtSrc[k * 3 + 1] = 960 - py;
      }
      qtSrc[k * 3 + 2] = 0;
    });
    // 福：全书的字；起点是四面八方（原文那几个字从引文的位置出发）
    const FU = maskTargets(mFu, N, 53, 1.2);
    const SRC = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const k = qtK[i];
      if (k >= 0) {
        SRC[i * 3] = qtPos[k * 3];
        SRC[i * 3 + 1] = qtPos[k * 3 + 1];
        SRC[i * 3 + 2] = 0;
      } else {
        const a = hash01(i, 81) * Math.PI * 2;
        const r = 700 + 900 * hash01(i, 82);
        SRC[i * 3] = Math.cos(a) * r * 0.75;
        SRC[i * 3 + 1] = Math.sin(a) * r * 1.2;
        SRC[i * 3 + 2] = -900 + 1300 * hash01(i, 83);
      }
    }
    // 穹顶：每隔 N/DN 个字取一个（福的阅读顺序 = 穹顶从上到下）
    const dome = buildDome();
    const DN = dome.length;
    const domeOf = new Int32Array(N).fill(-1);
    for (let k = 0; k < DN; k++) domeOf[Math.min(N - 1, Math.floor(((k + 0.5) * N) / DN))] = k;
    const dX = Float32Array.from(dome, (p) => p.x);
    const dY = Float32Array.from(dome, (p) => p.y);
    const dZ = Float32Array.from(dome, (p) => p.z);
    const dLv = Float32Array.from(dome, (p) => p.lv);
    const dNode = Uint8Array.from(dome, (p) => p.node);
    // 风里的字：底位置
    const dust = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      dust[i * 3] = (hash01(i, 92) - 0.5) * 1640;
      dust[i * 3 + 1] = -780 + 1600 * hash01(i, 93);
      dust[i * 3 + 2] = -700 + 1200 * hash01(i, 94);
    }
    // 账本上的墨字（书里「很多人相信祸和福之间的因果有一张账单……」那一段）
    const passage: number[] = [];
    for (let i = withPunct(q2); i < q9.start; i++) if (!PUN.test(BOOK_CHARS[i])) passage.push(i);
    const items: {pg: number; u: number; v: number; r: number; c: number; x: number; y: number; rot: number; size: number}[] = [];
    [0, 1].forEach((pg) => {
      const rows = 16;
      const cols = pg === 0 ? 30 : 25;
      for (let r = 0; r < rows; r++) {
        const len = Math.floor(cols * (0.5 + 0.5 * hash01(r + pg * 50, 71)));
        for (let c = 0; c < len; c++) {
          const u = 0.09 + (0.83 * (c + 0.5)) / cols;
          if ((u > 0.27 && u < 0.33) || (u > 0.64 && u < 0.69)) continue;
          const v = 0.1 + (0.8 * r) / (rows - 1);
          const [x, y] = bil(pg, u, v);
          const {TL, TR, BL, BR} = PAGES[pg];
          const rx = (1 - v) * (TR[0] - TL[0]) + v * (BR[0] - BL[0]);
          const ry = (1 - v) * (TR[1] - TL[1]) + v * (BR[1] - BL[1]);
          const size = (0.95 * Math.hypot(rx, ry) * 0.83) / cols;
          if (items.length < INK_MAX) items.push({pg, u, v, r, c, x, y, rot: Math.atan2(-ry, rx), size});
        }
      }
    });
    items.forEach((_, k) => (ink.idx[k] = BOOK_IDX[passage[k % passage.length]]));
    return {L1, L2, QT, role, litK, qtK, eTgt, eSlot, qtPos, qtSrc, FU, SRC, DN, domeOf, dX, dY, dZ, dLv, dNode, dust, items};
  }, [m1, m2, mFu, ink]);

  // ---------------- 时间（全部从旁白拿）
  const tm = useMemo(() => {
    const seq = (words: string[]) => words.flatMap((w) => atc(w));
    const litFrames = (list: number[] | undefined, fr: number[]) => {
      const out: number[] = [];
      let k = 0;
      (list ?? []).forEach((i) => {
        if (PUN.test(BOOK_CHARS[i])) out.push((out.length ? out[out.length - 1] : fr[0]) + 5);
        else out.push(fr[Math.min(k++, fr.length - 1)]);
      });
      return out;
    };
    const fr1 = seq(['世界从来不奖励谁', '世界只收代价']);
    const fr2 = seq(['有的立刻支付', '有的很多年以后才结算']);
    const e1 = atc('今天吃点苦');
    const e2 = atc('以后会补偿');
    const qa = atc('世界不是银行');
    const qb = atc('祸和福之间');
    const qc = atc('没有可以回头核对的账本');
    const qcl = qc.map((x) => x - 8); // 最后一行略领先旁白，让整句引文多停一会儿
    const qtLand = [...qa, qa[qa.length - 1] + 6, ...qb, qb[qb.length - 1] + 6, ...qcl, qcl[qcl.length - 1] + 5];
    return {
      lit1: litFrames(G?.L1, fr1),
      lit2: litFrames(G?.L2, fr2),
      eLand: [e1[0], e1[1], e1[2], e1[4], e2[0], e2[1], e2[3], e2[4]],
      qtLand,
      pay: at('立刻支付', 0, 1) + 3,
      later: at('很多年'),
      tremble: at('恰恰相反'),
      burst: at('世界不是银行') - 1,
      fu0: at('他说的福') - 8,
      fu1: at('他说的福') + 20,
      d0: at('而是一个') - 6,
      d1: at('稳定的结构', 0, 1) + 2,
      order: at('日子有秩序'),
      sleep: at('睡得着'),
    };
  }, [G, at, atc]);

  // 风：累计位移表（风从 wind0 起、睡得着时停）
  const wind0 = tm.d1 + 6;
  const Gw = useMemo(() => {
    const g = new Float32Array(1400);
    let acc = 0;
    for (let k = 0; k < g.length; k++) {
      g[k] = acc;
      acc += smooth(wind0, wind0 + 30, k) * (1 - smooth(tm.sleep - 6, tm.sleep + 26, k));
    }
    return g;
  }, [wind0, tm.sleep]);

  if (!G || !img) return <Backdrop />;

  const t = f / 30;
  const B = tm.burst;
  // ---------------- 阶段量
  const closeUp = 1 - smooth(190, 236, f);
  const mPhoto = prog(f, 234, 268);
  const photoA = prog(f, 258, 298) * (1 - prog(f, tm.fu0 + 4, tm.fu0 + 36));
  const pageFade = prog(f, 272, 306);
  const kbP = prog(f, 258, tm.fu0 + 30, EASE.linear);
  const kbS = mix(1.06, 1, kbP);
  const trem = 2.4 * smooth(tm.tremble, B, f) * (f < B + 2 ? 1 : 0);
  const DOME = f >= tm.d0;
  const FUP = f >= tm.fu0;

  // ================= 主层：书的 34952 个字
  if (!FUP) {
    for (let i = 0; i < N; i++) {
      const h = hash01(i, 3);
      const role = G.role[i];
      let x = page.pos[i * 3];
      let y = page.pos[i * 3 + 1];
      let z = 0;
      let size = page.cell * 0.98;
      let r = GOLD[0];
      let g = GOLD[1];
      let b = GOLD[2];
      let a = 0.36 + 0.22 * h;
      let halo = 0.6 + 0.8 * h;
      // 原文逐字亮起
      const lk = G.litK[i];
      let lit = 0;
      if (lk >= 0) {
        const lf = lk < 100 ? tm.lit1[lk] : tm.lit2[lk - 100];
        lit = Math.max(0.22 * (1 - smooth(196, 236, f)), smooth(lf - 3, lf + 6, f));
      }
      a = mix(a * (1 - 0.6 * closeUp), 1, lit);
      r = mix(r, HI[0], lit);
      g = mix(g, HI[1], lit);
      b = mix(b, HI[2], lit);
      halo *= 1 - 0.6 * lit;
      size *= 1 + 0.1 * lit;
      if (role === 1) {
        // 立刻支付：亮一下，当场熄灭
        const k = f - (tm.pay + (lk >= 0 ? 0 : Math.floor(h * 3)));
        if (k >= 0) {
          // 当场熄灭：4 帧内暗下去，字微微缩小、下沉
          const out = smooth(0, 4, k);
          a *= 1 - out;
          size *= 1 - 0.25 * out;
          halo *= 1 - out;
          y -= 0.8 * Math.min(k, 6);
          if (k >= 5) a = 0;
        }
      } else if (role === 2) {
        // 很多年以后才结算：离开书页，慢慢漂远，很久才暗
        const t0 = lk >= 0 ? tm.lit2[lk - 100] + 16 : tm.later + 4 + 40 * h;
        const dt = f - t0;
        if (dt > 0) {
          const e = Math.min(1, dt / 40);
          z -= Math.pow(dt, 1.25) * (0.7 + 0.9 * h);
          y += dt * (0.22 + 0.35 * h);
          x += 16 * noise3(i * 0.13, dt * 0.02, 0, 7) * e;
          a = Math.max(a, 0.72 * e + a * (1 - e)) * (1 - smooth(80, 340 + 120 * h, dt));
          r = mix(r, HI[0], 0.6 * e);
          g = mix(g, HI[1], 0.6 * e);
          b = mix(b, HI[2], 0.6 * e);
          halo *= 1 + 0.8 * e;
        }
      }
      // 整页凝成账本照片（熄灭的、漂走的不参与）
      if ((role === 0 || role === 3 || role === 4) && mPhoto > 0) {
        const c = sampleImg(img, x / kbS, y / kbS);
        const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        r = mix(r, Math.min(1, c[0] * 1.3), mPhoto);
        g = mix(g, Math.min(1, c[1] * 1.3), mPhoto);
        b = mix(b, Math.min(1, c[2] * 1.3), mPhoto);
        a = mix(a, 0.3 + 0.7 * Math.min(1, l * 1.7), mPhoto);
        if (role === 3) {
          a = mix(a, 0.07 + 0.08 * h, pageFade);
          r = mix(r, GOLD[0], pageFade);
          g = mix(g, GOLD[1], pageFade);
          b = mix(b, GOLD[2], pageFade);
        } else a *= 1 - pageFade;
      }
      if (role === 3) {
        // 那笔账：每个字在念到它的那一帧落成
        const slot = G.eSlot[i];
        const land = tm.eLand[slot] + 3 * hash01(i, 45);
        const s0 = land - 20 - 10 * hash01(i, 46);
        if (f > s0) {
          const q = Math.min(1, (f - s0) / (land - s0));
          const e = EASE.inOut(q);
          const tx = G.eTgt[i * 3];
          const ty = G.eTgt[i * 3 + 1];
          const dx = tx - x;
          const dy = ty - y;
          const L = Math.hypot(dx, dy) + 1e-6;
          const side = (hash01(i, 7) - 0.5) * 2;
          const arc = Math.sin(Math.PI * e);
          const x0 = x;
          const y0 = y;
          x = x0 + dx * e + (-dy / L) * 160 * side * arc;
          y = y0 + dy * e + (dx / L) * 160 * side * arc;
          z = 260 * arc * (0.4 + h);
          size = mix(size, 4.4 + 3.6 * h * h, e);
          a = mix(a, 0.5 + 0.3 * h, e);
          r = mix(r, GOLD[0], e);
          g = mix(g, GOLD[1], e);
          b = mix(b, GOLD[2], e);
          halo = mix(halo, 0.8, e) * (1 + (f >= land ? 2.5 * Math.exp(-(f - land) / 6) : 0));
          if (trem > 0) {
            x += trem * noise3(i * 0.37, f * 0.6, 1, 11);
            y += trem * noise3(i * 0.37 + 5, f * 0.6, 2, 11);
          }
          // 世界不是银行：散成粒子
          const b0 = B + 7 * hash01(i, 47);
          const dt = f - b0;
          if (dt > 0) {
            const ox = tx - EX;
            const oy = ty - (EY1 + EY2) / 2;
            const OL = Math.hypot(ox, oy) + 1e-6;
            const sp = (4 + 9 * hash01(i, 48)) * dt * (1 - Math.min(0.6, dt / 150));
            x += (ox / OL) * sp + 34 * noise3(i * 0.05, dt * 0.03, 1, 9) * Math.min(1, dt / 20);
            y += (oy / OL) * sp * 0.7 + 0.05 * dt * dt * (0.5 + h);
            z += (hash01(i, 49) - 0.3) * 14 * dt;
            a *= (1 + 0.7 * Math.exp(-dt / 5)) * (1 - smooth(8, 44 + 22 * h, dt));
            halo *= 1 + 3 * Math.exp(-dt / 6);
            r = mix(r, HI[0], Math.exp(-dt / 12));
            g = mix(g, HI[1], Math.exp(-dt / 12));
            b = mix(b, HI[2], Math.exp(-dt / 12));
          }
        }
      } else if (role === 4) {
        // 原文从账本上升起，逐字落成引文
        const k = G.qtK[i];
        const land = tm.qtLand[k];
        const s0 = land - 22;
        if (f > s0 - 30) {
          const q = Math.max(0, Math.min(1, (f - s0) / 22));
          const e = EASE.inOut(q);
          const sx = G.qtSrc[k * 3];
          const sy = G.qtSrc[k * 3 + 1];
          const tx = G.qtPos[k * 3];
          const ty = G.qtPos[k * 3 + 1];
          const arc = Math.sin(Math.PI * e);
          x = mix(sx, tx, e) + 90 * (hash01(k, 55) - 0.5) * arc;
          y = mix(sy, ty, e) + 60 * arc;
          z = 200 * arc;
          size = mix(10, QS, e);
          a = smooth(0, 0.3, q);
          r = HI[0];
          g = HI[1];
          b = HI[2];
          halo = f >= land ? 0.5 + 3 * Math.exp(-(f - land) / 7) : 1.5;
          if (f >= land) {
            x += 0.8 * noise3(k, t * 0.4, 0, 3);
            y += 0.8 * noise3(k + 9, t * 0.4, 0, 3);
          }
        }
      }
      st.pos[i * 3] = x;
      st.pos[i * 3 + 1] = y;
      st.pos[i * 3 + 2] = z;
      st.size[i] = size;
      st.halo[i] = halo;
      st.col[i * 4] = r;
      st.col[i * 4 + 1] = g;
      st.col[i * 4 + 2] = b;
      st.col[i * 4 + 3] = a;
    }
  } else {
    // ---------------- c10：福 → 穹顶 + 风
    const p3 = prog(f, tm.fu0, tm.fu1, EASE.linear);
    const p4 = prog(f, tm.d0, tm.d1, EASE.linear);
    const th = 0.0045 * (f - tm.d0);
    const ct = Math.cos(th);
    const sn = Math.sin(th);
    const windAmt = smooth(wind0, wind0 + 30, f) * (1 - smooth(tm.sleep - 6, tm.sleep + 26, f));
    const gw = Gw[Math.max(0, Math.min(Gw.length - 1, Math.floor(f)))];
    const settle = prog(f, tm.sleep - 4, dur, EASE.inOut);
    const RR = DR * 1.16;
    if (!DOME) {
      morphPos(st.pos, G.SRC, G.FU, N, p3, {stagger: 0.5, order: 'radialIn', swirl: 280, lift: 420, seed: 21, ease: EASE.inOut});
      // 原文那几个字多停一会儿，再飞进「福」
      const qq0 = prog(f, tm.fu0 + 6, tm.fu1 - 2, EASE.inOut);
      for (let k = 0; k < G.QT.length; k++) {
        const i = G.QT[k];
        const arc = Math.sin(Math.PI * qq0);
        st.pos[i * 3] = mix(G.qtPos[k * 3], G.FU[i * 3], qq0) + 120 * (hash01(k, 57) - 0.5) * arc;
        st.pos[i * 3 + 1] = mix(G.qtPos[k * 3 + 1], G.FU[i * 3 + 1], qq0);
        st.pos[i * 3 + 2] = 300 * arc;
      }
      const da = 0.4 + 1.6 * smooth(tm.fu1, tm.fu1 + 30, f);
      for (let i = 0; i < N; i++) {
        const k = i * 3;
        st.pos[k] += da * noise3(G.FU[k] / 90, G.FU[k + 1] / 90, t * 0.35, 4);
        st.pos[k + 1] += da * noise3(G.FU[k] / 90 + 19, G.FU[k + 1] / 90 - 7, t * 0.35, 4);
      }
    } else {
      // 目标：穹顶（缓慢自转）/ 风里的字 / 其余退远淡出
      const dt3 = DT_BUF(N);
      for (let i = 0; i < N; i++) {
        const k = G.domeOf[i];
        if (k >= 0) {
          const x = G.dX[k];
          const z = G.dZ[k];
          dt3[i * 3] = FX + x * ct - z * sn;
          dt3[i * 3 + 1] = DY + G.dY[k];
          dt3[i * 3 + 2] = x * sn + z * ct;
        } else if (hash01(i, 91) < 0.32) {
          const v = 6 + 9 * hash01(i, 95);
          let x = G.dust[i * 3] + v * gw;
          x = ((((x + 820) % 1640) + 1640) % 1640) - 820;
          let y = G.dust[i * 3 + 1] + 46 * noise3(x / 260, G.dust[i * 3 + 1] / 260, f * 0.02, 6) * windAmt - settle * (30 + 70 * hash01(i, 96));
          let z = G.dust[i * 3 + 2];
          // 风绕开穹顶
          const ox = x - FX;
          const oy = y - DY;
          const rr = Math.hypot(ox, oy, z);
          if (oy > -30 && rr < RR) {
            const s = RR / (rr + 1e-6);
            x = FX + ox * s;
            y = DY + oy * s;
            z *= s;
          }
          dt3[i * 3] = x;
          dt3[i * 3 + 1] = y;
          dt3[i * 3 + 2] = z;
        } else {
          dt3[i * 3] = G.FU[i * 3] * 1.25;
          dt3[i * 3 + 1] = G.FU[i * 3 + 1] * 1.25;
          dt3[i * 3 + 2] = -500;
        }
      }
      morphPos(st.pos, G.FU, dt3, N, p4, {stagger: 0.45, order: 'random', swirl: 160, lift: 320, seed: 29, ease: EASE.inOut});
    }
    // 颜色
    const fuHit = f >= tm.fu1 ? Math.exp(-(f - tm.fu1) / 10) : 0;
    const breathe = 0.9 + 0.1 * Math.sin((f - tm.sleep) / 22);
    for (let i = 0; i < N; i++) {
      const h = hash01(i, 3);
      const qk = G.qtK[i];
      // 福的样子
      let size = 6.2 + 1.2 * h;
      let a = (0.42 + 0.3 * h) * (qk >= 0 ? 1 : smooth(0.05, 0.6, p3));
      let r = mix(GOLD[0], HI[0], 0.5 + 0.3 * fuHit);
      let g = mix(GOLD[1], HI[1], 0.5 + 0.3 * fuHit);
      let b = mix(GOLD[2], HI[2], 0.5 + 0.3 * fuHit);
      let halo = (0.6 + 0.8 * h) * (1 + 2 * fuHit);
      if (qk >= 0) {
        const e = prog(f, tm.fu0 + 6, tm.fu1 - 8, EASE.inOut);
        size = mix(QS, size, e);
        a = mix(1, a, e);
      }
      if (DOME) {
        const k = G.domeOf[i];
        if (k >= 0) {
          // 穹顶：前面亮、后面暗；日子有秩序 → 一圈圈亮起
          const x = st.pos[i * 3 + 2];
          const front = Math.max(0, Math.min(1, (x + DR) / (2 * DR)));
          const lv = G.dLv[k];
          const tl = tm.order - 2 + lv * 8;
          const pulse = f >= tl ? Math.exp(-(f - tl) / 10) : 0;
          const on = smooth(tl - 2, tl + 4, f);
          let da = (0.42 + 0.4 * front + 0.12 * on + 0.5 * pulse) * (G.dNode[k] ? 1.15 : 1);
          if (f > tm.sleep) da *= breathe;
          a = mix(a, Math.min(1, da), p4);
          size = mix(size, G.dNode[k] ? 6.5 : 7.6, p4);
          const w = Math.min(1, 0.25 + 0.35 * on + pulse);
          r = mix(r, mix(GOLD[0], HI[0], w), p4);
          g = mix(g, mix(GOLD[1], HI[1], w), p4);
          b = mix(b, mix(GOLD[2], HI[2], w), p4);
          halo = mix(halo, (G.dNode[k] ? 2.2 : 0.9) * (1 + 2.5 * pulse + 0.4 * on), p4);
        } else if (hash01(i, 91) < 0.32) {
          const x = st.pos[i * 3];
          const edge = 1 - smooth(600, 790, Math.abs(x));
          const leaf = hash01(i, 97) < 0.05; // 少数大一点、读得出的字被风带过
          const da = (leaf ? 0.42 : 0.12 + 0.24 * h) * edge * (1 - 0.45 * settle);
          a = mix(a, da, p4);
          size = mix(size, leaf ? 12 + 9 * h : 3.5 + 5 * h * h, p4);
          r = mix(r, mix(GOLD[0], AMB[0], 0.35 * h), p4);
          g = mix(g, mix(GOLD[1], AMB[1], 0.35 * h), p4);
          b = mix(b, mix(GOLD[2], AMB[2], 0.35 * h), p4);
          halo = mix(halo, 0.4, p4);
        } else {
          a *= 1 - smooth(0, 0.7, p4);
        }
      }
      st.size[i] = size;
      st.halo[i] = halo;
      st.col[i * 4] = r;
      st.col[i * 4 + 1] = g;
      st.col[i * 4 + 2] = b;
      st.col[i * 4 + 3] = a;
    }
  }

  // ================= 账本上的墨字（亮纸上用 normal 混合）
  const items = G.items;
  for (let k = 0; k < INK_MAX; k++) {
    if (k >= items.length || FUP) {
      ink.col[k * 4 + 3] = 0;
      continue;
    }
    const it = items[k];
    const h = hash01(k, 61);
    const w0 = (it.pg === 0 ? 282 : 348) + it.r * 4 + it.c * 0.33;
    let x = (it.x - 540) * kbS;
    let y = (960 - it.y) * kbS;
    let z = 0;
    let size = it.size * kbS;
    let rot = it.rot;
    let [r, g, b] = INKC;
    let a = 0.6 * smooth(w0, w0 + 3, f) * photoA;
    let halo = 0;
    // 世界不是银行：账本从右往左一页页被吹空
    const lift = B + (it.pg === 1 ? 8 : 36) + (1 - it.u) * 16 + it.v * 5;
    const dt = f - lift;
    if (dt > 0) {
      const e = smooth(0, 8, dt);
      y += 0.9 * dt + 0.045 * dt * dt * (0.6 + h);
      x += -0.7 * dt * h + 26 * noise3(k * 0.1, dt * 0.04, 3, 13) * Math.min(1, dt / 20);
      z += 2.5 * dt;
      rot += dt * 0.02 * (h - 0.5);
      size *= 1 + 0.5 * smooth(0, 30, dt);
      r = mix(r, HI[0], e);
      g = mix(g, HI[1], e);
      b = mix(b, HI[2], e);
      a = mix(0.6, 0.95, e) * (1 - smooth(16, 56 + 24 * h, dt)) * photoA;
      halo = 2 * e;
    }
    ink.pos[k * 3] = x;
    ink.pos[k * 3 + 1] = y;
    ink.pos[k * 3 + 2] = z;
    ink.size[k] = size;
    ink.rot[k] = rot;
    ink.halo[k] = halo;
    ink.col[k * 4] = r;
    ink.col[k * 4 + 1] = g;
    ink.col[k * 4 + 2] = b;
    ink.col[k * 4 + 3] = a;
  }

  // ================= 镜头
  const Z = 44;
  const ctr = (list: number[]) => {
    let sx = 0;
    let sy = 0;
    list.forEach((i) => {
      const [x, y] = page.xy(i);
      sx += x;
      sy += y;
    });
    return [sx / list.length, sy / list.length];
  };
  const [ax, ay] = ctr(G.L1);
  const [bx, by] = ctr(G.L2);
  const camQ = (cx: number, cy: number, z = Z): Cam => camOn(cx + (540 - SAFE.cx) / (z / page.cell), cy - (960 - 700) / (z / page.cell), page.cell, z);
  const full: Cam = {pos: [0, 0, camZ()]};
  const domeCam: Cam = {pos: [0, 760, camZ() * 0.92], target: [0, -60, 0]};
  const domeEnd: Cam = {pos: [0, 690, camZ() * 0.84], target: [0, -70, 0]};
  const seq: [number, Cam][] = [
    [0, camQ(ax, ay, 40)],
    [96, camQ(ax, ay, Z)],
    [104, camQ(ax, ay, Z)],
    [124, camQ(bx, by, Z)],
    [190, camQ(bx, by, Z + 2)],
    [238, full],
    [tm.d0, full],
    [tm.d1 + 4, domeCam],
    [dur, domeEnd],
  ];
  let cam = seq[0][1];
  for (let k = 1; k < seq.length; k++) {
    if (f <= seq[k][0]) {
      const [f0, c0] = seq[k - 1];
      const [f1, c1] = seq[k];
      cam = camMix(c0, c1, EASE.inOut(Math.min(1, Math.max(0, (f - f0) / Math.max(1, f1 - f0)))));
      break;
    }
    cam = seq[k][1];
  }
  const dr = closeUp * 5 * Math.sin(t * 0.7);
  cam = {...cam, pos: [cam.pos![0] + dr, cam.pos![1], cam.pos![2]], target: [(cam.target ? cam.target[0] : cam.pos![0]) + dr, cam.target ? cam.target[1] : cam.pos![1], cam.target ? cam.target[2] : 0]};

  // ================= DOM 叠层
  const srcA = closeUp * (1 - prog(f, 214, 230));
  const ov1 = 0.6 * prog(f, tm.eLand[3] + 2, tm.eLand[3] + 16) * (1 - prog(f, B - 2, B + 4));
  const ov2 = 0.6 * prog(f, tm.eLand[7] + 2, tm.eLand[7] + 16) * (1 - prog(f, B - 2, B + 4));
  const arrowP = prog(f, tm.eLand[4] - 14, tm.eLand[4] + 2, EASE.out);
  const arrowA = arrowP * (1 - prog(f, B - 2, B + 4));
  const jx = trem * 0.6 * Math.sin(f * 1.7);
  const jy = trem * 0.6 * Math.cos(f * 2.3);
  const patchA = photoA * 0.9;
  const qLabA = prog(f, tm.qtLand[12] + 4, tm.qtLand[12] + 18) * (1 - prog(f, tm.fu0 + 2, tm.fu0 + 14));
  const fuA = 0.5 * prog(f, tm.fu1 - 4, tm.fu1 + 14, EASE.out) * (1 - prog(f, tm.d0 - 2, tm.d0 + 12));
  const glowA = prog(f, tm.d0 + 10, tm.d1 + 20) * (f > tm.sleep ? 0.85 + 0.15 * Math.sin((f - tm.sleep) / 22) : 1);
  return (
    <AbsoluteFill>
      <Backdrop light={[0.47, FUP ? 0.52 : 0.42]} glow={1} />
      <Plate src="img/workshop_ledger.jpg" p={kbP} from={{s: 1.06}} to={{s: 1}} opacity={photoA} grade="brightness(.86) saturate(.92)" />
      {patchA > 0.01 ? (
        <AbsoluteFill style={{opacity: patchA, background: 'radial-gradient(ellipse 560px 380px at 444px 640px, rgba(12,9,6,.66) 0%, rgba(12,9,6,.4) 55%, rgba(12,9,6,0) 100%)'}} />
      ) : null}
      {glowA > 0.01 ? (
        <AbsoluteFill style={{opacity: glowA, background: 'radial-gradient(ellipse 360px 300px at 480px 1010px, rgba(232,164,90,.32) 0%, rgba(232,164,90,.1) 50%, rgba(232,164,90,0) 100%)'}} />
      ) : null}
      <GlyphCanvas camera={cam}>
        <GlyphLayer state={ink} blend="normal" glow={0.1} halo={0.3} haloSize={3} renderOrder={1} />
        <GlyphLayer state={st} glow={0.55} halo={0.16} haloSize={3.2} renderOrder={4} />
      </GlyphCanvas>
      {ov1 > 0.005 ? (
        <div style={{position: 'absolute', inset: 0, transform: `translate(${jx}px, ${jy}px)`}}>
          <MaskText text={E1} size={ES} x={EX} y={EY1} opacity={ov1} glow={0.8} />
        </div>
      ) : null}
      {ov2 > 0.005 ? (
        <div style={{position: 'absolute', inset: 0, transform: `translate(${jx}px, ${jy}px)`}}>
          <MaskText text={E2} size={ES} x={EX} y={EY2} opacity={ov2} glow={0.8} />
        </div>
      ) : null}
      {arrowA > 0.01 ? (
        <svg width={1080} height={1920} style={{position: 'absolute', left: jx, top: jy, opacity: arrowA}}>
          <defs>
            <linearGradient id="c2ar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={PAL.goldHi} />
              <stop offset="1" stopColor={PAL.amber} />
            </linearGradient>
          </defs>
          <path d={`M ${SAFE.cx} 652 L ${SAFE.cx} ${652 + 80 * arrowP}`} stroke="url(#c2ar)" strokeWidth={7} strokeLinecap="round" fill="none" style={{filter: 'drop-shadow(0 0 8px rgba(255,200,120,.6))'}} />
          <path d={`M ${SAFE.cx - 22} ${710} L ${SAFE.cx} ${733} L ${SAFE.cx + 22} ${710}`} stroke={PAL.amber} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={smooth(0.6, 1, arrowP)} />
        </svg>
      ) : null}
      {fuA > 0.01 ? <MaskText text="福" size={FU_S} x={FX} y={FU_Y} opacity={fuA} /> : null}
      <Vignette amount={0.5} />
      {srcA > 0.01 ? <Label text="《人选天选论》· 序 · 原文" x={SAFE.x0 + 8} y={392} p={srcA} size={32} /> : null}
      {qLabA > 0.01 ? <Label text="《人选天选论》· 序 · 原文" x={QX0} y={690} p={qLabA} size={30} /> : null}
      {f >= tm.d0 ? <Title text="稳定的结构" f={f} charStarts={atc('稳定的结构')} size={100} x={SAFE.cx} y={440} /> : null}
    </AbsoluteFill>
  );
};

// 每帧复用的目标缓冲（不每帧 new）
let DT_CACHE: Float32Array | null = null;
const DT_BUF = (n: number) => {
  if (!DT_CACHE || DT_CACHE.length !== n * 3) DT_CACHE = new Float32Array(n * 3);
  return DT_CACHE;
};

export const S: SceneMod = {
  C,
  hideSubs: [],
  sfx: ({at}) => [
    [at('世界从来') + 2, 'chime', 0.12, 80],
    [at('立刻支付', 0, 1) + 2, 'tick', 0.1, 12],
    [at('很多年') + 6, 'gather', 0.18, 78],
    [230, 'gather', 0.18, 78],
    [at('今天吃点苦') - 2, 'scratch', 0.12, 22],
    [at('以后会补偿') - 2, 'scratch', 0.12, 22],
    [at('世界不是银行') - 3, 'whoosh_soft', 0.16, 36],
    [at('世界不是银行') + 8, 'page', 0.18, 26],
    [at('世界不是银行') + 36, 'page', 0.16, 26],
    [at('没有可以'), 'chime', 0.1, 70],
    [at('他说的福') - 24, 'gather', 0.2, 78],
    [at('而是一个') - 6, 'gather', 0.18, 78],
    [at('日子有秩序') - 2, 'chime', 0.1, 80],
    [at('睡得着') + 12, 'bell', 0.15, 120],
  ],
};
