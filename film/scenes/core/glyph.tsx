// 字粒子引擎：整本书 34952 个字 = 34952 个 GPU 实例。每帧由场景算出每个字的 位置/大小/颜色/字形/旋转/光晕，
// GlyphLayer 一次画完（字形来自 public/glyph/atlas.png：R = 字，G = 内光）。坐标 = 像素，原点在画面中心，y 向上，z 朝镜头。
// 默认镜头（fov 40，z = camZ()）下 z=0 平面 1 单位 = 1 像素。
//
//   const st = useGState();                  // 每个组件一份持久状态（N_BOOK 个字，默认字序 = 书的字序）
//   const page = usePage();                  // 整本书铺满一屏的位置（140 列 × 250 行，格 7.7px）
//   morphPos(st.pos, page.pos, shape, N, p, {stagger: .5, order: 'y', swirl: 160});
//   fillColor(st, '#F2D9A0', .9); st.size.fill(9);
//   <GlyphCanvas camera={{pos: [0, 0, camZ()]}}><GlyphLayer state={st} glow={.6} halo={.25} /></GlyphCanvas>
//
// 规则：一切由帧号算出（不用 Math.random / Date / useFrame）；重的东西（遮罩、取色、排版）用 useMemo / 下面的 hooks 缓存。
import React, {useLayoutEffect, useMemo, useRef} from 'react';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {staticFile} from 'remotion';
import {ATLAS, BOOK_IDX, N_BOOK, glyphIdx} from './book';
import {H, W} from './timeline';
import {makeNoise3, mulberry32, useAsync3D, useAsyncResource} from './gl/three-utils';
import {fontsReady} from './fonts';
import {hex} from './anim';

export {N_BOOK};
export type V3 = [number, number, number];

// ------------------------------------------------------------------ state
export type GState = {
  n: number; // 实际绘制的字数（≤ 容量）
  pos: Float32Array; // n*3 像素
  size: Float32Array; // n 字格边长（像素，z=0 处）
  col: Float32Array; // n*4 sRGB 0..1 + alpha
  idx: Float32Array; // n 图集格号（默认 = 书的第 i 个字）
  rot: Float32Array; // n 绕 z 旋转（弧度）
  halo: Float32Array; // n 光晕强度倍数（0 = 无）
};
export const newState = (n = N_BOOK): GState => {
  const idx = new Float32Array(n);
  for (let i = 0; i < n; i++) idx[i] = BOOK_IDX[i % N_BOOK];
  return {n, pos: new Float32Array(n * 3), size: new Float32Array(n).fill(8), col: new Float32Array(n * 4), idx, rot: new Float32Array(n), halo: new Float32Array(n).fill(1)};
};
/** 组件内持久状态（每帧原地改写，不要每帧 new） */
export const useGState = (n = N_BOOK) => useMemo(() => newState(n), [n]);
/** 全部字同一种颜色 */
export const fillColor = (st: GState, c: string | V3, a = 1) => {
  const [r, g, b] = typeof c === 'string' ? hex(c) : c;
  for (let i = 0; i < st.n; i++) {
    st.col[i * 4] = r;
    st.col[i * 4 + 1] = g;
    st.col[i * 4 + 2] = b;
    st.col[i * 4 + 3] = a;
  }
};
export const setColor = (st: GState, i: number, r: number, g: number, b: number, a: number) => {
  st.col[i * 4] = r;
  st.col[i * 4 + 1] = g;
  st.col[i * 4 + 2] = b;
  st.col[i * 4 + 3] = a;
};
/** 让第 i 个字显示成别的字 */
export const setChar = (st: GState, i: number, c: string) => {
  st.idx[i] = glyphIdx(c);
};
/** 字序恢复成书的字序 */
export const resetChars = (st: GState) => {
  for (let i = 0; i < st.n; i++) st.idx[i] = BOOK_IDX[i % N_BOOK];
};

