// 场景 B1 · 他是谁（纪录片式开头：海与远方）。全程同一份 34952 个字粒子，一路变形：
// 第 0 帧接 A 场的金色「选」→ 散开聚成「姜蓝」（MaskText 锐利叠层）+「自己造船的路飞」
// → 字落成整页书，按翡翠作坊照片取色 =「字拼成照片」→ 推近 → 翡翠时凝成真照片（湖北→广东 档案卡）
// → 照片碎成字飞成「2019」→「买船」划掉 → 字从龙骨往上一层层「焊」出船厂里那艘船（落点即真照片，严丝合缝）★
// → 船体的字飞成一张发光的游艇设计图（笔尖描线）→ 26 公斤 → 12 个「退回」章连盖 → 金色「通过」
// → 书里原本的五个字「环/球/路/飞/号」从书里飞出来写在船身上 → 设计图化成海：书的字流成船尾的航迹（越远越淡）★
import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import type {SceneMod, SceneProps} from '../core/timeline';
import {Backdrop, Label, PAL, Plate, SAFE, SANS, SERIF, SERIF_BLACK, Vignette} from '../core/look';
import {EASE, hex, mix, prog, smooth} from '../core/anim';
import type {Cam, Img, Mask} from '../core/glyph';
import {GlyphCanvas, GlyphLayer, MaskText, N_BOOK, camZ, hash01, maskTargets, noise3, ranks, sampleImg, textLayout, useGState, useImageData, usePage, useTextMask} from '../core/glyph';

const N = N_BOOK;
const CX = SAFE.cx - 540; // 安全区中心（中心原点）= -96
const GOLD = hex(PAL.gold);
const HI = hex(PAL.goldHi);
const AMB = hex(PAL.amber);
const CREAM = hex(PAL.cream);
const NAME_M = {size: 360, x: CX, y: 250};
const YEAR_M = {size: 300, x: CX, y: 520};
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const frac = (x: number) => x - Math.floor(x);
type Pt = [number, number];

// ---------------------------------------------------------------- 船厂照片里那艘船（x 中心原点，y = DOM 像素）
const HULL_POLY: Pt[] = [[-305, 880], [-210, 875], [-205, 800], [-160, 765], [-130, 720], [200, 712], [280, 745], [300, 800], [340, 840], [345, 1060], [200, 1150], [0, 1240], [-150, 1290], [-260, 1285], [-305, 1240], [-330, 1150], [-336, 1000], [-322, 910]];
const inPoly = (x: number, y: number, poly: Pt[]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
// 船身里的亮处多放字（按亮度重复采样），暗的脚手架缝隙少放 → 字的疏密就是照片的光
const hullMask = (img: Img): Mask => {
  const ins: number[] = [];
  const a = new Uint8Array(img.w * img.h);
  for (let v = 0; v < img.h; v++) {
    for (let u = 0; u < img.w; u++) {
      const x = ((u + 0.5) / img.w) * 1080 - 540;
      const y = ((v + 0.5) / img.h) * 1920;
      if (!inPoly(x, y, HULL_POLY)) continue;
      const k = (v * img.w + u) * 4;
      const l = 0.2126 * img.d[k] + 0.7152 * img.d[k + 1] + 0.0722 * img.d[k + 2];
      if (l < 40) continue;
      a[v * img.w + u] = 255;
      const rep = 1 + Math.floor(l / 50);
      for (let r = 0; r < rep; r++) ins.push(v * img.w + u);
    }
  }
  return {w: img.w, h: img.h, a, inside: Int32Array.from(ins)};
};

// ---------------------------------------------------------------- 游艇设计图（侧视，船头朝右）。坐标相对 (CX, WL)
const WL = -170; // 水线 y（中心原点）→ DOM 1130
const sheerY = (x: number) => 135 + 40 * ((x + 370) / 735) ** 2;
const quad = (a: Pt, c: Pt, b: Pt, n = 20): Pt[] =>
  Array.from({length: n + 1}, (_, k) => {
    const t = k / n;
    const u = 1 - t;
    return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]] as Pt;
  });
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
type Path = {pts: Pt[]; w: number; faint?: boolean};
const drawPaths = (): Path[] => {
  const P: Path[] = [];
  P.push({pts: Array.from({length: 33}, (_, k) => [-370 + (735 * k) / 32, sheerY(-370 + (735 * k) / 32)] as Pt), w: 1}); // 舷弧线
  P.push({pts: quad([365, sheerY(365)], [352, 30], [250, -40]), w: 1}); // 船首
  P.push({pts: [[250, -40], [-330, -40], [-370, 0], [-370, sheerY(-370)]], w: 1}); // 龙骨 + 艉封板
  P.push({pts: [[-370, 0], [295, 0]], w: 0.55}); // 水线
  P.push({pts: [[-366, 16], [300, 16]], w: 0.4});
  P.push({pts: [[-300, sheerY(-300)], [-300, 228], [130, 228], [195, sheerY(195)]], w: 0.9}); // 主甲板舱
  P.push({pts: rect(-275, 172, 112, 206), w: 0.55});
  for (let x = -220; x < 112; x += 55) P.push({pts: [[x, 172], [x, 206]], w: 0.35});
  P.push({pts: [[-245, 228], [-245, 300], [55, 300], [120, 228]], w: 0.9}); // 上层甲板
  P.push({pts: rect(-225, 246, 45, 284), w: 0.55});
  for (let x = -170; x < 45; x += 54) P.push({pts: [[x, 246], [x, 284]], w: 0.35});
  P.push({pts: [[-205, 300], [-190, 334], [-25, 334], [10, 300]], w: 0.8}); // 飞桥
  P.push({pts: [[-110, 334], [-110, 420]], w: 0.7}); // 桅
  P.push({pts: [[-150, 394], [-70, 394]], w: 0.6});
  P.push({pts: [[195, sheerY(195) + 26], [350, sheerY(350) + 24]], w: 0.3}); // 栏杆
  for (let x = -300; x <= 300; x += 75) P.push({pts: [[x, -40], [x, sheerY(x)]], w: 0.3, faint: true}); // 站线
  P.push({pts: [[-420, -78], [420, -78]], w: 0.45, faint: true}); // 基线
  for (let x = -375; x <= 375; x += 75) P.push({pts: [[x, -70], [x, -88]], w: 0.3, faint: true});
  return P;
};

