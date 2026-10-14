import React, {useEffect, useLayoutEffect, useMemo} from 'react';
import {useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import type {Vec3} from './three-utils';

export type CameraSpec = {
  position?: Vec3;
  target?: Vec3;
  /** Vertical field of view in degrees (default 35 = gentle, "long lens" look). */
  fov?: number;
  near?: number;
  far?: number;
  up?: Vec3;
  /** Roll around the view axis, degrees. */
  roll?: number;
};

export type LightSpec = {position?: Vec3; intensity?: number; color?: string};

export type ShadowCatcherSpec = {
  /** Plane position/rotation. Default: a backdrop in the XY plane at z = -0.6 facing the camera (shadows land on "the paper"). */
  position?: Vec3;
  rotation?: Vec3;
  size?: number;
  opacity?: number;
  color?: string;
};

export type Stage3DProps = {
  children?: React.ReactNode;
  width?: number;
  height?: number;
  /** Animate by passing values computed from the frame. */
  camera?: CameraSpec;
  /** Transparent canvas to overlay DOM (paper world). Default true. */
  transparent?: boolean;
  /** Clear colour when not transparent. */
  background?: string;
  /** Default 'neutral' (Khronos PBR Neutral: keeps the paper/ink palette true). 'aces' = filmic contrast but shifts reds to salmon and greys paper. */
  toneMapping?: 'aces' | 'agx' | 'neutral' | 'none';
  exposure?: number;
  /** 'vsm' (default: smooth soft shadows, blurred by shadowRadius) | 'pcf' (three r186: 5-tap Vogel PCF, dithery at large radii) | false. */
  shadows?: false | 'pcf' | 'vsm';
  shadowRadius?: number;
  shadowMapSize?: number;
  /** Extent of the key light's shadow camera (world units, half-size). */
  shadowExtent?: number;
  /** Warm key (top-left, front), cool fill (right), optional rim (behind). Pass false to disable. */
  keyLight?: LightSpec | false;
  fillLight?: LightSpec | false;
  rimLight?: LightSpec | false;
  /** Hemisphere (sky/ground) light intensity. */
  ambient?: number;
  /** Soft studio reflections from three's RoomEnvironment (good on paper/plastic). */
  environment?: 'room' | 'none';
  envIntensity?: number;
  /** Invisible plane that only shows shadows (for overlays on the DOM paper). */
  shadowCatcher?: ShadowCatcherSpec | false;
  antialias?: boolean;
  dpr?: number;
  blend?: React.CSSProperties['mixBlendMode'];
  style?: React.CSSProperties;
};

const TONE: Record<NonNullable<Stage3DProps['toneMapping']>, THREE.ToneMapping> = {
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
  none: THREE.NoToneMapping,
};

const RendererSettings: React.FC<{toneMapping: THREE.ToneMapping; exposure: number; transparent: boolean; background: string}> = ({toneMapping, exposure, transparent, background}) => {
  const gl = useThree((s) => s.gl);
  useLayoutEffect(() => {
    gl.toneMapping = toneMapping;
    gl.toneMappingExposure = exposure;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    if (transparent) gl.setClearColor(0x000000, 0);
    else gl.setClearColor(new THREE.Color(background), 1);
  });
  return null;
};

const CameraRig: React.FC<Required<Pick<CameraSpec, 'position' | 'target' | 'fov' | 'near' | 'far' | 'up' | 'roll'>>> = ({position, target, fov, near, far, up, roll}) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  // layout effect: runs in the same commit as @remotion/three's frame advance, before it draws
  useLayoutEffect(() => {
    camera.position.set(position[0], position[1], position[2]);
    camera.up.set(up[0], up[1], up[2]);
    camera.fov = fov;
    camera.near = near;
    camera.far = far;
    camera.lookAt(target[0], target[1], target[2]);
    if (roll) camera.rotateZ((roll * Math.PI) / 180);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  });
  return null;
};

const RoomEnv: React.FC<{intensity: number}> = ({intensity}) => {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const rt = useMemo(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pm.fromScene(room, 0.04);
    room.dispose();
    pm.dispose();
    return target;
  }, [gl]);
  useLayoutEffect(() => {
    scene.environment = rt.texture;
    scene.environmentIntensity = intensity;
  });
  useEffect(
    () => () => {
      scene.environment = null;
      rt.dispose();
    },
    [rt, scene],
  );
  return null;
};

