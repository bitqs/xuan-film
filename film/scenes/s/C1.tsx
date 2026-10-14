// 场景 C1 · 三个词（人选 · 祸 · 天选）——全片的概念核心。
// 发现：c1–c6 的原文在书里是同一段（序），整页排版时正好落在同一行（第 15 行），从左到右就是这场的旁白：
//   「…三个词：人选。祸。天选。人选，是你当下的选择。…祸，不是灾难，祸是代价。天选，是结果。你可以决定选择，但结…」
// 0 帧：「人选祸 / 天选福」由全书的字拼成（接 A 的开场）→「先说那句话」一道光扫过 →「在书里」身后浮出书页
// →「拆」：人选 / 祸 / 天选 分成三行，福退到远处暗下去 →「三个词」逐个一闪 → 三个词扑向镜头
// → c2 三个重拍：每个词由上万个字粒子从镜头前砸回来（巨大，三行；hideSubs c2）
// → 三个词落回整本书 → c3「你」：全书只有一个字亮成金色 → 镜头扎进去：书里正是「人选，是你当下的选择」，一道光从「你」出发
// → c4「你」沿着光走到「祸，不是灾难，祸是代价」：灾难被划掉，代价亮起，你往前一步，身后掉下光点
// → c5「天选，是结果」→「天」：其余 34951 个字各自飞起、旋成一个巨大的星系（本场「怎么做的」时刻），你只是其中一点
// → c6 你的轨迹先出发；「但结果」所有人的轨迹一起旋进同一个点，那一点亮起：结果。
import React, {useMemo} from 'react';
import * as THREE from 'three';
import {AbsoluteFill} from 'remotion';
import type {SceneMod, SceneProps} from '../core/timeline';
import {H, W} from '../core/timeline';
import {Backdrop, Label, PAL, SAFE, SERIF_BLACK, Vignette} from '../core/look';
import {EASE, clamp01, hex, keyframes, mix, prog, smooth} from '../core/anim';
import {BOOK_CHARS, findInBook, glyphIdx} from '../core/book';
import type {Cam, V3} from '../core/glyph';
import {GlyphCanvas, GlyphLayer, MaskText, N_BOOK, camZ, hash01, maskTargets, noise3, pageLayout, useGState, useTextMask} from '../core/glyph';

const N = N_BOOK;
const COLS = 140;
const CELL = W / COLS; // 整页一个字格 7.71
const SX = SAFE.cx - W / 2; // 安全区中心（GL x = -96）
const PH = {size: 250, x: -40, y: 80}; // 「人选祸 / 天选福」（和 A 场同一个版式）
const SPLIT_ROWS = [370, 82, -206]; // 拆开后三行的 y（DOM 590 / 878 / 1166）
const BIG = [
  {text: '人选', size: 370, x: SX, y: 400},
  {text: '祸', size: 380, x: SX, y: 25},
  {text: '天选', size: 370, x: SX, y: -340},
];
const GOLD = hex(PAL.gold);
const HI = hex(PAL.goldHi);
const AMB = hex(PAL.amber);
const CREAM = hex(PAL.cream);
const YOUC: V3 = [1, 0.82, 0.46]; // 「你」的金（比书页的金更饱和）
const MUTE: V3 = [0.6, 0.54, 0.47]; // 被划掉的字
const ROW_DOM = 640; // 整页时这段原文那一行在屏幕上的 y
const READ_DOM = 930; // 贴近时这一行在屏幕上的 y
const ZC = 52; // 贴近时一个字在屏幕上的像素
const GAL_R = 1500; // 星系半径
const R_YOU = 680; // 你在星系里的半径
const A0_YOU = (-150 * Math.PI) / 180; // 你在星系里的初始方位（靠镜头这一侧、偏左）
const OM = 0.16; // 星系整体转速（弧度/秒）
const DIFF = 0.05; // 越靠里转得越快
const SPIN = 2.6; // 汇聚时多转的角度
const TWIST = 2.4; // 书页被搅成漩涡时，中心附近多转的角度
// fx：线、划线、光点、你的轨迹、别人的轨迹残影
const NFX = 14000;
const FX_LINE = 0;
const N_LINE = 180;
const FX_STRIKE = 180;
const N_STRIKE = 10;
const FX_MOTE = 200;
const N_MOTE = 150;
const FX_DUP = 360;
const FX_YT = 400;
const N_YT = 320;
const FX_GH = 720;
const GH_EVERY = 8;
const GH_M = 3;
const NG = Math.min(Math.ceil(N / GH_EVERY), Math.floor((NFX - FX_GH) / GH_M));
const NBG = 14000; // c1 身后的淡书页
const DCAM = camZ(); // c2 时镜头离书页的距离

// ---------------------------------------------------------------- 镜头（目标点 + 距离 + 俯仰 + 滚转）
type CK = {x: number; y: number; d: number; tilt: number; roll: number};
const ck = (x: number, y: number, d: number, tilt = 0, roll = 0): CK => ({x, y, d, tilt, roll});
const mixCK = (a: CK, b: CK, t: number): CK => ({
  x: mix(a.x, b.x, t),
  y: mix(a.y, b.y, t),
  d: Math.exp(mix(Math.log(a.d), Math.log(b.d), t)),
  tilt: mix(a.tilt, b.tilt, t),
  roll: mix(a.roll, b.roll, t),
});
const toCam = (k: CK): Cam => ({pos: [k.x, k.y - k.d * Math.sin(k.tilt), k.d * Math.cos(k.tilt)], target: [k.x, k.y, 0], fov: 40, roll: k.roll});
/** 正对书页：让世界点 (wx,wy) 出现在屏幕 (sx,sy)（DOM 坐标），一个字格 = z 像素 */
const frameOn = (wx: number, wy: number, sx: number, sy: number, z: number): CK => {
  const s = z / CELL;
  return ck(wx - (sx - W / 2) / s, wy + (sy - H / 2) / s, (camZ() * CELL) / z);
};
const camAt = (f: number, seq: [number, CK, ((t: number) => number)?][]): CK => {
  if (f <= seq[0][0]) return seq[0][1];
  for (let k = 1; k < seq.length; k++) {
    if (f <= seq[k][0]) {
      const [f0, a] = seq[k - 1];
      const [f1, b, ease] = seq[k];
      return mixCK(a, b, (ease ?? EASE.inOut)(clamp01((f - f0) / Math.max(1, f1 - f0))));
    }
  }
  return seq[seq.length - 1][1];
};
// 拉远用：先快后慢（一下子退开，看见整个漩涡），起步留一点点缓冲
const PULL = (t: number) => {
  const u = mix(t * t * (3 - 2 * t), t, t);
  return 1 - Math.pow(1 - u, 2.4);
};
// 世界坐标 → 屏幕（DOM）坐标，用来把 DOM 标签贴在粒子上
const PROJ = new THREE.PerspectiveCamera(40, W / H, 1, 60000);
const PV = new THREE.Vector3();
const project = (cam: Cam, x: number, y: number, z = 0): [number, number] => {
  const p = cam.pos!;
  const t = cam.target!;
  PROJ.fov = cam.fov ?? 40;
  PROJ.aspect = W / H;
  PROJ.position.set(p[0], p[1], p[2]);
  PROJ.up.set(0, 1, 0);
  PROJ.lookAt(t[0], t[1], t[2]);
  if (cam.roll) PROJ.rotateZ((cam.roll * Math.PI) / 180);
  PROJ.updateProjectionMatrix();
  PROJ.updateMatrixWorld(true);
  PV.set(x, y, z).project(PROJ);
  return [((PV.x + 1) / 2) * W, ((1 - PV.y) / 2) * H];
};

