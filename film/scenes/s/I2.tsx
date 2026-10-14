// 场景 I2 · 结尾（收回到「选」）。
// 第 0 帧：镜头贴在第六章的原文上「包括《人选天选论》也是我对世界的暂时解释」（随旁白逐段亮起）
// →「暂时」：镜头拉回整本书，整页字像沙一样松开、旋流 →「下一次……」：全书的字聚成一只光做的手，抬起
// →「先别急着拍」：手挥下去一半，停在半空（字全部静止）→ 手散回书页，镜头看向全书最后一行：
// 「看看眼前飞着的……」这句真的在最后一行里亮起，被一个个字「拔」出来组成引文（逐字随旁白亮）
// →「那条河边」：整本书变成日出河边的照片（字拼图 → 真照片，「更清楚一点」时对焦变清）
// → 镜头扎进序：原文那一句亮起，四个「你为什么」各在一个重拍上从书里飞出来成行
// →（480.0 s 小节线，配乐「选」）34952 个字全部飞成和片头 A 场一模一样的巨大「选」，停住到最后一帧。
import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import type {SceneMod, SceneProps} from '../core/timeline';
import {nextBeatF} from '../core/timeline';
import {Backdrop, Label, PAL, Plate, SAFE, SANS, SERIF, SERIF_BLACK, Vignette} from '../core/look';
import {EASE, hex, mix, prog, smooth} from '../core/anim';
import {BOOK_CHARS, findInBook} from '../core/book';
import {
  Cam, GlyphCanvas, GlyphLayer, MaskText, Mask, N_BOOK, camMix, camZ, colorFromImage, hash01, maskTargets, noise3, usePage, useGState,
  useImageData, useTextMask,
} from '../core/glyph';

const N = N_BOOK;
const GOLD = hex(PAL.gold);
const HI = hex(PAL.goldHi);
const Z0 = camZ();
/** 正对 z=0 平面的镜头：中心 (cx,cy)，k = 屏幕像素 / 世界单位 */
const flat = (cx: number, cy: number, k: number): Cam => ({pos: [cx, cy, Z0 / k], target: [cx, cy, 0]});
const FULL = flat(0, 0, 1);
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const stag = (p: number, r: number, s: number) => {
  const q = p * (1 + s) - s * r;
  return q <= 0 ? 0 : q >= 1 ? 1 : easeIO(q);
};

// ---------------------------------------------------------------- 光做的手（SDF：掌 + 腕 + 四指 + 拇指）
const HX = -60;
const HY = 40;
const PIV: [number, number] = [HX + 10, HY - 400]; // 手腕下端：挥手的轴
const sdCap = (x: number, y: number, ax: number, ay: number, bx: number, by: number, r: number) => {
  const pax = x - ax;
  const pay = y - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * h, pay - bay * h) - r;
};
const sdBox = (x: number, y: number, cx: number, cy: number, hx: number, hy: number, r: number) => {
  const qx = Math.abs(x - cx) - (hx - r);
  const qy = Math.abs(y - cy) - (hy - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const smin = (a: number, b: number, k: number) => {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return b + (a - b) * h - k * h * (1 - h);
};
const handSdf = (wx: number, wy: number) => {
  const x = wx - HX;
  const y = wy - HY;
  let d = sdBox(x, y, 0, -30, 170, 150, 80); // 掌
  d = smin(d, sdBox(x, y, 10, -280, 120, 130, 60), 40); // 腕
  d = smin(d, sdCap(x, y, -112, 95, -165, 365, 38), 14); // 食指
  d = smin(d, sdCap(x, y, -38, 108, -46, 415, 40), 14); // 中指
  d = smin(d, sdCap(x, y, 40, 104, 64, 385, 38), 14); // 无名指
  d = smin(d, sdCap(x, y, 112, 80, 165, 300, 33), 14); // 小指
  d = smin(d, sdCap(x, y, -140, -100, -285, 105, 43), 22); // 拇指
  return d;
};
const buildHand = () => {
  const w = 270;
  const h = 480;
  const a = new Uint8Array(w * h);
  const ins: number[] = [];
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = (px + 0.5) * (1080 / w) - 540;
      const y = 960 - (py + 0.5) * (1920 / h);
      if (handSdf(x, y) < 0) {
        a[py * w + px] = 255;
        ins.push(py * w + px);
      }
    }
  }
  const mask: Mask = {w, h, a, inside: Int32Array.from(ins)};
  const pos = maskTargets(mask, N, 31, 1.0);
  const rim = new Float32Array(N);
  const fade = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = pos[i * 3];
    const y = pos[i * 3 + 1];
    rim[i] = Math.exp(handSdf(x, y) / 11); // 边缘 1，往里变暗 → 光做的轮廓
    fade[i] = smooth(HY - 420, HY - 250, y); // 手腕往下淡出
  }
  return {pos, rim, fade};
};

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

