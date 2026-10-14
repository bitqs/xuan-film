# 引擎速查（scenes/core/）—— 完整参考实现：`scenes/s/A.tsx`（先读它，190 行）

坐标：**像素，原点在画面中心，y 向上，z 朝镜头**。默认镜头（fov 40，`camZ()` ≈ 2638）下 z=0 平面 1 单位 = 1 像素。
DOM 用的是左上原点：DOM_y = 960 − y，DOM_x = 540 + x。

## 场景骨架
```tsx
import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import type {SceneMod, SceneProps} from '../core/timeline';
import {nextBeatF} from '../core/timeline';
import {Backdrop, Vignette, Plate, Title, Quote, Label, PAL, SAFE, SERIF, SERIF_BLACK, SANS} from '../core/look';
import {EASE, prog, mix, smooth, keyframes, hex, spr, rnd} from '../core/anim';
import {BOOK, findInBook, chapterOf, textIdx, glyphIdx, N_BOOK} from '../core/book';
import {GlyphCanvas, GlyphLayer, useGState, usePage, useTextMask, useImageData, imageMask, maskTargets, textLayout,
        morphPos, mixArr, drift, noise3, hash01, colorFromImage, sampleImg, fillColor, setColor, setChar, resetChars,
        highlightRange, camZ, camOn, camMix, Cam} from '../core/glyph';

const C: React.FC<SceneProps> = ({f, dur, at, atc, lineAt, def}) => {
  const st = useGState();            // 34952 个字的持久状态：pos(n*3) size(n) col(n*4 sRGB+alpha) idx(n 字形) rot(n) halo(n)
  const page = usePage();            // 整本书一页：page.pos / page.cell(7.71) / page.xy(i)
  ...每帧改写 st.pos / st.size / st.col / st.halo ...
  return (
    <AbsoluteFill>
      <Backdrop />
      <GlyphCanvas camera={{pos: [0, 0, camZ()]}}>
        <GlyphLayer state={st} glow={0.5} halo={0.15} haloSize={3} />
      </GlyphCanvas>
      <Vignette />
    </AbsoluteFill>
  );
};
export const S: SceneMod = {C, sfx: ({at}) => [[at('硬币'), 'coin_flip', 0.18, 30]], hideSubs: ['c2']};
```

## 时间
- `at('词', nth=0, frac=0, lineId?)` → 本场景里「词」首字开口的**场景内帧**（frac=1 词尾）。`atc('词')` → 每个字的帧。`lineAt('e6','start'|'end')`。
- `nextBeatF(def, f, every=1)` → f 之后最近的拍点帧（every=4 = 小节线）。重的视觉落点放拍上。
- `prog(f, a, b, EASE.out)` 0..1；`keyframes(f, [[f0,v0],[f1,v1],...])`；`smooth(a,b,x)`；`spr(f, at)` 弹簧。

## 字（GlyphLayer）
- `useGState(n?)`：每个组件一份持久状态（默认 n = 34952，第 i 个字 = 书的第 i 个字）。**每帧原地改写，不要 new**。可以开第二份做背景层（A 场就有 `bg`）。
- `GlyphLayer` props：`glow`（字内光 0..1）、`halo`（字后柔光强度，0 关；只在 add 模式有意义）、`haloSize`（光晕直径/字格）、`blend` 'add'（暗底发光，默认）| 'normal'（亮底上的墨字，例如道痕纸面）、`opacity`、`face`（true = 字永远正对镜头）、`renderOrder`。
- 每字字段：`st.size[i]` 字格边长（像素，z=0 处）；`st.col[i*4..]` = r,g,b（0..1）,alpha；`st.halo[i]` 光晕倍数；`st.rot[i]` 弧度；`st.idx[i]` 字形（`setChar(st,i,'贪')` 让它显示别的字，`resetChars(st)` 复原）。alpha 0 的字不画（省）。
- 加色模式下很多字叠在一起会发白 → 密的时候降 alpha（0.15–0.4）、字号错落（A 场：`4.5 + 10*h^3`）。

