// 《选》总装：场景序列 + 场景间转场 + 字幕 + 颗粒 + 水印 + 声音（旁白 voice.wav + 配乐 music.wav + 各场景音效）。
import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile} from 'remotion';
import {useFonts} from './core/fonts';
import {Grain} from './core/gl/Grain';
import {PAL, Watermark} from './core/look';
import {SCENES, toF} from './core/timeline';
import {Subtitles} from './Subtitles';
import {REGISTRY} from './registry';
import {SceneBox, TAIL, makeScenePreviewMod} from './preview';

export {TAIL};
export const makeScenePreview = (id: string, subtitles = true) => makeScenePreviewMod(id, REGISTRY[id], subtitles);

export const makeVideo = (opts: {subtitles?: boolean} = {}) => {
  const hide = new Set(Object.values(REGISTRY).flatMap((m) => m.hideSubs ?? []));
  const Comp: React.FC = () => {
    useFonts();
    return (
      <AbsoluteFill style={{background: PAL.ink}}>
        {SCENES.map((def, k) => {
          const from = toF(def.start);
          const len = toF(def.end) - from + (k < SCENES.length - 1 ? TAIL : 0);
          return (
            <Sequence key={def.id} from={from} durationInFrames={len} premountFor={20} name={def.id}>
              <SceneBox def={def} mod={REGISTRY[def.id]} />
            </Sequence>
          );
        })}
        <Audio src={staticFile('voice.wav')} />
        <Audio src={staticFile('music.wav')} />
        {opts.subtitles !== false ? <Subtitles hide={hide} /> : null}
        <Grain intensity={0.22} />
        <Watermark />
      </AbsoluteFill>
    );
  };
  return Comp;
};
