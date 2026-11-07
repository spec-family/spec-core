/**
 * Documents built to make a naive scanner quadratic.
 *
 * Each is scanned once at sixteen times its size, and sixteen times over at
 * its size: the same work, if the work is linear. Work that grows with the
 * square of the input takes sixteen times as long on the larger document, and
 * work that grows as its square root cubed - a paragraph of backtick runs,
 * each a different length - four times. The check allows twice, and a fixed
 * allowance for noise, so it holds on a slow machine and under
 * instrumentation, which slow both alike, and a quadratic scan still fails
 * it.
 *
 * The two are timed over runs of the same length, taken in turn, so that a
 * machine busy with other work slows both. And each document is sized so
 * that its larger scan takes tens of milliseconds, where the allowance is
 * most of the bound: a heap sixteen times as full costs more to collect, so
 * past that linear work reads as growing faster than its input. One small
 * scan against one large scan of 80,000 lines kept a margin of 1.7 on a
 * machine running six other suites, and one such check failed with nothing
 * wrong; as they are now, the least margin measured so is 2.3. A document of
 * 16,000 units at the larger size still makes work that grows with its
 * square take seconds, and a stack copied at every bracket, the cheapest
 * such slip tried, fail the check by half.
 *
 * What is timed is the whole of the work: the scan, and the links, list items
 * and directives mask it makes only when first asked for, which a check that
 * timed the scan alone never saw.
 */

import { describe, expect, it } from 'vitest';

import { findClaims, scanMarkdown, sectionsOf, type MarkdownScan } from '../../src/markdown/index.js';
import { fastestInTurn } from '../timing.js';

/** A scan with every part it makes when first asked for already made. */
function scanWhole(text: string): MarkdownScan {
  const scan = scanMarkdown(text);
  void scan.links;
  void scan.listItems;
  void scan.masks.directives;
  return scan;
}

/**
 * Holds `work(large)` to about as long as `work(small)` sixteen times over,
 * `large` being sixteen times `small`, and answers `work(large)`.
 */
function expectSameWork<T, R>(small: T, large: T, work: (input: T) => R): R {
  work(small);
  let answer: R | undefined;
  const [sixteenSmall, oneLarge] = fastestInTurn(
    3,
    () => {
      for (let i = 0; i < 16; i += 1) work(small);
    },
    () => {
      answer = work(large);
    },
  ) as [number, number];
  expect(oneLarge).toBeLessThan(2 * sixteenSmall + 100);
  return answer as R;
}

/** Scans `make(1)` and `make(16)`, which must be about sixteen times as large, and compares. */
function expectLinear(make: (scale: number) => string, then: (scan: MarkdownScan) => void = () => {}): void {
  then(expectSameWork(make(1), make(16), scanWhole));
}