// 版式（DOM 像素，左上原点）
const Q8 = {size: 64, y: 690, lh: 1.6}; // 引文「看看眼前飞着的……」
const L10 = {size: 96, step: 1.1, y: [650, 790, 930, 1070]}; // 四行「你为什么……」
const isPun = (c: string) => /[，。、；：？！,.]/.test(c);

const C: React.FC<SceneProps> = ({f, at, atc, lineAt, def}) => {
  const st = useGState();
  const page = usePage();
  const xuanMask = useTextMask('选', {size: 900, y: 70});
  const img = useImageData('img/riverbank_dawn.jpg', 270, 480);
  const scratch = useMemo(() => new Float32Array(N * 3), []);
  const hand = useMemo(buildHand, []);
  const xuan = useMemo(() => (xuanMask ? maskTargets(xuanMask, N, 23, 1.2) : null), [xuanMask]);

  // 原文位置
  const R = useMemo(() => {
    const r6 = findInBook('包括《人选天选论》也是我对世界的暂时解释');
    const s6 = BOOK_CHARS.slice(r6.start, r6.end).join('');
    const r6b = {start: r6.start + Math.max(0, [...s6.slice(0, s6.indexOf('也是我对世界'))].length), end: r6.end};
    const r8 = findInBook('看看眼前飞着的，到底是苍蝇，还是马蜂');
    const r10 = findInBook('你为什么伸手，你为什么退后，你为什么选择，你为什么承担');
    return {r6, r6b, r8, r10};
  }, []);
  // 每个粒子的角色：1 = 引文字（第七章），2 = 四行字（序）；slot = 在引文/行里的位置
  const roles = useMemo(() => {
    const role = new Uint8Array(N);
    const slot = new Int16Array(N);
    const line = new Int8Array(N);
    const q8: {i: number; c: string; r: number; j: number}[] = [];
    const chars8 = BOOK_CHARS.slice(R.r8.start, R.r8.end);
    const br = chars8.indexOf('，') + 1; // 第一行带上逗号
    chars8.forEach((c, j) => {
      const i = R.r8.start + j;
      role[i] = 1;
      slot[i] = q8.length;
      q8.push({i, c, r: j < br ? 0 : 1, j: j < br ? j : j - br});
    });
    const n0 = br;
    const n1 = chars8.length - br;
    const groups: number[][] = [[]];
    BOOK_CHARS.slice(R.r10.start, R.r10.end).forEach((c, j) => {
      if (isPun(c)) groups.push([]);
      else groups[groups.length - 1].push(R.r10.start + j);
    });
    groups.forEach((g, k) =>
      g.forEach((i, j) => {
        role[i] = 2;
        slot[i] = j;
        line[i] = k;
      }),
    );
    return {role, slot, line, q8, n0, n1, groups};
  }, [R]);
  // 收拢成「选」的先后：离序那一句近的先走
  const rankG = useMemo(() => {
    const [cx, cy] = rangeCenter(page.xy, R.r10);
    const ord = Array.from({length: N}, (_, i) => i).sort(
      (a, b) => Math.hypot(page.pos[a * 3] - cx, page.pos[a * 3 + 1] - cy) - Math.hypot(page.pos[b * 3] - cx, page.pos[b * 3 + 1] - cy),
    );
    const r = new Float32Array(N);
    ord.forEach((i, k) => (r[i] = (k / (N - 1)) * 0.85 + hash01(i, 41) * 0.15));
    return r;
  }, [page, R]);

  // ---------------- 时间（全部来自旁白）
  const fSay = at('他自己也写');
  const fBook = at('这本书');
  const fWorld = at('对世界');
  const fTemp = at('暂时');
  const fNext = at('下一次');
  const fWant = at('特别想');
  const fExp2 = at('解释掉');
  const fStop = at('先别急着拍');
  const fPai = atc('急着拍')[2];
  const L8 = lineAt('i8');
  const fDaodi = at('到底');
  const L8e = lineAt('i8', 'end');
  const L9 = lineAt('i9');
  const fRiver = at('河边');
  const fClear = at('更清楚');
  const L9e = lineAt('i9', 'end');
  const ny = [0, 1, 2, 3].map((k) => at('你为什么', k, 0, 'i10'));
  const L10e = lineAt('i10', 'end');
  const HIT = nextBeatF(def, nextBeatF(def, L10e) + 1, 4); // 480.0 s 小节线：配乐里「选」那一下
  const GIN = L10e + 6; // 开始收拢
  const spoken8 = useMemo(() => atc('看看眼前飞着的，到底是苍蝇，还是马蜂', 0, 'i8'), [atc]);

  if (!xuan) return <Backdrop />;
  const t = f / 30;
  const P_HAND = fNext - 14; // 沙 → 手
  const P_BACK = fPai + 12; // 手 → 书页
  const P_PAGE = L8 - 2; // 书页（引文、照片）
  const P_RIVER = L9e; // 序 / 四行
  const tFreeze = (fPai + 2) / 30;

  // ---------------- 镜头（先算：四行字要钉在屏幕上）
  const k6 = 38 / page.cell;
  const [x6, y6] = rangeCenter(page.xy, R.r6);
  const onSent = (x: number, y: number, k: number, X: number, Y: number) => flat(x + (540 - X) / k, y - (960 - Y) / k, k);
  const Q6a = onSent(x6, y6, k6 * 0.88, SAFE.cx, 600);
  const Q6 = onSent(x6, y6, k6, SAFE.cx, 600);
  const kQ = 1.15;
  const lastY = page.xy(N - 1)[1];
  const QQ = flat(0, lastY + 280 / kQ, kQ); // 书的最后一行在屏幕 y≈1240
  const k10 = 3.2;
  const [x10, y10] = rangeCenter(page.xy, R.r10);
  const C10 = onSent(x10, y10, k10, SAFE.cx, 452);
  const C10b = onSent(x10, y10, k10 * 1.05, SAFE.cx, 452);
  const seq: [number, Cam][] = [
    [0, Q6a],
    [fTemp - 2, Q6],
    [fTemp + 50, FULL],
    [fStop, FULL],
    [fPai + 4, flat(0, 30, 1.05)],
    [fPai + 16, flat(0, 30, 1.05)],
    [L8 - 4, QQ],
    [L8e + 10, QQ],
    [L9 + 34, FULL],
    [L9e - 6, FULL],
    [ny[0] - 8, C10],
    [GIN, C10b],
    [HIT, FULL],
  ];
  let cam = FULL;
  for (let k = 1; k < seq.length; k++) {
    if (f <= seq[k][0]) {
      const [f0, c0] = seq[k - 1];
      const [f1, c1] = seq[k];
      cam = camMix(c0, c1, EASE.inOut(Math.min(1, Math.max(0, (f - f0) / Math.max(1, f1 - f0)))));
      break;
    }
    cam = seq[k][1];
  }
  const ccx = cam.target![0];
  const ccy = cam.target![1];
  const kk = Z0 / (cam.pos![2] - cam.target![2]);
  const wx = (X: number) => ccx + (X - 540) / kk;
  const wy = (Y: number) => ccy + (960 - Y) / kk;
  // 引文 / 四行 的屏幕位置
  const q8X = (r: number, j: number) => {
    const n = r === 0 ? roles.n0 : roles.n1;
    const step = Q8.size * 1.06;
    return SAFE.cx - (n * step) / 2 + step * (j + 0.5);
  };
  const q8Y = (r: number) => Q8.y + r * Q8.size * Q8.lh;
  const lStep = L10.size * L10.step;
  const lX = (j: number) => SAFE.cx - (6 * lStep) / 2 + lStep * (j + 0.5);

  // ---------------- 每个字的位置 / 大小 / 颜色
  const sandAmt = smooth(fTemp - 4, fTemp + 45, f);
  const u = Math.max(0, f - fTemp) / 30;
  const ripple = 0.7 * (1 - sandAmt);
  const closeUp = 1 - smooth(fTemp + 4, fTemp + 40, f);
  const lit6a = 0.3 + 0.7 * smooth(fBook - 4, fBook + 10, f);
  const lit6b = 0.3 + 0.7 * smooth(fWorld - 4, fWorld + 10, f);
  const lit6off = 1 - smooth(fTemp + 18, fTemp + 44, f);
  const pH = prog(f, P_HAND, fExp2 + 8, EASE.linear);
  const rise = prog(f, P_HAND, fWant + 24, EASE.inOut);
  const sw = prog(f, fStop - 2, fPai + 2, EASE.out);
  const th = mix(-0.07, 0.02, rise) + 0.1 * sw;
  const hoy = mix(-240, 0, rise) - 46 * sw;
  const hoz = 160 * sw;
  const cth = Math.cos(th);
  const sth = Math.sin(th);
  const stopP = f >= fPai - 1 ? Math.exp(-(f - fPai) / 12) : 0;
  const th2 = Math.min(t, tFreeze);
  const pR = prog(f, P_BACK, P_PAGE, EASE.linear);
  const qUp = prog(f, L8 + 8, fDaodi + 2, EASE.linear);
  const qBack = prog(f, L8e + 6, L9 + 12, EASE.linear);
  const qLit = smooth(L8 - 6, L8 + 6, f);
  const qDom = prog(f, fDaodi - 2, fDaodi + 12) * (1 - prog(f, L8e + 4, L8e + 16));
  const qFocus = smooth(L8, L8 + 20, f) * (1 - smooth(L8e + 6, L8e + 22, f));
  const photoCol = prog(f, L9 - 6, fRiver - 6) * (1 - prog(f, L9e, L9e + 24));
  const clear = prog(f, fClear - 4, fClear + 18);
  const toRiver = prog(f, L9e, L9e + 24);
  const lit10 = smooth(L9e - 4, L9e + 14, f);
  let pulse = 0;
  ny.forEach((n) => (pulse += f >= n - 1 ? Math.exp(-(f - n) / 9) : 0));
  const pG = prog(f, GIN, HIT, EASE.linear);
  const hit = f >= HIT ? Math.exp(-(f - HIT) / 10) : 0;

  const P = st.pos;
  const S = st.size;
  const Cc = st.col;
  const writeCol = (i: number, r: number, g: number, b: number, a: number) => {
    Cc[i * 4] = r;
    Cc[i * 4 + 1] = g;
    Cc[i * 4 + 2] = b;
    Cc[i * 4 + 3] = a;
  };
  // 沙：整页松开、差速旋流
  const sand = (i: number, px: number, py: number, h: number, out: Float32Array) => {
    let x = px;
    let y = py + ripple * Math.sin(px * 0.05 + py * 0.02 - t * 2.4);
    let z = 0;
    if (sandAmt > 0) {
      const yy = py + 40;
      const r = Math.hypot(px, yy);
      const sp = sandAmt * u;
      const ang = sp * (0.05 + 0.1 * h) * (0.35 + 1.9 * Math.exp(-r / 420)); // 中心转得快、外圈慢 → 旋涡
      const shrink = 1 - Math.min(0.32, 0.05 * sp * (0.6 + 0.8 * h)); // 每粒收得不一样 → 书页的直边散成沙
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      x = (c * px - s * yy) * shrink + sandAmt * 34 * noise3(px / 210, py / 210, t * 0.3, 6);
      y = (s * px + c * yy) * shrink - 40 + sandAmt * 34 * noise3(px / 210 + 9, py / 210 - 4, t * 0.3, 6);
      z = sandAmt * 80 * noise3(px / 260, py / 260, t * 0.25, 8);
    }
    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
  };
  // 手：目标点绕手腕转 th，再整体平移
  const handAt = (i: number, out: Float32Array) => {
    const dx = hand.pos[i * 3] - PIV[0];
    const dy = hand.pos[i * 3 + 1] - PIV[1];
    const j = 1.6;
    out[i * 3] = PIV[0] + cth * dx - sth * dy + j * noise3(dx / 40, dy / 40, th2 * 0.6, 14);
    out[i * 3 + 1] = PIV[1] + sth * dx + cth * dy + hoy + j * noise3(dx / 40 + 5, dy / 40, th2 * 0.6, 14);
    out[i * 3 + 2] = hoz + 20 * (1 - hand.rim[i]);
  };
  const handSize = (h: number) => 3.6 + 3.4 * h;
  const handA = (i: number, h: number) => (0.1 + 0.5 * hand.rim[i] + 0.25 * stopP * hand.rim[i]) * hand.fade[i] * (0.8 + 0.4 * h);

  // 序 / 四行 / 字河 阶段（P_RIVER 之后；收拢时也拿它当起点）
  const riverAt = (i: number, h: number, out: Float32Array, setLook: boolean) => {
    const k3 = i * 3;
    const px = page.pos[k3];
    const py = page.pos[k3 + 1];
    let x = px + 3.2 * noise3(px / 26, py / 26, t * 0.45, 12) + 1.4 * Math.sin(py / 9 + t * 2);
    let y = py + 1.6 * noise3(px / 26 + 3, py / 26, t * 0.45, 12);
    let z = 0;
    let size = page.cell * mix(0.98, 0.9, toRiver);
    let r = GOLD[0];
    let g = GOLD[1];
    let b = GOLD[2];
    let a = mix(0.3 + 0.2 * h, 0.045 + 0.055 * h, toRiver) + 0.1 * pulse * (0.4 + h);
    let halo = (0.6 + 0.8 * h) * mix(1, 0.35, toRiver) * (1 + 1.5 * pulse);
    if (R.r10.start <= i && i < R.r10.end) {
      x = px;
      y = py;
      r = mix(r, HI[0], lit10);
      g = mix(g, HI[1], lit10);
      b = mix(b, HI[2], lit10);
      a = mix(a, 1, lit10);
      size *= 1 + 0.06 * lit10;
    }
    if (roles.role[i] === 2) {
      const k = roles.line[i];
      const j = roles.slot[i];
      const f0 = ny[k] - 16 + 1.5 * j;
      const q = prog(f, f0, f0 + 16, EASE.inOut);
      if (q > 0) {
        const tx = wx(lX(j));
        const ty = wy(L10.y[k]);
        x = mix(px, tx, q);
        y = mix(py, ty, q);
        z = 120 * Math.sin(Math.PI * q) * (0.5 + h);
        size = mix(size, L10.size / kk, q);
        a = mix(1, 0.15, prog(f, f0 + 14, f0 + 24));
        halo = 0.25;
        r = HI[0];
        g = HI[1];
        b = HI[2];
      }
    }
    out[k3] = x;
    out[k3 + 1] = y;
    out[k3 + 2] = z;
    if (setLook) {
      S[i] = size;
      writeCol(i, r, g, b, a);
      st.halo[i] = halo;
    }
  };

  for (let i = 0; i < N; i++) {
    const k3 = i * 3;
    const h = hash01(i, 3);
    const px = page.pos[k3];
    const py = page.pos[k3 + 1];
    if (f < P_HAND) {
      // 书页 → 沙
      sand(i, px, py, h, P);
      let size = page.cell * 0.98;
      let a = (0.36 + 0.22 * h) * (1 - 0.72 * closeUp);
      let lit = 0;
      if (i >= R.r6.start && i < R.r6.end) lit = (i >= R.r6b.start ? lit6b : lit6a) * lit6off;
      a = mix(a, 1, lit);
      size *= 1 + 0.16 * lit;
      S[i] = size;
      writeCol(i, mix(GOLD[0], HI[0], lit), mix(GOLD[1], HI[1], lit), mix(GOLD[2], HI[2], lit), a);
      st.halo[i] = (0.6 + 0.8 * h) * (1 - 0.6 * lit);
    } else if (f < P_BACK) {
      // 沙 → 光做的手（从书页最上面的字开始：指尖先成形）
      sand(i, px, py, h, scratch);
      handAt(i, P);
      const q = stag(pH, i / N, 0.55);
      const lift = 260 * Math.sin(Math.PI * q) * (0.5 + h);
      P[k3] = mix(scratch[k3], P[k3], q);
      P[k3 + 1] = mix(scratch[k3 + 1], P[k3 + 1], q);
      P[k3 + 2] = mix(scratch[k3 + 2], P[k3 + 2], q) + lift;
      S[i] = mix(page.cell * 0.98, handSize(h), q);
      const ah = handA(i, h);
      const rr = 0.3 + 0.7 * hand.rim[i];
      writeCol(i, mix(GOLD[0], mix(GOLD[0], HI[0], rr), q), mix(GOLD[1], mix(GOLD[1], HI[1], rr), q), mix(GOLD[2], mix(GOLD[2], HI[2], rr), q), mix(0.36 + 0.22 * h, ah, q));
      st.halo[i] = (0.6 + 0.8 * h) * (1 + 3 * stopP * hand.rim[i]);
    } else if (f < P_PAGE) {
      // 手 → 书页重新拼好
      handAt(i, scratch);
      const q = stag(pR, hash01(i, 12), 0.5);
      P[k3] = mix(scratch[k3], px, q);
      P[k3 + 1] = mix(scratch[k3 + 1], py, q);
      P[k3 + 2] = mix(scratch[k3 + 2], 0, q) + 220 * Math.sin(Math.PI * q) * (0.5 + h);
      S[i] = mix(handSize(h), page.cell * 0.98, q);
      const rr = 0.3 + 0.7 * hand.rim[i];
      writeCol(i, mix(mix(GOLD[0], HI[0], rr), GOLD[0], q), mix(mix(GOLD[1], HI[1], rr), GOLD[1], q), mix(mix(GOLD[2], HI[2], rr), GOLD[2], q), mix(handA(i, h), 0.3 + 0.2 * h, q));
      st.halo[i] = 0.6 + 0.8 * h;
    } else if (f < P_RIVER) {
      // 书页：最后一行的原文被拔出来；然后整本书变成河边的照片
      P[k3] = px + 0.25 * noise3(px / 90, py / 90, t * 0.35, 4);
      P[k3 + 1] = py + 0.25 * noise3(px / 90 + 19, py / 90 - 7, t * 0.35, 4);
      P[k3 + 2] = 0;
      let size = page.cell * 0.98;
      let a = (0.3 + 0.2 * h) * (1 - 0.45 * qFocus);
      let r = GOLD[0];
      let g = GOLD[1];
      let b = GOLD[2];
      if (roles.role[i] === 1) {
        const s = roles.slot[i];
        const it = roles.q8[s];
        const q = stag(qUp, s / roles.q8.length, 0.5) * (1 - stag(qBack, s / roles.q8.length, 0.4));
        const tx = wx(q8X(it.r, it.j));
        const ty = wy(q8Y(it.r));
        P[k3] = mix(px, tx, q);
        P[k3 + 1] = mix(py, ty, q);
        P[k3 + 2] = 160 * Math.sin(Math.PI * q) * (0.5 + h);
        size = mix(size, Q8.size / kk, q);
        const lit = qLit * (1 - qBack);
        a = mix(a, 1, lit) * mix(1, 0.12, qDom);
        r = mix(r, HI[0], lit);
        g = mix(g, HI[1], lit);
        b = mix(b, HI[2], lit);
      }
      S[i] = size;
      writeCol(i, r, g, b, a);
      st.halo[i] = 0.6 + 0.8 * h;
    } else if (f < GIN) {
      riverAt(i, h, P, true);
    } else {
      riverAt(i, h, scratch, true);
      const q = stag(pG, rankG[i], 0.6);
      const ax = scratch[k3];
      const ay = scratch[k3 + 1];
      const bx = xuan[k3];
      const by = xuan[k3 + 1];
      let x = mix(ax, bx, q);
      let y = mix(ay, by, q);
      let z = mix(scratch[k3 + 2], 0, q);
      if (q > 0 && q < 1) {
        const arc = Math.sin(Math.PI * q);
        const dx = bx - ax;
        const dy = by - ay;
        const L = Math.hypot(dx, dy) + 1e-6;
        const side = (hash01(i, 7) - 0.5) * 2;
        x += (-dy / L) * 340 * side * arc;
        y += (dx / L) * 340 * side * arc;
        z += 700 * arc * (0.5 + hash01(i, 9));
      }
      z = Math.min(z, 0.5 * (cam.pos![2] - 0)); // 镜头还推得很近时别让字贴到镜头上
      // 和 A 场结尾一样的呼吸漂移
      const dA = f >= HIT ? 2.6 : 0.25;
      P[k3] = x + dA * noise3(x / 90, y / 90, t * 0.35, 4);
      P[k3 + 1] = y + dA * noise3(x / 90 + 19, y / 90 - 7, t * 0.35, 4);
      P[k3 + 2] = z;
      const e = pG; // 颜色/大小跟着整体进度走，到 HIT 时和 A 场最后一帧一样
      S[i] = mix(S[i], 6.6, e);
      const cf = 0.7; // = A 场：mix(GOLD, HI, 0.7)
      writeCol(i, mix(Cc[i * 4], mix(GOLD[0], HI[0], cf), e), mix(Cc[i * 4 + 1], mix(GOLD[1], HI[1], cf), e), mix(Cc[i * 4 + 2], mix(GOLD[2], HI[2], cf), e), Math.min(1, mix(Cc[i * 4 + 3], 0.8 + 0.2 * h, e) + hit * 0.3));
      st.halo[i] = mix(st.halo[i], 0.6 + 0.8 * h, e) * (1 + 3 * hit);
    }
  }
  // 整本书 = 河边的照片（字拼图），「更清楚」时字退后、照片对焦
  if (photoCol > 0.001 && img) {
    colorFromImage(st, img, {gain: 1.3, alphaMin: 0.3, alpha: 0.9, mixAmt: photoCol});
    const dimA = 1 - 0.55 * smooth(fRiver - 24, fRiver + 16, f) - 0.33 * clear;
    for (let i = 0; i < N; i++) st.col[i * 4 + 3] *= dimA;
  }

  // ---------------- DOM 叠层
  const lab6 = 1 - prog(f, fTemp + 10, fTemp + 30);
  const lab8 = prog(f, L8 - 4, L8 + 10) * (1 - prog(f, L8e + 4, L8e + 16));
  const photoOp = prog(f, fRiver - 26, fRiver + 12) * (1 - prog(f, L9e, L9e + 26));
  const photoBlur = mix(16, 0, clear);
  const lab10 = prog(f, L9e - 2, L9e + 14) * (1 - prog(f, GIN, GIN + 14));
  const linesOut = 1 - prog(f, GIN + 2, GIN + 20, EASE.in);
  const xA = 0.55 * prog(f, HIT - 2, HIT + 20, EASE.out);
  const credit = prog(f, HIT + 24, HIT + 50, EASE.out);
  const hitGlow = f >= HIT ? Math.exp(-(f - HIT) / 20) : 0;
  return (
    <AbsoluteFill>
      <Backdrop light={[0.5, 0.45]} glow={1 + 0.4 * hitGlow} />
      {photoOp > 0.001 ? (
        <Plate src="img/riverbank_dawn.jpg" p={prog(f, fRiver - 26, L9e + 26, EASE.linear)} from={{s: 1.12}} to={{s: 1.02}} opacity={photoOp} blur={photoBlur} grade="saturate(.95) brightness(.9)" />
      ) : null}
      <GlyphCanvas camera={cam}>
        <GlyphLayer state={st} glow={0.55} halo={0.16} haloSize={3.2} renderOrder={4} />
      </GlyphCanvas>
      <Vignette amount={0.5} />
      {lab6 > 0.01 ? <Label text="《人选天选论》· 第六章 · 原文" x={SAFE.x0 + 8} y={392} p={lab6} size={32} /> : null}
      {lab8 > 0.01 ? <Label text="原文 · 第七章 · 全书最后一行" x={SAFE.x0 + 8} y={560} p={lab8} size={32} /> : null}
      {qDom > 0.01
        ? roles.q8.map((it, s) => {
            const sf = spoken8[Math.min(s, spoken8.length - 1)];
            const said = smooth(sf - 2, sf + 6, f);
            return (
              <div
                key={s}
                style={{
                  position: 'absolute',
                  left: q8X(it.r, it.j),
                  top: q8Y(it.r),
                  transform: 'translate(-50%, -50%)',
                  fontFamily: SERIF,
                  fontSize: Q8.size,
                  lineHeight: 1,
                  color: PAL.goldHi,
                  opacity: qDom * (0.5 + 0.5 * said),
                  textShadow: `0 0 ${10 + 18 * said}px rgba(255,200,120,${0.25 + 0.35 * said}), 0 2px 14px rgba(0,0,0,.7)`,
                }}
              >
                {it.c}
              </div>
            );
          })
        : null}
      {lab10 > 0.01 ? <Label text="原文 · 序" x={SAFE.x0 + 8} y={372} p={lab10} size={32} /> : null}
      {f >= ny[0] - 4 && linesOut > 0.001
        ? roles.groups.map((g, k) =>
            g.map((i, j) => {
              const f0 = ny[k] - 16 + 1.5 * j;
              const p = prog(f, f0 + 12, f0 + 22, EASE.out);
              if (p <= 0.001) return null;
              const c = BOOK_CHARS[i];
              return (
                <div
                  key={k * 10 + j}
                  style={{
                    position: 'absolute',
                    left: lX(j),
                    top: L10.y[k],
                    transform: `translate(-50%, -50%) scale(${mix(1.1, 1, p)})`,
                    fontFamily: SERIF_BLACK,
                    fontSize: L10.size,
                    lineHeight: 1,
                    color: 'transparent',
                    backgroundImage: `linear-gradient(180deg, #FFF6DC 0%, ${PAL.gold} 45%, ${PAL.amber} 100%)`,
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    opacity: p * linesOut,
                    filter: `blur(${(1 - p) * 6}px) drop-shadow(0 0 16px rgba(255,200,120,.4))`,
                  }}
                >
                  {c}
                </div>
              );
            }),
          )
        : null}
      {f >= HIT - 2 ? (
        <>
          <MaskText text="选" size={900} y={70} opacity={xA} />
          <div style={{position: 'absolute', left: SAFE.cx, top: 1400, transform: 'translateX(-50%)', opacity: credit, fontFamily: SANS, fontSize: 30, letterSpacing: '0.08em', color: 'rgba(242,217,160,.88)', whiteSpace: 'nowrap', textShadow: '0 2px 12px rgba(0,0,0,.8)'}}>
            原文：姜蓝（路飞）《人选天选论》 guohen.com
          </div>
        </>
      ) : null}
    </AbsoluteFill>
  );
};

export const S: SceneMod = {
  C,
  hideSubs: ['i8', 'i10'],
  sfx: ({at, lineAt}) => [
    [at('暂时') - 2, 'whoosh_soft', 0.1, 40],
    [at('下一次') - 12, 'gather', 0.2, 80],
    [lineAt('i8') + 8, 'page', 0.15, 25],
    [at('更清楚'), 'drop', 0.15, 25],
    [lineAt('i10', 'end') + 2, 'gather', 0.22, 80],
  ],
};
