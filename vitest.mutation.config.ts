import { statSync } from 'node:fs';

import { defineConfig } from 'vitest/config';
import { BaseSequencer, type Reporter, type TestModule, type TestSpecification } from 'vitest/node';

/**
 * Whether each test file failed when this process last ran it, as vitest 4's
 * cache had it and vitest 5's does not.
 *
 * Stryker narrows each mutant's run to the tests that cover it, by a test name
 * pattern. Vitest 5 counts such a run as partial, and its cache keeps a
 * failure from one until a run of the whole file passes, and it reads back
 * what the other workers write to the same cache file. In a sweep every run
 * but the first is narrowed, so a file that killed one mutant, in any worker,
 * stayed failed for every mutant after it, and the order lost what it knew of
 * the last run: the file that killed the last mutant (ADR-0008, amended
 * 2026-11-08). So the order keeps its own record. Vitest calls the sequencer
 * and the reporters in the one process that drives the worker, so the record
 * lives in that process's memory, with no file to name or clean up, and dies
 * with it, as vitest 4's did. A file that passed or failed in a run has that
 * verdict until a run runs it again; a file the run skipped or did not reach
 * keeps the one it had.
 */
const failedLast = new Map<string, boolean>();

/** The reporter that keeps the record above, named in the suite below. */
export const lastRun = {
  onTestModuleEnd(module: TestModule): void {
    const state = module.state();
    if (state === 'passed' || state === 'failed') failedLast.set(module.moduleId, state === 'failed');
  },
} satisfies Reporter;

/**
 * The order a mutant's test files run in: a file that failed when this process
 * last ran it first, as vitest 4 had it, then the quickest first, where vitest
 * runs the longest first.
 *
 * Stryker gives a mutant the files of the tests that cover it, every file for
 * a static mutant, runs them one after another in one worker and stops at the
 * first test that fails. Vitest's order suits a run that reports every failure
 * and wants its long files started early. Here the long files are
 * `tests/markdown/linear.test.ts`, `tests/pattern/oracle.test.ts` and
 * `tests/markdown/properties.test.ts`, four fifths of the suite's time between
 * them, and in vitest's order they were the first to fail for one killed
 * mutant in twenty. In five sweeps of one source, one killed mutant in
 * twenty-five had run other files to their end before the file that killed
 * it, a long one among them for two in three of those the reports can tell; a
 * static mutant that the first test of `tests/path.test.ts` kills, a file of
 * milliseconds, had run 827 tests before it; and a mutant killed late is one
 * that can run out its clock first: 31 mutants were killed in one of those
 * sweeps and timed out in another (ADR-0007, 2026-10-11).
 *
 * No test leaves the run and none is added: a mutant survives when every file
 * has passed, in any order. The first sweep in this order read 96.34% over the
 * same 5,546 mutants, with no survivor the five before it had not had and 30
 * of those 31 killed, and its six jobs took 27m30s where theirs had taken
 * 31m28s to 36m40s.
 *
 * A file with no time yet has none to go by, and its size is no guide to one
 * here: the seven largest files are unit tests that take about a second
 * between them and are the first to fail for three killed mutants in four,
 * and none of the three long ones is among the ten largest. It runs after the
 * files that have a time, the larger first, as vitest has it, and has a time
 * from then on. Vitest 5 asks its cache by a file's specification and keeps
 * no sizes, reading them from the disk where a file has no time; so does this.
 */
export class QuickestFirst extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const { cache } = this.ctx;
    const rank = (file: TestSpecification): [number, number] => {
      // What vitest's own sequencer asks its cache; a test holds the two
      // together. Its `failed` is not read: that is the record's.
      const last = cache.getTestSpecificationResult(file);
      if (last === undefined) return [2, -(statSync(file.moduleId, { throwIfNoEntry: false })?.size ?? 0)];
      return [failedLast.get(file.moduleId) === true ? 0 : 1, last.duration];
    };
    const ranked = files.map((file) => ({ file, rank: rank(file) }));
    return ranked.sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1]).map(({ file }) => file);
  }
}

/**
 * The suite as Stryker runs it: the one vitest.config.ts runs, less two
 * files, without v8 coverage, which Stryker replaces with its own per test,
 * in the order above and with its reporters named.
 *
 * mutation-shards.test.ts tests the CI script that splits the sweep and
 * merges it back, and the order above. It reaches nothing under src/, so it
 * cannot kill a mutant, and every static mutant runs the whole suite.
 * mutation-unmeasured.test.ts tests the count of what a sweep does not read.
 * It runs nothing under src/ either: it reads the sources as text, which in
 * Stryker's sandbox carry every mutant at once, and loads Stryker's
 * instrumenter, which every static mutant that survives would wait for. A
 * test holds the rest of this file to vitest.config.ts.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/mutation-shards.test.ts', 'tests/mutation-unmeasured.test.ts', '**/node_modules/**'],
    environment: 'node',
    testTimeout: 60_000,
    sequence: { sequencer: QuickestFirst },
    // Named, so that vitest adds none of its own. A suite that names none
    // gets vitest's github-actions reporter beside the default one on a
    // runner, and it appends a summary of each run to the step's: one a
    // mutant, about 200 bytes each, some 1,700 of them in the largest shard
    // of main's sweep of 89bcf7f, where GitHub uploads 1MiB of a step's
    // summary. The default reporter writes to the worker's output, as it
    // did, which Stryker shows only for a worker that exits unexpectedly.
    // The other keeps the order's record and writes nothing.
    reporters: ['default', lastRun],
  },
});
