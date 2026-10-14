import React, {useLayoutEffect, useRef, useState} from 'react';
import {AbsoluteFill, HtmlInCanvas, useCurrentFrame, useDelayRender, useRemotionEnvironment, useVideoConfig} from 'remotion';
import type {HtmlInCanvasOnPaint} from 'remotion';
import type {TransitionPresentation, TransitionPresentationComponentProps} from '@remotion/transitions';
import {ShaderLayer, ShaderLayerProps} from './ShaderLayer';
import {FRAG_HEADER, drawFullscreen, getProgram, releaseContext, setUniforms, trackContext} from './gl-core';
import {GLSL_HASH, GLSL_NOISE} from './glsl';

// ---------------------------------------------------------------------------------------------
// Shared ink field: an ink blot spreading into wet paper from one or more origins.
//  - radial "fingers" (noise on the direction circle) + paper absorbency variation (static field)
//  - capillary leaks along paper fibres (anisotropic streak field) just outside the front
//  - fine rough outline so the edge never looks like a vector curve
// The paper field is static (fibres don't move); only the radius grows, so edges never "boil".

export const INK_FIELD_GLSL = /* glsl */ `
uniform vec4 u_origins[4];   // xy = CSS fraction of the layer box, z = delay (0..0.9 of progress), w = size (1 = covers frame at progress 1)
uniform float u_count, u_rough, u_fiber, u_ease, u_bleed;
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
// short, gently curved paper fibres scattered in cells (like the real sheet), 0..1
float fiberCells(vec2 p, float scale, float seed) {
  vec2 q = p * scale;
  vec2 id = floor(q), fr = fract(q);
  float acc = 0.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 cid = id + vec2(float(i), float(j));
    vec4 h = hash42(cid + seed * 13.1);
    vec2 c = vec2(float(i), float(j)) + h.xy;
    float ang = h.z * 6.2831;
    vec2 dir = vec2(cos(ang), sin(ang));
    vec2 perp = vec2(-dir.y, dir.x);
    float len = 0.3 + 0.55 * h.w;
    float bend = (hash12(cid * 3.1 + seed) - 0.5) * 1.6;
    vec2 d = fr - c;
    float t = clamp(dot(d, dir), -len, len);
    vec2 cl = c + dir * t + perp * bend * t * t;
    float w = 0.012 + 0.018 * hash12(cid * 7.7 + seed);
    float along = 1.0 - smoothstep(len * 0.6, len, abs(t));          // tapered ends
    acc = max(acc, (1.0 - smoothstep(w * 0.35, w, length(fr - cl))) * along * (0.45 + 0.55 * h.w));
  }
  return acc;
}
float paperFibers(vec2 p) { return max(fiberCells(p, 15.0, u_seed), 0.8 * fiberCells(p + 3.1, 27.0, u_seed + 7.0)); }
// Dense-core signed distance (<0 inside), frame-height units, top-left origin. radius = largest current blot radius.
float inkCore(vec2 p, float progress, float aspect, out float radius) {
  float f = 1e5;
  radius = 0.0;
  vec2 box = vec2(aspect, 1.0);
  for (int i = 0; i < 4; i++) {
    if (float(i) >= u_count) break;
    vec4 o = u_origins[i];
    vec2 c = o.xy * box;
    float lp = clamp((progress - o.z) / max(1.0 - o.z, 1e-3), 0.0, 1.0);
    float e = mix(lp, 1.0 - pow(1.0 - lp, 1.45), u_ease);
    float D = max(max(length(c), length(c - vec2(aspect, 0.0))), max(length(c - vec2(0.0, 1.0)), length(c - box)));
    float R = (e * (D + 0.19 * 0.5 * u_rough + 0.07) - 0.004 * (1.0 - e)) * o.w;
    vec2 d = p - c;
    float r = length(d);
    vec2 dir = d / max(r, 1e-4);
    float fing = fbm(dir * 2.4 + c * 3.1 + vec2(u_seed * 1.7 + float(i) * 4.3, 0.0) + r * 1.6);
    float fi = r - R + clamp(R, 0.0, 0.5) * 0.19 * u_rough * fing;
    f = (i == 0) ? fi : smin(f, fi, 0.05);
    radius = max(radius, R);
  }
  float grow = clamp(radius / 0.12, 0.0, 1.0);
  f += 0.018 * u_rough * fbm(p * 3.3 + u_seed * 3.3) * grow;                                    // paper absorbency
  f += (0.0022 * gnoise(p * 300.0 + u_seed) + 0.001 * gnoise(p * 780.0 + 7.0)) * clamp(radius / 0.02, 0.0, 1.0); // ragged outline
  return f;
}
// Shared look. core: dense ink (0..1); bleed: diluted ragged wash + tide line + fibre feathering outside the core (0..1).
void inkLook(vec2 p, float progress, float aspect, float pxH, out float f, out float core, out float bleed, out float R) {
  float fc = inkCore(p, progress, aspect, R);
  float grow = clamp(R / 0.08, 0.0, 1.0);
  float fib = paperFibers(p);
  float tooth = vnoise(p * 700.0 + u_seed) - 0.5;
  // capillary feathering: the front runs ahead along fibres
  float feather = (0.004 + 0.014 * min(R, 0.4)) * u_fiber * grow;
  f = fc - feather * fib + 0.0012 * tooth * grow;
  core = smoothstep(1.3 * pxH, -1.3 * pxH, f);
  // diluted wash ahead of the core: its own ragged, fibre-feathered boundary + a faint darker tide line
  float H = (0.008 + 0.03 * min(R, 0.5)) * u_bleed + 1e-4;
  float fh = fc - H + 0.45 * H * fbm3o(p * 14.0 + u_seed * 2.0) - 1.6 * feather * fib;
  float inWash = smoothstep(1.5 * pxH, -1.5 * pxH, fh) * (1.0 - core);
  float toward = clamp(fc / H, 0.0, 1.0);
  float washA = inWash * (0.26 + 0.22 * fib + 0.1 * tooth) * (1.0 - 0.4 * toward);
  float tide = (1.0 - smoothstep(0.0, 2.6 * pxH, abs(fh))) * step(0.0, fc) * 0.22;
  bleed = clamp(washA + tide * (1.0 - core), 0.0, 1.0) * grow * step(0.0005, R) * step(0.001, u_bleed);
}
`;

