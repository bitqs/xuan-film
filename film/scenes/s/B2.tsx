// 场景 B2 · 他怎么回应、书怎么来的（温暖、真诚）。
// 第 0 帧：38 盏由书里的字组成的「字灯」（每盏 640 个字）静静亮着 → 念到「三十八万」前一盏盏点亮，「38万」落下
// →「捐」：28 盏像孔明灯一样升空、远去，10 盏留在原地 →「人选祸，天选福」八个大字（书的字粒子）逐字出现
// →「传开」：一份复制成几十、几百、几千份，镜头拉远铺满整屏（4369 份 × 8 字 = 正好一本书的字数）→ 几份被放大，旁边浮出灰色「玄学？」
// →（本场「怎么做的」）「今年三月」：满屏的口号被整本书一章一章改写——每章的字按阅读顺序从虚空飞进它在整页里的位置，
//   8 篇落在 8 个拍上，左侧标出章名 + 发布日期 →「先贤的书里借来」：镜头扎进第五章原文 → 拉回整页发光
// →「还债」：书页上的字汇成一条河，流出画面（还给世界；书里的原话：把我的河流汇聚成容器，交还给这个世界）→ 整页书暗下来，交给 C1。
import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import type {SceneMod, SceneProps} from '../core/timeline';
import {nextBeatF, sceneById} from '../core/timeline';
import {Backdrop, Label, PAL, SAFE, SANS, SERIF, SERIF_BLACK, Title, Vignette} from '../core/look';
import {EASE, clamp01, hex, mix, prog, smooth} from '../core/anim';
import {BOOK, findInBook, glyphIdx} from '../core/book';
import {Cam, GlyphCanvas, GlyphLayer, N_BOOK, camMix, camOn, camZ, hash01, noise3, usePage, useGState} from '../core/glyph';

const N = N_BOOK;
const GOLD = hex(PAL.gold);
const HI = hex(PAL.goldHi);
const AMB = hex(PAL.amber);
const CX = SAFE.cx - 540; // 安全区中心 x（世界坐标）

// b7 字灯：38 盏 = 38 万
const ORB_ROWS = [6, 7, 6, 7, 6, 6];
const N_ORB = 38;
const N_GO = 28;
const PER = 640; // 每盏灯的字数
const SHELL = 480; // 其中在球面上的（其余在灯芯里）
const R_ORB = 34;
const ORB_Y0 = 262; // 第一排灯的 y（世界坐标）

// b8 口号墙：整页每 8 格写一份「人选祸，天选福。」
const SLOGAN = '人选祸，天选福。';
const C0 = 2072; // 主角那一份（字流下标 16576 = 第 118 行第 56 列）
const Z0 = 11.5; // 开始时放大多少倍（一个字 ≈ 89px）
const HERO: [number, number] = [CX, 160]; // 主角那一份在画面上的中心（世界坐标）
const TAG_AT: [number, number][] = [[80, 470], [400, 592], [150, 726], [420, 860], [90, 1004], [360, 1136]];
const TAG_S = 4; // 被标的那几份放大几倍（一个字 ≈ 31px） // 被标「玄学？」的几份（DOM 左上）

type Rg = {start: number; end: number};
const chName = (title: string) => (title.endsWith('-序') ? '序' : title.replace('·', ' · '));
const chDate = (d: string) => d.replace(/-/g, '.');