describe('linear time on hostile input', () => {
  it('backtick runs of every length, none closed, in one paragraph', () => {
    const make = (scale: number): string => {
      const parts: string[] = [];
      for (let k = 1; k <= 350 * Math.sqrt(scale); k += 1) parts.push(`${'`'.repeat(k)} x`);
      return parts.join(' ');
    };
    expectLinear(make, (s) => expect(s.codeSpans).toEqual([]));
  });

  it('the same, one run to a line', () => {
    const make = (scale: number): string => {
      const lines: string[] = [];
      for (let k = 1; k <= 350 * Math.sqrt(scale); k += 1) lines.push(`a ${'`'.repeat(k)} x`);
      return lines.join('\n');
    };
    expectLinear(make, (s) => expect(s.codeSpans).toEqual([]));
  });

  it('comments opened in the middle of lines and never closed', () => {
    expectLinear(
      (scale) => 'a <!-- b '.repeat(4000 * scale),
      (s) => expect(s.comments).toEqual([]),
    );
  });

  it('brackets nested deep, with a definition to look labels up in', () => {
    expectLinear(
      (scale) => `${'[ '.repeat(1_000 * scale)}x${' ]'.repeat(1_000 * scale)}\n\n[x]: y`,
      (s) => expect(s.links.map((l) => l.form)).toEqual(['shortcut', 'definition']),
    );
    // Two brackets together open a wiki link, which closes on the first `]]`.
    expect(scanMarkdown(`${'['.repeat(1000)}x${']'.repeat(1000)}`).links.map((l) => l.form)).toEqual(['wiki']);
  });

  it('definitions under a paragraph and under one another, and a label of escapes never closed', () => {
    expectLinear(
      (scale) => `text\n${'[a]: b\n'.repeat(1_000 * scale)}\n${'[c]: d\n'.repeat(1_000 * scale)}`,
      (s) => expect(s.links.length).toBe(1_000 * 16),
    );
    expectLinear(
      (scale) => `[${'\\]'.repeat(10_000 * scale)}: x`,
      (s) => expect(s.links).toEqual([]),
    );
  });

  it('link text full of images, and full of brackets that open nothing', () => {
    expectLinear(
      (scale) => `[${'![a](b.png) [c] '.repeat(1_000 * scale)}](d.md)`,
      (s) => expect(s.links.length).toBe(1 + 1_000 * 16),
    );
    expectLinear(
      // A space after the first `[` and before the last `]`: `[[` would open a wiki link.
      (scale) => `[ ${'[ '.repeat(1_000 * scale)}x${' ]'.repeat(1_000 * scale)} ](d.md)`,
      (s) => expect(s.links.map((l) => l.target)).toEqual(['d.md']),
    );
  });

  it('links and images nested deep around a link, each with a destination', () => {
    expectLinear(
      (scale) => `${'[ '.repeat(1_000 * scale)}[x](y)${' ](z)'.repeat(1_000 * scale)}`,
      (s) => expect(s.links.map((l) => l.target)).toEqual(['y']),
    );
    expectLinear(
      (scale) => `${'![ '.repeat(1_000 * scale)}[x](y)${' ](z)'.repeat(1_000 * scale)}`,
      (s) => expect(s.links.map((l) => [l.image, l.target])).toEqual([[true, 'z']]),
    );
  });

  it('link destinations that never close', () => {
    const none = (s: MarkdownScan): void => expect(s.links).toEqual([]);
    expectLinear((scale) => '[a](b'.repeat(1000 * scale), none);
    expectLinear((scale) => '[a](<b '.repeat(1000 * scale), none);
    expectLinear((scale) => `[a](${'('.repeat(10_000 * scale)}`, none);
  });

  it('titles that never close', () => {
    const none = (s: MarkdownScan): void => expect(s.links).toEqual([]);
    expectLinear((scale) => '[a](b "x '.repeat(1000 * scale), none);
    expectLinear((scale) => "[a](b 'x ".repeat(1000 * scale), none);
    expectLinear((scale) => '[a](b (x '.repeat(1000 * scale), none);
  });

  it('wiki links and autolinks that never close', () => {
    const none = (s: MarkdownScan): void => expect(s.links).toEqual([]);
    expectLinear((scale) => '[[a '.repeat(5000 * scale), none);
    expectLinear((scale) => '<https:a'.repeat(3000 * scale), none);
  });

  it('long runs of one character where a heading, a rule, a table or a quote is read', () => {
    expectLinear((scale) => `#${' '.repeat(20_000 * scale)}x`);
    expectLinear((scale) => `${'-'.repeat(20_000 * scale)}x`);
    expectLinear((scale) => `a\n${'='.repeat(20_000 * scale)}`);
    expectLinear((scale) => `|${' '.repeat(20_000 * scale)}|\n|---|`);
    expectLinear((scale) => `${'>'.repeat(20_000 * scale)} a`);
    expectLinear((scale) => `- ${' '.repeat(20_000 * scale)}[x]`);
  });

  it('lists nested deep, and closed all at once', () => {
    const make = (scale: number): string => {
      const lines: string[] = [];
      for (let k = 0; k < 150 * Math.sqrt(scale); k += 1) lines.push(`${' '.repeat(k * 2)}- item`);
      lines.push('', 'text');
      return lines.join('\n');
    };
    expectLinear(make, (s) => expect(s.listItems.at(-1)?.depth).toBe(599));
  });

  it('claims nested deep, each holding labels, read for their own labels', () => {
    // The nesting is what a naive reading pays for: each claim's spans would
    // be read again for every item it is nested under.
    const make = (scale: number): string => {
      const lines: string[] = [];
      for (let k = 0; k < 150 * Math.sqrt(scale); k += 1) lines.push(`${' '.repeat(k * 2)}- \`Implemented\` and \`Specified\` and \`Target\``);
      lines.push('', 'text');
      return lines.join('\n');
    };
    const claims = expectSameWork(make(1), make(16), (text) => findClaims(scanWhole(text), ['Implemented', 'Specified', 'Target']));
    expect(claims).toHaveLength(600);
    expect(claims.at(-1)?.labels).toEqual(['Implemented', 'Specified', 'Target']);
  });

  it('many headings that slug alike, and their sections', () => {
    expectLinear(
      (scale) => `# top\n${'## same\n'.repeat(500 * scale)}`,
      (s) => expect(s.headings.at(-1)?.anchor).toBe('same-7999'),
    );
    // Only the sections are timed here, so their scans may be larger: a
    // section's search for the next heading costs little per step, and needs
    // many headings for work that grows with their square to show.
    const small = scanMarkdown(`# top\n${'## same\n'.repeat(2500)}`);
    const large = scanMarkdown(`# top\n${'## same\n'.repeat(2500 * 16)}`);
    expect(expectSameWork(small, large, sectionsOf).at(-1)?.heading.anchor).toBe('same-39999');
  });

  it('front matter that never closes', () => {
    expectLinear(
      (scale) => `---\n${'a: b\n'.repeat(1000 * scale)}`,
      (s) => expect(s.frontMatter).toBeNull(),
    );
  });
});