const INK_LAYER_FRAG = /* glsl */ `
${GLSL_HASH}
${GLSL_NOISE}
${INK_FIELD_GLSL}
uniform vec3 u_ink, u_inkThin;
uniform float u_edge, u_alpha;
void main() {
  vec2 cres = u_res / u_scale;
  vec2 p = fragCSS() / cres.y;
  float f, core, bleed, R;
  inkLook(p, u_progress, cres.x / cres.y, 1.0 / cres.y, f, core, bleed, R);
  // core pigment: nearly black, darker pooled edge, faint lighter blooms and fibre texture
  float d = max(-f, 0.0);
  float bloom = smoothstep(0.0, 0.8, fbm(p * 3.2 + 9.0 + u_seed));
  float density = 0.94 + 0.06 * exp(-d / 0.006) * u_edge - 0.07 * bloom * (1.0 - exp(-d / 0.02)) + 0.04 * paperFibers(p);
  density += (hash12(gl_FragCoord.xy + u_seed * 17.0) - 0.5) * 0.04;
  vec3 coreCol = mix(u_inkThin, u_ink, clamp(density, 0.0, 1.0));
  vec3 bleedCol = mix(u_inkThin, u_ink, 0.72);
  float coreA = mix(0.93, 1.0, smoothstep(0.85, 1.0, u_progress));        // a little paper shows through until the flood completes
  float a = clamp(core * coreA + bleed * (1.0 - core), 0.0, 1.0) * u_alpha;
  vec3 c = mix(bleedCol, coreCol, core);
  fragColor = vec4(c * a, a);
}
`;

