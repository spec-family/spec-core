# Changelog

All notable changes to this library. It is not published; each tool that
copies a module names the spec-core commit in its own changelog.

## Unreleased

### Added

- **`findClaims` in `markdown`: the list items that open with a label of a
  vocabulary the caller names**, `` - `Implemented`: ``, each with its label,
  every label its own text writes, and the item, whose range holds what is
  written under it. For spec-guard, which holds a claim to its evidence, and
  spec-graph, which holds a checklist or a ledger to the claims it cites
  (ADR-0004, amended 2026-11-07). Nothing that reads the scan changes.

- **`findCommitReferences` in `markdown`: the commits a document names**,
  `commit "Refuse a refund over its capture"` or `commit 1a2b3c4`, each with
  its kind, its subject or hash and its offsets. Marked, never guessed: the
  word, then a quoted subject or a hash of 7 to 40 digits on its line, and
  never in code, a comment or front matter. For spec-graph, which holds a
  register row and a checklist item to the commits they name (ADR-0004,
  amended 2026-11-07). Nothing that reads the scan changes.

- **`bindToItems`, `findItemIds` and `findRegisterRows` in `markdown`: what
  a comment annotates, the name a `@spec-item` gives an item, and a
  register's rows by key and status**, as spec-graph read them, for
  spec-brief, which names the claims a round raises and the rows it waits on
  by them, and for spec-graph, which reads through them next (ADR-0004,
  amended 2026-11-08). Nothing that reads the scan changes.

### Changed

- **The mutation sweep again runs first the test file that failed when the
  worker last ran it, as it did on vitest 4.** Vitest 5's cache, which the
  order in `vitest.mutation.config.ts` read, keeps a failure from a run
  narrowed by a test name pattern, or stopped at its first failure, until a
  run of the whole file passes, and shares it between Stryker's workers, so
  a file that killed one mutant ran first for every mutant after it. Main's
  sweeps on vitest 5 had a killed mutant run 10.46 to 11.18 tests before its
  kill, where those on vitest 4 had 6.89 to 7.91, and
  `src/markdown/scan.ts` 213 `i <= frontLines`, killed by its sixth test on
  vitest 4, timed out or stopped its worker. The order keeps its own record
  of each file's verdict now, by a reporter, `lastRun`, in the same file:
  the sweep of it read 9.58, and the mutants that are not static 4.91, as on
  vitest 4, with `scan.ts` 213 killed by its sixth test again; a second
  sweep read 10.03. The times stay the cache's: a record of each run's time
  as well, as vitest 4 kept them, read 9.60 (ADR-0007 and ADR-0008, amended
  2026-11-09). No module changes, and no file's hash.
  Upgrading: nothing for a tool's user. A tool takes the record with its
  move to vitest 5, in each configuration file that copies `QuickestFirst`.

- **`links.ts` and `scan.ts` in `markdown` and `lines.ts` in `text` change
  in their text and not in what they answer.** The lines whose mutants a
  sweep told apart only by its clock are written again, or marked for the
  sweep to leave out where every way of writing them makes an equivalent
  mutant (ADR-0007, amended 2026-11-08), and the header of `links.ts` says
  what a paragraph's end is where the text has no final line ending. Each
  of the three files has a new hash: a tool copies them at its next change,
  and its vendor test, which holds the copy it has, does not break.
  Upgrading: nothing to change.

- **The family lives in the spec-family organization, and its packages are
  `@spec-family/<name>`.** The five repositories moved on 2026-10-26 from
  DescentVTT to spec-family under the names they had, and the tools are
  published as `@spec-family/<name>`, their versions continuing: spec-brief
  0.12.0, spec-graph 0.21.0, spec-guard 0.30.0 and spec-harness 0.22.0 are
  the first under the new names. The `@descent-vtt` packages are
  deprecated, and no release under the new scope looks for one. The
  README, the guides and every link here name the new organization and
  scope; ADR-0005 records the move, and ADR-0009's user outside the family
  is outside spec-family.
  Upgrading: for each tool a project has,
  `npm uninstall @descent-vtt/<name>` and
  `npm install --save-dev @spec-family/<name>`; then `@spec-family/` in
  place of `@descent-vtt/` in every command, CI job and MCP configuration
  copied from the guides.

### Security

