import React, {useLayoutEffect, useMemo} from 'react';
import {staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import {useThreeTexture, Vec3} from './three-utils';
import {TextTextureOptions, useTextTexture} from './textTexture';

const PAPER = 'assets/tex-paper.jpg';

type Transform = {position?: Vec3; rotation?: Vec3; scale?: number | Vec3};

// ---------------------------------------------------------------------------------------------
// Card3D: thin rounded paper card (extruded rounded rect, bevelled edges), paper-textured faces,
// optional text / image on the front, casts + receives soft shadows.

export type Card3DProps = Transform & {
  width?: number;
  height?: number;
  depth?: number;
  radius?: number;
  /** Paper tint multiplied with the texture. */
  color?: string;
  /** true = assets/tex-paper.jpg, string = another staticFile path, false = flat colour. */
  paper?: boolean | string;
  /** Text on the front face (rendered with textTexture at 2x). */
  text?: TextTextureOptions;
  /** Image (staticFile path) on the front face. */
  image?: string;
  /** Any texture for the front face (e.g. a CanvasTexture you drew); wins over text/image. */
  map?: THREE.Texture;
  /** Front content size relative to the card face (0..1, default 0.86); content keeps its aspect ratio. */
  contentScale?: number;
  contentOffset?: [number, number];
  roughness?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  opacity?: number;
  children?: React.ReactNode;
};

const roundedRect = (w: number, h: number, r: number) => {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
};

const cardGeometry = (w: number, h: number, d: number, r: number) => {
  const bevel = Math.min(d * 0.35, 0.012);
  const uv = {
    generateTopUV: (_g: THREE.ExtrudeGeometry, v: number[], a: number, b: number, c: number) =>
      [a, b, c].map((i) => new THREE.Vector2((v[i * 3] + w / 2) / w, (v[i * 3 + 1] + h / 2) / h)),
    generateSideWallUV: (_g: THREE.ExtrudeGeometry, v: number[], a: number, b: number, c: number, dd: number) => {
      const P = (i: number) => [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]];
      const [A, B, C, D] = [P(a), P(b), P(c), P(dd)];
      const useX = Math.abs(A[1] - B[1]) < Math.abs(A[0] - B[0]);
      return [A, B, C, D].map((p) => new THREE.Vector2(useX ? p[0] : p[1], 1 - p[2]));
    },
  };
  const g = new THREE.ExtrudeGeometry(roundedRect(w, h, r), {
    depth: d - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 10,
    UVGenerator: uv as unknown as THREE.UVGenerator,
  });
  g.translate(0, 0, -(d - bevel * 2) / 2);
  g.computeVertexNormals();
  return g;
};

const useContent = (text?: TextTextureOptions, image?: string, map?: THREE.Texture) => {
  const tt = useTextTexture(text ?? null);
  const img = useThreeTexture(image ? staticFile(image) : null);
  if (map) {
    const el = map.image as {width?: number; height?: number; naturalWidth?: number; naturalHeight?: number} | undefined;
    const w = el?.naturalWidth ?? el?.width ?? 1;
    const h = el?.naturalHeight ?? el?.height ?? 1;
    return {map, aspect: w / h};
  }
  if (tt) return {map: tt.texture, aspect: tt.aspect};
  if (img) {
    const el = img.image as HTMLImageElement;
    return {map: img, aspect: el.naturalWidth / el.naturalHeight};
  }
  return null;
};

const fit = (aspect: number, boxW: number, boxH: number): [number, number] => (aspect > boxW / boxH ? [boxW, boxW / aspect] : [boxH * aspect, boxH]);

// content window on a displaced surface: discard outside the texture's 0..1 UV range (no edge smearing)
const clipToUV = (sh: {fragmentShader: string}) => {
  sh.fragmentShader = sh.fragmentShader.replace(
    '#include <map_fragment>',
    ['if (vMapUv.x < 0.0 || vMapUv.x > 1.0 || vMapUv.y < 0.0 || vMapUv.y > 1.0) discard;', '#include <map_fragment>'].join(String.fromCharCode(10)),
  );
};
const clipKey = () => 'uv-clip';

export const Card3D: React.FC<Card3DProps> = ({
  width = 3.2,
  height = 2,
  depth = 0.03,
  radius = 0.07,
  color = '#F3EEE2',
  paper = true,
  text,
  image,
  map,
  contentScale = 0.86,
  contentOffset = [0, 0],
  roughness = 0.86,
  castShadow = true,
  receiveShadow = true,
  opacity = 1,
  position,
  rotation,
  scale,
  children,
}) => {
  const geo = useMemo(() => cardGeometry(width, height, depth, radius), [width, height, depth, radius]);
  useLayoutEffect(() => () => geo.dispose(), [geo]);
  const paperTex = useThreeTexture(paper ? staticFile(typeof paper === 'string' ? paper : PAPER) : null);
  const content = useContent(text, image, map);
  const transparent = opacity < 1;
  const [cw, ch] = content ? fit(content.aspect, width * contentScale, height * contentScale) : [0, 0];
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh geometry={geo} castShadow={castShadow} receiveShadow={receiveShadow}>
        <meshStandardMaterial attach="material-0" color={color} map={paperTex ?? null} roughness={roughness} metalness={0} transparent={transparent} opacity={opacity} />
        <meshStandardMaterial attach="material-1" color={new THREE.Color(color).multiplyScalar(0.9)} roughness={0.95} metalness={0} transparent={transparent} opacity={opacity} />
      </mesh>
      {content ? (
        <mesh position={[contentOffset[0], contentOffset[1], depth / 2 + 0.0015]}>
          <planeGeometry args={[cw, ch]} />
          <meshStandardMaterial map={content.map} transparent opacity={opacity} roughness={0.7} metalness={0} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      ) : null}
      {children}
    </group>
  );
};

