// 场景 H · 道痕七问（全片唯一的亮色纸面场景，观众会截图）。
// h1 字河：整本书的字排成一条条水流朝镜头流来，河底是字堆成的白石 / 黑石 →「捞」一块石头浮出水面，水面荡开一圈字的波纹
// h2「水流慢下来」流速降到几乎停住、水变清 → 镜头抬高俯看，河底的石头清清楚楚
// h3「他把这一页」【怎么做的】整条河的字飞起来，一行一行织成一张纸：字落到哪里，纸就长到哪里，纸纹就是整本书的 34952 个字
//    →「道痕」标题 →「只有七个问题」七个序号依次亮起
// h4–h10 每一问：书里那句原文先在纸纹里亮起（真的在书里），再按旁白开口的帧一个字一个字飞到它那一行，落成墨字；第七问金色
// h11 前六行描一道竖线（看石头）→「第七句」前六行变淡、第七行亮起，「选」字发光
// h12 纸页缩小，一个月 31 页扇形展开 → 每页同一位置的三颗石头依次亮起（连成三道弧）→「那几块石头」三道弧收成三块大石头
import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import type {SceneMod, SceneProps} from '../core/timeline';
import {Backdrop, PAL, SANS, SERIF, SERIF_BLACK, Vignette} from '../core/look';
import {EASE, clamp01, hex, mix, prog, smooth} from '../core/anim';
import {findInBook} from '../core/book';
import {Cam, GlyphCanvas, GlyphLayer, N_BOOK, camMix, camZ, hash01, noise3, useGState} from '../core/glyph';

const N = N_BOOK;
// ---- 字河
const N_ST = 6000; // 书的最后 6000 个字堆成河底的石头
const N_W = N - N_ST;
const LANES = 64;
const PER = Math.ceil(N_W / LANES);
const RW = 1000; // 河宽
const YF = 5200; // 河的远端
const RL = 6000; // 河长
const meander = (y: number) => 200 * Math.sin((y - 300) / 1700) + 60 * Math.sin((y - 300) / 600);
// [x（相对河心）, y, rx, ry, 0 白 / 1 黑, 旋转]
const STONES: [number, number, number, number, number, number][] = [
  [40, 520, 125, 84, 0, 0.3], // 0：今天捞起来的那块
  [-300, 250, 95, 66, 1, -0.4],
  [270, 130, 80, 56, 1, 0.8],
  [-130, 900, 140, 92, 1, 0.1],
  [320, 770, 100, 70, 0, -0.6],
  [-350, 1250, 120, 80, 0, 0.5],
  [160, 1360, 90, 62, 1, -0.2],
  [-60, -70, 70, 50, 0, 0.9],
  [420, 1700, 130, 85, 1, 0.2],
  [-280, 1960, 100, 70, 0, -0.3],
  [80, 2300, 150, 100, 1, 0.6],
  [-210, 560, 60, 42, 1, 0.0],
];
// ---- 纸（DOM 左上原点）
const PX0 = 48;
const PY0 = 330;
const PW = 800;
const PH = 970;
const PCX = PX0 + PW / 2; // 448
const PCY = PY0 + PH / 2; // 815
const COLS = 170;
const CELL = 4.7;
const ROWS = Math.ceil(N / COLS);
const GX0 = PX0 + (PW - COLS * CELL) / 2 + CELL / 2 - 540;
const GY0 = 960 - (PY0 + (PH - ROWS * CELL) / 2 + CELL / 2);
const SPREAD = 34; // 织纸：从上到下扫过的帧数
const DUR = 22; // 每个字飞行帧数
// ---- 七问版式
const QS = 46;
const TX0 = 150;
const NUM_X = 112;
const ROW_Y = [622, 710, 798, 886, 974, 1062, 1150];
const Q7_BREAK = 12;
const Q7_LH = 60;
const QUESTIONS = [
  {say: '今天最起波澜的一件事是什么', id: 'h4'},
  {say: '当时我的第一反应是什么', id: 'h5'},
  {say: '我其实想得到什么', id: 'h6'},
  {say: '我其实在害怕什么', id: 'h7'},
  {say: '我给自己找了什么理由', id: 'h8'},
  {say: '今天捞出来的主石头是什么', id: 'h9'},
  {say: '如果明天再遇到同样的事，我准备怎么选', id: 'h10'},
];
const ICON: Record<number, 'white' | 'black' | 'ripple'> = {2: 'white', 3: 'black', 4: 'ripple'};
const slotOf = (q: number, k: number): [number, number] => {
  const line2 = q === 6 && k >= Q7_BREAK;
  const kk = line2 ? k - Q7_BREAK : k;
  return [TX0 + (kk + 0.5) * QS, ROW_Y[q] + (line2 ? Q7_LH : 0)];
};
// ---- 一个月的纸（h12）
const FAN_N = 31;
const FAN_MID = 15;
const FAN_SC = 0.36;
const FAN_CX = 520;
const FAN_CY = 790;
const FAN_R = 430; // 扇子的轴在页中心下方
const FAN_DEG = 46;
const MARKS: [number, number, 'white' | 'black'][] = [
  [362, -105, 'white'],
  [362, 71, 'black'],
  [362, 247, 'white'],
];
const BIG: [number, number, number][] = [
  [FAN_CX - 165, 492, 1.0],
  [FAN_CX, 478, 1.08],
  [FAN_CX + 165, 492, 0.86],
];