const ShadowCatcher: React.FC<ShadowCatcherSpec> = ({position = [0, 0, -0.6], rotation = [0, 0, 0], size = 40, opacity = 0.24, color = '#2A1E12'}) => (
  <mesh position={position} rotation={rotation} receiveShadow>
    <planeGeometry args={[size, size]} />
    <shadowMaterial transparent opacity={opacity} color={color} depthWrite={false} />
  </mesh>
);

/**
 * ThreeCanvas with film-ish defaults: sRGB output, ACES tone mapping, soft shadows, warm key + cool fill
 * (+ optional rim), studio environment, camera driven by props (compute them from the frame).
 * Children are regular r3f JSX. Animate with useCurrentFrame() inside, or props from outside.
 * Don't use useFrame for animation (not deterministic under Remotion).
 */
export const Stage3D: React.FC<Stage3DProps> = ({
  children,
  width,
  height,
  camera = {},
  transparent = true,
  background = '#EDE6D6',
  toneMapping = 'neutral',
  exposure = 1,
  shadows = 'vsm',
  shadowRadius = 16,
  shadowMapSize = 2048,
  shadowExtent = 8,
  keyLight = {},
  fillLight = {},
  rimLight = false,
  ambient = 0.55,
  environment = 'room',
  envIntensity = 0.35,
  shadowCatcher = false,
  antialias = true,
  dpr = 1,
  blend,
  style,
}) => {
  const {width: compW, height: compH} = useVideoConfig();
  const w = width ?? compW;
  const h = height ?? compH;
  const cam = {
    position: camera.position ?? ([0, 0, 10] as Vec3),
    target: camera.target ?? ([0, 0, 0] as Vec3),
    fov: camera.fov ?? 35,
    near: camera.near ?? 0.1,
    far: camera.far ?? 200,
    up: camera.up ?? ([0, 1, 0] as Vec3),
    roll: camera.roll ?? 0,
  };
  const key = keyLight ? {position: [-3.5, 5.5, 9] as Vec3, intensity: 2.3, color: '#FFF1DC', ...keyLight} : null;
  const fill = fillLight ? {position: [6, 1.5, 5] as Vec3, intensity: 0.5, color: '#E6ECF4', ...fillLight} : null;
  const rim = rimLight ? {position: [1, 4, -7] as Vec3, intensity: 1.2, color: '#FFFFFF', ...rimLight} : null;
  const e = shadowExtent;
  return (
    <ThreeCanvas
      width={w}
      height={h}
      dpr={dpr}
      linear={false}
      flat={toneMapping === 'none'}
      shadows={shadows ? {enabled: true, type: shadows === 'vsm' ? THREE.VSMShadowMap : THREE.PCFShadowMap} : false}
      camera={{position: cam.position, fov: cam.fov, near: cam.near, far: cam.far}}
      gl={{antialias, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance'}}
      style={{position: 'absolute', left: 0, top: 0, pointerEvents: 'none', mixBlendMode: blend, ...style}}
    >
      <RendererSettings toneMapping={TONE[toneMapping]} exposure={exposure} transparent={transparent} background={background} />
      <CameraRig {...cam} />
      {environment === 'room' ? <RoomEnv intensity={envIntensity} /> : null}
      {ambient > 0 ? <hemisphereLight args={['#FFF7EA', '#B9AC93', ambient]} /> : null}
      {key ? (
        <directionalLight
          position={key.position}
          intensity={key.intensity}
          color={key.color}
          castShadow={!!shadows}
          shadow-mapSize={[shadowMapSize, shadowMapSize]}
          shadow-radius={shadowRadius}
          shadow-blurSamples={16}
          shadow-bias={-0.0004}
          shadow-normalBias={0.02}
          shadow-camera-left={-e}
          shadow-camera-right={e}
          shadow-camera-top={e}
          shadow-camera-bottom={-e}
          shadow-camera-near={0.5}
          shadow-camera-far={60}
        />
      ) : null}
      {fill ? <directionalLight position={fill.position} intensity={fill.intensity} color={fill.color} /> : null}
      {rim ? <directionalLight position={rim.position} intensity={rim.intensity} color={rim.color} /> : null}
      {shadowCatcher ? <ShadowCatcher {...shadowCatcher} /> : null}
      {children}
    </ThreeCanvas>
  );
};
