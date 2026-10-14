// 场景容器 + 单场预览（不 import registry，这样每个场景组的预览只打包自己的场景，别人写到一半的文件不会把你弄坏）。
import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {useFonts} from './core/fonts';
import {Grain} from './core/gl/Grain';
import {PAL, Watermark} from './core/look';
import {EASE, prog} from './core/anim';
import {Cue, SceneDef, SceneMod, makeAt, makeAtc, makeLineAt, sceneById, toF} from './core/timeline';
import {Subtitles} from './Subtitles';

export const TAIL = 14; // 每个场景结束后多渲染的帧（垫在下一场景的入场转场下面）

/** 有多个变体的音效：场景里写 'gather'，实际按出现顺序轮换 gather_1/2/3（起点按场景错开），同一个声音不会连着重复 */
const VARIANTS: Record<string, number> = {gather: 3};
export const sfxFiles = (def: SceneDef, cues: Cue[]): Cue[] => {
  const seen: Record<string, number> = {};
  return cues.map(([cf, name, vol, len]) => {
    const v = VARIANTS[name];
    if (!v) return [cf, name, vol, len];
    seen[name] = (seen[name] ?? -1) + 1;
    return [cf, name + '_' + (1 + ((seen[name] + def.first) % v)), vol, len];
  });
};
const TLEN = {fade: 12, cut: 0, white: 10, black: 16};

export const SceneBox: React.FC<{def: SceneDef; mod: SceneMod}> = ({def, mod}) => {
  const f = useCurrentFrame();
  const dur = toF(def.end) - toF(def.start);
  const at = makeAt(def);
  const atc = makeAtc(def);
  const lineAt = makeLineAt(def);
  const tr = mod.trans ?? 'fade';
  const op = tr === 'fade' ? prog(f, 0, TLEN.fade, EASE.inOut) : 1;
  const C = mod.C;
  return (
    <AbsoluteFill style={{opacity: op}}>
      <C f={f} dur={dur} at={at} atc={atc} lineAt={lineAt} def={def} />
      {tr === 'white' && f < TLEN.white ? <AbsoluteFill style={{background: '#FFF6E4', opacity: 1 - prog(f, 1, TLEN.white, EASE.out)}} /> : null}
      {tr === 'black' && f < TLEN.black ? <AbsoluteFill style={{background: PAL.ink, opacity: 1 - prog(f, 2, TLEN.black, EASE.inOut)}} /> : null}
      {sfxFiles(def, mod.sfx?.({at, atc, lineAt, dur}) ?? []).map(([cf, file, vol = 0.25, len = 90], k) => (
        <Sequence key={k} from={Math.max(0, cf)} durationInFrames={len} layout="none">
          <Audio src={staticFile('sfx/' + file + '.wav')} volume={(fr) => vol * Math.min(1, Math.max(0, (len - fr) / 8))} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

/** 只渲染一个场景（场景组自测用）：画面从场景起点开始，声音对齐 */
export const makeScenePreviewMod = (id: string, mod: SceneMod, subtitles = true) => {
  const def = sceneById(id);
  const Comp: React.FC = () => {
    useFonts();
    const hide = new Set(mod.hideSubs ?? []);
    return (
      <AbsoluteFill style={{background: PAL.ink}}>
        <SceneBox def={def} mod={{...mod, trans: 'cut'}} />
        <Audio src={staticFile('voice.wav')} startFrom={toF(def.start)} />
        <Audio src={staticFile('music.wav')} startFrom={toF(def.start)} />
        {subtitles ? <Subtitles hide={hide} offset={toF(def.start)} /> : null}
        <Grain intensity={0.22} />
        <Watermark />
      </AbsoluteFill>
    );
  };
  return Comp;
};
