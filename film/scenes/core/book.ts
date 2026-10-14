// 全书字流（34952 个字符，含标点；30686 个汉字）+ 字形图集索引 + 原文查找。
// 由 tools/build_book.py 生成 book.json / public/glyph/atlas.*；PDF 抽字错误已修（借口、朗朗上口…），「贪梦」统一成「贪婪」。
import bookJson from './book.json';
import atlasJson from '../../public/glyph/atlas.json';

export type Chapter = {n: number; title: string; date: string; start: number; end: number};
export const BOOK = bookJson as {text: string; breaks: number[]; chapters: Chapter[]; han: number};
export const ATLAS = atlasJson as {cell: number; cols: number; rows: number; w: number; h: number; chars: string};
const IDX = new Map<string, number>();
[...ATLAS.chars].forEach((c, i) => IDX.set(c, i));
/** 字 → 图集格号（图集里没有的字给 0 = 空格） */
export const glyphIdx = (c: string) => IDX.get(c) ?? 0;
export const BOOK_CHARS = [...BOOK.text];
/** 全书字数 = 粒子总数（34952） */
export const N_BOOK = BOOK_CHARS.length;
/** 第 i 个字的图集格号 */
export const BOOK_IDX = Float32Array.from(BOOK_CHARS, glyphIdx);
/** 一段文字 → 图集格号数组 */
export const textIdx = (s: string) => Float32Array.from([...s], glyphIdx);

const PUN = /[，。、；：？！“”‘’（）《》「」『』…—·,.;:?!'"()\s\-]/;
const KEEP: number[] = [];
let STRIPPED = '';
BOOK_CHARS.forEach((c, i) => {
  if (!PUN.test(c)) {
    KEEP.push(i);
    STRIPPED += c;
  }
});
/** 在书里找一句原文（忽略标点差异），返回字流下标 [start, end)。找不到直接抛错。 */
export const findInBook = (q: string, nth = 0): {start: number; end: number} => {
  const s = [...q].filter((c) => !PUN.test(c)).join('');
  let pos = -1;
  for (let k = 0; k <= nth; k++) {
    pos = STRIPPED.indexOf(s, pos + 1);
    if (pos < 0) throw new Error('findInBook: 书里找不到「' + q + '」');
  }
  return {start: KEEP[pos], end: KEEP[pos + s.length - 1] + 1};
};
/** 第 i 个字在哪一章 */
export const chapterOf = (i: number) => BOOK.chapters.find((c) => i >= c.start && i < c.end) ?? BOOK.chapters[0];