const GOLD = hex(PAL.gold);
const HI = hex(PAL.goldHi);
const CREAM = hex(PAL.cream);
const SLATE = hex(PAL.slate);
const INK = hex('#2A2118');
const AMBER = hex('#B8741C');
const GOLDINK = hex('#A86A16');
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ------------------------------------------------------------------ 小图标（SVG）
const STONE_PATH = 'M8 40 C6 20 30 6 54 7 C80 8 96 22 94 40 C92 58 72 67 48 66 C24 65 10 58 8 40 Z';
const Stone: React.FC<{kind: 'white' | 'black'; w: number; id: string; glow?: number}> = ({kind, w, id, glow = 0}) => {
  const white = kind === 'white';
  return (
    <svg
      width={w}
      height={w * 0.72}
      viewBox="0 0 100 72"
      style={{display: 'block', overflow: 'visible', filter: glow > 0.01 ? `drop-shadow(0 0 ${4 + 16 * glow}px rgba(255,186,84,${0.9 * glow}))` : 'drop-shadow(0 2px 2px rgba(60,40,20,.28))'}}
    >
      <defs>
        <radialGradient id={id} cx="38%" cy="30%" r="78%">
          {white ? (
            <>
              <stop offset="0" stopColor="#FFFFFF" />
              <stop offset=".55" stopColor="#EFE9DD" />
              <stop offset="1" stopColor="#CDC2AE" />
            </>
          ) : (
            <>
              <stop offset="0" stopColor="#6E7580" />
              <stop offset=".5" stopColor="#30353D" />
              <stop offset="1" stopColor="#15171B" />
            </>
          )}
        </radialGradient>
      </defs>
      <path d={STONE_PATH} fill={`url(#${id})`} stroke={white ? 'rgba(110,86,56,.5)' : 'rgba(8,8,10,.55)'} strokeWidth={2.2} />
    </svg>
  );
};
const Ripple: React.FC<{w: number}> = ({w}) => (
  <svg width={w} height={w * 0.6} viewBox="0 0 100 60" style={{display: 'block', overflow: 'visible'}}>
    {[11, 25, 40].map((r, k) => (
      <ellipse key={k} cx={50} cy={30} rx={r * 1.2} ry={r * 0.52} fill="none" stroke="#647691" strokeWidth={4 - k * 0.9} opacity={1 - k * 0.27} />
    ))}
  </svg>
);
const Icon: React.FC<{kind: 'white' | 'black' | 'ripple'; id: string}> = ({kind, id}) => (kind === 'ripple' ? <Ripple w={50} /> : <Stone kind={kind} w={48} id={id} />);

/** 世界坐标 → 屏幕像素（和 GlyphCanvas 的镜头一致：fov 40、up = +y）。返回 [x, y, 该深度下 1 单位 = 几像素] */
const project = (cam: Cam, p: [number, number, number]): [number, number, number] => {
  const P = cam.pos ?? [0, 0, camZ()];
  const Tg = cam.target ?? [P[0], P[1], 0];
  let fx = Tg[0] - P[0];
  let fy = Tg[1] - P[1];
  let fz = Tg[2] - P[2];
  const fl = Math.hypot(fx, fy, fz);
  fx /= fl;
  fy /= fl;
  fz /= fl;
  const rl = Math.hypot(fz, fx);
  const rx = -fz / rl;
  const rz = fx / rl;
  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;
  const dx = p[0] - P[0];
  const dy = p[1] - P[1];
  const dz = p[2] - P[2];
  const cz = dx * fx + dy * fy + dz * fz;
  const k = camZ() / Math.max(1, cz);
  return [540 + (dx * rx + dz * rz) * k, 960 - (dx * ux + dy * uy + dz * uz) * k, k];
};
const PAPER_BG = `radial-gradient(ellipse 85% 70% at 42% 34%, #FCF9F2 0%, ${PAL.paper} 52%, #E7DDCA 100%)`;

/** 一个月里的一页（缩小的道痕页：标题 + 七行；不需要读清，只要像） */
const MiniPage: React.FC<{shade: number}> = ({shade}) => (
  <div style={{position: 'absolute', left: 0, top: 0, width: PW, height: PH, borderRadius: 10, background: PAPER_BG, boxShadow: '0 30px 70px rgba(0,0,0,.5)', filter: `brightness(${shade})`}}>
    <div style={{position: 'absolute', left: 0, width: PW, top: 108 - 70, textAlign: 'center', fontFamily: SERIF_BLACK, fontSize: 116, lineHeight: '140px', color: PAL.inkText, letterSpacing: '0.25em', textIndent: '0.25em'}}>道痕</div>
    <div style={{position: 'absolute', left: 52, width: PW - 104, top: 230, height: 3, background: 'rgba(60,45,30,.25)'}} />
    {QUESTIONS.map((q, k) => {
      const n = [...q.say].length + 1;
      const lines = k === 6 ? [Q7_BREAK, n - Q7_BREAK] : [n];
      return lines.map((len, j) => (
        <React.Fragment key={k + '-' + j}>
          {j === 0 ? <div style={{position: 'absolute', left: NUM_X - PX0 - 12, top: ROW_Y[k] - PY0 - 12, width: 24, height: 24, borderRadius: 12, background: k === 6 ? '#C48C2E' : 'rgba(150,115,70,.75)'}} /> : null}
          <div style={{position: 'absolute', left: TX0 - PX0, top: ROW_Y[k] + j * Q7_LH - PY0 - 11, width: len * QS - 10, height: 22, borderRadius: 11, background: k === 6 ? 'rgba(190,135,45,.85)' : 'rgba(42,33,24,.42)'}} />
        </React.Fragment>
      ));
    })}
  </div>
);

