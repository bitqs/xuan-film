import React, {useLayoutEffect, useRef, useState} from 'react';
import {useCurrentFrame, useDelayRender, useVideoConfig} from 'remotion';
import {
  FRAG_HEADER,
  UniformInput,
  drawFullscreen,
  getProgram,
  releaseContext,
  setUniforms,
  trackContext,
} from './gl-core';

export type ShaderLayerProps = {
  /** GLSL ES 3.00 fragment code WITHOUT the header (see FRAG_HEADER in gl-core): declare your own uniforms + `void main()`, write PREMULTIPLIED rgba to `fragColor`. */
  frag: string;
  /** Custom uniforms, matched to GLSL declarations by name (numbers, arrays, '#rrggbb', textures). */
  uniforms?: Record<string, UniformInput>;
  /** -> u_progress (default 0). */
  progress?: number;
  /** Override u_time in seconds (default frame / fps). */
  time?: number;
  /** -> u_seed (default 0). */
  seed?: number;
  /** Drawing-buffer scale relative to CSS size (0.5 = quarter the pixels, upscaled by the compositor). Default 1. */
  resolution?: number;
  /** CSS size, default = composition size. The layer is absolutely positioned at 0,0 unless `style` says otherwise. */
  width?: number;
  height?: number;
  /** CSS mix-blend-mode of the canvas (e.g. 'soft-light', 'overlay', 'screen', 'multiply'). */
  blend?: React.CSSProperties['mixBlendMode'];
  opacity?: number;
  style?: React.CSSProperties;
  className?: string;
  /** Called after each draw with the CPU time spent (ms) — for benchmarks. */
  onDraw?: (info: {ms: number; canvas: HTMLCanvasElement; gl: WebGL2RenderingContext}) => void;
};

type Ctx = {canvas: HTMLCanvasElement; gl: WebGL2RenderingContext};

/**
 * One fullscreen fragment shader rendered into its own WebGL2 canvas, redrawn synchronously for the
 * current frame (in a layout effect, i.e. inside the same React commit Remotion waits for), with
 * preserveDrawingBuffer so the captured pixels are always the latest draw.
 *
 * The context lives as long as the component is mounted (reused across frames), is released with
 * WEBGL_lose_context on unmount, and is transparently re-created if Chrome drops it.
 */
export const ShaderLayer: React.FC<ShaderLayerProps> = ({
  frag,
  uniforms,
  progress = 0,
  time,
  seed = 0,
  resolution = 1,
  width,
  height,
  blend,
  opacity,
  style,
  className,
  onDraw,
}) => {
  const frame = useCurrentFrame();
  const {fps, width: compW, height: compH} = useVideoConfig();
  const w = width ?? compW;
  const h = height ?? compH;
  const bw = Math.max(1, Math.round(w * resolution));
  const bh = Math.max(1, Math.round(h * resolution));
  const hostRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<Ctx | null>(null);

  useLayoutEffect(
    () => () => {
      const c = ctxRef.current;
      if (c) {
        releaseContext(c.gl);
        c.canvas.remove();
        trackContext(-1);
        ctxRef.current = null;
      }
    },
    [],
  );

  // Runs after every render (every frame): draw synchronously.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let c = ctxRef.current;
    if (c && c.gl.isContextLost()) {
      c.canvas.remove();
      trackContext(-1);
      c = null;
    }
    if (!c) {
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block;';
      host.appendChild(canvas);
      const gl = canvas.getContext('webgl2', {
        alpha: true,
        premultipliedAlpha: true,
        preserveDrawingBuffer: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance',
      });
      if (!gl) throw new Error('ShaderLayer: WebGL2 is not available in this browser');
      canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
      trackContext(1);
      c = {canvas, gl};
      ctxRef.current = c;
    }
    const {canvas, gl} = c;
    const t0 = performance.now();
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    const pi = getProgram(gl, FRAG_HEADER + frag);
    gl.useProgram(pi.program);
    setUniforms(gl, pi, {
      u_res: [bw, bh],
      u_time: time ?? frame / fps,
      u_frame: frame,
      u_progress: progress,
      u_seed: seed,
      u_scale: resolution,
      ...uniforms,
    });
    drawFullscreen(gl, pi, bw, bh);
    onDraw?.({ms: performance.now() - t0, canvas, gl});
  });

  return (
    <div
      ref={hostRef}
      className={className}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: w,
        height: h,
        pointerEvents: 'none',
        mixBlendMode: blend,
        opacity,
        ...style,
      }}
    />
  );
};

// ---------------------------------------------------------------------------------------------
// Image loading for textures: decoded once per URL per page, frame held while loading.

const imgCache = new Map<string, HTMLImageElement>();
const imgPending = new Map<string, Promise<HTMLImageElement>>();

export const loadImage = (src: string): Promise<HTMLImageElement> => {
  const hit = imgCache.get(src);
  if (hit) return Promise.resolve(hit);
  let p = imgPending.get(src);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.src = src;
      im.decode()
        .then(() => {
          imgCache.set(src, im);
          resolve(im);
        })
        .catch((e) => reject(new Error(`gl: failed to load ${src}: ${e}`)));
    });
    imgPending.set(src, p);
  }
  return p;
};

/** Returns the decoded image (null while loading; the render is held with delayRender until it is ready and committed). */
export const useGLImage = (src: string | null | undefined): HTMLImageElement | null => {
  const {delayRender, continueRender, cancelRender} = useDelayRender();
  const [img, setImg] = useState<HTMLImageElement | null>(() => (src ? imgCache.get(src) ?? null : null));
  const handleRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (!src) return;
    const cached = imgCache.get(src);
    if (cached) {
      if (cached !== img) setImg(cached);
      return;
    }
    const handle = delayRender(`gl image ${src}`);
    handleRef.current = handle;
    let alive = true;
    loadImage(src)
      .then((im) => {
        if (alive) setImg(im);
        else continueRender(handle);
      })
      .catch((e) => cancelRender(e));
    return () => {
      alive = false;
      if (handleRef.current === handle) {
        continueRender(handle);
        handleRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);
  // release the hold only after the render that uses the image has been committed (children drew already)
  useLayoutEffect(() => {
    if (img && handleRef.current !== null) {
      continueRender(handleRef.current);
      handleRef.current = null;
    }
  }, [img, continueRender]);
  return img;
};
