/**
 * The merge that turns the shards of CI's mutation sweep back into one score
 * (scripts/mutation-shards.mjs).
 *
 * The merge is the gate, so the property worth holding is that it cannot score
 * anything but exactly one sweep: a report split into shards the way Stryker
 * would write them must merge back to the same verdicts, tests and score, and
 * each way of not being one sweep must be refused rather than scored. The
 * tests are spec-graph's and spec-guard's, where each of 24 defects put into
 * the merge one at a time made them fail.
 *
 * The order the sweep runs a mutant's test files in is held here too
 * (vitest.mutation.config.ts): it is the sweep's own, and no mutant is under
 * it. So is what the sweep reports, as vitest resolves it from that file.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

import { minimatch } from 'minimatch';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaseSequencer, type TestModule, type TestModuleState, type TestSpecification, type Vitest } from 'vitest/node';

import {
  ASSIGNED,
  checkAssignment,
  formatTable,
  gate,
  mergeReports,
  mutateFor,
  reportHtml,
  SHARD_COUNT,
  ShardError,
  type Mutant,
  type Report,
  type Thresholds,
} from '../scripts/mutation-shards.mjs';

const ROOT = join(import.meta.dirname, '..');

const BASE = ['src/**/*.ts', '!src/**/index.ts'];
const ASSIGNMENT = [['src/b.ts', 'src/d.ts'], ['src/a.ts']];
const THRESHOLDS = { high: 80, low: 60, break: 50 };

const TESTS: Record<string, string[]> = {
  'tests/a.test.ts': ['parses', 'rejects'],
  'tests/b.test.ts': ['walks', 'skips', 'counts'],
};

const testId = (file: string, name: string) =>
  String(Object.entries(TESTS).flatMap(([f, names]) => names.map((n) => `${f}|${n}`)).indexOf(`${file}|${name}`));

function mutant(id: number, status: string, covered: [string, string][], killed: [string, string][] = []): Mutant {
  return {
    id: String(id),
    mutatorName: 'StringLiteral',
    replacement: '""',
    location: { start: { line: id + 1, column: 1 }, end: { line: id + 1, column: 3 } },
    status,
    static: id % 4 === 0,
    coveredBy: covered.map(([file, name]) => testId(file, name)),
    killedBy: killed.map(([file, name]) => testId(file, name)),
  };
}

const A: [string, string] = ['tests/a.test.ts', 'parses'];
const R: [string, string] = ['tests/a.test.ts', 'rejects'];
const W: [string, string] = ['tests/b.test.ts', 'walks'];
const S: [string, string] = ['tests/b.test.ts', 'skips'];
const C: [string, string] = ['tests/b.test.ts', 'counts'];

// The sweep as one run would report it.
function unsplit(): Report {
  let id = 0;
  const file = (mutants: Mutant[]) => ({ language: 'typescript', source: 'export {};\n', mutants });
  return {
    schemaVersion: '1.0',
    projectRoot: '/work/spec-core',
    thresholds: THRESHOLDS,
    config: { mutate: BASE, thresholds: THRESHOLDS, timeoutMS: 5000 },
    framework: { name: 'StrykerJS' },
    files: {
      'src/a.ts': file([mutant(id++, 'Killed', [A, R], [R]), mutant(id++, 'Survived', [A]), mutant(id++, 'Timeout', [W], [])]),
      'src/b.ts': file([mutant(id++, 'Killed', [W, S], [S]), mutant(id++, 'NoCoverage', [])]),
      'src/c.ts': file([mutant(id++, 'Survived', [C]), mutant(id++, 'Killed', [C, A], [A]), mutant(id++, 'Killed', [R], [R])]),
      'src/d.ts': file([mutant(id++, 'Killed', [S], [S])]),
      'src/e/f.ts': file([mutant(id++, 'Survived', [W, C]), mutant(id++, 'Killed', [A, W, S], [W])]),
    },
    testFiles: Object.fromEntries(
      Object.entries(TESTS).map(([f, names]) => [
        f,
        { source: '', tests: names.map((name) => ({ id: testId(f, name), name })) },
      ]),
    ),
  };
}

const owner = (file: string) => {
  const index = ASSIGNMENT.findIndex((files) => files.includes(file));
  return index === -1 ? ASSIGNMENT.length + 1 : index + 1;
};

