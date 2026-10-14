// 竖屏字幕：每句按标点切成短块（≤ 15 字），按逐字时间一块一块出现。位置在安全区下沿（中心 y≈1392）。
import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {FPS, LINES, LineT} from './core/timeline';
import {SANS} from './core/fonts';
import {SAFE} from './core/look';

type Chunk = {text: string; start: number; end: number; id: string};
const CUT = new Set(['，', '。', '：', '；', '？', '！', '、']);
const DROP = new Set(['，', '。', '、', '；']);
const MAX = 15;
const chunksOf = (l: LineT, nextStart: number): Chunk[] => {
  const out: {cs: typeof l.chars}[] = [];
  let cur: typeof l.chars = [];
  l.chars.forEach((c) => {
    cur.push(c);
    if (CUT.has(c.c)) {
      out.push({cs: cur});
      cur = [];
    }
  });
  if (cur.length) out.push({cs: cur});
  // 太长的块对半切
  const res: Chunk[] = [];
  const split = (cs: typeof l.chars) => {
    const vis = cs.filter((c) => !DROP.has(c.c));
    if (vis.length <= MAX) return [cs];
    const mid = Math.ceil(cs.length / 2);
    return [...split(cs.slice(0, mid)), ...split(cs.slice(mid))];
  };
  const parts = out.flatMap((o) => split(o.cs)).filter((cs) => cs.some((c) => !CUT.has(c.c)));
  parts.forEach((cs, k) => {
    const text = cs.map((c) => c.c).join('').replace(/[，。、；]+$/u, '');
    const first = cs.find((c) => !CUT.has(c.c)) ?? cs[0];
    const start = first.start - 0.06;
    const nxt = parts[k + 1];
    const end = nxt ? (nxt.find((c) => !CUT.has(c.c)) ?? nxt[0]).start - 0.06 : Math.min(l.end + 0.35, nextStart - 0.05);
    res.push({text, start, end, id: l.id});
  });
  return res;
};
const ALL: Chunk[] = LINES.flatMap((l, k) => chunksOf(l, LINES[k + 1]?.start ?? l.end + 2));

export const Subtitles: React.FC<{hide?: Set<string>; offset?: number}> = ({hide, offset = 0}) => {
  const f = useCurrentFrame() + offset;
  const t = f / FPS;
  const c = ALL.find((x) => t >= x.start && t < x.end);
  if (!c || hide?.has(c.id)) return null;
  const a = Math.min(1, (t - c.start) * 10, (c.end - t) * 10);
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div
        style={{
          position: 'absolute',
          left: SAFE.x0,
          width: SAFE.x1 - SAFE.x0,
          top: 1392,
          transform: 'translateY(-50%)',
          textAlign: 'center',
          fontFamily: SANS,
          fontWeight: 500,
          fontSize: 48,
          lineHeight: 1.3,
          letterSpacing: '0.03em',
          color: '#FFF8EC',
          opacity: a,
          textShadow: '0 2px 4px rgba(0,0,0,.75), 0 0 18px rgba(0,0,0,.55)',
        }}
      >
        {c.text}
      </div>
    </AbsoluteFill>
  );
};
