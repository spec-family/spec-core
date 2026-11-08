---
status: accepted
date: 2026-09-26
---

# ADR-0007: Verification is against something outside the code

## Context

A defect here ships in every tool that copies the module (ADR-0001), and the
most expensive defects in the family so far were the kind a suite written by
the same hand does not find: a clause of the ECMAScript specification read
backwards, a comment masked from the wrong end, a fence opened on the wrong
info string. The sibling tools each found theirs by comparing against
something that was not their own belief.

## Decision

Every module is checked against at least one thing it did not write:

| Module | Checked against |
| --- | --- |
| `pattern` glob | An oracle that reads generated syntax trees by the definition, recursively, and never shares a parser with the engine (`tests/pattern/oracle.test.ts`); five dialect readings over every path of up to three segments. |
| `pattern` witness | Brute-force enumeration: a witness must satisfy its claim, nothing shorter may, and `none` must leave nothing satisfying, over every path to length six. |
| `pattern` regex | `RegExp`, over a written corpus and a generated one (moved from spec-graph). |
| `markdown` | Every scanner it replaces, run side by side, each difference named in a test as a fix or a dialect; invariants over a generated corpus. |
| `jsonrpc` | The protocol revisions it serves, message by message. |

Then mutation testing, for the question the above cannot answer - does a test
pin down each decision. The sweep covers all of `src/` against all of
`tests/`; every test is a unit test, so there is one sweep, not two.
*Amended 2026-09-30*: CI runs that sweep in six shards, each mutating its
own files against every test, and a job after them merges the reports and
applies the `break` once, to the merged score; a shard is not a score. It is
still the gate on every pull request and every push to main, over every
mutant, with the same `timeoutMS` and `break` and every test but the merge's
own, which reach nothing under `src/`; `npm run test:mutation` still runs it
in one process. The record below has the measurements.
*Amended 2026-10-11*: in the sweep a mutant's test files run the quickest
first, where vitest runs the longest first (`vitest.mutation.config.ts`).
Stryker runs them one after another and stops at the first failure, so the
order decides what a kill costs and, for a mutant that some input never lets
end, whether it is a kill or a timeout. No test leaves the sweep, and
`npm test` keeps vitest's order. The record below has the measurements.
*Amended 2026-10-12*: nothing a mutator reads stands under a TypeScript `as`.
Stryker makes no mutant of what stands under one, and no report says so. So
a lookup that cannot miss is written `x!`, a cast is put on a name, and a
type is said on the declaration or with `satisfies`.
`scripts/mutation-unmeasured.mjs` counts the places a mutator would have
applied under a cast, `tests/mutation-unmeasured.test.ts` holds the tree to
that count on every change, and the sweep's merge job holds the merged
report to it. And a static mutant that survives is written into the source
by hand before it is read as a survivor: under one that stops a test file
loading no test fails, and Stryker counts no failure as survived. Such a
mutant is killed by a test that loads the smallest thing that still meets
it and fails in a test's body. The record below has the measurements.
*Amended 2026-11-08*: an equivalent mutant whose verdict a clock decides,
a timeout on a slow runner and a survivor on a fast one, is not left to the
clock. Its line is written so that no mutant of it is equivalent where some
way of writing it does that, and where every way makes one, it is marked
for the sweep to leave out: `// Stryker disable next-line <Mutator>: <why>`
over it, the next line only, the mutators by name, and the reason. A mark
leaves out every mutant of those mutators on the line, so one goes only on
a line where the others are killed by another mutant beside them as well.
`tests/mutation-unmeasured.test.ts` holds each mark to that form and to a
mutant Stryker makes under it, and counts the marks. The record below has
the measurements.

**Thresholds are measurements, never targets.** The first full sweep sets the
`break` a little under what it measured; it moves up with the measurement and
never down to let a change pass. A surviving mutant is read, and either killed
by a test that asserts a decision or left with a comment saying why it is
equivalent. A test that restates the implementation to kill a mutant is worse
than the survivor. *Amended 2026-09-27*: the `break` is 94, set against the
first two full sweeps; the record below has the measurements and what was
done with the survivors the second one found.

**A test for every heuristic's negative case.** A rule that fires has a test
for the input where it must not.

**A test of cost states a ratio, not a number of milliseconds.** *Amended
2026-09-28.* A slow or busy machine slows every run, and can push one past
any fixed bound: the scan of a generated megabyte, held to a second, took
915 ms on a machine running other suites. So a test of cost times the same
work at two sizes - a document scanned once at sixteen times its size and
sixteen times over at its size, a name matched and one four times as long -
over runs of about the same length, taken in turn, and allows twice what
linear work takes and a fixed allowance for noise; four times for ordinary
documents, which hold none of the shapes the hostile ones are built from.
Such a test holds only
what changes cost alone, a memo or a mark that a state was visited; a mutant
that changes an answer is held by a test of the answer. The two bounds of
two seconds on the regular-expression matcher stay: every mutant that fails
them changes an answer those tests assert first, and the work they bound
takes microseconds.

*Amended 2026-10-19*: **the allowance for noise may be a way of reading,
not a number.** A fixed allowance is large beside a short run: spec-guard's
test of a name matched and one four times as long allowed eight times the
short run and 0.1 ms, about eighteen times at its ten microseconds, so a
matcher quadratic in the name (sixteen times) passed it; and a loaded
runner stalls a whole stretch of ten milliseconds, by up to a thousand
times, so that the fastest of seven stretches at one size read up to 8.33
times the other with linear work (on Windows with Node 22), and main's
run of the test read 19.3 times and failed once on macOS with Node 26
(spec-family/spec-guard#68 measured both, over the twelve images and Node
versions of its matrix; this amendment first gave the 8.33 as the macOS
failure's). A test of cost may hold twice what linear work
takes with no fixed allowance where it reads past a stall instead: one
uncounted stretch at each size first, the fastest of at least twenty
stretches of a few milliseconds at each, and one more reading of a ratio
over the bound before it fails. Over 6,240 such readings on the runners
the linear matcher's ratio was at most 6.08 against the bound of 8, and
the quadratic one failed every reading. A test that keeps a fixed
allowance states it beside the bound, as before.

## Consequences

The suite is larger than the code, and slower than a unit suite usually is,
because the oracle and enumeration tests do real work. They are what makes a
change to the core safe to copy.

## Record

### 2026-09-27: the first gate

Two full sweeps, both on hosted CI (the `mutation` job):

| Commit | Run | Score | Mutants | Killed | Timed out | Survived | No coverage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| cbe2223 | 36213861974 | 95.37% | 5,029 | 4,214 | 582 | 206 | 27 |
| 8840d36 | 36252418643 | 94.89% | 5,086 | 4,251 | 575 | 233 | 27 |

The second took three hours. Stryker counts a mutant that times out as
detected, and whether one times out depends on the runner as much as on the
code: among the mutants of code the two commits share, 23 timed out in the
first sweep and survived the second, one did the reverse, and 79 moved
between killed and timed out. Counted as the first sweep counted them, the
second would have scored 95.32%. The rest of the difference is the five
survivors in the code the second commit added.

**The `break` is 94**: under 94.89% by 0.89 points, some 45 mutants, which
is more than the swing between two sweeps of nearly the same code, so noise
does not fail the build, while a change that leaves that many more alive
does. `high` and `low` stay where they were.

The second sweep reported 28 survivors the first did not; the 23 of them in
shared code had all timed out the first time. Each was read.

- **Killed, 17**, each by a test of a decision it had left unpinned:
  the column of a list item's text after no space, four spaces and five
  (eight of the nine at `itemColumn`); the items a marker leaves open (two,
  with the four survivors on the same line that both sweeps reported); an
  image in a link's text that closes past the text's `]`, and a wiki embed
  there, which is not read (three); the JSON-RPC 2.0 error codes and the
  `_meta` key for client information, written out as a client meets them
  (four, with `INTERNAL_ERROR` and the other three `_meta` keys, which both
  sweeps reported). Each was applied by hand and seen to fail the new test.
- **Equivalent, 11.** Applied by hand, each leaves the whole suite passing,
  and each has a comment beside the code saying why:
  - `links.ts`, leaving a link's text: `textEnd > 0` (a `]` that closes a
    `[` is never at 0) and `at > textEnd` (the `]` is read as no link, and
    one step later resumes at the same place).
  - `links.ts`, `pairBrackets`: `at <= to`; `tables.ts`, `splitRow`:
    `at <= line.end`; `scan.ts`, `closeRun`: `at <= stop`. Each reads a
    line terminator, as the file's header says.
  - `scan.ts`, `closeRun`: a search for `""` (records a run of length zero,
    which no opener asks for) and `at > 0` (a run ends at `from`, so `from`
    is past 0).
  - `scan.ts`, the loops that pop the list item stack: `true` and
    `items.length >= 0` for `items.length > 0` (`undefined > indent` is
    false). The same pair on the other loop timed out in both sweeps.
  - `scan.ts`, `itemColumn`: `spaces > 1` (at one space both arms give one).
  - `lists.ts`: `sawBlank` starting `true` (nothing reads it before a
    marker line clears it).

