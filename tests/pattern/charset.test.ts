/**
 * The sets a glob's characters compile to, held to what `charset.ts` promises
 * of them for any point, beyond the points a glob gives it: no set but the
 * separator's accepts `/`.
 */

import { describe, expect, it } from 'vitest';

import { accepts, acceptsIgnoringCase, ANY, classSet, literalSet, SEPARATOR } from '../../src/pattern/charset.js';

const SLASH = 0x2f;

describe('a set of characters', () => {
  it('of the one character `/`, which no glob literal is, is the separator and accepts it', () => {
    // A glob's literals come from inside one segment, so the compiler never
    // asks for this set; the module computes it so that what it returns holds
    // for any point.
    expect(literalSet(SLASH)).toEqual(SEPARATOR);
    expect(accepts(literalSet(SLASH), SLASH)).toBe(true);
    expect(acceptsIgnoringCase(literalSet(SLASH), SLASH)).toBe(true);
  });

  it('of any other character, of a class or of any character, accepts no `/`', () => {
    for (const point of [0, 0x2e, 0x30, 0x5c, 0x61, 0xffff]) {
      expect(accepts(literalSet(point), SLASH), String(point)).toBe(false);
      expect(accepts(literalSet(point), point), String(point)).toBe(true);
    }
    // A class that names the slash, or one that leaves it out, still keeps
    // a segment of a pattern to a segment of a path.
    expect(accepts(classSet([[SLASH, SLASH]], false), SLASH)).toBe(false);
    expect(accepts(classSet([[0x61, 0x61]], true), SLASH)).toBe(false);
    expect(accepts(ANY, SLASH)).toBe(false);
  });
});
