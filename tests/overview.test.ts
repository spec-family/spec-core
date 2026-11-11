/**
 * The overview links each figure about the family to where it is kept, and
 * repeats none.
 *
 * Its *Measured* section once held a table of each repository's mutation
 * score, mutants, commit and run, copied from the sweeps of main on one day.
 * Every release moved one of them and nothing moved the copy, so the page a
 * newcomer reads first was the one most likely to be wrong. Each figure is
 * now where it is measured - a tool's README, an ADR's record, the workflow's
 * runs, the registry's manifests - and this test fails a copy that comes back.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const OVERVIEW = join(import.meta.dirname, '..', 'docs', 'overview.md');

/** The text under `## <heading>`, up to the next `## `, or null where there is none. */
function section(text: string, heading: string): string | null {
  const lines = text.split('\n');
  const start = lines.indexOf(`## ${heading}`);
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

/** What a sweep measures and a copy would restate, each with what it looks like. */
const FIGURES: ReadonlyArray<readonly [string, RegExp]> = [
  ['a percentage', /\d(?:\.\d+)?\s?%/u],
  ['a count with a thousands separator', /\b\d{1,3}(?:,\d{3})+\b/u],
  ['one run of a workflow', /\/actions\/runs\/\d/u],
  ['a commit', /`[0-9a-f]{7,40}`/u],
  ['a release', /\b\d+\.\d+\.\d+\b/u],
];

function figuresIn(text: string): string[] {
  return FIGURES.flatMap(([what, pattern]) => {
    const found = pattern.exec(text);
    return found === null ? [] : [`${what}: ${found[0]}`];
  });
}

describe('the overview', () => {
  const measured = section(readFileSync(OVERVIEW, 'utf8'), 'Measured');

  it('has a section that says where each figure is measured', () => {
    expect(measured).not.toBeNull();
  });

  it('repeats no figure there', () => {
    expect(figuresIn(measured ?? '')).toEqual([]);
  });

  it('links each repository to the runs of its sweep on main', () => {
    const links = [...(measured ?? '').matchAll(/https:\/\/github\.com\/spec-family\/([\w-]+)\/actions\/workflows\/[\w.-]+\.yml\?query=branch%3Amain/gu)];
    expect(new Set(links.map((link) => link[1]))).toEqual(
      new Set(['spec-core', 'spec-brief', 'spec-graph', 'spec-guard', 'spec-harness']),
    );
  });
});

describe('what the test counts as a figure', () => {
  it.each([
    ['96.66%', 'a percentage'],
    ['over 5,928 mutants', 'a count with a thousands separator'],
    ['[run](https://github.com/spec-family/spec-core/actions/runs/42605314127)', 'one run of a workflow'],
    ['| spec-core | `9de6a49` |', 'a commit'],
    ['the sweep of 0.24.2', 'a release'],
  ])('finds %s', (text, what) => {
    expect(figuresIn(text).map((found) => found.slice(0, found.indexOf(':')))).toEqual([what]);
  });

  it.each([
    'the sweeps of main, the newest first',
    'the workflow named `mutation (full)`',
    '[ADR-0007](adr/0007-verification.md#record)',
    'Node 22 or later',
  ])('passes %s', (text) => {
    expect(figuresIn(text)).toEqual([]);
  });
});