// u_mode: 0 = luminance mask (white = revealed), 1 = ink overlay only (rim + bleed), 2 = composite with u_src
const INK_MASK_FRAG = /* glsl */ `
${GLSL_HASH}
${GLSL_NOISE}
${INK_FIELD_GLSL}
uniform sampler2D u_src;
uniform vec3 u_ink, u_inkThin;
uniform float u_rim, u_mode;
void main() {
  vec2 cres = u_res / u_scale;
  vec2 p = fragCSS() / cres.y;
  float f, core, bleed, R;
  inkLook(p, u_progress, cres.x / cres.y, 1.0 / cres.y, f, core, bleed, R);
  if (u_mode < 0.5) { fragColor = vec4(vec3(core), 1.0); return; }
  float d = max(-f, 0.0);
  // wet ink band just inside the front; its inner edge "clears" raggedly into the revealed page
  float Wb = (0.006 + 0.065 * min(R, 0.5)) * u_rim + 1e-4;
  float clearN = fbm3o(p * 9.0 + u_seed * 4.0) * 0.45 + (paperFibers(p * 1.3 + 1.7) - 0.3) * 0.25;
  float dd = d / Wb + clearN;
  float band = 1.0 - smoothstep(0.45, 1.0, dd);
  float rimA = min(u_rim, 1.0) * core * band * (0.9 - 0.12 * smoothstep(0.0, 0.5, dd));
  float inkA = clamp(rimA + bleed * (1.0 - core), 0.0, 1.0);
  vec3 inkCol = mix(u_inkThin, u_ink, 0.78 + 0.22 * (1.0 - smoothstep(0.0, 0.6, dd)));
  vec4 src = u_mode > 1.5 ? texture(u_src, v_uv) * core : vec4(0.0);
  fragColor = src * (1.0 - inkA) + vec4(inkCol, 1.0) * inkA;
}
`;

// ---------------------------------------------------------------------------------------------

export type InkOrigin = [number, number] | {x: number; y: number; delay?: number; size?: number};

export type InkRevealProps = {
  /** 0 = nothing, 1 = frame fully covered / revealed. */
  progress: number;
  /** One or up to 4 origins in CSS fractions of the box ([x, y]) or {x, y, delay (0..0.9 of progress), size}. Default centre. */
  origin?: InkOrigin | InkOrigin[];
  /** 'ink' = an ink-coloured layer spreading over what's below; 'mask' = reveals `children` inside the ink front. */
  mode?: 'ink' | 'mask';
  children?: React.ReactNode;
  /** Ink colours (sRGB hex). Thin/diluted areas drift toward `thinColor`. */
  color?: string;
  thinColor?: string;
  /** Lobes / radial fingers (0 = circle, 1 = default, 2 = very ragged). */
  rough?: number;
  /** Capillary leaks along paper fibres (0 = none, 1 = default). */
  fiber?: number;
  /** Mask mode: width/strength of the dark wet-ink band at the reveal front (0 = pure mask, 1 = default, 2 = wide). */
  rim?: number;
  /** Ink mode: darker pigment ring at the wet edge. */
  edge?: number;
  /** Diluted, feathered, fibrous halo around the dense core (0 = crisp edge, 1 = default, 2 = wide wash). */
  bleed?: number;
  /** 0 = radius linear in progress, 1 = ink-like ease-out (fast start, slows down). Default 0.5. */
  ease?: number;
  seed?: number;
  opacity?: number;
  width?: number;
  height?: number;
  /** Mask backend: 'auto' uses HTML-in-canvas when the browser supports it (Remotion's headless Chrome does), else a CSS luminance mask. */
  backend?: 'auto' | 'html-in-canvas' | 'css-mask';
  style?: React.CSSProperties;
  /** Benchmark hook for mode="ink" (see ShaderLayer). */
  onDraw?: ShaderLayerProps['onDraw'];
};

const toOrigins = (origin: InkRevealProps['origin']) => {
  const list: InkOrigin[] = origin === undefined ? [[0.5, 0.5]] : Array.isArray(origin) && typeof origin[0] === 'number' ? [origin as [number, number]] : (origin as InkOrigin[]);
  if (list.length > 4) throw new Error('InkReveal: at most 4 origins');
  const flat: number[] = [];
  for (const o of list) {
    if (Array.isArray(o)) flat.push(o[0], o[1], 0, 1);
    else flat.push(o.x, o.y, o.delay ?? 0, o.size ?? 1);
  }
  while (flat.length < 16) flat.push(0, 0, 0, 1);
  return {flat, count: list.length};
};

const inkUniforms = (p: InkRevealProps) => {
  const {flat, count} = toOrigins(p.origin);
  return {
    u_origins: flat,
    u_count: count,
    u_rough: p.rough ?? 1,
    u_fiber: p.fiber ?? 1,
    u_ease: p.ease ?? 0.5,
    u_ink: p.color ?? '#1B1D1C',
    u_inkThin: p.thinColor ?? '#1F4E79',
    u_edge: p.edge ?? 1,
    u_bleed: p.bleed ?? 1,
    u_rim: p.rim ?? 1,
    u_alpha: 1,
  };
};

