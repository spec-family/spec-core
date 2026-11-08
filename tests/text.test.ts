import { describe, expect, it } from 'vitest';

import {
  createLineIndex,
  displayWidth,
  inRanges,
  lineEnding,
  lineStarts,
  locate,
  maskRanges,
  mergeRanges,
  splitLines,
  stripBom,
} from '../src/text/index.js';

describe('the line table', () => {
  it('ends a line at LF, CRLF and a lone CR alike', () => {
    expect(lineStarts('a\nb\r\nc\rd')).toEqual([0, 2, 5, 7]);
    expect(lineStarts('a\r\r\nb')).toEqual([0, 2, 4]);
  });

  it('does not count the empty line after a final terminator', () => {
    expect(lineStarts('a\n')).toEqual([0]);
    expect(lineStarts('a\n\n')).toEqual([0, 2]);
    expect(lineStarts('')).toEqual([0]);
  });

  it('answers lines and positions the same for every terminator', () => {
    for (const eol of ['\n', '\r\n', '\r']) {
      const text = ['# Title', '', 'Body text'].join(eol) + eol;
      const index = createLineIndex(text);
      expect(index.lineCount).toBe(3);
      expect(index.lineText(1)).toBe('# Title');
      expect(index.lineText(2)).toBe('');
      expect(index.lineText(3)).toBe('Body text');
      const body = text.indexOf('Body');
      expect(index.positionAt(body + 5)).toEqual({ offset: body + 5, line: 3, column: 6 });
      expect(index.lineEnd(3) - index.lineStart(3)).toBe('Body text'.length);
    }
  });

  it('clamps what lies outside the text', () => {
    const index = createLineIndex('ab\ncd');
    expect(index.lineStart(0)).toBe(0);
    expect(index.lineStart(9)).toBe(3);
    expect(index.lineEnd(9)).toBe(5);
    expect(index.positionAt(-4)).toEqual({ offset: 0, line: 1, column: 1 });
    expect(index.positionAt(99)).toEqual({ offset: 5, line: 2, column: 3 });
  });

  it('strips at most one terminator from a line, never into the line before it', () => {
    const index = createLineIndex('a\r\n\r\nb');
    expect(index.lineText(2)).toBe('');
    expect(index.lineStart(2)).toBe(3);
    expect(index.lineEnd(2)).toBe(3);
  });

  it('answers as a reading of each line by its terminator does, for every text of up to seven characters', () => {
    // The lines read with a regular expression and no table: each runs to
    // the terminator after it, and a final terminator opens no line.
    const linesOf = (text: string): { start: number; end: number }[] => {
      const out: { start: number; end: number }[] = [];
      let start = 0;
      for (const match of text.matchAll(/\r\n|\r|\n/g)) {
        out.push({ start, end: match.index });
        start = match.index + match[0].length;
      }
      if (start < text.length || out.length === 0) out.push({ start, end: text.length });
      return out;
    };
    const texts = [''];
    for (let length = 1; length <= 7; length += 1) {
      for (const text of texts.filter((t) => t.length === length - 1)) texts.push(`${text}a`, `${text}\r`, `${text}\n`);
    }
    const wrong: string[] = [];
    for (const text of texts) {
      const index = createLineIndex(text);
      const lines = linesOf(text);
      if (index.lineCount !== lines.length) wrong.push(`${JSON.stringify(text)}: ${index.lineCount} lines`);
      for (let line = -1; line <= lines.length + 2; line += 1) {
        const { start, end } = lines[line < 1 ? 0 : line > lines.length ? lines.length - 1 : line - 1]!;
        const read = [index.lineStart(line), index.lineEnd(line), index.lineText(line)];
        if (read.join() !== [start, end, text.slice(start, end)].join()) wrong.push(`${JSON.stringify(text)} line ${line}: ${JSON.stringify(read)}`);
      }
      for (let offset = -2; offset <= text.length + 2; offset += 1) {
        const at = offset < 0 ? 0 : offset > text.length ? text.length : offset;
        const line = lines.findLastIndex((l) => l.start <= at);
        const expected = { offset: at, line: line + 1, column: at - lines[line]!.start + 1 };
        const position = index.positionAt(offset);
        if (JSON.stringify(position) !== JSON.stringify(expected)) wrong.push(`${JSON.stringify(text)} offset ${offset}: ${JSON.stringify(position)}`);
      }
    }
    expect(texts).toHaveLength(3280);
    expect(wrong).toEqual([]);
  });

  it('locates by bisection at every line boundary', () => {
    const starts = [0, 4, 9];
    expect(locate(starts, 0)).toEqual({ offset: 0, line: 1, column: 1 });
    expect(locate(starts, 3)).toEqual({ offset: 3, line: 1, column: 4 });
    expect(locate(starts, 4)).toEqual({ offset: 4, line: 2, column: 1 });
    expect(locate(starts, 8)).toEqual({ offset: 8, line: 2, column: 5 });
    expect(locate(starts, 9)).toEqual({ offset: 9, line: 3, column: 1 });
    expect(locate(starts, 50)).toEqual({ offset: 50, line: 3, column: 42 });
  });
});

