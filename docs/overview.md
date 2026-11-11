# Overview

A specification marks a feature `Implemented`, and no test that could fail
stands behind it. An agent asked to fix one function also rewrites the
migration its task told it to leave alone. An ADR says the domain imports
nothing from the infrastructure, and the code stopped keeping that a month
ago. Each is a Markdown document saying something about the code that is not
true, and nothing in the build notices.

**The spec family finds each of these, the same way every time: it holds
your code, and the agents that write it, to what your Markdown says.**

It is four command-line tools and the library they share. They read the
Markdown a repository already keeps - specifications, ADRs, checklists,
registers, agent instructions, the brief a round of work runs under - and
check what it says against the code, the git history and the changes an
agent actually made. Each tool is one npm package with no runtime
dependencies
([spec-brief](https://registry.npmjs.org/@spec-family%2fspec-brief/latest),
[spec-graph](https://registry.npmjs.org/@spec-family%2fspec-graph/latest),
[spec-guard](https://registry.npmjs.org/@spec-family%2fspec-guard/latest),
[spec-harness](https://registry.npmjs.org/@spec-family%2fspec-harness/latest)),
runs on Node 22 or later, calls no model, needs no account and makes no
network request. A tool's exit code means one thing: `0` clean, `1` found
something, `2` the result cannot be trusted
([ADR-0005](adr/0005-the-family-contract.md)).

## Which document do you want to keep true?

| Document | What goes wrong | Tool | Rule or command |
| --- | --- | --- | --- |
| ADR | The code stops keeping a rule the ADR states; a rule is written so that it can never fail; a code comment cites a decision that was superseded or never written; a superseded ADR still reads as current | spec-guard, spec-graph | `@assert-*` directives under the sentence, run by `spec-guard`; [`spec-guard prove`](https://github.com/spec-family/spec-guard/blob/main/docs/reference/prove.md); [`spec-guard cites`](https://github.com/spec-family/spec-guard/blob/main/docs/reference/cites.md); [`live-supersession`](https://github.com/spec-family/spec-graph/blob/main/docs/reference/rules.md) |
| Specification | The code stops keeping a rule the specification states; a citation names a document or anchor that is not there; a document rests on a decision since retired; open work is handed to a document that can no longer take it; a claim says `Implemented` and no test stands behind it | spec-graph, spec-guard | [`broken-reference`, `stale-premise`, `ghost-handover`](https://github.com/spec-family/spec-graph/blob/main/docs/reference/rules.md); [`@assert-*` directives](https://github.com/spec-family/spec-guard/blob/main/docs/reference/directives.md) under the sentence; [`spec-guard claims`](https://github.com/spec-family/spec-guard/blob/main/docs/reference/claims.md) |
| Checklist or roadmap | A box is ticked with nothing behind it, cites a claim still open, or names a commit git does not have | spec-graph | [`unevidenced-completion`, `premature-completion`, `unknown-commit`](https://github.com/spec-family/spec-graph/blob/main/docs/reference/claims-and-evidence.md#checklists-and-ledgers-held-to-what-they-cite) |
| Ledger or status page | A row says done while the claim it cites still leaves work open | spec-graph | [`premature-completion`, `unknown-commit`](https://github.com/spec-family/spec-graph/blob/main/docs/reference/claims-and-evidence.md#checklists-and-ledgers-held-to-what-they-cite) |
| Register | A row's status is a word the register does not know; a row lacks the resolution, citation or commit its status asks for; two rows share a key | spec-graph | [`unknown-register-status`, `incomplete-register-row`, `duplicate-key`](https://github.com/spec-family/spec-graph/blob/main/docs/reference/registers.md) |
| Measurement protocol, and the figures that rest on it | A protocol has no method or no dated result; a claim that asks for a measurement cites no protocol; a figure names no record | spec-graph | [`incomplete-protocol`, `undated-result`, `target-without-protocol`, `unrecorded-figure`](https://github.com/spec-family/spec-graph/blob/main/docs/reference/claims-and-evidence.md#figures-resting-on-a-record) |
| Orientation document: `CLAUDE.md`, `AGENTS.md`, a README | It names a path, a script, a make target or a commit that is not there; the code stops keeping a rule it states | spec-graph, spec-guard | [`missing-path`, `missing-command`, `unknown-commit`](https://github.com/spec-family/spec-graph/blob/main/docs/reference/orientation.md); [`@assert-*` directives](https://github.com/spec-family/spec-guard/blob/main/docs/reference/directives.md) under the sentence |
| Brief | Its contract is incomplete; two rounds meant to run side by side could write the same file; an agent writes a file the brief protects; the round closes with a protected file changed, a box open, or a claim it raises still open | spec-brief, spec-harness | [`spec-brief lint`, `matrix`, `schedule`, `archive`](https://github.com/spec-family/spec-brief/blob/main/docs/reference/commands.md); [`spec-harness guard`, `audit`](https://github.com/spec-family/spec-harness/blob/main/docs/reference/README.md) |

spec-graph reads specifications, ADRs and the references between them with no
configuration, including the layouts Spec Kit, OpenSpec and Kiro write
([spec-graph](https://github.com/spec-family/spec-graph/blob/main/docs/reference/sdd-layouts.md)).
Its rules for claims, checklists, ledgers, registers, protocols and
orientation documents start once its configuration names the files that hold
them, as `spec-guard claims` and `spec-guard cites` do; a file no
configuration names is not held to them. The words in this table - claim,
label, ledger, register, protocol, orientation document - are defined in
[concepts](concepts.md).

## Which problem, which tool

| The problem | Tool | What runs |
| --- | --- | --- |
| The code no longer keeps a rule a specification, an ADR, a README or an agent's instructions state | spec-guard | `spec-guard` in CI |
| A rule a document states could never fail | spec-guard | `spec-guard prove` |
| A specification says `Implemented`, and no test that could fail stands behind it | spec-guard | `spec-guard claims` |
| A code comment cites a decision that was superseded | spec-guard | `spec-guard cites` |
| A document rests on a decision that was retired, or hands its open work to one | spec-graph | `spec-graph check` |
| A box is ticked, or a row says done, with no evidence behind it | spec-graph | `spec-graph check`, with the checklists and ledgers configured |
| `CLAUDE.md` tells the next agent to run a script that is gone | spec-graph | `spec-graph check`, with the orientation documents configured |
| Two agents working side by side could write the same file | spec-brief | `spec-brief matrix`, `spec-brief schedule` |
| An agent is about to write a file its task protects | spec-harness | the guard's hook before the write, git's pre-commit hook at the commit |
| An agent wrote outside its task, through a shell or otherwise | spec-harness, spec-brief | `spec-harness audit`, `spec-brief archive` |
| The round needs a file its brief protects | spec-harness | `spec-harness escalate`, then a ruling the person signs with `spec-harness rule` |
| A round is closed while the claim it was to raise still says the work is open | spec-brief | `spec-brief archive` (`claim-not-raised`) |
| An agent starts a round without the documents its brief cites | spec-harness | `spec-harness context`, or the MCP tool `start_round` |
| A defect brief whose defect may already be gone | spec-harness | `spec-harness probe`, `spec-harness premises` |

One tool is a useful install on its own: spec-guard alone holds code to what
its Markdown says, spec-graph alone holds documents to each other and to the
record they cite. [Adopting](adopting.md) goes from one tool to the whole
loop, and the [tutorial](tutorial.md) runs one round from the brief to the
archive.

## Neighbours

Each statement below about another project was read from that project's own
repository, documentation or registry entry on 2026-11-09, and links to
where it was read. These projects change every week: follow the link before
relying on one.

### Spec-driven development: Spec Kit and OpenSpec

[Spec Kit](https://github.com/github/spec-kit) gives a coding agent commands
and templates to write a specification, a plan and tasks, and then to
implement them. Its check of the code against the specification, `converge`,
is a prompt the agent carries out: the agent reads the code and appends the
work still missing to `tasks.md`, and the command's own template says it is
not a diff tool and reads no git history
([converge.md](https://github.com/github/spec-kit/blob/main/templates/commands/converge.md)).
[OpenSpec](https://github.com/Fission-AI/OpenSpec) keeps specifications under
`openspec/specs/` and each change, with its delta to them, under
`openspec/changes/`; its `/opsx:verify` is an agent command that does not
block the archive, and its archive warns about incomplete tasks without
refusing them
([commands](https://github.com/Fission-AI/OpenSpec/blob/main/docs/commands.md)).

Both help an agent write the specification and build from it; the spec
family keeps it true afterwards, deterministically, on every change. They
work together: spec-graph reads both layouts
with no configuration, the checkboxes of a Spec Kit `tasks.md` as the
feature's open work, and an archived OpenSpec change as a record
([spec-graph](https://github.com/spec-family/spec-graph/blob/main/docs/reference/sdd-layouts.md)).

### ADR enforcement: Archgate, Mneme and adrkit

[Archgate](https://github.com/archgate/cli) (Apache-2.0) keeps ADRs as
Markdown with YAML front matter in `.archgate/adrs/`, each with an optional
companion `.rules.ts` file of checks that `archgate check` runs in CI and in
pre-commit hooks; a rule is TypeScript and can read files, search them and
parse them into syntax trees ([writing
rules](https://cli.archgate.dev/guides/writing-rules/)). Its agent plugins
need a one-time `archgate login`; the command line needs no account
([README](https://github.com/archgate/cli/blob/main/README.md)). Its ADR
front matter has no status and no supersession field ([ADR
schema](https://cli.archgate.dev/reference/adr-schema/)). A spec-guard rule
is an HTML comment under the sentence it enforces, in the ADR itself as in
any other Markdown, and is held only while the ADR is in force; spec-graph
holds the ADRs' lifecycle. Archgate's rules, being code, can express checks a
spec-guard directive cannot.

[Mneme](https://github.com/MnemeHQ/mneme) (MIT, Python 3.11 or later) keeps a
corpus of engineering decisions and enforces the rules they govern
deterministically: before a Claude Code edit, at the end of the agent's turn
for changes that escaped that check, and in CI with `mneme check`. Its own
documentation says that review, approver independence and branch protection
are recorded as attestations and never verified
([Claude Code integration](https://github.com/MnemeHQ/mneme/blob/main/docs/integrations/claude-code.md)).
In the spec family the document is the record, with no corpus beside it, and
an exception to a protection counts only as a commit signed by a key the base
branch's allowed signers list.

[adrkit](https://github.com/mbeacom/adrkit) (Apache-2.0, Node 22 or later)
treats an ADR as typed data with a Markdown body and an `affects` field, so it
can say which decisions govern a pull request. `adr lint` finds supersession
cycles and decisions that contradict each other, a read-only MCP server gives
agents the decisions, and a GitHub Action comments the governing decisions on
a pull request, comment-only and with no approval. `adr accept --by` records
who ratified a decision as an identity it is told
([README](https://github.com/mbeacom/adrkit/blob/main/README.md)). spec-guard
fails the build where the code breaks a rule an ADR states, and a ruling's
signature is verified, not declared.

### Documentation checks: DocGuard and ctxgrd

[DocGuard](https://github.com/raccioly/docguard) (MIT, Node 18 or later, one
pinned runtime dependency) runs 36 validators, by its README on 2026-11-09,
over a repository's documentation: links and anchors, routes against the
code, requirement IDs traced to tests, hard-coded numbers against the code,
ADR status and supersession (informational by default), and agent
instruction files. It has an MCP server, a Spec Kit extension, SARIF output,
and a Claude Code hook that, after an edit, suggests the agent run its check
([README](https://github.com/raccioly/docguard/blob/main/README.md)). Of
the neighbours, its documents overlap the family's most. Where the two meet,
the spec family asks of an `Implemented` claim a directive that counts a test
by its name and that `spec-guard prove` shows can fail, and of a ticked box a
commit git holds; and spec-harness refuses an agent's write before it
happens, where DocGuard's hook speaks after it.

[ctxgrd](https://ctxgrd.aktagon.com/) (Elastic License 2.0, one Rust
binary, prebuilt only for macOS in its 6.x releases) lints documents by
type: required front matter, status vocabularies, references that resolve,
a document with a final status that depends on one without, and supersession
marked in both directions; it runs in a pre-commit hook, in CI and as a
Claude Code stop hook. spec-graph reads lifecycles and references too, and
finds a document's status wherever it is written, in front matter or not; the spec
family is MIT-licensed and runs on Node; and it holds the code to the
documents as well as the documents to each other.

### Scoped agent work: Trailbun and spec-gates

[Trailbun](https://github.com/Daniel-DDV/trailbun) (MIT, Python 3.11 to 3.14,
a 0.2.1 preview) writes each task down as a contract - a goal, the allowed
paths, the acceptance checks - and checks the work tree against the commit
the task started from. Its refusal before a write is shown live on Codex;
for Claude Code its README reports fixtures only, and the agent can change
its own contract, with a reason recorded
([README](https://github.com/Daniel-DDV/trailbun/blob/main/README.md)).
A spec-family brief is a Markdown file a person approves and the forge
protects, and a protected path opens only by a ruling the person signs.

[spec-gates](https://github.com/schwichtgit/spec-gates) (MIT, a Spec Kit
extension, early) applies one policy at three boundaries: Claude Code hooks,
git hooks and CI. A task's acceptance criteria can be shell blocks that run;
the protected files are one list for the whole repository; and a commit that
changes one needs `Protected-Change` and `Approved-By: <name>` trailers,
which CI checks
([README](https://github.com/schwichtgit/spec-gates/blob/main/README.md)).
In the spec family each brief protects its own files for its own round, and
the approval is a signature, not a name in a trailer.

### Import rules: dependency-cruiser and import-linter

[dependency-cruiser](https://github.com/sverweij/dependency-cruiser) (MIT;
JavaScript, TypeScript, CoffeeScript and LiveScript) and
[import-linter](https://github.com/seddonym/import-linter) (BSD-2-Clause;
Python) hold the imports between modules to rules in a configuration file.
They are the established deterministic way to keep an architecture's
boundaries. spec-guard's import rules (`@assert-import-absence`,
`@assert-layers`, `@assert-import-cycle`, in JavaScript and TypeScript,
Python, Go, Rust and C#) are written in the ADR under the sentence they
enforce, stop being enforced when the ADR is superseded, and say what each
cannot see
([imports](https://github.com/spec-family/spec-guard/blob/main/docs/reference/imports.md)).
Keep a dependency-cruiser or import-linter configuration where it serves;
the two run side by side.

## What the tools do not do

- **The guard before a write works under one agent.** spec-harness refuses a
  write to a protected file through Claude Code's `PreToolUse` hook, in Claude
  Code 2.1.139 or later
  ([requirements](https://github.com/spec-family/spec-harness/blob/main/README.md#requirements)).
  No other agent's hooks have been tested with it. Every agent, or none,
  still meets git's pre-commit hook where `spec-harness init --git-hook`
  installed it, the audit, the archive and CI.
- **A write through a shell passes the guard.** The hook sees the agent's
  file tools, not a shell command, and no hook looks for one. The audit and
  spec-brief's archive measure everything the round changed, whatever wrote
  it, so they find it; so does the pre-commit hook, unless the commit skips
  it with `--no-verify`, and the end-of-turn report where it is turned on
  ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).
- **A ruling proves the agent did not sign it, not that two people
  reviewed.** It counts when a key the base branch's allowed signers list
  signed the commit that last changed it. One person may write the brief, run
  the round and sign its rulings; nothing checks that the signer is someone
  other than the brief's author, so a ruling is not separation of duties
  ([concepts](concepts.md#ruling)). A forge that squashes or rebases on merge
  drops the signature
  ([adopting](adopting.md#merge-settings-that-keep-rulings)).
- **They do not run your tests.** `spec-guard claims` asks an `Implemented`
  claim for a directive that counts a test by its name, which `spec-guard
  prove` shows can fail; whether the test passes is your test runner's to
  say, in the same CI run. spec-guard searches the code; it does not run it.
- **They do not decide whether the code is correct, or whether a document
  asks for the right thing.** That is the tests' job, and the person's.
- **They read only what is marked.** A sentence with no directive under it, a
  number no `@spec-figure` marks, a file no configuration names: none is
  checked. No model reads the prose, so two rounds that write different
  files and still conflict in meaning are not caught.
- **They do not protect their own rule files.** An agent that can edit the
  ADR, the configuration or the CI workflow can loosen the rule it is
  breaking. The forge closes that gap: protected branches, code owners, and a
  check of each change against the base branch's rules
  ([adopting](adopting.md#when-agents-write-most-of-the-code)).
- **Status words are read in English.** A document may be written in any
  language and gives its status in English
  ([ADR-0005](adr/0005-the-family-contract.md#documents-and-state)).
- **The output is not frozen yet.** The tools are before 1.0; from each
  tool's first release after round 27, two consecutive minor releases keep
  its JSON fields and exit codes, and a new rule arrives first as a warning
  or behind an option ([ADR-0009](adr/0009-versions-before-1-0.md)).

## Measured

Each figure links to where it is measured.

- **No runtime dependencies**: `dependencies` is empty in each package's
  manifest on the registry, linked at the top of this page.
- **Published by CI, with provenance**: each release on npm carries npm's
  provenance attestation (`dist.attestations` in the same manifests).
- **Mutation testing**: every push to main runs a full Stryker sweep, and a
  score below the repository's floor fails it. The sweeps of main on
  2026-11-09:

| Repository | Commit | Mutants | Score | Run |
| --- | --- | --- | --- | --- |
| spec-core | `9de6a49` | 5,928 | 96.66% | [42605314127](https://github.com/spec-family/spec-core/actions/runs/42605314127) |
| spec-brief | `6fb4a3b` | 7,874 | 99.31% | [42616690548](https://github.com/spec-family/spec-brief/actions/runs/42616690548) |
| spec-graph | `5649582` | 11,408 | 97.24% | [42623168740](https://github.com/spec-family/spec-graph/actions/runs/42623168740) |
| spec-guard | `e6f38b3` | 15,677 | 99.26% | [42619765580](https://github.com/spec-family/spec-guard/actions/runs/42619765580) |
| spec-harness | `51ea81b` | 12,601 | 98.00% | [42629434422](https://github.com/spec-family/spec-harness/actions/runs/42629434422) |

## Where next

- [Tutorial](tutorial.md): the whole loop in ten steps on a small repository,
  with the output of each.
- [Adopting](adopting.md): from one tool to the whole loop, CI, and the forge
  settings for a repository where agents write most of the code.
- [Concepts](concepts.md): every word the tools share, in a sentence or two.
- Each tool's README is its front page, and its `docs/reference/` has every
  command, rule and key:
  [spec-brief](https://github.com/spec-family/spec-brief),
  [spec-graph](https://github.com/spec-family/spec-graph),
  [spec-guard](https://github.com/spec-family/spec-guard),
  [spec-harness](https://github.com/spec-family/spec-harness).
