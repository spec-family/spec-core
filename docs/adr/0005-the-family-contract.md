---
status: accepted
date: 2026-09-26
---

# ADR-0005: The family contract

## Context

Five tools (ADR-0006) are used together by people and by agents, and read
each other's output. What they share was, until now, a set of values each
repository wrote down for itself: no runtime dependencies, exit codes that
separate "found something" from "cannot tell", false positives costing more
than misses. Where the values were written slightly differently, the tools
drifted - a status word one tool suspended and another enforced, a glob one
tool matched and another did not. This records the contract once, where every
tool's CLAUDE.md can point.

## Decision

### Runs

- **Exit codes.** `0` the run was clean. `1` it found something, or refused
  an action. `2` its result cannot be trusted: a configuration that did not
  load, an unknown key, a directory that does not exist, a question it could
  not decide. A tool never falls back to defaults and reports clean.

  *Amended 2026-10-08*: **an error a tool did not expect is `2`.** A run
  that ends on an error none of the tool's code names - a defect, a stream
  that refused a write, a value it never checked - has a result that cannot
  be trusted, and the tool says so itself: `<tool>: unexpected error:` and
  the stack on stderr, so that a report of it can be acted on, nothing on
  stdout for it, where a script reads a document, and exit `2`. Left to
  Node, an uncaught error is the stack and exit `1`, which this line reads
  as "it found something", and a pipeline that lets `1` through while a tool
  is adopted ([Adopting](../adopting.md#ci)) let the crash through with it.
  Measured on 2026-10-08 with a stdout that throws: spec-graph 0.12.1,
  spec-guard 0.19.1 and spec-harness 0.10.1 exited `1` from `--version`,
  `--help` and each command tried, and spec-brief 0.5.1, which caught such
  an error inside a command, from `--version`, `--help` and what it does
  before a command starts.

  The error is caught in the command line's entry point, which is given its
  streams, so a test holds it in process. What nothing awaits - a stream's
  `error` event, such as a pipe its reader closed, a timer's callback in a
  session that stays open - never reaches that function, and the launcher,
  which owns the process, answers it the same way. A hook is no exception:
  `2` is what makes an agent's host hold the write spec-harness's guard
  could not check. A command that stays open answers the failure of one
  request or one run as its own ADR says, and ends this way only when the
  command itself cannot go on. Each tool names, in its CHANGELOG, the
  release that first exits `2` for it.

  *Amended again 2026-10-08*: **an exit `2` a tool could foresee says so in
  a line.** `unexpected error:` and a stack are for an error none of the
  tool's code names, so that a report of a defect can be acted on. A reader
  that closes a tool's output is no defect: `| head` does it every day, and
  the stack sent a person looking for one. Measured on 2026-10-08 through
  each launcher (Windows 11, Node 24.18.1), with stdout closed before the
  run wrote to it: spec-brief 0.6.0, spec-graph 0.13.0, spec-guard 0.20.0
  and spec-harness 0.11.0 each printed
  `<tool>: unexpected error: Error: EPIPE: broken pipe, write` and its
  stack, from `--version`, `--help` and every command tried, from
  spec-guard's watch session and from both MCP servers. Each now prints
  one line and no stack,

      <tool>: stdout was closed before all of the output was written

  and exits `2` as before: the answer did not arrive, and the part of a
  document a script was handed is not the document. The exit code is not
  `0`, which would say the answer was given, nor `1`, which is a finding.

  The failed write is `EPIPE`: Node ignores the signal a closed pipe sends
  on Linux and macOS, and reports the error instead. Its own streams never
  throw it where it is awaited. They report it as an `error` event, which
  only the launcher can answer, in every case measured on Windows and in
  each tool's tests of its launcher on Linux and macOS, behind a shell's
  pipe as behind a parent process's. The entry point answers in the same
  words where a caller's own stream does throw it. The error is read by its
  code, which is enough while a tool writes to no pipe but stdout and
  stderr; one that comes to write to another, a child's input, must tell
  them apart before it says "stdout". When stderr is the stream that closed
  there is nowhere left to say anything: nothing is written, to stdout
  either, and the exit is still `2`. A write that fails for any other
  reason, a full disk, keeps `unexpected error:` and its stack. An output
  smaller than the pipe is written whole before its reader leaves, and that
  run ends as it would have.

  The same goes for an error a tool raises itself with a message written
  for a person, such as a git command that failed or a value in the
  environment no date can be made of: it is that message on one line,
  `<tool>: <message>`, and exit `2`. The stack is kept for what nothing
  named. Each tool lists, in its CHANGELOG, what it now says in a line.

  *Amended 2026-10-09*: **an input that is set and names nothing is
  refused.** "Never falls back to defaults and reports clean" was written
  of a configuration. An option or a variable given a value that names
  nothing fell back the same way: read as if it had not been given, the run
  answered a question nobody had put, and exited `0`. Measured on the
  releases of 2026-10-09, by each tool's pull request below: spec-brief
  0.6.1 took a `SOURCE_DATE_EPOCH` of `tomorrow` for no value and wrote the
  clock's date, and `new --id ""` wrote a file no command reads again;
  spec-graph 0.13.1 read `--family ""` as no family and reported a dangling
  citation clean; spec-guard 0.20.1 read `--spec ""` as the root and ran
  every spec under it, `--root ""` as the working directory,
  `--strict=false` as `--strict`, a root that was not there as a clean
  `cites`, and `--engine rg` with a program that is not ripgrep as a run on
  its other engine. A value that names nothing is most often a variable
  that was not set where the command was written, `--root "$DIR"`, and the
  pipeline that wrote it is the one that cannot see the difference.

  Each is exit `2` and one line that names the option or the variable, what
  it holds and what to do:

  - an option that takes a value, given an empty one - whitespace alone
    too, where the value is a name, an id, a path, a pattern or a number -
    unless emptiness means something for that option and its documentation
    says so, as spec-guard's `--exclude=` clears a list;
  - an argument a command does not take, and a value given to an option
    that takes none;
  - a path that is not what the option needs: a root that is a file or is
    not there, a configuration that is a directory;
  - a list that names nothing, `","`;
  - a number outside what the option documents;
  - a tool's own environment variable set to something the tool cannot
    use, refused by the run that reads it: a run that never reads the
    variable is not stopped by it.

  Asked for and not delivered is a refusal as well: a run told to use one
  engine, one file or one date does not answer with another. A variable of
  the family's own that turns something on is off for `0`, `false` and
  empty, and is documented where its option is.

  What is not the family's own stays lenient. `NO_COLOR`, `FORCE_COLOR`,
  `CI`, `TERM` and the terminal's own variables are conventions that other
  programs set, and a value a tool does not know is no reason to stop a
  run. The tools read them one way all the same:

  - `NO_COLOR` set to anything turns colour off, as its specification has
    it, and wins over `FORCE_COLOR`;
  - `FORCE_COLOR=0` turns colour off, on a terminal too, and any other
    value forces it on;
  - either of the two set to nothing is as unset;
  - `TERM=dumb` turns colour off unless colour is forced. It is the
    terminal saying it draws none, Node answers it the same way
    (`getColorDepth({ TERM: 'dumb' })` is 1 on 24.18.1, and 4 with
    `FORCE_COLOR=1` beside it), and escapes written to such a terminal are
    wrong;
  - `CI` decides nothing about colour.

  Where a tool differed it is brought to this, and none is brought down
  to another: spec-guard read `FORCE_COLOR=0` as only declining to force
  colour, spec-graph alone turned colour off for `CI`, and spec-graph
  alone read `TERM=dumb`, which spec-brief and spec-guard are to read as
  it does. Each tool names, in its CHANGELOG, the release that first
  reads them so.

  Each refusal is input refused that was accepted, a minor release
  ([ADR-0009](0009-versions-before-1-0.md)), listed under **Changed** with
  what to do on upgrading. The tools' pull requests:
  spec-family/spec-brief#50 for `SOURCE_DATE_EPOCH`, and from a branch named
  `fix/an-input-that-names-nothing-is-refused` in each,
  spec-family/spec-brief#51, spec-family/spec-guard#45 and
  spec-family/spec-graph#77. Each tool names, in its CHANGELOG, the release
  that first refuses.

  *Amended 2026-10-11*: three readings of that rule, from the releases
  that followed it.

  **A pattern among several that matches no file is refused.** A list that
  names nothing was refused; a list one of whose entries names nothing was
  read as the rest. spec-guard 0.21.0, given `docs/**/*.md` beside the
  pattern of a directory since renamed, ran the rules under `docs` and
  reported that every assertion held: the rules of the other directory had
  stopped running, and nothing said so. From 0.22.0 a run, `prove`,
  `impact` and `query` refuse each such pattern by name, exit `2`;
  `--allow-empty` lets a run, `prove` and `impact` through, and the pattern
  is still named; a session that waits for files, `--watch` and the
  server, carries on and says which pattern it is; and a document a script
  reads carries the patterns (spec-family/spec-guard#48). spec-graph says a
  `--family` that has no document, beside ones that have, with a note, and
  goes on; spec-guard's `cites` reads a pattern that matches nothing as it
  did. Whether those two refuse is not decided here.

  **An option is refused where taking it would say what is not so.**
  `init --strict` tells its reader that something was strict, and
  `init --config team.json` that a configuration was written there; each
  ran as the line without it does, and each is refused, as an option that
  means nothing to a command is in the other three tools. An option that
  asks a command to leave out what it never does asks for what is already
  so, and is taken: `--no-color` by a command that prints none, and by
  spec-brief's `init` `--no-git` and `--no-config`, since it asks git
  nothing and opens no configuration. A script passes such an option to
  every command it runs. Two things of which one would go unread are
  refused together: `--config` beside `--no-config`, and an argument beside
  the option that names the same thing (spec-family/spec-brief#55,
  spec-family/spec-harness#80).

  **`FORCE_COLOR=false` is off.** The list above had `FORCE_COLOR=0` off
  and any other value on, and `false` forced colour in spec-brief,
  spec-graph and spec-guard, into a pipe too. It is off for exactly `0` and
  exactly `false`, on a terminal too; empty is as unset; any other value
  forces colour (spec-family/spec-brief#55, spec-family/spec-graph#81,
  spec-family/spec-guard#48). That is not Node's reading, and is not meant
  to be. On Node 24.18.1 `getColorDepth` gives colour for `1`, `true`, `2`,
  `3` and the empty string, and none for any other value, `FALSE`, `no`
  and `yes` among them; and with `FORCE_COLOR=1` beside `NO_COLOR=1` it
  gives colour. The family keeps `NO_COLOR` first, an empty value as unset
  and a value it does not know as a request for colour, and takes from
  Node and from `supports-color` the one spelling of off that both read and
  it did not.

  *Amended again 2026-10-11*, from the releases after those:

  **`cites` names such a pattern, and a strict check fails for it.** What
  was left undecided above is decided for spec-guard's `cites`: from 0.23.0
  it names a pattern that matches no file beside others that do, on stderr
  and in the document a script reads, and under `--strict` exits `1` where
  its families are read off the specs, as it does there when no pattern
  matched at all. Each pattern is held to what the list is held to, by the
  command's own rule: where `cites` is given its families by name, no spec
  at all is no failure, and one pattern of several is named and no more
  (spec-family/spec-guard#51). spec-graph's `--family` is as it was.

  **A hook says what is wrong with its own line with `1`.** "A hook is no
  exception", above, is said of a write the guard could not check, and
  stands. What is wrong with the line that starts Claude Code's hook - a
  line it cannot read, a `--root` on it that is no directory - is one line
  on stderr and exit `1`, and holds no write. That line is in a settings
  file, and `2` from it holds every write of the session, the one that
  mends the line among them (spec-family/spec-harness#80,
  spec-family/spec-harness#84). A brief the line names that is not one is a
  write the guard cannot check, and is `2` as before.

  **`TERM` is no sign of a terminal that draws.** A tool whose report has
  marks beyond ASCII draws them on Windows where `WT_SESSION` or
  `TERM_PROGRAM` is set to something, and in ASCII otherwise; `TERM` decides
  nothing there. Git for Windows sets it for everything it starts, and the
  Cygwin and MSYS2 runtimes for every program built on them, by the version
  of Windows and not by what the output is drawn on; spec-guard's ADR-0014
  has the sources as read. spec-graph read it so already, and spec-guard
  does from 0.23.0 (spec-family/spec-guard#52). It is `TERM=dumb`, for
  colour, that the tools still read.

  *Amended 2026-10-12*, from the releases after those:

  **A list of families that mistypes one is refused, and a name before its
  first document is not.** What was left undecided of spec-graph's
  `--family` is decided, and not as a pattern is. A citation of a family
  no document here belongs to is prose to spec-graph, with a list or
  without one, so a name on the list that has no document costs the check
  nothing by itself: a family listed before its first document, and a run
  over part of a repository with the whole list, read what they would read
  with no list, and are said in a note as before. The list costs a finding
  where it also leaves out a family the documents do belong to, `RFCS`
  written for `RFC`: the same corpus is exit `1` with no list and was exit
  `0` with that one. There the check stops, exit `2`, and names both, from
  0.15.0 (spec-family/spec-graph#86). A refusal follows what an input
  costs the answer, not only that it names nothing.

  **The marks of a report are asked for one way.** `--ascii` draws the
  ASCII marks and `--no-ascii` the others, on any platform, in spec-graph
  and spec-guard; either wins over the tool's variable
  (`SPEC_GRAPH_ASCII`, `SPEC_GUARD_ASCII`: off for empty, `0` and `false`,
  and asking for ASCII only), which wins over what the terminal says of
  itself. A command that draws no mark takes `--ascii`, which is true of
  what it writes, and refuses `--no-ascii`, which is not, as each takes
  `--no-color` and refuses `--color`; the two together are refused
  (spec-family/spec-graph#85, spec-family/spec-guard#55).

  *Amended again 2026-10-12*, from the releases after those:

  **An option beside its own opposite is refused, in every tool that has
  one.** `--config` beside `--no-config` and `--ascii` beside `--no-ascii`
  are refused above, and the pairs two of the tools had before those were
  not. In spec-graph `check --color --no-color` printed without
  colour and the other order with it; in spec-guard the later of the two
  won for the colour pair and for each option a configuration can set,
  `--strict`, `--allow-missing-targets`, `--allow-empty-scope`,
  `--default-skips`, `--ignore-status` and `--include-specs`. One of the
  two went unread with no word of it, which is what the rule above
  refuses. Each pair is exit `2` and one line that names both, in either
  order, from spec-graph 0.16.0 and spec-guard 0.25.0
  (spec-family/spec-graph#89, spec-family/spec-guard#57). spec-brief refused
  its two pairs already, and spec-harness has no option with an opposite.
  The same option twice is that option once, and an opposite alone wins
  over a configuration, the environment and the terminal as before.

  *Amended 2026-10-18*, from the four tools as their mains stood on
  2026-10-18, each run through its launcher:

  **An option that takes one value is given one.** Given two that read as
  two, the later was read and the earlier went unread, with no word of it,
  in spec-brief and spec-harness: `--root nowhere --root .` ran in `.`.
  spec-graph 0.17.0 and spec-guard 0.26.0 refuse the two
  (spec-family/spec-graph#94, spec-family/spec-guard#61), and so does every
  tool: exit `2`, one line that names both. Two values are compared as each
  is read, not as it is written, so `--root .` beside `--root ./` names one
  directory, asks one thing and is taken once, as in spec-guard; spec-graph
  compared them as typed and refused it. An option that is a list stays a
  list.

  **A wrong command line is refused with `--help` or `--version` on it.**
  Each of the four refuses an option it does not know beside `--help`,
  exit `2`, so a line that is wrong in any other way is refused there too.
  spec-brief and spec-graph answered `--help` or `--version` instead of
  every refusal they made of a line after reading it, `--root a --root b
  --help` among them, as measured for spec-family/spec-brief#67 and
  spec-family/spec-graph#99; this amendment said at first that spec-graph
  did so only for the refusals it added in 0.15.0 to 0.17.0, which a
  measurement of the older ones showed was not so. And `--help` beside
  `--version` asks for two answers of which one would go unread: spec-brief
  and spec-harness printed the version, spec-graph and spec-guard the help.
  It is refused, exit `2`, with a line that names both.

  *Amended 2026-10-19*: **on Windows a drive letter names its volume in
  either case.** Two values of a path option are compared as each is
  resolved, without asking the disk, and Node's `path.resolve` keeps the
  case a drive letter was written in, so `--root C:\x` beside `--root
  c:\x` was refused as two directories, as measured of spec-brief 0.9.0
  and spec-harness 0.19.0 in their round-24 pull requests; spec-graph
  0.18.0 compares resolved paths the same way. Microsoft's *Naming Files,
  Paths, and Namespaces* (learn.microsoft.com, *Naming Conventions*, read
  2026-10-19) says drive letters are case-insensitive, `D:\` and `d:\`
  naming the same volume, so on Windows each tool folds the case of a
  drive letter before it compares two such values. The rest
  of the path is compared as resolved, as before: the same page says NTFS
  can be made to tell names apart by case, so whether two names are one
  directory is the disk's to say, not the line's. A repository-relative
  path is compared case-sensitively on every host, as *Paths and patterns*
  has it.
- **Nothing measured is not clean.** A check that inspected nothing - an empty
  scope, a diff that was never read, a base equal to the head - says so, and
  under `--strict` refuses.
- **No prompts, no network, no model.** A tool runs unattended in CI and under
  an agent. None calls an LLM: the agent is the LLM, and a tool's answers must
  be the same every time.

### Names

- *Amended 2026-10-07*: **a command names the package it runs.** Each tool
  is published as `@descent-vtt/<name>` and installs a command called
  `<name>`. Without the scope those names are not the family's: on npm
  `spec-harness` is another publisher's package, and `spec-brief`,
  `spec-graph`, `spec-guard` and `spec-core` belonged to nobody on
  2026-10-07, so whoever registers one decides what it runs. `npx <name>`
  runs the project's install where there is one, and elsewhere - a fresh
  clone, a linked worktree before `npm ci`, a CI job without the install
  step - fetches the package of the bare name and runs it, unasked when no
  terminal is attached. So wherever the family writes a command for `npx` or
  `npm exec` - a README, a guide, a skill, a hook, a workflow, a message a
  tool prints - it writes the package's full name:
  `npx --no-install @descent-vtt/<name>` where a project has installed the
  tool, which runs that install or stops with an error that names this
  package, and `npx @descent-vtt/<name>` where nothing is installed, which
  fetches this package.

  `--no-install` in front of the bare name is not written either. Measured
  under npm 10.9.9, 11.20.0 and 12.2.0, with a made-up name served by a
  registry on the loopback address: it stops a download and nothing else.
  Where an earlier `npx <name>` left the bare name's package in npm's cache,
  `npx --no-install <name>` runs it, exit 0; where nothing is installed it
  asks the registry about the bare name and reports that package and its
  version as the one missing, which is the wrong thing to install. The full
  name with `--no-install` does neither: it asks only about the scoped
  package, and stops. It reads the install of the nearest `package.json`, or
  of the workspace root above it, so it is run from the directory that lists
  the tools; from a nested package that is no workspace it stops where the
  bare name would have found the root's install.

  A `package.json` script names the command alone: npm runs a script with
  the project's `node_modules/.bin` first on the path and fetches nothing for
  it. A hook or a server entry runs `node` with the path of the installed
  file. Each repository holds its own files to this in `tests/names.test.ts`,
  which reads every document, workflow, script and source file for a bare
  name behind `npx`, `npm exec` or another package manager's equivalent; the
  few lines that show the bare form as what not to write say so with a
  `bare-name:` comment above them.
- *Amended 2026-10-26*: **the family lives in the spec-family organization,
  and its packages are `@spec-family/<name>`.** On 2026-10-26 the five
  repositories moved from the GitHub organization DescentVTT to
  spec-family, under the names they had: `spec-family/spec-core`,
  `spec-family/spec-brief` and so on. The four tools are published as
  `@spec-family/spec-brief`, `@spec-family/spec-graph`,
  `@spec-family/spec-guard` and `@spec-family/spec-harness`, and each
  installs the command it did. spec-core is still published under no name;
  its `package.json` calls it `@spec-family/spec-core`, so the subpath
  ADR-0001 gives as an example is `@spec-family/spec-core/pattern`.

  The family is to be shown to people who have not met it, and a home
  named for a tabletop project read as unrelated to it. Moving was cheapest
  then: no stars, no forks, and one known user outside the family, whom
  the maintainer told what to change.

  Versions continue under the new names. spec-brief 0.12.0, spec-graph
  0.21.0, spec-guard 0.30.0 and spec-harness 0.22.0 are the first releases
  under them, after 0.11.0, 0.20.0, 0.29.0 and 0.21.0 under `@descent-vtt`,
  and each tool's CHANGELOG reads on from its last release under the old
  name. The `@descent-vtt` packages are deprecated, each with a message
  that names its new package, and none is unpublished. npm's *Deprecating
  and undeprecating packages or package versions* (docs.npmjs.com, read
  2026-10-26) says a deprecated package prints its message when a user
  installs it, and that unpublishing is what removes a package from the
  registry; it follows that a project that pins an old release still
  installs it, with the message as a warning.

  No release under the new scope looks for, installs, names or documents
  an `@descent-vtt` package: a sibling, an install hint, a hook's line or a
  plugin is found under `@spec-family` or not at all. A project moves by
  uninstalling each `@descent-vtt/<name>`, installing `@spec-family/<name>`
  and writing the new name wherever it named the old one. The rule of
  2026-10-07 holds under the new name: wherever the family writes a
  command for `npx` or `npm exec`, it writes
  `npx --no-install @spec-family/<name>` where a project has installed the
  tool and `npx @spec-family/<name>` where nothing is installed, and the
  names without the scope are still not the family's.

  History keeps the old names as written: a CHANGELOG entry that records a
  change made under them, a released version's or one of spec-core's, which
  has no versions, and a record or an amendment in an ADR that says what
  was so when it was written, such as the amendment of 2026-10-07 or a
  package named `@descent-vtt/spec-guard` at 0.17.0. A link, and a
  reference to a pull request, is a pointer and names `spec-family`:
  GitHub's *Transferring a repository* (docs.github.com, *What's
  transferred with a repository?*, read 2026-10-26) redirects every link
  to a repository's previous location to its new one, and deletes those
  redirects for good when a repository or a fork is made at the previous
  location.

### Documentation

- *Amended 2026-11-09*: **a tool's README is its front page, and its
  reference is in `docs/reference/`.** On 2026-11-08 spec-harness's README
  held 17,864 words, spec-guard's 17,494 and spec-graph's 13,734: every
  rule, flag and configuration key, and the reasoning behind each, on the
  page a person meeting the tool reads first. A tool's README says what the
  tool is, shows a quickstart with what a release printed, lists its checks
  at a glance with a minimal configuration and a CI job, and links to the
  rest. The rest, the tool's full reference, is in its repository's
  `docs/reference/*.md`:
  - **published in the package**: `files` in the tool's `package.json`
    names `docs/reference/`, so the reference installed beside a release is
    that release's, and an agent reads it from `node_modules/` with no
    network;
  - **linked relatively**, from the README and from one reference document
    to another, so a link resolves in the repository at any tag and in the
    installed package, where a link to `main` would describe another
    release;
  - **changed with what it describes**, in the same pull request, and
    released with it.

  The guides that span the tools - the tutorial, the adopting guide and the
  concepts - and this contract stay in spec-core's `docs/`: a tool's
  reference links to them and does not restate them. The Markdown in each
  repository is where all of it is written; a website, if one is made,
  renders those files. Where this contract says what a tool's documentation
  lists or names, it is the tool's reference documents.

### Findings and output

- A finding has a rule id, a severity, a place (file, line, column where there
  is one), a message, and a **hint that names the next action**. One defect is
  one finding.
- Every machine-readable output carries a format version, and a change that
  removes or renames a field bumps it. Where findings have places, SARIF 2.1.0
  and GitHub annotations are offered; GitLab Code Quality is added as each
  tool next touches its reporter, so the family is not GitHub-only.
- *Amended 2026-09-30*: **a GitLab Code Quality issue stays the same issue
  while its finding does.** Its `fingerprint` is the SHA-256 of the finding's
  identity - the rule, the file (or the document's id, which outlives a
  rename), and the subject the finding is about: a brief id, a symbol, a pair
  of briefs, a target - with the occurrence index added for the second and
  later findings that share one identity. Never the message, the hint or the
  line: GitLab tells a new issue from one it has seen by the fingerprint, and
  a reworded message or a moved line would show as one problem fixed and
  another found. `severity` is `major` for an error, `minor` for a warning and
  `info` for a note; `critical` and `blocker` are for the cases a tool's
  reference documents name (*Documentation*, above) - in spec-guard a
  failing assertion, a rule that survived `prove`, a ghost citation and a
  stale one under `--strict`; in spec-graph an error that is one without
  `--strict`. The `description` holds the hint, the next
  action, after the message. Where a tool does not yet - spec-brief's
  fingerprint holds the message; spec-guard's `description` has no hint, and
  its fingerprint of a directive it cannot read holds the message - that is a
  defect to fix, not a dialect.
- **Tools talk through their CLIs.** One tool reads another's versioned JSON;
  none imports another's package. Shared code arrives only through spec-core
  copies (ADR-0001). Each tool can be released, pinned and dropped on its own.
- *Amended 2026-10-19*: **a tool may give another's answer again without
  starting it, where that answer named everything it was made of and each
  reads the same.** On Windows a start of Node is most of what a tool
  costs, so spec-harness asking spec-brief for the same brief before every
  write paid for it every time. A tool that answers another lists, in the
  versioned JSON it writes, every input its answer was read from: each
  file with a digest of its bytes, each directory whose entries it listed,
  with the entries, and its own version; where it asked git which files
  there are, what git read for that answer too, the index and each ignore
  file that bears on it, or the answer says it is not to be kept.
  The tool that asked may keep that answer and its list as state of its
  own, outside the working tree under the git common directory as below,
  and give it again only when every input on the list reads as listed. An
  input it cannot read, one that reads otherwise, a list that names
  nothing, an answer that names no list, and any doubt, start the other
  tool as before: a kept answer may make a check quicker and never
  different. Nothing is imported, and the list is held to what the
  answering tool read by that tool's own tests, so a reader never guesses
  what it read. An answer a person's signature stands behind, a ruling, is
  kept only with the commit it was verified at and the bytes of the
  signers file in its list.

### Paths and patterns

- Paths are repository-relative POSIX, compared **case-sensitively on every
  host**. Globs are one of three named dialects (ADR-0003).

### Documents and state

- **The document is the record.** No tool keeps a manifest, an index or a
  state file in the working tree. A brief's lifecycle is its directory and its
  `status`; a wave is computed from `dependsOn` and `wave`.
- *Amended 2026-09-30*: **where a status is read.** Front matter first -
  `status`, and the other keys a tool's reference documents list
  (*Documentation*, above) - then, where the front matter names none, the
  other places each tool's reference lists: a `## Status` section, a
  `Status:` label, the directory a document is in. spec-graph and
  spec-guard read one more place, **a table of exactly two columns before the
  document's first `##` heading**: a row whose left cell, the header row
  included, is exactly a status key once emphasis is stripped - `Status`,
  `State`, `狀態` or `状态`, in any case - gives its right cell as the status.
  It ranks where each tool ranks a `## Status` section, and front matter still
  wins. A table with more columns, or one after the first `##`, is never read
  for a status: a legend of status words or a register of documents is not
  the document's own status. Each of the two names, in its CHANGELOG, the
  release that first reads it. *Amended again 2026-09-30*: the keys are
  `Status` and `State` only; `狀態` and `状态` are withdrawn with the Chinese
  status words, below the lifecycle table.
- State that exists only while work is in flight - an escalation waiting for a
  person, a sandbox in use - lives **outside the working tree**, under the git
  common directory (`.git/spec-harness/`), and only its outcome is written back
  into a document.

  *Amended 2026-10-19*: an answer kept by the rule under *Findings and
  output* is state of the same kind: outside the working tree, removed at
  any time with no answer changing.
- **Lifecycle words mean the same everywhere:**

  | status | spec-brief | spec-guard executes assertions | spec-graph |
  | --- | --- | --- | --- |
  | `draft`, `proposed` | a brief not yet active | no | not yet in force |
  | `accepted`, `active` | the round in progress | yes | in force |
  | `rejected`, `deprecated`, `superseded` | - | no | retired |
  | `archived` | a closed round, frozen | no | **a record, not retired**: depending on it is normal |

  A premise a brief asserts (the defect still exists) and a goal it asserts
  (the fix is in) are different: premises run on every build with
  `--ignore-status` so that a stale brief fails CI; goals run when the round
  closes. A brief says which is which (spec-harness ADRs).

  *Withdrawn 2026-09-30 by the amendment after this one, and kept as the
  record of what the tools read until then:*

  *Amended 2026-09-30*: **a status written in Chinese is read as the English
  word it translates**, and each tool then does with it what it does with that
  English word, so the family stays consistent without a rule of its own for
  Chinese: `延後` is `deferred`, retired in spec-graph and in force in
  spec-guard, as `deferred` is today. Traditional and Simplified are both
  read. By the English word each maps to:

  | English | Traditional | Simplified |
  | --- | --- | --- |
  | superseded | 已被取代, 被取代, 已取代 (see below), and `被` ... `取代`/`替代`/`取而代之` within 30 characters (`被 ADR-0003 取代`) | 已被取代, 被取代, 已取代, and the same `被` ... `取代` form |
  | deprecated | 已棄用, 棄用, 已廢棄, 廢棄, 已停用, 已過時 | 已弃用, 弃用, 已废弃, 废弃, 已停用, 已过时 |
  | rejected | 已否決, 否決, 已拒絕, 不採納 | 已否决, 否决, 已拒绝, 不采纳 |
  | withdrawn | 已撤回, 撤回, 已作廢, 作廢 | 已撤回, 撤回, 已作废, 作废 |
  | deferred | 延後, 暫緩, 擱置 | 延后, 暂缓, 搁置 |
  | archived | 封存, 已封存, 歸檔, 已歸檔 | 封存, 已封存, 归档, 已归档 |
  | final | 已定案, 定案, 已凍結 | 已定案, 定案, 已冻结 |
  | provisionally accepted | 暫定 (so `暫定接受` is not accepted) | 暂定 |
  | accepted | 已接受, 接受, 已採納, 採納, 已核准, 核准, 已批准, 批准, 已生效, 生效 | 已接受, 接受, 已采纳, 采纳, 已核准, 核准, 已批准, 批准, 已生效, 生效 |
  | implemented | 已實施, 已完成 | 已实施, 已完成 |
  | draft | 草稿, 草案 | 草稿, 草案 |
  | proposed | 提議, 提案, 審查中, 審核中, 討論中, 待審, 待審核 | 提议, 提案, 审查中, 审核中, 讨论中, 待审, 待审核 |

  - `已取代` alone, with emphasis, a date or punctuation around it, is
    `superseded`. `已取代` followed directly by a document reference - after
    optional spaces or a colon, a letter or digit, as in `已取代 ADR-0002` -
    usually means this document supersedes that one, and is not read as a
    status word at all.
  - A Han word directly after a negation (`不 未 非 沒 没 無 无 勿`, and
    `尚未`, `不再`) is not read: `未接受`, `尚未核准`, `不再生效`. An entry
    that itself starts with one, such as `不採納`, is matched as itself.
  - `取代` without `被`, as in `已接受（取代 ADR-0002）`, is not retirement.
  - The status key is read in Chinese too, `狀態` and `状态`, wherever a tool
    reads `status` today. A heading or a label takes an ASCII colon or a
    full-width `：`. Front matter is YAML, where only the ASCII colon
    separates a key from its value: `狀態: 已接受` is read, and `狀態：已接受`
    is a line that is not a key, reported as unreadable front matter (spec-core
    ADR-0004), never guessed at.

  Each tool names, in its CHANGELOG, the release that first reads them.

  *Amended again 2026-09-30*: **status words are English in every tool.** The
  amendment above is withdrawn, its table and every rule under it: no tool
  reads a Chinese status word, the `被` ... `取代` form, `狀態` or `状态` as a
  status key, or a full-width colon after a status label. A document may be
  written in any language and writes its status in English -
  `status: superseded` in front matter, or `Superseded by ADR-0007` under a
  `## Status` heading - which every tool reads. The maintainer chose one
  language: a small team keeps one vocabulary up to date, and a heuristic in
  a second language is where false positives come from. The two-column
  table before the first `##` stays, with the keys `Status` and `State`. A
  status in another language is then a word no tool knows, and each treats
  it as it treats any such word: spec-guard keeps the document in force, so
  no document goes dark by accident. Each tool names, in its CHANGELOG, the
  release that stops reading Chinese.

### Git and the working tree

- spec-brief, spec-graph and spec-guard **read git and never write it**.
- spec-harness may create **temporary worktrees** to run an agent or a probe in
  isolation. It always removes them, including on interruption, and it
  **never touches the user's own working tree**: a failed round is discarded
  by discarding its worktree.

### People

- **Two human gates**: approving a brief before work starts (its scope and what
  it protects), and approving the archive when it ends. Everything between is
  the agent's.
- A ruling that lifts a protection must arrive through a channel an agent
  cannot impersonate - a signature by a key the agent cannot use, or a review
  on the forge by a different identity. A hash an agent can compute is not a
  signature.
- In a repository where agents write the code, the rule files (ADRs, tool
  configuration, brief protections) are protected by the forge (CODEOWNERS,
  branch rules), and CI checks a change against the **base branch's** rules,
  not the ones the change itself carries. *Amended 2026-09-30*: CODEOWNERS is
  one forge's way, and GitLab Free has no Code Owners approval and no required
  approval rules. The requirement, on any forge: nothing reaches the base
  branch without a person merging or approving it, and a person reads every
  change to a rule file before it does - the CI configuration that runs the
  checks included, since a change can remove the job that would fail it.
  GitHub meets it with `CODEOWNERS` and required review from code owners on a
  protected branch; GitLab Premium with Code Owners and *Require approval from
  code owners*; GitLab Free with a protected branch that no one may push to
  and only Maintainers may merge, agents at the Developer role, and
  *Pipelines must succeed*, so that a person merges every change.
  [Adopting](../adopting.md) has the settings for both.

## Consequences

Each tool's CLAUDE.md links here instead of restating the list, and a tool
that breaks a clause needs an ADR of its own saying why.
