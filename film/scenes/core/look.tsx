// 《选》统一视觉：色板、背景、照片底图、大标题、原文引用卡、小标签。所有场景共用，改这里 = 全片一起变。
// 竖屏 1080×1920。抖音安全区（必须读的字放这里）：x 64..824，y 340..1480（上 340、右 192、下 440 被界面盖住）；装饰可以出血到全屏。
import React from 'react';
import {AbsoluteFill, Img, staticFile} from 'remotion';
import {SANS, SANS_BOLD, SERIF, SERIF_BLACK} from './fonts';
import {EASE, mix, prog} from './anim';

export const PAL = {
  ink: '#0D0B09', // 最深的底（暖黑）
  night: '#16120E', // 背景中间调
  ember: '#3A2A1C', // 背景亮处（暖棕）
  gold: '#F2D9A0', // 主色：字的金
  goldHi: '#FFE9B8', // 高光金
  amber: '#E8A45A', // 暖橙（强调）
  cream: '#F4EFE6', // 白石 / 贪婪
  slate: '#8696AE', // 黑石 / 恐惧（暗底上要看得见，用冷灰蓝）
  coal: '#2B2F36', // 真·黑石（亮底上）
  moon: '#9CD3FF', // 蓝光（全片唯一的冷色亮点，只在 E 段和结尾用）
  paper: '#F3EDE1', // 纸（道痕）
  inkText: '#1E1A16', // 纸上的墨
  coral: '#D9734E', // 少量强调（不要大面积红）
};
export const SAFE = {x0: 64, x1: 824, y0: 340, y1: 1480, cx: 444};
export {SANS, SANS_BOLD, SERIF, SERIF_BLACK};

/** 暖黑背景：中心一团暖光（light = 光心位置，0..1），四角压暗。opaque，放在最底层。 */
export const Backdrop: React.FC<{light?: [number, number]; glow?: number; tint?: string; style?: React.CSSProperties}> = ({light = [0.5, 0.42], glow = 1, tint = PAL.ember, style}) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse 85% 60% at ${light[0] * 100}% ${light[1] * 100}%, ${tint} 0%, ${PAL.night} ${38 / Math.max(0.2, glow)}%, ${PAL.ink} 100%)`,
      ...style,
    }}
  />
);
/** 暗角（放在最上层装饰之下、字幕之上也行） */
export const Vignette: React.FC<{amount?: number}> = ({amount = 0.55}) => (
  <AbsoluteFill style={{background: `radial-gradient(ellipse 75% 65% at 50% 46%, rgba(0,0,0,0) 55%, rgba(0,0,0,${amount}) 100%)`, pointerEvents: 'none'}} />
);

export type KB = {s?: number; x?: number; y?: number; r?: number};
/** 照片底图（public/img/*.jpg，1080×1920，Seedream 生成的写实图）。kb = Ken Burns：from → to 随 p(0..1) 走；grade = CSS 滤镜调色 */
export const Plate: React.FC<{src: string; p?: number; from?: KB; to?: KB; opacity?: number; grade?: string; blur?: number; style?: React.CSSProperties}> = ({src, p = 0, from = {s: 1.08}, to = {s: 1}, opacity = 1, grade, blur = 0, style}) => {
  const s = mix(from.s ?? 1, to.s ?? 1, p);
  const x = mix(from.x ?? 0, to.x ?? 0, p);
  const y = mix(from.y ?? 0, to.y ?? 0, p);
  const r = mix(from.r ?? 0, to.r ?? 0, p);
  if (opacity <= 0.001) return null;
  return (
    <AbsoluteFill style={{opacity, overflow: 'hidden', ...style}}>
      <Img
        src={staticFile(src)}
        style={{width: '100%', height: '100%', objectFit: 'cover', transform: `translate(${x}px, ${-y}px) scale(${s}) rotate(${r}deg)`, filter: [grade, blur ? `blur(${blur}px)` : ''].filter(Boolean).join(' ') || undefined}}
      />
    </AbsoluteFill>
  );
};

/** 大标题（DOM 宋体，锐利）。逐字出现：charStarts = 每个字出现的帧（场景内），没有就整句在 at 帧出现。 */
export const Title: React.FC<{
  text: string;
  f: number;
  at?: number;
  charStarts?: number[];
  size?: number;
  x?: number; // 文字块中心（像素，左上原点）
  y?: number;
  color?: string;
  black?: boolean; // 用 900 字重
  gradient?: boolean; // 金色渐变
  out?: number; // 消失帧
  tracking?: number; // em
  glow?: number; // 0..1
  style?: React.CSSProperties;
}> = ({text, f, at = 0, charStarts, size = 120, x = SAFE.cx, y = 900, color = PAL.goldHi, black = true, gradient = true, out, tracking = 0.08, glow = 0.6, style}) => {
  const chars = [...text];
  const fade = out !== undefined ? 1 - prog(f, out, out + 12, EASE.in) : 1;
  return (
    <div style={{position: 'absolute', left: x, top: y, transform: 'translate(-50%, -50%)', whiteSpace: 'pre', textAlign: 'center', opacity: fade, ...style}}>
      {chars.map((c, i) => {
        const t0 = charStarts ? charStarts[Math.min(i, charStarts.length - 1)] : at;
        const p = prog(f, t0 - 2, t0 + 10, EASE.out);
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              fontFamily: black ? SERIF_BLACK : SERIF,
              fontSize: size,
              letterSpacing: `${tracking}em`,
              lineHeight: 1.2,
              color: gradient ? 'transparent' : color,
              backgroundImage: gradient ? `linear-gradient(180deg, #FFF6DC 0%, ${PAL.gold} 45%, ${PAL.amber} 100%)` : undefined,
              WebkitBackgroundClip: gradient ? 'text' : undefined,
              backgroundClip: gradient ? 'text' : undefined,
              opacity: p,
              transform: `translateY(${(1 - p) * size * 0.18}px) scale(${mix(1.12, 1, p)})`,
              filter: `blur(${(1 - p) * 8}px) drop-shadow(0 0 ${size * 0.18 * glow}px rgba(255,200,120,${0.45 * glow}))`,
            }}
          >
            {c}
          </span>
        );
      })}
    </div>
  );
};

