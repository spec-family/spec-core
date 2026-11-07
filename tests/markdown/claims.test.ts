import { describe, expect, it } from 'vitest';

import { findClaims, scanMarkdown, type Claim, type MarkdownScan } from '../../src/markdown/index.js';

const doc = (...lines: string[]): string => lines.join('\n');
const LABELS = ['Implemented', 'Specified', 'Target', 'Hypothesis'];
/** Each claim as [line, label, labels]. */
const claims = (text: string, vocabulary: readonly string[] = LABELS): [number, string, readonly string[]][] =>
  findClaims(scanMarkdown(text), vocabulary).map((c) => [c.item.line, c.label, c.labels]);

describe('claims', () => {
  it('reads an item that opens with a label as a claim, by bullet, number or checkbox', () => {
    const text = doc(
      '- `Implemented`: a refund over the captured amount is refused.',
      '1. `Specified` refunds carry a reason.',
      '- [x] `Target`: a build under a second.',
      '> - `Hypothesis` retries cut failed captures. Criterion: the failure rate.',
    );
    expect(claims(text)).toEqual([
      [1, 'Implemented', ['Implemented']],
      [2, 'Specified', ['Specified']],
      [3, 'Target', ['Target']],
      [4, 'Hypothesis', ['Hypothesis']],
    ]);
  });

  it('makes no claim of an item that opens with anything else', () => {
    const text = doc(
      '- The refund rule is `Implemented` as a token check.',
      '- **Implemented**: bold is not a label.',
      '- `Implemented_by`: a span the vocabulary lacks.',
      '- `implemented`: in another case.',
      '-  ',
      'A paragraph, `Implemented`.',
      '```',
      '- `Implemented` in a fence',
      '```',
    );
    expect(claims(text)).toEqual([]);
  });

  it('reads a label in a span of any run of backticks, with the space inside it', () => {
    expect(claims('- `` Implemented ``: two backticks.')).toEqual([[1, 'Implemented', ['Implemented']]]);
  });

  it('names every label the item itself writes, once, the opening one first', () => {
    const text = doc('- `Specified`; the partial refund is `Implemented` and `Implemented`, `Target` later.', '  More of it, still `Target`.');
    expect(claims(text)).toEqual([[1, 'Specified', ['Specified', 'Implemented', 'Target']]]);
  });

  it('gives a nested item its own claim, and none of its labels to the item above', () => {
    const text = doc(
      '1. Refunds.',
      '   - `Implemented`: `refund` needs a `capture`.',
      '     <!-- @assert-count target="payments" symbol="fn test_refund_limit" min="1" -->',
      '     - `Specified`: a partial refund needs a reason, not `Implemented`.',
      '   - `Hypothesis`: no `Target` yet.',
      '- `Target` above a nested `Specified` item:',
      '  - `Specified`: the nested one.',
    );
    expect(claims(text)).toEqual([
      [2, 'Implemented', ['Implemented']],
      [4, 'Specified', ['Specified', 'Implemented']],
      [5, 'Hypothesis', ['Hypothesis', 'Target']],
      [6, 'Target', ['Target', 'Specified']],
      [7, 'Specified', ['Specified']],
    ]);
  });

  it('gives a parent the labels it writes after an item nested under it', () => {
    const text = doc('- `Target`: the parent.', '  - `Specified`: the nested one.', '', '  Back in the parent, `Implemented`.');
    expect(claims(text)).toEqual([
      [1, 'Target', ['Target', 'Implemented']],
      [2, 'Specified', ['Specified']],
    ]);
  });

  it('reads a span before any item, and one after them all, as no item\'s', () => {
    expect(claims(doc('`Implemented` opens a paragraph.', '', '- `Specified`: one.', '', '`Target` after the list.'))).toEqual([[3, 'Specified', ['Specified']]]);
    expect(claims('`Implemented` and no list at all.')).toEqual([]);
  });

  it('keeps the item whole, so a directive under it is found inside its range', () => {
    const text = doc('- `Implemented`: one.', '  <!-- @assert-count target="src" symbol="fn test_one" min="1" -->', '', 'After.');
    const [claim] = findClaims(scanMarkdown(text), LABELS) as [Claim];
    const directive = text.indexOf('<!--');
    expect(claim.item.start <= directive && directive < claim.item.end).toBe(true);
    expect(text.indexOf('After.') >= claim.item.end).toBe(true);
  });

  it('reads nothing with an empty vocabulary', () => {
    expect(claims('- `Implemented`: one.', [])).toEqual([]);
  });
});

/**
 * The same question asked the slow way, for documents made at random: an
 * item's own spans are the spans in its text that lie in no item nested
 * under it, each item and span compared with every other.
 */
function slowClaims(scan: MarkdownScan, vocabulary: readonly string[]): [number, string, string[]][] {
  const out: [number, string, string[]][] = [];
  for (const item of scan.listItems) {
    const nested = scan.listItems.filter((other) => other !== item && other.start >= item.start && other.end <= item.end && other.start > item.start);
    const spans = scan.codeSpans.filter((span) => span.start >= item.textStart && span.start < item.end && !nested.some((n) => span.start >= n.start && span.start < n.end));
    const texts = spans.map((span) => scan.text.slice(span.start, span.end).replace(/^`+|`+$/g, '').trim());
    const labels = texts.filter((t, i) => vocabulary.includes(t) && texts.indexOf(t) === i);
    const first = spans[0];
    if (first !== undefined && first.start === item.textStart && vocabulary.includes(texts[0]!)) out.push([item.line, labels[0]!, labels]);
  }
  return out;
}

describe('claims, against the slow reading', () => {
  it('agrees on documents of nested items, labels and prose made at random', () => {
    let seed = 7;
    const random = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const words = ['`Implemented`', '`Specified`', '`Target`', 'text', '`code`', '**Implemented**', 'more'];
    for (let round = 0; round < 300; round += 1) {
      const lines: string[] = [];
      for (let line = 0; line < 1 + random(12); line += 1) {
        const depth = random(4);
        const marker = random(5) === 0 ? '1.' : random(6) === 0 ? '- [ ]' : '-';
        const body = Array.from({ length: 1 + random(4) }, () => words[random(words.length)]).join(' ');
        lines.push(random(7) === 0 ? '' : `${'  '.repeat(depth)}${random(9) === 0 ? '' : `${marker} `}${body}`);
      }
      const text = lines.join('\n');
      const scan = scanMarkdown(text);
      expect(claims(text, ['Implemented', 'Specified', 'Target']), text).toEqual(slowClaims(scan, ['Implemented', 'Specified', 'Target']));
    }
  });
});
