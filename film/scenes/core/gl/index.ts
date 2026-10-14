// GL toolkit for v7 — see README.md in this folder.
//   import {MindSpace, InkReveal, inkBleed, PaperLight, Grain, Stage3D, Card3D, PaperSheet3D, ThoughtParticles, particleTimeline} from '@ep/scenes/core/gl';

// 2D shader layers (raw WebGL2)
export {ShaderLayer, useGLImage, loadImage} from './ShaderLayer';
export type {ShaderLayerProps} from './ShaderLayer';
export {MindSpace} from './MindSpace';
export type {MindSpaceProps} from './MindSpace';
export {InkReveal, inkBleed, INK_FIELD_GLSL} from './InkReveal';
export type {InkRevealProps, InkOrigin, InkBleedProps} from './InkReveal';
export {PaperLight} from './PaperLight';
export type {PaperLightProps} from './PaperLight';
export {Grain} from './Grain';
export type {GrainProps} from './Grain';

// 3D (@remotion/three + three r186)
export {Stage3D} from './Stage3D';
export type {Stage3DProps, CameraSpec, LightSpec, ShadowCatcherSpec} from './Stage3D';
export {Card3D, PaperSheet3D} from './Paper3D';
export type {Card3DProps, PaperSheet3DProps} from './Paper3D';
export {ThoughtParticles, particleTimeline, sampleTextPoints, focusDistance} from './ThoughtParticles';
export type {ThoughtParticlesProps, ParticleState, ParticleKey} from './ThoughtParticles';
export {loadTextTexture, useTextTexture} from './textTexture';
export type {TextTextureOptions, TextTextureResult} from './textTexture';
export {useThreeTexture, useAsyncResource, useAsync3D, mulberry32, makeNoise3} from './three-utils';
export type {Vec3, ImageTextureOptions} from './three-utils';

// low level
export {GLSL_HASH, GLSL_NOISE, GLSL_COLOR, GLSL_GRAIN} from './glsl';
export {FRAG_HEADER, VERT_FULLSCREEN, getProgram, setUniforms, drawFullscreen, getTexture, hexToRgb, glRendererInfo, liveContexts} from './gl-core';
export type {UniformInput, TextureInput, TexSource} from './gl-core';