- **Every command in the guides gives `npx` the package's full name.** The
  adopting guide and the tutorial gave it a tool's command name alone: behind
  `--no-install` in the CI jobs, and with nothing in front in the quick start
  and in each of the tutorial's commands. Without the `@descent-vtt` scope
  those names are not the family's on npm: `spec-harness` is another
  publisher's package, and `spec-brief`, `spec-graph`, `spec-guard` and
  `spec-core` belonged to nobody on 2026-10-07. In a tree without the
  install - a fresh clone, a linked worktree before `npm ci`, a CI job
  without the install step - `npx` given the bare name fetches that package
  and runs it, unasked when no terminal is attached. `--no-install` stops
  the download, and still runs a copy an earlier fetch left in npm's cache
  and reports the other publisher's package as the one missing (npm 10.9.9,
  11.20.0 and 12.2.0, measured with a made-up name). The guides now write
  `npx --no-install @descent-vtt/<name>`, which runs the project's install
  or stops with an error that names this package, and
  [Names](docs/adopting.md#names) says why. ADR-0005 makes it the family's
  rule, and `tests/names.test.ts` holds every document, workflow, script and
  source file here to it.
  Upgrading: in a job or a script copied from the guide, write
  `@descent-vtt/` in front of the tool's name. If a bare name was ever run
  through `npx` on a machine, in a tree where the tool was not installed,
  empty npm's cache of fetched commands there: the `_npx` directory below
  the path `npm config get cache` prints.

### Documentation

- The overview no longer ties spec-guard to ADRs. It holds code to the
  rules any Markdown states - a specification, an ADR, a README, an agent's
  instructions - and the table of documents, the table of problems and the
  paragraph on installing one tool say so, as do the adopting guide's first
  table and the glossary's assertion.
- **An overview of the family, `docs/overview.md`, for a reader who has
  never met it**: the problem first, one sentence for the family, the eight
  kinds of document the tools keep true with the tool and the rule for each,
  which problem each tool answers, the neighbours (Spec Kit, OpenSpec,
  Archgate, Mneme, adrkit, DocGuard, ctxgrd, Trailbun, spec-gates,
  dependency-cruiser and import-linter) as each project's own repository or
  documentation described itself on 2026-11-09, with the link, and what the
  tools do not do: the guard before a write works under Claude Code alone, a
  write through a shell passes it, and a ruling proves the agent did not sign
  it, not that two people reviewed. Each figure about the family links to
  where it is measured: the registry's manifests, and the mutation sweeps of
  main on 2026-11-09. The README and the adopting guide link to it.
- The concepts guide defines the words the tools' claims and evidence brought
  in, each as the tools read it and with a link to the reference page that
  owns it: `raises` and `awaits`, label and baseline, and, in a new section,
  lifecycle, record, obligation, checklist, ledger, register, protocol,
  figure, commit reference, orientation document and directive. No heading
  or anchor that was there moves.
- ADR-0005 says where a tool's documentation lives: its README is a front
  page, and its full reference is in its repository's `docs/reference/`,
  published in its package and linked relatively, while the guides that
  span the tools stay here. The two clauses that sent a reader to a tool's
  README for its severities and its status keys name its reference
  documents.
- The tutorial is recorded again, at spec-brief 0.13.0, spec-graph 0.24.0,
  spec-guard 0.33.0 and spec-harness 0.24.0, where it named 0.3.0, 0.10.0,
  0.17.0 and 0.7.0, and closes with one claim followed through spec-guard
  `claims`, spec-graph `diff` and spec-brief's `raises` and `awaits`. The
  Tutorial workflow replays every step against the releases the tutorial
  names on each change, and fails where an output reads otherwise
  (`scripts/tutorial.mjs`); each Monday it replays against npm's latest
  releases, and warns of what moved without failing. The concepts guide
  says what a claim is, and its links into spec-brief and spec-harness name
  the reference pages their READMEs moved those sections to.
- The adopting guide's CI jobs give every check `--format github` or
  `--format gitlab`: spec-graph `check` has written `github` since 0.10.0,
  where the guide said it wrote none and uploaded its SARIF, and
  `spec-harness premises` has written both since 0.7.0, where the guide
  gave it its exit code and log alone. Code scanning is an option beside
  them, with the upload pinned at spec-guard's v4.39.1. The jobs name Node
  26, the Active LTS since 28 October 2026. `doctor` in CI is described as
  spec-harness 0.24.0 has it: the base is read as `origin/main` where the
  checkout has no `main`, so the step that made the branch is for 0.23 and
  earlier, and no plugin is required on a runner.
- The adopting guide lists what exit `2` covers as ADR-0005 has it since
  2026-10-08, an error a tool did not expect and an output its reader closed
  among them, and says why its GitLab job lets exit `1` through and never
  `2`. ADR-0005 records the one line each tool prints for a closed output.
- ADR-0005 states the family's rule for an input that is set and names
  nothing - an empty `--root`, a list of separators alone, a number outside
  what an option documents, a variable of a tool's own that it cannot use:
  exit `2` and a line that names it, never a run as if it had not been
  given. It says which variables stay lenient, as conventions other programs
  set, and how the tools read those one way: `NO_COLOR` off and over
  `FORCE_COLOR`, `FORCE_COLOR=0` off and any other value on, `TERM=dumb` off
  unless colour is forced, and `CI` not read for colour. The adopting guide
  lists the refusal under exit `2`.
- ADR-0009 promises, from each tool's first release after round 27, two
  consecutive minors with its JSON fields and exit codes unchanged, and from
  then on a new rule first as a warning or behind an option; and the user its
  1.0 asks for is someone other than the tools' author, in any organization.
  Each tool's release can say both.
- The concepts guide says what a ruling proves, that the agent did not sign
  it, and what it does not: it is not two-person review or separation of
  duties, and nothing checks that the signer is not the brief's author.

### Changed since ffe9b8a

What the tools that copied ffe9b8a - all four - see when they copy again.

- `scripts/vendor.mjs` names the copy's source
  `https://github.com/spec-family/spec-core`, in `VENDOR.json` and in the
  README it writes beside the copies, where it named the repository's
  address under DescentVTT. No module changes with it, and no file's hash:
  `VENDOR.json` holds the hashes of the modules' files, and not of itself
  or of the README.
  Upgrading: a tool's `tests/vendor.test.ts` that holds `source` expects the
  new address.

### Changed since 7e41240

What the tools that copied 7e41240 - all four - see when they copy again.

- `pattern`: a leading `./` goes with the slashes after it, as POSIX reads
  them, so `.//docs` is `docs` in every dialect, inside braces too: it was
  `/docs`, rooted at the filesystem's root in `path` and `ripgrep` and
  anchored at the repository root in `gitignore`, and `./{/docs,x}` rooted
  `/docs` the same way. `.//./` is refused as `./` is (ADR-0003).
  Upgrading: a test that pins `.//docs` as rooted changes; the tool's
  changelog says that `.//docs` now reads as `./docs`.
- `markdown`: `renderScalar` writes a value plain when it starts with a
  letter of any script, so a status written back as `封存` is `封存`, no
  longer `"封存"`. A value with `: ` or ` #`, a space at either end,
  full-width punctuation, or a digit or a mark first is still quoted
  (ADR-0004).
  Upgrading: nothing to change; a test that pins the quoted form of such a
  value changes.
- `markdown`: front matter reads a key of any script - a letter or `_`
  first, then letters, marks, digits and `_.-` - so `título: Caché` is the
  entry `título`, where it was the problem `not a "key: value" line` and no
  entry. A digit or a mark first, a space, punctuation and a full-width
  colon are still no key (ADR-0004).
  Upgrading: such a line is an entry now, not a problem a tool reports; a
  test that pinned the problem changes.

### Added since 7e41240

- `pattern`: `rebaseGlob(entry, directory, options)` rewrites a list entry
  typed in a directory below the root to read from the root, each brace
  alternative on its own: `{/docs,x}` typed in `sub` is `{/docs,sub/x}`, a
  `!` stays in front, and a `..` that climbs above the root is refused
  (ADR-0003).
- `pattern`: `globAlternatives(source, options)` gives the alternatives a
  pattern's braces give, each rooted or not as `parseGlob` reads it and
  its text without the `./` and slashes it starts with, so a tool that
  reads alternatives one by one - spec-brief refusing a rooted one,
  spec-guard anchoring one and handing each to ripgrep - no longer expands
  braces or reads a leading `./` and `/` itself (ADR-0003).
- `text`: `displayWidth(text)` gives the columns a string takes in a
  terminal, per grapheme cluster: an East Asian Wide or Fullwidth character
  or an emoji sequence two, a mark, a joiner, a format or a control
  character none, anything else one, with Unicode 16.0's widths. A tool
  lines up a table's columns with it (ADR-0002).

### Changed since 56c7e54

What the tools that copied 56c7e54 - all four - see when they copy again.

- `pattern`: a leading `/` on a brace alternative means what it means on
  the pattern written alone, so `{/docs,x}` is `/docs` or `x`. In the
  `path` dialect `{/docs,x}` matched `docs` and what is beneath it, asked a
  `literal` function about `docs` and named the base `''`; it now matches
  `/docs` and what is beneath it, rooted at the filesystem's root, which no
  relative path is under, asks about `/docs`, and names the base `/`. In the
  `ripgrep` dialect it matched a `docs` at any depth and now matches only
  the whole path `/docs`. In `gitignore` it excluded every `docs` directory
  and now only the one at the root, as `/docs` does. `{//docs,x}`,
  `{/./docs,x}`, `{.//docs,x}` and `{a,/b}c` read the same way, as
  `//docs`, `/./docs`, `.//docs` and `/bc` do. `/{docs,x}`, `{docs,x}`,
  `{a/,b}` and `a/{/b,c}` - `a/b` or `a/c`, as `a//b` is `a/b` - read as
  they did, and `{/,a}` is refused as it was (ADR-0003).

### Changed since f9ce375

What the tools that copied f9ce375 - all four - see when they copy again.

- `pattern`: a brace alternative that names no path is refused in every
  dialect, as the same text written alone is, and the refusal names the
  alternative as the braces expanded it. In the `path` and `ripgrep`
  dialects `{./,a}` matched every path, its `./` read since f9ce375 as the
  contents of `.`, where `./` alone is refused; it is now
  `the braces expand to "./", which names no path`, and so are `{./}`,
  `{.,a}/` and `.{/,a}`. `gitignore` refused those already. Patterns every
  dialect refused as `the pattern names no path` are refused naming the
  alternative: `{.,a}` as `the braces expand to ".", which names no path`,
  `{/,a}` and `{//,a}` as `"/"` and `"//"`, and in `gitignore` `{./,a}` as
  `"./"`; `{,a}`, `{a,}` and `{}` as
  `the braces expand to an empty pattern`. A pattern without braces is
  refused in the words it was, and `a{,.ts}`, `src/{./,a}`, `{./a,b}` and
  `{a/,b}` read as they did (ADR-0003).
- `pattern`: `/./` and `/.//` are refused as `/.` is,
  `the pattern names no path`, where the `path` and `ripgrep` dialects read
  them as the root's contents, every rooted path. `gitignore` refused them
  already (ADR-0003).

### Changed since 65ef842

What the tools that copied 65ef842 - all four - see when they copy again.

- `pattern`: a trailing `/` on a brace alternative means that directory's
  contents, as one on the whole pattern does. In the `path` dialect
  `{src/,lib}` matches `src/a.ts` and not `src`, where it matched `src`
  itself as a literal, read by `literal` as a file, a directory or either;
  `src` is no longer passed to a `literal` function, and the alternative's
  base is `src` where it was `''`. In the `ripgrep` dialect the alternative
  is matched against the whole path, as `src/` is: `{src/,*.md}` matches
  `src/deep/a.ts` and no longer `lib/src`. The `gitignore` dialect reads it
  as before, the directory and everything in it (ADR-0003).
- `pattern`: a pattern that compiles to more than `MAX_STATES` states is a
  refusal, as its documentation always said. `parseGlob` returns
  `{ ok: false, error: 'the pattern compiles to more than 65536 states' }`
  and `parseGlobList` names the entry, `"<pattern>": the pattern compiles
  to more than 65536 states`, where both threw `AutomatonTooLarge`;
  `compileGlob` throws a `GlobError`, `invalid glob "<pattern>": the
  pattern compiles to more than 65536 states`, where it threw
  `AutomatonTooLarge`. The message is the one `AutomatonTooLarge` carried.
  No function the module exports throws `AutomatonTooLarge` any more, and
  a caller that caught it - spec-brief's `parseGlob` does - catches nothing;
  the class stays exported, so that catch still compiles. What a `literal`
  function throws still passes through both (ADR-0003).

### Changed since 119345e

What the tools that copied 119345e see when they copy again.

- `markdown`: a link reference definition cannot interrupt a paragraph, as
  CommonMark has it. `[r]: r.md` on the line under a paragraph's text, a
  lazy continuation line in a block quote or a list item included, is that
  text: it is no longer listed, no reference link is read through it, and
  its brackets are the paragraph's. A definition is still read at the start
  of the document, after a blank line, a heading, a thematic break, code,
  front matter or an HTML block a comment opens, in a block quote opened on
  its line, and under another definition (ADR-0004).
- `markdown`: a definition's label holds no unescaped bracket and at most
  999 characters, as CommonMark's link label does. `[[r]: r.md](z.md)` is a
  link to `z.md` with the text `[r]: r.md`, where it was a definition of
  `r.md](z.md)`, and a label of 1000 characters defines nothing. A label
  with an escaped `]`, `[a\]b]: x`, is now read (ADR-0004).
- `markdown`: a second bracket holding a bracket or more than 999 characters
  is no label, and the bracket before it is read as a shortcut: with `[r]`
  defined, `[r][a[b]c]` gives `r`'s destination and then reads `[b]`, where
  it gave nothing for `[r]` (ADR-0004).

### Changed since 8840d36

What the tools that copied 8840d36 see when they copy again.

- `markdown`: a link inside a link's text is the link, and the brackets
  around it and what follows them are text, as CommonMark reads it:
  `[a [b](inner.md) c](outer.md)` gives `inner.md`, and no longer
  `outer.md`, at any depth and in every bracket form - with `[ref]` defined,
  `[a [ref] c](x.md)` gives the shortcut alone. A link in an image's alt text
  leaves the image an image, and a link may still hold an image (ADR-0004).
- `markdown`: `MarkdownScan.unclosedFrontMatter` gives the kind, line and
  offsets of front matter opened on the first line and never closed, which
  the scan reads as no front matter, so a tool can say so. The rest of the
  document is read as before (ADR-0004).
- `markdown`: `Block.tag` names an HTML block's element, lowercased -
  `script`, `pre`, `style` or `textarea` - and is `null` for code (ADR-0004).
- Both fields are new and every other field is as it was; a caller that
  builds a `Block` or a `MarkdownScan` itself, as a test double might, adds
  them.
- `pattern`: `**` inside a name is refused with advice written from the
  pattern: `docs/**.md` is told `docs/**/*.md` for any depth or `docs/*.md`
  for one level, `src/a**` `src/a*/**` or `src/a*`, where every such pattern
  was told `docs/**/*.md` or `*.md`. The message's first clause is as it was
  (ADR-0003).

### Changed since cbe2223

What the tools that copied cbe2223 see when they copy again.

- `markdown`: an image inside a link's text is read, after the link - a badge
  wrapped in a link, `[![build](badge.svg)](actions)`, gives both
  destinations, where the image went unread (ADR-0004).
- `markdown`: links, list items and the `directives` mask are made the
  first time each is read. A caller reading none of them - spec-guard's
  query - scans 28% faster; every answer is identical (ADR-0004).

### Added

- `path`: repository paths that refuse to leave the repository, POSIX
  arithmetic independent of the host, link destinations.
- `text`: line tables for LF, CRLF and CR; offset-preserving masks.
- `pattern`: globs in three named dialects (`path`, `ripgrep`, `gitignore`)
  compiled to one non-backtracking automaton; `globWitness` (a shortest path
  every scope matches and no protected scope does, or a proof there is none);
  `globCovers`; `parseGlobList` with `!` entries; the regex matcher from
  spec-graph as `compileRegex`. `**` inside a name is refused rather than
  read one of the three ways the tools read it (ADR-0003).
- `markdown`: one pass exact about code and comments per CommonMark, three
  masks, headings, list items, links, tables, front matter.
- `jsonrpc`: MCP over JSON-RPC 2.0 for both protocol eras, with tools,
  resources and prompts, and line framing with cancellation.
- `scripts/vendor.mjs`: copy modules into a tool with a SHA-256 per file, and
  check a tool's copy.
- The mutation gate: `break` at 94, under the first two full sweeps (95.37%
  at cbe2223, 94.89% at 8840d36). Tests pin what the second sweep found
  unpinned - list item columns, the items a marker leaves open, images in a
  link's text, the JSON-RPC error codes and `_meta` keys - and the
  equivalent mutants carry comments (ADR-0007).
