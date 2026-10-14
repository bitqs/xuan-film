import React from 'react';
import {ShaderLayer, ShaderLayerProps} from './ShaderLayer';
import {GLSL_COLOR, GLSL_GRAIN, GLSL_HASH, GLSL_NOISE} from './glsl';

export type MindSpaceProps = {
  /** Fog density/visibility, 0 = clear gradient only, 1 = default, 2 = heavy. */
  intensity?: number;
  /** Speed multiplier for fog + dust motion (1 = calm default, 0 = frozen). */
  drift?: number;
  /** 0..1: share of warm (paper-white/amber) dust and warm tint in the fog. */
  warmth?: number;
  /** Dust density multiplier (0 = none, 1 = default sparse, 2 = busy). */
  dust?: number;
  /** Where the faint light pool sits, CSS fractions [x, y]. */
  light?: [number, number];
  /** 0..1 strength of the light pool. */
  glow?: number;
  /** Film grain strength (baked in; 0 = off). */
  grain?: number;
  /** Vignette strength 0..1. */
  vignette?: number;
  seed?: number;
  /** Optional time override in seconds (e.g. to slow/freeze a section). */
  time?: number;
  /** Colors (sRGB hex). */
  top?: string;
  bottom?: string;
  fog?: string;
  warm?: string;
  cool?: string;
  opacity?: number;
  style?: React.CSSProperties;
  /** Benchmark hook: called after each draw (see ShaderLayer). */
  onDraw?: ShaderLayerProps['onDraw'];
};

