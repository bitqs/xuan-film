// Raw WebGL2 plumbing shared by ShaderLayer / InkReveal: program cache, uniform introspection,
// texture cache, context bookkeeping. No React in here.

export type TexSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas | ImageData | HTMLVideoElement;

export type TextureInput = {
  source: TexSource;
  /** 'repeat' for tileable textures (paper), default 'clamp'. */
  wrap?: 'clamp' | 'repeat' | 'mirror';
  /** 'mipmap' (default for 'repeat') | 'linear' | 'nearest'. */
  filter?: 'linear' | 'nearest' | 'mipmap';
  /** Bump when the pixels of a canvas source changed and must be re-uploaded. */
  version?: number;
  premultiply?: boolean;
};

/**
 * Uniform values are matched to the GLSL declaration by introspection:
 * number/boolean -> float|int|bool, number[] -> vecN (or arrays of vecN), '#rrggbb' -> vec3/vec4 (sRGB 0..1),
 * TextureInput / image / canvas -> sampler2D.
 */
export type UniformInput = number | boolean | string | readonly number[] | Float32Array | TextureInput | TexSource | null | undefined;

export const VERT_FULLSCREEN = /* glsl */ `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = vec2(p.x, 1.0 - p.y); // (0,0) = top-left, like CSS / DOM images
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Prepended to every ShaderLayer fragment shader. */
export const FRAG_HEADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
in vec2 v_uv;          // 0..1, origin top-left
out vec4 fragColor;    // PREMULTIPLIED rgba
uniform vec2 u_res;     // drawing-buffer size in px
uniform float u_time;   // seconds = frame / fps (or the "time" prop)
uniform float u_frame;  // integer frame
uniform float u_progress;
uniform float u_seed;
uniform float u_scale;  // drawing-buffer px per CSS px (the "resolution" prop)
// top-left-origin pixel coordinate in CSS px of the full-res comp (resolution independent)
vec2 fragCSS() { return vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) / u_scale; }
`;

export const hexToRgb = (hex: string): [number, number, number] => {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`gl: bad color "${hex}" (expected #rrggbb)`);
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
};

type UniformInfo = {loc: WebGLUniformLocation; type: number; size: number; unit: number};
export type ProgramInfo = {program: WebGLProgram; uniforms: Map<string, UniformInfo>; vao: WebGLVertexArrayObject | null};

type CtxState = {
  programs: Map<string, ProgramInfo>;
  textures: WeakMap<object, {tex: WebGLTexture; version: number; w: number; h: number; key: string}>;
  allTextures: WebGLTexture[];
};
const states = new WeakMap<WebGL2RenderingContext, CtxState>();
const stateOf = (gl: WebGL2RenderingContext): CtxState => {
  let s = states.get(gl);
  if (!s) {
    s = {programs: new Map(), textures: new WeakMap(), allTextures: []};
    states.set(gl, s);
  }
  return s;
};

const compile = (gl: WebGL2RenderingContext, type: number, src: string) => {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('gl: createShader failed (context lost?)');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(sh) ?? '';
    const numbered = src
      .split('\n')
      .map((l, i) => `${String(i + 1).padStart(4)}| ${l}`)
      .join('\n');
    gl.deleteShader(sh);
    throw new Error(`gl: shader compile error\n${log}\n${numbered}`);
  }
  return sh;
};

