// 场景 A · 冷开场（导演）。
// 第 0 帧：「人选祸 / 天选福」由整本书的 34952 个字拼成，已经亮着 → 逐字被念到时闪一下 →（4.2 s）炸开，落成整本书的一页（全书铺满一屏）
// → 镜头扎进书的开头：这句话真的在序里，作者在下一段道了歉 → 拉回整页 →「我是一个AI」：一道光从上到下把整本书读一遍，计数到 30686
// → 所有字飞进一个巨大的「选」（19.5 s 落在拍上，配乐有一记重拍）。
import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import type {SceneMod, SceneProps} from '../core/timeline';
import {Backdrop, Label, PAL, SAFE, SERIF, SERIF_BLACK, Title, Vignette} from '../core/look';
import {EASE, hex, keyframes, mix, prog, smooth} from '../core/anim';
import {BOOK, findInBook} from '../core/book';
import {
  Cam, GlyphCanvas, GlyphLayer, MaskText, N_BOOK, camMix, camOn, camZ, hash01, maskTargets, morphPos, noise3, usePage, useGState, useTextMask,
} from '../core/glyph';

const N = N_BOOK;
const PH = {size: 250, x: -40, y: 80}; // 「人选祸 / 天选福」的版式（像素，中心原点）
const SHATTER = 124; // 炸开（4.13 s，配乐 4.125 s 的半拍上有一记）
const SETTLE = 172;
const TITLE_IN = 556;
const TITLE_HIT = 585; // 19.5 s，拍上
const GOLD = hex(PAL.gold);
const HI = hex(PAL.goldHi);

const rangeCenter = (xy: (i: number) => [number, number], r: {start: number; end: number}): [number, number] => {
  let sx = 0;
  let sy = 0;
  for (let i = r.start; i < r.end; i++) {
    const [x, y] = xy(i);
    sx += x;
    sy += y;
  }
  const n = r.end - r.start;
  return [sx / n, sy / n];
};

