---
status: accepted
date: 2026-09-30
---

# ADR-0009: Versions before 1.0

## Context

The four published tools are at 0.x, and each gates CI: a release that turns
a passing run red, or changes what a script reads, breaks a pipeline that did
not ask for it. Semantic versioning says of 0.x only that anything may change
at any time. npm installs `^0.16.0` by default, which it reads as
`>=0.16.0 <0.17.0`: a repository that installs a tool takes every patch of
its minor without asking. A patch is the one release a user cannot keep out.

An outside review on 2026-09-29 found the tools' patches did not keep to that:

- spec-guard 0.13.1, a patch, read `{src/,*.md}` as a spec pattern as
  everything under `src` and a `.md` at any depth, where it had been a file
  named `src` at any depth; and a spec pattern too large to compile, which had
  ended a run with a stack trace and exit 1, now stopped it with exit 2.
- spec-graph 0.9.8, a patch, stopped a run with exit 2 on `{./,docs}`, which
  had read every path. Its CHANGELOG opens by saying a patch "fixes behaviour
  without asking anything of a repository that upgrades".
- spec-guard's CHANGELOG opens by listing each change of behaviour "with the
  flag that restores the previous behaviour"; 0.14.0 says of two of its
  changes that nothing restores the old reading.
- Between 2026-09-07 and 2026-09-30 the four tools tagged 70 versions, and 21
  of their 39 patch releases carried a *Changed* section: spec-brief 6 of 7,
  spec-graph 5 of 16, spec-guard 7 of 10, spec-harness 3 of 6.

Each change was right on its own terms; what was missing was a rule that says
which of them a patch may carry.

## Decision

**The version says what an upgrade can do to a run.** Until a tool reaches
1.0, its versions mean:

- **0.MINOR** (0.16.x to 0.17.0): anything that can turn a passing run red or
  change what a script reads - a finding or rule on by default that was not,
  a fix that reports more, a changed exit code, input refused that was
  accepted, a pattern whose meaning changes, a removed or renamed flag,
  configuration key or JSON field, a `schemaVersion` bump - and new features.
- **0.x.PATCH**: fixes that report less (a false positive gone), crashes,
  performance, documentation. Never a new failure. Where the two lists meet,
  the minor wins: a crash fixed so that the run now ends with another failing
  exit code, as 0.13.1's did, is a minor.

So `^0.17.0`, npm's default for an install, takes only releases that cannot
turn a run red, and a minor is the one upgrade a user reads before taking.

- **Deprecation.** A flag, configuration key or JSON field is deprecated with
  a warning for at least one minor release before it is removed, unless
  keeping it is a security problem.
- **Batching.** One release per tool per round of work, carrying everything
  the round changed in that tool, not one per merged fix.
- **The CHANGELOG says so.** Each tool's CHANGELOG opens with this policy in
  two or three sentences and a link here, and promises nothing its history
  does not keep. An entry is a sentence or two of what a user sees; one under
  *Changed* ends with an `Upgrading:` line saying what to do, and the details
  are in the ADR it links to.
- **spec-core has no versions.** It is not published (ADR-0001); its
  CHANGELOG says what a tool's next copy brings, and the tool's release that
  copies it classifies each change by this rule.

