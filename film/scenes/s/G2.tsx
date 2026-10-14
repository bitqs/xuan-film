// 场景 G2 · 他自己的桥（作者 22 岁的故事 → 桥为什么会断 → 回头问一句 → 一盏灯 → 桥还没断）
// 第 0 帧接 G1：一座金色字桥中间断开（左白石 = 贪，右黑石 = 怕），断口下面是掉下去的字。
// g7 白石上一根字柱越堆越高（22 岁 / 10,000,000）→ g8 怕的那一边升起一根高得多的光柱（不露人、不写名字），
// 裂缝变宽，他从自己那边飞出两块字木板盖住裂缝：「资本的钱」「只是估值」，盖住了但不平
// → g9 字柱塌回石头，木板变透明，裂缝露出来 → g10 整座桥化成整本书，镜头扎进第六章原文
// → g11 那句原文从书页里被拔出来，桥回来；一个「人」踩着歪木板走偏 → g12「回头」，问话由书里那句原话的字写出来，
// 然后这些字连同几千个字卷成一盏灯挂在桥上，照亮裂缝（本场「怎么做的」）→ g13 掉下去的字飞回来，桥在拍上合拢、整座发光。
import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import type {SceneMod, SceneProps} from '../core/timeline';
import {Backdrop, Label, PAL, SAFE, SERIF, SERIF_BLACK, Vignette} from '../core/look';
import {EASE, clamp01, hex, keyframes, mix, prog, smooth} from '../core/anim';
import {BOOK_CHARS, findInBook, glyphIdx, BOOK_IDX} from '../core/book';
import {
  Cam, GlyphCanvas, GlyphLayer, Mask, N_BOOK, camMix, camOn, camZ, hash01, maskTargets, noise3, textLayout, usePage, useGState,
} from '../core/glyph';

const N = N_BOOK;
const CZ = camZ();
// ---------------------------------------------------------------- 桥的世界（像素，中心原点，y 向上）
const WX = -40; // 桥中心
const WY = 90; // 整个桥的世界往上提，离开字幕带
const L = 350; // 半跨
const deckY = (x: number) => WY - 150 + 70 * (1 - ((x - WX) / L) ** 2); // 桥面顶
const ringY = (x: number) => WY - 360 + 240 * (1 - ((x - WX) / L) ** 2); // 拱圈顶
const POSTS = [80, 160, 235, 300];
const inBridge = (x: number, y: number) => {
  const dx = x - WX;
  const ax = Math.abs(dx);
  if (ax > L + 8) return false;
  const d = deckY(x);
  if (y <= d && y >= d - 34) return true; // 桥面
  if (ax <= L) {
    const r = ringY(x);
    if (y <= r && y >= r - 22) return true; // 拱圈
    if (y < d - 34 && y > r) for (const p of POSTS) if (Math.abs(ax - p) < 4.5) return true; // 立柱
  }
  if (y >= d + 40 && y <= d + 46) return true; // 扶手
  if (y > d && y < d + 40 && ax % 32 < 3.5) return true; // 栏杆
  return false;
};
const LS = {x: WX - 410, y: WY - 272, rx: 205, ry: 140}; // 左：白石（贪）
const RS = {x: WX + 410, y: WY - 272, rx: 205, ry: 140}; // 右：黑石（怕）
const PIL = {x: WX - 400, y: WY - 138, w: 66, h: 640}; // 他的字柱（站在白石上）
const GIA = {x: WX + 380, y: WY - 260, z: -520, w: 170, h: 3000}; // 名气大得多的那根（远处，怕的一边）
const LAMP = {x: WX, y: WY + 104, r: 54};
const POST_X = WX - 122;
const G0 = 48; // 开场的断口半宽
const G1 = 92; // 「找解释」时裂缝变宽
// 木板：中心、半长、半厚、角度
const PLANKS = [
  {x: WX - 12, y: WY - 70, hl: 150, ht: 23, a: 0.075, text: '资本的钱'},
  {x: WX + 16, y: WY - 34, hl: 146, ht: 23, a: -0.11, text: '只是估值'},
];
const GOLD = hex(PAL.gold);
const HI = hex(PAL.goldHi);
const AMB = hex(PAL.amber);
const CREAM = hex(PAL.cream);
const SLATE = hex(PAL.slate);
const CORAL = hex(PAL.coral);

// 角色
const R_BRIDGE = 0;
const R_LST = 1;
const R_RST = 2;
const R_DUST = 3;
const S_NONE = 0;
const S_PIL = 1;
const S_GIA = 2;
const S_PLANK = 3;
const S_LAMP = 5;
const S_POST = 6;
const S_TRAIL = 7;
const S_PTEXT = 8;
const S_WALK = 9;
const S_Q11 = 10;
const S_Q12 = 11;
const S_Q13 = 12;

const cz = (zoom: number, x: number, y: number): Cam => ({pos: [x, y, CZ / zoom], target: [x, y, 0]});
const withPunct = (r: {start: number; end: number}) => {
  let e = r.end;
  while (e < N && /[。？！，]/.test(BOOK_CHARS[e]) && e - r.end < 1) e++;
  return {start: r.start, end: e};
};
// 走偏的路线（s 0..1）：踩上歪木板，越走越偏
const offPath = (s: number): [number, number] => {
  const x0 = WX - 70;
  const y0 = deckY(x0) + 18;
  return [x0 + 360 * s, y0 - 40 * s - 250 * s * s];
};