The survivors both sweeps reported are not reread in this entry.

### 2026-09-27: the first sweep under the gate

| Commit | Run | Score | Mutants | Killed | Timed out | Survived | No coverage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| c78de30 | 36267469758 | 95.42% | 5,086 | 4,342 | 511 | 206 | 27 |

Stryker enforced `break: 94`, and the sweep cleared it by 1.42 points.
c78de30's code is 8840d36's - only tests and comments changed between them -
so what moved is what the tests of the entry above killed, and the runner:
against the sweep of 8840d36, 24 survivors were killed, 5 timed out instead
and one mutant that had timed out survived, and 77 moved from timed out to
killed and 17 back.

### 2026-09-27: the sweep of 119345e, and the gate at 94.5

| Commit | Run | Score | Mutants | Killed | Timed out | Survived | No coverage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 119345e | 36326262615 | 95.56% | 5,227 | 4,460 | 535 | 212 | 20 |

119345e added the reading of a link inside a link, the front matter never
closed, an HTML block's tag and the advice for `**` inside a name. Against
the sweep of c78de30, five survivors were new and none of the old ones gone
but by moving. Each new one was read:

- **Equivalent, 3**, in `globstarAdvice`, each with its comment at the code:
  `at <= written.length`, `close >= 0` and `close - 1`.
- **Killed, 1**: `links.ts`, the backslash that skips the escaped character
  as the link text is walked, emptied. An escaped `[` then opened a wiki
  link with the `[` after it, so `\[[a]]` read as `[[a]]`; the wiki-link
  test now holds an escaped one to no link.
- **Killed, 1**: `LEGACY_RESOURCE_NOT_FOUND` made `+32002`. It and
  `UNSUPPORTED_PROTOCOL_VERSION` trade places between survived and timed out
  from sweep to sweep - a constant's mutant runs the whole suite - and no test
  held either: the tests compared the reply's code to the constant itself.
  They now write -32002 and -32022 out, as the test of JSON-RPC 2.0's codes
  already did.

**The `break` is 94.5.** Two sweeps of the code as it now stands read 95.42%
and 95.56%, over the 94.89% the `break` of 94 was set against. 95 would sit
0.42 points under the lower of them, inside the 0.48 that two sweeps of
nearly the same code have swung; 94.5 sits 0.92 and 1.06 points under, as
far as 94 sat under 94.89.

### 2026-09-28: the sweeps of d5fab98 and 65ef842, and what timing out hid

| Commit | Run | Score | Mutants | Killed | Timed out | Survived | No coverage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| d5fab98 | 36337062683 | 95.54% | 5,227 | 4,493 | 501 | 213 | 20 |
| 65ef842, its pull request | 36343489435 | 95.48% | 5,287 | 4,537 | 511 | 219 | 20 |
| 65ef842, main | 36354143778 | 94.21% | 5,287 | 4,614 | 367 | 286 | 20 |

d5fab98 changed tests and the gate and nothing else, and its sweep cleared
94.5 by 1.04 points. 65ef842, with ca0ec02 under it, changed where a
definition is read, and was swept twice, by its pull request and by main.
The code was the same and the runner was not: main's was faster, and 168
mutants that had timed out on the pull request's finished there - 101 were
killed and 67 survived - while 24 went the other way. Main's sweep read
94.21% and failed the gate. Against the sweep of d5fab98, 73 survivors were
new. Three were in the reader 65ef842 changed: the test that a definition's
line is Markdown and opens with structure, twice, which the new test of the
paragraph above now answered first wherever the suite looked, and the
second bracket's `undefined` test, which only narrows a type. The other 70
had timed out there, in code 65ef842 did not touch: 44 in `glob.ts`, 14 in
`automaton.ts`, 8 in `links.ts`, and one each in `regex.ts`, `lines.ts`,
`scan.ts` and `charset.ts`. A mutant that times out counts as detected, so
these had only ever been detected by being slow, and no assertion held what
they change.

Every mutant main's sweep reported undetected, and every one that timed out
in either sweep - 774 - was replayed by hand against the whole suite, one
run each, with the clock the timing tests read held at 0 so that only an
assertion about an answer could kill; the survivors were run again on the
real clock.

- **Of the 73, killed 44**, each by a test of the decision it broke: an
  escaped brace or comma inside braces; a group closing inside a group; a
  class hiding its commas from the braces when negated or opened with `]`,
  and never reaching past a `/`; a refusal from a later group; `./` as the
  root; an extended glob at the start of a pattern, or with more than one
  character before its `|`; a trailing `/` or a `.` segment inside braces,
  which anchors no gitignore pattern; `[!]]`; two globstars in a row
  compiling to the automaton one does; the last code point one UTF-16 unit
  holds; the automaton's ceiling, as a refusal with its message and as the
  longest literal that fits filling it exactly; a range inside an earlier
  one merging into it; the line a comment closes on holding no definition;
  and a `]` that closes nothing opening no link.
- **Of the 73, equivalent 28**, each commented at the code: arrows and
  buffers whose first value is never read; the builder's guards against an
  empty sequence or alternation, which no glob asks for; bounds one step
  past an end, where `''` or NaN is read; `close >= 0` where `close` is -1
  or past the `[`; `refClose !== undefined`, which only narrows a type; a
  step back into a link's text that comes back where it was; `resume`'s
  first value; and `/` as a literal, which no segment holds.
