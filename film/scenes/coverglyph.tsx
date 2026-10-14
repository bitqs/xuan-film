// 封面底图：一个巨大的「选」，由全书 34952 个字拼成（和片头/片尾同一个「选」），背后是很淡的整本书一页。
// 渲 9:16（2× = 2160×3840），再由 tools/covers.py 裁/拼成 3:4、4:3、9:16。
import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {useFonts} from './core/fonts';
import {Backdrop, PAL, Vignette} from './core/look';
import {hex} from './core/anim';
import {GlyphCanvas, GlyphLayer, MaskText, N_BOOK, camZ, hash01, maskTargets, noise3, usePage, useGState, useTextMask} from './core/glyph';

const N = N_BOOK;
export const CoverGlyph: React.FC<{dom?: number; size?: number; y?: number}> = ({dom = 0.5, size = 900, y: ty = 70}) => {
  useFonts();
  const st = useGState();
  const bg = useGState();
  const page = usePage();
  const mask = useTextMask('选', {size, y: ty});
  const T = useMemo(() => (mask ? maskTargets(mask, N, 23, 1.2) : null), [mask]);
  if (!T) return <Backdrop light={[0.5, 0.45]} />;
  const G = hex(PAL.gold);
  const HI = hex(PAL.goldHi);
  for (let i = 0; i < N; i++) {
    const h = hash01(i, 3);
    // 「选」：大部分字贴着笔画，少数几颗被「吹」出笔画外（星屑）
    const fly = h > 0.965 ? (h - 0.965) / 0.035 : 0;
    const x = T[i * 3];
    const y = T[i * 3 + 1];
    const ang = noise3(x / 300, y / 300, 1.7, 5) * Math.PI * 2;
    st.pos[i * 3] = x + Math.cos(ang) * fly * 260 * (size / 900);
    st.pos[i * 3 + 1] = y + (Math.sin(ang) * fly * 260 + fly * 120) * (size / 900);
    st.pos[i * 3 + 2] = fly * 300;
    st.size[i] = 5 + 9 * h * h * h + fly * 6;
    const k = 0.55 + 0.45 * hash01(i, 6);
    st.col[i * 4] = G[0] + (HI[0] - G[0]) * k;
    st.col[i * 4 + 1] = G[1] + (HI[1] - G[1]) * k;
    st.col[i * 4 + 2] = G[2] + (HI[2] - G[2]) * k;
    st.col[i * 4 + 3] = (0.5 + 0.5 * h) * (1 - fly * 0.4);
    st.halo[i] = 0.8 + 2 * h;
    // 背景：整本书一页，很淡
    bg.pos[i * 3] = page.pos[i * 3] * 1.06;
    bg.pos[i * 3 + 1] = page.pos[i * 3 + 1] * 1.06;
    bg.pos[i * 3 + 2] = -320;
    bg.size[i] = page.cell * 1.02;
    bg.halo[i] = 0;
    bg.col[i * 4] = G[0];
    bg.col[i * 4 + 1] = G[1];
    bg.col[i * 4 + 2] = G[2];
    bg.col[i * 4 + 3] = 0.075 * (0.6 + 0.8 * hash01(i, 8));
  }
  return (
    <AbsoluteFill>
      <Backdrop light={[0.5, 0.45]} glow={1.35} />
      <GlyphCanvas camera={{pos: [0, 0, camZ()]}}>
        <GlyphLayer state={bg} glow={0.2} />
        <GlyphLayer state={st} glow={0.6} halo={0.2} haloSize={3.2} renderOrder={4} />
      </GlyphCanvas>
      <MaskText text="选" size={size} y={ty} opacity={dom} />
      <Vignette amount={0.45} />
    </AbsoluteFill>
  );
};