// ------------------------------------------------------------------ scene
const C: React.FC<SceneProps> = ({f: fRaw, dur, at, atc}) => {
  const f = Math.min(fRaw, dur - 1);
  const st = useGState();
  const ink = useGState();

  const T = useMemo(() => {
    const page = at('他把这一页');
    return {
      scoop: at('捞'),
      slow: at('水流慢下来'),
      bottom: at('才看得见底'),
      bottomEnd: at('看得见底', 0, 1),
      L0: page - 21, // 河里的字开始起飞
      title: atc('道痕'),
      seven: atc('只有七个问题'),
      qL: QUESTIONS.map((q) => atc(q.say, 0, q.id)),
      front6: at('前六句'),
      look: at('看石头'),
      seventh: at('第七句'),
      xuan: at('选择'),
      week: at('每周回看'),
      month: at('每个月'),
      recur: at('反复出现'),
      sway: at('翻来覆去'),
      push: at('推着你走'),
      stones: at('那几块石头'),
    };
  }, [at, atc]);

  // 每个字：纸上的位置（书的阅读顺序）、起飞帧、落地帧
  const G = useMemo(() => {
    const tx = new Float32Array(N);
    const ty = new Float32Array(N);
    const tl = new Float32Array(N);
    const land = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const row = (i / COLS) | 0;
      const col = i - row * COLS;
      tx[i] = GX0 + col * CELL;
      ty[i] = GY0 - row * CELL;
      tl[i] = T.L0 + SPREAD * (row / (ROWS - 1)) + 5 * hash01(i, 21);
      land[i] = tl[i] + DUR + 6 * hash01(i, 22);
    }
    return {tx, ty, tl, land};
  }, [T]);

  // 河底石头（书的最后 6000 个字）
  const SD = useMemo(() => {
    const pos = new Float32Array(N_ST * 3);
    const sid = new Uint8Array(N_ST);
    const shade = new Float32Array(N_ST);
    const areas = STONES.map((s) => s[2] * s[3]);
    const tot = areas.reduce((a, b) => a + b, 0);
    let j = 0;
    STONES.forEach((s, si) => {
      const n = si === STONES.length - 1 ? N_ST - j : Math.round((N_ST * areas[si]) / tot);
      const [ox, cy, rx, ry, , rot] = s;
      const cx = ox + meander(cy);
      const c = Math.cos(rot);
      const sn = Math.sin(rot);
      for (let m = 0; m < n && j < N_ST; m++, j++) {
        const r = Math.sqrt((m + 0.5) / n);
        const th = m * 2.39996323;
        const wob = 1 + 0.07 * Math.sin(th * 3 + si * 1.7);
        const lx = rx * r * Math.cos(th) * wob;
        const ly = ry * r * Math.sin(th) * wob;
        pos[j * 3] = cx + lx * c - ly * sn;
        pos[j * 3 + 1] = cy + lx * sn + ly * c;
        pos[j * 3 + 2] = -70 + 34 * (1 - r * r);
        sid[j] = si;
        shade[j] = Math.max(0.25, Math.min(1, 0.72 + 0.32 * r * (-Math.cos(th) * 0.7 + Math.sin(th) * 0.7) - 0.3 * Math.pow(r, 6)));
      }
    });
    const s0 = STONES[0];
    return {pos, sid, shade, c0: [s0[0] + meander(s0[1]), s0[1]] as [number, number]};
  }, []);

  // 流速积分（帧 → 河水走过的相位）
  const FLOW = useMemo(() => {
    const S = new Float32Array(1500);
    let s = 0;
    for (let k = 0; k < 1500; k++) {
      S[k] = s;
      s += (150 * (1 - 0.94 * smooth(T.slow, T.slow + 45, k))) / RL / 30;
    }
    return S;
  }, [T]);
  const Sat = (x: number) => {
    const k = Math.max(0, Math.min(1498, Math.floor(x)));
    return FLOW[k] + (FLOW[k + 1] - FLOW[k]) * (x - k);
  };

  // 原文：七问在书里的位置 + 每个字要落到的纸上位置
  const QD = useMemo(
    () =>
      QUESTIONS.map((q, qi) => {
        const r = findInBook(q.say);
        const n = Math.min(r.end - r.start, [...q.say].length);
        const slots: [number, number][] = [];
        for (let k = 0; k < n; k++) {
          const [x, y] = slotOf(qi, k);
          slots.push([x - 540, 960 - (y + 2.4)]);
        }
        return {start: r.start, n, slots};
      }),
    [],
  );

  // 捞起的石头
  const lift = prog(f, T.scoop - 8, T.scoop + 40, EASE.out);
  const stoneLift = (x: number) => prog(x, T.scoop - 8, T.scoop + 40, EASE.out);
  const seeBottom = prog(f, T.bottom - 12, T.bottomEnd + 4, EASE.inOut);
  const t = f / 30;
  const src = [0, 0, 0];
  const water = (i: number, x: number) => {
    const lane = i % LANES;
    const k = (i / LANES) | 0;
    let u = k / PER + Sat(x) + hash01(lane, 5);
    u -= Math.floor(u);
    const y = YF - u * RL;
    const calm = 1 - 0.9 * smooth(T.slow, T.slow + 45, x);
    const tt = x / 30;
    const lx = ((lane + 0.5) / LANES - 0.5) * RW;
    src[0] = lx + meander(y) + calm * 5 * Math.sin(y / 75 + tt * 2.2 + lane * 1.7);
    src[1] = y;
    src[2] = calm * 9 * noise3(lx / 200, y / 200, tt * 0.5, 31);
  };
  const stonePos = (j: number, x: number) => {
    src[0] = SD.pos[j * 3];
    src[1] = SD.pos[j * 3 + 1];
    src[2] = SD.pos[j * 3 + 2];
    if (SD.sid[j] === 0) {
      const l = stoneLift(x);
      src[1] -= 50 * l;
      src[2] += l * (500 + 12 * Math.sin((x / 30) * 1.7));
    }
  };

  // 推近纸面的程度（0..1）
  const closeAmt = f < T.L0 + 12 ? 0 : prog(f, T.L0 + 12, T.L0 + 20) * (1 - prog(f, T.L0 + 25, T.title[0] - 2, EASE.inOut));
  // ---------------- 加色层：字河 + 飞起织纸
  const stOn = f < T.L0 + SPREAD + 5 + DUR + 6 + 16;
  if (stOn) {
    const S = Sat(f);
    const waterVis = mix(1, 0.3, seeBottom);
    const stoneVis = mix(0.3, 0.95, seeBottom);
    const rip = f >= T.scoop - 4 ? Math.exp(-(f - T.scoop) / 50) : 0;
    const ripFront = (f - T.scoop + 4) * 9;
    const paperWY = 960 - (PY0 + ((f - (T.L0 + 31)) / SPREAD) * PH);
    for (let i = 0; i < N; i++) {
      const k4 = i * 4;
      const k3 = i * 3;
      const land = G.land[i];
      if (f >= land + 16) {
        st.col[k4 + 3] = 0;
        continue;
      }
      const tl = G.tl[i];
      const isStone = i >= N_W;
      const j = i - N_W;
      if (isStone) stonePos(j, Math.min(f, tl));
      else water(i, Math.min(f, tl));
      // 源头（河里）的样子
      const h = hash01(i, 3);
      let r: number;
      let g: number;
      let b: number;
      let a: number;
      let size: number;
      let halo: number;
      if (isStone) {
        const sh = SD.shade[j];
        const base = STONES[SD.sid[j]][4] === 0 ? CREAM : SLATE;
        const today = SD.sid[j] === 0 ? stoneLift(Math.min(f, tl)) : 0;
        r = base[0] * (0.55 + 0.45 * sh);
        g = base[1] * (0.55 + 0.45 * sh);
        b = base[2] * (0.55 + 0.45 * sh);
        a = mix(stoneVis * (0.35 + 0.55 * sh), 0.45 + 0.35 * sh, today);
        size = 8.6;
        halo = 0.5 + 0.9 * today;
      } else {
        const y = src[1];
        const fade = smooth(-850, -600, y) * (1 - smooth(2400, 5000, y));
        const edge = 1 - Math.pow(Math.abs((((i % LANES) + 0.5) / LANES) * 2 - 1), 6);
        const gn = noise3(src[0] / 170, (y + S * RL) / 170, t * 0.5, 17);
        const gl = gn > 0.3 ? (gn - 0.3) * 2.2 : 0;
        let ring = 0;
        if (rip > 0.01) {
          const d = Math.hypot(src[0] - SD.c0[0], y - SD.c0[1]);
          ring = rip * Math.exp(-Math.pow((d - ripFront) / 55, 2));
          src[2] += 30 * ring;
        }
        a = ((0.17 + 0.28 * h * h) * waterVis + 0.35 * gl * waterVis + 0.5 * ring) * fade * edge;
        size = 9.5 + 5 * h * h * h;
        const w = Math.min(1, gl + ring);
        r = mix(GOLD[0], HI[0], w);
        g = mix(GOLD[1], HI[1], w);
        b = mix(GOLD[2], HI[2], w);
        halo = 0.4 + 2 * w;
      }
      let x = src[0];
      let y = src[1];
      let z = src[2];
      if (f > tl) {
        const D = land - tl;
        const q = Math.min(1, (f - tl) / D);
        const e = easeIO(q);
        const arc = Math.sin(Math.PI * q);
        x = x + (G.tx[i] - x) * e + 140 * arc * (hash01(i, 7) - 0.5) * 2;
        y = y + (G.ty[i] - y) * e;
        z = z * (1 - e) + 140 * arc * (0.5 + hash01(i, 9));
        size = mix(size, CELL * 1.05, e);
        r = mix(r, HI[0], e);
        g = mix(g, HI[1], e);
        b = mix(b, HI[2], e);
        a = mix(a, mix(0.55, 0.36, closeAmt), smooth(0, 0.5, q));
        halo = mix(halo, 1, e);
        // 飞到已经织好的纸上方时压暗（加色叠在亮纸上会发白）
        if (x > GX0 - 20 && x < GX0 + COLS * CELL + 20) a *= mix(1, 0.3, smooth(paperWY - 40, paperWY + 40, y));
        if (f >= land) {
          const p = f - land;
          a = 0.35 * Math.exp(-p / 2.5);
          halo = 0.6 * Math.exp(-p / 2.5);
        }
      }
      st.pos[k3] = x;
      st.pos[k3 + 1] = y;
      st.pos[k3 + 2] = z;
      st.size[i] = size;
      st.halo[i] = halo;
      st.col[k4] = r;
      st.col[k4 + 1] = g;
      st.col[k4 + 2] = b;
      st.col[k4 + 3] = a;
    }
  }

  // ---------------- h12：整页缩小 → 一个月的纸扇形展开
  const pS = prog(f, T.week - 12, T.week + 16, EASE.inOut);
  const sc = mix(1, FAN_SC, pS);
  const ptx = (FAN_CX - PCX) * pS;
  const pty = (FAN_CY - PCY) * pS;
  const fanP = prog(f, T.week + 6, T.month + 18, EASE.inOut);
  const swayA = 4 * Math.sin(((f - T.sway) / 30) * Math.PI * 2 * 0.9) * smooth(T.sway - 6, T.sway + 6, f) * (1 - smooth(T.push + 6, T.stones - 6, f));
  const gather = (k: number) => prog(f, T.stones - 14 + Math.abs(k - FAN_MID) * 0.5, T.stones + 6 + Math.abs(k - FAN_MID) * 0.5, EASE.inOut);

  // ---------------- 墨色层：纸纹（整本书）+ 七问的字从书里飞上纸
  const inkOn = f >= T.L0 + 16;
  if (inkOn) {
    const texFade = 1 - 0.9 * pS;
    const ox = PCX + ptx - 540;
    const oy = 960 - (PCY + pty);
    const cx0 = PCX - 540;
    const cy0 = 960 - PCY;
    for (let i = 0; i < N; i++) {
      const land = G.land[i];
      const k3 = i * 3;
      ink.pos[k3] = ox + (G.tx[i] - cx0) * sc;
      ink.pos[k3 + 1] = oy + (G.ty[i] - cy0) * sc;
      ink.pos[k3 + 2] = 0;
      ink.size[i] = CELL * 0.98 * sc;
      ink.halo[i] = 0;
      ink.col[i * 4] = INK[0];
      ink.col[i * 4 + 1] = INK[1];
      ink.col[i * 4 + 2] = INK[2];
      ink.col[i * 4 + 3] = (0.11 + 0.14 * closeAmt) * smooth(land - 1, land + 8, f) * texFade;
    }
    // 七问：原文先在纸纹里亮起，再一个字一个字飞到它那一行
    QD.forEach((qd, qi) => {
      const Ls = T.qL[qi];
      const hiA = smooth(Ls[0] - 34, Ls[0] - 20, f);
      if (hiA <= 0) return;
      const tgt = qi === 6 ? GOLDINK : INK;
      for (let k = 0; k < qd.n; k++) {
        const i = qd.start + k;
        const Lk = Ls[Math.min(k, Ls.length - 1)];
        const launch = Lk - 15;
        const k3 = i * 3;
        const k4 = i * 4;
        if (f < launch) {
          ink.size[i] = CELL * (1 + 1.5 * hiA);
          ink.col[k4] = AMBER[0];
          ink.col[k4 + 1] = AMBER[1];
          ink.col[k4 + 2] = AMBER[2];
          ink.col[k4 + 3] = mix(0.11, 1, hiA);
          continue;
        }
        if (f >= Lk + 8) {
          ink.col[k4 + 3] = 0;
          continue;
        }
        const q = clamp01((f - launch) / 15);
        const e = EASE.inOut(q);
        const [gx, gy] = qd.slots[k];
        ink.pos[k3] = mix(ink.pos[k3], gx, e);
        ink.pos[k3 + 1] = mix(ink.pos[k3 + 1], gy, e) + 26 * Math.sin(Math.PI * q);
        ink.pos[k3 + 2] = 90 * Math.sin(Math.PI * q);
        ink.size[i] = mix(CELL * 2.5, QS * 1.2, e);
        ink.col[k4] = mix(AMBER[0], tgt[0], e);
        ink.col[k4 + 1] = mix(AMBER[1], tgt[1], e);
        ink.col[k4 + 2] = mix(AMBER[2], tgt[2], e);
        ink.col[k4 + 3] = 1 - smooth(Lk + 1, Lk + 7, f);
      }
    });
  }

  // ---------------- 镜头
  const full: Cam = {pos: [0, 0, camZ()]};
  const camA: Cam = {pos: [0, -1500, 780], target: [0, 470, 0]};
  const camB: Cam = {pos: [0, -1340, 800], target: [0, 580, 0]};
  const camC: Cam = {pos: [40, 160, 1750], target: [40, 560, 0]};
  const closeUp: Cam = {pos: [GX0 + 135, GY0 - 230, camZ() / 4], target: [GX0 + 135, GY0 - 230, 0]};
  const seq: [number, Cam][] = [
    [0, camA],
    [T.slow - 10, camB],
    [T.bottomEnd + 4, camC],
    [T.L0 + 2, camC],
    [T.L0 + 20, closeUp],
    [T.L0 + 25, closeUp],
    [T.title[0] - 2, full],
  ];
  let cam = full;
  for (let k = 1; k < seq.length; k++) {
    if (f <= seq[k][0]) {
      const [f0, c0] = seq[k - 1];
      const [f1, c1] = seq[k];
      cam = camMix(c0, c1, EASE.inOut(clamp01((f - f0) / Math.max(1, f1 - f0))));
      break;
    }
    cam = seq[k][1];
  }

  // ---------------- DOM
  // 镜头是正对纸面时，DOM 纸跟着镜头一起缩放（推近 / 拉远时纸和字粒子对得上）
  const camCz = cam.pos![2] - (cam.target ? cam.target[2] : 0);
  const camS = camZ() / camCz;
  const camX = cam.target ? cam.target[0] : cam.pos![0];
  const camY = cam.target ? cam.target[1] : cam.pos![1];
  const camTf = `translate(${540 - 540 * camS - camX * camS}px, ${960 - 960 * camS + camY * camS}px) scale(${camS})`;
  const paperOn = f >= T.L0 + 18;
  const front = ((f - (T.L0 + 31)) / SPREAD) * PH; // 纸长到哪里（像素，从纸顶算）
  const mask = front < PH + 90 ? `linear-gradient(180deg, #000 0px, #000 ${front - 60}px, transparent ${front + 30}px)` : undefined;
  const pageTf = `translate(${ptx}px, ${pty}px) scale(${sc})`;
  const titleCh = ['道', '痕'];
  const subA = prog(f, T.title[1] + 6, T.title[1] + 22, EASE.out);
  const ruleP = prog(f, T.title[1] + 4, T.title[1] + 24, EASE.out);
  const numAt = (k: number) => T.seven[0] + 4 + k * 3;
  const dim6 = 1 - 0.6 * prog(f, T.seventh, T.seventh + 12);
  const brack6 = prog(f, T.front6, T.front6 + 20, EASE.out) * (1 - prog(f, T.seventh, T.seventh + 10));
  const brack7 = prog(f, T.seventh, T.seventh + 14, EASE.out);
  const glow7 = prog(f, T.seventh, T.seventh + 16);
  const xuanG = prog(f, T.xuan - 4, T.xuan + 10);
  const lookBump = Math.exp(-Math.pow((f - T.look - 6) / 7, 2));
  const labelA = prog(f, T.qL[0][0] - 24, T.qL[0][0] - 8);
  const fanOn = f >= T.week - 2;
  const lit = (k: number) => prog(f, T.recur + Math.abs(k - FAN_MID) * 1.5, T.recur + 8 + Math.abs(k - FAN_MID) * 1.5, EASE.out);
  const fanDim = 1 - 0.38 * prog(f, T.stones - 14, T.stones + 10);
  const bigP = prog(f, T.stones + 2, T.stones + 20, EASE.back);
  const angle = (k: number) => ((k - FAN_MID) / FAN_MID) * FAN_DEG * fanP + swayA * ((k - FAN_MID) / FAN_MID);
  const pivot = [FAN_CX, FAN_CY + FAN_R];
  const markXY = (k: number, m: [number, number, string]): [number, number] => {
    const th = (angle(k) * Math.PI) / 180;
    const px = FAN_CX + (k < FAN_MID ? -m[0] : m[0]) * FAN_SC - pivot[0];
    const py = FAN_CY + m[1] * FAN_SC - pivot[1];
    return [pivot[0] + px * Math.cos(th) - py * Math.sin(th), pivot[1] + px * Math.sin(th) + py * Math.cos(th)];
  };
  const fanOrder = Array.from({length: FAN_N}, (_, k) => k).filter((k) => k !== FAN_MID).sort((a, b) => Math.abs(b - FAN_MID) - Math.abs(a - FAN_MID));

  // 「每天捞一块」：一只光的手——石头周围一团暖光 + 上方一道柔光
  const beamA = prog(f, T.scoop - 10, T.scoop + 8, EASE.out) * (1 - prog(f, T.scoop + 70, T.scoop + 130));
  const [bmx, bmy, bmk] = project(cam, [SD.c0[0], SD.c0[1] - 50 * lift, -53 + 500 * lift + 12 * Math.sin(t * 1.7) * lift]);
  const bmR = 125 * bmk;
  // 结尾慢慢推近三块石头
  const endPush = 1 + 0.05 * prog(f, T.stones - 20, dur - 1, EASE.inOut);
  return (
    <AbsoluteFill>
      <Backdrop light={[0.5, paperOn ? 0.42 : 0.3]} glow={1.1} />
      <AbsoluteFill style={{transformOrigin: `${FAN_CX}px 640px`, transform: endPush > 1.0001 ? `scale(${endPush})` : undefined}}>
      {/* 一个月的纸（在今天这页后面） */}
      {fanOn
        ? fanOrder.map((k) => (
            <div
              key={k}
              style={{
                position: 'absolute',
                left: FAN_CX - (PW * FAN_SC) / 2,
                top: FAN_CY - (PH * FAN_SC) / 2,
                width: PW * FAN_SC,
                height: PH * FAN_SC,
                transformOrigin: `${(PW * FAN_SC) / 2}px ${(PH * FAN_SC) / 2 + FAN_R}px`,
                transform: `rotate(${angle(k)}deg)`,
                opacity: smooth(0, 0.08, fanP + 0.02),
              }}
            >
              <div style={{position: 'absolute', left: 0, top: 0, width: PW, height: PH, transformOrigin: '0 0', transform: `scale(${FAN_SC})`}}>
                <MiniPage shade={(0.97 - 0.012 * Math.abs(k - FAN_MID)) * fanDim} />
              </div>
            </div>
          ))
        : null}
      {/* 今天这页：纸 */}
      {paperOn ? (
        <AbsoluteFill style={{transformOrigin: '0 0', transform: camTf}}>
        <AbsoluteFill style={{transformOrigin: `${PCX}px ${PCY}px`, transform: pageTf, filter: fanDim < 0.999 ? `brightness(${fanDim})` : undefined}}>
          <div style={{position: 'absolute', left: PX0 - 60, top: PY0 - 60, width: PW + 120, height: PH + 120, borderRadius: 60, background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(255,214,150,.20), rgba(255,214,150,0) 70%)', opacity: clamp01(front / PH)}} />
          <div
            style={{
              position: 'absolute',
              left: PX0,
              top: PY0,
              width: PW,
              height: PH,
              borderRadius: 10,
              background: PAPER_BG,
              boxShadow: '0 40px 90px rgba(0,0,0,.55), inset 0 0 0 1.5px rgba(120,90,50,.16), inset 0 0 60px rgba(160,120,70,.10)',
              WebkitMaskImage: mask,
              maskImage: mask,
            }}
          />
        </AbsoluteFill>
        </AbsoluteFill>
      ) : null}
      <GlyphCanvas camera={cam}>
        {stOn ? <GlyphLayer state={st} glow={mix(0.55, 0.3, closeAmt)} halo={mix(0.17, 0.04, closeAmt)} haloSize={3} renderOrder={2} /> : null}
        {inkOn ? <GlyphLayer state={ink} glow={0} blend="normal" renderOrder={6} /> : null}
      </GlyphCanvas>
      {beamA > 0.01 ? (
        <>
          <div style={{position: 'absolute', left: bmx - 0.75 * bmR, top: -40, width: 1.5 * bmR, height: Math.max(0, bmy + 40), background: 'linear-gradient(180deg, rgba(255,232,190,0) 0%, rgba(255,232,190,.10) 60%, rgba(255,232,190,.22) 100%)', filter: 'blur(22px)', opacity: beamA, mixBlendMode: 'screen'}} />
          <div style={{position: 'absolute', left: bmx - 1.7 * bmR, top: bmy - 1.25 * bmR, width: 3.4 * bmR, height: 2.5 * bmR, borderRadius: '50%', background: 'radial-gradient(ellipse at 50% 50%, rgba(255,224,165,.42), rgba(255,224,165,.12) 40%, rgba(255,224,165,0) 68%)', opacity: beamA, mixBlendMode: 'screen'}} />
        </>
      ) : null}
      {/* 今天这页：字（锐利的 DOM） */}
      {paperOn ? (
        <AbsoluteFill style={{transformOrigin: '0 0', transform: camTf}}>
        <AbsoluteFill style={{transformOrigin: `${PCX}px ${PCY}px`, transform: pageTf, filter: fanDim < 0.999 ? `brightness(${fanDim})` : undefined}}>
          {/* 标题 */}
          <div style={{position: 'absolute', left: PX0, width: PW, top: 438 - 70, textAlign: 'center', whiteSpace: 'nowrap', lineHeight: '140px'}}>
            {titleCh.map((c, k) => {
              const p = prog(f, T.title[k] - 3, T.title[k] + 10, EASE.out);
              return (
                <span key={k} style={{display: 'inline-block', fontFamily: SERIF_BLACK, fontSize: 116, color: PAL.inkText, margin: '0 0.12em', opacity: p, transform: `scale(${mix(1.18, 1, p)})`, filter: `blur(${(1 - p) * 7}px)`}}>
                  {c}
                </span>
              );
            })}
          </div>
          <div style={{position: 'absolute', left: PX0, width: PW, top: 522 - 22, textAlign: 'center', fontFamily: SERIF, fontSize: 32, lineHeight: '44px', letterSpacing: '0.5em', textIndent: '0.5em', color: 'rgba(42,33,24,.55)', opacity: subA}}>
            每天写一页
          </div>
          <div style={{position: 'absolute', left: PCX - 348 * ruleP, width: 696 * ruleP, top: 562, height: 2, background: 'rgba(60,45,30,.28)'}} />
          {/* 七行 */}
          {QUESTIONS.map((q, qi) => {
            const chars = [...q.say];
            const Ls = T.qL[qi];
            const nA = prog(f, numAt(qi) - 2, numAt(qi) + 6, EASE.out);
            const nS = prog(f, numAt(qi) - 2, numAt(qi) + 8, EASE.back);
            const gold = qi === 6;
            const rowA = qi < 6 ? dim6 : 1;
            const lastF = Ls[Ls.length - 1];
            const dotA = prog(f, lastF + 3, lastF + 9, EASE.out);
            const lines = gold ? [0, 1] : [0];
            return (
              <React.Fragment key={qi}>
                {lines.map((j) => (
                  <div key={'r' + j} style={{position: 'absolute', left: 96, width: 704 * nA, top: ROW_Y[qi] + j * Q7_LH + 34, height: 1.5, background: gold ? 'rgba(190,140,60,.32)' : 'rgba(60,45,30,.13)'}} />
                ))}
                <div style={{position: 'absolute', left: NUM_X - 30, width: 60, top: ROW_Y[qi] - 25, textAlign: 'center', fontFamily: SERIF_BLACK, fontSize: 38, lineHeight: '50px', color: gold ? '#B98428' : '#A07C50', opacity: nA * (qi < 6 ? mix(1, 0.75, 1 - dim6) : 1), transform: `scale(${nS})`}}>
                  {qi + 1}
                </div>
                {chars.map((c, k) => {
                  const [x, y] = slotOf(qi, k);
                  const Lk = Ls[Math.min(k, Ls.length - 1)];
                  const p = prog(f, Lk - 2, Lk + 5, EASE.out);
                  if (p <= 0) return null;
                  const isXuan = gold && c === '选';
                  return (
                    <span
                      key={k}
                      style={{
                        position: 'absolute',
                        left: x - QS / 2,
                        top: y - QS / 2,
                        width: QS,
                        height: QS,
                        textAlign: 'center',
                        fontFamily: SERIF,
                        fontSize: QS,
                        lineHeight: QS + 'px',
                        opacity: p * rowA,
                        color: gold ? '#A36614' : PAL.inkText,
                        textShadow: gold ? `0 0 ${2 + 14 * glow7 + 16 * (isXuan ? xuanG : 0)}px rgba(232,164,60,${0.35 * glow7 + (isXuan ? 0.6 * xuanG : 0)})` : undefined,
                      }}
                    >
                      {c}
                    </span>
                  );
                })}
                {(() => {
                  const n = chars.length;
                  const [x, y] = slotOf(qi, n);
                  return (
                    <span style={{position: 'absolute', left: x - QS / 2, top: y - QS / 2, width: QS, height: QS, textAlign: 'center', fontFamily: SERIF, fontSize: QS, lineHeight: QS + 'px', opacity: dotA * rowA, color: gold ? '#A36614' : PAL.inkText}}>
                      。
                    </span>
                  );
                })()}
                {ICON[qi] ? (
                  (() => {
                    const [x, y] = slotOf(qi, chars.length + 1);
                    const p = prog(f, lastF + 8, lastF + 20, EASE.back);
                    return (
                      <div style={{position: 'absolute', left: x - QS / 2 + 6, top: y - 18, opacity: clamp01(p) * rowA, transform: `scale(${p * (1 + 0.22 * lookBump)})`, transformOrigin: '30% 50%'}}>
                        <Icon kind={ICON[qi]} id={'hq' + qi} />
                      </div>
                    );
                  })()
                ) : null}
              </React.Fragment>
            );
          })}
          {/* 前六句 / 第七句 的竖线 */}
          <div style={{position: 'absolute', left: 74, top: ROW_Y[0] - 26, width: 3, height: (ROW_Y[5] - ROW_Y[0] + 52) * brack6, background: 'rgba(60,45,30,.4)', borderRadius: 2, opacity: brack6 > 0 ? 1 : 0}} />
          <div style={{position: 'absolute', left: 74, top: ROW_Y[6] - 26, width: 4, height: (Q7_LH + 52) * brack7, background: '#C48C2E', borderRadius: 2, boxShadow: `0 0 ${10 * brack7}px rgba(232,164,60,.6)`}} />
          {/* 出处 */}
          <div style={{position: 'absolute', left: PX0, width: PW, top: 1262 - 18, textAlign: 'center', fontFamily: SANS, fontSize: 30, lineHeight: '36px', letterSpacing: '0.06em', color: 'rgba(42,33,24,.5)', opacity: labelA}}>
            原文 · 姜蓝《人选天选论》第二章
          </div>
        </AbsoluteFill>
        </AbsoluteFill>
      ) : null}
      {/* 每页上反复出现的三颗石头（像透过纸亮着） */}
      {f >= T.recur - 4
        ? Array.from({length: FAN_N}, (_, k) =>
            MARKS.map((m, mj) => {
              const L = lit(k);
              if (L <= 0) return null;
              const [x0, y0] = markXY(k, m);
              const gp = gather(k);
              const [bx, by, bs] = BIG[mj];
              const x = mix(x0, bx, gp);
              const y = mix(y0, by, gp);
              const w = mix(19, 60 * bs, gp) * (1 + 0.25 * (1 - L));
              const a = L * (1 - smooth(0.75, 1, gp));
              if (a <= 0.01) return null;
              return (
                <div key={k + '-' + mj} style={{position: 'absolute', left: x - w / 2, top: y - w * 0.36, opacity: a, transform: `rotate(${angle(k) * (1 - gp)}deg)`}}>
                  <Stone kind={m[2] as 'white' | 'black'} w={w} id={'fm' + k + '-' + mj} glow={0.75 * L} />
                </div>
              );
            }),
          )
        : null}
      {bigP > 0.001
        ? BIG.map(([bx, by, bs], mj) => {
            const w = 150 * bs * bigP * (1 + 0.015 * Math.sin(t * 2 + mj * 2));
            return (
              <div key={'big' + mj} style={{position: 'absolute', left: bx - w / 2, top: by - w * 0.36, opacity: clamp01(bigP)}}>
                <Stone kind={MARKS[mj][2]} w={w} id={'big' + mj} glow={0.9} />
              </div>
            );
          })
        : null}
      </AbsoluteFill>
      <Vignette amount={paperOn ? 0.38 : 0.5} />
    </AbsoluteFill>
  );
};

export const S: SceneMod = {
  C,
  hideSubs: ['h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10'],
  sfx: ({at, atc, lineAt}) => {
    const page = at('他把这一页');
    const cues: [number, string, number, number][] = [
      [0, 'water_loop', 0.07, 300],
      [at('捞') - 2, 'drop', 0.18, 25],
      [page - 21, 'gather', 0.2, 80],
      [page + 6, 'page', 0.16, 30],
      [atc('只有七个问题')[0], 'pebbles', 0.12, 45],
      [at('第七句'), 'chime', 0.12, 80],
      [at('每周回看') + 4, 'page', 0.17, 30],
      [at('每个月'), 'whoosh_soft', 0.1, 40],
      [at('反复出现'), 'gather', 0.16, 80],
      [at('那几块石头') + 2, 'drop', 0.14, 25],
    ];
    ['h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10'].forEach((id) => cues.push([lineAt(id, 'start') - 1, 'scratch', 0.06, 22]));
    return cues;
  },
};