- **Of the 73, one now loops without end**: `close > 0` made `true` in
  `splitOptions`, which no test reached until the refusal of a class that
  reaches past a `/` did.
- **Of the 468 that timed out in either sweep, 268 are killed** by an
  assertion. 19 of them by tests added here: a dot and U+2028 and U+2029;
  a definition indented past three columns under one, at every width from
  four to twelve; a title its paragraph never closes; a destination
  running onto a line a comment opens; a wiki link read once with a
  paragraph after it; a colon past a scheme's place; a witness only an
  unreadable character makes, and none when every character is avoided;
  and ten mutants of `serveLines` that left its promise unsettled, which
  the tests waited on until vitest gave up and now fail at once, by asking
  whether it settled by the next turn of the event loop. Four more are
  killed on the real clock by the checks of linear time already there: the
  stamp that marks a state visited, the memory of a failed search for a
  closing backtick run (twice), and the memory of a comment that never
  closes, whose answers do not change without them; the last took two
  minutes with the clock held. **23 are equivalent**, each commented: an
  early return, a clamp or a loop bound at a value that answers the same, a
  guard that only narrows a type. **177 still time out or run out of
  memory**, and every one is a loop that no longer ends: 127 were still
  running after 150 seconds on their own, where the whole suite takes about
  ten, and 50 filled the heap.
- **Of the 233 survivors the sweep of d5fab98 reported too, 74 are now
  killed**, by the tests above and by tests of the decisions beside them:
  the MCP revisions negotiated, written out; a cancellation for a request
  that finished or never began, and for `"1"` beside `1`; several messages
  in one chunk; a witness's budget, its refusal of `..` and NUL, and of an
  empty search; a title-case letter and `ß` ignoring case; the names of
  `GlobError`, `AutomatonTooLarge` and `ProtocolError`; and others. One
  more now loops without end.

On main's report with these verdicts, the next sweep reads 96.05%. Counting
every mutant still timing out as a survivor, the worst a runner fast enough
to finish them could do, it reads 92.66%, which does not clear 94.5: it
would take 98 more of them held by an assertion. But no runner finishes a
loop that does not end, so none of the 179 can survive, and counted as
Stryker counts them, these mutants give the projection on any runner.

**The `break` stays 94.5.**

### 2026-09-28: what only a clock held

The sweep of pull request 4, run 36392120706, read 96.33% over 5,287
mutants. Stryker names the first test that fails a mutant, so a mutant a
test of an answer failed first is held by that answer. 214 were not: 136
that timed out, and 78 that a test of time failed first - the scan of a
generated megabyte, the glob check held to 250 ms, the regular-expression
checks held to two seconds, or a check of linear time. Each was replayed by
hand against the whole suite with the clock the tests read held at 0.

- **91 are killed by an answer**: all 78 a test of time failed first, among
  them the six the regular-expression checks did - a class that matches
  every character, a case twin taken for any letter, the mark that a state
  was visited - and 13 of those that timed out. So no mutant depends on the
  two seconds those checks allow.
- **106 never end**: 93 were still running after 75 seconds and 13 filled
  the heap.
- **17 survive**, and were run again on the real clock. Three change cost
  alone and are held by checks of cost as they now are: the mark that a
  state was visited in the glob matcher, whose live states otherwise repeat
  as many times as there are ways to reach them - 12 ms for a name the
  engine matches in 20 microseconds, 11 seconds for the 121-character one -
  and, twice, the memory of a failed search for a closing backtick run. 14
  are equivalent, each commented at the code; the two in `findTables` were
  not, and now are.

The glob check and the megabyte check were bounds in milliseconds, and now
compare two sizes, as the amendment above has it. The megabyte check never
ran instrumented, so it held no mutant; one loaded run took 915 of its 1,000
ms. The checks of linear time compared one small scan with one large one:
documents of 80,000 lines read linear work as 16 to 25 times on an idle
machine, from collecting a heap sixteen times as full, and a machine running
six other suites took their margin to 1.68 - one failed with nothing wrong.
They now time sixteen small scans against one large one, taken in turn, on
documents a third to a tenth the size, and the least margin under the
same load is 2.33. They time the links, list items and directives mask too,
which the scan makes when first read and which no check had timed. Of the
mutants written by hand to change cost alone, eight are caught on the real
clock; the ninth, a search of every definition for the one on the line
above, costs a third of a nanosecond a step and hides under the allowance
at these sizes, as it did before, when no check timed links at all.

**The `break` stays 94.5.**

### 2026-09-30: the sweep in shards

The sweep is the gate on every change, and every change waited for it: the
last twelve sweeps took 67 to 164 minutes, 145 at the median, and the same
5,546 mutants took 97 minutes on the runner of 0eebd94's pull request and
151 on main's of 7a1753c. spec-graph (its ADR-0019) and spec-guard (its
ADR-0003) run their sweeps in shards and merge the reports back into one
score. `scripts/mutation-shards.mjs` is that merge, with their tests.

**What a shard must not change.** The merged sweep has to be the one a
single run would have done. Every shard runs every test: `related` was
already off, and Stryker runs the suite `npm test` runs less the merge's own
tests, which reach nothing under `src/` (`vitest.mutation.config.ts`, held
to `vitest.config.ts` by a test). The merge refuses a missing shard, a shard
reported twice, a file mutated by two shards or by one it does not belong
to, a listed file its shard did not report, a shard that ran with patterns
other than its own, and shards that ran different tests, and it matches
tests by file and name, since Stryker numbers them afresh in every run. Each
shard runs with the `break` off, because two of them read about 91 while the
sweep clears 94.5; the merge scores the merged report with
`mutation-testing-metrics`, the library Stryker's gate uses, and fails an
unrounded score under 94.5 as that gate does. An unset or unknown shard is
an error when the shard configuration loads, never a run over everything,
and a file no shard lists is mutated by the last. No test here writes to
disk, so shards running side by side cannot race, as spec-graph's once did.

Before any sharded sweep ran, 7a1753c's report was cut into shards the way
Stryker writes them, ids renumbered and tests reordered, and put back by
the merge command: all 5,546 verdicts came back with their covering and
killing tests by name, 97.17% as that sweep printed, and the page decodes
to the merged report. Seventeen defects put one at a time into the script,
the shard configuration, the mutation run's vitest configuration and the
workflow each failed `tests/mutation-shards.test.ts`.

**Where the minutes went.** Stryker tests mutants file by file in a fixed
order, and its progress reporter stamps a count every ten seconds, so
`scripts/mutation-timeline.mjs` reads each file's minutes off a log; the
timeouts it counts in each file's stretch match the report's within three.
In 7a1753c's sweep `links.ts` took 27.8 minutes, `regex.ts` 19.6,
`syntax.ts` 19.3, `scan.ts` 18.9, `lines.ts` 12.5, `glob.ts` 10.2 and the
other ten 41.1. The first sharded sweep split them eight ways on those
minutes, and every shard finished in 2 to 8: 26 minutes of mutant testing
between them. Stryker instruments every file it mutates, and instrumented
code slows every test that runs it. Over all sixteen files the suite took
69 to 90 seconds; in a shard, which instruments only its own files, 4 to 33.
Most of a file's minutes in the single run were the other fifteen files'
instrumentation, and two fifths of 7a1753c's were a hundred static mutants
that timed out, each on a clock set by the whole suite.

