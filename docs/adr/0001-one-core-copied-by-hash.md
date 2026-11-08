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

**One repository, five modules, each copied byte for byte into the tools that
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
