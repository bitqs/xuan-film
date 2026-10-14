import React from 'react';
import {Composition} from 'remotion';
import {makeScenePreview, makeVideo, TAIL} from './scenes/Video';
import {SCENES, TOTAL_FRAMES, toF} from './scenes/core/timeline';
import {Cover} from './scenes/cover';

const Main = makeVideo();
const MainNoSubs = makeVideo({subtitles: false});
const PREVIEWS = SCENES.map((d) => ({id: d.id, C: makeScenePreview(d.id), dur: toF(d.end) - toF(d.start) + TAIL}));

export const Root: React.FC = () => (
  <>
    <Composition id="Xuan" component={Main} durationInFrames={TOTAL_FRAMES} fps={30} width={1080} height={1920} />
    <Composition id="XuanNoSubs" component={MainNoSubs} durationInFrames={TOTAL_FRAMES} fps={30} width={1080} height={1920} />
    {PREVIEWS.map((p) => (
      <Composition key={p.id} id={'S-' + p.id} component={p.C} durationInFrames={p.dur} fps={30} width={1080} height={1920} />
    ))}
    <Composition id="Cover3x4" component={Cover} durationInFrames={1} fps={30} width={1080} height={1440} defaultProps={{fmt: '3x4'}} />
    <Composition id="Cover4x3" component={Cover} durationInFrames={1} fps={30} width={1440} height={1080} defaultProps={{fmt: '4x3'}} />
    <Composition id="Cover9x16" component={Cover} durationInFrames={1} fps={30} width={1080} height={1920} defaultProps={{fmt: '9x16'}} />
  </>
);
