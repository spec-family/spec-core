/**
 * spec-guard's own line table and mask, against this library's, which is
 * the reference for every tool (ADR-0001, amended 2026-11-12).
 *
 * spec-guard counts a line feed alone as a line's end: its `src/text.ts` at
 * ad46b21, the copy in `markdown/reference/spec-guard/text.ts`, whose three
 * functions are its main's byte for byte on 2026-11-12. spec-graph reads
 * lines through this library and counts `\n`, `\r\n` and a lone `\r`, as
 * CommonMark does, so on a document with a lone `\r` the two tools put one
 * finding on different lines (round 29's evaluation: line 9 in spec-guard,
 * line 12 in spec-graph). Every text of up to seven characters of `a`, `\n`
 * and `\r` is put to both, and the three ways they differ are pinned, so that
 * spec-guard knows what it moves to.
 */

import { describe, expect, it } from 'vitest';

import { lineStarts, locate, maskRanges } from '../src/text/index.js';
import * as guard from './markdown/reference/spec-guard/text.js';

function texts(maxLength: number): string[] {
  const out = [''];
  let level = [''];
  for (let length = 1; length <= maxLength; length += 1) {
    level = level.flatMap((text) => ['a', '\n', '\r'].map((char) => text + char));
    out.push(...level);
  }
  return out;
}

const ALL = texts(7);
const loneCr = (text: string): boolean => /\r(?!\n)/.test(text);

describe("spec-guard's line table", () => {
  it('is this one where no carriage return stands alone, but for the empty line it counts after a final line feed', () => {
    let compared = 0;
    for (const text of ALL.filter((t) => !loneCr(t))) {
      const expected = lineStarts(text);
      if (text.endsWith('\n')) expected.push(text.length);
      expect(guard.lineStarts(text), JSON.stringify(text)).toEqual(expected);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(400);
  });

  it('runs a lone carriage return into the line after it, where this ends the line there', () => {
    // A lone carriage return that ends the text opens no line in either.
    for (const text of ALL.filter((t) => /\r[^\n]/.test(t))) {
      expect(guard.lineStarts(text).length, JSON.stringify(text)).toBeLessThan(lineStarts(text).length + (text.endsWith('\n') ? 1 : 0));
    }
    expect(guard.lineStarts('a\rb\nc')).toEqual([0, 4]);
    expect(lineStarts('a\rb\nc')).toEqual([0, 2, 4]);
  });

  it('places every offset on the line and column this does, where it reads the same table', () => {
    for (const text of ALL.filter((t) => !loneCr(t))) {
      const mine = lineStarts(text);
      const theirs = guard.lineStarts(text);
      for (let offset = 0; offset < text.length; offset += 1) {
        const { line, column } = locate(mine, offset);
        expect(guard.locate(theirs, offset), JSON.stringify([text, offset])).toEqual({ line, column });
      }
    }
    // At the end of a text that ends in a line feed, it opens the line it counted there.
    expect(guard.locate(guard.lineStarts('a\n'), 2)).toEqual({ line: 2, column: 1 });
    expect(locate(lineStarts('a\n'), 2)).toEqual({ offset: 2, line: 1, column: 3 });
  });
});

describe("spec-guard's mask", () => {
  it('is this one where a text holds no carriage return, for every range', () => {
    for (const text of ALL.filter((t) => !t.includes('\r') && t.length <= 5)) {
      for (let start = 0; start <= text.length; start += 1) {
        for (let end = start; end <= text.length; end += 1) {
          expect(guard.maskRanges(text, [[start, end]]), JSON.stringify([text, start, end])).toBe(maskRanges(text, [{ start, end }]));
        }
      }
    }
  });

  it('blanks a carriage return that this keeps, so a mask keeps every line where the text has it', () => {
    expect(guard.maskRanges('a\r\nb\rc', [[0, 6]])).toBe('  \n   ');
    expect(maskRanges('a\r\nb\rc', [{ start: 0, end: 6 }])).toBe(' \r\n \r ');
  });
});
