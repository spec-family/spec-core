---
status: accepted
date: 2026-09-26
---

# ADR-0008: The toolchain, and latest is not newest

## Context

The family's rule for choosing a version is the organisation's: the current
recommended production choice, which for a major released a few weeks ago is
deliberately not the highest number on the registry. A library whose files are
compiled by four other projects must also compile under all four of their
configurations.

## Decision

The same toolchain as the sibling tools, read from the npm registry on
2026-09-26:

| Component | Chosen | Newest | Why |
| --- | --- | --- | --- |
| Node | `>=22` | 26 | 22 is in maintenance until April 2027, 24 is the active LTS; CI runs 22, 24 and 26. |
| `@types/node` | `^22` | 26.6 | Types for the lowest runtime supported. The modules use no Node API at all; only tests and scripts do. |
| TypeScript | `^7.0.2` | 7.0.2 (7.1 in `next`) | The native compiler every sibling uses. Its missing programmatic API matters to no tool here. |
| Vitest | `^4.1.11` | 5.0.2 | 5.0 is a few weeks old; 4.1 is the maintained line every sibling runs. |
| Stryker | `^10.0.0` | 10.0.0 | As the siblings; its TypeScript checker needs the API TypeScript 7 lacks, so it is not used. |
| MCP revisions served | 2024-10-07 to 2025-11-25, and 2026-07-28 | 2026-07-28 | The newest revision is served, and so are the ones most clients still speak (ADR-0012 in spec-guard). |

The compiler options are the strictest union of the tools' own: `strict`,
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
`noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`,
`noUnusedParameters`, `verbatimModuleSyntax`, `isolatedModules`, NodeNext.
A file that compiles here compiles in every tool.

GitHub Actions are pinned to commits, with the tag beside each, as the
siblings pin them. *Amended 2026-10-08*: and every job names the image it
runs on; see below.

## Consequences

Re-read this table when it is a quarter old, when Vitest 5 has had a release
line's worth of patches, or when TypeScript ships its programmatic API.
*Amended 2026-10-07*: Vitest 5 has had them, and they are not what it waits
for; see below. *Amended 2026-11-08*: what it waited for came in Stryker
10.1.0, and vitest 5 is taken here; see the last amendment.

## Amended 2026-10-07: vitest is held on 4 until Stryker's runner reads 5

*Amended 2026-11-08*: the hold is lifted here, by the steps below; the
amendment of that date has what they measured.

Vitest 5.0.0 is from 3 September and 5.0.3 from 30 September, and on
2026-10-06 Dependabot proposed 5 in all five repositories. It is not taken,
and its age is not why.