// ------------------------------------------------------------------ layouts
export type Page = {pos: Float32Array; cell: number; cols: number; rows: number; x0: number; y0: number; n: number; xy: (i: number) => [number, number]};
/** 整本书排成一页（连续字流）。默认 140 列，格 = 1080/140 ≈ 7.71px，250 行 ≈ 1928px：整本书正好铺满一屏。 */
export const pageLayout = (o: {cols?: number; cell?: number; cx?: number; cy?: number; n?: number} = {}): Page => {
  const n = o.n ?? N_BOOK;
  const cols = o.cols ?? 140;
  const cell = o.cell ?? W / cols;
  const rows = Math.ceil(n / cols);
  const x0 = (o.cx ?? 0) - (cols * cell) / 2 + cell / 2;
  const y0 = (o.cy ?? 0) + (rows * cell) / 2 - cell / 2;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = x0 + (i % cols) * cell;
    pos[i * 3 + 1] = y0 - Math.floor(i / cols) * cell;
  }
  return {pos, cell, cols, rows, x0, y0, n, xy: (i: number) => [x0 + (i % cols) * cell, y0 - Math.floor(i / cols) * cell]};
};
export const usePage = (o: Parameters<typeof pageLayout>[0] = {}) => useMemo(() => pageLayout(o), [JSON.stringify(o)]); // eslint-disable-line react-hooks/exhaustive-deps

/** 一段文字的排版（横排，按 cols 折行，居中/左对齐），返回每个字的位置和图集格号 */
export const textLayout = (s: string, o: {x?: number; y?: number; size: number; cols?: number; lineH?: number; align?: 'center' | 'left'; tracking?: number}) => {
  const chars = [...s];
  const cols = o.cols ?? 99999;
  const step = o.size * (1 + (o.tracking ?? 0));
  const lh = o.size * (o.lineH ?? 1.35);
  const lines: string[][] = [];
  for (let k = 0; k < chars.length; k += cols) lines.push(chars.slice(k, k + cols));
  const pos = new Float32Array(chars.length * 3);
  const idx = new Float32Array(chars.length);
  let i = 0;
  lines.forEach((ln, r) => {
    const wln = ln.length * step;
    const x0 = (o.x ?? 0) + (o.align === 'left' ? 0 : -wln / 2) + step / 2;
    const y = (o.y ?? 0) + ((lines.length - 1) * lh) / 2 - r * lh;
    ln.forEach((c, k) => {
      pos[i * 3] = x0 + k * step;
      pos[i * 3 + 1] = y;
      idx[i] = glyphIdx(c);
      i++;
    });
  });
  return {pos, idx, n: chars.length, lines: lines.length};
};

// ------------------------------------------------------------------ masks & images
export type Mask = {w: number; h: number; a: Uint8Array; inside: Int32Array}; // a: 0..255，覆盖整个画面（w×h 映射到 1080×1920）
const buildMask = (w: number, h: number, data: Uint8ClampedArray, chan: (d: Uint8ClampedArray, k: number) => number, thr = 128): Mask => {
  const a = new Uint8Array(w * h);
  const ins: number[] = [];
  for (let k = 0; k < w * h; k++) {
    a[k] = chan(data, k * 4);
    if (a[k] >= thr) ins.push(k);
  }
  return {w, h, a, inside: Int32Array.from(ins)};
};
/** 文字遮罩（例如一个巨大的「选」）。x,y = 文字中心（像素，中心原点 y 向上）；size = 字号（像素）。 */
export const useTextMask = (text: string, o: {size: number; x?: number; y?: number; font?: string; res?: number}) => {
  const key = 'tm|' + text + '|' + JSON.stringify(o);
  return useAsyncResource<Mask>(key, async () => {
    await fontsReady();
    const res = o.res ?? 0.5;
    const w = Math.round(W * res);
    const h = Math.round(H * res);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', {willReadFrequently: true})!;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = o.size * res + 'px ' + (o.font ?? "'XSerifBlack'");
    const lines = text.split('\n');
    lines.forEach((ln, r) => ctx.fillText(ln, w / 2 + (o.x ?? 0) * res, h / 2 - (o.y ?? 0) * res + (r - (lines.length - 1) / 2) * o.size * res * 1.15));
    return buildMask(w, h, ctx.getImageData(0, 0, w, h).data, (d, k) => d[k + 3]);
  });
};
export type Img = {w: number; h: number; d: Uint8ClampedArray};
/** 图片 → 像素（按 cover 铺满整个 1080×1920 画面后缩到 w×h），用来给字取色或做遮罩 */
export const useImageData = (src: string | null, w = 270, h = 480) => {
  const key = src ? 'img|' + src + '|' + w + 'x' + h : null;
  return useAsyncResource<Img>(key, async () => {
    const im = new Image();
    im.src = staticFile(src!);
    await im.decode();
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', {willReadFrequently: true})!;
    const s = Math.max(w / im.naturalWidth, h / im.naturalHeight);
    const dw = im.naturalWidth * s;
    const dh = im.naturalHeight * s;
    ctx.drawImage(im, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return {w, h, d: ctx.getImageData(0, 0, w, h).data};
  });
};
/** 图片遮罩：mode 'luma'（亮处）| 'dark'（暗处）| 'alpha'（透明 PNG） */
export const imageMask = (img: Img, mode: 'luma' | 'dark' | 'alpha' = 'luma', thr = 128): Mask =>
  buildMask(img.w, img.h, img.d, (d, k) => {
    const l = 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2];
    return mode === 'alpha' ? d[k + 3] : mode === 'luma' ? l : 255 - l;
  }, thr);
