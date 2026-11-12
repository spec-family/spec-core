# Contributing

```bash
npm ci
npm run lint            # tsc --noEmit
npm test                # vitest
npm run build
npm run test:mutation   # stryker, the whole sweep in one process
```

Node 22 or later. Vitest reads `src/` directly; there is no build step for the
tests.

npm 10, 11 and 12 install the same tree from the lockfile and run the same
suite. `npm ci` leaves the lockfile as it is under each of them; npm 10's
`npm install` writes it back without the `libc` fields npm 11 and 12 keep, so
a change to the lockfile is made with npm 11 or later.

CI runs the mutation sweep on every pull request and every push to main, in
shards that each mutate their own files against every test, and fails the
build when the merged score is under the `break` in `stryker.config.mjs`
(ADR-0007).

Stryker mutates nothing that stands under a TypeScript `as`, so nothing a
mutator reads is written under one: `lines[at - 1]!` and not
`lines[at - 1] as string`, a cast on a name, a type on the declaration or
`satisfies`. `npm test` fails a cast over anything else and names it, and the
sweep's last job fails for one too (ADR-0007, 2026-10-12).

## Layout

| Path | What |
| --- | --- |
| `src/<module>/` | One module per directory; `index.ts` only re-exports. |
| `modules.json` | Which modules each module may import. |
| `tests/` | Unit, oracle, enumeration and differential tests; `boundaries.test.ts` holds the rules above. |
| `scripts/vendor.mjs` | Copies modules into a tool, and checks a tool's copy against its record and against spec-core now (`tests/vendor.test.ts`). |
| `scripts/mutation-shards.mjs`, `stryker.shard.config.mjs` | Split CI's mutation sweep into shards, and merge their reports into one score under the gate. |
| `scripts/mutation-timeline.mjs` | Reads the minutes each file took off a sweep's log, to balance the shards, and counts the mutants killed late and those that timed out on the clock. |
| `scripts/mutation-unmeasured.mjs` | Counts the places a mutator applies that stand under a TypeScript `as`, in the tree or in a sweep's merged report, and fails a count above the one it records as left. |
| `docs/adr/` | The decisions, including the family's contract. |
| `docs/` | The family's shared documentation: adopting the tools, their concepts, a tutorial. |

## Adding a module

Add the directory, its entry in `modules.json` and in `package.json`'s
`exports`, and a row in the README. The boundaries test fails until all four
agree.

## Updating a tool's copy

After a change here merges, in this repository:

```bash
node scripts/vendor.mjs --into ../<tool> --modules <modules>
```

Then, in the tool, run its full verification and open a PR whose changelog
entry names this repository's commit and any behaviour change the ADRs here
record.