describe('ranges and masks', () => {
  it('merges overlapping and touching ranges, and drops empty ones', () => {
    expect(
      mergeRanges([
        { start: 5, end: 7 },
        { start: 0, end: 2 },
        { start: 2, end: 3 },
        { start: 6, end: 9 },
        { start: 4, end: 4 },
      ]),
    ).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 9 },
    ]);
  });

  it('merges a range into one that starts before it and ends after it, in either order', () => {
    const merged = [{ start: 0, end: 10 }];
    expect(mergeRanges([{ start: 0, end: 10 }, { start: 5, end: 6 }])).toEqual(merged);
    expect(mergeRanges([{ start: 5, end: 6 }, { start: 0, end: 10 }])).toEqual(merged);
  });

  it('answers membership at both ends of every range', () => {
    const merged = mergeRanges([
      { start: 2, end: 4 },
      { start: 8, end: 10 },
    ]);
    expect([1, 2, 3, 4, 7, 8, 9, 10].map((o) => inRanges(merged, o))).toEqual([
      false,
      true,
      true,
      false,
      false,
      true,
      true,
      false,
    ]);
    expect(inRanges([], 0)).toBe(false);
  });

  it('blanks ranges and keeps every offset and terminator where it was', () => {
    const text = 'keep <!-- a\r\nb --> keep';
    const masked = maskRanges(text, [{ start: 5, end: 18 }]);
    expect(masked).toBe('keep       \r\n      keep');
    expect(masked.length).toBe(text.length);
  });

  it('blanks a surrogate pair as two spaces, so later offsets hold', () => {
    const text = `a\u{1F600}b`;
    expect(maskRanges(text, [{ start: 1, end: 3 }])).toBe('a  b');
  });

  it('clamps ranges past the end and leaves an unmasked text alone', () => {
    expect(maskRanges('abc', [{ start: 1, end: 99 }])).toBe('a  ');
    expect(maskRanges('abc', [])).toBe('abc');
    expect(maskRanges('abc', [{ start: 7, end: 9 }])).toBe('abc');
  });
});

describe('terminators and marks', () => {
  it('strips a byte-order mark and nothing else', () => {
    expect(stripBom('\ufeffabc')).toBe('abc');
    expect(stripBom('abc')).toBe('abc');
  });

  it('reads the terminator a text mostly uses', () => {
    expect(lineEnding('a\r\nb\r\nc\n')).toBe('\r\n');
    expect(lineEnding('a\nb\r\n')).toBe('\n');
    expect(lineEnding('abc')).toBe('\n');
    expect(lineEnding('\nx')).toBe('\n');
    // A terminator at the very start is counted with the rest.
    expect(lineEnding('\na\r\nb\r\n')).toBe('\r\n');
  });

  it('splits lines so that joining them gives the text back', () => {
    expect(splitLines('a\r\nb\nc\rd\n')).toEqual(['a', 'b', 'c', 'd', '']);
    expect(splitLines('a\r\nb').join('\r\n')).toBe('a\r\nb');
  });
});