/** 画面坐标 (x,y) 处的图片颜色（0..1） */
export const sampleImg = (img: Img, x: number, y: number): V3 => {
  const u = Math.min(img.w - 1, Math.max(0, Math.floor(((x + W / 2) / W) * img.w)));
  const v = Math.min(img.h - 1, Math.max(0, Math.floor(((H / 2 - y) / H) * img.h)));
  const k = (v * img.w + u) * 4;
  return [img.d[k] / 255, img.d[k + 1] / 255, img.d[k + 2] / 255];
};
/** 按每个字当前位置从图片取色（字拼成照片）。gain 提亮；alpha = 亮度映射（暗处的字更淡）：alphaMin..1 */
export const colorFromImage = (st: GState, img: Img, o: {gain?: number; alphaMin?: number; alpha?: number; mixAmt?: number} = {}) => {
  const g = o.gain ?? 1.25;
  const am = o.alphaMin ?? 0.35;
  const A = o.alpha ?? 1;
  const m = o.mixAmt ?? 1;
  for (let i = 0; i < st.n; i++) {
    const [r, gg, b] = sampleImg(img, st.pos[i * 3], st.pos[i * 3 + 1]);
    const l = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    const k = i * 4;
    st.col[k] = st.col[k] * (1 - m) + Math.min(1, r * g) * m;
    st.col[k + 1] = st.col[k + 1] * (1 - m) + Math.min(1, gg * g) * m;
    st.col[k + 2] = st.col[k + 2] * (1 - m) + Math.min(1, b * g) * m;
    st.col[k + 3] = st.col[k + 3] * (1 - m) + A * (am + (1 - am) * Math.min(1, l * 1.6)) * m;
  }
};
/** 在遮罩里取 n 个目标点（分层抽样，确定性），按阅读顺序（从上到下、从左到右）排列 → 和整页字流对应，变形时不乱。 */
export const maskTargets = (m: Mask, n: number, seed = 1, jitter = 1): Float32Array => {
  const out = new Float32Array(n * 3);
  const r = mulberry32(seed);
  const cnt = m.inside.length;
  const sx = W / m.w;
  const sy = H / m.h;
  for (let k = 0; k < n; k++) {
    const pick = cnt ? m.inside[Math.min(cnt - 1, Math.floor(((k + r()) / n) * cnt))] : 0;
    const px = pick % m.w;
    const py = Math.floor(pick / m.w);
    out[k * 3] = (px + 0.5 + (r() - 0.5) * jitter) * sx - W / 2;
    out[k * 3 + 1] = H / 2 - (py + 0.5 + (r() - 0.5) * jitter) * sy;
  }
  return out;
};


const MASK_GOLD: [string, string, string] = ['#FFF6DC', '#F2D9A0', '#E8A45A'];
/** 锐利的大字（canvas，整屏），定位和 useTextMask 完全相同 → 叠在同一个字的粒子版上严丝合缝（不要用 DOM Title 叠，位置会差几十像素）。
 *  例：<MaskText text="选" size={900} y={70} opacity={.5} />（参数和 useTextMask 一样）。 */
