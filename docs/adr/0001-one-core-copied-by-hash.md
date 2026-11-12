---
status: accepted
date: 2026-09-26
---

# ADR-0001: One core, copied into each tool and verified by hash

## Context

spec-brief, spec-graph and spec-guard each wrote their own Markdown scanner and
their own glob engine, about 4,800 lines between them, and by 2026-09-24 the
three copies disagreed in ways a user could see:

| pattern | path | spec-brief | spec-graph | spec-guard `glob=` | spec-guard `exclude=` |
| --- | --- | :---: | :---: | :---: | :---: |
| `src` | `src/a.ts` | match | match | no match | match |
| `*.ts` | `src/a.ts` | no match | no match | match | match |
| `src/**` | `SRC/A.ts` (Windows) | no match | match | no match | no match |
| `tests` | `packages/x/tests/a.ts` | no match | no match | no match | match |

Some of those differences are dialects on purpose (`exclude=` reads like
`.gitignore`). Others were defects: spec-guard compiled globs to `RegExp` and
took 28 seconds on `*-*-*-*-*-*x` against a 121-character name; spec-graph
read a heading inside an HTML comment; spec-guard opened a fence on
```` ```js`x ````. Each tool had fixed some of these for itself and not for the
others.

Every tool also promises zero runtime dependencies, and each holds that promise
with a test that `dependencies` is empty and every import is relative or
`node:`. Sharing code must not break it.

## Decision

**One repository, five modules (seven since 2026-11-12), each copied byte for byte into the tools that
use it, and each copy verified by hash.**

```text
path      POSIX paths; repository paths that refuse to leave the repository
text      line tables, offsets, offset-preserving masks
pattern   glob dialects, a non-backtracking automaton, witnesses; the regex matcher
markdown  code, comments, headings, lists, links, tables, front matter
jsonrpc   MCP over JSON-RPC 2.0, both protocol eras, line framing
```

- **Dependencies between modules are declared in `modules.json`** and held by
  `tests/boundaries.test.ts`: `pattern` may use `path`, `markdown` may use
  `text`, nothing else crosses. A module copied on its own brings exactly what
  it needs.
- **No module imports anything outside the library, `node:` included.**
  Everything here is a pure function of its arguments; the disk, git and the
  process stay in each tool's edge modules, where they are today. Directory
  walking in particular stays in the tools: spec-brief skips 11 directories,
  spec-graph 17, spec-guard deliberately 4, and each has its reason.
- **Copied, not depended on.** `scripts/vendor.mjs --into <tool> --modules …`
  copies the sources into `src/vendor/spec-core/` and writes `VENDOR.json`
  with the commit and the SHA-256 of every file, and spec-core's `LICENSE`,
  which each tool lists in its package `files`: its `dist` carries the
  compiled copies, so it ships their notice. Each tool adds one test that
  recomputes the hashes. The tools keep `dependencies: {}` and keep their
  relative-imports test; nothing new enters their toolchains; and every change
  to the core arrives in a tool as a diff someone reviews.
- **Not published.** `private: true`. The export map already names each module
  as a subpath (`@spec-family/spec-core/pattern`), so publishing later changes
  no import in any tool. The likeliest reason to publish is `pattern` on its
  own: no matcher on npm decides whether two globs can name the same file.
- **Mutation testing of a copy happens here, not in the tool.** Each tool
  excludes `src/vendor/**` from its own Stryker and coverage configuration; the
  core's sweep is the measurement, and a tool's score is not diluted or padded
  by code it does not own.

*Amended 2026-11-12*: **two modules more, `color` and `report`, and `text`'s
line table as the one every tool counts by.** Round 29's evaluation of the
four tools found the same decisions written in each, and drifting:

```text
color     whether a report draws colour, and its marks in ASCII
report    GitHub's workflow commands, GitLab Code Quality, a SARIF log
```