// The shards as Stryker would write them: only their own files, mutant ids and
// test ids numbered afresh, and tests listed in an order of their own - so a
// merge that trusted an id across reports would attach the wrong tests.
function split(report: Report): { shard: number; report: Report }[] {
  return Array.from({ length: ASSIGNMENT.length + 1 }, (_, index) => {
    const shard = index + 1;
    const order = Object.entries(report.testFiles!).flatMap(([file, entry]) => entry.tests.map((test) => ({ file, test })));
    if (shard % 2 === 0) order.reverse();
    const local = new Map(order.map(({ test }, position) => [test.id, String((position * 7 + shard) % 1000)]));
    const testFiles: NonNullable<Report['testFiles']> = {};
    for (const { file, test } of order) {
      (testFiles[file] ??= { source: '', tests: [] }).tests.push({ ...test, id: local.get(test.id)! });
    }
    let nextId = 0;
    const files = Object.fromEntries(
      Object.entries(report.files)
        .filter(([name]) => owner(name) === shard)
        .map(([name, file]) => [
          name,
          {
            ...file,
            mutants: file.mutants.map((m) => ({
              ...m,
              id: String(nextId++),
              coveredBy: m.coveredBy?.map((id) => local.get(id)!),
              killedBy: m.killedBy?.map((id) => local.get(id)!),
            })),
          },
        ]),
    );
    return {
      shard,
      report: {
        ...report,
        files,
        testFiles,
        thresholds: { ...THRESHOLDS, break: null },
        config: { ...report.config, mutate: mutateFor(BASE, shard, ASSIGNMENT), thresholds: { ...THRESHOLDS, break: null } },
      },
    };
  });
}

const merge = (shards: { shard: number; report: Report }[]) =>
  mergeReports(shards, { base: BASE, thresholds: THRESHOLDS, assigned: ASSIGNMENT });

// Every mutant as what it is, with its tests by name rather than by id.
function verdicts(report: Report) {
  const names = new Map(
    Object.entries(report.testFiles!).flatMap(([file, entry]) => entry.tests.map((test) => [test.id, `${file} > ${test.name}`])),
  );
  return Object.entries(report.files).flatMap(([file, entry]) =>
    entry.mutants.map(({ id: _id, coveredBy, killedBy, ...rest }) => ({
      file,
      ...rest,
      coveredBy: coveredBy?.map((id) => names.get(id)),
      killedBy: killedBy?.map((id) => names.get(id)),
    })),
  );
}

const refused = (shards: { shard: number; report: Report }[]) => {
  try {
    merge(shards);
  } catch (error) {
    expect(error).toBeInstanceOf(ShardError);
    return (error as Error).message;
  }
  throw new Error('merged');
};

describe('mutateFor', () => {
  it('gives a listed shard its files, and the last shard the rest of the base patterns', () => {
    expect(mutateFor(BASE, 1, ASSIGNMENT)).toEqual(['src/b.ts', 'src/d.ts']);
    expect(mutateFor(BASE, '2', ASSIGNMENT)).toEqual(['src/a.ts']);
    expect(mutateFor(BASE, 3, ASSIGNMENT)).toEqual([...BASE, '!src/b.ts', '!src/d.ts', '!src/a.ts']);
  });

  it('refuses a shard that is unset or not one of them', () => {
    for (const shard of [undefined, '', '0', '4', '1.5', ' 1', 'one']) {
      expect(() => mutateFor(BASE, shard, ASSIGNMENT)).toThrow(`A shard is a number from 1 to 3, got "${String(shard)}".`);
    }
  });

  it('refuses a table that lists a file twice, or a file the configuration does not mutate', () => {
    expect(() => checkAssignment(BASE, [['src/a.ts'], ['src/b.ts', 'src/a.ts']])).toThrow('src/a.ts is assigned to shards 1 and 2.');
    expect(() => checkAssignment(BASE, [['src/m/index.ts']])).toThrow(
      'src/m/index.ts is assigned to shard 1, but the configuration does not mutate it (src/**/*.ts, !src/**/index.ts).',
    );
    expect(() => checkAssignment(BASE, [['lib/a.ts']])).toThrow('lib/a.ts is assigned to shard 1');
    expect(checkAssignment(['src/**/*.ts', '!src/x/**', 'src/x/keep.ts'], [['src/x/keep.ts']]).get('src/x/keep.ts')).toBe(1);
  });
});