## 排布（目标位置，都是 Float32Array(n*3)）
- `page.pos`：整本书铺满一屏（140×250，格 7.71）。`pageLayout({cols, cell, cx, cy, n})` 自定义。
- `useTextMask('选', {size: 900, x, y, font?})` → 遮罩；`maskTargets(mask, n, seed)` → n 个点均匀填满笔画（阅读顺序排列，所以从整页变过去不会乱）。字体默认 900 宋体，可传 `font: "'XSerif'"`。
- `useImageData('img/coin_panda.jpg', 270, 480)` → 像素；`imageMask(img, 'luma'|'dark'|'alpha', thr)` → 遮罩（例如照片亮处）；`sampleImg(img, x, y)` → [r,g,b]。
- `textLayout('人选天选论', {x, y, size, cols, lineH, align, tracking})` → `{pos, idx, n}`：一段文字的位置和字形（拿前 n 个粒子 + `st.idx.set(t.idx)` 就是用书里的字粒子「写」出一句话；其他粒子可以继续当背景）。
- 自己的公式也行（河、圆盘、桥拱、漩涡……）：直接写进 Float32Array。

## 变形 / 运动
- `morphPos(out, a, b, n, p, {stagger: .5, order: 'random'|'index'|'x'|'y'|'radial'|'radialIn', swirl: 200, lift: 600, seed, ease})`：逐字错峰从 a 变到 b。swirl = 途中侧向弧线，lift = 途中朝镜头飞起（很震撼，A 场炸开用了 900）。`a` 要是稳定的数组（useMemo 出来的），顺序缓存挂在它身上。
- `mixArr(out, a, b, t)`；`drift(pos, n, t, amp, scale, speed, seed)` 缓慢流动；`noise3(x,y,z,seed)` -1..1；`hash01(i, seed)` 每字固定随机数。
- 流水（例）：`y = ((hash01(i,1) + t*speed) % 1) * L - L/2; x = (hash01(i,2)-.5)*width + 60*Math.sin(y/300 + t)`，再把镜头压低看河面：`camera={{pos:[0,-1500,700], target:[0,300,0], fov:40}}`（字躺在 z=0 平面上，自带透视）。

## 照片拼字 / 原文
- `colorFromImage(st, img, {gain: 1.25, alphaMin: .35, alpha: 1, mixAmt: 1})`：按每个字**当前位置**取照片颜色 → 字拼成照片（整页排布时 140×250 个字 = 一张低清照片，推近能读）。再叠 `<Plate src=... opacity={p}/>` 淡入真照片 = 「字凝成了照片」。
- 原文：`const r = findInBook('那道蓝光，好像从来就不在石头上')`（忽略标点；找不到会直接报错，说明不是原文）→ `highlightRange(st, r.start, r.end, {color: PAL.goldHi, dim: .35, amount: p})`（在算完颜色之后调用）→ 镜头 `camOn(x, y, page.cell, 46)`（字在屏幕上 46px，能读）。范围中心用 `page.xy(i)` 求平均。`chapterOf(r.start).title` 拿章名做标签。
- 镜头：`camMix(a, b, t)`（距离对数插值，推拉自然）。A 场有一个按帧排的镜头关键帧表可以照抄。

## 粒子字 + 锐利字严丝合缝
`<MaskText text="选" size={900} y={70} opacity={.5} />`（glyph.tsx）：canvas 画的锐利大字，定位和 `useTextMask` 同参数完全一致 → 叠在粒子拼成的同一个字上。不要用 DOM Title 去叠粒子字（会差几十像素）。

## DOM 叠层（look.tsx，锐利，适合要读的字）
- `<Backdrop light={[.5,.42]} glow={1} />` 暖黑底；`<Vignette amount={.5}/>`。
- `<Plate src="img/bridge.jpg" p={0..1} from={{s:1.1,x:0,y:0}} to={{s:1}} opacity grade="saturate(.9) brightness(.9)" blur />` 照片 + Ken Burns。
- `<Title text="天权" f={f} at={at('天权')} charStarts={atc('天权')} size={200} x={444} y={700} black gradient out={...} />` 金色大字逐字出现。
- `<Quote text="…原文…" source="—— 姜蓝《人选天选论》· 第二章" p={0..1} y={820} />` 引文卡。
- `<Label text="AI 示意图" x={64} y={1440} size={28} />` 小标签。

## 声音
`sfx: ({at, atc, lineAt, dur}) => Cue[]`，Cue = `[场景内帧, 'shimmer', 音量, 长度帧]`。可用：shimmer swell boom_soft chime bell drop water_loop coin_flip coin_land_hi coin_land_lo scratch crack pebbles buzz swat page whoosh_soft tick title_hit（说明见 notes/SFX.md）。