**The precedent is ESLint's**, a linter that gates CI, where fixing a rule
changes what the rule reports: its
[semantic versioning policy](https://github.com/eslint/eslint#semantic-versioning-policy)
makes a bug fix that reports fewer errors a patch and one that reports more a
minor, and recommends `~` so a build takes only patches. On 0.x, npm's `^`
is that `~`.

**What 1.0 takes.** A tool reaches 1.0 on its own, when all three hold:

1. Its JSON formats and exit codes have not changed across two consecutive
   minor releases.
2. It is in use in a repository outside DescentVTT.
3. It states a support window: from 1.0, the last minor of the previous major
   gets security and crash fixes for six months after a new major.

*Amended 2026-10-26*: **the repository outside is outside spec-family.**
The family moved on 2026-10-26 from the GitHub organization DescentVTT to
its own, spec-family (ADR-0005, Names), and the second condition moves with
it: the tool is in use in a repository outside the spec-family
organization. What the condition asks for is a user who is not the family
itself, and the family's home is now spec-family.

*Amended 2026-11-08*: **the user is someone other than the tools'
author.** Read by its words, the amendment above is met by a repository of
the tools' author in an organization other than spec-family, and that is
a user who is the family itself. So the second condition reads: the tool
is in use in a repository of a user other than the tools' author, in any
organization (the maintainer's decision of 2026-11-08, at the start of
round 27).

*Amended 2026-11-08*: **two minors with the output held, and new rules
first as warnings.** The first condition is no longer left to be met by
chance. From each tool's first release after round 27, the round of work
opened on 2026-11-08, its JSON fields and its exit codes stay unchanged for
two consecutive minor releases: no field a script reads is removed,
renamed or given another meaning, no `schemaVersion` moves, and no exit
code comes to mean something else. From then on a new rule ships first as
a warning, which does not change the exit code, or behind an option that
turns it on, and becomes a finding that fails a run by default only in a
later minor, whose CHANGELOG says so under *Changed* with its `Upgrading:`
line. The definitions of a minor and a patch above are unchanged (the
maintainer's decision of 2026-11-08).

*Amended 2026-11-12*: **the freeze began with round 28's batch.** "Each
tool's first release after round 27" reads two ways, since each tool also
released patches between the two rounds (spec-brief 0.13.1, spec-graph
0.24.1, spec-guard 0.33.1 and 0.33.2, spec-harness 0.24.1 and 0.24.2), and
the freeze counts minors. The first of its two minors is the batch round 28
released on 2026-11-12: spec-brief 0.14.0, spec-graph 0.25.0, spec-guard
0.34.0 and spec-harness 0.25.0. Round 29's batch is the second, and round 30
is the first whose releases may rename or remove a field, move a
`schemaVersion` or give an exit code another meaning; ADR-0005 lists what
round 30 renames.

After 1.0 the same rule moves up one place: what can turn a run red is a
major, a feature a minor, and a patch reports less or crashes less.

**spec-harness keeps lower bounds alone in `peerDependencies`**
(`>=0.2.0`, `>=0.9.0`, `>=0.12.0`). The harness talks to its siblings through
their command lines and versioned JSON, and reads a document only at a
`schemaVersion` it knows, refusing any other with exit 2 (spec-harness
ADR-0002); a changed or removed field bumps that version (ADR-0005). An upper
bound such as `<0.3.0` would make npm refuse every sibling minor, which under
this policy is most releases, until a harness release widened it, and would
protect against nothing the run-time check does not already refuse.

## Alternatives

| Option | Why not |
| --- | --- |
| 0.x as semantic versioning leaves it: anything in any release | A caret range then takes a release that turns CI red, which is the evidence above. |
| Go to 1.0 now | Formats and exit codes changed in the last week; a 1.0 whose majors come monthly promises less than this does. |
| Leave it to users to pin exact versions | Moves the work to every repository, and a pinned tool stops receiving the patches that remove false positives. |
| Release after every merged fix | Seventy tags in 24 days is more change than a user can read; batching gives each release one CHANGELOG section worth reading. |
| Upper bounds on spec-harness's `peerDependencies` | As above: a refusal at install time for every sibling minor, where the run-time check already refuses what it cannot read. |

## Consequences

- More minors, fewer patches: most rounds of work change a finding somewhere,
  and each such round ends in a minor.
- A repository can take `^0.x` without reading every release, and reads the
  *Changed* section of each minor, which says what to do.
- Each tool's next release rewrites its CHANGELOG's opening paragraph and
  links here.
- Revisit when a tool meets the 1.0 criteria, or when a tool's users ask for
  a support window before then.
