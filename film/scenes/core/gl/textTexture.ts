import * as THREE from 'three';
import '@kit/fonts'; // side effect: injects the inlined @font-face rules
import {FONT_HEAVY} from '@kit/theme';
import {useAsync3D} from './three-utils';

export type TextTextureOptions = {
  text: string;
  /** 'SHS Heavy' (default) | 'SHS Bold' | 'LXGW WK'. */
  fontFamily?: string;
  /** CSS px at 1x (default 96). The canvas is drawn at `scale`x this. */
  fontSize?: number;
  color?: string;
  /** Line height multiplier (default 1.3). '\n' forces a break. */
  lineHeight?: number;
  align?: 'left' | 'center' | 'right';
  /** Wrap width in CSS px (per character, CJK style). Default: no wrapping. */
  maxWidth?: number;
  padding?: number;
  letterSpacing?: number;
  /** Fill behind the text (default transparent). */
  background?: string | null;
  /** Oversampling (default 2 = "2x resolution"). */
  scale?: number;
};

export type TextTextureResult = {
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
  /** Logical size in CSS px (canvas is `scale`x larger). */
  width: number;
  height: number;
  aspect: number;
};

const cache = new Map<string, Promise<TextTextureResult>>();

const wrap = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number | undefined) => {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    if (!maxWidth) {
      out.push(para);
      continue;
    }
    let line = '';
    for (const ch of Array.from(para)) {
      const next = line + ch;
      if (line && ctx.measureText(next).width > maxWidth) {
        out.push(line);
        line = ch;
      } else line = next;
    }
    out.push(line);
  }
  return out;
};

/** Renders text to a 2x canvas once fonts are loaded; cached by options for the whole page. */
export const loadTextTexture = (o: TextTextureOptions): Promise<TextTextureResult> => {
  const key = JSON.stringify(o);
  let p = cache.get(key);
  if (p) return p;
  p = (async () => {
    const family = o.fontFamily ?? FONT_HEAVY;
    const size = o.fontSize ?? 96;
    const scale = o.scale ?? 2;
    const pad = o.padding ?? Math.round(size * 0.25);
    const font = `${size}px '${family}'`;
    await document.fonts.load(font, o.text);
    if (!document.fonts.check(font, o.text)) throw new Error(`textTexture: font ${family} not available for "${o.text}"`);
    const probe = document.createElement('canvas').getContext('2d')!;
    probe.font = font;
    if (o.letterSpacing) probe.letterSpacing = `${o.letterSpacing}px`;
    const lines = wrap(probe, o.text, o.maxWidth);
    const lh = size * (o.lineHeight ?? 1.3);
    const textW = Math.max(...lines.map((l) => probe.measureText(l).width), 1);
    const w = Math.ceil(textW + pad * 2);
    const h = Math.ceil(lh * lines.length + pad * 2);
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(w * scale);
    canvas.height = Math.ceil(h * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    if (o.background) {
      ctx.fillStyle = o.background;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.font = font;
    if (o.letterSpacing) ctx.letterSpacing = `${o.letterSpacing}px`;
    ctx.fillStyle = o.color ?? '#1B1D1C';
    ctx.textBaseline = 'middle';
    const align = o.align ?? 'center';
    ctx.textAlign = align;
    const x = align === 'left' ? pad : align === 'right' ? w - pad : w / 2;
    lines.forEach((l, i) => ctx.fillText(l, x, pad + lh * (i + 0.5) + size * 0.04));
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return {texture, canvas, width: w, height: h, aspect: w / h};
  })();
  cache.set(key, p);
  return p;
};

/** Text texture inside <Stage3D>: null until ready (the frame is held and the scene re-drawn when it arrives). */
export const useTextTexture = (o: TextTextureOptions | null | undefined): TextTextureResult | null =>
  useAsync3D(o ? 'tt:' + JSON.stringify(o) : null, () => loadTextTexture(o!));
