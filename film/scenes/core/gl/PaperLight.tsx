import React from 'react';
import {ShaderLayer, ShaderLayerProps} from './ShaderLayer';
import {GLSL_COLOR, GLSL_GRAIN, GLSL_HASH, GLSL_NOISE} from './glsl';

export type PaperLightProps = {
  /** Key-light position in CSS fractions (default top-left, slightly off-frame). */
  lightPos?: [number, number];
  /** Key-light strength 0..1: how much darker the paper gets away from the light (and how warm the lit area is). */
  light?: number;
  /** Corner falloff strength 0..1 (multiplies toward `shade`). */
  vignette?: number;
  /** Paper fibre streaks 0..1. */
  fiber?: number;
  /** Low-frequency paper cloudiness 0..1. */
  mottle?: number;
  /** Animated grain 0..1. */
  grain?: number;
  /** Grain clump size in px. */
  grainSize?: number;
  /** Grain refresh rate: 15 (default, even 2-frame hold) or 30 (every frame). Avoid 24 on a 30 fps timeline (uneven 4-in-5 cadence). */
  grainFps?: number;
  /** Slow drift of the key light (0 = static, 1 = gentle breathing). */
  drift?: number;
  tint?: string;
  shade?: string;
  seed?: number;
  opacity?: number;
  style?: React.CSSProperties;
  /** Benchmark hook: called after each draw (see ShaderLayer). */
  onDraw?: ShaderLayerProps['onDraw'];
};

// Light map, composited with mix-blend-mode: multiply (paper albedo x irradiance): ink stays black,
// the paper gets a warm key-light falloff, darker warm corners, fibres, cloudiness and grain.
const FRAG = /* glsl */ `
${GLSL_HASH}
${GLSL_NOISE}
${GLSL_COLOR}
${GLSL_GRAIN}
uniform vec2 u_lightPos;
uniform float u_light, u_vignette, u_fiber, u_mottle, u_grain, u_grainSize, u_grainStep, u_drift;
uniform vec3 u_tint, u_shade;
void main() {
  vec2 cres = u_res / u_scale;
  vec2 px = fragCSS();
  float asp = cres.x / cres.y;
  vec2 p = px / cres.y;
  float t = u_time * u_drift;
  // broad soft key light, slowly breathing
  vec2 k = (u_lightPos + 0.02 * vec2(sin(t * 0.21), cos(t * 0.17))) * vec2(asp, 1.0);
  vec2 dk = (p - k) * vec2(0.62, 1.0);
  float key = exp(-dot(dk, dk) * 0.75) * (1.0 + 0.03 * sin(t * 0.37));
  // corners fall off (a touch heavier at the bottom, like a desk shadow)
  vec2 q = (px / cres - 0.5) * vec2(asp, 1.0);
  float vig = smoothstep(0.3, 1.15, length(q * vec2(0.84, 1.1) + vec2(0.0, -0.05)));
  // paper: short curly fibres + cloudiness (static, like the sheet itself)
  float fib = 0.0;
  {
    vec2 fq = (p + u_seed * 3.1) * 34.0;
    vec2 id = floor(fq), fr = fract(fq);
    for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 cid = id + vec2(float(i), float(j));
      vec4 h = hash42(cid + 5.0);
      if (h.w > 0.55) continue;
      vec2 c = vec2(float(i), float(j)) + h.xy;
      float ang = h.z * 6.2831;
      vec2 dir = vec2(cos(ang), sin(ang)), perp = vec2(-dir.y, dir.x);
      float len = 0.25 + 0.5 * h.w;
      float tt = clamp(dot(fr - c, dir), -len, len);
      vec2 cl = c + dir * tt + perp * (hash12(cid * 3.3) - 0.5) * 2.0 * tt * tt;
      fib = max(fib, (1.0 - smoothstep(0.006, 0.03, length(fr - cl))) * (1.0 - smoothstep(len * 0.6, len, abs(tt))));
    }
  }
  float mot = fbm3o(p * 2.2 + u_seed * 1.7) + 0.5 * fbm3o(p * 9.0 + 4.0);
  float gf = floor(u_frame / max(u_grainStep, 1.0));
  float g = grainAt(gl_FragCoord.xy, gf, u_seed, u_grainSize * u_scale);
  // irradiance: 1.0 under the key light, falling off; warm where lit, warm-dark in the corners
  float lit = 1.0 - 0.2 * u_light * (1.0 - key);
  vec3 L = mix(vec3(1.0), u_tint, key * u_light) * lit;
  L *= mix(vec3(1.0), u_shade, vig * u_vignette);
  L *= 1.0 - 0.05 * u_fiber * fib;
  L *= 1.0 - 0.03 * u_mottle * (0.5 - 0.5 * mot);
  L *= 0.97 + 0.03 * u_grain * g;
  L += (hashPix(gl_FragCoord.xy, gf, u_seed + 9.0).x - 0.5) / 255.0;
  fragColor = vec4(clamp(L, 0.0, 1.0), 1.0);
}
`;

/**
 * Paper-world overlay: warm key light + corner falloff + paper fibres/cloudiness + animated grain, one cheap
 * pass composited with mix-blend-mode: multiply (ink stays black, paper gets lit). Put it on top of paper scenes.
 */
export const PaperLight: React.FC<PaperLightProps> = ({
  lightPos = [0.12, -0.05],
  light = 0.6,
  vignette = 0.55,
  fiber = 0.5,
  mottle = 0.6,
  grain = 0.6,
  grainSize = 1.3,
  grainFps = 15,
  drift = 1,
  tint = '#FFF8EC',
  shade = '#C9BCA8',
  seed = 0,
  opacity,
  style,
  onDraw,
}) => (
  <ShaderLayer
    frag={FRAG}
    seed={seed}
    opacity={opacity}
    blend="multiply"
    style={style}
    onDraw={onDraw}
    uniforms={{
      u_lightPos: lightPos,
      u_light: light,
      u_vignette: vignette,
      u_fiber: fiber,
      u_mottle: mottle,
      u_grain: grain,
      u_grainSize: grainSize,
      u_grainStep: 30 / Math.max(1, grainFps),
      u_drift: drift,
      u_tint: tint,
      u_shade: shade,
    }}
  />
);