/**
 * Organic ink-bleed. `mode="ink"`: ink layer (use it to flood the frame into the dark world, or as a blot).
 * `mode="mask"`: `children` are revealed inside the spreading ink, with a wet dark rim and fibre leaks.
 */
export const InkReveal: React.FC<InkRevealProps> = (props) => {
  const {mode = 'ink', progress, seed = 0, opacity, style} = props;
  const {width: compW, height: compH} = useVideoConfig();
  const w = props.width ?? compW;
  const h = props.height ?? compH;
  if (mode === 'ink') {
    return <ShaderLayer frag={INK_LAYER_FRAG} progress={progress} seed={seed} width={w} height={h} opacity={opacity} style={style} uniforms={inkUniforms(props)} onDraw={props.onDraw} />;
  }
  // mask: short-circuit the trivial ends (no GPU work, crisp children)
  if (progress <= 0) return null;
  const backend = props.backend ?? 'auto';
  const useHic = backend === 'html-in-canvas' || (backend === 'auto' && HtmlInCanvas.isSupported());
  if (progress >= 1) {
    return <div style={{position: 'absolute', left: 0, top: 0, width: w, height: h, opacity, ...style}}>{props.children}</div>;
  }
  return useHic ? <InkMaskHic {...props} width={w} height={h} /> : <InkMaskCss {...props} width={w} height={h} />;
};

// ---- mask via HTML-in-canvas: children -> WebGL texture -> composite in one pass -------------
type HicGL = {canvas: OffscreenCanvas; gl: WebGL2RenderingContext; tex: WebGLTexture};

const InkMaskHic: React.FC<InkRevealProps & {width: number; height: number}> = (props) => {
  const {width, height, children, progress, seed = 0, opacity, style} = props;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const glRef = useRef<HicGL | null>(null);
  useLayoutEffect(
    () => () => {
      if (glRef.current) {
        releaseContext(glRef.current.gl);
        trackContext(-1);
        glRef.current = null;
      }
    },
    [],
  );
  // a new function each render: HtmlInCanvas then requests a paint for every frame (progress changes even if children don't)
  const onPaint: HtmlInCanvasOnPaint = ({canvas, elementImage}) => {
    let st = glRef.current;
    if (!st || st.canvas !== canvas || st.gl.isContextLost()) {
      if (st) {
        releaseContext(st.gl);
        trackContext(-1);
      }
      const gl = canvas.getContext('webgl2', {premultipliedAlpha: true, alpha: true, antialias: false, depth: false, preserveDrawingBuffer: true}) as WebGL2RenderingContext | null;
      if (!gl) throw new Error('InkReveal: no WebGL2 on the HtmlInCanvas surface');
      const tex = gl.createTexture();
      if (!tex) throw new Error('InkReveal: createTexture failed');
      trackContext(1);
      st = {canvas, gl, tex};
      glRef.current = st;
    }
    const {gl, tex} = st;
    const pi = getProgram(gl, FRAG_HEADER + INK_MASK_FRAG);
    gl.useProgram(pi.program);
    setUniforms(gl, pi, {
      u_res: [canvas.width, canvas.height],
      u_time: frame / fps,
      u_frame: frame,
      u_progress: progress,
      u_seed: seed,
      u_scale: canvas.width / width,
      u_mode: 2,
      ...inkUniforms(props),
    });
    const u = pi.uniforms.get('u_src');
    if (u) {
      gl.activeTexture(gl.TEXTURE0 + u.unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texElementImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, elementImage);
      gl.uniform1i(u.loc, u.unit);
    }
    drawFullscreen(gl, pi, canvas.width, canvas.height);
  };
  return (
    <HtmlInCanvas width={width} height={height} onPaint={onPaint} style={{position: 'absolute', left: 0, top: 0, opacity, ...style}}>
      {children}
    </HtmlInCanvas>
  );
};

// ---- fallback: CSS luminance mask from a (half-res) WebGL canvas + ink overlay layer ---------
const maskCanvasCache: {canvas: HTMLCanvasElement | null; gl: WebGL2RenderingContext | null} = {canvas: null, gl: null};