const C: React.FC<SceneProps> = ({f, at}) => {
  const st = useGState();
  const bg = useGState();
  const page = usePage();
  const phraseMask = useTextMask('人选祸\n天选福', {size: PH.size, x: PH.x, y: PH.y});
  const xuanMask = useTextMask('选', {size: 900, y: 70});
  const T = useMemo(() => {
    if (!phraseMask || !xuanMask) return null;
    const phrase = maskTargets(phraseMask, N, 11, 1.2);
    const xuan = maskTargets(xuanMask, N, 23, 1.2);
    // 每个字粒子属于短语里的哪个字（0..5 = 人选祸天选福）
    const who = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const x = phrase[i * 3];
      const y = phrase[i * 3 + 1];
      const line = y > PH.y ? 0 : 1;
      const col = Math.max(0, Math.min(2, Math.round((x - PH.x) / PH.size) + 1));
      who[i] = line * 3 + col;
    }
    return {phrase, xuan, who};
  }, [phraseMask, xuanMask]);

  // 原文位置（书的字流下标）
  const R = useMemo(() => {
    const slogan = findInBook('人选祸，天选福');
    const apology = findInBook('这里首先和被我误解的人道歉');
    const spread = findInBook('为了易于传播');
    const catchy = findInBook('朗朗上口的口头禅');
    const wrong = findInBook('导致了非常多的人对它的误解');
    return {slogan, apology, spread, catchy, wrong};
  }, []);
  const ctr = (r: {start: number; end: number}) => rangeCenter(page.xy, r);

  // 念到短语里每个字的帧
  const spoken = useMemo(() => {
    const a = at('人选祸');
    const b = at('天选福');
    return [a, a + 6, a + 13, b, b + 6, b + 13];
  }, [at]);
  const fApology = at('先道了歉');
  const fSpread = at('好传播');
  const fCatchy = at('朗朗上口');
  const fWrong = at('误解了');
  const fAI = at('我是一个');
  const fCount = at('三万多字');
  const fRead = at('读完了');

  if (!T) return <Backdrop />;

  // ---------------- 位置
  const p1 = prog(f, SHATTER, SETTLE, EASE.linear);
  const p2 = prog(f, TITLE_IN, TITLE_HIT, EASE.linear);
  const t = f / 30;
  if (f < SHATTER) {
    st.pos.set(T.phrase);
  } else if (f < TITLE_IN) {
    morphPos(st.pos, T.phrase, page.pos, N, p1, {stagger: 0.55, order: 'radial', swirl: 260, lift: 900, seed: 5});
  } else {
    morphPos(st.pos, page.pos, T.xuan, N, p2, {stagger: 0.6, order: 'radialIn', swirl: 340, lift: 700, seed: 9, ease: EASE.inOut});
  }
  // 微微呼吸的漂移（短语和「选」阶段明显一点，整页时几乎不动）
  const driftAmt = f < SHATTER ? 2.2 : f >= TITLE_HIT ? 2.6 : 0.25;
  for (let i = 0; i < N; i++) {
    const k = i * 3;
    st.pos[k] += driftAmt * noise3(st.pos[k] / 90, st.pos[k + 1] / 90, t * 0.35, 4);
    st.pos[k + 1] += driftAmt * noise3(st.pos[k] / 90 + 19, st.pos[k + 1] / 90 - 7, t * 0.35, 4);
  }

  // ---------------- 大小 / 颜色
  const scanY = mix(980, -990, prog(f, fAI + 8, fRead + 8, EASE.inOut));
  const scanOn = f >= fAI + 8 && f < TITLE_IN + 10;
  const closeUp = smooth(188, 205, f) * (1 - smooth(418, 440, f)); // 0..1：镜头贴近书页的程度
  const hl = (r: {start: number; end: number}, from: number, i: number) => (i >= r.start && i < r.end ? smooth(from - 4, from + 8, f) : 0);
  for (let i = 0; i < N; i++) {
    const h = hash01(i, 3);
    let size: number;
    let r = GOLD[0];
    let g = GOLD[1];
    let b = GOLD[2];
    let a: number;
    let halo = 0.6 + h * 0.8;
    if (f < SHATTER + 6) {
      // 短语阶段：被念到的字闪一下
      const k = T.who[i];
      const fl = f >= spoken[k] - 1 ? Math.exp(-(f - spoken[k]) / 13) : 0;
      const pre = 0.82 + 0.18 * Math.sin(t * 2.2 + h * 6.28);
      size = (4.5 + 10 * h * h * h) * (1 + 0.3 * fl);
      r = mix(r, HI[0], 0.15 + 0.6 * fl);
      g = mix(g, HI[1], 0.15 + 0.6 * fl);
      b = mix(b, HI[2], 0.15 + 0.6 * fl);
      a = (0.16 + 0.22 * h + 0.35 * fl) * pre;
      halo *= 0.5 + 2.5 * fl;
    } else {
      // 整页：金色小字，深浅不一像纸上的墨色
      size = mix(4.5 + 10 * h * h * h, page.cell * 0.98, p1);
      a = mix(0.16 + 0.22 * h, 0.36 + 0.22 * h, p1);
      // 贴近时：原文高亮
      const lit = Math.max(
        hl(R.slogan, 200, i),
        hl(R.apology, fApology, i),
        hl(R.spread, fSpread, i) * (1 - smooth(fCatchy + 20, fCatchy + 30, f)) + hl(R.catchy, fCatchy, i) * (1 - smooth(fWrong + 20, fWrong + 30, f)) + hl(R.wrong, fWrong, i),
      ) * (1 - smooth(420, 440, f));
      a = mix(a * (1 - 0.6 * closeUp), 1, lit);
      r = mix(r, HI[0], lit);
      g = mix(g, HI[1], lit);
      b = mix(b, HI[2], lit);
      halo *= 1 - 0.7 * lit;
      size *= 1 + 0.12 * lit;
      // 读一遍：扫描线经过的字亮起来
      if (scanOn) {
        const y = page.pos[i * 3 + 1];
        const read = y > scanY ? 1 : 0;
        const edge = Math.exp(-Math.abs(y - scanY) / 22);
        a = Math.max(a, mix(a, 0.85, read) + 0.6 * edge);
        r = mix(r, HI[0], Math.max(read * 0.6, edge));
        g = mix(g, HI[1], Math.max(read * 0.6, edge));
        b = mix(b, HI[2], Math.max(read * 0.6, edge));
        halo *= 1 + 4 * edge + read * 0.6;
      }
      if (f >= TITLE_IN) {
        size = mix(size, 6.6, p2);
        a = mix(a, 0.8 + 0.2 * h, p2);
        r = mix(r, HI[0], p2 * 0.7);
        g = mix(g, HI[1], p2 * 0.7);
        b = mix(b, HI[2], p2 * 0.7);
        const hit = f >= TITLE_HIT ? Math.exp(-(f - TITLE_HIT) / 10) : 0;
        halo *= 1 + 3 * hit;
        a = Math.min(1, a + hit * 0.3);
      }
    }
    st.size[i] = size;
    st.halo[i] = halo;
    st.col[i * 4] = r;
    st.col[i * 4 + 1] = g;
    st.col[i * 4 + 2] = b;
    st.col[i * 4 + 3] = a;
  }

  // 背景：整本书的一页，远一点、很淡（短语从书里浮出来）；短语落回书页后淡出
  const bgA = 0.1 * (1 - smooth(SHATTER + 10, SETTLE + 4, f));
  if (bgA > 0) {
    for (let i = 0; i < N; i++) {
      bg.pos[i * 3] = page.pos[i * 3] * 1.06;
      bg.pos[i * 3 + 1] = page.pos[i * 3 + 1] * 1.06;
      bg.pos[i * 3 + 2] = -320;
      bg.size[i] = page.cell * 1.02;
      bg.halo[i] = 0;
      bg.col[i * 4] = GOLD[0];
      bg.col[i * 4 + 1] = GOLD[1];
      bg.col[i * 4 + 2] = GOLD[2];
      bg.col[i * 4 + 3] = bgA * (0.6 + 0.8 * hash01(i, 8));
    }
  }

  // ---------------- 镜头
  const full: Cam = {pos: [0, 0, camZ()]};
  const push: Cam = {pos: [0, 30, camZ() * 0.86]};
  const [sx, sy] = ctr(R.slogan);
  const [ax, ay] = ctr(R.apology);
  const [px, py] = ctr(R.spread);
  const [qx, qy] = ctr(R.catchy);
  const [wx, wy] = ctr(R.wrong);
  const Z = 46; // 贴近时一个字在屏幕上的像素
  const cSlogan = camOn(sx, sy - 62, page.cell, Z);
  const cApology = camOn(ax - 20, ay - 62, page.cell, Z);
  const cSpread = camOn(px + 10, py - 62, page.cell, Z);
  const cCatchy = camOn(qx, qy - 62, page.cell, Z);
  const cWrong = camOn(wx, wy - 62, page.cell, Z);
  const cTitle: Cam = full;
  const seq: [number, Cam][] = [
    [0, full],
    [SHATTER, push],
    [SETTLE + 6, full],
    [188, full],
    [222, cSlogan],
    [fApology - 4, cSlogan],
    [fApology + 14, cApology],
    [fSpread - 18, cApology],
    [fSpread + 4, cSpread],
    [fCatchy - 10, cSpread],
    [fCatchy + 8, cCatchy],
    [fWrong - 10, cCatchy],
    [fWrong + 8, cWrong],
    [424, cWrong],
    [458, full],
    [TITLE_IN, full],
    [TITLE_HIT, cTitle],
    [TITLE_HIT + 40, full],
  ];
  let cam = full;
  for (let k = 1; k < seq.length; k++) {
    if (f <= seq[k][0]) {
      const [f0, c0] = seq[k - 1];
      const [f1, c1] = seq[k];
      cam = camMix(c0, c1, EASE.inOut(Math.min(1, Math.max(0, (f - f0) / Math.max(1, f1 - f0)))));
      break;
    }
    cam = seq[k][1];
  }
  // 贴近时整体再慢慢平移一点，避免死板
  const drift = closeUp * 6 * Math.sin(t * 0.7);
  cam = {...cam, pos: [cam.pos![0] + drift, cam.pos![1], cam.pos![2]], target: [cam.target ? cam.target[0] + drift : cam.pos![0] + drift, cam.target ? cam.target[1] : cam.pos![1], 0]};

  // ---------------- DOM 叠层
  const hookA = 1 - prog(f, SHATTER - 8, SHATTER + 4, EASE.in);
  const srcA = closeUp * (1 - prog(f, 410, 424));
  const countP = prog(f, fAI + 10, fCount + 14, EASE.out);
  const countA = prog(f, fAI + 6, fAI + 16) * (1 - prog(f, TITLE_IN - 6, TITLE_IN + 8));
  const subA = prog(f, TITLE_HIT + 8, TITLE_HIT + 24, EASE.out);
  const count = Math.round(BOOK.han * countP);
  return (
    <AbsoluteFill>
      <Backdrop light={[0.5, f < SHATTER ? 0.4 : 0.45]} glow={1 + 0.4 * (f >= TITLE_HIT ? Math.exp(-(f - TITLE_HIT) / 20) : 0)} />
      <GlyphCanvas camera={cam}>
        {bgA > 0 ? <GlyphLayer state={bg} glow={0.2} /> : null}
        <GlyphLayer state={st} glow={0.55} halo={0.16} haloSize={3.2} renderOrder={4} />
      </GlyphCanvas>
      <Vignette amount={0.5} />
      {/* 第 0 帧的钩子小字 */}
      <div style={{position: 'absolute', left: SAFE.cx, top: 452, transform: 'translateX(-50%)', opacity: hookA, fontFamily: SERIF, fontSize: 46, letterSpacing: '0.12em', color: PAL.goldHi, textShadow: '0 2px 16px rgba(0,0,0,.8)', whiteSpace: 'nowrap'}}>
        写下它的人，为它道过歉
      </div>
      {srcA > 0.01 ? <Label text="《人选天选论》· 序 · 原文" x={SAFE.x0 + 8} y={392} p={srcA} size={32} /> : null}
      {countA > 0.01 ? (
        <div style={{position: 'absolute', left: SAFE.cx, top: 770, transform: 'translate(-50%, -50%)', opacity: countA, textAlign: 'center', textShadow: '0 4px 30px rgba(0,0,0,.9)'}}>
          <div style={{fontFamily: SERIF_BLACK, fontSize: 150, lineHeight: 1, color: PAL.goldHi, letterSpacing: '0.02em', fontVariantNumeric: 'tabular-nums'}}>{count.toLocaleString('en-US')}</div>
          <div style={{fontFamily: SERIF, fontSize: 44, marginTop: 18, color: PAL.gold, letterSpacing: '0.2em'}}>个汉字</div>
        </div>
      ) : null}
      {f >= TITLE_HIT - 2 ? (
        <>
          <MaskText text="选" size={900} y={70} opacity={0.55 * prog(f, TITLE_HIT - 2, TITLE_HIT + 20, EASE.out)} />
          <div style={{position: 'absolute', left: SAFE.cx, top: 1400, transform: 'translateX(-50%)', opacity: subA, fontFamily: SERIF, fontSize: 48, letterSpacing: '0.3em', color: PAL.gold, whiteSpace: 'nowrap', textShadow: '0 2px 16px rgba(0,0,0,.8)'}}>
            读懂《人选天选论》
          </div>
        </>
      ) : null}
    </AbsoluteFill>
  );
};

export const S: SceneMod = {
  C,
  trans: 'cut',
  hideSubs: [],
  sfx: ({at}) => [
    [0, 'gather', 0.2, 80],
    [SHATTER - 2, 'whoosh_soft', 0.16, 40],
    [205, 'drop', 0.12, 25],
    [at('先道了歉') + 10, 'chime', 0.13, 80],
    [at('我是一个') + 8, 'swell', 0.08, 60],
    [TITLE_IN - 6, 'gather', 0.22, 80],
  ],
};