/** 原文引用卡：引号 + 原文（宋体）+ 出处小字「—— 姜蓝《人选天选论》第二章」。p = 0..1 出现进度 */
export const Quote: React.FC<{text: string; source: string; p: number; x?: number; y?: number; width?: number; size?: number; color?: string; dark?: boolean}> = ({text, source, p, x = SAFE.cx, y = 820, width = 720, size = 52, color, dark = true}) => (
  <div style={{position: 'absolute', left: x - width / 2, top: y, width, transform: 'translateY(-50%)', opacity: p, filter: `blur(${(1 - p) * 6}px)`}}>
    <div style={{fontFamily: SERIF_BLACK, fontSize: size * 2.2, lineHeight: 0.6, color: PAL.amber, opacity: 0.85, marginBottom: size * 0.2}}>“</div>
    <div style={{fontFamily: SERIF, fontSize: size, lineHeight: 1.55, color: color ?? (dark ? PAL.goldHi : PAL.inkText), textShadow: dark ? '0 2px 18px rgba(0,0,0,.65)' : undefined, letterSpacing: '0.04em'}}>{text}</div>
    <div style={{fontFamily: SANS, fontSize: 30, marginTop: size * 0.6, color: dark ? 'rgba(242,217,160,.75)' : 'rgba(30,26,22,.6)', letterSpacing: '0.06em'}}>{source}</div>
  </div>
);

/** 小标签（例如「AI 示意图」「原文·第二章」「2025.11 香港」）。放在安全区里。 */
export const Label: React.FC<{text: string; x: number; y: number; p?: number; size?: number; color?: string; bg?: string; align?: 'left' | 'center' | 'right'}> = ({text, x, y, p = 1, size = 30, color = 'rgba(255,246,226,.92)', bg = 'rgba(13,11,9,.42)', align = 'left'}) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      transform: align === 'center' ? 'translateX(-50%)' : align === 'right' ? 'translateX(-100%)' : undefined,
      fontFamily: SANS,
      fontSize: size,
      color,
      background: bg,
      padding: `${size * 0.22}px ${size * 0.5}px`,
      borderRadius: size * 0.3,
      letterSpacing: '0.05em',
      opacity: p,
      whiteSpace: 'nowrap',
    }}
  >
    {text}
  </div>
);

/** 「• 爽哥说」水印（每一帧都有，Video 统一画，场景不用管） */
export const Watermark: React.FC = () => (
  <div style={{position: 'absolute', right: 58, top: 236, fontFamily: SANS, fontWeight: 500, fontSize: 40, letterSpacing: '0.06em', color: 'rgba(255,249,236,.86)', textShadow: '0 1px 8px rgba(0,0,0,.55)'}}>
    • 爽哥说
  </div>
);
