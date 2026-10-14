// Shared GLSL ES 3.00 snippets. Concatenate into a ShaderLayer `frag` string:
//   const frag = `${GLSL_HASH}${GLSL_NOISE}\nvoid main(){ ... }`;
// Everything here is pure math on (coords, seed, time): bit-stable across frames and tabs.

/** Hashes. `pcg3d` is an integer hash (bit-exact on every GPU); the float ones are Dave Hoskins' "hash without sine". */
export const GLSL_HASH = /* glsl */ `
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
// uniform [0,1) from integer pixel coords + frame + seed
vec3 hashPix(vec2 fragCoord, float frame, float seed) {
  uvec3 h = pcg3d(uvec3(uint(max(fragCoord.x, 0.0)), uint(max(fragCoord.y, 0.0)), uint(max(frame, 0.0)) * 7919u + uint(max(seed, 0.0) * 1013.0)));
  return vec3(h) * (1.0 / 4294967296.0);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * .1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
vec4 hash42(vec2 p) {
  vec4 p4 = fract(vec4(p.xyxy) * vec4(.1031, .1030, .0973, .1099));
  p4 += dot(p4, p4.wzxy + 33.33);
  return fract((p4.xxyz + p4.yzzw) * p4.zywx);
}
`;

/** Gradient noise (2D/3D, range ~[-1,1]), value noise, fbm, rotation helpers. Needs GLSL_HASH. */
export const GLSL_NOISE = /* glsl */ `
vec2 grad2(vec2 i) { vec2 h = hash22(i) * 6.2831853; return vec2(cos(h.x), sin(h.x)); }
float gnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(grad2(i), f);
  float b = dot(grad2(i + vec2(1, 0)), f - vec2(1, 0));
  float c = dot(grad2(i + vec2(0, 1)), f - vec2(0, 1));
  float d = dot(grad2(i + vec2(1, 1)), f - vec2(1, 1));
  return 1.4142 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
vec3 grad3(vec3 i) { return normalize(hash33(i) * 2.0 - 1.0 + 1e-4); }
float gnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = dot(grad3(i), f);
  float n100 = dot(grad3(i + vec3(1, 0, 0)), f - vec3(1, 0, 0));
  float n010 = dot(grad3(i + vec3(0, 1, 0)), f - vec3(0, 1, 0));
  float n110 = dot(grad3(i + vec3(1, 1, 0)), f - vec3(1, 1, 0));
  float n001 = dot(grad3(i + vec3(0, 0, 1)), f - vec3(0, 0, 1));
  float n101 = dot(grad3(i + vec3(1, 0, 1)), f - vec3(1, 0, 1));
  float n011 = dot(grad3(i + vec3(0, 1, 1)), f - vec3(0, 1, 1));
  float n111 = dot(grad3(i + vec3(1, 1, 1)), f - vec3(1, 1, 1));
  return 1.6 * mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y), mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}
const mat2 ROT2 = mat2(0.80, 0.60, -0.60, 0.80);
float fbm(vec2 p) {            // 5 octaves, ~[-1,1]
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * gnoise(p); p = ROT2 * p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
float fbm3o(vec2 p) {          // 3 octaves, cheaper
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * gnoise(p); p = ROT2 * p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
float fbmT(vec3 p) {           // 4 octaves of 3D noise (z = time)
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * gnoise3(p); p = vec3(ROT2 * p.xy, p.z * 1.3) * 2.02 + 11.7; a *= 0.5; }
  return s;
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
`;

/** sRGB <-> linear and small color helpers. */
export const GLSL_COLOR = /* glsl */ `
vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSRGB(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
// subtle triangular dither (+-1 LSB) against banding in dark gradients
vec3 dither8(vec2 fragCoord, float frame, float seed) {
  vec3 h = hashPix(fragCoord, frame, seed + 3.0);
  vec3 h2 = hashPix(fragCoord + 1031.0, frame, seed + 7.0);
  return (h + h2 - 1.0) / 255.0;
}
`;

/** Film grain value in [-1,1]-ish; `size` in device px (1 = per-pixel). Needs GLSL_HASH. */
export const GLSL_GRAIN = /* glsl */ `
float grainAt(vec2 fragCoord, float frame, float seed, float size) {
  vec2 c = fragCoord / max(size, 1.0);
  vec2 i = floor(c), f = fract(c);
  vec2 u = f * f * (3.0 - 2.0 * f);
  // bilinear-smoothed per-cell gaussian-ish noise (sum of 2 uniforms) -> filmic clumps when size > 1
  float a = hashPix(i, frame, seed).x + hashPix(i, frame, seed).y;
  float b = hashPix(i + vec2(1, 0), frame, seed).x + hashPix(i + vec2(1, 0), frame, seed).y;
  float cc = hashPix(i + vec2(0, 1), frame, seed).x + hashPix(i + vec2(0, 1), frame, seed).y;
  float d = hashPix(i + vec2(1, 1), frame, seed).x + hashPix(i + vec2(1, 1), frame, seed).y;
  float n = mix(mix(a, b, u.x), mix(cc, d, u.x), u.y);
  return (n - 1.0) * 1.7;
}
`;
