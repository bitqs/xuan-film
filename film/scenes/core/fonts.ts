// 字体：public/fonts/*.woff2（tools/fonts.py 子集化：GB2312 全部 6763 字 + 全书 + 文案）。
// 在每个 composition 的根组件里调用一次 useFonts()。不要在模块顶层 delayRender（长渲染会超时）。
import {useEffect, useState} from 'react';
import {continueRender, delayRender, staticFile} from 'remotion';

export const SERIF = "'XSerif', serif"; // Noto Serif SC 600：正文、引文
export const SERIF_BLACK = "'XSerifBlack', serif"; // 900：大标题、「选」
export const SANS = "'XSans', sans-serif"; // 思源黑体 Medium 500：字幕、水印
export const SANS_BOLD = "'XSansBold', sans-serif"; // 思源黑体 Bold 700
const FACES: [string, string][] = [
  ['XSerif', 'fonts/serif600.woff2'],
  ['XSerifBlack', 'fonts/serif900.woff2'],
  ['XSans', 'fonts/sans500.woff2'],
  ['XSansBold', 'fonts/sans700.woff2'],
];
if (typeof document !== 'undefined' && !document.getElementById('xuan-fonts')) {
  const el = document.createElement('style');
  el.id = 'xuan-fonts';
  el.textContent = FACES.map(([n, f]) => "@font-face{font-family:'" + n + "';src:url(" + staticFile(f) + ") format('woff2');font-display:block;}").join('\n');
  document.head.appendChild(el);
}
let ready: Promise<unknown> | null = null;
/** 四个字体都能用了 */
export const fontsReady = () => {
  if (!ready) ready = Promise.all(FACES.map(([n]) => document.fonts.load("64px '" + n + "'", '选字人天')));
  return ready;
};
export const useFonts = () => {
  const [h] = useState(() => delayRender('xuan fonts'));
  useEffect(() => {
    fontsReady().then(() => continueRender(h));
  }, [h]);
};
