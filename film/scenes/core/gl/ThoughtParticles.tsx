import React, {useLayoutEffect, useMemo} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import {useThree} from '@react-three/fiber';
import '@kit/fonts';
import {FONT_HEAVY} from '@kit/theme';
import {makeNoise3, mulberry32, useAsync3D, Vec3} from './three-utils';

export type ParticleState = 'cloud' | 'text' | 'disperse';

export type ThoughtParticlesProps = {
  /** String for the 'text' state (from the locked script). */
  text?: string;
  /** Font family used to sample the glyphs (default 'SHS Heavy'). */
  font?: string;
  from?: 'cloud' | 'text';
  to?: ParticleState;
  /** 0..1, driven by the caller (e.g. interpolate(frame, ...)). */
  progress?: number;
  /** Number of particles (6k..20k). Default 16000. */
  count?: number;
  /** Main colour (sRGB hex) and a sparse accent colour for cloud particles. */
  color?: string;
  accent?: string;
  accentRatio?: number;
  /** Tint of the glow halos (default: halfway between color and accent = warm). */
  haloColor?: string;
  /** Point size in px for a particle 10 world units from the camera (scales with 1/distance). */
  size?: number;
  seed?: number;
  /** Width of the text block in world units. */
  textWidth?: number;
  textPosition?: Vec3;
  /** Cloud ellipsoid radii and centre (world units). */
  cloudRadius?: Vec3;
  cloudCenter?: Vec3;
  /** Cloud flow speed multiplier. */
  drift?: number;
  /** 0..0.9: how spread out in time the particles start (0 = all together). */
  stagger?: number;
  /** Sideways arc while travelling (0 = straight lines). */
  swirl?: number;
  /** Disperse: direction x strength (world units at progress 1). */
  wind?: Vec3;
  /** Distance from the camera that is in focus (default: camera -> textPosition, updated every frame). */
  focus?: number;
  /** Depth-of-field blur, px of blur per world unit of defocus. */
  aperture?: number;
  /** Overall brightness multiplier. */
  intensity?: number;
  /** Brightness of particles in the text state (additive, >1 saturates the glyph cores). */
  textBrightness?: number;
  /** Strength of each particle's faint wide halo (cheap bloom). 0 = crisp dots. */
  bloom?: number;
  /** Cloud state: share of bright 'thought motes' (0..1) and brightness of the remaining dust (0..1). */
  motes?: number;
  dust?: number;
  opacity?: number;
  /** Seconds override (default frame / fps). */
  time?: number;
  position?: Vec3;
  rotation?: Vec3;
};

const STATE = {cloud: 0, text: 1, disperse: 2} as const;

