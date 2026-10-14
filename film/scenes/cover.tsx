// 封面：就一个「选」字（用户要求）。fmt: 3x4 / 4x3 / 9x16。导演后面再细化。
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useFonts} from './core/fonts';
import {Backdrop, PAL, SERIF_BLACK} from './core/look';

export const Cover: React.FC<{fmt: '3x4' | '4x3' | '9x16'}> = ({fmt}) => {
  useFonts();
  const s = fmt === '4x3' ? 760 : fmt === '3x4' ? 820 : 900;
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
      <Backdrop light={[0.5, 0.5]} />
      <div style={{fontFamily: SERIF_BLACK, fontSize: s, lineHeight: 1, color: 'transparent', backgroundImage: `linear-gradient(180deg, #FFF6DC 0%, ${PAL.gold} 45%, ${PAL.amber} 100%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', filter: 'drop-shadow(0 0 60px rgba(255,200,120,.45))'}}>选</div>
    </AbsoluteFill>
  );
};