// ---------------------------------------------------------------- 书
const idxIn = (r: {start: number; end: number}, c: string) => {
  for (let i = r.start; i < r.end; i++) if (BOOK_CHARS[i] === c) return i;
  throw new Error('C1: 原文里找不到「' + c + '」');
};
const findAfter = (q: string, after: number) => {
  for (let n = 0; n < 60; n++) {
    const r = findInBook(q, n);
    if (r.start >= after) return r;
  }
  throw new Error('C1: 找不到「' + q + '」');
};

// ---------------------------------------------------------------- 顶部的「三个词」
const WORDS = ['人选', '祸', '天选'];
const Header: React.FC<{p: number; act: number[]; tian: number}> = ({p, act, tian}) => (
  <div style={{position: 'absolute', left: SAFE.cx, top: 430, transform: 'translate(-50%, -50%)', display: 'flex', alignItems: 'center', gap: 30, opacity: p, whiteSpace: 'nowrap'}}>
    {WORDS.map((w, k) => (
      <React.Fragment key={k}>
        {k > 0 ? <span style={{fontFamily: SERIF_BLACK, fontSize: 44, color: PAL.gold, opacity: 0.32}}>·</span> : null}
        <span style={{display: 'inline-flex'}}>
          {[...w].map((c, j) => {
            const on = act[k] * (k === 2 && j === 1 ? 1 - 0.78 * tian : 1);
            return (
              <span
                key={j}
                style={{
                  fontFamily: SERIF_BLACK,
                  fontSize: 92,
                  lineHeight: 1.15,
                  color: on > 0.5 ? PAL.goldHi : PAL.gold,
                  opacity: 0.24 + 0.76 * on,
                  textShadow: `0 0 ${26 * on}px rgba(255,196,110,${0.6 * on}), 0 2px 14px rgba(0,0,0,.75)`,
                  transform: `scale(${1 + 0.08 * on})`,
                  display: 'inline-block',
                }}
              >
                {c}
              </span>
            );
          })}
        </span>
      </React.Fragment>
    ))}
  </div>
);