**Six shards.** A file cannot be split, since a line range loses the
mutants that cross it (spec-graph's ADR-0019), so no shard finishes before
`links.ts`, which took 5.1 to 7.7 minutes on its own. A file is slower
beside files its tests run: in five shards, `regex.ts` and `tables.ts` took
twice what they took apart, beside `charset.ts` and `syntax.ts`, and that
shard and one other ran past `links.ts`. A pattern file's tests run no
markdown or text file, and theirs run no pattern file, so each pattern file
has a shard beside one markdown or text file, and the last takes every file
not listed, a file added later among them:

| Shard | Files | Minutes |
| --- | --- | ---: |
| 1 | `links.ts` | 7.7 |
| 2 | `automaton.ts`, `lines.ts` | 6.2 |
| 3 | `glob.ts`, `syntax.ts` | 4.5 |
| 4 | `charset.ts`, `scan.ts` | 5.6 |
| 5 | `regex.ts`, `tables.ts` | 3.5 |
| 6 | the rest: `frontmatter.ts`, `lists.ts`, `headings.ts`, `layout.ts`, `width.ts`, `posix.ts`, `mcp.ts`, and `types.ts`, which has no mutants and so cannot be listed | 4.8 |

Eight shards waited on `links.ts` as six do, from two more jobs, and CI's
ten other jobs already take half the twenty that GitHub runs at once on a
free plan.

**The sweeps**, each of 7a1753c's code and tests, dispatched on the branch
that brought the shards, and timed from the first shard starting to the
merged score:

| Run | Shards | Score | Mutants | Killed | Timed out | Survived | No coverage | Took |
| --- | ---: | --- | --- | --- | --- | --- | --- | --- |
| 36675091907 | 8 | 96.23% | 5,546 | 5,113 | 224 | 202 | 7 | 8m43s |
| 36677574459 | 5 | 96.25% | 5,546 | 5,106 | 232 | 201 | 7 | 9m15s |
| 36679639631 | 6 | 96.38% | 5,546 | 5,108 | 237 | 194 | 7 | 9m13s |

0eebd94 and 7a1753c hold the same code, and their single runs read 96.54%
and 97.17%. Mutant by mutant, nothing moved between those runs and the
sharded ones but mutants that had timed out in one of them, and every
survivor of 7a1753c's run survived every sharded sweep. Against 0eebd94's
run, 14 to 17 mutants that had timed out survived each sharded sweep, 20 in
all, while one of its survivors timed out in the second and five in the
third. The 20 are loop bounds one step past an end, clamps, shortcuts and
values never read, each already read as equivalent and commented at the
code, which the single runs had only been too slow to finish. The same
move, 35 mutants, separates the two single runs of that code, so a shard
reads as a faster runner does, and it is one: its suite runs in a third to
a twentieth of the time.

**The `break` stays 94.5.** The sharded sweeps read 96.23 to 96.38%, under
0eebd94's single run by the equivalent mutants they finish, and clear the
gate by 1.7 points or more.

### 2026-10-07: a sweep that measured the runner

| Commit | Run | Score | Mutants | Killed | Timed out | Survived | No coverage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 972bbe5, main | 37556549438 | 96.36% | 5,546 | 5,091 | 253 | 195 | 7 |
| a922927, vitest 5.0.0 | 37528529991 | 4.00% | 5,546 | 221 | 1 | 5,317 | 7 |
| 5eb0eed, the hold | 37568501290 | 96.20% | 5,546 | 5,107 | 228 | 204 | 7 |

The second is Dependabot's pull request 18, and it reads the runner, not
the tests: on vitest 5 Stryker's vitest runner ran no test against 5,313
mutants that tests cover, and scored each as survived. ADR-0008, amended the
same day, has the cause, the hold on vitest 4 and the check that lifts it.
The third is the pull request that holds vitest on 4: main's source, and
three tests more that reach none of it. Mutant by mutant against main's,
5,509 verdicts are the same and 37 moved, every one into or out of a
timeout: 22 that had timed out were killed, six went the other way, and
nine that had timed out finished and survived. Those nine are its 0.16
points under main, and what two sweeps of one source differ by.
**The `break` stays 94.5**, and no sweep under vitest 5 is set beside one
under 4 until that check has passed.

### 2026-10-11: the order a mutant's test files run in

spec-harness found (its ADR-0010, amended 2026-10-09) why its full sweep was
slow. Stryker's vitest runner runs a mutant's test files one after another
in one worker and stops at the first test that fails; vitest's own order
runs first a file that failed when the worker last ran it, then the
longest; and a static mutant, which runs every file, waited for the long
ones before the unit test that kills it. With the quickest first that
sweep's files took 95 minutes where they had taken 183. That the same
order cost this sweep was inferred there, and measured here.

**Before.** Five sweeps of one source, the same tests and configuration,
each on a push to main; 0875f99 differs from the four before it in the
version of a development dependency's types. A mutant is killed late when
it had completed more tests than its killer's file holds for it up to the
killer, so another file had run to its end first. A timeout is on the
clock when Stryker waited it out and replaced the worker, and at the hit
limit when the mutant's own count stopped a loop at once:

| Commit | Run | Six jobs | Slowest | Killed | Late | On the clock | At the hit limit | Survived | Score |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| dff37b7 | 37657549289 | 36m40s | 8m28s | 5,116 | 206 | 70 | 150 | 203 | 96.21% |
| 202f5aa | 37695318839 | 35m00s | 8m44s | 5,107 | 209 | 83 | 149 | 200 | 96.27% |
| bef676d | 37788070125 | 35m49s | 9m03s | 5,113 | 218 | 80 | 151 | 195 | 96.36% |
| cb635e4 | 37830477190 | 31m28s | 8m07s | 5,115 | 198 | 76 | 149 | 199 | 96.29% |
| 0875f99 | 38111312265 | 33m14s | 7m19s | 5,103 | 200 | 83 | 150 | 203 | 96.21% |

The static mutants are not where this sweep's minutes are. There are 226 of
them, and in the sweep of cb635e4 they took 2.0 of the 26.7 minutes the six
shards spent on mutants, by `scripts/mutation-timeline.mjs`; in
spec-harness's they were three quarters.

One killed mutant in twenty-five was killed late. The long files are
`tests/markdown/linear.test.ts`, `tests/pattern/oracle.test.ts` and
`tests/markdown/properties.test.ts`: four fifths of the suite's time, and
the first to fail for one killed mutant in twenty. The tests completed
ahead of a late killer's file add up to whole files, and where they add up
in one way only, a long file was among them for two in three: 41 of 62 in
the sweep of cb635e4.

Stryker's reports carry no times. To price a mutant, each test's time was
taken from serial runs of the suite and scaled to each shard's initial
run, and a timeout on the clock was taken at Stryker's own sum: one and a
half times its tests' time, the five seconds of `timeoutMS` and the
initial run's overhead. By that pricing, of the worker-seconds the shards
spent on mutants, the files ahead of late killers were between 4% and 19%,
the least and the most the tests completed could have cost; the survivors
9% to 11%; and the timeouts on the clock 23% to 31%. What is left is what a
run costs before its first test, a third of a second to a second each. So
the files ahead came to between one and five of the 31 to 37 minutes, and
two sweeps of one source differ by as much.

**What else the order decides.** 49 of the 5,546 mutants differ between
those five sweeps, and 31 of them were killed in one and timed out on the
clock in another. The two regular expressions of `posix.ts` have seven
static mutants, each killed by a test of `tests/path.test.ts`, a file of
milliseconds that vitest's order runs among the last. In the sweep of
bef676d two of them had completed 828 of the 888 tests when it killed
them; in the sweep of 202f5aa all seven ran out the clock. The last
shard, which holds them, took 3m32s with three timeouts on the clock and
6m33s with twenty. Ten more mutants survived in one sweep and timed out
in another, as the entries above have it, and one mutant of a buffer the
glob matcher empties before it reads, equivalent by the comment at the
code, was killed once in five by the check that matching takes time linear
in the path: a test of cost, on a clock.

A mutant that times out records no test, so how many of the 70 to 83 an
assertion would kill if its file ran first could not be read off a report.

**The order.** `vitest.mutation.config.ts` gives the sweep an order of its
own, in every shard and in the one-process run alike: a file that failed
when the worker last ran it first, as vitest has it, then the quickest
first, and a file with no time yet after those. No test leaves the run and
none is added: a mutant survives when every file has passed, in any order.

It differs from spec-harness's in what a file with no time does. There it
runs the smaller first, and the largest file is the longest. Here size is
no guide to time: the seven largest files of the sweep are unit tests that
take about a second between them and are the first to fail for three killed
mutants in four, and none of the three long files is among the ten
largest. So a file with no time runs after the timed ones the larger first,
as vitest has it, and a worker that has timed nothing runs its files as
vitest would.

`tests/mutation-shards.test.ts` holds the order, the keys it reads vitest's
cache by, since a key vitest stopped using would find nothing and leave
every file untimed, and `npm test` to vitest's own order. Twenty-three
mutants of it, made by hand, each failed that file.
`scripts/mutation-timeline.mjs` prints the mutants killed late and the
timeouts on the clock beside each file's minutes, so the next measurement
reads them off a report.

**After.** The pull request that brought the order swept 0875f99's source
beside main's own sweep of it (9d528a7, run 38112575026):

| | Five sweeps in vitest's order | The quickest first, run 38112575026 |
| --- | ---: | ---: |
| Shard 1, `links.ts` | 7m19s to 9m03s | 6m25s |
| Shard 2 | 5m54s to 7m53s | 5m52s |
| Shard 3 | 4m04s to 5m29s | 3m47s |
| Shard 4 | 3m52s to 6m57s | 4m59s |
| Shard 5 | 2m57s to 4m09s | 3m04s |
| Shard 6 | 3m32s to 6m33s | 3m23s |
| The six jobs | 31m28s to 36m40s | 27m30s |
| Their mutants, after each initial run | 27m39s to 32m33s | 23m50s |
| The six initial runs, net | 105 to 118 s | 111 s |
| Killed | 5,103 to 5,116 | 5,121 |
| Killed late | 198 to 218 | 159 |
| Timed out on the clock | 70 to 83 | 72 |
| Static mutants among those | 1 to 16 | 0 |
| At the hit limit | 149 to 151 | 150 |
| Survived | 195 to 203 | 196 |
| Without coverage | 7 | 7 |
| Score | 96.21% to 96.36% | 96.34% |

The mutants are the same 5,546 in all six sweeps. Of the 31 that had been
killed in one sweep and timed out on the clock in another, 30 were killed
and one timed out. The three long files were the first to fail for 7
killed mutants, where they had been for 223 to 272: they had failed first
because they ran first. Where the tests completed ahead of a late killer
add up in one way only, a long file was among them for 8 of 49, and by the
pricing above the files ahead were between 1% and 11% of the
worker-seconds. Six mutants got a verdict no sweep before had given them,
each still detected: two that had always run out the clock and one that
had always stopped at the hit limit were killed by a test of their own
unit file, after one, two and eight tests; and three that an assertion
had always killed within four tests ran a quicker file first and never
ended there, two of them on the clock and one at the hit limit.

No mutant survived that had not survived before. The sweep's 196
survivors all survive in main's sweep of 0875f99, which has seven more,
and each of the seven timed out on the clock here as it had in at least
one of the four sweeps before that: they are among the ten that change
sides from sweep to sweep. With every timeout lost the sweep would read 92.34%, where the
five read 92.01% to 92.25%.

This is one sweep. Shards 1, 2, 3 and 6 took less than in any of the five
before, shards 4 and 5 what they had taken, on runners no faster by their
initial runs, and the six jobs took four minutes less than the quickest of
the five and seven less than their mean. The timeouts on the clock are
where the minutes still are, a third of the worker-seconds by the same
pricing, and this sweep does not show the order making them fewer.

**A second sweep.** The commit that added this record was swept in the same
order (e88097b, run 38116771674). Its six jobs took 20m49s, each between
2m48s and 3m57s, with `links.ts`'s still the slowest. It read 5,119 killed,
172 of them late, 61 timeouts on the clock, none of them a static mutant's,
154 at the hit limit, 205 survivors and 7 without coverage: 96.18%, and
92.30% with every timeout lost. No mutant survived that had not survived in
a sweep before. Its score is the lowest of the seven sweeps and its
survivors the most, by the mutants that change sides from sweep to sweep:
the ten that survive in one and run out the clock in another all finished
and survived. Four mutants got a verdict no sweep had given them, each
still detected: two that had always run out the clock stopped at the hit
limit, and two that an assertion had always killed did not end, one on the
clock and one at the hit limit.

So the two sweeps in the order read 96.34% and 96.18%, where the five
before read 96.21% to 96.36%; their jobs took 27m30s and 20m49s, where
those took 31m28s to 36m40s; and they had 72 and 61 timeouts on the clock,
where those had 70 to 83. Two sweeps of one source in one order differ by
seven minutes, so the minutes above are a direction and not a figure.

**The table stays.** `links.ts` cannot be split and its shard is still the
slowest, and the other five took 3m04s to 5m52s beside its 6m25s.
`scripts/mutation-shards.mjs` and the workflow state the minutes of this
sweep.

**The `break` stays 94.5.**

### 2026-10-12: nothing the sweep reads stands under an `as`

Stryker 10.0.0 makes no mutant of anything that stands under a TypeScript
`as` expression. Read from its source: `shouldSkip` in the instrumenter's
`dist/src/transformers/babel-transformer.js` asks `isTypeNode`, whose list
in `dist/src/util/syntax-helpers.js` holds `TSAsExpression`, and a node on
that list is passed over with everything beneath it. `TSEnumDeclaration` is
on it too; `satisfies`, `!` and a call are not. So the `x + 1` of
`ends.space[x + 1] as number` was never mutated, and no report said so: a
mutant that was never made is in no column, and a score is of the mutants
there are. The four tools found it in their own sources (spec-guard's
ADR-0003 and spec-brief's ADR-0009, each amended 2026-10-12), and each
holds its sources with the script this one is adapted from.

**Measured before changing anything**, on main's sweep of 99f4920 (run
38176640207, 5,546 mutants), by reading each source the report holds with
the parser Stryker reads it with: 158 `as` expressions in the sixteen
files, outermost only; 33 of them over 35 places one of Stryker's mutators
applies to; and no mutant of the report at any of the 35. A place is not a
mutant: a mutator makes one to three of each. The tree gave the same
count.

| File | Places | Beside mutants | What stood under an `as` |
| --- | ---: | ---: | --- |
| `links.ts` | 14 | 607 | The tables `endsOf` fills from the right, read one further on (8) and at a destination's start (2); the line above a definition; the line a comment opens on; the line an offset is on; the furthest any pair has read to. |
| `frontmatter.ts` | 4 | 695 | The line above, where a block's trailing blank lines are taken off; a block's last content line; the last item of a list; the pattern a trailing comment starts at. |
| `scan.ts` | 4 | 476 | A line's shape; where the paragraph below stops; the innermost open list item, twice. |
| `regex.ts` | 3 | 851 | The letter of an escape, in a refusal; the last option of an alternation; the stack of states the simulation follows. |
| `width.ts` | 3 | 43 | The two ends of a run of wide characters, in the bisection. |
| `mcp.ts` | 2 | 509 | The last argument a tool takes, where an unknown one is refused; the `id` a request is tracked by until it is answered or cancelled. |
| `lines.ts` | 2 | 185 | Where a line starts, twice. |
| `headings.ts`, `automaton.ts`, `charset.ts` | 1 each | 198, 277, 116 | The line under a setext heading's text; the last option of an alternation; the characters a witness is spelled with. |

**The rewrite.** Each of the 33 was rewritten so that what a mutator reads
stands under no `as`:

- 31 read `x!`, where the cast only took `undefined` off a lookup that
  cannot miss: 29 index reads, a `Map.get`, and the first part of a
  `split`;
- 1 has the cast on a name: `(message as { id: RequestId })['id']` for
  `message['id'] as RequestId`, which leaves the key outside the cast;
- 1 says its type on the declaration: `READABLE: readonly number[]`, where
  `as const` stood over the list.

No `as` is left with a place under it. The 126 the sources still have
stand over a name, a property, a call that is given names, or an index
read by one of those or by a number: nothing a mutator applies to.

**Nothing a tool compiles changed.** Every module here is copied into the
tools, so the rewrite was held to the output of the build: `dist` has the
same 22 declaration files and the same 22 modules, each byte for byte what
it was. A cast, a `!` and a declared type are all erased, so no tool emits
anything else either. The types inside a module were checked as well: each
cast was compiled beside its rewrite, where it stood, against a type that
is `true` only for two identical types. 32 are identical. One differs,
and nothing reads the difference: `READABLE` was a tuple of ten literals
and is a list of numbers, private to `charset.ts` and read once, spread
into a `number[]`. The same check refuses a `!` on a read that may be
`null`, which is the mistake it is there for.

Ten files changed, in four modules, and each is copied again into every
tool that holds its module: `mcp.ts` of `jsonrpc`; `frontmatter.ts`,
`headings.ts`, `links.ts` and `scan.ts` of `markdown`; `automaton.ts`,
`charset.ts` and `regex.ts` of `pattern`; `lines.ts` and `width.ts` of
`text`.

**What holds it.** `scripts/mutation-unmeasured.mjs` is the measurement: it
counts, under every outermost `as` and in every enum, the nodes one of
Stryker's mutators applies to, and `LEFT` in it records how many the tree
is known to keep, which is none.

- The sweep's merge job runs it on the merged report, after the merge has
  written that, and fails a count above `LEFT`.
- `tests/mutation-unmeasured.test.ts` runs it on the tree in the ordinary
  suite, so a cast over an index's arithmetic fails a pull request's tests
  before its sweep.
- The same test holds the count to the Stryker installed. Over one source
  written with every kind of place, Stryker's own instrumenter makes no
  mutant under a cast; with the casts taken away, each replaced by as many
  spaces, it mutates exactly the places the script counted, cast by cast.
  Were the first to fail, Stryker reads under a cast now and the script has
  nothing left to say; were the second, Stryker has a mutator the script
  does not know.
- The script finds the parser from Stryker's instrumenter and not by its
  name, since npm may hoist another major of `@babel/parser` to the top of
  `node_modules`. Where the instrumenter's is not installed it measures
  nothing and fails, naming the package.
- The test reads `src/` as text and loads the instrumenter, so a mutation
  run leaves it out, with the test of the shards. It hands the run its
  report and takes the job summary back in memory: no test here writes to
  disk.
- 36 defects put one at a time into the script, the vitest configuration
  of the sweep, the workflow and two of the rewritten lines each failed that
  test or the test of the shards. Three of them had passed the test as it
  came from the tools, and are held here: a key written as a string
  counted as a place, a type inside the expression read as code, and a
  mutant of the report beside a cast on its own line read as under it.

**The mutants the casts had hidden.** Stryker's instrumenter, asked about
each of the ten files as main has it and as the rewrite leaves it, makes
35 mutants where the casts stood, one at each place: 31 in the arithmetic
of a lookup, a `+` made `-`, a `-` made `+` or a `*` made `/`, and one each of
`--top` made `++top`, `/\s#/` made `/\S#/`, `'id'` made `""` and the list
of readable characters made `[]`. It makes four fewer elsewhere, each a
statement taken away whole: `reach.push(...)` in `links.ts`,
`stops.set(...)` in `scan.ts`, and a `throw` and a `this.compile(...)` in
`regex.ts`, all four killed in main's sweep. Stryker takes a statement away
only where that would be the statement's one mutant, and each of these
holds others; with a cast in the statement the instrumenter kept the
mutant all the same, as spec-guard found in its own sources. So a sweep of
the rewrite makes 31 mutants more than main's.

Each of the 35 was written into the source by hand and run against the
tests of its module:

- **30 failed a test that was already there.** The list of readable
  characters is the one static mutant among the 35, and three tests of
  `tests/pattern/glob.test.ts` fail for it in their bodies, with every
  file loaded.
- **4 did not end.** Three were still running after four minutes, where
  the tests of their module take under half of one: the stack of the
  regular-expression simulation counting up, and the tables of ends and
  the table of line starts read past their ends. The fourth, the walk over
  a block's trailing blank lines, filled the heap.
- **1 failed none**: `start + 1` made `start - 1` where a hex escape
  without its digits is refused (`regex.ts`). The refusal names the
  escape, `expected 2 hex digits after "\x"`, and the tests held only the
  words `hex digits`, so the letter could be whatever stands before the
  backslash. `tests/pattern/regex.test.ts` now holds the message for `\x`
  and for `\u`, each after other text, and the mutant fails it.

**The sweeps.** Main's last, a second of the same source by a pull request
that changed the lockfile alone, and the first of the rewrite, with the
script, the test of the hex escape and this record less this paragraph
(9786bcb):

| | Main, run 38176640207 | The same source, run 38187769862 | The rewrite, run 38193952323 |
| --- | ---: | ---: | ---: |
| Mutants | 5,546 | 5,546 | 5,577 |
| Killed | 5,120 | 5,120 | 5,148 |
| Timed out | 220 | 215 | 225 |
| Survived | 199 | 204 | 197 |
| No coverage | 7 | 7 | 7 |
| Score | 96.29% | 96.20% | 96.34% |
| Static mutants | 226 | 226 | 227 |
| Places under an `as` | 35 | 35 | 0 |
| Tests | 888 | 888 | 891 |

Paired mutant for mutant, 5,542 of main's 5,546 are in the sweep of the
rewrite, the four that are not are the statements above, and the 35 it
made are the ones the instrumenter had named. It killed 33 of them and
timed out on two: the walk that fills the heap and the stack counting up.
The other two that did not end by hand, the tables of ends and the table
of line starts, are killed here, since a sweep stops a mutant at its first
failing test where the replay ran every file. None of the 35 survived.

Five of the 5,542 have another verdict than in main's sweep, each into or
out of a timeout, and each is a mutant that changes sides between sweeps
of one source. `src/` did not change from bef676d to 99f4920, and in the
ten sweeps of it from bef676d's on, 51 mutants have two verdicts: 38 killed in
one and timed out in another, 13 survived in one and timed out in another,
and none killed in one and survived in another. The five are among the
51: two of `mcp.ts` and one of `scan.ts` between killed and timed out, and
the pair on the first loop that pops the list item stack (`scan.ts`),
equivalent by the comment there, which survived in main's sweep and ran
out the clock here, as in two of the ten.

**No mutant survived that had not survived in main's sweep**: the 197
survivors are main's 199 less that pair.

**The minutes**, each shard's sweep step beside its initial run of the
suite, which is what a runner's speed shows in:

| Shard | Main | The same source | The rewrite | Mutants more |
| --- | ---: | ---: | ---: | ---: |
| 1, `links.ts` | 6m13s, 31 s | 4m48s, 23 s | 6m25s, 32 s | 13 |
| 2 | 3m45s, 26 s | 5m39s, 37 s | 5m03s, 37 s | 3 |
| 3 | 4m45s, 20 s | 2m42s, 11 s | 4m42s, 21 s | 0 |
| 4 | 4m07s, 23 s | 3m43s, 21 s | 4m59s, 27 s | 4 |
| 5 | 3m28s, 13 s | 3m35s, 14 s | 3m06s, 12 s | 1 |
| 6 | 3m33s, 13 s | 2m43s, 10 s | 2m12s, 7 s | 10 |
| The six | 25m51s | 23m10s | 26m27s | 31 |

A shard's minutes follow its runner: shard 3 has no mutant more and took
what it took on main's runner, and shard 4, which holds the one static
mutant the rewrite adds, took a fifth more than main's on a runner whose
initial run took a sixth more. Two sweeps of one source differ by 2m41s
over the six shards, and the rewrite's took 36 seconds more than the
slower of them. The table of shards stays.

**The `break` stays 94.5.** The sweep reads 96.34%, inside what the ten
before it read, 96.18% to 96.36%, and holds more: 35 mutants no sweep had
made, every one detected.

### 2026-10-12: a survivor that is a file that did not load

Stryker counts a failed test, not a test file that failed to load. A
mutant under which a module throws as it loads takes with it every test
file that imports the module: none of their tests runs, none fails, and
where no other test fails the mutant is scored as survived although
nothing works. spec-harness met one on 2026-10-12, the emptied body of the
function its tables are built through, and holds it with a test that loads
that function alone, as spec-guard does; spec-graph imports the module
whose tables are built at load inside a test, for the same reason.

Such a mutant runs as its module loads, so Stryker marks it static, and it
is among a sweep's survivors. Main's sweep of 99f4920 (run 38176640207) has
226 static mutants: 222 killed, each by a test that failed, and 4 that
survived. Each of the four was already called equivalent by the comment at
its code: the range of `SEPARATOR` in `charset.ts`, read only for points a
witness search tries whatever the sets hold, and the three of `NOTHING` in
`regex.ts`, which fills slots nothing reads. Each was written into the
source by hand all the same and run against the suite the sweep runs, all
26 files of it:

| What happened | Mutants |
| --- | ---: |
| A test failed | 0 |
| No test failed, and a file did not load | 0 |
| Every file loaded and every test passed | 4 |

No survivor here is a file that did not load, and the four are what their
comments say. The entry above adds one static mutant, the list of readable
characters, and tests fail for it in their bodies. This repository has no
function its tables are built through, so there is none to load alone.

### 2026-10-24: what a clock decided

`src/` is the same at main's pushes from 89bcf7f to 457b8d6, at the pull
requests between them and at Dependabot's pull request 46, and the eleven
sweeps of it read 198 to 204 survivors. Ten mutants made the difference:
195 others survived all eleven, and each of the ten timed out in some and
survived the rest; no sweep killed one.

| Mutant | Timed out | Survived |
| --- | ---: | ---: |
| `links.ts` 199, `pairBrackets` walking to `at <= to` | 5 | 6 |
| `links.ts` 304, a paragraph's line asked only whether it is a definition's | 7 | 4 |
| `links.ts` 307, `first <= lines.length` | 7 | 4 |
| `links.ts` 474, `resume` starting at `+1` | 6 | 5 |
| `links.ts` 475, the walk of a paragraph to `at <= to` | 6 | 5 |
| `links.ts` 476, `textEnd > 0` | 3 | 8 |
| `scan.ts` 427, `true` for `items.length > 0` | 3 | 8 |
| `scan.ts` 427, `items.length >= 0` | 4 | 7 |
| `lines.ts` 77, `end >= start` | 2 | 9 |
| `automaton.ts` 250, the stop with no state live made `false` | 6 | 5 |

**The runner decided.** Each of the 49 timeouts came in a sweep whose
shard had drawn a slower runner, as the shard's initial run reads it, the
run that sets every mutant's clock: 27.2 to 29.1 seconds for the shard of
`links.ts`, where its four other sweeps read 21.0 to 23.3; 32.6 to 33.4 for
that of `lines.ts` and `automaton.ts`, where its four others read 16.6 to
26.9; 23.4 to 24.2 for that of `scan.ts`, where its seven others read 11.9
to 22.6. On those slower runs 49 of the 64 verdicts were timeouts, and on
the faster none of the 46. Stryker 10.0.0 gives a mutant one and a half
times what its tests took in the initial run, five seconds and the run's
overhead (`mutant-test-planner.js`, as the entry of 2026-10-11 has it); the
initial run is one process, and the mutants run four at a time, one to
each logical processor. That the slower runners slow four workers more
than one is a reading of these figures: the reports carry no times.

**Each was replayed by hand** against the test files that cover it, and
every test passed. Each was then run beside main's source on 20,000
generated documents, the corpus's own and a soup of the characters these
readers act on, with `\r\n` and without a final line ending; on 100,000
line tables; and on 100,000 generated globs, each matched against six
generated names. None changed an answer.

- **Nine are equivalent**, and each has the comment at its code that says
  why: the header of `links.ts` for the two walks to `to`, where no loop
  acts on what is there; the comment above `inParagraph` for the tests of
  a line and the bound of the loop over them; the comment above `textEnd`
  for `textEnd > 0` and `resume`'s first value; the one above `items` in
  `scan.ts`, `undefined > indent` being false; and the one in `endOf` in
  `lines.ts`. Timed beside main's source in turn, the fastest of 21 runs
  in each of two passes, on the documents of
  `tests/markdown/linear.test.ts` at their larger size and on a generated
  megabyte, the two walks to `to` took 1.26 to 1.72 times main's time on
  the three documents that end in a long paragraph with no line ending
  after it, where each reads one past the end of the text; the other 204
  readings of the nine lay between 0.79 and 1.26, where two copies of
  main's source read 0.88 to 1.21 against each other. A test of cost holds
  how work grows, and none of the nine changes that.
- **One changes cost alone**: the stop in `Matcher.test`. With no state
  live the rest of a name cannot make it match, and without the stop the
  matcher reads on to the end and answers false all the same.
  `tests/pattern/glob.test.ts` now holds it with a name of 1,024
  characters against one of 16, each failing at its first, read past a
  stall as the amendment of 2026-10-19 has it (`fastestRatioInTurn` in
  `tests/timing.ts`) and held to twice. With the stop the reading was 0.67
  to 1.66 over 200 readings, beside two runs of the suite or not, and
  without it 38 to 57, plain and under coverage; the test fails the mutant
  in its body.

**What is left.** No test holds an equivalent mutant, so the nine will go
on timing out on the slower runners and surviving on the faster, and
main's survivors will go on moving by up to nine with nothing changed.
What could stop that is the clock the sweep sets, or the nine marked in
the source for the sweep to leave out, which every tool would copy; this
entry decides neither.

**The `break` stays 94.5.**

### 2026-11-08: what a clock decided, written out or marked

Five sweeps of one source - main's at a5fc27e and at 8b0c22e, runs
42450344852 and 42455582424, and those of pull requests 57, 58 and 59, runs
42472014545, 42472170313 and 42472354689, the first of them on vitest 5 -
had sixteen mutants time out in some and survive the rest. Nine are the
nine of the entry of 2026-10-24. Five more are in `src/text/lines.ts`, at
the same two tests of `endOf` and at the clamp above them: `true` at 77,
`true` and `end >= start` at 78, and `line <= 1` and `line >= lineCount`
at 65. The last two are `src/markdown/scan.ts` 221, the loop that makes one
shape a line made to make one more, and `src/pattern/charset.ts` 42, the
mark of the separator made `false` in the set of the one character `/`.
Each is equivalent as the comment at its code said, and each runs every test
that covers it, up to 282, which a sweep on a slow runner does not finish
within the clock it sets.

**Written so that no mutant is equivalent**, where a way of writing the line
does that:

- `lines.ts`: each clamp, a line's and an offset's in `positionAt`, is a
  `Math.max` inside a `Math.min`, whose only mutants swap the two and answer
  wrongly. `endOf` takes off each terminator character with no test before
  it and returns the larger of the line's start and what is left, which
  keeps its promise not to reach past the line's start without a test that
  never decides. Two stable survivors go with the six that moved: the
  clamp in `positionAt` made `<=` and `>=`.
- `scan.ts`: the two loops that ended the list items right of a line, each
  testing the stack's length that `undefined > indent` already answered,
  are one `endRightOf`, which keeps the items up to the last one at or left
  of the line (`findLastIndex`). Two moved, and two at the second loop
  survived every sweep.
- `links.ts`: a link's text is one record, the `]` that ends it and where
  the walk resumes, or `null`, where two numbers stood with -1 for none. The
  first value of `resume`, which nothing read, and the two tests of
  `textEnd >= 0`, whose `> 0` no 0 told apart, are gone; the second of them
  survived every sweep. A paragraph's run asks `continues` before it asks
  whether the next line is a paragraph's, so no line past the last is asked
  about, and the loop over the lines made to take one step more reads a line
  that is not there and fails.

`charset.ts` keeps its line, and `tests/pattern/charset.test.ts` holds the
set of one character to what the module says of it for any point: of `/`,
which no glob literal is, it is the separator's and accepts `/`, and of no
other character does it.

**Marked**, where every way of writing the line makes one, six times: in
`links.ts` the two walks that end at `to` (`at <= to`), the test that leaves
a link's text (`at > end`, which leaves at the `]` or one step past it, and
resumes at the same place), and the tests of a blank or a code line that
only shape a paragraph's run (`true`, and `||` between the two), on a line
of their own; in `scan.ts` the loop over the lines'
shapes (`i <= count`), and, after the second sweep below, the list items'
stack's first value. Each mark leaves out the other mutants of its mutator
on its line as well, six, each killed and each with another mutant beside it
that is killed too: `at >= to` twice and `i >= count`, beside `false` for
the same loop; `false` for the paragraph's tests, beside `line.blank` for
`!line.blank`; and `inside === null` and `at < inside.end`, beside `true`
and `false` for each half of the same test.

