// 《选》权威时间轴：句子时间来自 alignment/chars.json（豆包逐字时间，排在 80 BPM 网格上），场景切点来自 storyboard/scenes.json。
// 场景代码只从这里拿时间，不要自己写秒数常量。
import type React from 'react';
import charsJson from '../../alignment/chars.json';
import sb from '../../storyboard/scenes.json';
import grid from '../../notes/grid.json';

export const FPS = 30;
export const W = 1080;
export const H = 1920;
export const BPM = grid.bpm; // 80
export const BEAT = grid.beat; // 0.75 s
export const BAR = grid.bar; // 3 s
export type CharT = {c: string; start: number; end: number};
export type LineT = {i: number; id: string; text: string; start: number; end: number; chars: CharT[]};
export type SceneLine = {i: number; id: string; text: string; start: number; end: number; src: string};
export type SceneDef = {id: string; sec: string; first: number; last: number; start: number; end: number; lines: SceneLine[]};
export const LINES = charsJson as LineT[];
export const SCENES = sb.scenes as SceneDef[];
export const END = sb.end as number;
export const toF = (s: number) => Math.round(s * FPS);
export const TOTAL_FRAMES = toF(END);
export const sceneById = (id: string) => {
  const d = SCENES.find((s) => s.id === id);
  if (!d) throw new Error('没有场景 ' + id);
  return d;
};
export const lineById = (id: string) => {
  const l = LINES.find((x) => x.id === id);
  if (!l) throw new Error('没有句子 ' + id);
  return l;
};
/** 网格：第 b 小节第 beat 拍的全片秒 */
export const barT = (b: number, beat = 0) => b * BAR + beat * BEAT;
/** 场景内帧 f 之后（含）的下一个拍点帧（场景内） */
export const nextBeatF = (def: SceneDef, f: number, every = 1) => {
  const t = def.start + f / FPS;
  const q = BEAT * every;
  return toF(Math.ceil(t / q - 1e-6) * q) - toF(def.start);
};

const findInScene = (def: SceneDef, sub: string, nth: number, lineId?: string): CharT[] => {
  let seen = 0;
  for (let k = def.first; k <= def.last; k++) {
    const l = LINES[k - 1];
    if (lineId && l.id !== lineId) continue;
    let idx = l.text.indexOf(sub);
    while (idx >= 0) {
      if (seen === nth) return l.chars.slice(idx, idx + [...sub].length);
      seen++;
      idx = l.text.indexOf(sub, idx + 1);
    }
  }
  throw new Error('[' + def.id + '] 找不到「' + sub + '」#' + nth + (lineId ? ' in ' + lineId : ''));
};
/** at('词', nth=0, frac=0, lineId?)：本场景里第 nth 次出现的「词」首字开口的场景内帧；frac=1 取词尾 */
export const makeAt = (def: SceneDef) => {
  const f0 = toF(def.start);
  return (sub: string, nth = 0, frac = 0, lineId?: string): number => {
    const cs = findInScene(def, sub, nth, lineId);
    if (frac <= 0) return toF(cs[0].start) - f0;
    if (frac >= 1) return toF(cs[cs.length - 1].end) - f0;
    return toF(cs[0].start + (cs[cs.length - 1].end - cs[0].start) * frac) - f0;
  };
};
/** atc('词')：词里每个字开口的场景内帧 */
export const makeAtc = (def: SceneDef) => {
  const f0 = toF(def.start);
  return (sub: string, nth = 0, lineId?: string): number[] => findInScene(def, sub, nth, lineId).map((c) => toF(c.start) - f0);
};
/** lineAt('e6', 'start'|'end')：句子开口 / 结束的场景内帧 */
export const makeLineAt = (def: SceneDef) => {
  const f0 = toF(def.start);
  return (id: string, edge: 'start' | 'end' = 'start') => toF(lineById(id)[edge]) - f0;
};
export type At = ReturnType<typeof makeAt>;
export type Atc = ReturnType<typeof makeAtc>;
export type LineAt = ReturnType<typeof makeLineAt>;

export type SceneProps = {
  /** 场景内帧（0 = 场景起点）。场景结束后还会多渲染 TAIL 帧垫在下一场景的入场转场下面（此时 f >= dur），保持最后画面即可 */
  f: number;
  /** 场景总帧数 */
  dur: number;
  at: At;
  atc: Atc;
  lineAt: LineAt;
  def: SceneDef;
};
/** 音效：[场景内帧, 文件名(public/sfx/<name>.wav，不带扩展名), 音量(默认 0.25), 播放长度帧(默认 90)] */
export type Cue = [number, string, number?, number?];
export type SceneMod = {
  C: React.FC<SceneProps>;
  sfx?: (p: {at: At; atc: Atc; lineAt: LineAt; dur: number}) => Cue[];
  /** 画面上已经用大字完整呈现的句子 id（例如 'c2'），这些句子不显示底部字幕 */
  hideSubs?: string[];
  /** 入场转场：'fade'（默认，12 帧叠化）| 'cut' | 'white'（闪白 10 帧）| 'black'（经黑 16 帧） */
  trans?: 'fade' | 'cut' | 'white' | 'black';
};
