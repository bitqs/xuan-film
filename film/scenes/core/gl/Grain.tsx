import React from 'react';
import {ShaderLayer, ShaderLayerProps} from './ShaderLayer';
import {GLSL_GRAIN, GLSL_HASH} from './glsl';

export type GrainProps = {
  /** 0..1 (0.3 = subtle, 0.6 = filmic, 1 = heavy). */
  intensity?: number;
  /** Grain clump size in px (1 = per-pixel, 1.5 = 16mm-ish). */
  size?: number;
  /** Refresh rate of the grain pattern: 15 (default, even 2-frame hold) or 30 (every frame). Avoid 24 on a 30 fps timeline (uneven 4-in-5 cadence). */
  fps?: number;
  /** Faint colour noise on top of the luminance grain (0..1). */
  chroma?: number;
  /**
   * 'signed' (default): lightens toward white / darkens toward black with normal blending — visible on both dark and light scenes.
   * 'overlay': 50%-grey noise with mix-blend-mode overlay — strongest in mid-tones, invisible in deep blacks.
   */
  mode?: 'signed' | 'overlay';
  seed?: number;
  style?: React.CSSProperties;
  /** Benchmark hook: called after each draw (see ShaderLayer). */
  onDraw?: ShaderLayerProps['onDraw'];
};

const FRAG = /* glsl */ `
${GLSL_HASH}
${GLSL_GRAIN}
uniform float u_intensity, u_size, u_step, u_chroma, u_mode;
void main() {
  float gf = floor(u_frame / max(u_step, 1.0));
  float g = grainAt(gl_FragCoord.xy, gf, u_seed, u_size * u_scale);
  vec3 hc = hashPix(gl_FragCoord.xy, gf, u_seed + 5.0) - 0.5;
  if (u_mode > 0.5) {
    vec3 v = 0.5 + (g * 0.16 + hc * 0.08 * u_chroma) * u_intensity;
    fragColor = vec4(clamp(v, 0.0, 1.0), 1.0);
    return;
  }
  float v = g * 0.085 * u_intensity;
  vec3 c = v >= 0.0 ? vec3(1.0) : vec3(0.0);
  c += hc * u_chroma * 0.6;
  float a = clamp(abs(v), 0.0, 1.0);
  fragColor = vec4(clamp(c, 0.0, 1.0) * a, a);
}
`;

/** Standalone animated film grain overlay (both worlds). Put it last in the scene. */
export const Grain: React.FC<GrainProps> = ({intensity = 0.4, size = 1.3, fps = 15, chroma = 0.15, mode = 'signed', seed = 0, style, onDraw}) => (
  <ShaderLayer
    frag={FRAG}
    seed={seed}
    onDraw={onDraw}
    blend={mode === 'overlay' ? 'overlay' : undefined}
    style={style}
    uniforms={{u_intensity: intensity, u_size: size, u_step: 30 / Math.max(1, fps), u_chroma: chroma, u_mode: mode === 'overlay' ? 1 : 0}}
  />
);