**What shows the answers unchanged.**

- `tests/text.test.ts` reads the line table of each of the 3,280 texts of
  up to seven characters of `a`, `\r` and `\n`, at every line from -1 to two
  past the last and every offset from -2 to two past the end, against a
  reading of the lines by a regular expression. Main's `lines.ts` and this
  one pass it alike. `positionAt(-0)` alone differs, answering offset 0
  where main answered -0.
- Main's `markdown` and `text` modules and these were run side by side on
  60,000 documents: 20,000 generated, half by the corpus of
  `tests/markdown/corpus.ts` and half a soup of the characters these readers
  act on, each as written, with `\r\n`, and without a final line ending.
  Every scan was the same, its lines, blocks, masks, headings, list items,
  links and tables.
- Each of the five marked mutants, put into this source by hand and run on
  the same 60,000 documents, changed nothing.
- 38 mutants of the lines written again, put in by hand one at a time and
  run against the text and Markdown tests with `--bail=1`, as Stryker runs
  one, each failed a test.

**What the sweep read.** The pull request's sweep, run 42476211409, read
96.64% over 5,919 mutants that count, with 12 ignored by the marks: 5,492
killed, 228 timed out, 192 survived and 7 without coverage, where main's
last read 96.45% over 5,972. Of the sixteen, none timed out or survived:
each was made no more, killed, or ignored. It found one equivalent the
rewrite had made. With `line !== undefined` gone from the paragraph's test,
`isMarkdown(line) || !line.blank` survived, where under the old chain the
same mutant read a line past the last and failed. The two tests that only
shape a run now stand on a line of their own, after the test of a
definition's line, and the mark there names `LogicalOperator` as well. Put
in by hand and run on the 60,000 documents, that mutant and `true` for the
line changed nothing, and the four mutants of the test of a definition's
line, put in the same way, each failed a test.

The sweep after that, run 42478494817, read 96.64% again over the same
counts, with `||` ignored, and found a second equivalent the rewrite had
made: the list items' stack made to start as `["Stryker was here"]`, which
timed out in the first sweep and survived in this one. The old loop never
popped a string, since it is not greater than any indent, and the margin it
gave failed the tests of indented code; `findLastIndex` keeps no string,
since it is not at or left of any indent, and the first line that is not
blank ends every item, as a line after a blank one does, before the stack is
read. Put in by hand, it changed nothing on the 60,000 documents and failed
no text or Markdown test. Every way of writing an empty stack makes it, so
its line is marked, the sixth, and nothing else is made there.

**The `break` stays 94.5.**
