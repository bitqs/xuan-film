import {useLayoutEffect, useRef, useState} from 'react';
import {useDelayRender} from 'remotion';
import * as THREE from 'three';
import {useThree} from '@react-three/fiber';
import {loadImage} from './ShaderLayer';

/** Fast deterministic PRNG (mulberry32). Same seed -> same sequence in every tab/run. */
export const mulberry32 = (seed: number) => {
  let a = (Math.floor(seed * 2654435761) ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export type Vec3 = [number, number, number];

const texCache = new Map<string, THREE.Texture>();

export type ImageTextureOptions = {
  /** RepeatWrapping + repeat count (for tiling paper). */
  repeat?: [number, number];
  /** 'srgb' for colour maps (default), 'linear' for data (bump/roughness). */
  colorSpace?: 'srgb' | 'linear';
  anisotropy?: number;
};

const makeTexture = (img: HTMLImageElement, o: ImageTextureOptions) => {
  const t = new THREE.Texture(img);
  t.colorSpace = o.colorSpace === 'linear' ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = o.anisotropy ?? 8;
  if (o.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(o.repeat[0], o.repeat[1]);
  }
  t.needsUpdate = true;
  return t;
};

/**
 * Image -> THREE.Texture (cached per url+options), frame held until decoded. Returns null while loading.
 * Must be used inside <Stage3D>/<ThreeCanvas>: when the texture arrives the scene is re-drawn (advance) before the frame is released.
 */
export const useThreeTexture = (src: string | null | undefined, o: ImageTextureOptions = {}): THREE.Texture | null => {
  const key = src ? `${src}|${JSON.stringify(o)}` : '';
  const {delayRender, continueRender, cancelRender} = useDelayRender();
  const advance = useThree((s) => s.advance);
  const [tex, setTex] = useState<THREE.Texture | null>(() => (key ? texCache.get(key) ?? null : null));
  const handle = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (!src) return;
    const hit = texCache.get(key);
    if (hit) {
      setTex(hit);
      return;
    }
    const h = delayRender(`three texture ${src}`);
    handle.current = h;
    let alive = true;
    loadImage(src)
      .then((img) => {
        let t = texCache.get(key);
        if (!t) {
          t = makeTexture(img, o);
          texCache.set(key, t);
        }
        if (alive) setTex(t);
        else continueRender(h);
      })
      .catch((e) => cancelRender(e));
    return () => {
      alive = false;
      if (handle.current === h) {
        continueRender(h);
        handle.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useLayoutEffect(() => {
    if (tex && handle.current !== null) {
      // redraw after the whole commit (other layout effects may still update the scene), before any capture
      queueMicrotask(() => advance(performance.now()));
      continueRender(handle.current);
      handle.current = null;
    }
  }, [tex, continueRender, advance]);
  return tex;
};

/**
 * Hold the render with delayRender until `make()` resolves; returns its value (null before). Cached by `key` for the page.
 * `onReady` runs after the commit that uses the value and before the frame is released (inside r3f pass `advance`).
 */
const asyncCache = new Map<string, unknown>();
const asyncPending = new Map<string, Promise<unknown>>();
export const useAsyncResource = <T,>(key: string | null, make: () => Promise<T>, onReady?: () => void): T | null => {
  const {delayRender, continueRender, cancelRender} = useDelayRender();
  const [val, setVal] = useState<T | null>(() => (key && asyncCache.has(key) ? (asyncCache.get(key) as T) : null));
  const handle = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (!key) return;
    if (asyncCache.has(key)) {
      setVal(asyncCache.get(key) as T);
      return;
    }
    const h = delayRender(`gl resource ${key.slice(0, 60)}`);
    handle.current = h;
    let alive = true;
    let p = asyncPending.get(key) as Promise<T> | undefined;
    if (!p) {
      p = make().then((v) => {
        asyncCache.set(key, v);
        return v;
      });
      asyncPending.set(key, p);
    }
    p.then((v) => {
      if (alive) setVal(v);
      else continueRender(h);
    }).catch((e) => cancelRender(e));
    return () => {
      alive = false;
      if (handle.current === h) {
        continueRender(h);
        handle.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useLayoutEffect(() => {
    if (val !== null && handle.current !== null) {
      onReady?.();
      continueRender(handle.current);
      handle.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [val, continueRender]);
  return key && asyncCache.has(key) ? (asyncCache.get(key) as T) : val;
};

/**
 * useAsyncResource for use inside the r3f tree: re-draws the scene when the value arrives. The redraw is
 * queued as a microtask so it runs after every layout effect of this commit (e.g. copying the value into
 * a BufferAttribute) but before Remotion can capture the frame.
 */
export const useAsync3D = <T,>(key: string | null, make: () => Promise<T>): T | null => {
  const advance = useThree((s) => s.advance);
  return useAsyncResource(key, make, () => queueMicrotask(() => advance(performance.now())));
};

// ---- tiny seeded 3D value noise (JS side, for sampling distributions) ----
export const makeNoise3 = (seed: number) => {
  const rnd = mulberry32(seed + 101);
  const perm = new Uint8Array(512);
  const p = Array.from({length: 256}, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const val = new Float32Array(256).map(() => rnd());
  const h = (x: number, y: number, z: number) => val[perm[(perm[(perm[x & 255] + y) & 255] + z) & 255]];
  const sm = (t: number) => t * t * (3 - 2 * t);
  const noise = (x: number, y: number, z: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = sm(x - xi), v = sm(y - yi), w = sm(z - zi);
    const l = (a: number, b: number, t: number) => a + (b - a) * t;
    return l(
      l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
      l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v),
      w,
    );
  };
  return (x: number, y: number, z: number, octaves = 3) => {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let o = 0; o < octaves; o++) {
      s += a * noise(x * f + o * 17.3, y * f + o * 9.1, z * f + o * 5.7);
      n += a;
      a *= 0.5;
      f *= 2.03;
    }
    return s / n; // 0..1
  };
};