- **`color`** decides from what the caller read of the process - its
  environment, whether the stream is a terminal, the platform, the tool's
  own variable for ASCII - and what its command line asked, as ADR-0005
  writes the rules. spec-brief (`src/cli.ts` `useColor`), spec-graph
  (`src/report.ts`) and spec-guard (`src/reporter.ts`) each wrote it, and on
  their mains of 2026-11-12 the three answered alike for every one of 5,400
  combinations of `NO_COLOR`, `FORCE_COLOR`, `TERM`, `CI`, a terminal and an
  option (`tests/color.test.ts`). They differed only in where the option is
  read: spec-brief and spec-guard inside the function, spec-graph in its
  caller; and spec-graph and spec-guard read the platform from `process` for
  the marks, which here is the caller's to pass. spec-harness draws no
  colour.
- **`report`** builds what a tool writes and leaves the writing to it. The
  four tools escaped a workflow command alike, in four copies; they wrote
  its title three ways (`spec-brief <rule>` and `spec-harness <rule>`, the
  bare rule in spec-guard, and spec-graph's `(strict)` after a rule only
  `--strict` made an error), which each tool keeps by passing its title; and
  none wrote a column, which `githubCommand` writes where it is given. The
  hint follows the message in each, and spec-harness alone drops a
  message's own full stop first, which `findingText` does. GitLab's
  fingerprint is a hash of the identity in all four, written two ways - a
  JSON array with the occurrence from 2 in spec-brief and spec-graph, parts
  joined by U+0000 with the count before from 1 in spec-guard and
  spec-harness - and `fingerprintKeys` writes either, since a change of way
  reopens every issue once; the hash is the caller's, because nothing here
  imports `node:crypto`. The SARIF logs shared a frame and differed in their
  parts (columns and related places only in spec-graph, `%SRCROOT%` only in
  spec-brief and spec-harness, no fingerprint in spec-brief), and `sarifLog`
  takes each part where it is given and writes `semanticVersion` beside
  `version`. `tests/report.test.ts` holds each tool's writer, cut to what it
  builds from a finding, against what the module builds from the same.
- **`text`** counts `\n`, `\r\n` and a lone `\r` as a line's end, as
  CommonMark does, and that is the count every tool reports lines by.
  spec-guard kept its own `lineStarts`, `locate` and `maskRanges`, which end
  a line at `\n` alone: on a document with a lone `\r` it put a finding on
  line 9 where spec-graph put it on line 12. `tests/text-guard.test.ts`
  pins the three ways the two differ, over every text of up to seven
  characters of `a`, `\n` and `\r`: a lone `\r` before another character
  ends a line here and not there; after a final `\n` spec-guard opens an
  empty line, which `locate` reaches at the text's end; and its mask blanks
  a `\r`, which this keeps.

Each tool moves to these after its round-29 session has finished, in a
release of its own that keeps what its user sees, and names the spec-core
commit in its CHANGELOG. spec-guard's move to `text` changes the line of a
finding in a document with a lone `\r`, which its CHANGELOG says.

## Alternatives

| Option | Why not |
| --- | --- |
| A runtime dependency on `@spec-family/spec-core` | Breaks every tool's ADR-0001, adds a package to every install and a version to coordinate across four releases. |
| Bundle at build time | A bundler as a devDependency in every tool, source maps through it, and a published tarball whose code no longer matches the repository's files. |
| A monorepo | Four repositories' history, CI and release pipelines moved for a benefit the copy already gives. |
| Keep three copies | They have already drifted. |

## Consequences

- A defect here is a defect in every tool that copies the module. The answer is
  the strictest verification in the family (ADR-0007): an oracle, brute force,
  differential tests against the code each module replaced, and the highest
  mutation gate.
- An update is one PR per tool. That is the cost, and it is also the review.
- The copies are identical on disk, so `.gitattributes` forces LF here and the
  tools must do the same (all three already do).
- Revisit when a second maintainer owns one module, when a module gains users
  outside the family, or when the copy step causes friction a hash does not
  catch.