describe('the width of a text in a terminal', () => {
  // Invisible characters are written by code point.
  const cp = (...points: number[]): string => String.fromCodePoint(...points);

  it('counts an East Asian Wide or Fullwidth character as two columns, and the rest as one', () => {
    expect(displayWidth('')).toBe(0);
    expect(displayWidth('archived')).toBe(8);
    expect(displayWidth('封存')).toBe(4);
    expect(displayWidth('已接受')).toBe(6);
    expect(displayWidth('ステータス')).toBe(10);
    expect(displayWidth('보관됨')).toBe(6);
    // Full-width forms are two, half-width ones one.
    expect(displayWidth('ＡＤＲ')).toBe(6);
    expect(displayWidth('ｽﾃｰﾀｽ')).toBe(5);
    expect(displayWidth(cp(0x3000))).toBe(2);
    // Mixed, as a table cell is.
    expect(displayWidth('ADR-0003 已被取代')).toBe(17);
    expect(displayWidth('狀態：已接受')).toBe(12);
    expect(displayWidth('status: 封存 (archived)')).toBe(23);
    // East Asian Ambiguous is one, as a terminal outside a legacy East Asian
    // mode draws it.
    expect(displayWidth('±α→①')).toBe(4);
    // An unpaired surrogate is drawn as a replacement character.
    expect(displayWidth(String.fromCharCode(0xd800))).toBe(1);
  });

  it("reads Unicode 16.0's widths, at the edges of the runs", () => {
    const cases: readonly (readonly [number, number])[] = [
      // The first run of the table, and the characters beside it.
      [0x10ff, 1], [0x1100, 2], [0x115f, 2], [0x1160, 1],
      [0x2328, 1], [0x2329, 2], [0x232a, 2], [0x232b, 1],
      [0x3000, 2], [0x303e, 2], [0x303f, 1], [0x4e00, 2], [0x9fff, 2],
      [0xabff, 1], [0xac00, 2], [0xd7a3, 2], [0xd7a4, 1],
      [0xff00, 1], [0xff01, 2], [0xff60, 2], [0xff61, 1], [0xffe6, 2], [0xffe7, 1],
      // Wide from Unicode 16.0: the trigrams and the Yijing hexagrams.
      [0x2630, 2], [0x2637, 2], [0x4dc0, 2], [0x4dff, 2], [0x1d300, 2],
      [0x1f600, 2],
      // Unassigned code points of the ideograph planes are wide, as the
      // data's defaults make them; the last run of the table ends there.
      [0x2fffd, 2], [0x2fffe, 1], [0x30000, 2], [0x3fffd, 2], [0x3fffe, 1],
      // Past every run.
      [0xf0000, 1],
    ];
    for (const [point, width] of cases) expect(displayWidth(cp(point)), point.toString(16)).toBe(width);
  });

  it('counts a grapheme cluster once, by the first character in it that shows', () => {
    // A combining mark and a variation selector add nothing to what they follow.
    expect(displayWidth(cp(0x65, 0x301))).toBe(1);
    expect(displayWidth('é')).toBe(1);
    expect(displayWidth(cp(0x845b, 0xe0100))).toBe(2);
    expect(displayWidth(cp(0x2764, 0xfe0e))).toBe(1);
    // Nor does what comes before it: a prepended format character.
    expect(displayWidth(cp(0x600, 0x31))).toBe(1);
    expect(displayWidth(cp(0x600, 0x4e00))).toBe(2);
    // A cluster of nothing that shows takes none: a mark with nothing to
    // mark, an enclosing mark, the zero-width space and joiner, the
    // byte-order mark, a bidirectional mark, and control characters.
    for (const point of [0x301, 0x20dd, 0x200b, 0x200d, 0xfeff, 0x200e, 0x9, 0xa, 0x7, 0x7f, 0x85]) {
      expect(displayWidth(cp(point)), point.toString(16)).toBe(0);
    }
    expect(displayWidth(cp(0x61, 0x200b, 0x62))).toBe(2);
    expect(displayWidth(cp(0x61, 0x200d, 0x62))).toBe(2);
    expect(displayWidth(cp(0x61, 0x9, 0x62, 0xd, 0xa))).toBe(2);
    // A soft hyphen shows, as terminals draw one.
    expect(displayWidth(cp(0x63, 0x6f, 0xad, 0x6f, 0x70))).toBe(5);
  });

  it("counts an emoji sequence as two, whatever its first character's own width", () => {
    expect(displayWidth(cp(0x1f600))).toBe(2);
    // An emoji and the presentation selector, a keycap among them.
    expect(displayWidth(cp(0x2764))).toBe(1);
    expect(displayWidth(cp(0x2764, 0xfe0f))).toBe(2);
    expect(displayWidth(cp(0x31, 0xfe0f, 0x20e3))).toBe(2);
    expect(displayWidth(cp(0x23, 0xfe0f, 0x20e3))).toBe(2);
    // A modifier base and a skin tone.
    expect(displayWidth(cp(0x261d))).toBe(1);
    expect(displayWidth(cp(0x261d, 0x1f3fd))).toBe(2);
    expect(displayWidth(cp(0x1f44d, 0x1f3fd))).toBe(2);
    // Two regional indicators are a flag; one alone is a letter.
    expect(displayWidth(cp(0x1f1f9, 0x1f1fc))).toBe(2);
    expect(displayWidth(cp(0x1f1f9, 0x1f1fc, 0x1f1ef, 0x1f1f5))).toBe(4);
    expect(displayWidth(cp(0x1f1e6))).toBe(1);
    // Joined into one picture, from a wide emoji or a narrow one.
    expect(displayWidth(cp(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467))).toBe(2);
    expect(displayWidth(cp(0x1f3f3, 0xfe0f, 0x200d, 0x1f308))).toBe(2);
    // Only an emoji before the selector, and a modifier base before the skin
    // tone, make one: what extends a letter adds nothing to it.
    expect(displayWidth(cp(0x61, 0xfe0f))).toBe(1);
    expect(displayWidth(cp(0x61, 0x1f3fd))).toBe(1);
    expect(displayWidth(cp(0x61, 0x1f3fd, 0xfe0f))).toBe(1);
    // In a table cell.
    expect(displayWidth(`done ${cp(0x2705)} 已完成`)).toBe(14);
  });
});