// ---- glyph sampling: text -> offscreen canvas -> filled pixels -> N seeded points on a plane ----
export const sampleTextPoints = async (text: string, font: string, count: number, seed: number, width: number): Promise<Float32Array> => {
  const fs = 240;
  await document.fonts.load(`${fs}px '${font}'`, text);
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = `${fs}px '${font}'`;
  const tw = Math.ceil(probe.measureText(text).width + fs * 0.5);
  const th = Math.ceil(fs * 1.5);
  const c = document.createElement('canvas');
  c.width = tw;
  c.height = th;
  const ctx = c.getContext('2d', {willReadFrequently: true})!;
  ctx.font = `${fs}px '${font}'`;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, tw / 2, th / 2);
  const data = ctx.getImageData(0, 0, tw, th).data;
  const filled: number[] = [];
  const edges: number[] = [];
  let x0 = tw, x1 = 0, y0 = th, y1 = 0;
  const A = (x: number, y: number) => (x < 0 || y < 0 || x >= tw || y >= th ? 0 : data[(y * tw + x) * 4 + 3]);
  for (let y = 0; y < th; y++)
    for (let x = 0; x < tw; x++) {
      if (A(x, y) > 120) {
        const k = y * tw + x;
        // edge pixel: some empty pixel within 2px
        let edge = false;
        for (let dy = -2; dy <= 2 && !edge; dy++) for (let dx = -2; dx <= 2 && !edge; dx++) if (A(x + dx, y + dy) <= 120) edge = true;
        (edge ? edges : filled).push(k);
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  if (!filled.length && !edges.length) throw new Error(`ThoughtParticles: nothing rendered for "${text}" (font missing?)`);
  const rnd = mulberry32(seed * 7.31 + 11);
  const out = new Float32Array(count * 4);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const s = width / Math.max(1, x1 - x0);
  // ~28% of the particles trace the outlines (crisp, light-drawn edges), the rest fill the strokes evenly
  const nEdge = edges.length ? Math.round(count * 0.28) : 0;
  const pick = (pool: number[], n: number, offset: number, isEdge: number) => {
    const P = pool.slice();
    for (let i = 0; i < n; i++) {
      const k = i % P.length;
      const j = k + Math.floor(rnd() * (P.length - k));
      const tmp = P[k];
      P[k] = P[j];
      P[j] = tmp;
      const p = P[k];
      const o = (offset + i) * 4;
      out[o] = ((p % tw) + rnd() - cx) * s;
      out[o + 1] = -(Math.floor(p / tw) + rnd() - cy) * s;
      out[o + 2] = (rnd() - 0.5) * 0.05;
      out[o + 3] = isEdge;
    }
  };
  pick(edges.length ? edges : filled, nEdge, 0, 1);
  pick(filled.length ? filled : edges, count - nEdge, nEdge, 0);
  // interleave deterministically so any prefix of particles still covers the glyphs
  const shuffled = new Float32Array(count * 4);
  const order = Array.from({length: count}, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  for (let i = 0; i < count; i++) shuffled.set(out.subarray(order[i] * 4, order[i] * 4 + 4), i * 4);
  return shuffled;
  return out;
};

const NOISE = /* glsl */ `
// Ashima / Stefan Gustavson 3D simplex noise (MIT)
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
// divergence-free flow field (finite-difference curl of three decorrelated noise fields)
vec3 curlNoise(vec3 p) {
  const float e = 0.12;
  vec3 dx = vec3(e, 0.0, 0.0), dy = vec3(0.0, e, 0.0), dz = vec3(0.0, 0.0, e);
  vec3 q1 = p + vec3(31.4, 0.0, 0.0), q2 = p + vec3(0.0, 47.2, 0.0), q3 = p + vec3(0.0, 0.0, 83.9);
  float x = (snoise(q3 + dy) - snoise(q3 - dy)) - (snoise(q2 + dz) - snoise(q2 - dz));
  float y = (snoise(q1 + dz) - snoise(q1 - dz)) - (snoise(q3 + dx) - snoise(q3 - dx));
  float z = (snoise(q2 + dx) - snoise(q2 - dx)) - (snoise(q1 + dy) - snoise(q1 - dy));
  return vec3(x, y, z) / (2.0 * e);
}
`;

const VERT = /* glsl */ `
uniform float uTime, uProgress, uFrom, uTo, uStagger, uSwirl, uSize, uAperture, uFocus, uDrift, uOpacity, uTextHalfW, uAccentRatio, uIntensity, uTextBright, uMotes, uDust;
uniform vec3 uWind, uCloudCenter, uTextCenter, uColor, uAccent;
attribute vec4 aText;   // xyz = glyph position, w = 1 on outlines
attribute vec3 aDir;
attribute vec4 aRand;
varying vec3 vColor;
varying float vAlpha;
varying float vBlur;
varying float vSprite;
varying float vCore;
varying float vBlurD;
${NOISE}
vec3 cloudPos(float t) {
  vec3 p = position;
  float ang = t * 0.045 * uDrift;
  float c = cos(ang), s = sin(ang);
  p.xz = mat2(c, -s, s, c) * p.xz;
  p += curlNoise(position * 0.26 + vec3(0.0, 0.0, t * 0.055 * uDrift)) * 0.55;
  return p + uCloudCenter;
}
vec3 textPos(float t) {
  vec3 p = aText.xyz + uTextCenter;
  p += 0.008 * vec3(sin(t * 1.7 + aRand.z * 40.0), cos(t * 1.3 + aRand.w * 40.0), 0.0);
  return p;
}
vec3 statePos(float s, float t) { return s < 0.5 ? cloudPos(t) : textPos(t); }
float isMote() { return step(1.0 - uMotes, aRand.y); }   // a few brighter, bigger 'thought motes'
float stateSize(float s) { return s < 0.5 ? mix(0.5 + 0.6 * aRand.y, 2.2 + 1.2 * aRand.z, isMote()) : (0.85 + 0.3 * aRand.y); }
float stateText(float s) { return (s > 0.5 && s < 1.5) ? 1.0 : 0.0; }
float easeInOut(float x) { return x < 0.5 ? 4.0 * x * x * x : 1.0 - pow(-2.0 * x + 2.0, 3.0) * 0.5; }

void main() {
  float t = uTime;
  vec3 A = statePos(uFrom, t);
  float lr = clamp(aText.x / max(2.0 * uTextHalfW, 1e-3) + 0.5, 0.0, 1.0);
  float involvesText = max(stateText(uFrom), stateText(uTo));
  float order = mix(aRand.x, mix(aRand.x, lr, 0.62), involvesText);
  float lp = clamp((uProgress - uStagger * order) / max(1.0 - uStagger, 1e-3), 0.0, 1.0);
  float e = easeInOut(lp);
  vec3 pos;
  float alpha = 1.0;
  float sz;
  float textness;
  if (uTo > 1.5) {
    // blown away: accelerate along the wind, spread, turbulence grows, fade out
    float k = lp;
    vec3 w = uWind * (0.5 + 0.9 * aRand.y);
    pos = A + w * (k * k) + aDir * (k * 1.1) + curlNoise(A * 0.4 + vec3(t * 0.08)) * (k * 1.3);
    alpha = 1.0 - smoothstep(0.25, 0.95, k * (0.75 + 0.5 * aRand.w));
    sz = stateSize(uFrom) * (1.0 - 0.35 * k);
    textness = stateText(uFrom) * (1.0 - smoothstep(0.0, 0.4, k));
  } else {
    vec3 B = statePos(uTo, t);
    float d = length(B - A);
    vec3 side = normalize(aDir + 0.7 * curlNoise(A * 0.3 + 3.7) * 0.3);
    pos = mix(A, B, e) + side * (uSwirl * sin(3.14159 * e) * (0.22 * d + 0.25));
    sz = mix(stateSize(uFrom), stateSize(uTo), e);
    textness = mix(stateText(uFrom), stateText(uTo), e);
  }
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  float depth = max(-mv.z, 0.05);
  float coc = abs(depth - uFocus) * uAperture;          // defocus blur diameter, px
  float base = uSize * sz * 10.0 / depth;               // in-focus core diameter, px (uSize = px at distance 10)
  float blurD = base + coc;
  float S = max(blurD, base * 4.0) + 2.0;               // sprite covers the halo too
  gl_PointSize = S;
  vSprite = S;
  vCore = base;
  vBlurD = blurD;
  vBlur = smoothstep(0.0, 1.0, coc / (base + coc + 1e-3));
  float tw = 0.72 + 0.28 * sin(t * (0.9 + 1.6 * aRand.z) + aRand.w * 6.2831);
  float sparkle = (0.55 + 0.6 * aRand.z) * (1.0 + 0.35 * aText.w) * (0.9 + 0.1 * sin(t * 2.3 + aRand.w * 40.0));
  float bright = mix(tw * mix(uDust * (0.6 + 0.4 * aRand.z), 1.0, isMote()), uTextBright * sparkle, textness);
  vAlpha = alpha * bright * uOpacity * uIntensity;
  vColor = mix((aRand.w < uAccentRatio) ? uAccent : uColor, uColor, textness);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform float uHalo;
uniform vec3 uHaloColor;
varying vec3 vColor;
varying float vAlpha;
varying float vBlur;
varying float vSprite;
varying float vCore;
varying float vBlurD;
void main() {
  float rpx = length(gl_PointCoord * 2.0 - 1.0) * vSprite * 0.5;   // px from the centre
  if (rpx > vSprite * 0.5) discard;
  // in focus: tight gaussian core + faint wide halo (sums into a soft bloom around dense glyphs)
  float sig = max(vCore * 0.3, 0.55);
  float core = exp(-rpx * rpx / (2.0 * sig * sig));
  float hs = max(vCore * 1.15, 1.2);
  float halo = exp(-rpx * rpx / (2.0 * hs * hs)) * uHalo;
  // out of focus: lens disc (slightly brighter rim), energy spread over its area
  float R = max(vBlurD * 0.5, 0.5);
  float disc = (1.0 - smoothstep(R - 1.0, R + 0.3, rpx)) * (0.7 + 0.3 * smoothstep(0.35 * R, R, rpx));
  float discE = disc * min(1.0, 2.2 * sig * sig / (R * R));
  float h = halo * (1.0 - vBlur);
  float c = mix(core, discE, vBlur);
  gl_FragColor = vec4((vColor * c + uHaloColor * h) * vAlpha, 1.0);
}
`;

/**
 * Glowing thought particles morphing cloud -> text -> disperse. Additive light that leaves the canvas
 * alpha untouched, so on a transparent <Stage3D> it adds onto whatever DOM/shader is underneath.
 * Deterministic: positions are pure functions of (seed, time, progress).
 */
export const ThoughtParticles: React.FC<ThoughtParticlesProps> = ({
  text = '',
  font = FONT_HEAVY,
  from = 'cloud',
  to = 'text',
  progress = 0,
  count = 16000,
  color = '#F3EEE2',
  accent = '#F2C98A',
  accentRatio = 0.1,
  haloColor,
  size = 3.0,
  seed = 1,
  textWidth = 7,
  textPosition = [0, 0, 0],
  cloudRadius = [4.6, 2.4, 2.8],
  cloudCenter = [0, 0, 0],
  drift = 1,
  stagger = 0.45,
  swirl = 1,
  wind = [6, 2.2, -2.5],
  focus,
  aperture = 2.4,
  intensity = 1,
  textBrightness = 0.85,
  bloom = 0.12,
  motes = 0.04,
  dust = 0.3,
  opacity = 1,
  time,
  position,
  rotation,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const camera = useThree((st) => st.camera);
  const t = time ?? frame / fps;
  const needText = (from === 'text' || to === 'text') && text.length > 0;
  const textPts = useAsync3D(needText ? `tp|${text}|${font}|${count}|${seed}|${textWidth}` : null, () => sampleTextPoints(text, font, count, seed, textWidth));

  const geom = useMemo(() => {
    const rnd = mulberry32(seed);
    const density = makeNoise3(seed);
    const pos = new Float32Array(count * 3);
    const dir = new Float32Array(count * 3);
    const rr = new Float32Array(count * 4);
    const gauss = () => Math.sqrt(-2 * Math.log(Math.max(rnd(), 1e-7))) * Math.cos(2 * Math.PI * rnd());
    for (let i = 0; i < count; i++) {
      // nebula: gaussian-ish volume, thinned by an fbm density field -> clumps and wisps instead of a uniform starfield
      let x = 0, y = 0, z = 0;
      for (let tries = 0; tries < 24; tries++) {
        if (rnd() < 0.8) {
          x = gauss() * 0.42;
          y = gauss() * 0.42;
          z = gauss() * 0.42;
        } else {
          const th = rnd() * Math.PI * 2;
          const u = rnd() * 2 - 1;
          const r = Math.cbrt(rnd());
          const q = Math.sqrt(1 - u * u);
          x = r * q * Math.cos(th);
          y = r * q * Math.sin(th);
          z = r * u;
        }
        const d = density(x * 2.2 + 3, y * 2.2 + 7, z * 2.2 + 11, 3);
        const keep = Math.pow(Math.min(1, Math.max(0, (d - 0.3) / 0.45)), 2.2);
        if (rnd() < keep) break;
      }
      pos[i * 3] = x * cloudRadius[0];
      pos[i * 3 + 1] = y * cloudRadius[1];
      pos[i * 3 + 2] = z * cloudRadius[2];
      const th2 = rnd() * Math.PI * 2;
      const u2 = rnd() * 2 - 1;
      const q2 = Math.sqrt(1 - u2 * u2);
      dir[i * 3] = q2 * Math.cos(th2);
      dir[i * 3 + 1] = q2 * Math.sin(th2);
      dir[i * 3 + 2] = u2;
      rr[i * 4] = rnd();
      rr[i * 4 + 1] = rnd();
      rr[i * 4 + 2] = rnd();
      rr[i * 4 + 3] = rnd();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rr, 4));
    g.setAttribute('aText', new THREE.BufferAttribute(new Float32Array(count * 4), 4));
    return g;
  }, [count, seed, cloudRadius[0], cloudRadius[1], cloudRadius[2]]);
  useLayoutEffect(() => () => geom.dispose(), [geom]);

  useLayoutEffect(() => {
    const a = geom.attributes.aText as THREE.BufferAttribute;
    if (textPts) (a.array as Float32Array).set(textPts);
    else (a.array as Float32Array).fill(0);
    a.needsUpdate = true;
  }, [geom, textPts]);

  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
        uniforms: {
          uTime: {value: 0},
          uProgress: {value: 0},
          uFrom: {value: 0},
          uTo: {value: 1},
          uStagger: {value: 0.45},
          uSwirl: {value: 1},
          uSize: {value: 3},
          uAperture: {value: 2.4},
          uFocus: {value: 10},
          uDrift: {value: 1},
          uOpacity: {value: 1},
          uIntensity: {value: 1},
          uTextBright: {value: 1},
          uMotes: {value: 0.04},
          uDust: {value: 0.3},
          uHalo: {value: 0.1},
          uHaloColor: {value: new THREE.Color()},
          uTextHalfW: {value: 3.5},
          uAccentRatio: {value: 0.1},
          uWind: {value: new THREE.Vector3()},
          uCloudCenter: {value: new THREE.Vector3()},
          uTextCenter: {value: new THREE.Vector3()},
          uColor: {value: new THREE.Color()},
          uAccent: {value: new THREE.Color()},
        },
      }),
    [],
  );
  useLayoutEffect(() => () => mat.dispose(), [mat]);

  // uniforms for this frame (layout effect: before @remotion/three's advance draws)
  useLayoutEffect(() => {
    const u = mat.uniforms;
    u.uTime.value = t;
    u.uProgress.value = Math.min(1, Math.max(0, progress));
    u.uFrom.value = STATE[from];
    u.uTo.value = STATE[to];
    u.uStagger.value = Math.min(0.9, Math.max(0, stagger));
    u.uSwirl.value = swirl;
    u.uSize.value = size;
    u.uAperture.value = aperture;
    // Stage3D's CameraRig updated the camera earlier in this same commit
    const tp = new THREE.Vector3(textPosition[0], textPosition[1], textPosition[2]);
    if (position) tp.add(new THREE.Vector3(position[0], position[1], position[2]));
    u.uFocus.value = focus ?? camera.position.distanceTo(tp);
    u.uDrift.value = drift;
    u.uOpacity.value = opacity;
    u.uIntensity.value = intensity;
    u.uTextBright.value = textBrightness;
    u.uMotes.value = motes;
    u.uDust.value = dust;
    u.uHalo.value = bloom;
    u.uTextHalfW.value = textWidth / 2;
    u.uAccentRatio.value = accentRatio;
    (u.uWind.value as THREE.Vector3).set(wind[0], wind[1], wind[2]);
    (u.uCloudCenter.value as THREE.Vector3).set(cloudCenter[0], cloudCenter[1], cloudCenter[2]);
    (u.uTextCenter.value as THREE.Vector3).set(textPosition[0], textPosition[1], textPosition[2]);
    // colours stay in sRGB: the shader writes display values directly (no tone mapping / colour management)
    (u.uColor.value as THREE.Color).setRGB(...hexRGB(color));
    (u.uAccent.value as THREE.Color).setRGB(...hexRGB(accent));
    const hc = hexRGB(color);
    const ac = hexRGB(haloColor ?? accent);
    (u.uHaloColor.value as THREE.Color).setRGB((hc[0] + ac[0]) / 2, (hc[1] + ac[1]) / 2, (hc[2] + ac[2]) / 2);
  });

  return <points geometry={geom} material={mat} frustumCulled={false} position={position} rotation={rotation} />;
};

