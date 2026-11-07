import { describe, expect, it } from 'vitest';

import { findRegisterRows, flatCell, scanMarkdown } from '../../src/markdown/index.js';

/**
 * A register kept as a table: each row named by its key, at the status it
 * stands at, as spec-graph read them before the reading moved here
 * (ADR-0004).
 */

const doc = (...lines: string[]): string => lines.join('\n');
/** Each row as [key, status, line]. */
const rows = (text: string): [string, string | null, number][] => findRegisterRows(scanMarkdown(text)).map((row) => [row.key, row.status, row.row.line]);

describe('a register row', () => {
  it('is named by its key cell and stands at its status cell, both read flat', () => {
    const text = doc(
      '| Key | Problem | Status |',
      '| :--- | :--- | :--- |',
      '| `refund-limit` | Over the capture. | done: [refunds](spec/refunds.md) (commit "Refuse") |',
      '| **refund-reason** | No reason. | *proposed* |',
      '| [[refund-fee]] | Fees. | open   for now |',
    );
    expect(rows(text)).toEqual([
      ['refund-limit', 'done: refunds (commit "Refuse")', 3],
      ['refund-reason', 'proposed', 4],
      ['refund-fee', 'open for now', 5],
    ]);
    const [first] = findRegisterRows(scanMarkdown(text));
    expect([first!.keyCell.text, first!.statusCell?.text, first!.table.headers.length]).toEqual(['`refund-limit`', 'done: [refunds](spec/refunds.md) (commit "Refuse")', 3]);
  });

  it('is read under every header that names a key or a status, however it is cased or marked', () => {
    for (const [key, status] of [['ID', 'State'], ['**Ref**', 'stage'], ['#', 'Lifecycle'], ['ADR', '`Phase`'], ['Decision', 'Status:'], ['Key ✓', 'Status ✓']]) {
      expect(rows(doc(`| ${key} | ${status} |`, '| --- | --- |', '| x-1 | open |')), `${key} ${status}`).toEqual([['x-1', 'open', 3]]);
    }
  });

  it('takes the first column that names a key and the first after it that names a status, wherever they stand', () => {
    expect(rows(doc('| ID | Key | Status | State |', '| --- | --- | --- | --- |', '| a | b | open | done |'))).toEqual([['a', 'open', 3]]);
    expect(rows(doc('| Title | ID | Status |', '| --- | --- | --- |', '| t | a | open |', '| short |'))).toEqual([['a', 'open', 3]]);
  });

  it('is no row of a table without a key column or a status column', () => {
    expect(rows(doc('| Key | Problem |', '| --- | --- |', '| a | b |'))).toEqual([]);
    expect(rows(doc('| Title | Status |', '| --- | --- |', '| a | open |'))).toEqual([]);
    // A header names a column only as a whole: one that begins or ends with such a word names neither.
    for (const [key, status] of [['Paid', 'Status'], ['Notes', 'Status'], ['Key', 'Last stage'], ['Key', 'Stated by']]) {
      expect(rows(doc(`| ${key} | ${status} |`, '| --- | --- |', '| a | open |')), `${key} ${status}`).toEqual([]);
    }
  });

  it('is no row where its key names nothing, and has no status where its cell says nothing', () => {
    const text = doc(
      '| Key | Status |',
      '| --- | --- |',
      '| | open |',
      '| - | open |',
      '| ? | open |',
      '| N/A | open |',
      '| na | open |',
      '| __ | open |',
      '| a | |',
      '| b | TBD |',
      '| c | — |',
      '| d |',
    );
    expect(rows(text)).toEqual([
      ['a', null, 9],
      ['b', null, 10],
      ['c', null, 11],
      ['d', null, 12],
    ]);
    expect(findRegisterRows(scanMarkdown(text)).at(-1)?.statusCell).toBeNull();
    // A placeholder is the whole cell: a key that begins or ends like one is a key.
    expect(rows(doc('| Key | Status |', '| --- | --- |', '| arena | open |', '| nationality | -- |'))).toEqual([
      ['arena', 'open', 3],
      ['nationality', null, 4],
    ]);
  });

  it('is read in every table of the document, in order', () => {
    expect(rows(doc('| Key | Status |', '| --- | --- |', '| a | open |', '', 'Prose.', '', '| ID | State |', '| --- | --- |', '| b | done |'))).toEqual([
      ['a', 'open', 3],
      ['b', 'done', 9],
    ]);
  });
});

describe('a cell read flat', () => {
  it('keeps link labels, drops code and emphasis marks, and folds space', () => {
    expect(flatCell('  `a`  **b** _c_ ~~d~~ [e](f.md) ![g](h.png) [[i]] [[target|k]]  ')).toBe('a b c d e g i k');
  });
});
