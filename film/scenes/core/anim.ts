// 通用动画小工具（纯函数，全部由帧号算出，不许用 Math.random / Date）。
import {Easing, interpolate, random, spring} from 'remotion';

export const EASE = {
  linear: (t: number) => t,
  in: Easing.in(Easing.cubic),
  out: Easing.out(Easing.cubic),
  inOut: Easing.inOut(Easing.cubic),
  quint: Easing.out(Easing.poly(5)),
  expo: Easing.out(Easing.exp),
  inExpo: Easing.in(Easing.exp),
  sine: Easing.inOut(Easing.sin),
  back: Easing.out(Easing.back(1.4)),
};
/** a→b 帧之间的 0..1 进度（带缓动，自动夹紧） */
export const prog = (f: number, a: number, b: number, ease: (t: number) => number = EASE.inOut) =>
  ease(interpolate(f, [a, b], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const rnd = (seed: string | number) => random(String(seed));
/** 弹簧（fps 30），at 帧开始，0 → 1 */
export const spr = (f: number, at: number, damping = 14, stiffness = 120) =>
  spring({frame: f - at, fps: 30, config: {damping, stiffness, mass: 1}});
/** 关键帧插值：keys = [[帧, 值], ...]，段间用 ease */
export const keyframes = (f: number, keys: [number, number][], ease: (t: number) => number = EASE.inOut) => {
  if (f <= keys[0][0]) return keys[0][1];
  for (let k = 1; k < keys.length; k++) {
    if (f <= keys[k][0]) return mix(keys[k - 1][1], keys[k][1], ease((f - keys[k - 1][0]) / Math.max(1e-6, keys[k][0] - keys[k - 1][0])));
  }
  return keys[keys.length - 1][1];
};
/** '#rrggbb' → [r,g,b] 0..1（sRGB，直接用） */
export const hex = (h: string): [number, number, number] => {
  const s = h.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
