// 封面底图入口（独立打包）。
import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {CoverGlyph} from '../scenes/coverglyph';

const Root: React.FC = () => (
  <>
    <Composition id="CoverGlyph" component={CoverGlyph} durationInFrames={1} fps={30} width={1080} height={1920} defaultProps={{dom: 0.5}} />
    <Composition id="CoverGlyphNoDom" component={CoverGlyph} durationInFrames={1} fps={30} width={1080} height={1920} defaultProps={{dom: 0}} />
    <Composition id="CoverGlyphSmall" component={CoverGlyph} durationInFrames={1} fps={30} width={1080} height={1920} defaultProps={{dom: 0.5, size: 620, y: 70}} />
  </>
);
registerRoot(Root);