const FRAG = /* glsl */ `
${GLSL_HASH}
${GLSL_NOISE}
${GLSL_COLOR}
${GLSL_GRAIN}
uniform float u_intensity, u_drift, u_warmth, u_dust, u_glow, u_grain, u_vignette;
uniform vec2 u_light;
uniform vec3 u_top, u_bottom, u_fog, u_warm, u_cool;

// one dust/bokeh layer. p: centred coords in frame-height units (y down). blur: 0 = crisp disc, 1 = gaussian mote.
vec3 dustLayer(vec2 p, float t, float layer, float scale, float density, float rMin, float rMax,
               float blur, float bright, vec2 vel, float halo, float lightAmt) {
  vec2 pp = p * scale + vel * t * scale + vec2(layer * 17.31, layer * 9.73) + u_seed * 3.17;
  vec2 id = floor(pp), fr = fract(pp);
  vec3 acc = vec3(0.0);
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 cid = id + vec2(float(i), float(j));
    vec4 h = hash42(cid + layer * 31.7 + u_seed * 0.131);
    if (h.x > density) continue;
    vec2 h2 = hash22(cid * 1.37 + layer * 5.1 + 2.0);
    vec2 wob = 0.10 * vec2(sin(t * (0.13 + 0.22 * h.y) + 6.2831 * h.z), cos(t * (0.11 + 0.19 * h.w) + 6.2831 * h.y));
    vec2 c = vec2(float(i), float(j)) + 0.2 + 0.6 * h2 + wob;
    float d = length(fr - c) / scale;               // frame-height units
    float r = mix(rMin, rMax, h.y * h.y);
    // crisp-ish disc with a faint lens rim
    float e = max(0.22 * r, 0.8 / 1080.0);
    float disc = 1.0 - smoothstep(r - e, r + e * 0.3, d);
    disc *= 0.8 + 0.35 * smoothstep(r * 0.5, r, d);
    // gaussian mote
    float gm = exp(-d * d / (2.0 * r * r * 0.35));
    float a = mix(disc, gm, blur);
    a += halo * exp(-d * d / (2.0 * (r * 3.2) * (r * 3.2)));
    float tw = 0.65 + 0.35 * sin(t * (0.3 + 0.7 * h.z) + 6.2831 * h.w);
    float b = bright * (0.3 + 0.7 * h.z) * tw;
    vec3 col = (h.w < u_warmth * 0.6) ? u_warm : u_cool;
    acc += col * a * b;
  }
  return acc * (0.35 + lightAmt);
}

void main() {
  vec2 px = fragCSS();
  vec2 cres = u_res / u_scale;
  float aspect = cres.x / cres.y;
  vec2 p = (px - 0.5 * cres) / cres.y;              // y in [-.5,.5], x in [-.89,.89]
  float t = u_time * u_drift;

  // 1) deep gradient around a faint, off-screen-ish light
  vec2 lp = (u_light - 0.5) * vec2(aspect, 1.0);
  vec2 dl = (p - lp) * vec2(0.62, 1.0);
  float r2 = dot(dl, dl);
  float g = exp(-r2 * 2.4);
  vec3 col = mix(u_bottom, u_top, g);
  float light = exp(-r2 * 3.2);                     // how much the haze is lit here
  col += u_top * 0.45 * u_glow * exp(-r2 * 9.0);

  // 2) lit volumetric haze: two domain-warped layers drifting at different speeds (parallax)
  vec2 q = p * 1.05 + vec2(u_seed * 7.13, u_seed * 3.31);
  vec2 w = vec2(fbm3o(q * 0.8 + vec2(0.0, 0.035 * t)), fbm3o(q * 0.8 + vec2(5.2, 1.3) - vec2(0.028 * t, 0.0)));
  float f1 = smoothstep(-0.35, 0.75, fbm(q + 1.9 * w + vec2(0.016 * t, -0.006 * t)));
  float f2 = smoothstep(-0.05, 0.85, fbm(q * 2.7 + 2.6 * w + vec2(0.045 * t, 0.012 * t) + 7.3));
  float fog = (0.8 * f1 * f1 + 0.6 * f2 * f1) * (0.2 + 0.8 * light);
  float warmMask = smoothstep(-0.2, 0.6, fbm3o(q * 0.5 + vec2(3.1, -1.7) + 0.01 * t));
  vec3 fogCol = mix(u_fog, u_warm * 0.62, warmMask * u_warmth * 0.45);
  col = 1.0 - (1.0 - col) * (1.0 - fogCol * fog * 0.62 * u_intensity);

  // 3) depth-of-field dust: far motes (soft), mid "thought motes" (glowing), near out-of-focus bokeh
  if (u_dust > 0.0) {
    vec3 dust = vec3(0.0);
    dust += dustLayer(p, t, 1.0, 9.0, 0.16 * u_dust, 1.2 / 1080.0, 2.3 / 1080.0, 1.0, 0.34, vec2(0.004, -0.007), 0.35, light);
    dust += dustLayer(p, t, 2.0, 4.2, 0.30 * u_dust, 2.4 / 1080.0, 5.5 / 1080.0, 0.8, 0.62, vec2(0.007, -0.012), 0.5, light);
    dust += dustLayer(p, t, 3.0, 2.4, 0.55 * u_dust, 24.0 / 1080.0, 66.0 / 1080.0, 0.0, 0.15, vec2(0.012, -0.018), 0.0, light);
    col += dust;
  }

  // 4) vignette
  float v = smoothstep(1.2, 0.18, length(p * vec2(0.8, 1.18)));
  col *= mix(1.0 - 0.62 * u_vignette, 1.0, v);

  // 5) grain + dither (dark gradients band badly in h264 without it)
  float gr = grainAt(gl_FragCoord.xy, u_frame, u_seed, 1.4 * u_scale);
  col += gr * u_grain * (0.010 + 0.05 * luma(col));
  col += dither8(gl_FragCoord.xy, u_frame, u_seed);
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/**
 * Dark "mind world" background: deep blue-black gradient, slow domain-warped fog, sparse
 * depth-of-field dust (some warm), vignette, baked grain. Opaque; put it at the bottom of a scene.
 */
export const MindSpace: React.FC<MindSpaceProps> = ({
  intensity = 1,
  drift = 1,
  warmth = 0.5,
  dust = 1,
  light = [0.5, 0.36],
  glow = 0.6,
  grain = 0.5,
  vignette = 0.85,
  seed = 0,
  time,
  top = '#151B26',
  bottom = '#0B0E13',
  fog = '#3A475A',
  warm = '#F3E3C4',
  cool = '#DCE4EE',
  opacity,
  style,
  onDraw,
}) => (
  <ShaderLayer
    frag={FRAG}
    seed={seed}
    time={time}
    opacity={opacity}
    style={style}
    onDraw={onDraw}
    uniforms={{
      u_intensity: intensity,
      u_drift: drift,
      u_warmth: warmth,
      u_dust: dust,
      u_light: light,
      u_glow: glow,
      u_grain: grain,
      u_vignette: vignette,
      u_top: top,
      u_bottom: bottom,
      u_fog: fog,
      u_warm: warm,
      u_cool: cool,
    }}
  />
);