const C: React.FC<SceneProps> = ({f, at, atc}) => {
  const st = useGState();
  const page = usePage();
  const t = f / 30;

  // 原文位置
  const Q = useMemo(() => {
    const p1 = findInBook('桥为什么会断？不是因为人');
    const p2 = findInBook('没有智慧，而是因为人太需要安慰');
    const q11 = withPunct(findInBook('你今天为了舒服，把世界解释错了。明天你就会按这个错误的世界去行动'));
    const q12 = withPunct(findInBook('这个解释，到底是为了真相，还是为了保护我自己'));
    const q13 = withPunct(findInBook('只要你还能问，桥就还没断'));
    return {p1, p2, q11, q12, q13};
  }, []);

  // 一次性：角色、家位置、各种目标
  const D = useMemo(() => {
    const role = new Uint8Array(N);
    const sub = new Uint8Array(N);
    const home = new Float32Array(N * 3);
    const tgt = new Float32Array(N * 3); // 角色目标（柱子格位 / 木板 / 灯的单位向量 / 文字位置……）
    const aux = new Float32Array(N); // 角色参数（出现帧、路径参数等）
    const gapD = new Float32Array(N).fill(1e4);
    const inRange = (i: number, r: {start: number; end: number}) => i >= r.start && i < r.end;
    const bridgeIdx: number[] = [];
    for (let i = 0; i < N; i++) {
      if (inRange(i, Q.q11)) {
        role[i] = R_DUST;
        sub[i] = S_Q11;
      } else if (inRange(i, Q.q12)) {
        role[i] = R_DUST;
        sub[i] = S_Q12;
      } else if (inRange(i, Q.q13)) {
        role[i] = R_DUST;
        sub[i] = S_Q13;
      } else {
        const u = hash01(i, 101);
        role[i] = u < 0.44 ? R_BRIDGE : u < 0.585 ? R_LST : u < 0.72 ? R_RST : R_DUST;
        if (role[i] === R_BRIDGE) bridgeIdx.push(i);
        if (role[i] === R_LST && hash01(i, 106) < 0.6) sub[i] = S_PIL;
        if (role[i] === R_DUST) {
          const v = hash01(i, 104);
          sub[i] = v < 0.36 ? S_GIA : v < 0.48 ? S_PLANK : v < 0.63 ? S_LAMP : v < 0.66 ? S_POST : v < 0.685 ? S_TRAIL : S_NONE;
        }
      }
    }
    // 桥：遮罩均匀取点（阅读顺序）
    const mw = 540;
    const mh = 960;
    const a = new Uint8Array(mw * mh);
    const ins: number[] = [];
    for (let py = 0; py < mh; py++) {
      const y = 960 - (py + 0.5) * 2;
      if (y > WY + 60 || y < WY - 420) continue;
      for (let px = 0; px < mw; px++) {
        const x = (px + 0.5) * 2 - 540;
        if (inBridge(x, y)) {
          a[py * mw + px] = 255;
          ins.push(py * mw + px);
        }
      }
    }
    const mask: Mask = {w: mw, h: mh, a, inside: Int32Array.from(ins)};
    const bt = maskTargets(mask, bridgeIdx.length, 31, 1.4);
    bridgeIdx.forEach((i, k) => {
      const x = bt[k * 3];
      const y = bt[k * 3 + 1];
      home[i * 3] = x;
      home[i * 3 + 1] = y;
      home[i * 3 + 2] = (hash01(i, 5) - 0.5) * 16;
      const cx = WX + 7 * noise3(0, y / 40, 2, 9);
      gapD[i] = Math.abs(x - cx) + 9 * noise3(x / 11, y / 11, 3, 7);
    });
    // 石头、远处的字尘
    let pilK = 0;
    let giaK = 0;
    let lampK = 0;
    let postK = 0;
    let trailK = 0;
    const plankK = [0, 0];
    let walker = -1;
    const nPil = Array.from({length: N}, (_, i) => sub[i] === S_PIL).filter(Boolean).length;
    const nGia = Array.from({length: N}, (_, i) => sub[i] === S_GIA).filter(Boolean).length;
    const nLamp = Array.from({length: N}, (_, i) => sub[i] === S_LAMP).filter(Boolean).length;
    const nPost = Array.from({length: N}, (_, i) => sub[i] === S_POST).filter(Boolean).length;
    const nTrail = Array.from({length: N}, (_, i) => sub[i] === S_TRAIL).filter(Boolean).length;
    for (let i = 0; i < N; i++) {
      const h1 = hash01(i, 11);
      const h2 = hash01(i, 12);
      const h3 = hash01(i, 13);
      if (role[i] === R_LST || role[i] === R_RST) {
        const S = role[i] === R_LST ? LS : RS;
        const th = h1 * Math.PI * 2;
        const rr = Math.sqrt(h2);
        const wob = 1 + 0.13 * noise3(Math.cos(th) * 1.6, Math.sin(th) * 1.6, role[i], 5);
        const sy = Math.sin(th);
        home[i * 3] = S.x + S.rx * rr * Math.cos(th) * wob;
        home[i * 3 + 1] = S.y + S.ry * rr * sy * wob * (sy < 0 ? 0.75 : 1);
        home[i * 3 + 2] = (h3 - 0.5) * 120 * Math.sqrt(1 - rr * rr);
      } else if (role[i] === R_DUST) {
        home[i * 3] = (h1 - 0.5) * 2600;
        home[i * 3 + 1] = (h2 - 0.5) * 3600 + 200;
        home[i * 3 + 2] = -350 - 1700 * h3;
      }
      // 角色目标
      if (sub[i] === S_PIL) {
        const k = pilK++;
        const s = (k + hash01(i, 14)) / nPil; // 由下往上
        tgt[i * 3] = PIL.x + (hash01(i, 15) - 0.5) * PIL.w * (1 - 0.25 * s);
        tgt[i * 3 + 1] = PIL.y + s * PIL.h;
        tgt[i * 3 + 2] = (hash01(i, 16) - 0.5) * 40;
        aux[i] = s * PIL.h; // 需要的高度
      } else if (sub[i] === S_GIA) {
        const k = giaK++;
        const s = (k + hash01(i, 14)) / nGia;
        const w = (hash01(i, 15) - 0.5) * GIA.w * (0.55 + 0.45 * hash01(i, 17));
        tgt[i * 3] = GIA.x + w;
        tgt[i * 3 + 1] = GIA.y + s * GIA.h;
        tgt[i * 3 + 2] = GIA.z + (hash01(i, 16) - 0.5) * 120;
        aux[i] = s;
      } else if (sub[i] === S_PLANK) {
        const p = hash01(i, 18) < 0.5 ? 0 : 1;
        const P = PLANKS[p];
        const k = plankK[p]++;
        if (k < 4) {
          // 木板上的字
          sub[i] = S_PTEXT;
          const u = (k - 1.5) * 44;
          tgt[i * 3] = P.x + u * Math.cos(P.a);
          tgt[i * 3 + 1] = P.y + u * Math.sin(P.a);
          tgt[i * 3 + 2] = 14 + p * 8;
          aux[i] = p * 10 + k;
        } else {
          const u = (hash01(i, 19) * 2 - 1) * P.hl;
          const v = (hash01(i, 20) * 2 - 1) * P.ht;
          tgt[i * 3] = P.x + u * Math.cos(P.a) - v * Math.sin(P.a);
          tgt[i * 3 + 1] = P.y + u * Math.sin(P.a) + v * Math.cos(P.a);
          tgt[i * 3 + 2] = 4 + p * 8;
          aux[i] = p;
        }
      } else if (sub[i] === S_LAMP) {
        const k = lampK++;
        const yy = 1 - (2 * (k + 0.5)) / nLamp;
        const rr = Math.sqrt(Math.max(0, 1 - yy * yy));
        const ph = k * 2.399963;
        const shell = hash01(i, 21) < 0.72 ? 1 : 0.35 + 0.45 * hash01(i, 22);
        tgt[i * 3] = rr * Math.cos(ph) * shell;
        tgt[i * 3 + 1] = yy * shell;
        tgt[i * 3 + 2] = rr * Math.sin(ph) * shell;
        aux[i] = hash01(i, 23);
      } else if (sub[i] === S_POST) {
        aux[i] = (postK++ + 0.5) / nPost;
      } else if (sub[i] === S_TRAIL) {
        aux[i] = (trailK++ + 0.5) / nTrail;
      } else if (sub[i] === S_NONE && role[i] === R_DUST && walker < 0 && i > 20000) {
        walker = i;
        sub[i] = S_WALK;
      }
    }
    // 他的字柱：每个字在柱子长到它那一格时飞上去
    const pilH = (fr: number) => keyframes(fr, [[66, 0], [86, 64], [112, 430], [150, 520], [170, 640]], EASE.inOut);
    for (let i = 0; i < N; i++) {
      if (sub[i] !== S_PIL) continue;
      let lo = 60;
      let hi = 172;
      while (hi - lo > 0.5) {
        const m = (lo + hi) / 2;
        if (pilH(m) >= aux[i]) hi = m;
        else lo = m;
      }
      aux[i] = hi; // 出现帧
    }
    // 文字排版（引文、问话、结尾句）：粒子 i 就是书里的第 i 个字
    const lay = (r: {start: number; end: number}, o: Parameters<typeof textLayout>[1]) => {
      const s = BOOK_CHARS.slice(r.start, r.end).join('');
      const tl = textLayout(s, o);
      for (let k = 0; k < tl.n; k++) {
        const i = r.start + k;
        tgt[i * 3] = tl.pos[k * 3];
        tgt[i * 3 + 1] = tl.pos[k * 3 + 1];
        tgt[i * 3 + 2] = 0;
      }
      return tl;
    };
    // g11：在「。」处断行
    const s11 = BOOK_CHARS.slice(Q.q11.start, Q.q11.end);
    const cut = s11.indexOf('。') + 1;
    lay({start: Q.q11.start, end: Q.q11.start + cut}, {x: SAFE.cx - 540, y: 452, size: 44});
    lay({start: Q.q11.start + cut, end: Q.q11.end}, {x: SAFE.cx - 540, y: 386, size: 44});
    const n12 = Q.q12.end - Q.q12.start;
    const s12 = BOOK_CHARS.slice(Q.q12.start, Q.q12.end);
    const cut12 = s12.indexOf('，', s12.indexOf('，') + 1) + 1;
    lay({start: Q.q12.start, end: Q.q12.start + cut12}, {x: SAFE.cx - 540, y: 462, size: 56});
    lay({start: Q.q12.start + cut12, end: Q.q12.end}, {x: SAFE.cx - 540, y: 380, size: 56});
    void n12;
    lay(Q.q13, {x: SAFE.cx - 540, y: 440, size: 76, cols: 7, lineH: 1.4});
    // 整页扎进去的先后：离第一句原文越近越先到
    const [p1x, p1y] = page.xy(Math.floor((Q.p1.start + Q.p1.end) / 2));
    const rDive = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const d = Math.hypot(page.pos[i * 3] - p1x, page.pos[i * 3 + 1] - p1y);
      rDive[i] = Math.min(1, d / 1400) * 0.85 + 0.15 * hash01(i, 41);
    }
    return {role, sub, home, tgt, aux, gapD, walker, rDive};
  }, [Q, page]);

  // ---------------------------------------------------------------- 时间点
  const T = useMemo(() => {
    const g10a = atc('桥为什么会断？不是因为人', 0, 'g10');
    const p2a = at('没有智慧', 0, 0, 'g10');
    const p2b = at('安慰', 0, 1, 'g10');
    const q12c = atc('这个解释，到底是为了真相，还是为了保护我自己？', 0, 'g12');
    const q13c = atc('只要你还能问，桥就还没断。', 0, 'g13');
    return {
      broke: at('断过'),
      strong: at('比他强'),
      age: at('二十二岁'),
      earn: at('赚到'),
      peers: at('同龄人', 0, 0, 'g7'),
      fame: at('名气'),
      explain: at('找解释'),
      plank: [at('资本') + 2, at('估值') + 2],
      years: at('很多年后'),
      notTrue: at('问题不是'),
      hurry: at('急着'),
      g10a,
      p2a,
      p2b,
      g11a: at('你今天'),
      g11b: at('把世界', 0, 1),
      g11c: at('明天'),
      g11d: at('去行动', 0, 1),
      back: at('回头'),
      g12a: at('所以'),
      q12c,
      q13c,
      join: 1305,
    };
  }, [at, atc]);

  // 断口半宽随时间
  const DIVE0 = 596;
  const DIVE1 = 648;
  const BACK0 = 790;
  const BACK1 = 852;
  const LAMP_ON = 1238; // 拍上
  const JOIN = T.join; // 拍上，「桥」字
  const greedOnly = smooth(T.earn - 4, T.earn + 30, f) * (1 - smooth(T.years, T.years + 50, f));
  const giant = smooth(T.fame - 2, T.fame + 34, f);
  const giantFade = 1 - smooth(T.years + 4, T.years + 60, f);
  const crackHot = Math.max(0.35 + 0.5 * smooth(T.broke - 4, T.broke + 6, f) * (1 - smooth(T.broke + 14, T.broke + 50, f)), smooth(T.explain - 6, T.explain + 20, f) * 0.75, smooth(T.hurry - 14, T.hurry + 10, f)) * (1 - smooth(JOIN - 20, JOIN + 6, f));
  const lampOn = smooth(LAMP_ON - 12, LAMP_ON + 4, f);
  const lampFlash = f >= LAMP_ON ? Math.exp(-(f - LAMP_ON) / 12) : 0;
  const lampLight = lampOn * (1 + 0.35 * smooth(1259, 1300, f)) * (1 - 0.45 * smooth(JOIN, JOIN + 40, f));
  const bridgeGlow = smooth(JOIN - 6, JOIN + 30, f);
  const plankVis = (p: number) => {
    const land = T.plank[p];
    const inA = smooth(land - 22, land, f);
    const ghost = 1 - 0.88 * smooth(T.hurry - 10, T.hurry + 12, f);
    const back = smooth(BACK0 + 10, BACK1 + 10, f);
    const gone = 1 - smooth(T.g12a + 6, T.back - 6, f);
    return f < BACK0 ? inA * ghost : mix(0.12, 1, back) * gone;
  };
  // 走偏的人
  const walkA = smooth(842, 858, f) * (1 - smooth(1425, 1440, f) * 0);
  const walkS = prog(f, 902, 958, EASE.inOut); // 走偏
  const backS = prog(f, T.back, T.back + 36, EASE.inOut); // 回头
  const crossS = prog(f, JOIN + 22, 1410, EASE.inOut); // 桥连上以后走过去

  // ---------------------------------------------------------------- 逐字
  const {role, sub, home, tgt, aux, gapD, walker, rDive} = D;
  const pDive = clamp01((f - DIVE0) / (DIVE1 - DIVE0));
  const pBack = clamp01((f - BACK0) / (BACK1 - BACK0));
  const closeUp = smooth(640, 652, f) * (1 - smooth(758, 780, f));
  const rotL = t * 0.9;
  const cR = Math.cos(rotL);
  const sR = Math.sin(rotL);
  const lampR = LAMP.r * (1 + 0.04 * Math.sin(t * 2.1)) * (1 + 0.25 * lampFlash);
  const lampBob = 3 * Math.sin(t * 1.3);
  const hl1 = (i: number) => (i >= Q.p1.start && i < Q.p1.end ? smooth(T.g10a[i - Q.p1.start] - 3, T.g10a[i - Q.p1.start] + 8, f) : 0);
  const hl2 = (i: number) => {
    if (i < Q.p2.start || i >= Q.p2.end) return 0;
    const k = (i - Q.p2.start) / Math.max(1, Q.p2.end - Q.p2.start - 1);
    const fr = mix(T.p2a, T.p2b, k);
    return smooth(fr - 3, fr + 8, f);
  };
  const hl11 = (i: number) => (i >= Q.q11.start && i < Q.q11.end ? smooth(762, 776, f) : 0);

  for (let i = 0; i < N; i++) {
    const k3 = i * 3;
    const k4 = i * 4;
    const h = hash01(i, 3);
    const ro = role[i];
    const su = sub[i];
    let x = home[k3];
    let y = home[k3 + 1];
    let z = home[k3 + 2];
    let size = 3.6 + 6.5 * h * h * h;
    let [r, g, b] = GOLD;
    let a = 0.075 + 0.11 * h;
    let halo = 0.5 + 0.8 * h;
    st.idx[i] = BOOK_IDX[i];

    if (ro === R_BRIDGE) {
      const gd = gapD[i];
      // 掉下去的位置（越掉越深）
      const fx = home[k3] + (hash01(i, 21) - 0.5) * 110 + (home[k3] - WX) * 0.35;
      const fy = home[k3 + 1] - 150 - 320 * hash01(i, 22) - 9 * t;
      const fz = (hash01(i, 23) - 0.5) * 260;
      let fall = 0;
      if (gd < G0) fall = 1;
      else if (gd < G1) {
        const fr = T.explain + 4 + 40 * ((gd - G0) / (G1 - G0));
        fall = prog(f, fr, fr + 30, EASE.in);
      }
      if (fall > 0 && f > JOIN - 60) {
        const arrive = JOIN - 26 * clamp01(gd / G1);
        const q = prog(f, arrive - 24, arrive, EASE.out);
        fall *= 1 - q;
        z += 160 * Math.sin(Math.PI * q) * hash01(i, 24);
      }
      if (fall > 0) {
        x = mix(x, fx, fall);
        y = mix(y, fy, fall);
        z = mix(z, fz, fall);
        a *= 1 - 0.55 * fall;
      }
      // 只站在贪婪一边：右半边暗下去
      const side = (x - WX) / L;
      a *= 1 - 0.4 * greedOnly * clamp01(side + 0.3);
      // 裂缝的边
      const gH = f < JOIN - 30 ? G0 + (G1 - G0) * clamp01((f - T.explain - 4) / 40) : 0;
      const edge = fall < 0.5 && gd >= gH ? Math.max(0, 1 - (gd - gH) / 20) : 0;
      if (edge > 0) {
        const e = edge * crackHot;
        r = mix(r, mix(AMB[0], CORAL[0], 0.35), e);
        g = mix(g, mix(AMB[1], CORAL[1], 0.35), e);
        b = mix(b, mix(AMB[2], CORAL[2], 0.35), e);
        a = Math.min(1, a + 0.3 * e);
        halo *= 1 + 2.5 * e;
      }
      // 合拢后整座发光（从中间往两头一道光）
      if (bridgeGlow > 0) {
        const wave = f >= JOIN ? Math.exp(-(((Math.abs(x - WX) - (f - JOIN) * 16) / 60) ** 2)) : 0;
        a = Math.min(1, a * (1 - 0.18 * bridgeGlow) + 0.22 * wave);
        r = mix(r, AMB[0], 0.25 * bridgeGlow * (1 - wave)) + (HI[0] - r) * 0.5 * wave;
        g = mix(g, AMB[1], 0.25 * bridgeGlow * (1 - wave)) + (HI[1] - g) * 0.5 * wave;
        b = mix(b, AMB[2], 0.25 * bridgeGlow * (1 - wave)) + (HI[2] - b) * 0.5 * wave;
        halo *= 1 + 1.6 * bridgeGlow + 3 * wave;
      }
    } else if (ro === R_LST || ro === R_RST) {
      const left = ro === R_LST;
      [r, g, b] = left ? CREAM : SLATE;
      a = left ? 0.1 + 0.14 * h : 0.085 + 0.12 * h;
      size = 4 + 8 * h * h * h;
      if (left) a *= 1 + 0.25 * greedOnly;
      else a *= 1 - 0.35 * greedOnly;
      if (su === S_PIL) {
        // 堆上去 → 很多年后塌回石头
        const up = smooth(aux[i], aux[i] + 12, f);
        const down = prog(f, T.years + 6 + 50 * hash01(i, 25), T.years + 46 + 50 * hash01(i, 25), EASE.in);
        const q = up * (1 - down);
        if (q > 0) {
          const tx = tgt[k3] + 1.5 * noise3(i * 0.01, t * 0.8, 1, 6);
          const ty = tgt[k3 + 1];
          x = mix(x, tx, q);
          y = mix(y, ty, q);
          z = mix(z, tgt[k3 + 2], q) + 120 * Math.sin(Math.PI * up) * (1 - down) * hash01(i, 26);
          const top = (tgt[k3 + 1] - PIL.y) / PIL.h;
          r = mix(r, HI[0], q * (0.4 + 0.5 * top));
          g = mix(g, HI[1], q * (0.4 + 0.5 * top));
          b = mix(b, HI[2], q * (0.4 + 0.5 * top));
          const flare = f >= T.strong ? Math.exp(-(f - T.strong) / 16) : 0;
          a = mix(a, (0.12 + 0.16 * h + 0.14 * top + 0.3 * flare * top * top) * (1 - 0.3 * giant), q);
          halo *= 1 + q * top * (1 + 3 * flare);
        }
      }
    } else {
      // 远处的字尘
      const dz = home[k3 + 2];
      x += 30 * noise3(i * 0.013, t * 0.05, 0, 3);
      y += 30 * noise3(i * 0.013 + 9, t * 0.05, 0, 3) + 6 * t;
      size = 7 + 9 * h;
      a = 0.05 + 0.07 * h;
      halo = 0.3;
      if (su === S_GIA && f > 1180) {
        // 灯成形：远处几千个字卷成漩涡，被灯吸进去
        const hv = hash01(i, 51);
        const q = prog(f, 1184 + 34 * hv, 1220 + 16 * hv, EASE.in);
        if (q >= 1) a = 0;
        else if (q > 0) {
          let ox = (x - LAMP.x) * (1 - q);
          let oy = (y - LAMP.y) * (1 - q);
          const ang = 3.6 * q;
          const nx = ox * Math.cos(ang) - oy * Math.sin(ang);
          oy = ox * Math.sin(ang) + oy * Math.cos(ang);
          ox = nx;
          x = LAMP.x + ox;
          y = LAMP.y + lampBob + oy;
          z = dz * (1 - q) * (1 - q);
          [r, g, b] = [mix(GOLD[0], HI[0], q), mix(GOLD[1], HI[1], q), mix(GOLD[2], HI[2], q)];
          a = mix(a, 0.85, Math.sin(Math.PI * Math.min(1, q * 1.3))) * (q > 0.9 ? (1 - q) / 0.1 : 1);
          size = mix(size * 1.3, 4, q);
          halo = 0.9;
        }
      } else if (su === S_GIA && giant > 0) {
        const s = aux[i];
        const q = smooth(T.fame - 4 + 30 * s, T.fame + 10 + 30 * s, f) * giantFade;
        if (q > 0) {
          const tx = tgt[k3] + 3 * Math.sin(t * 1.3 + i);
          x = mix(x, tx, q);
          y = mix(y, tgt[k3 + 1], q);
          z = mix(dz, tgt[k3 + 2], q);
          const core = 1 - Math.abs(tgt[k3] - GIA.x) / (GIA.w * 0.5);
          [r, g, b] = [mix(GOLD[0], HI[0], core), mix(GOLD[1], HI[1], core), mix(GOLD[2], HI[2], core)];
          a = mix(a, 0.16 + 0.26 * core * h + 0.1 * h, q);
          size = mix(size, 7 + 10 * h, q);
          halo = mix(halo, 1 + 1.5 * core, q);
        }
      } else if (su === S_PLANK || su === S_PTEXT) {
        const p = su === S_PTEXT ? Math.floor(aux[i] / 10) : aux[i];
        const vis = plankVis(p);
        const land = T.plank[p];
        const fly = prog(f, land - 26 + 10 * hash01(i, 27), land - 2 + 4 * hash01(i, 27), EASE.inOut);
        if (vis > 0.001 || (fly > 0 && f < BACK0)) {
          // 「这些解释真不真」：木板在裂缝上晃
          const wob = 0.045 * Math.sin(t * 6.5 + p * 2) * smooth(T.notTrue - 6, T.notTrue + 10, f) * (1 - smooth(T.hurry - 20, T.hurry, f));
          const ccx = PLANKS[p].x;
          const ccy = PLANKS[p].y;
          const wx0 = tgt[k3] - ccx;
          const wy0 = tgt[k3 + 1] - ccy;
          const tgx = ccx + wx0 * Math.cos(wob) - wy0 * Math.sin(wob);
          const tgy = ccy + wx0 * Math.sin(wob) + wy0 * Math.cos(wob);
          // 从他那根柱子那边飞过来
          const sx = PIL.x + 40 + (hash01(i, 28) - 0.5) * 120;
          const sy = PIL.y + 120 + hash01(i, 29) * 420;
          const sink = 40 * smooth(T.g12a + 6, T.back - 6, f);
          const q = f < BACK0 ? fly : 1;
          x = mix(sx, tgx, q);
          y = mix(sy, tgy, q) - sink;
          z = mix(0, tgt[k3 + 2], q) + 140 * Math.sin(Math.PI * q);
          if (su === S_PTEXT) {
            st.idx[i] = glyphIdx(PLANKS[p].text[aux[i] - p * 10]);
            size = 36;
            [r, g, b] = HI;
            a = 0.95 * vis;
            halo = 0.6;
          } else {
            size = 4 + 4 * h;
            const warm = mix(AMB[0], GOLD[0], 0.35);
            r = warm;
            g = mix(AMB[1], GOLD[1], 0.35);
            b = mix(AMB[2], GOLD[2], 0.35);
            // 字的那一条压暗，让木板上的字跳出来
            const along = Math.abs((tgt[k3 + 1] - PLANKS[p].y) * Math.cos(PLANKS[p].a) - (tgt[k3] - PLANKS[p].x) * Math.sin(PLANKS[p].a));
            a = (0.24 + 0.16 * h) * vis * (along < 14 ? 0.45 : 1);
            halo = 0.5;
          }
        }
      } else if (su === S_LAMP && f > 1180) {
        const q = prog(f, 1192 + 22 * aux[i], 1214 + 22 * aux[i], EASE.inOut);
        if (q > 0) {
          const ux = tgt[k3];
          const uy = tgt[k3 + 1];
          const uz = tgt[k3 + 2];
          const lx = LAMP.x + lampR * (ux * cR + uz * sR);
          const ly = LAMP.y + lampBob + lampR * uy;
          const lz = lampR * (-ux * sR + uz * cR);
          // 螺旋卷进灯里
          let ox = mix(x - LAMP.x, lx - LAMP.x, q);
          let oy = mix(y - LAMP.y, ly - LAMP.y, q);
          const ang = (1 - q) * (1 - q) * 3.2;
          const ca = Math.cos(ang);
          const sa = Math.sin(ang);
          const nx = ox * ca - oy * sa;
          oy = ox * sa + oy * ca;
          ox = nx;
          x = LAMP.x + ox;
          y = LAMP.y + oy;
          z = mix(dz, lz, q);
          const front = 0.5 + 0.5 * (lz / Math.max(1, lampR));
          [r, g, b] = [mix(GOLD[0], HI[0], q), mix(GOLD[1], HI[1], q), mix(GOLD[2], HI[2], q)];
          a = mix(a, (0.17 + 0.22 * front) * (0.85 + 0.5 * lampFlash), q) + 0.3 * Math.sin(Math.PI * q);
          size = mix(size, 5.5 + 3 * h, q);
          halo = mix(halo, 1.2 + 1.5 * lampFlash, q);
        }
      } else if (su === S_POST) {
        // 灯杆：从桥面长上去 → 横臂 → 挂灯的细链
        const s = aux[i];
        const grow = prog(f, 1200, 1232, EASE.out);
        if (s < grow) {
          const yb = deckY(POST_X);
          const topY = LAMP.y + 112;
          const seg1 = topY - yb;
          const seg2 = LAMP.x - POST_X;
          const seg3 = topY - (LAMP.y + LAMP.r);
          const Ltot = seg1 + seg2 + seg3;
          const d = s * Ltot;
          if (d < seg1) {
            x = POST_X;
            y = yb + d;
          } else if (d < seg1 + seg2) {
            const u = (d - seg1) / seg2;
            x = POST_X + seg2 * u;
            y = topY + 14 * Math.sin(Math.PI * u);
          } else {
            x = LAMP.x;
            y = topY - (d - seg1 - seg2) + lampBob * ((d - seg1 - seg2) / seg3);
          }
          x += (hash01(i, 30) - 0.5) * 3;
          z = 0;
          size = 4.5;
          a = 0.55 * smooth(0, 0.04, grow - s);
          halo = 0.4;
        }
      } else if (su === S_TRAIL && f > 895 && f < 1100) {
        const s = aux[i];
        const fadeT = 1 - smooth(T.back - 4, T.back + 30, f);
        if (s < 0.5) {
          // 走过的路（跟着走偏）
          const ss = s * 2;
          if (ss < walkS) {
            [x, y] = offPath(ss);
            z = 4;
            size = 5;
            [r, g, b] = HI;
            a = 0.55 * fadeT;
            halo = 0.8;
          }
        } else {
          // 本来该走的路（虚线，笔直过桥）
          const ss = (s - 0.5) * 2;
          const xx = WX - 70 + 400 * ss;
          if (Math.floor(ss * 40) % 2 === 0 && walkS > 0.05) {
            x = xx;
            y = deckY(xx) + 18;
            z = 2;
            size = 6;
            [r, g, b] = CREAM;
            a = 0.5 * smooth(0.05, 0.3, walkS) * fadeT;
            halo = 0.3;
          }
        }
      } else if (i === walker && f > 840) {
        st.idx[i] = glyphIdx('人');
        let wx: number;
        let wy: number;
        if (f < 902) {
          const u = prog(f, 852, 902, EASE.inOut);
          wx = mix(WX - 380, WX - 70, u);
          wy = deckY(wx) + 18;
        } else if (f < T.back) {
          [wx, wy] = offPath(walkS);
        } else if (f < JOIN + 22) {
          const [ex, ey] = offPath(1);
          const sx2 = WX - 95;
          const sy2 = deckY(sx2) + 18;
          wx = mix(ex, sx2, backS);
          wy = mix(ey, sy2, backS) + 60 * Math.sin(Math.PI * backS);
        } else {
          wx = mix(WX - 95, WX + 330, crossS);
          wy = deckY(wx) + 18;
        }
        const bob = Math.abs(Math.sin(t * 7)) * 3 * (f < 902 || (f > JOIN + 22 && crossS < 1) ? 1 : 0);
        x = wx;
        y = wy + bob;
        z = 16;
        size = 46;
        [r, g, b] = HI;
        a = walkA * (1 - 0.35 * smooth(960, 1000, f) * (1 - backS));
        halo = 3;
      } else if (su === S_Q11) {
        // 原文从书页里被拔出来，排成引文
        const q = prog(f, 788 + 14 * hash01(i, 31), 814 + 10 * hash01(i, 31), EASE.inOut);
        const out = smooth(972, 996, f);
        if (f >= 780 && out < 1) {
          const k = i - Q.q11.start;
          const nn = Q.q11.end - Q.q11.start;
          const half = Math.ceil(nn / 2);
          const fr = k < half ? mix(T.g11a, T.g11b, k / half) : mix(T.g11c, T.g11d, (k - half) / (nn - half));
          const lit = smooth(fr - 3, fr + 8, f);
          x = mix(page.pos[k3], tgt[k3], q);
          y = mix(page.pos[k3 + 1], tgt[k3 + 1], q) + 30 * out;
          z = 260 * Math.sin(Math.PI * q);
          size = mix(page.cell * 0.98, 44, q);
          const glowK = Math.max(lit, 1 - q);
          [r, g, b] = [mix(GOLD[0], HI[0], 0.3 + 0.7 * glowK), mix(GOLD[1], HI[1], 0.3 + 0.7 * glowK), mix(GOLD[2], HI[2], 0.3 + 0.7 * glowK)];
          a = (0.62 + 0.38 * glowK) * (1 - out);
          halo = 0.25 + 0.4 * lit;
        }
      } else if (su === S_Q12) {
        // 问话：每个字在念到时从远处飞来；说完卷进灯里
        const k = i - Q.q12.start;
        const fr = T.q12c[Math.min(k, T.q12c.length - 1)];
        const q = prog(f, fr - 16, fr + 2, EASE.out);
        const toLamp = prog(f, 1206 + 1.2 * k, 1234, EASE.inOut);
        if (q > 0 && toLamp < 1) {
          x = mix(x, tgt[k3], q);
          y = mix(y, tgt[k3 + 1], q);
          z = mix(dz, 0, q);
          size = mix(10, 56, q);
          [r, g, b] = HI;
          a = mix(a, 1, q);
          halo = 0.35;
          if (toLamp > 0) {
            const u = tgt[k3] * 0 + hash01(i, 33) * Math.PI * 2;
            const lx = LAMP.x + lampR * 0.6 * Math.cos(u);
            const ly = LAMP.y + lampR * 0.6 * Math.sin(u);
            let ox = mix(tgt[k3] - LAMP.x, lx - LAMP.x, toLamp);
            let oy = mix(tgt[k3 + 1] - LAMP.y, ly - LAMP.y, toLamp);
            const ang = Math.sin(Math.PI * 0.5 * toLamp) * 2.6;
            const nx = ox * Math.cos(ang) - oy * Math.sin(ang);
            oy = ox * Math.sin(ang) + oy * Math.cos(ang);
            ox = nx;
            x = LAMP.x + ox;
            y = LAMP.y + oy;
            z = 30 * Math.sin(Math.PI * toLamp);
            size = mix(56, 9, toLamp);
            halo = mix(0.35, 2.5, toLamp);
          }
        }
      } else if (su === S_Q13) {
        const k = i - Q.q13.start;
        const fr = T.q13c[Math.min(k, T.q13c.length - 1)];
        const q = prog(f, fr - 18, fr + 2, EASE.out);
        if (q > 0) {
          // 从灯里飞出来
          x = mix(LAMP.x, tgt[k3], q);
          y = mix(LAMP.y, tgt[k3 + 1], q);
          z = 120 * Math.sin(Math.PI * q);
          size = mix(8, 76, q);
          [r, g, b] = HI;
          a = mix(0.4, 1, q) * (1 + 0.15 * (f >= JOIN ? Math.exp(-(f - JOIN) / 14) : 0));
          halo = mix(2, 0.3, q);
        }
      }
    }

    // 灯光照亮附近的字（桥、裂缝、石头、掉下去的字）
    if (lampLight > 0 && ro !== R_DUST) {
      const d = Math.hypot(x - LAMP.x, (y - LAMP.y) * 0.85);
      const lb = lampLight / (1 + (d / 190) ** 2);
      a = Math.min(1, a + 0.26 * lb);
      r = mix(r, HI[0], lb);
      g = mix(g, HI[1], lb);
      b = mix(b, HI[2], lb);
      halo *= 1 + 1.6 * lb;
    }

    // 整本书（g10）：所有字落成一页，镜头扎进第六章
    let qp = 0;
    if (f >= DIVE0 && f < BACK1) {
      if (f < BACK0) {
        const s = 0.62;
        const qq = pDive * (1 + s) - s * rDive[i];
        qp = qq <= 0 ? 0 : qq >= 1 ? 1 : EASE.inOut(qq);
      } else {
        const s = 0.55;
        const qq = pBack * (1 + s) - s * hash01(i, 43);
        qp = 1 - (qq <= 0 ? 0 : qq >= 1 ? 1 : EASE.inOut(qq));
      }
      if (su === S_Q11 && f >= 780) qp = 0; // 已经被拔出来了
    }
    if (qp > 0) {
      const px = page.pos[k3];
      const py = page.pos[k3 + 1];
      const arc = Math.sin(Math.PI * qp);
      const sw = (hash01(i, 44) - 0.5) * 2 * (f < BACK0 ? 90 : 160);
      x = mix(x, px, qp) + sw * arc;
      y = mix(y, py, qp) + 0.6 * sw * arc;
      z = mix(z, 0, qp) + (f < BACK0 ? 0 : 420 * arc * (0.5 + hash01(i, 9)));
      st.idx[i] = BOOK_IDX[i];
      const ph = hash01(i, 3);
      const lit = Math.max(hl1(i), hl2(i), hl11(i)) * (1 - smooth(800, 830, f));
      let pa = (0.36 + 0.22 * ph) * (1 - 0.6 * closeUp);
      pa = mix(pa, 1, lit);
      const pr = mix(GOLD[0], HI[0], lit);
      const pg = mix(GOLD[1], HI[1], lit);
      const pb = mix(GOLD[2], HI[2], lit);
      size = mix(size, page.cell * 0.98 * (1 + 0.12 * lit), qp);
      a = mix(a, pa, qp);
      r = mix(r, pr, qp);
      g = mix(g, pg, qp);
      b = mix(b, pb, qp);
      halo = mix(halo, (0.6 + 0.8 * ph) * (1 - 0.7 * lit), qp);
    }

    st.pos[k3] = x;
    st.pos[k3 + 1] = y;
    st.pos[k3 + 2] = z;
    st.size[i] = size;
    st.halo[i] = halo;
    st.col[k4] = r;
    st.col[k4 + 1] = g;
    st.col[k4 + 2] = b;
    st.col[k4 + 3] = Math.max(0, Math.min(1, a));
  }

  // ---------------------------------------------------------------- 镜头
  const ctr = (r: {start: number; end: number}) => {
    let sx = 0;
    let sy = 0;
    for (let i = r.start; i < r.end; i++) {
      const [px, py] = page.xy(i);
      sx += px;
      sy += py;
    }
    return [sx / (r.end - r.start), sy / (r.end - r.start)];
  };
  const [ax, ay] = ctr(Q.p1);
  const [bx, by] = ctr(Q.p2);
  const Z = 46;
  const c1 = camOn(ax, ay - 62, page.cell, Z);
  const c2 = camOn(bx, by - 62, page.cell, Z);
  const cMid = cz(3.2, (ax + bx) / 2, (ay + by) / 2);
  const full = cz(1, 0, 0);
  const seq: [number, Cam][] = [
    [0, full],
    [66, cz(1.04, -20, 30)],
    [176, cz(1.05, -60, 80)],
    [T.fame - 6, cz(1.05, -60, 80)],
    [T.fame + 36, cz(0.74, 60, 420)],
    [T.explain - 4, cz(0.76, 50, 400)],
    [T.plank[0] - 22, cz(1.62, WX, WY - 45)],
    [T.years - 6, cz(1.7, WX, WY - 40)],
    [T.years + 70, cz(1.12, -30, 30)],
    [T.hurry - 30, cz(1.16, -30, 20)],
    [DIVE0 + 8, cz(2.3, WX, WY - 60)],
    [652, c1],
    [T.p2a - 14, c1],
    [T.p2a + 2, cMid],
    [T.p2a + 20, c2],
    [760, c2],
    [792, full],
    [1180, full],
    [1250, cz(1.06, WX * 0.6, WY + 60)],
    [1440, cz(1.02, -20, 40)],
  ];
  let cam = full;
  for (let k = 1; k < seq.length; k++) {
    if (f <= seq[k][0]) {
      const [f0, c0] = seq[k - 1];
      const [f1, c1b] = seq[k];
      cam = camMix(c0, c1b, EASE.inOut(Math.min(1, Math.max(0, (f - f0) / Math.max(1, f1 - f0)))));
      break;
    }
    cam = seq[k][1];
  }
  const dr = (1 - closeUp) * 5 * Math.sin(t * 0.5);
  cam = {...cam, pos: [cam.pos![0] + dr, cam.pos![1], cam.pos![2]], target: [cam.target![0] + dr, cam.target![1], 0]};
  // 世界点 → 屏幕（镜头总是正对着看）
  const proj = (wx: number, wy: number, wz = 0): [number, number, number] => {
    const k = CZ / (cam.pos![2] - wz);
    return [540 + (wx - cam.pos![0]) * k, 960 - (wy - cam.pos![1]) * k, k];
  };

  // ---------------------------------------------------------------- DOM
  const ageA = prog(f, T.age - 2, T.age + 10, EASE.out) * (1 - prog(f, T.fame - 10, T.fame + 6));
  const cntP = prog(f, T.earn, T.earn + 26, EASE.out);
  const cntA = prog(f, T.earn - 2, T.earn + 6) * (1 - prog(f, T.fame - 10, T.fame + 6));
  const money = Math.round(10000000 * cntP);
  const srcA = Math.max(smooth(636, 652, f) * (1 - smooth(970, 994, f)), smooth(1262, 1280, f));
  const leadA = prog(f, T.g12a, T.g12a + 14) * (1 - prog(f, 1206, 1226));
  const [lsx, lsy, lk] = proj(LAMP.x, LAMP.y + lampBob);
  const lightA = lampOn * (0.9 + 0.5 * lampFlash) * (1 - 0.2 * smooth(JOIN, JOIN + 40, f));
  return (
    <AbsoluteFill>
      <Backdrop light={[0.5, 0.48]} glow={1 + 0.3 * bridgeGlow} />
      <GlyphCanvas camera={cam}>
        <GlyphLayer state={st} glow={0.55} halo={0.15} haloSize={3.2} />
      </GlyphCanvas>
      {lightA > 0.01 ? (
        <AbsoluteFill style={{pointerEvents: 'none', mixBlendMode: 'screen'}}>
          <div style={{position: 'absolute', left: lsx - 330 * lk, top: lsy - 330 * lk, width: 660 * lk, height: 660 * lk, borderRadius: '50%', opacity: lightA, background: 'radial-gradient(circle, rgba(255,236,190,.55) 0%, rgba(255,205,130,.22) 22%, rgba(232,164,90,.08) 48%, rgba(0,0,0,0) 70%)'}} />
          <div style={{position: 'absolute', left: lsx - 230 * lk, top: lsy, width: 460 * lk, height: 420 * lk, opacity: lightA * 0.8, background: 'radial-gradient(ellipse 50% 60% at 50% 30%, rgba(255,214,150,.20) 0%, rgba(255,190,120,.06) 55%, rgba(0,0,0,0) 80%)'}} />
        </AbsoluteFill>
      ) : null}
      <Vignette amount={0.5} />
      {ageA > 0.01 ? (
        <div style={{position: 'absolute', left: 520, top: 455, transform: 'translate(-50%, -50%)', opacity: ageA, fontFamily: SERIF_BLACK, fontSize: 92, color: PAL.cream, letterSpacing: '0.04em', textShadow: '0 4px 26px rgba(0,0,0,.85)', whiteSpace: 'nowrap'}}>
          22<span style={{fontFamily: SERIF, fontSize: 60, marginLeft: 14}}>岁</span>
        </div>
      ) : null}
      {cntA > 0.01 ? (
        <div style={{position: 'absolute', left: 520, top: 600, transform: 'translate(-50%, -50%)', opacity: cntA, textAlign: 'center', textShadow: '0 4px 30px rgba(0,0,0,.9)'}}>
          <div style={{fontFamily: SERIF_BLACK, fontSize: 104, lineHeight: 1, color: PAL.goldHi, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.01em'}}>{money.toLocaleString('en-US')}</div>
        </div>
      ) : null}
      {srcA > 0.01 ? <Label text="《人选天选论》· 第六章 · 原文" x={SAFE.x0 + 8} y={352} p={srcA} size={32} /> : null}
      {leadA > 0.01 ? (
        <div style={{position: 'absolute', left: SAFE.cx, top: 420, transform: 'translate(-50%, -50%)', opacity: leadA, fontFamily: SERIF, fontSize: 46, color: PAL.cream, letterSpacing: '0.08em', textShadow: '0 2px 16px rgba(0,0,0,.85)', whiteSpace: 'nowrap'}}>
          所以，解释完以后，回头问一句：
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

export const S: SceneMod = {
  C,
  hideSubs: ['g11', 'g12', 'g13'],
  sfx: ({at}) => [
    [at('赚到'), 'pebbles', 0.15, 45],
    [at('名气') - 2, 'gather', 0.18, 78],
    [at('资本') + 2, 'tick', 0.12, 8],
    [at('估值') + 2, 'tick', 0.12, 8],
    [at('急着') + 4, 'crack', 0.15, 30],
    [598, 'whoosh_soft', 0.12, 36],
    [644, 'page', 0.16, 26],
    [at('安慰', 0, 0, 'g10'), 'chime', 0.12, 80],
    [788, 'gather', 0.18, 78],
    [at('回头'), 'whoosh_soft', 0.1, 36],
    [1196, 'gather', 0.22, 78],
    [1238, 'chime', 0.15, 90],
    [1300, 'gather', 0.2, 78],
  ],
};