// ---------------------------------------------------------------------------------------------
// PaperSheet3D: a sheet with gentle curl/corner lift/ripple (CPU vertex displacement, deterministic),
// paper texture + optional content layer that follows the same surface.

export type PaperSheet3DProps = Transform & {
  width?: number;
  height?: number;
  segments?: [number, number];
  /** Cylindrical cupping across the width (0..1). Negative curls the other way. */
  curl?: number;
  /** Lift of the bottom-right corner (0..1), like a page about to be turned. */
  cornerLift?: number;
  /** Gentle travelling ripple (0..1). */
  wave?: number;
  /** Seconds for the ripple (default frame / fps). */
  time?: number;
  seed?: number;
  color?: string;
  paper?: boolean | string;
  text?: TextTextureOptions;
  image?: string;
  /** Any texture laid onto the curved surface (wins over text/image). */
  map?: THREE.Texture;
  contentScale?: number;
  contentOffset?: [number, number];
  roughness?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  opacity?: number;
  children?: React.ReactNode;
};

export const PaperSheet3D: React.FC<PaperSheet3DProps> = ({
  width = 3,
  height = 4.24,
  segments = [40, 56],
  curl = 0.25,
  cornerLift = 0,
  wave = 0.3,
  time,
  seed = 0,
  color = '#F3EEE2',
  paper = true,
  text,
  image,
  map,
  contentScale = 0.8,
  contentOffset = [0, 0],
  roughness = 0.9,
  castShadow = true,
  receiveShadow = true,
  opacity = 1,
  position,
  rotation,
  scale,
  children,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = time ?? frame / fps;
  const geo = useMemo(() => new THREE.PlaneGeometry(width, height, segments[0], segments[1]), [width, height, segments[0], segments[1]]);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array as Float32Array), [geo]);
  useLayoutEffect(() => () => geo.dispose(), [geo]);
  const paperTex = useThreeTexture(paper ? staticFile(typeof paper === 'string' ? paper : PAPER) : null);
  const content = useContent(text, image, map);

  // displace every render (i.e. every frame) before @remotion/three draws
  useLayoutEffect(() => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const hw = width / 2;
    const hh = height / 2;
    const ph = seed * 1.7;
    for (let i = 0; i < arr.length; i += 3) {
      const xn = base[i] / hw;
      const yn = base[i + 1] / hh;
      let z = curl * 0.09 * width * xn * xn;
      const c = Math.max(0, (xn - yn) / 2 - 0.35) / 0.65; // 0 .. 1 toward the bottom-right corner
      z += cornerLift * 0.45 * width * c * c * (0.8 + 0.2 * c);
      z += wave * 0.012 * width * (Math.sin(xn * 2.3 + yn * 1.6 + t * 0.9 + ph) * Math.cos(yn * 2.8 - t * 0.7 + ph * 0.5) + 0.5 * Math.sin(xn * 5.1 - yn * 3.7 + t * 1.3 + ph * 2.0) * 0.4);
      arr[i + 2] = z;
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  });

  const transparent = opacity < 1;
  const [cw, ch] = content ? fit(content.aspect, width * contentScale, height * contentScale) : [0, 0];
  // content drawn on the same displaced surface: a UV window over the sheet
  const contentMap = useMemo(() => {
    if (!content) return null;
    const m = content.map.clone();
    m.needsUpdate = true;
    const rx = cw / width;
    const ry = ch / height;
    m.repeat.set(1 / rx, 1 / ry);
    m.offset.set(0.5 - (0.5 + contentOffset[0] / width) / rx, 0.5 - (0.5 + contentOffset[1] / height) / ry);
    m.wrapS = m.wrapT = THREE.ClampToEdgeWrapping;
    return m;
  }, [content, cw, ch, width, height, contentOffset[0], contentOffset[1]]);
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh geometry={geo} castShadow={castShadow} receiveShadow={receiveShadow}>
        <meshStandardMaterial color={color} map={paperTex ?? null} roughness={roughness} metalness={0} side={THREE.DoubleSide} transparent={transparent} opacity={opacity} />
      </mesh>
      {contentMap ? (
        <mesh geometry={geo}>
          <meshStandardMaterial
            map={contentMap}
            transparent
            opacity={opacity}
            roughness={0.75}
            metalness={0}
            side={THREE.DoubleSide}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-2}
            onBeforeCompile={clipToUV}
            customProgramCacheKey={clipKey}
          />
        </mesh>
      ) : null}
      {children}
    </group>
  );
};