**What breaks.** Vitest 5 matches `testNamePattern` against a test's full
name with ` > ` between its suites and its own name, where 4 put a space
(its migration guide, "`testNamePattern` Matches the `>`-Joined Full Name").
Stryker's vitest runner runs a mutant against the tests that cover it by
setting that pattern, built from names it joins with a space. On vitest 5
the pattern matches no test that sits in a `describe`, the run executes
nothing, and the mutant is scored as survived. Nothing errors: the suite
passes, Stryker's dry run passes, the runner's peer range is
`vitest >=2.0.0`, and the sweep prints a score. This is
[stryker-js #6210](https://github.com/stryker-mutator/stryker-js/issues/6210),
open since 2026-09-04, in `@stryker-mutator/vitest-runner` 10.0.0, the newest
release there is. Two pull requests there, #6214 and #6220, give the runner
the separator of the vitest it finds; neither has a maintainer's review, and
neither is merged or released. spec-guard met the symptom on 2026-09-07 and
pinned vitest then.
[Its ADR-0003](https://github.com/spec-family/spec-guard/blob/main/docs/adr/0003-mutation-testing.md)
has the evidence: over one function, the runner on vitest 4 and Stryker's
`command` runner both killing five mutants of eight, and over the whole
source, 3.54% on vitest 5.

**What it measured.** The sweep of Dependabot's branch here, run
37528529991, beside main's sweep of the same source, run 37556549438:

| Vitest | Score | Mutants | Killed | Timed out | Survived | No coverage |
| --- | --- | --- | --- | --- | --- | --- |
| 4.1.11 | 96.36% | 5,546 | 5,091 | 253 | 195 | 7 |
| 5.0.0 | 4.00% | 5,546 | 221 | 1 | 5,317 | 7 |
| 5.0.3 | 4.02% | 5,546 | 215 | 8 | 5,316 | 7 |

The 5.0.3 row is a sweep dispatched on a branch made for it and deleted
after, run 37588131334, with vitest and its coverage package at 5.0.3, the
newest of the line that day, and nothing else changed: the suite passed, 791
tests, and the sweep read as 5.0.0's did. The change is vitest 5's by
design, so a later 5.0.x does not bring the runner back; only a release of
the runner does.

Under vitest 5, 5,313 mutants are survived, covered by a test, and ran none
(`testsCompleted` is 0 in the report); under 4, none is. The 222 detected
are static mutants, which run the whole suite under no pattern. They are
also why the line Stryker prints is no check: "Ran 6.67 tests per mutant on
average" for `links.ts`, where main printed 7.12, because 226 static mutants
carry the average. spec-harness's core sweep read 3.83% over 4,862 mutants
the same day, where its main reads 98.13%. In the other three the bump
passed its mutation checks or met none: spec-brief sweeps main and no pull
request, spec-graph's sweep of a pull request is incremental and reused
8,381 of 8,385 verdicts, and spec-guard's reused 12,218 of 12,294. Of the
three, spec-guard's pull request alone failed, and on the assertion in its
ADR-0003, not on a sweep.

**The decision.** `vitest` and `@vitest/coverage-v8` stay on the 4 line in
all five repositories until a released `@stryker-mutator/vitest-runner`
reads vitest 5 and the check below has passed with it. Two things hold
them. Dependabot proposes no major of `vitest` or of an `@vitest` package
(`.github/dependabot.yml`); minors and patches of 4 still come, and a
security update is not held back by that rule. And `tests/boundaries.test.ts`
fails when `package.json` admits a vitest that is not a 4, with a message
that names the issue and this amendment, so a bump made by hand fails
`npm test` with its reason, before any sweep and where there is none.
spec-brief, spec-graph and spec-harness have the same test, and spec-guard
its assertion.

**Vitest 4 while it is held.** Vitest's release policy (vitest.dev/releases,
read on 2026-10-07) gives regular fixes to the current minor, 5.0, and
"important fixes and security patches" to the last minor of the previous
major, 4.1; everything older, 3.2 included, is unsupported. So 4.1 is a
supported line, for what its maintainers judge important and no longer for
an ordinary bug: 4.1.11 of 2026-08-18 is its newest release, and since
5.0.0 its branch has taken documentation only. The standing is real - 3.2
had three releases in June and July 2026, while 4 was current - and it has
no date. It ends when vitest 6 is released, and majors have come nine to
eleven months apart (3.0 in January 2025, 4.0 in October 2025, 5.0 in
September 2026). The hold has no date either. If vitest 6 comes first, 4.1
leaves support and holding it stops being free: this decision is reopened
then.

**Lifting it.** Stryker publishes every package at one version, and its
`master` has taken a feature since 10.0.0, so the fix is expected in
`@stryker-mutator/vitest-runner` 10.1.0 or later, with
`@stryker-mutator/core` at the same version, which the runner's peer range
asks for exactly. The number is not the test: the release's notes must name
#6210, #6214 or #6220. Nothing here watches for that release but
Dependabot, which still proposes the `stryker` group, two weeks after a
minor is published: that pull request is the prompt to read the notes.
Then, here first, because this repository's sweep runs in full on every
pull request and takes about nine minutes:

1. On a branch of spec-core, in one commit: both Stryker packages to the
   fixed release, if Dependabot's pull request has not already brought
   them; `vitest` and `@vitest/coverage-v8` to a 5 chosen by hand
   (see the cooldown, below); the hold taken out, which is the test in
   `tests/boundaries.test.ts` and the two vitest entries under `ignore` in
   `.github/dependabot.yml`. Nothing under `src/` and no other test, so that
   the sweep compares two runners over one suite.
2. `npm run lint`, `npm test` and `npm run build` pass. A test that fails
   there is vitest 5's own change, listed in its migration guide, and is
   fixed in a commit of its own.
3. Open the pull request and wait for its `mutation` job. Accept only if
   both of these hold.
   - The merged score is within half a point of main's last sweep, 96.36%
     as this is written. Sharded sweeps of one source have read 96.20 to
     96.38% (ADR-0007), the lowest of them the sweep of this amendment. A
     wider gap is read mutant by mutant, as that record reads one, before
     anything is accepted.
   - No mutant in the merged report is survived, covered and untested:

     ```bash
     gh run download <run> --repo spec-family/spec-core --name mutation --dir reports/lift
     node -e "const r=JSON.parse(require('node:fs').readFileSync('reports/lift/mutation.json','utf8'));let n=0;for(const f of Object.values(r.files))for(const m of f.mutants)if(m.status==='Survived'&&(m.coveredBy??[]).length>0&&(m.testsCompleted??0)===0)n+=1;console.log(n)"
     ```

     It prints 0 for main's sweep and 5,313 for run 37528529991.

   A score near 4%, or one such mutant, is a runner that still does not
   read vitest 5: close the pull request and leave the hold.
4. Merge, then make the same change in the four tools, a pull request each.
   Only spec-harness's pull request runs a sweep that measures the bump,
   its core sweep. spec-graph's and spec-guard's are incremental and reuse
   the verdicts vitest 4 gave, and spec-brief sweeps main. So before one is
   merged, dispatch `mutation.yml` on its branch, which is the full sweep in
   each of the four (in spec-brief with `full` ticked, which is not its
   default), and hold that sweep to the same two conditions against the
   repository's last sweep of main.
5. Each of those changes takes its own hold out - spec-guard's is the pin
   and the assertion in its ADR-0003 - and amends its ADR to say so.

**What the cooldown proposed.** Dependabot waits thirty days for a major
(`semver-major-days`), and applies the wait to each version, not to the
line. Its log of 2026-10-06, run 37528308897, reads "Filtered out 3 versions
due to cooldown" - 5.0.1, 5.0.2 and 5.0.3, then 21, 11 and 6 days old - and
"Latest version is 5.0.0", which was 33. So the first proposal of a major
is its `.0.0`, the release of that line with the fewest fixes, and while
patches keep coming the proposal stays a month behind them. The cooldown
keeps out a release withdrawn in its first days, which is what it is for;
it does not choose a patched one. A major is therefore taken by hand, at a
version read from the registry: the newest patch that has had the week
this family asks of a patch, on a line that has had its month.

## Amended 2026-10-08: every job names its runner image

GitHub announced on 2026-09-17 that `ubuntu-latest` moves from Ubuntu 24.04
to Ubuntu 26.04, rolled out between 2026-10-19 and 2026-11-19
([actions/runner-images #14748](https://github.com/actions/runner-images/issues/14748)).
For that month a job that says `ubuntu-latest` is handed either image, and
which one is not the job's to say. Every job in the five repositories said
`ubuntu-latest`, 29 of them, or ran a matrix of `ubuntu-latest`,
`windows-latest` and `macos-latest`. Everything else a workflow runs is
named: an action by its commit, the release's npm by its version, vitest by
its major. The image was the one thing left to a label that moves, under
gates whose numbers were measured on one image.

**What the labels gave.** The image is the one the "Runner Image" group of
a job's log names, read on 2026-10-07 from run 37638464017 here, and the
label is from the table in actions/runner-images' README the same day:

| The label a job said | The image its log named | The label that is that image's alone |
| --- | --- | --- |
| `ubuntu-latest` | `ubuntu-24.04` | `ubuntu-24.04` |
| `windows-latest` | `windows-2025-vs2026` | `windows-2025-vs2026` |
| `macos-latest` | `macos-26-arm64` | `macos-26` |

`windows-2025` names the same image today and is not its alone: it moved
with `windows-latest`, between 8 and 15 June 2026, to the image with Visual
Studio 2026 (#14017). `macos-latest` moved to macOS 26 the same month
(#14167).

**What a name holds still.** A label like `ubuntu-24.04` names a release
of the operating system, not a build of the image. GitHub rebuilds each
image about weekly and rolls the build out over days: on 2026-10-07
`ubuntu-24.04` was build 20260927.320.1 in one job and 20261004.327.1 in
another of the same hour. What comes with the release stays - the kernel,
bash, coreutils, OpenSSH, what apt installs - and what the image adds on
top, git and the cached Node versions among them, moves under the name.

What the two Ubuntu images carried that day, from each image's README at
the build the logs named, and from the logs where it says so:

| | `ubuntu-24.04`, 20260927.320.1 | `ubuntu-26.04`, 20260927.149.1 |
| --- | --- | --- |
| Git, from the logs | 2.55.0 | 2.55.0 |
| Node that setup-node gives for 22, 24 and 26, from the logs | 22.23.3, 24.21.0, 26.10.0 | the same three |
| Node before setup-node | 22.23.3 | 24.21.0 |
| Bash | 5.2.21 | 5.3.9 |
| coreutils | 9.4, GNU's | 9.5-1ubuntu2+0.0.0~ubuntu25, the package that chooses between uutils and GNU's |
| OpenSSH | 9.6p1 | 10.2p1 |
| ripgrep | none; apt has 14.1.0 | none; apt has 15.1.0 |
| Kernel | 6.17 | 7.0 |

Git is 2.55.0 on all four images, `2.55.0.windows.5` on Windows, so no
suite meets two gits today. No image carries ripgrep: spec-guard's suite
runs the binary `@vscode/ripgrep` installs, the same one on both Ubuntu
images. The apt versions are Launchpad's for noble and resolute, and which
coreutils the 26.04 image runs was not measured.

**What ran on Ubuntu 26.04.** Each repository's suite, on Node 22, 24 and
26, in the first run of the pull request that made this change there. All
three legs passed in each; the counts are the Node 22 leg's, and the
`ubuntu-24.04` leg beside it read the same:

| Repository | Run | Tests on `ubuntu-26.04` |
| --- | --- | --- |
| spec-core | 37650470030 | 914 passed |
| spec-brief | 37652118349 | 928 passed |
| spec-graph | 37652125809 | 2,062 passed |
| spec-guard | 37652138720 | 3,910 passed |
| spec-harness | 37652155388 | 1,098 passed, 2 skipped |

Nothing failed, and nothing was skipped on one image that ran on the
other. The Test step's time on 26.04 was within three seconds of 24.04's
in four of the five and shorter in spec-harness, the longest suite, 28 to
41 seconds against 39 to 41: one run, and not a measurement of the
runners.

**The decision.**

- Every `runs-on`, and every entry of a matrix's `os`, is `ubuntu-24.04`,
  `ubuntu-26.04`, `windows-2025-vs2026` or `macos-26`. No `-latest`, and
  not `windows-2025`.
- The suite's matrix in the four tools runs both Ubuntu images. Their
  suites run programs the image supplies - git, ssh-keygen, and bash and
  coreutils under the release's own script, which `tests/npm.test.ts` runs
  on Linux - and their users' jobs say `ubuntu-latest`, as the examples in
  spec-guard's README and in `docs/adopting.md` here do. Those examples
  stay: the label there is the user's to choose, and the matrix tests both
  of its answers.
- This repository's suite runs nothing of the image's but Node, which
  setup-node installs, so its matrix names `ubuntu-24.04` alone. Run
  37650470030 is its one pass on 26.04.
- Windows and macOS are named at what their `-latest` gave, and no leg is
  added on either.
- Coverage, the mutation sweeps and every job of a release stay on
  `ubuntu-24.04`. Each sweep's timeout, shard table and `break` come from
  sweeps on that image, the coverage floors from runs on it, and every
  release so far was packed and staged on it. A gate on another image is
  another measurement, made on purpose and by the steps below.
- `tests/runner-images.test.ts` in each repository fails a `-latest` label
  anywhere a workflow reads one, a label that is not one of the four, and
  a job outside the matrix that is not on `ubuntu-24.04`. In spec-graph it
  also holds the step that runs on one leg to a leg the matrix lists.

**Moving an image.** Nothing proposes one: Dependabot reads `uses:` and
not `runs-on`. The prompt is an announcement in actions/runner-images: a
`-latest` that is about to move, as here, or an image's retirement, which
Ubuntu 22.04's had ten months of (#14254, announced 2026-06-16, the image
unsupported from 2027-04-17).

A leg of the suite's matrix, added or retired:

1. Read the announcement, and the image's README for what the suites run:
   git, bash, coreutils, OpenSSH and the Node versions it caches.
2. One pull request in each repository changes the matrix, and `IMAGES` in
   `tests/runner-images.test.ts` with it. Its own run is the proof: the
   suite on the image, on Node 22, 24 and 26.
3. A failure there is the finding. A small fix in the tool or the test
   goes in that pull request; anything else keeps the leg out, and is
   written here.

A leg leaves the matrix when no gate runs on its image and no `-latest`
gives it.

The gates, from `ubuntu-24.04` to another image: no sooner than the
rollout that makes the image `-latest` has ended, 2026-11-19 for Ubuntu
26.04, and here first, because this repository's sweep runs in full on
every pull request and takes about nine minutes.

1. On a branch, in one commit: every `runs-on` outside the matrix, `GATES`
   in `tests/runner-images.test.ts`, and the comments that name the image.
   Nothing under `src/` and no other test, so that the sweep compares two
   images over one suite.
2. The pull request's `mutation` job is the measurement. Accept when the
   merged score is within half a point of main's last sweep, no shard has
   passed the minutes its comment in the workflow names, 15 here, and the
   count of mutants that timed out is near main's: a timeout counts as
   detected, so a count well off is read mutant by mutant before the score
   is believed.
3. The `coverage` job of the same run passes its floors.
4. Merge, then make the same change in the four tools, a pull request
   each. Only spec-harness's pull request runs a sweep that measures the
   image, its core sweep. spec-graph's and spec-guard's are incremental
   and reuse the verdicts the old image gave, and spec-brief sweeps main.
   So before one is merged, dispatch `mutation.yml` on its branch, the full
   sweep in each of the four (in spec-brief with `full` ticked), and hold
   it to the same conditions against the repository's last full sweep.
5. The release's jobs move in that commit. The suite has run the step
   that installs the staging npm, under each Ubuntu image's bash and
   coreutils, on every change since this amendment. The rest of a release,
   the pack and the tarball's listing and hash, is tried by a rehearsal
   (each tool's CONTRIBUTING.md): from the branch in spec-guard, whose dry
   run goes on from one, and in the other three from main, which their
   workflow requires, once the pull request is merged and before any tag.
   A rehearsal that fails on the image is fixed before a version is
   tagged, or the pull request is reverted whole.
6. Amend this record with the runs and what they read.

spec-guard's engine budgets are not a gate and do not move by these steps.
Its ADR-0004 measured them on `ubuntu-24.04` with the ripgrep that apt
installs there, 14.1.0; whether 15.1.0 on Ubuntu 26.04 moves the Linux
budget is that record's to measure.

## Amended 2026-11-08: vitest 5, here first

Stryker 10.1.0, of 2026-10-23, names #6214 in its notes, "support vitest
v5", and 10.1.1 followed within the hour. Its vitest runner joins a test's
name with ` > ` where it finds vitest 5 or later and with a space before
(`VITEST_MODERN_TEST_NAME_SEPARATOR` in `dist/src/test-helpers.js`, chosen
by `semver.gte(vitest.version, '5.0.0-0')` in `vitest-test-runner.js`),
which is what #6210 asked for. Dependabot's pull request brought both
packages to 10.1.1 here (#52) and in the four tools on 2026-11-08, and the
steps of the amendment of 2026-10-07 were taken here the same day, in
pull request #57.

**What changed.** `vitest` and `@vitest/coverage-v8` went to 5.0.5, of
2026-10-15, the newest patch of 5.0; 5.1.0, of 2026-11-02, was six days old,
under the two weeks a minor waits. The hold went in the same commit: the
test in `tests/boundaries.test.ts` and the two vitest entries under `ignore`
in `.github/dependabot.yml`. Three tests in `tests/mutation-shards.test.ts`
failed on vitest 5, each on a change of vitest's own, and were fixed in a
commit of their own:

- A sequencer asks vitest's cache by a file's specification,
  `getTestSpecificationResult`, and the cache keeps no sizes: vitest's own
  sequencer reads a file's size from the disk where the file has no
  result. `getFileTestResults` and `getFileStats` remain, deprecated.
  `QuickestFirst` asks what vitest's sequencer asks and reads a size as it
  does.
- `resolveConfig` returns Vite's resolved configuration, with vitest's
  under `test`.
- The reporters a suite that names none is given are decided when vitest
  is first imported (`configDefaults`), so the test resolves the suite in a
  process started with `GITHUB_ACTIONS` set, where it had stubbed the
  variable in its own.

**What it measured.** The pull request's sweep, run 42472014545, beside
main's last sweep of the same source, run 42455582424 at 8b0c22e:

| Vitest | Score | Mutants | Killed | Timed out | Survived | No coverage | Survived, covered, untested |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4.1.12 | 96.45% | 5,972 | 5,521 | 239 | 205 | 7 | 0 |
| 5.0.5 | 96.37% | 5,972 | 5,513 | 242 | 210 | 7 | 0 |

Both conditions held: 0.08 of a point apart, and no survivor ran no test.
26 mutants had another verdict, and each was read:

- Six in `src/text/lines.ts`, at lines 65, 77 and 78, timed out on main and
  survived here after all 282 tests that cover them. `end >= start` at 77
  is one of the nine ADR-0007's entry of 2026-10-24 found decided by a
  clock; the other five are mutants of the same two comparisons.
- `src/pattern/automaton.ts` 164, the arrow of the match state made `+1`,
  was killed on main by the cost test of the glob matcher, the one that
  still allows a tenth of a millisecond for noise, after 95 of its 102
  tests, and survived here: a verdict of that test's clock.
- Two survived on main and timed out here, `src/markdown/scan.ts` 221 and
  `src/pattern/charset.ts` 42.
- Twelve killed on main timed out here, and five went the other way. Eight
  of the twelve are mutants of `serveLines` in `src/jsonrpc/mcp.ts` that
  leave its promise unsettled: `tests/jsonrpc.test.ts` reads that within a
  turn of the event loop, and `tests/object-names.test.ts` awaits it, so
  the file that runs first decides between a kill and a timeout. Each is
  detected either way.

**The order a mutant's files run in.** Vitest 5 counts a run that a test
name pattern narrows as partial, and keeps a file's time and a failure
from such a run until a run of the whole file passes (`ResultsCache.update`
and `isPartialRun`). Stryker narrows every mutant's run so, through
`testNamePattern`, and only the dry run and a static mutant's are whole. So
a file that failed for one mutant stays among the first for the mutants
after it, where vitest 4 put it first only after the run it failed in.
Killed mutants ran 10.75 tests each up to the one that failed, against 6.89
on main, and the first test failed for 2,943 of them, against 3,231. The
six shards took 30m57s, against 32m51s for main's, on one sweep each: the
order kills later and the runs cost less. Giving the order its memory of
the last run back would take a record of its own, which a reporter could
keep for the sequencer to read; this amendment measures that and does not
do it. *Amended 2026-11-09*: the record is kept, by the amendment below.

**What follows.** Step 4 of the amendment of 2026-10-07: the same change in
spec-brief, spec-graph, spec-guard and spec-harness, a pull request each,
with `mutation.yml` dispatched on its branch for the full sweep (in
spec-brief with `full` ticked) and held to the same two conditions against
that repository's last sweep of main. Each takes out its own hold, and
spec-guard's is the pin and the assertion in its ADR-0003.

## Amended 2026-11-09: the order's record, carried with vitest 5

The order a mutant's files run in keeps its own record of whether each file
failed when the worker last ran it (ADR-0007, the entry of 2026-11-09), in
`vitest.mutation.config.ts`: a reporter, `lastRun`, records a file's verdict
at its end, and `QuickestFirst` reads the record where it read the cache's
`failed`. Vitest 5's cache keeps a failure from a run narrowed by a test
name pattern, or stopped at its first failure, until a run of the whole
file passes, and shares it between Stryker's workers, so the order had lost
the file that killed the last mutant. The times stay the cache's, on
vitest 5 each whole file's from the dry run: a record of each run's time as
well, vitest 4's rule in full, read 9.60 tests to a kill where the two
sweeps of the failure alone read 9.58 and 10.03 (ADR-0007). The record uses
the reporter interface of vitest 3 and later, `onTestModuleEnd` and
`TestModule.state()`, so a tool can take it on vitest 4.1 too. The reporter
has no `onInit`: vitest 5 calls that at the start of every run, and two
sweeps of spec-core with one that cleared the record sorted every run with
it empty, at 25.05 and 25.50 tests to a kill.

**Step 4 carries it.** Each of the four tools copies `QuickestFirst` into
its `vitest.mutation.config.ts`, and spec-brief into `vitest.core.config.ts`
as well, with a test of it (`tests/mutation-shards.test.ts` in spec-graph
and spec-harness, `tests/mutation-order.test.ts` in spec-brief and
spec-guard). The pull request that takes a tool to vitest 5 takes the
record in the same change, in each configuration file that has the
sequencer: the `failedLast` map and the `lastRun` reporter above the class,
the class's rank reading `failedLast` where it read `last.failed`, `lastRun`
named after `'default'` in the suite's `reporters`, and the tests, whose
fixtures give the record a file's end as vitest gives it a reporter, each
test in a folder of its own, with no `onInit` to reset the record. The test
through vitest takes the order the sequencer gives inside each run, which
is where a record emptied at the start of a run shows; asked after the run,
the sequencer still finds it full. Each configuration file is its own
module, so spec-brief's two keep a record each. A tool's test that holds its reporters to `['default']`, or to what
vitest resolves on a runner, then expects `lastRun` beside it.

That pull request's full sweep is held to a third condition beside the two
of step 3: the tests a killed mutant completed are read off its merged
report and set beside the same in the tool's last sweeps of main on vitest
4, the mutants that are not static apart from the static ones, whose order
after the file that failed last is the times'.

```bash
node -e "const r=JSON.parse(require('node:fs').readFileSync('reports/lift/mutation.json','utf8'));const s={k:0,t:0},n={k:0,t:0};for(const f of Object.values(r.files))for(const m of f.mutants)if(m.status==='Killed'){const g=m.static?s:n;g.k+=1;g.t+=m.testsCompleted??0}console.log(((s.t+n.t)/(s.k+n.k)).toFixed(2),(n.t/n.k).toFixed(2),s.t)"
```

It prints the mean of all killed mutants, the mean of those that are not
static, and the static ones' tests in all: `6.89 5.02 11731` for
spec-core's sweep of 8b0c22e on vitest 4, `10.82 5.63 30055` for 598d9de's
on vitest 5 without the record, and `9.58 4.91 27031` and
`10.03 4.89 29644` for 85245ba's and ee72f0a's with it. The mutants that
are not static are back within vitest 4's range, and a tool's should be; a
mean of theirs above it is read before anything is accepted. The static
ones' stay above vitest 4's here, with the record of times as without it,
and why is not explained (ADR-0007).

**When the record goes.** The test that runs Stryker's runner through
vitest asserts that vitest's cache still has a file failed after a narrowed
run in which it passed. When a vitest release fails that assertion, its
cache forgets a failure as vitest 4's did, and the record may go: in a pull
request that takes it out and nothing else, whose full sweep reads a mean
within the range of the sweeps with it.

## Amended 2026-11-12: a pull request runs four legs

**Context.** Each push to a pull request ran the suite's whole matrix:
twelve legs in the four tools, nine here, beside the mutation jobs. On
2026-11-11, with five pull requests open across the family at once, the
median job waited 3.8 minutes for a runner and one in ten waited more than
24.8; the queue, not the laptop, set the pace. A leg that only a push to
main would have caught has not been seen: the legs fail together or on one
operating system, and the floor of each operating system catches that.

**Decision.** On a pull request the matrix runs four legs: Node 22 and 26
on `ubuntu-24.04`, the gates' image, and Node 22 on Windows and macOS.
Here that is four of nine; in the tools, which also list `ubuntu-26.04`,
four of twelve. A push to main, a manual run, the schedule and a release,
which calls `ci.yml`, run every leg. The matrix keeps naming every image
and every Node, so `tests/runner-images.test.ts` reads it as before; the
pull request's legs are an `exclude` chosen by the event.

One more job, `all green`, needs every other job in `ci.yml` and fails
unless each passed or was skipped on purpose. A main ruleset that requires
checks requires that one: a required check for each leg would name legs a
pull request does not run, and wait on them forever.

**Consequences.** A break on Node 24 alone, or on `ubuntu-26.04` alone,
is found on main rather than on the pull request, and a release still
runs every leg before it stages a version. Moving a leg into or out of
the matrix is the procedure above; which legs a pull request runs is this
amendment's to change.