const InkMaskCss: React.FC<InkRevealProps & {width: number; height: number}> = (props) => {
  const {width, height, children, progress, seed = 0, opacity, style} = props;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {isRendering} = useRemotionEnvironment();
  const {delayRender, continueRender} = useDelayRender();
  // {url, v}: a fresh object per frame, so the commit (and the release below) happens even when the mask is unchanged
  const [mask, setMask] = useState<{url: string; v: number} | null>(null);
  const pending = useRef<number | null>(null);
  const version = useRef(0);
  const scale = isRendering ? 1 : 0.5;
  useLayoutEffect(() => {
    // one shared hidden context for all fallback masks on the page
    if (!maskCanvasCache.canvas || !maskCanvasCache.gl || maskCanvasCache.gl.isContextLost()) {
      const c = document.createElement('canvas');
      const g = c.getContext('webgl2', {preserveDrawingBuffer: true, antialias: false, depth: false});
      if (!g) throw new Error('InkReveal: WebGL2 unavailable');
      trackContext(1);
      maskCanvasCache.canvas = c;
      maskCanvasCache.gl = g;
    }
    const canvas = maskCanvasCache.canvas;
    const gl = maskCanvasCache.gl;
    const bw = Math.round(width * scale);
    const bh = Math.round(height * scale);
    canvas.width = bw;
    canvas.height = bh;
    const pi = getProgram(gl, FRAG_HEADER + INK_MASK_FRAG);
    gl.useProgram(pi.program);
    setUniforms(gl, pi, {u_res: [bw, bh], u_time: frame / fps, u_frame: frame, u_progress: progress, u_seed: seed, u_scale: scale, u_mode: 0, ...inkUniforms(props)});
    drawFullscreen(gl, pi, bw, bh);
    const next = canvas.toDataURL('image/jpeg', 0.92);
    // hold the frame until the mask image is decoded, so the CSS mask is never stale
    const handle = delayRender('ink mask decode');
    if (pending.current !== null) continueRender(pending.current);
    pending.current = handle;
    const v = ++version.current;
    const im = new Image();
    im.src = next;
    im.decode()
      .catch(() => undefined)
      .then(() => setMask({url: next, v}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, frame, width, height, seed, scale, JSON.stringify(inkUniforms(props))]);
  useLayoutEffect(() => {
    if (mask && mask.v === version.current && pending.current !== null) {
      const h = pending.current;
      pending.current = null;
      // one more rAF so the new mask is painted before capture
      requestAnimationFrame(() => continueRender(h));
    }
  }, [mask, continueRender]);
  const url = mask?.url ?? null;
  return (
    <div style={{position: 'absolute', left: 0, top: 0, width, height, opacity, ...style}}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          maskImage: url ? `url(${url})` : 'linear-gradient(black, black)',
          WebkitMaskImage: url ? `url(${url})` : undefined,
          maskMode: 'luminance',
          maskSize: '100% 100%',
          WebkitMaskSize: '100% 100%',
          visibility: url ? 'visible' : 'hidden',
        }}
      >
        {children}
      </div>
      <ShaderLayer frag={INK_MASK_FRAG} progress={progress} seed={seed} width={width} height={height} uniforms={{...inkUniforms(props), u_mode: 1}} />
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// TransitionSeries presentation: the entering scene bleeds in over the exiting one.
//   <TransitionSeries.Transition presentation={inkBleed({origin: [0.3, 0.6]})} timing={linearTiming({durationInFrames: 36})} />

export type InkBleedProps = Omit<InkRevealProps, 'progress' | 'mode' | 'children' | 'width' | 'height' | 'style'>;

const InkBleedPresentation: React.FC<TransitionPresentationComponentProps<InkBleedProps>> = ({children, presentationDirection, presentationProgress, passedProps}) => {
  if (presentationDirection === 'exiting') return <AbsoluteFill>{children}</AbsoluteFill>;
  return (
    <AbsoluteFill>
      <InkReveal {...passedProps} mode="mask" progress={presentationProgress}>
        <AbsoluteFill>{children}</AbsoluteFill>
      </InkReveal>
    </AbsoluteFill>
  );
};

export const inkBleed = (props: InkBleedProps = {}): TransitionPresentation<InkBleedProps> => ({
  component: InkBleedPresentation,
  props,
});