describe('mergeReports', () => {
  it('merges the shards back into the sweep they were split from', () => {
    const original = unsplit();
    const merged = merge(split(original));

    expect(verdicts(merged)).toEqual(verdicts(original));
    expect(Object.keys(merged.files)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e/f.ts']);
    const ids = Object.values(merged.files).flatMap((file) => file.mutants.map((m) => m.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(gate(merged, THRESHOLDS).metrics).toEqual(gate(original, THRESHOLDS).metrics);
    expect(merged.thresholds).toEqual(THRESHOLDS);
    expect(merged.config).toEqual({ ...original.config, mutate: BASE, thresholds: THRESHOLDS });
    expect(merged.projectRoot).toBe('/work/spec-core');
  });

  it('merges shards in whatever order their reports arrive', () => {
    const original = unsplit();
    expect(verdicts(merge(split(original).reverse()))).toEqual(verdicts(original));
  });

  it('attaches the wrong tests if test ids are trusted across shards, which is what the fixture is built to catch', () => {
    const original = unsplit();
    const shards = split(original);
    const naive = { ...shards[0]!.report, testFiles: shards[0]!.report.testFiles, files: Object.assign({}, ...shards.map((s) => s.report.files)) };
    expect(verdicts(naive).map((v) => v.coveredBy)).not.toEqual(verdicts(original).map((v) => v.coveredBy));
  });

  it('refuses a sweep with a shard missing', () => {
    const shards = split(unsplit());
    expect(refused(shards.filter((s) => s.shard !== 2))).toBe(
      'No report from shard 2 of 3: the sweep is incomplete, and an incomplete sweep has no score.',
    );
    expect(refused([shards[0]!])).toBe('No report from shard 2 or 3 of 3: the sweep is incomplete, and an incomplete sweep has no score.');
  });

  it('refuses a shard that reported twice, or one that is not a shard', () => {
    const shards = split(unsplit());
    expect(refused([...shards, shards[1]!])).toBe('Shard 2 reported twice.');
    expect(refused([...shards, { shard: 4, report: shards[0]!.report }])).toBe('There are 3 shards, but a report came from shard 4.');
    expect(refused([{ shard: 0, report: shards[0]!.report }, ...shards])).toBe('There are 3 shards, but a report came from shard 0.');
  });

  it('refuses a shard that ran with patterns other than its own', () => {
    const shards = split(unsplit());
    shards[2]!.report.config = { ...shards[2]!.report.config, mutate: BASE };
    expect(refused(shards)).toBe(`Shard 3 ran with mutate ${JSON.stringify(BASE)}, not ${JSON.stringify(mutateFor(BASE, 3, ASSIGNMENT))}.`);
  });

  it('refuses a file mutated by two shards', () => {
    const shards = split(unsplit());
    shards[2]!.report.files['src/a.ts'] = shards[1]!.report.files['src/a.ts']!;
    expect(refused(shards)).toBe('src/a.ts was mutated by shards 2 and 3.');
  });

  it('refuses a file reported by a shard it does not belong to', () => {
    const shards = split(unsplit());
    shards[0]!.report.files['src/c.ts'] = shards[2]!.report.files['src/c.ts']!;
    delete shards[2]!.report.files['src/c.ts'];
    expect(refused(shards)).toBe('src/c.ts belongs to shard 3, but shard 1 reported it.');
  });

  it('refuses a listed file its shard did not mutate, as a renamed file would be', () => {
    const shards = split(unsplit());
    delete shards[0]!.report.files['src/d.ts'];
    expect(refused(shards)).toBe(
      'src/d.ts is assigned to shard 1, which reported no mutants in it. If it was renamed or removed, update ASSIGNED in scripts/mutation-shards.mjs.',
    );
  });

  it('refuses shards that ran different tests', () => {
    const shards = split(unsplit());
    const tests = shards[2]!.report.testFiles!['tests/b.test.ts']!.tests;
    tests.splice(tests.findIndex((test) => test.name === 'skips'), 1);
    expect(refused(shards)).toBe('Shards 1 and 3 ran different tests: 1 only in shard 1, 0 only in shard 3, such as "skips" in tests/b.test.ts.');

    const extra = split(unsplit());
    extra[1]!.report.testFiles!['tests/c.test.ts'] = { source: '', tests: [{ id: '999', name: 'is new' }] };
    expect(refused(extra)).toBe('Shards 1 and 2 ran different tests: 0 only in shard 1, 1 only in shard 2, such as "is new" in tests/c.test.ts.');
  });

  it('refuses tests it cannot tell apart by name', () => {
    const shards = split(unsplit());
    const tests = shards[1]!.report.testFiles!['tests/a.test.ts']!.tests;
    tests.push({ ...tests[0]!, id: '998' });
    expect(refused(shards)).toBe(`Shard 2 has two tests named "${tests[0]!.name}" in tests/a.test.ts, so its tests cannot be matched by name.`);
  });

  it('refuses a mutant that names a test its report does not define', () => {
    const shards = split(unsplit());
    shards[1]!.report.files['src/a.ts']!.mutants[0]!.killedBy = ['12345'];
    expect(refused(shards)).toBe('Shard 2 names test 12345, which its report does not define.');
  });
});

describe('gate', () => {
  const scored = (killed: number, survived: number) => {
    const report = unsplit();
    report.files = {
      'src/a.ts': {
        mutants: [
          ...Array.from({ length: killed }, (_, i) => mutant(i, 'Killed', [A], [A])),
          ...Array.from({ length: survived }, (_, i) => mutant(killed + i, 'Survived', [A])),
        ],
      },
    };
    return report;
  };

  it('fails a score under the break threshold and passes one on it, as Stryker does', () => {
    const on = gate(scored(97, 3), { high: 98, low: 95, break: 97 });
    expect(on.metrics.mutationScore).toBe(97);
    expect(on).toMatchObject({ passed: true, message: 'Final mutation score of 97.00 is greater than or equal to break threshold 97.' });

    const under = gate(scored(9699, 301), { high: 98, low: 95, break: 97 });
    expect(under.metrics.mutationScore).toBeCloseTo(96.99, 10);
    expect(under).toMatchObject({ passed: false, message: 'Final mutation score 96.99 under breaking threshold 97.' });
  });

  it('counts a timeout as detected and an uncovered mutant as not', () => {
    const { metrics } = gate(unsplit(), THRESHOLDS);
    expect(metrics).toMatchObject({ killed: 6, timeout: 1, survived: 3, noCoverage: 1, totalMutants: 11 });
    expect(metrics.mutationScore).toBeCloseTo((7 / 11) * 100, 10);
  });

  it('passes anything when no break threshold is configured', () => {
    expect(gate(scored(0, 5), { high: 98, low: 95, break: null })).toMatchObject({
      passed: true,
      message: 'Final mutation score 0.00, with no break threshold configured.',
    });
  });
});

describe('the merged report as people read it', () => {
  it('prints a row per file under the totals', () => {
    expect(formatTable(merge(split(unsplit())))).toBe(
      [
        'File       | % score | % covered | killed | timeout | survived | no cov | errors',
        '-----------|---------|-----------|--------|---------|----------|--------|-------',
        'All files  |   63.64 |     70.00 |      6 |       1 |        3 |      1 |      0',
        'src/a.ts   |   66.67 |     66.67 |      1 |       1 |        1 |      0 |      0',
        'src/b.ts   |   50.00 |    100.00 |      1 |       0 |        0 |      1 |      0',
        'src/c.ts   |   66.67 |     66.67 |      2 |       0 |        1 |      0 |      0',
        'src/d.ts   |  100.00 |    100.00 |      1 |       0 |        0 |      0 |      0',
        'src/e/f.ts |   50.00 |     50.00 |      1 |       0 |        1 |      0 |      0',
      ].join('\n'),
    );
  });

  it('writes a page no source text can break out of', () => {
    const report = unsplit();
    report.files['src/a.ts']!.source = 'const s = "</script><script>alert(1)</script>";';
    const html = reportHtml(report, '/* elements */');
    expect(html).toContain('<script>\n/* elements */\n</script>');
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    const payload = html.slice(html.indexOf('app.report = ') + 'app.report = '.length, html.indexOf(';\nfunction updateTheme'));
    expect(new Function(`return ${payload}`)()).toEqual(report);
  });
});

// The sweep's configuration and the order it names, from one import, so that
// they are the same class.
const mutationSuite = async () =>
  (await import(pathToFileURL(join(ROOT, 'vitest.mutation.config.ts')).href)) as typeof import('../vitest.mutation.config.js');

describe("the order a mutant's test files run in", () => {
  // What a worker's cache holds for each file after it last ran it, and the
  // size of each file on the disk, which vitest 5 reads where a file has no
  // time: the long files here are small, and the largest are quick.
  type Timed = Record<string, { duration: number; failed: boolean }>;
  const TIMED: Timed = {
    'tests/markdown/linear.test.ts': { duration: 4_300, failed: false },
    'tests/markdown/properties.test.ts': { duration: 1_800, failed: false },
    'tests/markdown/links.test.ts': { duration: 35, failed: false },
    'tests/path.test.ts': { duration: 6, failed: false },
  };
  const SIZES: Record<string, number> = {
    'tests/markdown/linear.test.ts': 8_343,
    'tests/markdown/properties.test.ts': 9_159,
    'tests/markdown/links.test.ts': 25_697,
    'tests/path.test.ts': 4_529,
    'tests/pattern/oracle.test.ts': 10_257,
    'tests/pattern/glob.test.ts': 57_581,
  };
  const FOUND = Object.keys(SIZES);

  // Files of those sizes, where both sequencers look for them, in a folder
  // of each test's own: the record is the module's, and a file it has not
  // seen is one no worker has run.
  let work = '';
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'spec-core-sequencer-')).replaceAll('\\', '/');
    for (const [file, size] of Object.entries(SIZES)) {
      mkdirSync(dirname(join(work, file)), { recursive: true });
      writeFileSync(join(work, file), 'x'.repeat(size));
    }
  });
  afterEach(() => rmSync(work, { recursive: true, force: true }));

  // The order's own record, told of a file's end as vitest tells a reporter,
  // by default in the time the cache has for it.
  const ended = async (file: string, state: TestModuleState, duration = TIMED[file]?.duration ?? 0) => {
    const { lastRun } = await mutationSuite();
    lastRun.onTestModuleEnd({ moduleId: `${work}/${file}`, state: () => state, diagnostic: () => ({ duration }) } as unknown as TestModule);
  };
  // A run of every file the worker has timed, in which those named failed and
  // the rest passed.
  const ran = async (failed: readonly string[]) => {
    for (const file of Object.keys(TIMED)) await ended(file, failed.includes(file) ? 'failed' : 'passed');
  };

  const worker = (timed: Timed, found = FOUND) => {
    const asked: string[] = [];
    const ctx = {
      config: { root: work },
      cache: {
        getTestSpecificationResult: (file: TestSpecification) => {
          const key = file.moduleId.slice(work.length + 1);
          asked.push(key);
          return timed[key];
        },
      },
    } as unknown as Vitest;
    const files = found.map(
      (file) => ({ moduleId: `${work}/${file}`, project: { name: '', config: { isolate: true, sequence: { groupOrder: 0 } } } }) as unknown as TestSpecification,
    );
    return { ctx, files, asked };
  };
  const names = (files: TestSpecification[]) => files.map((file) => file.moduleId.slice(`${work}/tests/`.length).replace('.test.ts', ''));
  // The sweep's order, of the files as found and as found backwards: an order
  // that only kept what it was given would pass one of the two.
  const ours = async (timed: Timed, found = FOUND) => {
    const { QuickestFirst } = await mutationSuite();
    const { ctx, files, asked } = worker(timed, found);
    const order = names(await new QuickestFirst(ctx).sort(files));
    expect(names(await new QuickestFirst(ctx).sort([...files].reverse()))).toEqual(order);
    return { order, asked };
  };
  const theirs = async (timed: Timed, found = FOUND) => {
    const { ctx, files, asked } = worker(timed, found);
    return { order: names(await new BaseSequencer(ctx).sort(files)), asked };
  };

  it('runs the quickest file first, and a file the worker has not timed after those it has, the larger first', async () => {
    expect((await ours(TIMED)).order).toEqual(['path', 'markdown/links', 'markdown/properties', 'markdown/linear', 'pattern/glob', 'pattern/oracle']);
  });

  it('runs a file that failed when the worker last ran it before any that passed, however long it takes, and of two that failed the quicker', async () => {
    await ran(['tests/markdown/linear.test.ts']);
    expect((await ours(TIMED)).order).toEqual(['markdown/linear', 'path', 'markdown/links', 'markdown/properties', 'pattern/glob', 'pattern/oracle']);
    // A run of one file, which fails; the other has not run since it failed.
    await ended('tests/markdown/links.test.ts', 'failed');
    expect((await ours(TIMED)).order).toEqual(['markdown/links', 'markdown/linear', 'path', 'markdown/properties', 'pattern/glob', 'pattern/oracle']);
  });

  it("takes no failure from vitest's cache, which keeps one from a narrowed run until a run of the whole file passes", async () => {
    // Every file passed when the worker last ran it, and the cache still has
    // the longest failed.
    const kept = { ...TIMED, 'tests/markdown/linear.test.ts': { duration: 4_300, failed: true } };
    expect((await ours(kept)).order).toEqual(['path', 'markdown/links', 'markdown/properties', 'markdown/linear', 'pattern/glob', 'pattern/oracle']);
  });

  it("keeps a file's verdict and time through a run that skips it or does not reach it, until a run runs it", async () => {
    await ran(['tests/markdown/links.test.ts']);
    for (const state of ['skipped', 'pending', 'queued'] as const) await ended('tests/markdown/links.test.ts', state);
    await ended('tests/path.test.ts', 'passed');
    expect((await ours(TIMED)).order).toEqual(['markdown/links', 'path', 'markdown/properties', 'markdown/linear', 'pattern/glob', 'pattern/oracle']);
    await ended('tests/markdown/links.test.ts', 'passed');
    expect((await ours(TIMED)).order).toEqual(['path', 'markdown/links', 'markdown/properties', 'markdown/linear', 'pattern/glob', 'pattern/oracle']);
    // Quicker than `path`, had it run.
    for (const state of ['skipped', 'pending', 'queued'] as const) await ended('tests/markdown/links.test.ts', state, 1);
    expect((await ours(TIMED)).order).toEqual(['path', 'markdown/links', 'markdown/properties', 'markdown/linear', 'pattern/glob', 'pattern/oracle']);
  });

  it("ranks a file by its time when the worker last ran it, where vitest 5's cache keeps the time of the whole file", async () => {
    // A run narrowed to one quick test of the longest file.
    await ended('tests/markdown/linear.test.ts', 'passed', 2);
    expect((await ours(TIMED)).order).toEqual(['markdown/linear', 'path', 'markdown/links', 'markdown/properties', 'pattern/glob', 'pattern/oracle']);
  });

  it('ranks a file the worker has run by its time there, where the cache has none for it', async () => {
    await ended('tests/later.test.ts', 'passed', 10);
    const found = [...FOUND, 'tests/later.test.ts'];
    expect((await ours(TIMED, found)).order).toEqual(['path', 'later', 'markdown/links', 'markdown/properties', 'markdown/linear', 'pattern/glob', 'pattern/oracle']);
  });

  it('orders the files a worker has timed as vitest would but for the quickest first, and asks the cache what vitest asks it', async () => {
    const failed = { ...TIMED, 'tests/markdown/links.test.ts': { duration: 35, failed: true } };
    const timed = Object.keys(TIMED);
    await ran(['tests/markdown/links.test.ts']);

    // Vitest's own: the failed file, then the longest, which is why a mutant
    // that only a unit test kills waited for the long files.
    const vitest = await theirs(failed, timed);
    expect(vitest.order).toEqual(['markdown/links', 'markdown/linear', 'markdown/properties', 'path']);
    const sweep = await ours(failed, timed);
    expect(sweep.order).toEqual(['markdown/links', 'path', 'markdown/properties', 'markdown/linear']);

    // A question vitest's cache stopped answering would find nothing, every
    // file would count as never run, and the order would quietly be by size.
    expect(new Set(sweep.asked)).toEqual(new Set(vitest.asked));
    expect(new Set(sweep.asked)).toEqual(new Set(Object.keys(TIMED)));
  });

  it('gives a worker that has run nothing the order vitest gives it, the larger file first', async () => {
    const { order } = await ours({});
    expect(order).toEqual(['pattern/glob', 'markdown/links', 'pattern/oracle', 'markdown/properties', 'markdown/linear', 'path']);
    expect(order).toEqual((await theirs({})).order);
  });

  /**
   * Stryker's vitest runner as it runs one mutant after another, in a process
   * of its own: a vitest made from this configuration with the options the
   * runner gives it, and runs of both files narrowed by a test name pattern,
   * each after clearing the files of the run before. Of each run, the order
   * vitest ran the two files in, as the sequencer it resolved gave that order
   * inside the run, and whether vitest's cache had `long` failed after it:
   * `short`, whose test takes 50 ms, and `long`, whose tests take 200, none
   * and none, the second failing.
   */
  type Run = { order: string[]; failed: boolean };
  function asStrykerRuns(patterns: readonly string[]): Run[] {
    const root = mkdtempSync(join(tmpdir(), 'spec-core-runs-'));
    try {
      mkdirSync(join(root, 'tests'));
      const pause = (ms: number) => `await new Promise((end) => setTimeout(end, ${ms}));`;
      writeFileSync(join(root, 'tests/short.test.ts'), `test('short holds', async () => { ${pause(50)} });`);
      writeFileSync(join(root, 'tests/long.test.ts'), `test('long holds', async () => { ${pause(200)} }); test('long breaks', () => { throw new Error('broken'); }); test('long quick', () => {});`);
      const script = `
        import { createVitest } from 'vitest/node';
        const ctx = await createVitest('test', {
          root: ${JSON.stringify(root)},
          config: ${JSON.stringify(join(ROOT, 'vitest.mutation.config.ts'))},
          globals: true, watch: false, pool: 'forks', maxWorkers: 1, maxConcurrency: 1, bail: 1, coverage: { enabled: false },
        });
        const name = (file) => file.moduleId.slice(file.moduleId.lastIndexOf('/') + 1, -'.test.ts'.length);
        const orders = [];
        const { sort } = ctx.config.sequence.sequencer.prototype;
        ctx.config.sequence.sequencer.prototype.sort = async function (files) {
          const sorted = await sort.call(this, files);
          orders.push(sorted.map(name));
          return sorted;
        };
        const files = ['short', 'long'].map((file) => ctx.config.root + '/tests/' + file + '.test.ts');
        const long = ctx.getRootProject().createSpecification(files[1]);
        const results = [];
        for (const pattern of ${JSON.stringify(patterns)}) {
          ctx.state.filesMap.clear();
          for (const project of ctx.projects) project.config.testNamePattern = new RegExp(pattern);
          await ctx.start(files);
          results.push({ order: orders.at(-1), failed: ctx.cache.getTestSpecificationResult(long).failed });
        }
        await ctx.close();
        process.exitCode = 0;
        process.stdout.write('@runs@' + JSON.stringify(results));
      `;
      const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return JSON.parse(out.slice(out.lastIndexOf('@runs@') + '@runs@'.length)) as Run[];
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  it("runs first, inside the next run, the file that failed in the run before, then the quicker in its last run, in runs narrowed as Stryker narrows them, where vitest 5's cache keeps an older failure", () => {
    const runs = asStrykerRuns(['holds$', 'short holds$|long breaks$', 'holds$', 'short holds$|long quick$', 'holds$']);
    // The larger first, as neither has a time; then the quicker; then the one
    // that failed in the run before; then, as it passed there, the quicker
    // again; and after a run of its one quick test, `long`, by that run's
    // time, where the cache's, the whole file's, would run `short` first. A
    // record emptied at the start of each run, as an `onInit` of the reporter
    // would empty it, runs the quicker first in the third.
    expect(runs.map(({ order }) => order)).toEqual([
      ['long', 'short'],
      ['short', 'long'],
      ['long', 'short'],
      ['short', 'long'],
      ['long', 'short'],
    ]);
    // Why the order keeps a record: from the second run on vitest's cache has
    // `long` failed, and by it the fourth run would run `long` first. Where it
    // does not, vitest forgets a failure as 4 did, and ADR-0008 says what a
    // sweep must show before the record goes.
    expect(runs.map(({ failed }) => failed)).toEqual([false, true, true, true, true]);
  });
});

describe('this repository', () => {
  const load = async <T>(name: string): Promise<T> => ((await import(pathToFileURL(join(ROOT, name)).href)) as { default: T }).default;
  const strykerConfig = () => load<{ mutate: string[]; thresholds: Thresholds; vitest: unknown }>('stryker.config.mjs');

  /**
   * The reporters vitest gives a run of a suite on a GitHub runner, where
   * every step has GITHUB_ACTIONS set to true, resolved by vitest itself from
   * the configuration file, as Stryker's runner has it resolve them: it names
   * none of its own. Vitest 5 reads the variable once, when it is first
   * imported, so the suite is resolved in a process started with it.
   */
  function onARunner(name: string): string[] {
    const resolve = [
      "import { resolveConfig } from 'vitest/node';",
      `const { test } = await resolveConfig({ root: ${JSON.stringify(ROOT)}, config: ${JSON.stringify(join(ROOT, name))} });`,
      "const names = test.reporters.map((reporter) => (Array.isArray(reporter) ? String(reporter[0]) : 'inline'));",
      // On a line of its own, after anything vitest prints on the way.
      "process.stdout.write('\\nreporters ' + JSON.stringify(names));",
    ].join('\n');
    const env = { ...process.env, GITHUB_ACTIONS: 'true' };
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', resolve], { cwd: ROOT, env, encoding: 'utf8' });
    return JSON.parse(out.slice(out.lastIndexOf('\nreporters ') + '\nreporters '.length)) as string[];
  }

  // Stryker's reading of `mutate`, written again here with minimatch, the
  // matcher Stryker uses, so the script is not checked against itself.
  const reads = (patterns: readonly string[], file: string): boolean =>
    patterns.reduce((hit, pattern) => (pattern.startsWith('!') ? hit && !minimatch(file, pattern.slice(1)) : hit || minimatch(file, pattern)), false);

  const sources = () =>
    readdirSync(join(ROOT, 'src'), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => relative(ROOT, join(entry.parentPath, entry.name)).replaceAll('\\', '/'));

  afterEach(() => {
    delete process.env['MUTATION_SHARD'];
  });

  it('lists only files the configuration mutates, each once', async () => {
    const { mutate } = await strykerConfig();
    expect([...checkAssignment(mutate).keys()].sort()).toEqual(ASSIGNED.flat().sort());
    for (const file of ASSIGNED.flat()) expect(sources()).toContain(file);
  });

  it('mutates every file the one-process sweep mutates in exactly one shard, a file added later in the last', async () => {
    const { mutate } = await strykerConfig();
    const shards = Array.from({ length: SHARD_COUNT }, (_, index) => mutateFor(mutate, index + 1));
    const holders = (file: string) => shards.flatMap((patterns, index) => (reads(patterns, file) ? [index + 1] : []));
    const expected = (file: string) => {
      const listed = ASSIGNED.findIndex((files) => files.includes(file));
      if (!reads(mutate, file)) return [];
      return listed === -1 ? [SHARD_COUNT] : [listed + 1];
    };
    const files = [...sources(), 'src/later/new.ts', 'src/later/index.ts'];
    for (const file of files) expect(holders(file), file).toEqual(expected(file));
    expect(holders('src/later/new.ts')).toEqual([SHARD_COUNT]);
    expect(holders('src/later/index.ts')).toEqual([]);
    expect(sources().filter((file) => holders(file)[0] === SHARD_COUNT).length).toBeGreaterThan(1);
  });

  it('runs every test in every shard, and the suite npm test runs less the tests of the two scripts that read a sweep', async () => {
    // With vitest's `related` on, the tests a shard runs would depend on the
    // files it holds, and the merge would refuse the sweep - or, with a test
    // that reaches a file other than through an import, score one that is not
    // the sweep a single run would have done.
    expect((await strykerConfig()).vitest).toEqual({ configFile: 'vitest.mutation.config.ts', related: false });
    type Test = { include: string[]; exclude?: string[]; environment: string; testTimeout: number; sequence?: unknown; reporters?: unknown };
    const unit = (await load<{ test: Test }>('vitest.config.ts')).test;
    const suite = await mutationSuite();
    const { exclude, sequence, reporters, ...mutation } = (suite.default as { test: Test }).test;
    expect(mutation).toEqual({ include: unit.include, environment: unit.environment, testTimeout: unit.testTimeout });
    // Neither reaches a function under src/, so neither can kill a mutant.
    expect(exclude).toEqual(['tests/mutation-shards.test.ts', 'tests/mutation-unmeasured.test.ts', '**/node_modules/**']);
    // The order is the sweep's alone: `npm test` reports every failure, and
    // runs its files side by side.
    expect(sequence).toEqual({ sequencer: suite.QuickestFirst });
    expect(unit.sequence).toBeUndefined();
    // So are the reporters it names: vitest's default, which the next test
    // holds to what vitest makes of it, and the one that keeps the order's
    // record.
    expect(reporters).toEqual(['default', suite.lastRun]);
    expect(unit.reporters).toBeUndefined();
  });

  it("has the sweep's run report through vitest's default reporter and the order's record alone on a runner, so that no mutant's run adds a summary to the step's", async () => {
    // Where a suite names none, vitest adds its github-actions reporter on a
    // runner, and it appends a summary of every run to the step's own: about
    // 1,700 of them in the largest shard of main's sweep of 89bcf7f, where
    // GitHub uploads 1MiB a step (vitest.mutation.config.ts).
    // The record is the reporter given inline, as the test above has it.
    expect(onARunner('vitest.mutation.config.ts')).toEqual(['default', 'inline']);
    // The suite `npm test` runs keeps the annotations and the summary vitest
    // gives a run on a runner.
    expect(onARunner('vitest.config.ts')).toContain('github-actions');
  });

  it('gives a shard its own files, its own report, and no gate', async () => {
    const { mutate, thresholds } = await strykerConfig();
    process.env['MUTATION_SHARD'] = '2';
    const shard = await load<Record<string, unknown>>('stryker.shard.config.mjs');
    expect(shard['mutate']).toEqual(mutateFor(mutate, 2));
    expect(shard['thresholds']).toEqual({ ...thresholds, break: null });
    expect(shard['jsonReporter']).toEqual({ fileName: 'reports/mutation/shard-2.json' });
    // The timeline reads the progress reporter's counts; without them a
    // sweep's minutes cannot be measured again.
    expect(shard['reporters']).toEqual(['json', 'clear-text', 'progress']);
  });

  it('refuses to load for a shard that is unset or not one of them, rather than mutate everything', () => {
    const url = pathToFileURL(join(ROOT, 'stryker.shard.config.mjs')).href;
    const run = (shard: string | undefined) => {
      const env = { ...process.env };
      delete env['MUTATION_SHARD'];
      if (shard !== undefined) env['MUTATION_SHARD'] = shard;
      try {
        execFileSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(url)});`], { cwd: ROOT, env, stdio: 'pipe' });
        return 'loaded';
      } catch (error) {
        return String((error as { stderr: Buffer }).stderr);
      }
    };
    expect(run(String(SHARD_COUNT))).toBe('loaded');
    expect(run(String(SHARD_COUNT + 1))).toContain(`A shard is a number from 1 to ${SHARD_COUNT}, got "${SHARD_COUNT + 1}".`);
    expect(run(undefined)).toContain(`A shard is a number from 1 to ${SHARD_COUNT}, got "undefined".`);
  });

  it('runs one job per shard', () => {
    const workflow = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
    expect(/^\s+shard: \[([\d, ]+)\]$/m.exec(workflow)?.[1]).toBe(Array.from({ length: SHARD_COUNT }, (_, index) => index + 1).join(', '));
  });
});