/** Compile+link (cached per context by source). */
export const getProgram = (gl: WebGL2RenderingContext, frag: string, vert: string = VERT_FULLSCREEN): ProgramInfo => {
  const st = stateOf(gl);
  const key = vert + '\u0000' + frag;
  const hit = st.programs.get(key);
  if (hit) return hit;
  const vs = compile(gl, gl.VERTEX_SHADER, vert);
  const fs = compile(gl, gl.FRAGMENT_SHADER, frag);
  const program = gl.createProgram();
  if (!program) throw new Error('gl: createProgram failed');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    throw new Error(`gl: link error ${gl.getProgramInfoLog(program)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  const uniforms = new Map<string, UniformInfo>();
  const n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  let unit = 0;
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(program, i);
    if (!info) continue;
    const name = info.name.replace(/\[0\]$/, '');
    const loc = gl.getUniformLocation(program, info.name);
    if (!loc) continue;
    const isSampler = info.type === gl.SAMPLER_2D;
    uniforms.set(name, {loc, type: info.type, size: info.size, unit: isSampler ? unit++ : -1});
  }
  const vao = gl.createVertexArray();
  const pi = {program, uniforms, vao};
  st.programs.set(key, pi);
  return pi;
};

const isTexInput = (v: unknown): v is TextureInput => typeof v === 'object' && v !== null && 'source' in (v as object);
const isTexSource = (v: unknown): v is TexSource =>
  (typeof HTMLImageElement !== 'undefined' && v instanceof HTMLImageElement) ||
  (typeof HTMLCanvasElement !== 'undefined' && v instanceof HTMLCanvasElement) ||
  (typeof ImageBitmap !== 'undefined' && v instanceof ImageBitmap) ||
  (typeof OffscreenCanvas !== 'undefined' && v instanceof OffscreenCanvas) ||
  (typeof ImageData !== 'undefined' && v instanceof ImageData) ||
  (typeof HTMLVideoElement !== 'undefined' && v instanceof HTMLVideoElement);

const srcSize = (s: TexSource) => {
  if (s instanceof HTMLImageElement) return [s.naturalWidth, s.naturalHeight];
  if (typeof HTMLVideoElement !== 'undefined' && s instanceof HTMLVideoElement) return [s.videoWidth, s.videoHeight];
  return [s.width, s.height];
};

/** Upload (or reuse) a texture for `input`; returns the WebGLTexture bound to TEXTURE_2D. */
export const getTexture = (gl: WebGL2RenderingContext, input: TextureInput): WebGLTexture => {
  const st = stateOf(gl);
  const wrap = input.wrap ?? 'clamp';
  const filter = input.filter ?? (wrap === 'repeat' ? 'mipmap' : 'linear');
  const version = input.version ?? 0;
  const key = `${wrap}|${filter}|${input.premultiply ? 1 : 0}`;
  const [w, h] = srcSize(input.source);
  const hit = st.textures.get(input.source as object);
  if (hit && hit.version === version && hit.key === key && hit.w === w && hit.h === h) {
    gl.bindTexture(gl.TEXTURE_2D, hit.tex);
    return hit.tex;
  }
  const tex = hit?.tex ?? gl.createTexture();
  if (!tex) throw new Error('gl: createTexture failed');
  if (!hit) st.allTextures.push(tex);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !!input.premultiply);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, input.source as TexImageSource);
  const wr = wrap === 'repeat' ? gl.REPEAT : wrap === 'mirror' ? gl.MIRRORED_REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wr);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wr);
  if (filter === 'mipmap') {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  } else {
    const f = filter === 'nearest' ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  }
  st.textures.set(input.source as object, {tex, version, w, h, key});
  return tex;
};

/** Set every uniform the program declares from `values` (unknown names are ignored, missing ones keep their last value). */
export const setUniforms = (gl: WebGL2RenderingContext, pi: ProgramInfo, values: Record<string, UniformInput>) => {
  for (const [name, u] of pi.uniforms) {
    if (!(name in values)) continue;
    let v = values[name];
    if (v === undefined || v === null) continue;
    switch (u.type) {
      case gl.SAMPLER_2D: {
        const input: TextureInput | null = isTexInput(v) ? v : isTexSource(v) ? {source: v} : null;
        if (!input) throw new Error(`gl: uniform ${name} expects a texture`);
        gl.activeTexture(gl.TEXTURE0 + u.unit);
        getTexture(gl, input);
        gl.uniform1i(u.loc, u.unit);
        break;
      }
      case gl.FLOAT:
        if (u.size > 1) gl.uniform1fv(u.loc, v as number[]);
        else gl.uniform1f(u.loc, Number(v));
        break;
      case gl.INT:
      case gl.BOOL:
        if (u.size > 1) gl.uniform1iv(u.loc, v as number[]);
        else gl.uniform1i(u.loc, typeof v === 'boolean' ? (v ? 1 : 0) : Math.round(Number(v)));
        break;
      case gl.FLOAT_VEC2:
      case gl.FLOAT_VEC3:
      case gl.FLOAT_VEC4: {
        const n = u.type === gl.FLOAT_VEC2 ? 2 : u.type === gl.FLOAT_VEC3 ? 3 : 4;
        if (typeof v === 'string') v = n === 4 ? [...hexToRgb(v), 1] : hexToRgb(v);
        if (typeof v === 'number') v = new Array(n).fill(v);
        const arr = v as ArrayLike<number>;
        const want = n * u.size;
        const buf = new Float32Array(want);
        for (let i = 0; i < Math.min(want, arr.length); i++) buf[i] = arr[i];
        if (n === 2) gl.uniform2fv(u.loc, buf);
        else if (n === 3) gl.uniform3fv(u.loc, buf);
        else gl.uniform4fv(u.loc, buf);
        break;
      }
      case gl.FLOAT_MAT3:
        gl.uniformMatrix3fv(u.loc, false, v as number[]);
        break;
      case gl.FLOAT_MAT4:
        gl.uniformMatrix4fv(u.loc, false, v as number[]);
        break;
      default:
        break;
    }
  }
};

/** Draw a fullscreen triangle with `pi` into the currently bound framebuffer. */
export const drawFullscreen = (gl: WebGL2RenderingContext, pi: ProgramInfo, width: number, height: number, clear = true) => {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, width, height);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  if (clear) {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  gl.useProgram(pi.program);
  gl.bindVertexArray(pi.vao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
};

// ---- live-context bookkeeping (Chrome drops the oldest context beyond ~16 per page) ----
let live = 0;
let warned = false;
export const trackContext = (delta: 1 | -1) => {
  live += delta;
  if (live > 12 && !warned) {
    warned = true;
    console.warn(`[gl] ${live} live WebGL contexts on this page; Chrome starts dropping the oldest at 16. Unmount unused layers.`);
  }
  return live;
};
export const liveContexts = () => live;

export const releaseContext = (gl: WebGL2RenderingContext | null) => {
  if (!gl) return;
  const st = states.get(gl);
  if (st && !gl.isContextLost()) {
    for (const p of st.programs.values()) {
      gl.deleteProgram(p.program);
      if (p.vao) gl.deleteVertexArray(p.vao);
    }
    for (const t of st.allTextures) gl.deleteTexture(t);
  }
  states.delete(gl);
  gl.getExtension('WEBGL_lose_context')?.loseContext();
};

/** GPU/driver string, for logs and the renderer check. */
export const glRendererInfo = (gl: WebGL2RenderingContext | WebGLRenderingContext) => {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
  return `${vendor} | ${renderer}`;
};
