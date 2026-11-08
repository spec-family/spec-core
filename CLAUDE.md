# CLAUDE.md

Working agreements for this repository. The ADRs in `docs/adr/` carry the
reasoning; ADR-0005 is the contract every spec-* tool keeps.

## Invariants

Breaking one is a decision that needs an ADR.

- **Pure.** No module imports anything outside `src/`, `node:` included, and
  none reads the disk, the clock, the environment or the platform
  ([ADR-0002](docs/adr/0002-pure-and-total.md)).
- **Modules cross only where `modules.json` says.** `pattern` may use `path`,
  `markdown` may use `text`. `tests/boundaries.test.ts` holds this, and
  `scripts/vendor.mjs` copies a module with exactly its declared dependencies
  ([ADR-0001](docs/adr/0001-one-core-copied-by-hash.md)).
- **Nothing takes longer than its input.** No `RegExp` is built at run time;
  patterns run on automata; a search without a natural bound has a budget and
  answers `undecided` at it.
- **Refuse rather than guess.** Malformed input is an error with a reason.
- **Zero runtime dependencies**, `private: true`, native ESM, TypeScript 7,
  Node >= 22, the strictest compiler options any tool uses
  ([ADR-0008](docs/adr/0008-toolchain.md)).
- **LF, no control characters**, in every file (held by a test). Write escapes
  for anything invisible. Files are copied into other repositories and
  compared by hash.

## Verification

All of these pass before anything is called done.

```bash
npm run lint            # tsc --noEmit
npm test                # vitest: unit, oracle, enumeration, differential
npm run build
npm run test:mutation   # stryker over all of src/, in one process
```

The mutation `break` and the coverage floors sit below the last measurement
and move up with it, never down to let a change pass
([ADR-0007](docs/adr/0007-verification.md)).

CI runs the same sweep in six shards on every pull request and every push
to main, and applies the `break` once, to the merged report
(`scripts/mutation-shards.mjs`); a shard is not a score. A file added under
`src/` lands in the last shard. When a shard passes the others by more than
runner variance, re-measure with `scripts/mutation-timeline.mjs` and move
files in the table there. A mutant's test files run the quickest first in
the sweep (`vitest.mutation.config.ts`). A mutant that survives still runs
every test that covers it, and one that runs out its clock waits half as
long again as those tests take, so time added to a test is paid by each of
those in every sweep.

Stryker makes no mutant of what stands under a TypeScript `as`, and no report
says so. Nothing a mutator reads stands under one: write `x!` for a lookup
that cannot miss, put the cast on a name, or say the type on the declaration
or with `satisfies`. `tests/mutation-unmeasured.test.ts` fails a cast over
anything else, and the sweep's merge job does too
(`scripts/mutation-unmeasured.mjs`;
[ADR-0007](docs/adr/0007-verification.md), 2026-10-12).

Vitest is on 5 here since 2026-11-08, when Stryker 10.1's runner read its
test names and the sweep of the change read as main's;
[ADR-0008](docs/adr/0008-toolchain.md) has the measurement, and the steps
the four tools follow, each with a full sweep of its own branch.

Run a tool through `npm run <script>` or `npx --no-install <tool>`, never a
bare `npx <name>`: before `npm ci` that fetches whatever the registry has
under the name. `.npmrc` has npm stop there instead, and `tests/npm.test.ts`
holds both. One of the family's own tools takes its package's full name
([ADR-0005](docs/adr/0005-the-family-contract.md#names), Names).

Every job names the image it runs on, never a `-latest` label, which GitHub
moves: coverage and the sweep stay on `ubuntu-24.04`, where their numbers
were measured. `tests/runner-images.test.ts` fails a label that names no
image and a gate that leaves its own, and
[ADR-0008](docs/adr/0008-toolchain.md) has the labels and the steps that
move an image, here and in the four tools.

## Changing a module

A change here reaches every tool that copies the module. So:

- Check behaviour against something outside the code: the oracle, brute
  force, the scanner it replaced. A new heuristic has a test for the input it
  must not match.
- A behaviour change a tool's user can see is written in `CHANGELOG.md` and
  named in the ADR that covers it, so each tool's release can say it.
- After merging, run `node scripts/vendor.mjs --into <tool> --modules …` for
  each tool that copies the module, and open that tool's PR.

## Design rules

- False positives cost more than misses; `undecided` is reported, never
  resolved by a guess.
- Comments explain why, never what. No exclamation marks, no hedging.