export const MaskText: React.FC<{text: string; size: number; x?: number; y?: number; font?: string; opacity?: number; glow?: number; colors?: [string, string, string]}> = ({
  text, size, x = 0, y = 0, font = "'XSerifBlack'", opacity = 1, glow = 1, colors = MASK_GOLD,
}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    ctx.font = size + 'px ' + font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = text.split(String.fromCharCode(10));
    const cy = H / 2 - y;
    const g = ctx.createLinearGradient(0, cy - (size * lines.length) / 2, 0, cy + (size * lines.length) / 2);
    g.addColorStop(0, colors[0]);
    g.addColorStop(0.45, colors[1]);
    g.addColorStop(1, colors[2]);
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(255,200,120,0.45)';
    ctx.shadowBlur = size * 0.12 * glow;
    lines.forEach((ln, r) => ctx.fillText(ln, W / 2 + x, cy + (r - (lines.length - 1) / 2) * size * 1.15));
  }, [text, size, x, y, font, glow, colors]);
  return <canvas ref={ref} width={W} height={H} style={{position: 'absolute', left: 0, top: 0, width: W, height: H, opacity, pointerEvents: 'none'}} />;
};

// ------------------------------------------------------------------ motion
const NOISE = new Map<number, ReturnType<typeof makeNoise3>>();
/** 确定性 3D 值噪声（约 -1..1，2 个八度） */
export const noise3 = (x: number, y: number, z: number, seed = 1) => {
  let fn = NOISE.get(seed);
  if (!fn) {
    fn = makeNoise3(seed);
    NOISE.set(seed, fn);
  }
  return fn(x, y, z, 2) * 2 - 1;
};
/** 每个字的固定随机数（0..1），同一 i/seed 永远一样 */
export const hash01 = (i: number, seed = 0) => {
  let h = (i * 374761393 + seed * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
const RANKS = new WeakMap<Float32Array, Map<string, Float32Array>>();
/** 变形顺序：每个字 0..1 的先后（'index' 字序 | 'random' | 'x' 左→右 | 'y' 上→下 | 'radial' 中心→外 | 'radialIn' 外→中心） */
export const ranks = (src: Float32Array, n: number, order: 'index' | 'random' | 'x' | 'y' | 'radial' | 'radialIn', seed = 1): Float32Array => {
  let m = RANKS.get(src);
  if (!m) {
    m = new Map();
    RANKS.set(src, m);
  }
  const key = order + '|' + n + '|' + seed;
  const hit = m.get(key);
  if (hit) return hit;
  const r = new Float32Array(n);
  if (order === 'index') for (let i = 0; i < n; i++) r[i] = i / Math.max(1, n - 1);
  else if (order === 'random') for (let i = 0; i < n; i++) r[i] = hash01(i, seed);
  else {
    const key2 = (i: number) => {
      const x = src[i * 3];
      const y = src[i * 3 + 1];
      if (order === 'x') return x;
      if (order === 'y') return -y;
      const d = Math.hypot(x, y);
      return order === 'radial' ? d : -d;
    };
    const ord = Array.from({length: n}, (_, i) => i).sort((a, b) => key2(a) - key2(b));
    ord.forEach((i, k) => (r[i] = k / Math.max(1, n - 1)));
    for (let i = 0; i < n; i++) r[i] = r[i] * 0.85 + hash01(i, seed) * 0.15;
  }
  m.set(key, r);
  return r;
};
export type MorphOpts = {stagger?: number; order?: 'index' | 'random' | 'x' | 'y' | 'radial' | 'radialIn'; swirl?: number; lift?: number; seed?: number; ease?: (t: number) => number};
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** 逐字错峰变形 a → b（写进 out）。stagger 0..0.9 先后差；swirl 途中侧向弧线（像素）；lift 途中朝镜头抬起（像素）。返回每字进度可选。 */
export const morphPos = (out: Float32Array, a: Float32Array, b: Float32Array, n: number, p: number, o: MorphOpts = {}) => {
  const s = o.stagger ?? 0.4;
  const rk = ranks(a, n, o.order ?? 'random', o.seed ?? 1);
  const ease = o.ease ?? easeIO;
  const sw = o.swirl ?? 0;
  const lift = o.lift ?? 0;
  for (let i = 0; i < n; i++) {
    const k = i * 3;
    let q = (p * (1 + s) - s * rk[i]);
    q = q <= 0 ? 0 : q >= 1 ? 1 : ease(q);
    const ax = a[k], ay = a[k + 1], az = a[k + 2];
    const bx = b[k], by = b[k + 1], bz = b[k + 2];
    let x = ax + (bx - ax) * q;
    let y = ay + (by - ay) * q;
    let z = az + (bz - az) * q;
    if ((sw || lift) && q > 0 && q < 1) {
      const arc = Math.sin(Math.PI * q);
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
    out[k] = x;
    out[k + 1] = y;
    out[k + 2] = z;
  }
};
/** 数组线性混合 out = a + (b-a)*t */
export const mixArr = (out: Float32Array, a: Float32Array, b: Float32Array, t: number) => {
  for (let i = 0; i < out.length; i++) out[i] = a[i] + (b[i] - a[i]) * t;
};
/** 给位置加上缓慢流动的噪声漂移（像素振幅 amp，空间尺度 scale 像素，速度 speed） */
export const drift = (pos: Float32Array, n: number, t: number, amp = 6, scale = 260, speed = 0.15, seed = 3) => {
  for (let i = 0; i < n; i++) {
    const k = i * 3;
    const x = pos[k] / scale;
    const y = pos[k + 1] / scale;
    pos[k] += amp * noise3(x, y, t * speed, seed);
    pos[k + 1] += amp * noise3(x + 31.7, y - 12.3, t * speed, seed);
  }
};
/** 把 [start,end) 这些书里的字标出来：颜色、放大，其余的字压暗（dim = 其余字的 alpha 倍数） */
export const highlightRange = (st: GState, start: number, end: number, o: {color?: string; dim?: number; scale?: number; halo?: number; amount?: number} = {}) => {
  const t = o.amount ?? 1;
  const [r, g, b] = hex(o.color ?? '#FFE7A8');
  const dim = 1 - (1 - (o.dim ?? 0.35)) * t;
  for (let i = 0; i < st.n; i++) {
    const k = i * 4;
    if (i >= start && i < end) {
      st.col[k] += (r - st.col[k]) * t;
      st.col[k + 1] += (g - st.col[k + 1]) * t;
      st.col[k + 2] += (b - st.col[k + 2]) * t;
      st.col[k + 3] += (1 - st.col[k + 3]) * t;
      st.size[i] *= 1 + ((o.scale ?? 1) - 1) * t;
      st.halo[i] *= 1 + ((o.halo ?? 3) - 1) * t;
    } else st.col[k + 3] *= dim;
  }
};

// ------------------------------------------------------------------ camera
export type Cam = {pos?: V3; target?: V3; fov?: number; roll?: number};
/** fov 下让 z=0 平面 1 单位 = 1 像素的镜头距离 */
export const camZ = (fov = 40) => H / 2 / Math.tan((fov * Math.PI) / 360);
/** 镜头对准 (x,y)，让 z=0 平面上边长 cell 的字在屏幕上显示成 px 像素 */
export const camOn = (x: number, y: number, cell: number, px: number, fov = 40): Cam => ({pos: [x, y, (camZ(fov) * cell) / px], target: [x, y, 0], fov});
/** 两个镜头之间插值（距离按对数插值，推拉更自然） */
export const camMix = (a: Cam, b: Cam, t: number): Cam => {
  const pa = a.pos ?? [0, 0, camZ(a.fov)];
  const pb = b.pos ?? [0, 0, camZ(b.fov)];
  const ta = a.target ?? [pa[0], pa[1], 0];
  const tb = b.target ?? [pb[0], pb[1], 0];
  const lz = Math.exp(Math.log(pa[2] - ta[2]) + (Math.log(pb[2] - tb[2]) - Math.log(pa[2] - ta[2])) * t);
  const L = (u: number, v: number) => u + (v - u) * t;
  const tx = L(ta[0], tb[0]);
  const ty = L(ta[1], tb[1]);
  const tz = L(ta[2], tb[2]);
  const ox = L(pa[0] - ta[0], pb[0] - tb[0]);
  const oy = L(pa[1] - ta[1], pb[1] - tb[1]);
  return {pos: [tx + ox, ty + oy, tz + lz], target: [tx, ty, tz], fov: L(a.fov ?? 40, b.fov ?? 40), roll: L(a.roll ?? 0, b.roll ?? 0)};
};
const Rig: React.FC<Cam> = ({pos, target, fov = 40, roll = 0}) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  useLayoutEffect(() => {
    const p = pos ?? [0, 0, camZ(fov)];
    const t = target ?? [p[0], p[1], 0];
    gl.setClearColor(0x000000, 0);
    camera.position.set(p[0], p[1], p[2]);
    camera.up.set(0, 1, 0);
    camera.fov = fov;
    camera.near = 1;
    camera.far = 60000;
    camera.lookAt(t[0], t[1], t[2]);
    if (roll) camera.rotateZ((roll * Math.PI) / 180);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  });
  return null;
};
/** 全屏 three 画布（透明背景，叠在 DOM 背景上）。一个场景尽量只用 1–2 个。 */
export const GlyphCanvas: React.FC<{camera?: Cam; children: React.ReactNode; style?: React.CSSProperties}> = ({camera = {}, children, style}) => (
  <ThreeCanvas
    width={W}
    height={H}
    dpr={1}
    linear
    flat
    camera={{position: [0, 0, camZ(camera.fov ?? 40)], fov: camera.fov ?? 40, near: 1, far: 60000}}
    gl={{antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance'}}
    style={{position: 'absolute', left: 0, top: 0, pointerEvents: 'none', ...style}}
  >
    <Rig {...camera} />
    {children}
  </ThreeCanvas>
);

// ------------------------------------------------------------------ renderer
const VERT = /* glsl */ `
attribute vec3 iPos; attribute float iSize; attribute vec4 iCol; attribute float iIdx; attribute float iRot; attribute float iHalo;
uniform float uScale; uniform vec2 uGrid; uniform float uFace; uniform float uIsHalo;
varying vec2 vUv; varying vec2 vLocal; varying vec4 vCol; varying float vHalo;
void main() {
  vCol = iCol; vHalo = iHalo; vLocal = uv;
  float s = iSize * uScale;
  float c = cos(iRot), sn = sin(iRot);
  vec2 q = position.xy * s;
  q = vec2(c * q.x - sn * q.y, sn * q.x + c * q.y);
  vec4 world = modelMatrix * vec4(iPos, 1.0);
  vec4 mv = uFace > 0.5 ? viewMatrix * world + vec4(q, 0.0, 0.0) : viewMatrix * (world + vec4(q, 0.0, 0.0));
  gl_Position = projectionMatrix * mv;
  float col = mod(iIdx + 0.5, uGrid.x) - 0.5;
  float row = floor((iIdx + 0.5) / uGrid.x);
  vUv = (vec2(col, row) + vec2(uv.x, 1.0 - uv.y)) / uGrid;
  if (iCol.a < 0.002 || s < 0.05 || (uIsHalo > 0.5 && iHalo <= 0.0)) gl_Position = vec4(3.0, 3.0, 3.0, 1.0);
}`;
const FRAG = /* glsl */ `
uniform sampler2D uAtlas; uniform float uGlow; uniform float uOpacity; uniform float uAdd;
varying vec2 vUv; varying vec2 vLocal; varying vec4 vCol;
void main() {
  vec2 t = texture2D(uAtlas, vUv).rg;
  float e = length(vLocal - 0.5);
  float g = t.g * t.g * uGlow * smoothstep(0.48, 0.18, e);
  float a = t.r;
  if (a + g < 0.004) discard;
  float k = vCol.a * uOpacity;
  gl_FragColor = vec4(vCol.rgb * (a + g * 0.85) * k, uAdd > 0.5 ? 0.0 : clamp(a + g * 0.5, 0.0, 1.0) * k);
}`;
const FRAG_HALO = /* glsl */ `
uniform float uHalo; uniform float uOpacity;
varying vec2 vLocal; varying vec4 vCol; varying float vHalo;
void main() {
  vec2 d = vLocal - 0.5;
  float h = exp(-dot(d, d) * 18.0) * uHalo * vHalo * vCol.a * uOpacity;
  if (h < 0.002) discard;
  gl_FragColor = vec4(vCol.rgb * h, 0.0);
}`;
const loadAtlas = async () => {
  const im = new Image();
  im.src = staticFile('glyph/atlas.png');
  await im.decode();
  const t = new THREE.Texture(im);
  t.flipY = false;
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
};
const blendOf = (m: THREE.ShaderMaterial, add: boolean) => {
  m.transparent = true;
  m.depthTest = false;
  m.depthWrite = false;
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = add ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = THREE.OneFactor;
  m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
};
export type GlyphLayerProps = {
  state: GState;
  /** 字内光（atlas G 通道）强度，0 = 干净的字 */
  glow?: number;
  /** 每个字背后的柔光晕强度（加色），0 = 关 */
  halo?: number;
  /** 光晕直径 = 字格 × haloSize */
  haloSize?: number;
  /** 'add'（暗底发光，默认）| 'normal'（亮底上的墨字） */
  blend?: 'add' | 'normal';
  opacity?: number;
  /** 字永远正对镜头（billboard）；默认 false = 字躺在自己的平面上，镜头倾斜时有透视 */
  face?: boolean;
  renderOrder?: number;
};
/** 画一组字（GState）。必须放在 <GlyphCanvas> 里。 */
export const GlyphLayer: React.FC<GlyphLayerProps> = ({state, glow = 0.5, halo = 0, haloSize = 3, blend = 'add', opacity = 1, face = false, renderOrder = 0}) => {
  const tex = useAsync3D<THREE.Texture>('xuan-atlas', loadAtlas);
  const geo = useMemo(() => {
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    g.setAttribute('uv', base.getAttribute('uv'));
    const add = (name: string, arr: Float32Array, size: number) => {
      const a = new THREE.InstancedBufferAttribute(arr, size);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, a);
    };
    add('iPos', state.pos, 3);
    add('iSize', state.size, 1);
    add('iCol', state.col, 4);
    add('iIdx', state.idx, 1);
    add('iRot', state.rot, 1);
    add('iHalo', state.halo, 1);
    return g;
  }, [state]);
  const mats = useMemo(() => {
    const common = {uGrid: {value: new THREE.Vector2(ATLAS.cols, ATLAS.rows)}, uOpacity: {value: 1}, uFace: {value: 0}};
    const glyph = new THREE.ShaderMaterial({vertexShader: VERT, fragmentShader: FRAG, uniforms: {...common, uScale: {value: 1}, uIsHalo: {value: 0}, uAtlas: {value: null}, uGlow: {value: 0.5}, uAdd: {value: 1}}});
    const haloM = new THREE.ShaderMaterial({vertexShader: VERT, fragmentShader: FRAG_HALO, uniforms: {uGrid: common.uGrid, uOpacity: {value: 1}, uFace: {value: 0}, uScale: {value: 3}, uIsHalo: {value: 1}, uHalo: {value: 0}}});
    blendOf(haloM, true);
    return {glyph, halo: haloM};
  }, []);
  useLayoutEffect(() => {
    const g = geo;
    (['iPos', 'iSize', 'iCol', 'iIdx', 'iRot', 'iHalo'] as const).forEach((k) => ((g.getAttribute(k) as THREE.InstancedBufferAttribute).needsUpdate = true));
    g.instanceCount = state.n;
    const u = mats.glyph.uniforms;
    u.uAtlas.value = tex;
    u.uGlow.value = glow;
    u.uOpacity.value = opacity;
    u.uAdd.value = blend === 'add' ? 1 : 0;
    u.uFace.value = face ? 1 : 0;
    blendOf(mats.glyph, blend === 'add');
    const h = mats.halo.uniforms;
    h.uHalo.value = halo;
    h.uScale.value = haloSize;
    h.uOpacity.value = opacity;
    h.uFace.value = face ? 1 : 0;
  });
  if (!tex) return null;
  return (
    <>
      {halo > 0 ? <mesh geometry={geo} material={mats.halo} frustumCulled={false} renderOrder={renderOrder} /> : null}
      <mesh geometry={geo} material={mats.glyph} frustumCulled={false} renderOrder={renderOrder + 1} />
    </>
  );
};