// ---------------------------------------------------------------- 海：航迹（中心原点 y 向上）
const WAKE: Pt[] = [[-34, 92], [-52, 220], [-40, 345], [8, 445], [80, 518], [148, 576]];
const STERN: Pt = [-34, 92];
const ARM_L: Pt = [-560, 330];
const ARM_R: Pt = [360, 420];
const KP = 1.2; // 透视：远处压缩
const NLANE = 20;
const NPL = 150;
const RIVER0 = 6000; // 航迹用书的这一段字（连续字流 → 一行行书顺着水流走）
const NRIVER = NLANE * NPL;
const buildWake = () => {
  // Catmull-Rom → 240 点 + 弧长
  const pts: Pt[] = [];
  const P = WAKE;
  for (let k = 0; k < P.length - 1; k++) {
    const p0 = P[Math.max(0, k - 1)];
    const p1 = P[k];
    const p2 = P[k + 1];
    const p3 = P[Math.min(P.length - 1, k + 2)];
    for (let j = 0; j < 48; j++) {
      const t = j / 48;
      const t2 = t * t;
      const t3 = t2 * t;
      const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      pts.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  pts.push(P[P.length - 1]);
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const L = cum[cum.length - 1];
  const out = new Float32Array(4);
  const at = (s: number) => {
    const target = Math.min(0.9999, Math.max(0, s)) * L;
    let lo = 0;
    let hi = cum.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (cum[m] < target) lo = m;
      else hi = m;
    }
    const u = (target - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
    const dx = pts[hi][0] - pts[lo][0];
    const dy = pts[hi][1] - pts[lo][1];
    const d = Math.hypot(dx, dy) || 1;
    out[0] = pts[lo][0] + dx * u;
    out[1] = pts[lo][1] + dy * u;
    out[2] = dx / d;
    out[3] = dy / d;
    return out;
  };
  return at;
};

// ---------------------------------------------------------------- 镜头：绕点 Q 放大 s 倍（照片、锐利字叠层、字粒子三者同一个变换，永远对齐）
type View = {s: number; qx: number; qy: number};
const camOf = (v: View): Cam => {
  const cx = (v.qx * (v.s - 1)) / v.s;
  const cy = (v.qy * (v.s - 1)) / v.s;
  return {pos: [cx, cy, camZ() / v.s], target: [cx, cy, 0]};
};
const kbOf = (v: View) => ({s: v.s, x: v.qx * (1 - v.s), y: v.qy * (1 - v.s)});
const cssOf = (v: View): React.CSSProperties => ({transform: `translate(${v.qx * (1 - v.s)}px, ${-v.qy * (1 - v.s)}px) scale(${v.s})`, transformOrigin: '50% 50%'});

const NAME_CHARS = '环球路飞号';
const NAME_IDX = [2607, 516, 1161, 1162, 3660]; // 书里原本的「环」「球」「路飞」「号」（第 1161–1162 字就是「路飞」）

const C: React.FC<SceneProps> = ({f, at, atc}) => {
  const st = useGState();
  const page = usePage();
  const xuanMask = useTextMask('选', {size: 900, y: 70});
  const nameMask = useTextMask('姜蓝', NAME_M);
  const yearMask = useTextMask('2019', YEAR_M);
  const jadeImg = useImageData('img/jade_workshop.jpg', 270, 480);
  const shipImg = useImageData('img/shipyard.jpg', 270, 480);

  const K = useMemo(
    () => ({
      luffy: at('自己造船的路飞'),
      luffyC: atc('自己造船的路飞'),
      n90: at('九零后'),
      hubei: at('湖北人'),
      da2: at('大二'),
      quit: at('退学'),
      gd: at('广东'),
      jade: at('翡翠'),
      y2019: at('二零一九'),
      y2019c: atc('二零一九'),
      sell: at('卖掉了公司'),
      buy: at('买船'),
      build: at('自己造一艘'),
      design: at('自己设计'),
      kg: at('二十六'),
      kgEnd: at('公斤'),
      cls: at('船级社'),
      back: at('退回了十二次'),
      back12: at('十二次'),
      revise: at('一直改到'),
      pass: at('通过'),
      name: at('船的名字'),
      from: at('来自他'),
      op: at('海贼王'),
      ring: atc('环球路飞号'),
      y2025: at('二零二五年十一月'),
      y2025c: atc('二零二五年十一月'),
      hk: at('香港'),
      voyage: at('环球航行'),
    }),
    [at, atc],
  );
  // 12 个「退回」章：落在 back..back12 结束后一点，每个间隔 ~3 帧
  const stamps = useMemo(() => Array.from({length: 12}, (_, k) => K.back + Math.round(k * 3.2)), [K]);

  const T = useMemo(() => {
    if (!xuanMask || !nameMask || !yearMask || !jadeImg || !shipImg) return null;
    const xuan = maskTargets(xuanMask, N, 23, 1.2); // 和 A 场最后的「选」逐粒一致
    const name = maskTargets(nameMask, N, 31, 1.2);
    const year = maskTargets(yearMask, N, 41, 1.2);
    const hull = maskTargets(hullMask(shipImg), N, 53, 1.4);
    // 整页按翡翠照片取色
    const jade = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      const [r, g, b] = sampleImg(jadeImg, page.pos[i * 3], page.pos[i * 3 + 1]);
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      jade[i * 4] = Math.min(1, r * 1.45);
      jade[i * 4 + 1] = Math.min(1, g * 1.45);
      jade[i * 4 + 2] = Math.min(1, b * 1.45);
      jade[i * 4 + 3] = 0.3 + 0.7 * Math.min(1, l * 1.6);
    }
    // 船体：颜色取自船厂照片；从龙骨往上「焊」（按目标高度排先后）
    const hullCol = new Float32Array(N * 4);
    let ymin = 1e9;
    let ymax = -1e9;
    for (let i = 0; i < N; i++) {
      const y = hull[i * 3 + 1];
      ymin = Math.min(ymin, y);
      ymax = Math.max(ymax, y);
      const [r, g, b] = sampleImg(shipImg, hull[i * 3], y);
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      hullCol[i * 4] = Math.min(1, r * 1.25 + 0.05);
      hullCol[i * 4 + 1] = Math.min(1, g * 1.2 + 0.04);
      hullCol[i * 4 + 2] = Math.min(1, b * 1.1);
      hullCol[i * 4 + 3] = 0.25 + 0.75 * Math.min(1, l * 1.5);
    }
    const hullRank = new Float32Array(N);
    for (let i = 0; i < N; i++) hullRank[i] = 0.85 * ((hull[i * 3 + 1] - ymin) / (ymax - ymin)) + 0.15 * hash01(i, 61);
    // 设计图：ND 个字沿线条均匀排（按描线顺序），其余的字退到远处熄灭
    const paths = drawPaths();
    const segs: {a: Pt; b: Pt; len: number; w: number; faint: boolean}[] = [];
    paths.forEach((p) => {
      for (let k = 1; k < p.pts.length; k++) {
        const a = p.pts[k - 1];
        const b = p.pts[k];
        segs.push({a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]), w: p.w, faint: !!p.faint});
      }
    });
    const totalW = segs.reduce((s, g) => s + g.len * g.w, 0);
    const ND = 13000;
    const draw = new Float32Array(N * 3);
    const drawRole = new Uint8Array(N); // 0 熄灭 1 线 2 淡线
    const drawRank = new Float32Array(N);
    let si = 0;
    let acc = 0;
    for (let j = 0; j < ND; j++) {
      const i = Math.floor((j * N) / ND);
      const u = ((j + 0.5) / ND) * totalW;
      while (si < segs.length - 1 && acc + segs[si].len * segs[si].w < u) {
        acc += segs[si].len * segs[si].w;
        si++;
      }
      const g = segs[si];
      const q = Math.min(1, Math.max(0, (u - acc) / Math.max(1e-6, g.len * g.w)));
      const nx = -(g.b[1] - g.a[1]) / (g.len || 1);
      const ny = (g.b[0] - g.a[0]) / (g.len || 1);
      const jit = (hash01(i, 71) - 0.5) * 2.2;
      draw[i * 3] = CX + g.a[0] + (g.b[0] - g.a[0]) * q + nx * jit;
      draw[i * 3 + 1] = WL + g.a[1] + (g.b[1] - g.a[1]) * q + ny * jit;
      drawRole[i] = g.faint ? 2 : 1;
      drawRank[i] = j / ND;
    }
    for (let i = 0; i < N; i++) {
      if (drawRole[i]) continue;
      draw[i * 3] = hull[i * 3] * 1.35;
      draw[i * 3 + 1] = hull[i * 3 + 1] * 1.35 + 120;
      draw[i * 3 + 2] = -1500 - 600 * hash01(i, 72);
      drawRank[i] = hash01(i, 73);
    }
    // 海：0 熄灭 1 航迹（连续一段书）2/3 两条开尔文尾浪 4 海面闪光
    const seaRole = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (i >= RIVER0 && i < RIVER0 + NRIVER) seaRole[i] = 1;
      else {
        const h = hash01(i, 101);
        seaRole[i] = h < 0.075 ? (hash01(i, 102) < 0.5 ? 2 : 3) : h < 0.5 ? 4 : 0;
      }
    }
    // 船名的五个字在船身上的位置
    const nameSlots = textLayout(NAME_CHARS, {x: CX - 60, y: WL + 70, size: 88, tracking: 0.14});
    return {xuan, name, year, hull, jade, hullCol, hullRank, draw, drawRole, drawRank, seaRole, nameSlots, wake: buildWake()};
  }, [xuanMask, nameMask, yearMask, jadeImg, shipImg, page]);

  if (!T) return <Backdrop />;

  const t = f / 30;
  // ---------------------------------------------------------------- 时间表
  const S0 = [4, 36]; // 选 → 姜蓝
  const S1 = [K.n90 - 2, K.n90 + 66]; // 姜蓝 → 整页（翡翠照片拼字）
  const S2 = [K.y2019 - 6, K.y2019 + 22]; // 照片 → 2019
  const S3 = [K.buy + 8, K.build + 24]; // 2019 → 船体（从龙骨往上）
  const S4 = [K.design + 10, K.design + 66]; // 船 → 设计图（描线）
  const S5 = [K.y2025 - 8, K.y2025 + 48]; // 设计图 → 海
  const plateJ = prog(f, K.jade - 6, K.jade + 12) * (1 - prog(f, K.y2019 - 8, K.y2019 + 6));
  const plateS = prog(f, K.build + 12, K.build + 34) * (1 - prog(f, K.design + 8, K.design + 32));
  const plateB = prog(f, K.design + 8, K.design + 32) * (1 - prog(f, S5[0], S5[0] + 30));
  const plateY = prog(f, S5[0] + 4, S5[0] + 40);

  let stage: number;
  let A: Float32Array;
  let B: Float32Array;
  let rk: Float32Array;
  let p: number;
  let sw: number;
  let lift: number;
  let stg: number;
  if (f < S1[0]) {
    stage = 0;
    A = T.xuan;
    B = T.name;
    rk = ranks(T.xuan, N, 'radial', 5);
    p = prog(f, S0[0], S0[1], EASE.linear);
    stg = 0.5;
    sw = 220;
    lift = 650;
  } else if (f < S2[0]) {
    stage = 1;
    A = T.name;
    B = page.pos;
    rk = ranks(T.name, N, 'radial', 7);
    p = prog(f, S1[0], S1[1], EASE.linear);
    stg = 0.55;
    sw = 260;
    lift = 800;
  } else if (f < S3[0]) {
    stage = 2;
    A = page.pos;
    B = T.year;
    rk = ranks(page.pos, N, 'random', 9);
    p = prog(f, S2[0], S2[1], EASE.linear);
    stg = 0.5;
    sw = 200;
    lift = 600;
  } else if (f < S4[0]) {
    stage = 3;
    A = T.year;
    B = T.hull;
    rk = T.hullRank;
    p = prog(f, S3[0], S3[1], EASE.linear);
    stg = 0.75;
    sw = 160;
    lift = 380;
  } else if (f < S5[0]) {
    stage = 4;
    A = T.hull;
    B = T.draw;
    rk = T.drawRank;
    p = prog(f, S4[0], S4[1], EASE.linear);
    stg = 0.8;
    sw = 60;
    lift = 220;
  } else {
    stage = 5;
    A = T.draw;
    B = T.draw; // 目标每帧现算（海在流动）
    rk = ranks(T.draw, N, 'random', 13);
    p = prog(f, S5[0], S5[1], EASE.linear);
    stg = 0.6;
    sw = 0;
    lift = 260;
  }
  const [fa, fb] = stage === 0 ? S0 : stage === 1 ? S1 : stage === 2 ? S2 : stage === 3 ? S3 : stage === 4 ? S4 : S5;
  const landF = (i: number) => fa + ((fb - fa) * (1 + stg * rk[i])) / (1 + stg);

  // 各段的「外观」
  const sweepX = mix(CX - 460, CX + 460, prog(f, K.luffy - 2, K.luffyC[6] + 10, EASE.inOut));
  const sweepOn = f > K.luffy - 4 && f < K.luffyC[6] + 14 ? 1 : 0;
  const jadeDim = mix(1, 0.2, plateJ);
  const shipDim = mix(1, 0.22, plateS);
  const passSweep = prog(f, K.pass - 2, K.pass + 34, EASE.inOut);
  const nameGlow = smooth(K.name - 10, K.name + 20, f);
  const wake = T.wake;

  let sizeA = 0;
  let rA = 0;
  let gA = 0;
  let bA = 0;
  let aA = 0;
  let hA = 0;
  let rotB = 0;
  // 外观函数：写进 sizeA.. 变量（L = 段号，i = 字）
  const look = (L: number, i: number, x: number, y: number) => {
    const h = hash01(i, 3);
    rotB = 0;
    if (L === 0) {
      sizeA = 6.6;
      rA = mix(GOLD[0], HI[0], 0.7);
      gA = mix(GOLD[1], HI[1], 0.7);
      bA = mix(GOLD[2], HI[2], 0.7);
      aA = 0.8 + 0.2 * h;
      hA = 0.6 + 0.8 * h;
    } else if (L === 1) {
      const hl = sweepOn * Math.exp(-(((x - sweepX) / 80) ** 2));
      sizeA = 3.2 + 5.5 * h * h * h;
      rA = mix(mix(GOLD[0], HI[0], 0.35), 1, hl * 0.4);
      gA = mix(mix(GOLD[1], HI[1], 0.35), HI[1], hl);
      bA = mix(mix(GOLD[2], HI[2], 0.35), HI[2], hl);
      aA = 0.26 + 0.22 * h + 0.45 * hl;
      hA = (0.6 + 0.8 * h) * (1 + 2.5 * hl);
    } else if (L === 2) {
      sizeA = page.cell * 0.98;
      rA = T.jade[i * 4];
      gA = T.jade[i * 4 + 1];
      bA = T.jade[i * 4 + 2];
      aA = T.jade[i * 4 + 3] * 0.9 * jadeDim;
      hA = 0.15;
    } else if (L === 3) {
      sizeA = 3.4 + 5.5 * h * h * h;
      rA = mix(GOLD[0], HI[0], 0.5);
      gA = mix(GOLD[1], HI[1], 0.5);
      bA = mix(GOLD[2], HI[2], 0.5);
      aA = 0.3 + 0.25 * h;
      hA = 0.6 + 0.8 * h;
    } else if (L === 4) {
      sizeA = 3.6 + 3.6 * h * h * h;
      rA = T.hullCol[i * 4];
      gA = T.hullCol[i * 4 + 1];
      bA = T.hullCol[i * 4 + 2];
      aA = T.hullCol[i * 4 + 3] * 0.46 * shipDim;
      hA = 0.22;
    } else if (L === 5) {
      const role = T.drawRole[i];
      sizeA = role === 1 ? 4.3 + 1.8 * h : 3.6 + 1.2 * h;
      rA = mix(GOLD[0], HI[0], 0.55);
      gA = mix(GOLD[1], HI[1], 0.55);
      bA = mix(GOLD[2], HI[2], 0.55);
      aA = role === 1 ? 0.5 + 0.2 * h : role === 2 ? 0.17 : 0;
      hA = role === 1 ? 0.55 : 0.2;
      // 「通过」：一道光顺着描线的顺序走一遍
      const ps = passSweep > 0 && passSweep < 1 ? Math.exp(-(((T.drawRank[i] - passSweep) / 0.05) ** 2)) : 0;
      aA += 0.5 * ps * (role ? 1 : 0) + 0.12 * nameGlow * (role === 1 ? 1 : 0);
      hA *= 1 + 3 * ps;
    } else {
      // 海
      const role = T.seaRole[i];
      if (role === 1) {
        const j = i - RIVER0;
        const lane = Math.floor(j / NPL);
        const o = ((lane + 0.5) / NLANE) * 2 - 1;
        const d = frac((j % NPL) / NPL + t * 0.05 + lane * 0.137);
        const s = (d * (1 + KP)) / (d + KP);
        const sc = (KP / (d + KP)) ** 2;
        const w = wake(s);
        const hw = (70 + 190 * d) * (KP / (d + KP)) * (1 + 0.06 * Math.sin(t * 0.9 + lane * 0.7));
        const wob = 2.5 * noise3(w[0] / 40, w[1] / 40 + lane, t * 0.6, 17);
        seaX = w[0] - w[3] * (o * hw + wob);
        seaY = w[1] + w[2] * (o * hw + wob);
        sizeA = 2.4 + 9.6 * sc;
        const cr = 0.55 + 0.45 * (1 - Math.abs(o));
        rA = HI[0];
        gA = HI[1];
        bA = mix(HI[2], GOLD[2], 0.6);
        aA = 0.62 * (1 - s) ** 1.1 * smooth(0.02, 0.1, d) * cr * (0.7 + 0.3 * h);
        hA = 0.25;
        rotB = Math.atan2(w[3], w[2]);
      } else if (role === 2 || role === 3) {
        const end = role === 2 ? ARM_L : ARM_R;
        const d = frac(hash01(i, 103) + t * 0.035);
        const s = (d * (1 + KP)) / (d + KP);
        const sc = (KP / (d + KP)) ** 2;
        const dx = end[0] - STERN[0];
        const dy = end[1] - STERN[1];
        const L2 = Math.hypot(dx, dy);
        const jit = (hash01(i, 104) - 0.5) * 2 * (8 + 26 * s);
        seaX = STERN[0] + dx * s - (dy / L2) * jit;
        seaY = STERN[1] + dy * s + (dx / L2) * jit;
        sizeA = 2.2 + 6.5 * sc;
        rA = CREAM[0];
        gA = CREAM[1];
        bA = CREAM[2];
        aA = 0.22 * (1 - s) * smooth(0, 0.08, d) * (0.6 + 0.4 * h);
        hA = 0.2;
        rotB = Math.atan2(dy, dx);
      } else if (role === 4) {
        const v = hash01(i, 105) ** 1.6;
        seaY = 548 - 1560 * v;
        seaX = (hash01(i, 106) - 0.5) * 1240 + 6 * Math.sin(t * 0.7 + i);
        sizeA = 2 + 8.5 * v;
        const tw = Math.min(1, Math.max(0, noise3(seaX / 70, seaY / 24, t * 0.8, 21) * 2.4 - 0.5));
        const boat = ((seaX - 30) / 190) ** 2 + ((seaY + 105) / 215) ** 2 < 1 ? 0 : 1;
        rA = mix(CREAM[0], AMB[0], 0.35 * h);
        gA = mix(CREAM[1], AMB[1], 0.35 * h);
        bA = mix(CREAM[2], AMB[2], 0.35 * h);
        aA = 0.3 * tw * boat;
        hA = 0.6;
      } else {
        seaX = x;
        seaY = y;
        sizeA = 3;
        aA = 0;
        hA = 0;
      }
    }
  };
  let seaX = 0;
  let seaY = 0;

  const stampHit = (i: number) => {
    let e = 0;
    for (let k = 0; k < stamps.length; k++) if (f >= stamps[k]) e = Math.max(e, Math.exp(-(f - stamps[k]) / 5) * (0.6 + 0.8 * hash01(i + k, 77)));
    return e;
  };

  const driftAmt = stage === 0 ? (f < S0[0] ? 2.6 : 2.2) : stage === 1 ? 0.3 : stage === 2 ? 2 : stage === 3 ? 0.35 : stage === 4 ? 0.5 : 0;
  const stampE = stage === 4 && f >= K.back - 2 ? 1 : 0;
  for (let i = 0; i < N; i++) {
    const k = i * 3;
    let u = p * (1 + stg) - stg * rk[i];
    u = u <= 0 ? 0 : u >= 1 ? 1 : easeIO(u);
    const ax = A[k];
    const ay = A[k + 1];
    const az = A[k + 2];
    // 目标
    look(stage + 1, i, B[k], B[k + 1]);
    let bx = B[k];
    let by = B[k + 1];
    const bz = stage === 5 ? 0 : B[k + 2];
    if (stage === 5) {
      bx = seaX;
      by = seaY;
    }
    const sB = sizeA;
    const rB = rA;
    const gB = gA;
    const bB = bA;
    const aB = aA;
    const hB = hA;
    const rotTo = rotB;
    // 起点外观（只在途中需要）
    let size = sB;
    let r = rB;
    let g = gB;
    let b = bB;
    let a = aB;
    let halo = hB;
    if (u < 1) {
      look(stage, i, ax, ay);
      size = mix(sizeA, sB, u);
      r = mix(rA, rB, u);
      g = mix(gA, gB, u);
      b = mix(bA, bB, u);
      a = mix(aA, aB, u);
      halo = mix(hA, hB, u);
      if (stage === 4) a *= 1 - 0.7 * Math.sin(Math.PI * u);
      else if (stage === 3) a *= 1 - 0.55 * Math.sin(Math.PI * u);
    }
    let x = ax + (bx - ax) * u;
    let y = ay + (by - ay) * u;
    let z = az + (bz - az) * u;
    if (u > 0 && u < 1) {
      const arc = Math.sin(Math.PI * u);
      if (sw) {
        const dx = bx - ax;
        const dy = by - ay;
        const L = Math.hypot(dx, dy) + 1e-6;
        const side = (hash01(i, 7) - 0.5) * 2;
        x += (-dy / L) * sw * side * arc;
        y += (dx / L) * sw * side * arc;
      }
      z += lift * arc * (0.5 + hash01(i, 9));
    }
    // 焊花 / 描线笔尖：字落到位的那一下亮
    if (stage === 3 || stage === 4) {
      const fl = landF(i);
      if (f >= fl - 1) {
        const sp = Math.exp(-(f - fl) / 6);
        halo *= 1 + 5 * sp;
        a = Math.min(1, a + 0.45 * sp);
        r = mix(r, 1, 0.5 * sp);
        g = mix(g, HI[1], 0.5 * sp);
      }
    }
    if (stampE && T.drawRole[i]) {
      const e = stampHit(i);
      a = Math.min(1, a * (1 + 0.8 * e));
      x += 4 * e * noise3(i * 0.01, 0, f * 0.3, 5);
      y += 4 * e * noise3(i * 0.01, 9, f * 0.3, 5);
    }
    if (driftAmt > 0) {
      x += driftAmt * noise3(x / 90, y / 90, t * 0.35, 4);
      y += driftAmt * noise3(x / 90 + 19, y / 90 - 7, t * 0.35, 4);
    }
    st.pos[k] = x;
    st.pos[k + 1] = y;
    st.pos[k + 2] = z;
    st.size[i] = size;
    st.col[i * 4] = r;
    st.col[i * 4 + 1] = g;
    st.col[i * 4 + 2] = b;
    st.col[i * 4 + 3] = a;
    st.halo[i] = halo;
    st.rot[i] = stage === 5 ? rotTo * u : 0;
  }

  // 船名：书里原本的五个字飞出来，写在船身上；出海时飞向照片里那艘船、化进去
  for (let c = 0; c < 5; c++) {
    const i = NAME_IDX[c];
    const k = i * 3;
    const f0 = K.ring[c] - 16;
    const q = prog(f, f0, K.ring[c] + 4, EASE.inOut);
    if (q <= 0) continue;
    const sx = T.nameSlots.pos[c * 3];
    const sy = T.nameSlots.pos[c * 3 + 1];
    const ox = stage >= 5 ? T.draw[k] : st.pos[k];
    const oy = stage >= 5 ? T.draw[k + 1] : st.pos[k + 1];
    const oz = stage >= 5 ? T.draw[k + 2] : st.pos[k + 2];
    let x = mix(ox, sx, q);
    let y = mix(oy, sy, q);
    let z = mix(oz, 0, q) + 520 * Math.sin(Math.PI * q);
    let size = mix(6, 88, q);
    let a = mix(0.6, 1, q);
    const landed = f >= K.ring[c] + 4 ? Math.exp(-(f - K.ring[c] - 4) / 8) : 0;
    let halo = 0.25 + 1.6 * landed;
    // 出海
    const qs = prog(f, S5[0] + 6 + c * 2, S5[0] + 40 + c * 2, EASE.inOut);
    if (qs > 0) {
      const tx = -6 + c * 12;
      const ty = -88 - c * 9;
      x = mix(sx, tx, qs);
      y = mix(sy, ty, qs);
      z = 160 * Math.sin(Math.PI * qs);
      size = mix(88, 7, qs);
      a = 1 - smooth(0.7, 1, qs);
      halo = 0.25 + 0.5 * qs;
    }
    st.pos[k] = x;
    st.pos[k + 1] = y;
    st.pos[k + 2] = z;
    st.size[i] = size;
    st.col[i * 4] = HI[0];
    st.col[i * 4 + 1] = HI[1];
    st.col[i * 4 + 2] = HI[2];
    st.col[i * 4 + 3] = a;
    st.halo[i] = halo;
    st.rot[i] = 0;
  }

  // ---------------------------------------------------------------- 镜头（照片 / 锐利字 / 粒子 同一变换）
  let view: View = {s: 1, qx: 0, qy: 0};
  if (f < S1[0] + 40) view = {s: 1 + 0.05 * prog(f, 30, S1[0], EASE.inOut) * (1 - prog(f, S1[0], S1[0] + 40)), qx: CX, qy: 250};
  else if (f < S2[0] + 30) view = {s: 1 + 0.34 * prog(f, K.da2 - 20, K.jade - 10) * (1 - prog(f, K.y2019 - 8, K.y2019 + 22)), qx: -170, qy: 20};
  else if (f < S4[0] + 40) view = {s: 1 + 0.06 * prog(f, S3[0], K.design + 10) * (1 - prog(f, S4[0], S4[0] + 40)), qx: 0, qy: -80};
  else if (f >= S5[0]) view = {s: 1 + 0.14 * prog(f, S5[0], S5[0] + 28, EASE.inOut) * (1 - prog(f, S5[0] + 30, S5[0] + 112, EASE.inOut)), qx: 20, qy: -60};
  const cam = camOf(view);
  const kb = kbOf(view);
  const ov = cssOf(view);

  // ---------------------------------------------------------------- DOM
  const xuanA = 0.55 * (1 - prog(f, 0, 14, EASE.in));
  const nameA = 0.62 * prog(f, 22, 42, EASE.out) * (1 - prog(f, S1[0], S1[0] + 14, EASE.in));
  const yearA = 0.6 * prog(f, K.y2019c[3] - 2, K.y2019c[3] + 14, EASE.out) * (1 - prog(f, S3[0], S3[0] + 16, EASE.in));
  const luffyOut = 1 - prog(f, K.n90 - 6, K.n90 + 6);
  const dossier = 1 - prog(f, K.y2019 - 6, K.y2019 + 6);
  const topShade = Math.max(prog(f, K.n90 - 4, K.n90 + 10) * dossier, prog(f, K.design, K.design + 20) * (1 - prog(f, S5[0], S5[0] + 20)));
  const aiTag = Math.max(plateJ, plateS, smooth(0.15, 0.35, plateB), plateY);
  const ap = (fr: number, d = 10) => prog(f, fr - 2, fr + d, EASE.out);
  const tx = (o: {text: string; x: number; y: number; size: number; p: number; font?: string; color?: string; ls?: string; grad?: boolean; align?: 'left' | 'center'; key?: string}) =>
    o.p > 0.005 ? (
      <div
        key={o.key ?? o.text + o.y}
        style={{
          position: 'absolute',
          left: o.x,
          top: o.y,
          transform: `translate(${o.align === 'center' ? '-50%' : '0'}, -50%) translateY(${(1 - o.p) * 18}px)`,
          opacity: o.p,
          filter: `blur(${(1 - o.p) * 6}px)`,
          fontFamily: o.font ?? SERIF,
          fontSize: o.size,
          lineHeight: 1.1,
          letterSpacing: o.ls ?? '0.06em',
          whiteSpace: 'nowrap',
          color: o.grad ? 'transparent' : o.color ?? PAL.goldHi,
          backgroundImage: o.grad ? `linear-gradient(180deg, #FFF6DC 0%, ${PAL.gold} 45%, ${PAL.amber} 100%)` : undefined,
          WebkitBackgroundClip: o.grad ? 'text' : undefined,
          backgroundClip: o.grad ? 'text' : undefined,
          textShadow: o.grad ? undefined : '0 2px 18px rgba(0,0,0,.85)',
        }}
      >
        {o.text}
      </div>
    ) : null;

  // 「自己造船的路飞」逐字
  const luffyChars = [...'「自己造船的路飞」'];
  // 2019 下面一行：卖掉公司 → 买船（划掉）→ 自己造一艘
  const row3 = 1 - prog(f, K.build + 26, K.build + 40);
  const strike = prog(f, K.buy + 2, K.buy + 12, EASE.inOut);
  // b4：26 公斤 → 退回 n 次 → 通过
  const kgN = Math.round(26 * prog(f, K.kg - 2, K.kgEnd + 2, EASE.out));
  const kgA = ap(K.kg) * (1 - prog(f, K.back - 6, K.back + 2));
  const backN = stamps.filter((s) => f >= s).length;
  const backA = ap(K.back, 6) * (1 - prog(f, K.revise + 2, K.revise + 12));
  const stampOut = (k: number) => 1 - prog(f, K.revise + k * 1.1, K.revise + 8 + k * 1.1, EASE.in);
  const passP = prog(f, K.pass - 4, K.pass + 2, EASE.out);
  const passA = passP * (1 - prog(f, K.name + 6, K.name + 20));
  // b5
  const opA = ap(K.op, 12) * (1 - prog(f, S5[0], S5[0] + 14));
  // b6
  const dateP = (c: number) => ap(K.y2025c[c], 8);
  const dateStr = '2025.11';
  const dateMap = [0, 1, 2, 3, 3, 5, 6]; // 每个字符对应念到第几个字（二零二五 . 十一）
  return (
    <AbsoluteFill>
      <Backdrop light={[0.5, 0.45]} />
      <Plate src="img/jade_workshop.jpg" from={kb} to={kb} opacity={plateJ} grade="brightness(.9) saturate(1.05)" />
      <Plate src="img/shipyard.jpg" from={kb} to={kb} opacity={plateS} grade="brightness(.95)" />
      <Plate src="img/blueprints.jpg" from={{s: 1.06}} to={{s: 1.0}} p={prog(f, K.design, K.y2025)} opacity={plateB * 0.5} grade="brightness(.5) saturate(.75)" blur={2} />
      <Plate src="img/yacht_sea.jpg" from={kb} to={kb} opacity={plateY} grade="brightness(.7) saturate(1.06) contrast(1.06)" />
      <GlyphCanvas camera={cam}>
        <GlyphLayer state={st} glow={0.55} halo={0.16} haloSize={3.2} />
      </GlyphCanvas>
      <AbsoluteFill style={ov}>
        {xuanA > 0.005 ? <MaskText text="选" size={900} y={70} opacity={xuanA} /> : null}
        {nameA > 0.005 ? <MaskText text="姜蓝" size={NAME_M.size} x={NAME_M.x} y={NAME_M.y} opacity={nameA} /> : null}
        {yearA > 0.005 ? <MaskText text="2019" size={YEAR_M.size} x={YEAR_M.x} y={YEAR_M.y} opacity={yearA} /> : null}
      </AbsoluteFill>
      <Vignette amount={0.5} />
      {topShade > 0.01 ? <AbsoluteFill style={{opacity: topShade, background: 'linear-gradient(180deg, rgba(13,11,9,.78) 0%, rgba(13,11,9,.55) 26%, rgba(13,11,9,0) 47%)'}} /> : null}
      {plateY > 0.01 ? <AbsoluteFill style={{opacity: plateY, background: 'radial-gradient(ellipse 70% 30% at 20% 64%, rgba(13,11,9,.55) 0%, rgba(13,11,9,0) 70%), linear-gradient(180deg, rgba(13,11,9,.35) 0%, rgba(13,11,9,0) 22%)'}} /> : null}

      {/* b1：自己造船的路飞 */}
      {f < K.n90 + 8 ? (
        <div style={{position: 'absolute', left: SAFE.cx, top: 1045, transform: 'translate(-50%, -50%)', whiteSpace: 'nowrap', opacity: luffyOut, fontFamily: SERIF, fontSize: 70, letterSpacing: '0.08em', color: PAL.goldHi, textShadow: '0 2px 20px rgba(0,0,0,.85)'}}>
          {luffyChars.map((c, k) => {
            const fr = k === 0 ? K.luffyC[0] : K.luffyC[Math.min(6, k - 1)];
            const q = ap(fr, 9);
            return (
              <span key={k} style={{display: 'inline-block', opacity: q, transform: `translateY(${(1 - q) * 14}px)`, filter: `blur(${(1 - q) * 5}px)`}}>
                {c}
              </span>
            );
          })}
        </div>
      ) : null}
      {f > 60 && f < K.n90 + 8 ? tx({text: '网上，大家叫他', x: SAFE.cx, y: 955, size: 34, p: ap(84, 10) * luffyOut, font: SANS, color: 'rgba(242,217,160,.8)', align: 'center', ls: '0.2em'}) : null}

      {/* b2：档案卡 */}
      {f >= K.n90 - 4 && dossier > 0 ? (
        <AbsoluteFill style={{opacity: dossier}}>
          {tx({text: '90后', x: 84, y: 440, size: 150, p: ap(K.n90, 10), font: SERIF_BLACK, grad: true, ls: '0.02em'})}
          {tx({text: '湖北人', x: 420, y: 462, size: 72, p: ap(K.hubei, 10)})}
          {tx({text: '大二', x: 88, y: 590, size: 66, p: ap(K.da2, 10)})}
          {tx({text: '退学', x: 248, y: 590, size: 66, p: ap(K.quit, 10), color: PAL.amber})}
          {tx({text: '湖北', x: 88, y: 685, size: 58, p: ap(K.gd - 8, 10)})}
          {ap(K.gd - 4, 10) > 0.01 ? (
            <svg style={{position: 'absolute', left: 222, top: 663}} width={140} height={44} viewBox="0 0 140 44">
              <path d={`M4 22 L${4 + 120 * prog(f, K.gd - 4, K.gd + 6)} 22`} stroke={PAL.gold} strokeWidth={4} strokeLinecap="round" fill="none" />
              <path d="M112 10 L128 22 L112 34" stroke={PAL.gold} strokeWidth={4} strokeLinecap="round" fill="none" opacity={prog(f, K.gd + 2, K.gd + 8)} />
            </svg>
          ) : null}
          {tx({text: '广东', x: 376, y: 685, size: 58, p: ap(K.gd, 10)})}
          {tx({text: '翡翠生意', x: 88, y: 775, size: 58, p: ap(K.jade, 10), color: '#BFE3C0'})}
        </AbsoluteFill>
      ) : null}

      {/* b3：卖掉公司 → 买船（划掉）→ 自己造一艘 */}
      {f >= K.sell - 4 && row3 > 0 ? (
        <AbsoluteFill style={{opacity: row3}}>
          {tx({text: '卖掉公司', x: SAFE.cx, y: 650, size: 60, p: ap(K.sell, 10) * (1 - prog(f, K.buy - 10, K.buy - 2)), align: 'center', ls: '0.16em'})}
          {f >= K.buy - 6 ? (
            <div style={{position: 'absolute', left: SAFE.cx - 250, top: 650, transform: 'translateY(-50%)', opacity: ap(K.buy - 4, 8) * (1 - 0.55 * prog(f, K.build - 6, K.build + 4)), whiteSpace: 'nowrap'}}>
              <span style={{fontFamily: SERIF, fontSize: 60, letterSpacing: '0.12em', color: 'rgba(242,217,160,.85)', textShadow: '0 2px 16px rgba(0,0,0,.85)'}}>买船</span>
              <div style={{position: 'absolute', left: -8, top: '52%', height: 5, width: 150 * strike, background: PAL.amber, borderRadius: 3, boxShadow: '0 0 12px rgba(232,164,90,.7)'}} />
            </div>
          ) : null}
          {tx({text: '自己造一艘', x: SAFE.cx - 60, y: 650, size: 66, p: ap(K.build, 10), font: SERIF_BLACK, grad: true, ls: '0.1em'})}
        </AbsoluteFill>
      ) : null}

      {/* b4：26 公斤 / 船级社 / 退回 ×12 / 通过 */}
      {kgA > 0.01 ? (
        <div style={{position: 'absolute', left: SAFE.cx, top: 500, transform: 'translate(-50%, -50%)', opacity: kgA, whiteSpace: 'nowrap', textShadow: '0 4px 26px rgba(0,0,0,.9)'}}>
          <span style={{fontFamily: SERIF, fontSize: 56, color: PAL.gold, letterSpacing: '0.2em', marginRight: 18}}>图纸</span>
          <span style={{fontFamily: SERIF_BLACK, fontSize: 200, color: PAL.goldHi, fontVariantNumeric: 'tabular-nums'}}>{kgN}</span>
          <span style={{fontFamily: SERIF, fontSize: 72, color: PAL.gold, marginLeft: 14}}>公斤</span>
        </div>
      ) : null}
      {tx({text: '送船级社审核', x: SAFE.cx, y: 640, size: 52, p: ap(K.cls - 4, 10) * (1 - prog(f, K.revise + 2, K.revise + 12)), align: 'center', ls: '0.18em', color: 'rgba(242,217,160,.9)'})}
      {backA > 0.01 ? (
        <div style={{position: 'absolute', left: SAFE.cx, top: 500, transform: 'translate(-50%, -50%)', opacity: backA, whiteSpace: 'nowrap', textShadow: '0 4px 26px rgba(0,0,0,.9)'}}>
          <span style={{fontFamily: SERIF, fontSize: 72, color: PAL.amber, letterSpacing: '0.1em', marginRight: 16}}>退回</span>
          <span style={{display: 'inline-block', minWidth: 230, textAlign: 'center', fontFamily: SERIF_BLACK, fontSize: 200, color: PAL.goldHi, fontVariantNumeric: 'tabular-nums'}}>{Math.max(1, backN)}</span>
          <span style={{fontFamily: SERIF, fontSize: 72, color: PAL.amber, marginLeft: 6}}>次</span>
        </div>
      ) : null}
      {stamps.map((s0, k) => {
        if (f < s0 - 1) return null;
        const q = prog(f, s0 - 1, s0 + 3, EASE.out);
        const o = stampOut(k);
        if (o <= 0.005) return null;
        const x = 150 + 600 * hash01(k, 401);
        const y = 830 + 300 * hash01(k, 402);
        const r = (hash01(k, 403) - 0.5) * 30;
        return (
          <div key={k} style={{position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) rotate(${r}deg) scale(${mix(1.7, 1, q) * mix(0.92, 1, o)})`, opacity: q * o * 0.92, border: `5px double ${PAL.amber}`, borderRadius: 14, padding: '4px 20px', fontFamily: SERIF_BLACK, fontSize: 60, color: PAL.amber, letterSpacing: '0.12em', whiteSpace: 'nowrap', background: 'rgba(22,18,14,.35)', boxShadow: '0 0 24px rgba(232,164,90,.25)'}}>
            退回
          </div>
        );
      })}
      {passA > 0.01 ? (
        <div style={{position: 'absolute', left: SAFE.cx, top: 960, transform: `translate(-50%, -50%) rotate(-6deg) scale(${mix(1.8, 1, passP)})`, opacity: passA, display: 'flex', alignItems: 'center', gap: 18, border: `7px double ${PAL.goldHi}`, borderRadius: 22, padding: '10px 34px 10px 26px', background: 'rgba(22,18,14,.55)', boxShadow: `0 0 ${40 + 60 * (1 - passP)}px rgba(255,214,140,.55)`}}>
          <svg width={110} height={110} viewBox="0 0 110 110">
            <circle cx={55} cy={55} r={48} stroke={PAL.goldHi} strokeWidth={6} fill="none" />
            <path d="M30 57 L48 75 L82 36" stroke={PAL.goldHi} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray={90} strokeDashoffset={90 * (1 - prog(f, K.pass, K.pass + 10))} />
          </svg>
          <span style={{fontFamily: SERIF_BLACK, fontSize: 130, color: 'transparent', backgroundImage: `linear-gradient(180deg, #FFF6DC 0%, ${PAL.gold} 50%, ${PAL.amber} 100%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', letterSpacing: '0.08em'}}>通过</span>
        </div>
      ) : null}

      {/* b5：船名来自《海贼王》 */}
      {tx({text: '船名来自', x: SAFE.cx, y: 452, size: 36, p: ap(K.from, 10) * (1 - prog(f, S5[0], S5[0] + 14)), align: 'center', font: SANS, ls: '0.3em', color: 'rgba(242,217,160,.85)'})}
      {tx({text: '《海贼王》', x: SAFE.cx, y: 560, size: 104, p: opA, align: 'center', font: SERIF_BLACK, grad: true, ls: '0.04em'})}

      {/* b6：2025.11 · 香港 → 环球航行 */}
      {f >= K.y2025 - 4 ? (
        <>
          <div style={{position: 'absolute', left: 84, top: 1150, transform: 'translateY(-50%)', whiteSpace: 'nowrap', fontFamily: SERIF_BLACK, fontSize: 132, letterSpacing: '0.02em', textShadow: '0 4px 26px rgba(0,0,0,.6)'}}>
            {[...dateStr].map((c, k) => {
              const q = dateP(dateMap[k]);
              return (
                <span key={k} style={{display: 'inline-block', opacity: q, transform: `translateY(${(1 - q) * 16}px)`, color: PAL.goldHi}}>
                  {c}
                </span>
              );
            })}
          </div>
          {tx({text: '香港', x: 88, y: 1268, size: 60, p: ap(K.hk, 10)})}
          {ap(K.hk + 10, 10) > 0.01 ? (
            <svg style={{position: 'absolute', left: 236, top: 1246}} width={130} height={44} viewBox="0 0 130 44">
              <path d={`M4 22 L${4 + 112 * prog(f, K.hk + 10, K.voyage)} 22`} stroke={PAL.gold} strokeWidth={4} strokeLinecap="round" fill="none" />
              <path d="M104 10 L120 22 L104 34" stroke={PAL.gold} strokeWidth={4} strokeLinecap="round" fill="none" opacity={prog(f, K.voyage - 6, K.voyage)} />
            </svg>
          ) : null}
          {tx({text: '环球航行', x: 384, y: 1268, size: 60, p: ap(K.voyage, 10), font: SERIF_BLACK, grad: true})}
        </>
      ) : null}

      {aiTag > 0.01 ? <Label text="AI 示意图" x={SAFE.x1} y={352} p={aiTag} size={30} align="right" /> : null}
    </AbsoluteFill>
  );
};

export const S: SceneMod = {
  C,
  hideSubs: [],
  sfx: ({at, atc}) => {
    const back = at('退回了十二次');
    const ticks: [number, string, number, number][] = Array.from({length: 12}, (_, k) => [back + Math.round(k * 3.2), 'tick', 0.09, 8]);
    return [
      [2, 'whoosh_soft', 0.1, 36],
      [0, 'gather', 0.16, 70],
      [at('九零后') - 2, 'whoosh_soft', 0.1, 40],
      [at('翡翠') - 4, 'chime', 0.12, 80],
      [at('二零一九') - 8, 'gather', 0.16, 70],
      [at('买船') + 4, 'scratch', 0.1, 22],
      [at('自己造一艘') - 26, 'swell', 0.13, 62],
      [at('自己设计') + 8, 'page', 0.14, 26],
      [at('二十六'), 'tick', 0.1, 8],
      ...ticks,
      [at('通过') - 2, 'bell', 0.15, 110],
      [atc('环球路飞号')[0] - 12, 'gather', 0.18, 75],
      [at('二零二五年十一月') + 2, 'whoosh_soft', 0.1, 40],
      [at('香港') - 10, 'water_loop', 0.07, 80],
    ];
  },
};