const hexRGB = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
};

/** Focus helper: the camera distance to a point (pass as `focus`). */
export const focusDistance = (camera: Vec3, point: Vec3) => Math.hypot(camera[0] - point[0], camera[1] - point[1], camera[2] - point[2]);

export type ParticleKey = {state: ParticleState; at: number; dur: number};

/**
 * Sequence helper: start in `initial`, then morph into each key's state over [at, at + dur) frames.
 * Returns {from, to, progress} to spread into <ThoughtParticles/>.
 *   particleTimeline(frame, 'cloud', [{state: 'text', at: 30, dur: 70}, {state: 'disperse', at: 125, dur: 55}])
 */
export const particleTimeline = (frame: number, initial: 'cloud' | 'text', keys: ParticleKey[]): {from: 'cloud' | 'text'; to: ParticleState; progress: number} => {
  let cur: 'cloud' | 'text' = initial;
  for (const k of keys) {
    if (frame < k.at) return {from: cur, to: cur, progress: 0};
    if (frame < k.at + k.dur) return {from: cur, to: k.state, progress: (frame - k.at) / k.dur};
    if (k.state === 'disperse') return {from: cur, to: 'disperse', progress: 1};
    cur = k.state;
  }
  return {from: cur, to: cur, progress: 0};
};