const C: React.FC<SceneProps> = ({f, dur, at, atc, lineAt}) => {
  const st = useGState();
  const fx = useGState(NFX);
  const bg = useGState(NBG);
  const phraseMask = useTextMask('人选祸\n天选福', {size: PH.size, x: PH.x, y: PH.y});
  const bm0 = useTextMask(BIG[0].text, {size: BIG[0].size, x: BIG[0].x, y: BIG[0].y});
  const bm1 = useTextMask(BIG[1].text, {size: BIG[1].size, x: BIG[1].x, y: BIG[1].y});
  const bm2 = useTextMask(BIG[2].text, {size: BIG[2].size, x: BIG[2].x, y: BIG[2].y});

  // 原文位置（书的字流下标）
  const Q = useMemo(() => {
    const r3 = findInBook('人选，是你当下的选择');
    const r4 = findAfter('祸，不是灾难，祸是代价', r3.start);
    const r5 = findAfter('天选，是结果', r4.start);
    return {r3, r4, r5, you: idxIn(r3, '你'), ze: idxIn(r3, '择'), zai: idxIn(r4, '灾'), dai: idxIn(r4, '代'), jie: idxIn(r5, '结'), key: Math.floor(r3.start / COLS)};
  }, []);
  const ROW_Y = H / 2 - ROW_DOM;
  // 整本书一页，但往下挪：让这段原文所在的行落在 ROW_DOM（不被抖音顶栏挡住）
  const page = useMemo(() => {
    const rows = Math.ceil(N / COLS);
    const y0 = (rows * CELL) / 2 - CELL / 2;
    return pageLayout({cols: COLS, cy: ROW_Y - (y0 - Q.key * CELL)});
  }, [Q, ROW_Y]);
  const bgPage = useMemo(() => pageLayout({n: NBG, cols: 90, cell: 12}), []);

  // 关键位置
  const P = useMemo(() => {
    const [sx] = page.xy(Q.you);
    const xc = (r: {start: number; end: number}) => (page.xy(r.start)[0] + page.xy(r.end - 1)[0]) / 2;
    const yT = ROW_Y - 1.6 * CELL; // 「你」走的高度（这行字下面让出来的空当）
    const x4a = page.xy(Q.r4.start)[0] - 1.6 * CELL;
    const x5a = page.xy(Q.r5.start)[0] - 1.4 * CELL;
    const G: [number, number] = [x5a - R_YOU * Math.cos(A0_YOU), yT - R_YOU * Math.sin(A0_YOU)];
    return {
      sx,
      x3: xc(Q.r3),
      x4: xc(Q.r4),
      x5: xc(Q.r5),
      yT,
      yLine: ROW_Y - 2.3 * CELL,
      x4a,
      x4b: x4a + 2.2 * CELL,
      x5a,
      G,
      xZe: page.xy(Q.ze)[0] + CELL * 0.5,
      xZai: page.xy(Q.zai)[0] - CELL * 0.5,
      xNan: page.xy(Q.zai + 1)[0] + CELL * 0.5,
    };
  }, [page, Q, ROW_Y]);

  // fx 的字形：线用「—」，光点用「●」，书里原来那个「你」
  useMemo(() => {
    const dash = glyphIdx('—');
    const dot = glyphIdx('●');
    for (let k = 0; k < N_LINE + N_STRIKE; k++) fx.idx[FX_LINE + k] = dash;
    for (let k = 0; k < N_MOTE; k++) fx.idx[FX_MOTE + k] = dot;
    fx.idx[FX_DUP] = glyphIdx('你');
    for (let k = 0; k < N_YT; k++) fx.idx[FX_YT + k] = dot;
    for (let k = 0; k < NG; k++) for (let m = 0; m < GH_M; m++) fx.idx[FX_GH + k * GH_M + m] = st.idx[Math.min(N - 1, k * GH_EVERY)];
  }, [fx, st]);

  // 时间（全部从旁白拿）
  const fSay = at('那句话');
  const fBook = at('在书里');
  const fSplit = at('拆');
  const f3 = atc('三个词');
  const HIT = [at('人选', 0, 0, 'c2'), at('祸', 0, 0, 'c2'), at('天选', 0, 0, 'c2')];
  const fBurst = HIT[0] - 26;
  const SL = 14; // 砸下来用的帧数（落地 = 重拍）
  const fDis0 = HIT[2] + 18;
  const fC3 = lineAt('c3');
  const fYou = at('你', 0, 0, 'c3');
  const fNow = at('当下');
  const fC4 = lineAt('c4');
  const fDis = at('灾难');
  const fCost = at('代价');
  const fC5 = lineAt('c5');
  const fRes5 = at('结果', 0, 0, 'c5');
  const fTian = at('天', 1, 0, 'c5');
  const fC6 = lineAt('c6');
  const fRes6 = at('结果', 0, 0, 'c6');
  const fOne = at('一个人');
  const fDr0 = fRes6 - 6;
  const fDr1 = fOne + 6;

  // 你：书页阶段（c3–c5）的位置
  const youPos = (fr: number): V3 => {
    const drop = prog(fr, fC4 - 2, fC4 + 12, EASE.inOut);
    const tr4 = prog(fr, fC4 + 1, fC4 + 30, EASE.inOut);
    const step = prog(fr, fCost - 6, fCost + 10, EASE.inOut);
    const tr5 = prog(fr, fC5, fC5 + 28, EASE.inOut);
    const x = P.sx + (P.x4a - P.sx) * tr4 + (P.x4b - P.x4a) * step + (P.x5a - P.x4b) * tr5;
    const y = mix(ROW_Y, P.yT, drop) + 0.75 * CELL * Math.sin(Math.PI * step);
    return [x, y, 4 * drop];
  };
  // 你：星系阶段（c5「天」之后）；c6 先自己往里走一段（选择），再和所有人一起汇进中心
  const youGal = (fr: number): V3 => {
    const tt = Math.max(0, fr - fTian) / 30;
    let a = A0_YOU + (OM + DIFF / (0.2 + R_YOU / GAL_R)) * tt;
    const q = 0.32 * prog(fr, fC6, fC6 + 30, EASE.out) + 0.68 * prog(fr, fDr0 + 2, fOne + 4, EASE.inOut);
    a += 3.4 * q;
    const r = mix(R_YOU, 2, Math.pow(q, 1.1));
    return [P.G[0] + r * Math.cos(a), P.G[1] + r * Math.sin(a), 0];
  };

  const T = useMemo(() => {
    if (!phraseMask || !bm0 || !bm1 || !bm2) return null;
    const phrase = maskTargets(phraseMask, N, 11, 1.2);
    const who = new Uint8Array(N); // 0..5 = 人选祸天选福
    for (let i = 0; i < N; i++) {
      const x = phrase[i * 3];
      const y = phrase[i * 3 + 1];
      const line = y > PH.y ? 0 : 1;
      const col = Math.max(0, Math.min(2, Math.round((x - PH.x) / PH.size) + 1));
      who[i] = line * 3 + col;
    }
    // 拆：每个字整体平移到三行里；福退到远处
    const dest: V3[] = [
      [SX - PH.size / 2, SPLIT_ROWS[0], 0],
      [SX + PH.size / 2, SPLIT_ROWS[0], 0],
      [SX, SPLIT_ROWS[1], 0],
      [SX - PH.size / 2, SPLIT_ROWS[2], 0],
      [SX + PH.size / 2, SPLIT_ROWS[2], 0],
      [430, 780, -2300],
    ];
    const sd = dest.map((d, c): V3 => [d[0] - (PH.x + ((c % 3) - 1) * PH.size), d[1] - (PH.y + (c < 3 ? 1 : -1) * 0.575 * PH.size), d[2]]);
    const split = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const d = sd[who[i]];
      split[i * 3] = phrase[i * 3] + d[0];
      split[i * 3 + 1] = phrase[i * 3 + 1] + d[1];
      split[i * 3 + 2] = d[2];
    }
    // 巨字：按笔画面积把全部粒子分给三个词（字序 → 阅读顺序）
    const masks = [bm0, bm1, bm2];
    const areas = masks.map((m) => m.inside.length);
    const tot = areas[0] + areas[1] + areas[2];
    const n0 = Math.round((N * areas[0]) / tot);
    const n1 = Math.round((N * areas[1]) / tot);
    const starts = [0, n0, n0 + n1, N];
    const big = new Float32Array(N * 3);
    const out = new Float32Array(N * 3);
    const word = new Uint8Array(N);
    const srk = new Float32Array(N);
    for (let w = 0; w < 3; w++) {
      const cnt = starts[w + 1] - starts[w];
      const tg = maskTargets(masks[w], cnt, 31 + w, 1.2);
      let maxd = 1;
      for (let k = 0; k < cnt; k++) maxd = Math.max(maxd, Math.hypot(tg[k * 3] - BIG[w].x, tg[k * 3 + 1] - BIG[w].y));
      for (let k = 0; k < cnt; k++) {
        const i = starts[w] + k;
        const x = tg[k * 3];
        const y = tg[k * 3 + 1];
        big[i * 3] = x;
        big[i * 3 + 1] = y;
        word[i] = w;
        const dn = Math.hypot(x - BIG[w].x, y - BIG[w].y) / maxd;
        srk[i] = (1 - dn) * 0.85 + 0.15 * hash01(i, 26); // 外圈先落
        // 镜头前：沿视线放一个放大 1.9–2.7 倍的虚影（屏幕上正好罩在这个词上），落下时缩回原位 = 砸
        const zz = 1100 + 500 * hash01(i, 22);
        const M = 1.9 + 0.8 * hash01(i, 21);
        const kz = (DCAM - zz) / DCAM;
        out[i * 3] = (BIG[w].x + (x - BIG[w].x) * M + (hash01(i, 23) - 0.5) * 90) * kz;
        out[i * 3 + 1] = (BIG[w].y + (y - BIG[w].y) * M + (hash01(i, 24) - 0.5) * 90) * kz;
        out[i * 3 + 2] = zz;
      }
    }
    return {phrase, who, sd, split, big, out, word, srk};
  }, [phraseMask, bm0, bm1, bm2]);

  // 星系（每个字的半径、方位、厚度、大小、亮度、颜色）
  const GX = useMemo(() => {
    const r = new Float32Array(N);
    const th = new Float32Array(N);
    const z = new Float32Array(N);
    const sz = new Float32Array(N);
    const al = new Float32Array(N);
    const col = new Float32Array(N * 3);
    const ha = new Float32Array(N);
    const dr = new Float32Array(N);
    const rf = new Float32Array(N);
    const gauss = (i: number, s: number) => (hash01(i, s) + hash01(i, s + 1) + hash01(i, s + 2) + hash01(i, s + 3) - 2) * 1.73;
    for (let i = 0; i < N; i++) {
      const q = hash01(i, 40);
      const u = hash01(i, 41);
      const v = hash01(i, 42);
      const h = hash01(i, 3);
      let rr: number;
      let c: V3;
      if (q < 0.13) {
        // 核心
        rr = GAL_R * 0.095 * Math.sqrt(-Math.log(1 - 0.995 * u));
        th[i] = v * Math.PI * 2;
        z[i] = gauss(i, 50) * 55 * Math.max(0.25, 1 - rr / 320);
        sz[i] = 4 + 6 * h * h;
        al[i] = 0.4 + 0.3 * h;
        ha[i] = 1.6;
        c = [mix(HI[0], CREAM[0], 0.3), mix(HI[1], CREAM[1], 0.3), mix(HI[2], CREAM[2], 0.3)];
      } else if (q < 0.32) {
        // 臂间的盘
        rr = GAL_R * (0.08 + 0.92 * Math.sqrt(u));
        th[i] = v * Math.PI * 2;
        z[i] = gauss(i, 50) * 20;
        sz[i] = 4 + 8 * h * h * h;
        al[i] = 0.16 + 0.18 * h;
        ha[i] = 0.5;
        c = GOLD;
      } else {
        // 两条旋臂（拖尾方向和旋转相反）
        rr = GAL_R * (0.06 + 0.94 * Math.pow(u, 0.9));
        const arm = hash01(i, 43) < 0.5 ? 0 : 1;
        th[i] = arm * Math.PI - 2.4 * Math.log(1 + (5 * rr) / GAL_R) + gauss(i, 60) * 0.26 * (1.2 - rr / GAL_R);
        z[i] = gauss(i, 50) * 18;
        sz[i] = 5 + 12 * h * h * h;
        al[i] = 0.32 + 0.4 * h;
        ha[i] = 0.9;
        const w = smooth(0.35, 1, rr / GAL_R) * 0.55 + 0.2 * hash01(i, 47);
        c = [mix(GOLD[0], AMB[0], w), mix(GOLD[1], AMB[1], w), mix(GOLD[2], AMB[2], w)];
      }
      r[i] = rr;
      col[i * 3] = c[0];
      col[i * 3 + 1] = c[1];
      col[i * 3 + 2] = c[2];
      dr[i] = (rr / GAL_R) * 0.8 + 0.2 * hash01(i, 44);
      rf[i] = 3 + 14 * hash01(i, 45);
    }
    return {r, th, z, sz, al, col, ha, dr, rf};
  }, []);

  // 书页 → 星系 的起点（书页 + 第 15 行上下让开的空当）和先后（离「你」越近越先动）
  const UP = 0.9 * CELL;
  const DN = 3.4 * CELL;
  const PG = useMemo(() => {
    const s0 = new Float32Array(N * 3);
    const grk = new Float32Array(N);
    const rs = new Float32Array(N);
    const ths = new Float32Array(N);
    const phi = new Float32Array(N);
    const dEnd = new Float32Array(N);
    const tEnd = 86 / 30;
    for (let i = 0; i < N; i++) {
      const row = Math.floor(i / COLS);
      s0[i * 3] = page.pos[i * 3];
      s0[i * 3 + 1] = page.pos[i * 3 + 1] + (row < Q.key ? UP : row > Q.key ? -DN : 0);
      const d = Math.hypot(s0[i * 3] - P.x5a, s0[i * 3 + 1] - P.yT);
      grk[i] = Math.pow(Math.min(1, d / 2100), 0.75) * 0.88 + 0.12 * hash01(i, 46);
      const dx = s0[i * 3] - P.G[0];
      const dy = s0[i * 3 + 1] - P.G[1];
      rs[i] = Math.hypot(dx, dy);
      ths[i] = Math.atan2(dy, dx);
      // 整页像被搅动：越靠近中心转得越多（书页本身拧成漩涡），然后每个字再落到自己在星系里的位置
      phi[i] = TWIST / (0.3 + rs[i] / GAL_R);
      const angEnd = GX.th[i] + (OM + DIFF / (0.2 + GX.r[i] / GAL_R)) * tEnd;
      const dd = angEnd - (ths[i] + phi[i]);
      dEnd[i] = dd - 2 * Math.PI * Math.round(dd / (2 * Math.PI));
    }
    return {s0, grk, rs, ths, phi, dEnd, tEnd};
  }, [page, Q, P, UP, DN, GX]);

  // 星系里第 i 个字在 fr 帧的位置（含 c6 的汇聚）；写进 o
  const galXY = (i: number, fr: number, o: number[]) => {
    const tg = Math.max(0, fr - fTian) / 30;
    const r0 = GX.r[i];
    let ang = GX.th[i] + OM * tg + (DIFF * tg) / (0.2 + r0 / GAL_R);
    let rr = r0;
    let gz = GX.z[i];
    let de = 0;
    const pd = prog(fr, fDr0, fDr1, EASE.linear);
    if (pd > 0) {
      const q = clamp01(pd * 1.7 - 0.7 * GX.dr[i]);
      de = q * q * (3 - 2 * q);
      rr = mix(r0, GX.rf[i], de);
      ang += SPIN * de * (1.3 - (0.6 * r0) / GAL_R);
      gz *= 1 - de;
    }
    o[0] = P.G[0] + rr * Math.cos(ang);
    o[1] = P.G[1] + rr * Math.sin(ang);
    o[2] = gz;
    o[3] = de;
  };

  if (!T) return <Backdrop />;

  const tt = f / 30;
  // ---------------------------------------------------------------- 镜头
  const FULL = ck(0, 0, camZ());
  const C3F = frameOn(P.x3, ROW_Y, SAFE.cx, READ_DOM, ZC);
  const C4F = frameOn(P.x4, ROW_Y, SAFE.cx, READ_DOM, ZC);
  const C5F = frameOn(P.x5, ROW_Y, SAFE.cx, READ_DOM, ZC);
  const MID: CK = {...mixCK(C3F, C4F, 0.5), d: (camZ() * CELL) / 30};
  const PRE = ck(P.sx * 0.4, ROW_Y * 0.4, camZ() * 0.84);
  const GW = ck(P.G[0] + 40, P.G[1] - 150, 5000, (58 * Math.PI) / 180, -9);
  const GE = ck(P.G[0] + 10, P.G[1] - 60, 2300, (44 * Math.PI) / 180, -16);
  const seq: [number, CK, ((t: number) => number)?][] = [
    [0, ck(0, -10, camZ() * 1.03)],
    [fBurst, ck(0, 6, camZ() * 0.97)],
    [fBurst + 16, FULL],
    [fYou - 22, FULL],
    [fYou + 2, PRE],
    [fNow + 22, C3F],
    [fC4 - 3, {...C3F, x: C3F.x + 0.5 * CELL}],
    [fC4 + 13, MID],
    [fC4 + 29, C4F],
    [fC5 - 2, {...C4F, x: C4F.x + 0.4 * CELL}],
    [fC5 + 26, C5F],
    [fTian - 2, {...C5F, x: C5F.x + 0.3 * CELL}],
    [fTian + 88, GW, PULL],
    [dur + 14, GE],
  ];
  let K = camAt(f, seq);
  let punch = 0;
  for (const h of HIT) if (f >= h) punch = Math.max(punch, Math.exp(-(f - h) / 6));
  K = {...K, d: K.d * (1 - 0.03 * punch)};
  const cam = toCam(K);
  const cp = cam.pos!;

  // ---------------------------------------------------------------- 主体：34952 个字
  const sweepP = prog(f, fSay - 8, fSay + 20, EASE.inOut);
  const sweepX = mix(PH.x - 1.8 * PH.size, PH.x + 1.8 * PH.size, sweepP);
  const sweepAmt = smooth(fSay - 10, fSay - 2, f) * (1 - smooth(fSay + 16, fSay + 26, f));
  const SPL: [number, number][] = [
    [fSplit - 13, fSplit + 9],
    [fSplit - 13, fSplit + 9],
    [fSplit - 11, fSplit + 11],
    [fSplit - 9, fSplit + 13],
    [fSplit - 9, fSplit + 13],
    [fSplit - 16, fSplit + 24],
  ];
  const pb = prog(f, fBurst, fBurst + 13, EASE.linear);
  const pdis = prog(f, fDis0, fDis0 + 26, EASE.linear);
  // 书页阶段的参数（星系开始后冻结，保证交接不跳）
  const fp = Math.min(f, fTian - 2);
  const open = smooth(fNow - 2, fNow + 18, fp);
  const dimAll = smooth(fYou - 3, fYou + 8, fp);
  const close = smooth(fNow, fNow + 18, fp);
  const lit3 = smooth(fNow + 6, fNow + 18, fp) * (1 - smooth(fC4 + 12, fC4 + 28, fp));
  const lit4 = smooth(fC4 + 8, fC4 + 22, fp) * (1 - smooth(fC5 + 10, fC5 + 26, fp));
  const strike = smooth(fDis + 8, fDis + 18, fp);
  const costL = smooth(fCost - 2, fCost + 6, fp);
  const costFlash = fp >= fCost ? Math.exp(-(fp - fCost) / 10) : 0;
  const lit5a = smooth(fC5 - 2, fC5 + 10, fp);
  const lit5b = smooth(fRes5 - 2, fRes5 + 10, fp);
  const pg = prog(f, fTian + 10, fTian + 86, EASE.linear);
  const TWf = prog(f, fTian - 2, fTian + 86, EASE.inOut);
  const wake = smooth(fTian - 2, fTian + 22, f);
  const youSize = (d: number) => CELL * 1.28 * Math.pow(d / C5F.d, 0.62);
  const go = [0, 0, 0, 0];

  for (let i = 0; i < N; i++) {
    const k3 = i * 3;
    const k4 = i * 4;
    const h = hash01(i, 3);
    let x: number;
    let y: number;
    let z = 0;
    let size: number;
    let a: number;
    let r = GOLD[0];
    let g = GOLD[1];
    let b = GOLD[2];
    let halo = 0.6 + 0.8 * h;
    let rot = 0;
    if (f < fBurst) {
      // ---- c1：短语 → 拆成三行
      const c = T.who[i];
      const sp = SPL[c];
      const q = clamp01(((f - sp[0]) / (sp[1] - sp[0])) * 1.2 - 0.2 * hash01(i, 12));
      const e = EASE.inOut(q);
      const d = T.sd[c];
      x = T.phrase[k3] + d[0] * e;
      y = T.phrase[k3 + 1] + d[1] * e;
      z = d[2] * e + (c === 2 ? 160 * Math.sin(Math.PI * e) : 0);
      x += 2.2 * noise3(x / 90, y / 90, tt * 0.35, 4);
      y += 2.2 * noise3(x / 90 + 19, y / 90 - 7, tt * 0.35, 4);
      const pre = 0.82 + 0.18 * Math.sin(tt * 2.2 + h * 6.28);
      let fl = 0;
      if (c !== 5) {
        const g0 = f3[c <= 1 ? 0 : c === 2 ? 1 : 2];
        fl = f >= g0 - 1 ? Math.exp(-(f - g0) / 9) : 0;
      }
      const sw = sweepAmt * Math.exp(-(((T.phrase[k3] - sweepX) / 80) ** 2));
      const lit = Math.min(1, fl + sw);
      size = (4.5 + 10 * h * h * h) * (1 + 0.25 * lit);
      a = (0.16 + 0.22 * h) * pre + 0.32 * lit;
      r = mix(GOLD[0], HI[0], 0.15 + 0.6 * lit);
      g = mix(GOLD[1], HI[1], 0.15 + 0.6 * lit);
      b = mix(GOLD[2], HI[2], 0.15 + 0.6 * lit);
      halo *= 0.5 + 2.5 * lit;
      if (c === 5) {
        a *= 1 - 0.78 * e;
        halo *= 1 - 0.85 * e;
      }
    } else if (f < fDis0) {
      // ---- 扑向镜头 → c2 三个词从镜头前砸回来
      const w = T.word[i];
      const hit = HIT[w];
      if (f < hit - SL) {
        const q = clamp01(pb * 1.3 - 0.3 * hash01(i, 25));
        const e = q * q;
        x = mix(T.split[k3], T.out[k3], e);
        y = mix(T.split[k3 + 1], T.out[k3 + 1], e);
        z = mix(T.split[k3 + 2], T.out[k3 + 2], e);
        size = 4.5 + 10 * h * h * h;
        a = (T.who[i] === 5 ? 0.04 : 0.16 + 0.22 * h) * (1 - q * q * q);
        halo *= 0.6;
        r = mix(GOLD[0], HI[0], 0.15);
        g = mix(GOLD[1], HI[1], 0.15);
        b = mix(GOLD[2], HI[2], 0.15);
      } else {
        const ps = clamp01((f - (hit - SL)) / SL);
        const q = clamp01(ps * 1.3 - 0.3 * T.srk[i]);
        const e = q * q;
        x = mix(T.out[k3], T.big[k3], e);
        y = mix(T.out[k3 + 1], T.big[k3 + 1], e);
        z = mix(T.out[k3 + 2], 0, e);
        size = (4.5 + 10 * h * h * h) * 1.12;
        a = (0.13 + 0.19 * h) * (0.45 + 0.55 * smooth(0.1, 1, e)) * smooth(0, 0.12, q);
        let hl = 0.25;
        if (f >= hit) {
          const imp = Math.exp(-(f - hit) / 7);
          size *= 1 + 0.12 * imp;
          halo *= 1 + 0.6 * imp;
          a = Math.min(1, a + 0.1 * imp);
          hl = 0.25 + 0.3 * imp;
          if (hash01(i, 77) < 0.08) {
            // 落地溅起的一圈
            const dx = T.big[k3] - BIG[w].x;
            const dy = T.big[k3 + 1] - BIG[w].y;
            const L = Math.hypot(dx, dy) + 1;
            const D = (50 + 150 * hash01(i, 78)) * prog(f, hit, hit + 18, EASE.out);
            x += (dx / L) * D;
            y += (dy / L) * D;
            a *= 1 - prog(f, hit + 2, hit + 20, EASE.linear);
            size *= 0.7;
          }
          x += 1.6 * noise3(x / 90, y / 90, tt * 0.35, 4);
          y += 1.6 * noise3(x / 90 + 19, y / 90 - 7, tt * 0.35, 4);
        }
        r = mix(GOLD[0], HI[0], hl);
        g = mix(GOLD[1], HI[1], hl);
        b = mix(GOLD[2], HI[2], hl);
      }
    } else {
      // ---- 书页的样子（c3–c5）
      const row = (i / COLS) | 0;
      const px = page.pos[k3];
      const py = page.pos[k3 + 1] + (row < Q.key ? UP : row > Q.key ? -DN : 0) * open;
      let pa = (0.3 + 0.22 * h) * (1 - 0.62 * dimAll);
      if (row === Q.key) pa = mix(pa, 0.5 + 0.12 * h, close);
      else pa *= 1 - 0.3 * close;
      let L = 0;
      let psize = CELL * 0.98;
      let phalo = 0.5 + 0.6 * h;
      let pr = GOLD[0];
      let pgc = GOLD[1];
      let pbc = GOLD[2];
      if (row === Q.key) {
        if (i >= Q.r3.start && i < Q.r3.end) L = lit3;
        else if (i >= Q.r4.start && i < Q.r4.end) L = lit4;
        else if (i >= Q.r5.start && i < Q.r5.end) L = i >= Q.jie ? lit5b : lit5a;
        if (i === Q.zai || i === Q.zai + 1) {
          L *= 1 - strike;
          pa = mix(pa, 0.3, strike);
          pr = mix(pr, MUTE[0], strike);
          pgc = mix(pgc, MUTE[1], strike);
          pbc = mix(pbc, MUTE[2], strike);
        }
        if (i === Q.dai || i === Q.dai + 1) {
          L = Math.max(L, costL);
          psize *= 1 + 0.2 * costL + 0.25 * costFlash;
          phalo *= 1 + 0.5 * costL + 1.2 * costFlash;
        }
      }
      pa = mix(pa, 1, L);
      pr = mix(pr, HI[0], L);
      pgc = mix(pgc, HI[1], L);
      pbc = mix(pbc, HI[2], L);
      if (f < fTian - 2) {
        if (pdis < 1) {
          // 三个巨字落回书页
          const q = clamp01(pdis * 1.5 - 0.5 * hash01(i, 27));
          const e = EASE.inOut(q);
          const bx = T.big[k3];
          const by = T.big[k3 + 1];
          x = mix(bx, px, e);
          y = mix(by, py, e);
          const ddx = px - bx;
          const ddy = py - by;
          const LL = Math.hypot(ddx, ddy) + 1e-6;
          const side = (hash01(i, 7) - 0.5) * 2;
          const arc = Math.sin(Math.PI * e);
          x += (-ddy / LL) * 140 * side * arc;
          y += (ddx / LL) * 140 * side * arc;
          z = 260 * arc * (0.5 + hash01(i, 9));
          a = mix(0.13 + 0.19 * h, pa, e);
          size = mix((4.5 + 10 * h * h * h) * 1.12, psize, e);
        } else {
          x = px;
          y = py;
          a = pa;
          size = psize;
        }
        r = pr;
        g = pgc;
        b = pbc;
        halo = phalo;
        if (i === Q.you && f >= fYou - 3) {
          // 全书只有这一个字亮成金色
          const yp = youPos(f);
          x = yp[0];
          y = yp[1];
          z = yp[2];
          const ign = smooth(fYou - 2, fYou + 4, f);
          size = keyframes(f, [
            [fYou - 2, CELL * 0.98],
            [fYou + 5, CELL * 2.7],
            [fNow + 2, CELL * 2.5],
            [fNow + 20, CELL * 1.28],
          ]);
          r = mix(r, YOUC[0], ign);
          g = mix(g, YOUC[1], ign);
          b = mix(b, YOUC[2], ign);
          a = mix(a, 1, ign);
          halo = mix(halo, keyframes(f, [[fYou, 10], [fNow + 4, 9], [fNow + 20, 2.6]]) + 0.6 * Math.sin(tt * 3), ign);
        }
      } else if (i === Q.you) {
        const yp = youGal(f);
        x = yp[0];
        y = yp[1];
        z = yp[2];
        size = youSize(K.d);
        r = YOUC[0];
        g = YOUC[1];
        b = YOUC[2];
        a = 1;
        halo = mix(2.6, 10, smooth(fTian + 10, fTian + 60, f)) + 0.6 * Math.sin(tt * 3);
      } else {
        // ---- c5「天」：书页上其余的字各自飞起，旋成星系；c6 汇进一个点
        galXY(i, f, go);
        const sx0 = PG.s0[k3];
        const sy0 = PG.s0[k3 + 1];
        const q = clamp01(pg * 1.45 - 0.45 * PG.grk[i]);
        const e = EASE.inOut(q);
        if (e >= 1) {
          x = go[0];
          y = go[1];
          z = go[2];
        } else {
          // 先：整页一起被拧成漩涡（连贯的一张纸）；再：每个字各自落到星系里的位置
          const tg = Math.max(0, f - fTian) / 30;
          const om = OM + DIFF / (0.2 + GX.r[i] / GAL_R);
          const ph = PG.phi[i] * TWf;
          const d = PG.dEnd[i] + om * (tg - PG.tEnd) - (ph - PG.phi[i]);
          const th = PG.ths[i] + ph + d * e;
          const rr = mix(PG.rs[i] * mix(1, 0.82, TWf), Math.hypot(go[0] - P.G[0], go[1] - P.G[1]), e);
          const arc = Math.sin(Math.PI * e);
          x = P.G[0] + rr * Math.cos(th);
          y = P.G[1] + rr * Math.sin(th);
          z = go[2] * e + 300 * arc * (0.3 + 0.7 * hash01(i, 9)) * (1 - 0.6 * PG.grk[i]) + 70 * TWf * (1 - e) * (h - 0.5);
          rot = (hash01(i, 61) - 0.5) * 6 * arc;
        }
        const de = go[3];
        size = mix(psize, GX.sz[i], e) * (1 - 0.5 * de);
        a = mix(mix(pa, 0.3 + 0.24 * h, wake * (1 - L)), GX.al[i], e) * (1 - 0.78 * de);
        const hd = 0.6 * de;
        r = mix(mix(pr, GX.col[k3], e), HI[0], hd);
        g = mix(mix(pgc, GX.col[k3 + 1], e), HI[1], hd);
        b = mix(mix(pbc, GX.col[k3 + 2], e), HI[2], hd);
        halo = mix(phalo, GX.ha[i], e);
        // 飞到镜头跟前的字淡掉
        a *= smooth(30, 220, Math.hypot(x - cp[0], y - cp[1], z - cp[2]));
      }
    }
    st.pos[k3] = x;
    st.pos[k3 + 1] = y;
    st.pos[k3 + 2] = z;
    st.size[i] = size;
    st.halo[i] = halo;
    st.rot[i] = rot;
    st.col[k4] = r;
    st.col[k4 + 1] = g;
    st.col[k4 + 2] = b;
    st.col[k4 + 3] = a;
  }

  // ---------------------------------------------------------------- fx
  for (let k = 0; k < NFX; k++) fx.col[k * 4 + 3] = 0;
  const setFx = (j: number, x: number, y: number, z: number, size: number, c: V3, a: number, halo = 1) => {
    fx.pos[j * 3] = x;
    fx.pos[j * 3 + 1] = y;
    fx.pos[j * 3 + 2] = z;
    fx.size[j] = size;
    fx.col[j * 4] = c[0];
    fx.col[j * 4 + 1] = c[1];
    fx.col[j * 4 + 2] = c[2];
    fx.col[j * 4 + 3] = a;
    fx.halo[j] = halo;
  };
  const youP = f < fTian - 2 ? youPos(f) : youGal(f);
  // 1) 一道光从「你」出发（当下）→ 变成你走过的路
  if (f >= fNow - 1 && f < fTian + 26) {
    const drawP = prog(f, fNow, fNow + 16, EASE.out);
    const drop = prog(f, fC4 - 2, fC4 + 12, EASE.inOut);
    const yl = mix(ROW_Y - 0.64 * CELL, P.yLine, drop);
    const xa = mix(P.sx + 0.55 * CELL, P.sx, drop);
    const xb = Math.max(mix(xa, P.xZe, drawP), youP[0] + 1.6 * CELL * drop);
    const len = Math.max(0.1, xb - xa);
    const cnt = Math.min(N_LINE, Math.max(2, Math.ceil(len / 2.4)));
    const fade = 1 - smooth(fTian, fTian + 24, f);
    for (let k = 0; k < cnt; k++) {
      const x = xa + (len * k) / (cnt - 1);
      const near = Math.exp(-Math.abs(x - youP[0]) / (7 * CELL));
      const tip = smooth(xb, xb - 1.5 * CELL, x);
      const c: V3 = [mix(HI[0], AMB[0], 0.2 * (1 - near)), mix(HI[1], AMB[1], 0.2 * (1 - near)), mix(HI[2], AMB[2], 0.2 * (1 - near))];
      setFx(FX_LINE + k, x, yl, 2, 4.4, c, 0.85 * (0.4 + 0.6 * near) * tip * fade, 0.9);
    }
  }
  // 2) 「灾难」被一道细线划掉
  const sp = prog(f, fDis + 6, fDis + 15, EASE.out);
  if (sp > 0 && f < fTian + 20) {
    const fade = 1 - smooth(fTian - 2, fTian + 12, f);
    for (let k = 0; k < N_STRIKE; k++) {
      const u = k / (N_STRIKE - 1);
      if (u > sp) break;
      setFx(FX_STRIKE + k, mix(P.xZai, P.xNan, u), ROW_Y + 0.04 * CELL, 3, 4.4, [mix(CREAM[0], AMB[0], 0.25), mix(CREAM[1], AMB[1], 0.25), mix(CREAM[2], AMB[2], 0.25)], 0.85 * fade, 0.6);
    }
  }
  // 3) 代价：你往前一步，身后掉下光点
  if (f >= fCost - 10 && f < fCost + 70) {
    for (let k = 0; k < N_MOTE; k++) {
      const s0 = fCost - 8 + 22 * hash01(k, 91);
      const age = f - s0;
      const life = 30 + 22 * hash01(k, 92);
      if (age < 0 || age > life) continue;
      const yp = youPos(s0);
      const vx = -(0.02 + 0.05 * hash01(k, 93)) * CELL;
      const vy = (0.01 + 0.04 * hash01(k, 94)) * CELL;
      const gg = 0.005 * CELL;
      const x = yp[0] - 0.4 * CELL + (hash01(k, 95) - 0.5) * 0.8 * CELL + vx * age;
      const y = yp[1] - 0.1 * CELL + (hash01(k, 96) - 0.5) * 0.8 * CELL + vy * age - 0.5 * gg * age * age;
      const w = hash01(k, 98);
      setFx(FX_MOTE + k, x, y, 3, (0.14 + 0.14 * hash01(k, 97)) * CELL, [mix(HI[0], AMB[0], w), mix(HI[1], AMB[1], w), mix(HI[2], AMB[2], w)], 0.95 * (1 - age / life) * smooth(0, 3, age), 2);
    }
  }
  // 4) 你离开以后，书里那个「你」还在原处
  if (f >= fC4 - 2 && f < fTian + 14) {
    const drop = prog(f, fC4 - 2, fC4 + 12, EASE.inOut);
    setFx(FX_DUP, P.sx, ROW_Y, 0, CELL * 0.98, GOLD, (0.5 + 0.12 * hash01(Q.you, 3)) * drop * (1 - smooth(fTian - 2, fTian + 12, f)), 0.5);
  }
  // 5) c6 你的轨迹（金色的线）
  if (f >= fC6) {
    const sz = (5.2 * K.d) / camZ();
    const fade = 1 - 0.6 * smooth(fOne + 4, fOne + 14, f);
    for (let s = 0; s < N_YT; s++) {
      const tau = f - s * 0.33;
      if (tau < fC6) break;
      const p = youGal(tau);
      const u = s / N_YT;
      setFx(FX_YT + s, p[0], p[1], p[2], sz * (1 - 0.4 * u), [mix(YOUC[0], AMB[0], 0.6 * u), mix(YOUC[1], AMB[1], 0.6 * u), mix(YOUC[2], AMB[2], 0.6 * u)], Math.min(1, 1.1 * Math.pow(1 - u, 1.1)) * fade, 1.6);
    }
  }
  // 6) c6 所有人的轨迹（每 8 个字取一个，拖 3 个残影）
  const pdr = prog(f, fDr0, fDr1, EASE.linear);
  if (pdr > 0 && f < fDr1 + 12) {
    const gm = [0, 0, 0, 0];
    for (let k = 0; k < NG; k++) {
      const j = k * GH_EVERY;
      if (j === Q.you || j >= N) continue;
      const q = clamp01(pdr * 1.7 - 0.7 * GX.dr[j]);
      const on = Math.sin(Math.PI * q);
      if (on < 0.02) continue;
      const aj = st.col[j * 4 + 3];
      for (let m = 1; m <= GH_M; m++) {
        galXY(j, f - m * 1.8, gm);
        const jj = FX_GH + k * GH_M + (m - 1);
        setFx(jj, gm[0], gm[1], gm[2], st.size[j] * (1 - 0.1 * m), [st.col[j * 4], st.col[j * 4 + 1], st.col[j * 4 + 2]], aj * [0.55, 0.35, 0.2][m - 1] * Math.sqrt(on), 0.5);
      }
    }
  }

  // ---------------------------------------------------------------- c1 身后的淡书页
  const bgA = (0.07 + 0.06 * smooth(fBook - 4, fBook + 14, f)) * (1 - smooth(fBurst - 4, fBurst + 8, f));
  if (bgA > 0.001) {
    for (let i = 0; i < NBG; i++) {
      bg.pos[i * 3] = bgPage.pos[i * 3];
      bg.pos[i * 3 + 1] = bgPage.pos[i * 3 + 1];
      bg.pos[i * 3 + 2] = -320;
      bg.size[i] = 12.2;
      bg.halo[i] = 0;
      bg.col[i * 4] = GOLD[0];
      bg.col[i * 4 + 1] = GOLD[1];
      bg.col[i * 4 + 2] = GOLD[2];
      bg.col[i * 4 + 3] = bgA * (0.6 + 0.8 * hash01(i, 8));
    }
  }

  // ---------------------------------------------------------------- DOM
  const ovPhrase = 0.3 * (1 - smooth(fSplit - 16, fSplit - 8, f));
  const ovBig = HIT.map((h) => 0.5 * smooth(h + 1, h + 12, f) * (1 - smooth(fDis0 - 2, fDis0 + 8, f)));
  const headP = smooth(fC3 - 8, fC3 + 6, f) * (1 - smooth(fC6 - 14, fC6 + 2, f));
  const act = [smooth(fC3 - 8, fC3, f) * (1 - smooth(fC4 - 4, fC4 + 4, f)), smooth(fC4 - 4, fC4 + 4, f) * (1 - smooth(fC5 - 4, fC5 + 4, f)), smooth(fC5 - 4, fC5 + 4, f)];
  const tian = smooth(fTian - 2, fTian + 10, f);
  const lblBook = smooth(fBook - 2, fBook + 10, f) * (1 - smooth(fBurst - 6, fBurst + 4, f));
  const lblSrc = smooth(fNow + 8, fNow + 20, f) * (1 - smooth(fTian, fTian + 12, f));
  const lblSrc6 = smooth(fC6 + 4, fC6 + 16, f);
  const [gx, gy] = project(cam, P.G[0], P.G[1], 0);
  const [yx, yy] = project(cam, youP[0], youP[1], youP[2]);
  const youLab = smooth(fTian + 46, fTian + 66, f) * (1 - smooth(fOne - 8, fOne + 2, f));
  const resLab = smooth(fRes6 + 2, fRes6 + 16, f);
  const light = smooth(fRes6 + 8, fOne + 8, f);
  const flash = f >= fOne + 4 ? Math.exp(-(f - (fOne + 4)) / 10) : 0;
  const lx = Math.max(SAFE.x0 + 40, Math.min(SAFE.x1 - 60, yx - 70));
  const ly = Math.max(560, Math.min(1260, yy - 96));
  const rx = Math.max(SAFE.x0 + 120, Math.min(SAFE.x1 - 120, gx));
  const ry = Math.max(560, Math.min(1240, gy + 130));
  const bloom = 150 + 260 * light + 220 * flash;
  return (
    <AbsoluteFill>
      <Backdrop light={[0.5, 0.42]} glow={1 + 0.35 * punch + 0.25 * light} />
      <GlyphCanvas camera={cam}>
        {bgA > 0.001 ? <GlyphLayer state={bg} glow={0.2} /> : null}
        <GlyphLayer state={st} glow={0.55} halo={0.16} haloSize={3.2} face renderOrder={4} />
        <GlyphLayer state={fx} glow={0.6} halo={0.22} haloSize={3} face renderOrder={8} />
      </GlyphCanvas>
      {ovPhrase > 0.005 ? <MaskText text={'人选祸\n天选福'} size={PH.size} x={PH.x} y={PH.y} opacity={ovPhrase} glow={0.8} /> : null}
      {BIG.map((w, k) => (ovBig[k] > 0.005 ? <MaskText key={k} text={w.text} size={w.size} x={w.x} y={w.y} opacity={ovBig[k]} glow={1} /> : null))}
      {light + flash > 0.01 ? (
        <div
          style={{
            position: 'absolute',
            left: gx - bloom / 2,
            top: gy - bloom / 2,
            width: bloom,
            height: bloom,
            borderRadius: '50%',
            opacity: Math.min(1, 0.85 * light + 0.4 * flash),
            mixBlendMode: 'screen',
            background: 'radial-gradient(circle, rgba(255,246,220,0.95) 0%, rgba(255,214,140,0.55) 16%, rgba(232,164,90,0.18) 42%, rgba(232,164,90,0) 70%)',
          }}
        />
      ) : null}
      <Vignette amount={0.5} />
      {headP > 0.005 ? <Header p={headP} act={act} tian={tian} /> : null}
      {lblBook > 0.01 ? <Label text="《人选天选论》· 序" x={SAFE.x0 + 8} y={372} p={lblBook} size={32} /> : null}
      {lblSrc > 0.01 ? <Label text="《人选天选论》· 序 · 原文" x={SAFE.x0 + 8} y={508} p={lblSrc} size={32} /> : null}
      {lblSrc6 > 0.01 ? <Label text="《人选天选论》· 序 · 原文" x={SAFE.x0 + 8} y={372} p={lblSrc6} size={32} /> : null}
      {youLab > 0.01 ? (
        <>
          <svg width={W} height={H} style={{position: 'absolute', left: 0, top: 0, opacity: youLab}}>
            <line x1={yx} y1={yy} x2={lx + 22} y2={ly + 54} stroke="rgba(255,233,184,.75)" strokeWidth={2} />
          </svg>
          <div style={{position: 'absolute', left: lx, top: ly, transform: 'translate(-50%, -50%)', opacity: youLab, fontFamily: SERIF_BLACK, fontSize: 64, color: PAL.goldHi, textShadow: '0 0 20px rgba(255,196,110,.6), 0 2px 12px rgba(0,0,0,.8)'}}>你</div>
        </>
      ) : null}
      {resLab > 0.01 ? (
        <div style={{position: 'absolute', left: rx, top: ry, transform: 'translate(-50%, -50%)', opacity: resLab, fontFamily: SERIF_BLACK, fontSize: 84, letterSpacing: '0.12em', color: PAL.goldHi, textShadow: '0 0 28px rgba(255,196,110,.65), 0 3px 16px rgba(0,0,0,.85)', whiteSpace: 'nowrap'}}>
          结果
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

export const S: SceneMod = {
  C,
  hideSubs: ['c2'],
  sfx: ({at, atc}) => [
    [at('那句话') - 6, 'gather', 0.16, 70],
    [at('拆') - 6, 'whoosh_soft', 0.1, 36],
    ...atc('三个词').map((fr): [number, string, number, number] => [fr, 'tick', 0.08, 8]),
    [at('人选', 0, 0, 'c2') - 26, 'whoosh_soft', 0.12, 36],
    [at('你', 0, 0, 'c3'), 'chime', 0.13, 80],
    [at('灾难') + 6, 'scratch', 0.1, 22],
    [at('代价') - 2, 'pebbles', 0.1, 42],
    [at('天', 1, 0, 'c5') + 11, 'swell', 0.14, 60],
    [at('一个人') - 2, 'bell', 0.15, 110],
  ],
};