const C: React.FC<SceneProps> = ({f: fRaw, dur, at, atc, def}) => {
  const f = Math.min(fRaw, dur);
  const t = f / 30;
  const orb = useGState(); // b7 字灯；b10 河
  const W = useGState(); // b8–b9 口号墙
  const B = useGState(); // b9 起：整本书
  const page = usePage();
  const cell = page.cell;

  // ---------------- 时间点（全部来自旁白）
  const T = useMemo(() => {
    const chap: number[] = [];
    let fb = nextBeatF(def, at('今年三月'));
    for (let k = 0; k < 8; k++) {
      chap.push(fb);
      fb = nextBeatF(def, fb + 1);
    }
    const h1 = atc('人选祸');
    const h2 = atc('天选福');
    return {
      zimeiti: at('做自媒体'),
      san: atc('三十八万'),
      juan: at('捐'),
      er: atc('二十八万'),
      nage: at('那句'),
      hero: [h1[0], h1[1], h1[2], at('，', 0, 0, 'b8'), h2[0], h2[1], h2[2], h2[2] + 9],
      spread: at('在网上传开'),
      xuan: at('当成了玄学'),
      chap,
      series: at('一章一章'),
      xian: at('先贤'),
      shu: at('的书里'),
      jie: at('借来'),
      xie: at('写这本书'),
      huan: at('是在还债'),
    };
  }, [at, atc, def]);
  const RIVER0 = T.huan - 6;

  // ---------------- b7 字灯的布局
  const O = useMemo(() => {
    const ox: number[] = [];
    const oy: number[] = [];
    const ph: number[] = [];
    let j = 0;
    ORB_ROWS.forEach((cnt, r) => {
      for (let k = 0; k < cnt; k++) {
        ox.push(CX + (k - (cnt - 1) / 2) * 104 + (hash01(j, 41) - 0.5) * 18);
        oy.push(ORB_Y0 - r * 90 + (hash01(j, 42) - 0.5) * 16);
        ph.push(hash01(j, 43) * 6.283);
        j++;
      }
    });
    const ids = ox.map((_, i) => i);
    const lit: number[] = [];
    [...ids].sort((a, b) => hash01(a, 46) - hash01(b, 46)).forEach((o, k) => (lit[o] = k));
    // 随机挑 28 盏放飞；上面的先飞
    const pick = [...ids].sort((a, b) => hash01(a, 45) - hash01(b, 45)).slice(0, N_GO);
    pick.sort((a, b) => oy[b] + hash01(b, 47) * 80 - (oy[a] + hash01(a, 47) * 80));
    const rel: number[] = ids.map(() => -1);
    pick.forEach((o, k) => (rel[o] = k));
    // 每个字在灯里的局部位置（单位球：球面 + 灯芯）
    const L = new Float32Array(PER * 3);
    for (let m = 0; m < PER; m++) {
      if (m < SHELL) {
        const yy = 1 - (2 * (m + 0.5)) / SHELL;
        const rr = Math.sqrt(Math.max(0, 1 - yy * yy));
        const th = m * 2.399963;
        L[m * 3] = Math.cos(th) * rr;
        L[m * 3 + 1] = yy;
        L[m * 3 + 2] = Math.sin(th) * rr;
      } else {
        const th = hash01(m, 51) * 6.283;
        const pp = Math.acos(2 * hash01(m, 52) - 1);
        const rad = 0.5 * Math.cbrt(hash01(m, 53));
        L[m * 3] = Math.sin(pp) * Math.cos(th) * rad;
        L[m * 3 + 1] = Math.cos(pp) * rad;
        L[m * 3 + 2] = Math.sin(pp) * Math.sin(th) * rad;
      }
    }
    return {ox, oy, ph, lit, rel, L};
  }, []);

  // ---------------- b8 口号墙（字形、每份的中心、出现顺序、被标「玄学？」的几份）
  const WD = useMemo(() => {
    for (let i = 0; i < N; i++) W.idx[i] = glyphIdx(SLOGAN[i & 7]);
    const nC = N >> 3;
    const ccx = new Float32Array(nC);
    const ccy = new Float32Array(nC);
    for (let c = 0; c < nC; c++) {
      let sx = 0;
      let sy = 0;
      for (let j = 0; j < 8; j++) {
        sx += page.pos[(c * 8 + j) * 3];
        sy += page.pos[(c * 8 + j) * 3 + 1];
      }
      ccx[c] = sx / 8;
      ccy[c] = sy / 8;
    }
    const spawnK = new Float32Array(nC);
    for (let c = 0; c < nC; c++) {
      const d = Math.hypot(ccx[c] - ccx[C0], ccy[c] - ccy[C0]);
      spawnK[c] = 9 * Math.log2(1 + d / 24) * (0.8 + 0.4 * hash01(c, 61)); // 相对「传开」的出现帧：离原件越远越晚（指数扩散）
    }
    spawnK[C0] = -9999;
    const tags = TAG_AT.map(([X, Y]) => {
      const wx = X - 540 + 4 * cell;
      const wy = 960 - Y;
      const col = Math.round((wx - page.x0) / cell);
      const row = Math.round((page.y0 - wy) / cell);
      let c = Math.floor((row * page.cols + col) / 8);
      if ((c * 8) % page.cols > page.cols - 8) c += 1; // 别挑折行的那份
      return c;
    });
    return {ccx, ccy, spawnK, tags};
  }, [W, page, cell]);

  // ---------------- b9 整本书：每个字的落位帧、飞行时长、从哪里飞来
  const BD = useMemo(() => {
    const land = new Float32Array(N);
    const fly = new Float32Array(N);
    const vx = new Float32Array(N);
    const vy = new Float32Array(N);
    const vz = new Float32Array(N);
    BOOK.chapters.forEach((ch, k) => {
      const F = T.chap[k];
      for (let i = ch.start; i < ch.end; i++) {
        const u = (i - ch.start) / (ch.end - ch.start);
        land[i] = F + 18 * u + 4 * (hash01(i, 70) - 0.5);
        fly[i] = 18 + 12 * hash01(i, 71);
        const px = page.pos[i * 3];
        const py = page.pos[i * 3 + 1];
        vx[i] = px * (1.25 + 0.4 * hash01(i, 72)) + (hash01(i, 73) - 0.5) * 300;
        vy[i] = py * (1.1 + 0.3 * hash01(i, 74)) + 220 + (hash01(i, 75) - 0.5) * 260;
        vz[i] = 500 + 900 * hash01(i, 76);
      }
    });
    return {land, fly, vx, vy, vz};
  }, [T, page]);

  // ---------------- b10 第五章原文
  const R = useMemo(() => ({
    xian: findInBook('还是因为那些先贤'),
    names: findInBook('《易经》《道德经》《庄子》《孙子兵法》'),
    jie: findInBook('我只是很早就借来用了'),
  }), []);
  const ctr = (r: Rg): [number, number] => {
    let sx = 0;
    let sy = 0;
    for (let i = r.start; i < r.end; i++) {
      const [x, y] = page.xy(i);
      sx += x;
      sy += y;
    }
    return [sx / (r.end - r.start), sy / (r.end - r.start)];
  };

  // ================= b7 字灯
  const orbOn = f < T.nage + 30;
  const riverOn = f >= RIVER0;
  if (orbOn) {
    const cb = Math.cos(0.35);
    const sb = Math.sin(0.35);
    for (let o = 0; o < N_ORB; o++) {
      const litF = 24 + O.lit[o] * (50 / (N_ORB - 1)); // 24 → 74 一盏盏点亮，「万」之前全亮
      const lp = smooth(litF - 5, litF + 7, f);
      const fl = f >= litF ? Math.exp(-(f - litF) / 10) : 0;
      let cx = O.ox[o];
      let cy = O.oy[o] + 3 * Math.sin(t * 1.3 + O.ph[o]);
      let cz = 0;
      let lan = 0;
      let fade = 1;
      if (O.rel[o] >= 0) {
        const tau = f - (T.juan + O.rel[o] * 1.15);
        if (tau > 0) {
          lan = smooth(0, 18, tau);
          cy += 2.4 * tau + 0.05 * tau * tau;
          cz -= 4 * tau + 0.08 * tau * tau;
          cx += 16 * Math.sin(0.1 * tau + O.ph[o]) * Math.min(1, tau / 15) + (cx - CX) * 0.25 * Math.min(1, tau / 60);
          fade = 1 - smooth(48, 100, tau);
        }
      } else {
        fade = 1 - smooth(T.nage + 4, T.nage + 28, f); // 留下的 10 盏：安静地亮着，「那句」之后淡出
      }
      const bright = (0.42 + 0.58 * lp) * fade;
      const rot = t * (0.5 + 0.4 * hash01(o, 48)) + O.ph[o];
      const cr = Math.cos(rot);
      const sr = Math.sin(rot);
      for (let m = 0; m < PER; m++) {
        const i = o * PER + m;
        const lx = O.L[m * 3];
        const ly = O.L[m * 3 + 1];
        const lz = O.L[m * 3 + 2];
        const x1 = lx * cr + lz * sr;
        const z1 = -lx * sr + lz * cr;
        const y2 = ly * cb - z1 * sb;
        const z2 = ly * sb + z1 * cb;
        orb.pos[i * 3] = cx + R_ORB * x1;
        orb.pos[i * 3 + 1] = cy + R_ORB * y2;
        orb.pos[i * 3 + 2] = cz + R_ORB * z2;
        const h = hash01(i, 3);
        const core = m >= SHELL;
        orb.size[i] = core ? 3.4 + 1.6 * h : 3.8 + 2.8 * h * h;
        const a = (core ? 0.42 : 0.2 + 0.12 * h) * bright * (1 + 0.6 * fl);
        const w = Math.min(1, 0.25 + 0.5 * fl + 0.2 * lp);
        orb.col[i * 4] = mix(mix(GOLD[0], HI[0], w), AMB[0], 0.55 * lan);
        orb.col[i * 4 + 1] = mix(mix(GOLD[1], HI[1], w), AMB[1], 0.55 * lan);
        orb.col[i * 4 + 2] = mix(mix(GOLD[2], HI[2], w), AMB[2], 0.55 * lan);
        orb.col[i * 4 + 3] = a;
        orb.halo[i] = (core ? 1.4 : 0.4) * (1 + 1.2 * lan + 1.5 * fl);
      }
    }
    for (let i = N_ORB * PER; i < N; i++) orb.col[i * 4 + 3] = 0;
  } else if (riverOn) {
    // ================= b10 河：书页上的字（复本）从整页汇进一条蜿蜒的河，顺流而下、流出画面（流向看的人）
    const rx = (s: number) => CX + 230 * Math.sin(4.2 * s + 0.3);
    const endFade = 1 - smooth(dur - 44, dur - 4, f);
    for (let i = 0; i < N; i++) {
      const k4 = i * 4;
      if (hash01(i, 81) > 0.3) {
        orb.col[k4 + 3] = 0;
        continue;
      }
      const px = page.pos[i * 3];
      const py = page.pos[i * 3 + 1];
      const sj = Math.min(0.8, Math.max(0, (900 - py) / 2100)); // 在哪儿汇入河道
      const far = Math.min(1, Math.abs(px - rx(sj)) / 620);
      const tt = f - (RIVER0 + 56 * far + 22 * hash01(i, 82)); // 离河道近的先流
      if (tt <= 0) {
        orb.col[k4 + 3] = 0;
        continue;
      }
      const GA = 16 + 12 * far;
      const v = 1 / (70 + 20 * hash01(i, 84));
      const lat = (hash01(i, 83) - 0.5) * 2;
      const at3 = (s: number): [number, number, number] => {
        const e = Math.max(0, s - 0.55);
        return [rx(s) + lat * (40 + 120 * s) + 16 * noise3(s * 6, lat * 2, t * 0.6, 5), 900 - 2100 * s + 10 * noise3(s * 6 + 9, lat, t * 0.6, 6), 20 + 5200 * e * e];
      };
      let x: number;
      let y: number;
      let z: number;
      let s: number;
      if (tt < GA) {
        const u = EASE.inOut(tt / GA);
        s = sj + v * tt * 0.5;
        const [ex, ey, ez] = at3(s);
        x = mix(px, ex, u);
        y = mix(py, ey, u);
        z = mix(0, ez, u) + 40 * Math.sin(Math.PI * u);
      } else {
        s = sj + v * GA * 0.5 + v * (tt - GA);
        [x, y, z] = at3(s);
      }
      if (s >= 1.02) {
        orb.col[k4 + 3] = 0;
        continue;
      }
      const h = hash01(i, 3);
      orb.pos[i * 3] = x;
      orb.pos[i * 3 + 1] = y;
      orb.pos[i * 3 + 2] = z;
      orb.size[i] = cell * (0.9 + 0.35 * hash01(i, 86));
      orb.col[k4] = mix(GOLD[0], HI[0], 0.6);
      orb.col[k4 + 1] = mix(GOLD[1], HI[1], 0.6);
      orb.col[k4 + 2] = mix(GOLD[2], HI[2], 0.6);
      orb.col[k4 + 3] = (0.24 + 0.18 * h) * smooth(0, 6, tt) * (1 - smooth(0.88, 1.02, s)) * endFade;
      orb.halo[i] = 0.5 + 0.6 * h;
    }
  }

  // ================= b8–b9 口号墙
  const wallOn = f >= T.hero[0] - 6 && f < T.chap[7] + 30;
  const tagP = WD.tags.map((_, k) => prog(f, T.xuan - 10 + k * 4, T.xuan + 4 + k * 4, EASE.out) * (1 - prog(f, T.chap[0] - 24, T.chap[0] - 8)));
  if (wallOn) {
    const pz = prog(f, T.spread + 2, T.spread + 56, EASE.inOut);
    const Z = Math.exp(Math.log(Z0) * (1 - pz));
    const c0x = WD.ccx[C0];
    const c0y = WD.ccy[C0];
    const ax = mix(HERO[0], c0x, pz);
    const ay = mix(HERO[1], c0y, pz);
    const dens = smooth(1, 4, Z);
    const tagAny = Math.max(...tagP);
    const dimPre = 1 - 0.45 * smooth(T.chap[0] - 26, T.chap[0], f);
    for (let i = 0; i < N; i++) {
      const c = i >> 3;
      const j = i & 7;
      const k4 = i * 4;
      const h = hash01(i, 3);
      let x = (page.pos[i * 3] - c0x) * Z + ax;
      let y = (page.pos[i * 3 + 1] - c0y) * Z + ay;
      let z = 0;
      let size = cell * 0.98 * Z;
      let a: number;
      let w: number; // 往高光金混多少
      let halo = 0.6 + 0.8 * h;
      if (c === C0) {
        const ts = T.hero[j];
        const q = prog(f, ts - 2, ts + 9, EASE.out);
        const fl = f >= ts - 1 ? Math.exp(-(f - ts) / 12) : 0;
        size *= mix(1.5, 1, q);
        a = q * mix(0.85, 1, dens);
        w = 0.55 + 0.45 * fl;
        halo *= 1 + 3 * fl;
      } else {
        const sp = T.spread + WD.spawnK[c];
        const q = clamp01((f - sp) / 7);
        if (q <= 0) {
          W.col[k4 + 3] = 0;
          continue;
        }
        const fl = Math.exp(-(f - sp) / 6);
        size *= 0.35 + 0.65 * EASE.back(q);
        a = q * mix(0.34 + 0.26 * h, 0.82, dens) * (1 + 0.8 * fl);
        w = 0.15 + 0.6 * fl;
        halo *= 1 + 2.5 * fl;
      }
      // 「玄学？」：被标的那几份放大三倍，其余压暗
      if (tagAny > 0) {
        const k = WD.tags.indexOf(c);
        if (k >= 0 && tagP[k] > 0) {
          const ten = tagP[k];
          const s = 1 + (TAG_S - 1) * ten;
          x = WD.ccx[c] + (x - WD.ccx[c]) * s;
          y = WD.ccy[c] + (y - WD.ccy[c]) * s;
          size *= s;
          a = mix(a, 1, ten);
          w = mix(w, 0.8, ten);
          halo *= 1 - 0.5 * ten;
        } else a *= 1 - 0.42 * tagAny;
      }
      // b9：这个位置的书字飞来之前，口号字剥落
      const fd = smooth(BD.land[i] - BD.fly[i], BD.land[i] - 2, f);
      a *= dimPre * (1 - fd);
      z += 60 * fd;
      W.pos[i * 3] = x;
      W.pos[i * 3 + 1] = y;
      W.pos[i * 3 + 2] = z;
      W.size[i] = size;
      W.halo[i] = halo;
      W.col[k4] = mix(GOLD[0], HI[0], w);
      W.col[k4 + 1] = mix(GOLD[1], HI[1], w);
      W.col[k4 + 2] = mix(GOLD[2], HI[2], w);
      W.col[k4 + 3] = a;
    }
  }

  // ================= b9–结尾 整本书
  const bookOn = f >= T.chap[0] - 28;
  const closeUp = smooth(T.xian - 26, T.xian - 2, f) * (1 - smooth(T.xie - 4, T.xie + 22, f));
  if (bookOn) {
    const glowW = smooth(T.xie - 2, T.xie + 18, f) * (1 - smooth(RIVER0, RIVER0 + 30, f));
    const dimEnd = 1 - 0.32 * smooth(RIVER0, RIVER0 + 40, f) - 0.16 * smooth(dur - 60, dur - 10, f); // 光流走了，书页暗下来
    const litOff = 1 - smooth(T.xie + 2, T.xie + 20, f);
    const litX = smooth(T.xian - 4, T.xian + 8, f) * litOff;
    const litN = smooth(T.shu - 2, T.shu + 10, f) * litOff;
    const litJ = smooth(T.jie - 4, T.jie + 8, f) * litOff;
    for (let i = 0; i < N; i++) {
      const k4 = i * 4;
      const tl = BD.land[i];
      const d = BD.fly[i];
      const q = (f - (tl - d)) / d;
      if (q <= 0) {
        B.col[k4 + 3] = 0;
        continue;
      }
      const h = hash01(i, 3);
      const px = page.pos[i * 3];
      const py = page.pos[i * 3 + 1];
      let x = px;
      let y = py;
      let z = 0;
      let a: number;
      let w: number;
      let halo = 0.6 + 0.8 * h;
      let size = cell * 0.98;
      let rot = 0;
      if (q < 1) {
        const e = 1 - (1 - q) * (1 - q); // 飞来：像纸片一样边转边落定
        x = mix(BD.vx[i], px, e) + 40 * Math.sin(Math.PI * e) * (hash01(i, 77) - 0.5);
        y = mix(BD.vy[i], py, e);
        z = BD.vz[i] * (1 - e);
        a = 0.75 * smooth(0, 0.25, q);
        w = 0.6;
        halo *= 1.6;
        size *= 1 + 0.3 * (1 - e);
        rot = (1 - e) * (hash01(i, 78) - 0.5) * 4;
      } else {
        const g = Math.exp(-(f - tl) / 16); // 刚落下的字亮一下
        a = mix(0.36 + 0.22 * h, 1, 0.5 * g);
        w = 0.1 + 0.7 * g;
        halo *= 1 + 2 * g;
      }
      a *= 1 - 0.6 * closeUp;
      a = mix(a, Math.max(a, 0.62 + 0.2 * h), glowW);
      w = mix(w, 0.5, glowW);
      a *= dimEnd;
      let lit = 0;
      let nm = false;
      if (i >= R.xian.start && i < R.xian.end) lit = litX;
      else if (i >= R.names.start && i < R.names.end) {
        lit = litN;
        nm = true;
      } else if (i >= R.jie.start && i < R.jie.end) lit = litJ;
      let r = mix(GOLD[0], HI[0], w);
      let g2 = mix(GOLD[1], HI[1], w);
      let b = mix(GOLD[2], HI[2], w);
      if (lit > 0) {
        const tc = nm ? AMB : HI;
        a = mix(a, 1, lit);
        r = mix(r, tc[0], lit);
        g2 = mix(g2, tc[1], lit);
        b = mix(b, tc[2], lit);
        halo *= 1 - 0.7 * lit;
        size *= 1 + 0.12 * lit;
      }
      B.pos[i * 3] = x;
      B.pos[i * 3 + 1] = y;
      B.pos[i * 3 + 2] = z;
      B.size[i] = size;
      B.rot[i] = rot;
      B.halo[i] = halo;
      B.col[k4] = r;
      B.col[k4 + 1] = g2;
      B.col[k4 + 2] = b;
      B.col[k4 + 3] = a;
    }
  }

  // ================= 镜头
  const full: Cam = {pos: [0, 0, camZ()]};
  const b9a: Cam = {pos: [0, 110, camZ() / 1.12]}; // 改写开始时微微推近、看书的上半
  const [xa, ya] = ctr(R.xian);
  const [xn, yn] = ctr(R.names);
  const [xj, yj] = ctr(R.jie);
  const cX = camOn(xa, ya - 62, cell, 44);
  const cN = camOn(xn, yn - 62, cell, 36);
  const cJ = camOn(xj, yj - 62, cell, 44);
  const seq: [number, Cam][] = [
    [0, full],
    [T.chap[0] - 22, full],
    [T.chap[0] + 8, b9a],
    [T.chap[7] + 12, full],
    [T.xian - 28, full],
    [T.xian + 2, cX],
    [T.shu - 4, cX],
    [T.shu + 12, cN],
    [T.jie - 6, cN],
    [T.jie + 10, cJ],
    [T.xie - 10, cJ],
    [T.xie + 26, full],
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
  const camD = cam.pos![2] - (cam.target ? cam.target[2] : 0);
  const sc = camZ() / camD;
  const ty = cam.target ? cam.target[1] : cam.pos![1];

  // ================= DOM
  const s7 = 1 - prog(f, T.nage - 6, T.nage + 12);
  const seriesA = prog(f, T.series - 4, T.series + 10, EASE.out) * (1 - prog(f, T.xian - 36, T.xian - 22));
  return (
    <AbsoluteFill>
      <Backdrop light={[0.45, 0.45]} glow={1} />
      <GlyphCanvas camera={cam}>
        {wallOn ? <GlyphLayer state={W} glow={0.55} halo={0.14} haloSize={3} renderOrder={2} /> : null}
        {bookOn ? <GlyphLayer state={B} glow={0.55} halo={0.15} haloSize={3.2} renderOrder={4} /> : null}
        {orbOn || riverOn ? <GlyphLayer state={orb} glow={0.6} halo={0.2} haloSize={4} renderOrder={6} /> : null}
      </GlyphCanvas>
      <Vignette amount={0.5} />

      {/* b7：38 万 / 捐出 28 万 */}
      {s7 > 0.01 ? (
        <>
          <div style={{position: 'absolute', left: SAFE.cx, top: 366, transform: 'translateX(-50%)', opacity: s7 * prog(f, T.zimeiti - 4, T.zimeiti + 10, EASE.out), fontFamily: SERIF, fontSize: 46, letterSpacing: '0.18em', color: PAL.gold, textShadow: '0 2px 16px rgba(0,0,0,.8)', whiteSpace: 'nowrap'}}>
            做自媒体赚的
          </div>
          <Title text="38万" f={f} charStarts={[T.san[0], T.san[2], T.san[3]]} size={176} x={SAFE.cx} y={520} tracking={0.02} style={{opacity: s7}} />
          <Title text="捐出 28万" f={f} charStarts={[T.juan, T.juan + 4, T.juan + 4, T.er[0], T.er[2], T.er[3]]} size={104} x={SAFE.cx} y={1240} gradient={false} color={PAL.amber} tracking={0.04} style={{opacity: s7}} />
        </>
      ) : null}

      {/* b8：玄学？ */}
      {WD.tags.map((c, k) =>
        tagP[k] > 0.01 ? (
          <Label key={k} text="玄学？" x={540 + WD.ccx[c] + 4 * cell * TAG_S + 14} y={960 - WD.ccy[c] - 22} p={tagP[k]} size={30} color="rgba(214,208,198,.92)" bg="rgba(20,18,16,.66)" />
        ) : null,
      )}

      {/* b9：章名 + 日期，跟着正在长出来的那一章；左边缘的金条标出这一章在整页里的范围 */}
      {seriesA > 0.01 ? <Label text="《人选天选论》· 网上连载" x={SAFE.x0} y={350} p={seriesA} size={30} /> : null}
      {BOOK.chapters.map((ch, k) => {
        const pIn = prog(f, T.chap[k] - 3, T.chap[k] + 8, EASE.out);
        if (pIn <= 0) return null;
        const nextF = k < 7 ? T.chap[k + 1] : T.xian - 34;
        const pOut = prog(f, nextF - 3, nextF + 6, EASE.in);
        const op = pIn * (1 - pOut);
        const rs = Math.floor(ch.start / page.cols);
        const re = Math.floor((ch.end - 1) / page.cols);
        const dt = 960 - (page.y0 - rs * cell + cell / 2 - ty) * sc;
        const db = 960 - (page.y0 - re * cell - cell / 2 - ty) * sc;
        const ly = Math.max(410, Math.min(1192, (dt + db) / 2 - 60));
        const barOp = pIn * (0.3 + 0.65 * (1 - pOut)) * (1 - prog(f, T.xian - 34, T.xian - 18));
        return (
          <React.Fragment key={k}>
            {barOp > 0.01 ? <div style={{position: 'absolute', left: 22, top: dt + 3, width: 6, height: Math.max(0, db - dt - 6), background: PAL.amber, opacity: barOp, borderRadius: 3, boxShadow: '0 0 14px rgba(232,164,90,.85)'}} /> : null}
            {op > 0.01 ? (
              <div style={{position: 'absolute', left: SAFE.x0, top: ly, opacity: op, transform: `translateY(${(1 - pIn) * 18 - pOut * 18}px)`, padding: '12px 24px 14px 20px', background: 'rgba(13,11,9,.68)', borderLeft: `5px solid ${PAL.amber}`, borderRadius: 10, whiteSpace: 'nowrap'}}>
                <div style={{fontFamily: SERIF_BLACK, fontSize: 46, lineHeight: 1.2, color: PAL.goldHi, letterSpacing: '0.04em'}}>{chName(ch.title)}</div>
                <div style={{fontFamily: SANS, fontSize: 32, lineHeight: 1.3, marginTop: 4, color: PAL.amber, letterSpacing: '0.1em'}}>{chDate(ch.date)}</div>
              </div>
            ) : null}
          </React.Fragment>
        );
      })}

      {/* b10：原文出处 */}
      {closeUp > 0.01 ? <Label text="《人选天选论》· 第五章 · 原文" x={SAFE.x0 + 8} y={392} p={closeUp} size={32} /> : null}
    </AbsoluteFill>
  );
};

export const S: SceneMod = {
  C,
  hideSubs: [],
  sfx: ({at}) => {
    const def = sceneById('B2');
    const ch: number[] = [];
    let fb = nextBeatF(def, at('今年三月'));
    for (let k = 0; k < 8; k++) {
      ch.push(fb);
      fb = nextBeatF(def, fb + 1);
    }
    return [
      [at('三十八万') - 2, 'chime', 0.12, 80],
      [at('捐') + 2, 'gather', 0.18, 80],
      [at('人选祸') - 1, 'drop', 0.12, 25],
      [at('在网上传开') - 2, 'whoosh_soft', 0.12, 40],
      [at('在网上传开') + 4, 'gather', 0.16, 80],
      [at('当成了玄学') - 8, 'tick', 0.08, 8],
      [at('当成了玄学'), 'tick', 0.08, 8],
      ...ch.map((F, k): [number, string, number, number] => [F - 1, 'page', k === 0 ? 0.16 : 0.12, 26]),
      [at('先贤') - 2, 'chime', 0.12, 80],
      [at('是在还债') - 4, 'water_loop', 0.08, 140],
    ];
  },
};
