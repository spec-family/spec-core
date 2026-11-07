import { describe, expect, it } from 'vitest';

import { findCommitReferences, scanMarkdown } from '../../src/markdown/index.js';

const doc = (...lines: string[]): string => lines.join('\n');
/** Each reference as [kind, value, the text it spans]. */
const references = (text: string): [string, string, string][] =>
  findCommitReferences(scanMarkdown(text)).map((r) => [r.kind, r.value, text.slice(r.start, r.end)]);

describe('commit references', () => {
  it('reads a subject between quotes, straight or curly, in prose, a list item and a table cell', () => {
    const text = doc(
      'Applied in commit "Refuse a refund over its capture".',
      '- [x] Partial refunds (commit “Refund part of a capture”).',
      '',
      '| Key | Status |',
      '| --- | --- |',
      '| `refund-limit` | done: the rules (Commit "Hold refunds to the capture") |',
    );
    expect(references(text)).toEqual([
      ['subject', 'Refuse a refund over its capture', 'commit "Refuse a refund over its capture"'],
      ['subject', 'Refund part of a capture', 'commit “Refund part of a capture”'],
      ['subject', 'Hold refunds to the capture', 'Commit "Hold refunds to the capture"'],
    ]);
  });

  it('keeps what a subject holds, a code span or markup among it, trimmed at its ends', () => {
    expect(references('commit " Split `Shared<T>` in two "')).toEqual([['subject', 'Split `Shared<T>` in two', 'commit " Split `Shared<T>` in two "']]);
  });

  it('reads a hash of 7 to 40 digits, bare or as a code span, in lower case', () => {
    const forty = '0123456789abcdef0123456789ABCDEF01234567';
    expect(references(doc('commit 1a2b3c4 did it.', `commit ${forty}`, 'commit `ABCDEF0`, and commit `` 1234567 ``'))).toEqual([
      ['hash', '1a2b3c4', 'commit 1a2b3c4'],
      ['hash', forty.toLowerCase(), `commit ${forty}`],
      ['hash', 'abcdef0', 'commit `ABCDEF0`'],
      ['hash', '1234567', 'commit `` 1234567 ``'],
    ]);
  });

  it('allows tabs and spaces after the word, and no line between it and what it names', () => {
    expect(references('commit \t "a"')).toEqual([['subject', 'a', 'commit \t "a"']]);
    expect(references(doc('commit', '"a"'))).toEqual([]);
    expect(references(doc('commit', '1a2b3c4'))).toEqual([]);
    expect(references('commit"a"')).toEqual([]);
  });

  it('names nothing where the word is said otherwise or is part of another', () => {
    const text = doc(
      'We commit to "fast refunds".',
      'Two commits "a" and "b".',
      'A recommit "a", and commit-ish "b".',
      'commit 123456 is six digits, commit 0123456789abcdef0123456789abcdef012345678 forty-one.',
      'commit abcdef12x runs into a word, commit 1234567_ too, and commit 1234567. ends.',
      'commit `abcdefg` and commit `123 4567` hold no hash.',
    );
    expect(references(text)).toEqual([['hash', '1234567', 'commit 1234567']]);
  });

  it('names nothing where a quote does not close on its line, or closes on nothing', () => {
    expect(references(doc('commit "a', 'b" and later "c"'))).toEqual([]);
    expect(references('commit "" and commit "   "')).toEqual([]);
    expect(references('commit “a" never closed')).toEqual([]);
    expect(references('commit "a”" closes at the straight one')).toEqual([['subject', 'a”', 'commit "a”"']]);
  });

  it('reads nothing in code, a comment or front matter', () => {
    const text = doc(
      '---',
      'note: commit "in front matter"',
      '---',
      '',
      '`commit "in a span"` <!-- commit "in a comment" -->',
      '',
      '```',
      'commit "in a fence"',
      '```',
      '',
      '    commit "indented code"',
    );
    expect(references(text)).toEqual([]);
  });

  it('reads a subject that names a commit once, and goes on after it', () => {
    const text = 'commit "Say commit 1a2b3c4 in a subject" then commit 7654321';
    expect(references(text)).toEqual([
      ['subject', 'Say commit 1a2b3c4 in a subject', 'commit "Say commit 1a2b3c4 in a subject"'],
      ['hash', '7654321', 'commit 7654321'],
    ]);
  });

  it('finds the closing quote of each subject, however many quotes opened before it without closing', () => {
    const text = doc('commit “never closed', 'commit “closed”', 'commit "a" and commit "b"', 'commit "dangling', 'commit "c"');
    expect(references(text).map(([, value]) => value)).toEqual(['closed', 'a', 'b', 'c']);
  });

  it('gives each reference its offsets in the text', () => {
    const text = 'Done (commit "a").';
    const [reference] = findCommitReferences(scanMarkdown(text));
    expect(reference).toEqual({ kind: 'subject', value: 'a', start: 6, end: 16 });
  });
});
