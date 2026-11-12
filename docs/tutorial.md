# Tutorial: one round, start to finish

Ten steps through the whole loop on a made-up repository: two ADRs, a small
C# tree, one defect, and one round of agent work to fix it, from the brief to
the archive. After them, one claim is followed through the three tools that
read it. Nothing needs to build; the tools read the text.

Every output below comes from running these steps against the published
packages, spec-brief 0.14.0, spec-graph 0.25.0, spec-guard 0.34.0 and
spec-harness 0.25.0, trimmed where a line says `…`. CI replays every step
against those releases on each change to this repository, and fails where an
output no longer reads as shown here
([`scripts/tutorial.mjs`](https://github.com/spec-family/spec-core/blob/main/scripts/tutorial.mjs)).
The words in italics are defined in [concepts](concepts.md).

## 1. The repository

```text
ledger/
  docs/adr/0001-dependencies-point-inward.md
  docs/adr/0002-money-is-decimal.md
  src/Ledger.Domain/Account.cs
  src/Ledger.Application/Interest.cs
  src/Ledger.Application/Transfers.cs
  src/Ledger.Infrastructure/AccountStore.cs
  .gitignore            node_modules/, bin/, obj/
  package.json          { "name": "ledger", "private": true }
```

It is a git repository with one commit, on `main`.

The ADRs state their rules as spec-guard *assertions*, HTML comments under
the sentence each one makes executable:

```markdown
---
status: accepted
---

# ADR-0001: Dependencies point inward

## Decision

The domain depends on nothing, the application on the domain, and the
infrastructure on both.

<!-- @assert-layers target="src" order="Ledger.Domain, Ledger.Application, Ledger.Infrastructure" reason="dependencies point inward" -->
```

```markdown
---
status: accepted
---

# ADR-0002: Money is a decimal

## Decision

Amounts of money are `decimal`, never `double` or `float`, so a cent is never
lost to binary rounding. Where they live is constrained by
[ADR-0001](0001-dependencies-point-inward.md): every amount is the domain's.

<!-- @assert-absence target="src/Ledger.Domain" glob="*.cs" symbol="double" word="true" reason="money is decimal" -->
```

And the defect, in the application layer, which ADR-0002's assertion does
not reach:

```csharp
public static decimal For(Account account, decimal rate) =>
    (decimal)((double)account.Balance * (double)rate);
```

## 2. Install and configure

The repository has no JavaScript of its own, so `package.json` holds nothing
but the tools. Every command from here on gives `npx` the package's full name
and `--no-install`: it runs the install made on the first line and fetches
nothing ([Names](adopting.md#names) says why the command's name alone is not
written).

The commands are bash. On Windows, run them in Git Bash, which Git for
Windows installs; the tools themselves read Windows paths and a checkout
with CRLF line endings as they read POSIX ones, and each tool's CI runs it
on Windows as well as on Linux and macOS.

```console
$ npm install --save-dev @spec-family/spec-brief @spec-family/spec-graph @spec-family/spec-guard @spec-family/spec-harness
$ npx --no-install @spec-family/spec-harness init
run     .spec-brief.json
        spec-brief init: the brief and archive directories, every default spelled out
update  .spec-brief.json
        load spec-harness's plugin, "@spec-family/spec-harness/spec-brief-plugin": spec-brief's archive asks it whether a signed ruling allows a protected file, …
create  .spec-graph.json
        read briefs/archive/** as history, for when spec-graph reads the briefs; …
create  .spec-harness.json
        rounds are measured from main, the branch init runs on: no remote records a default branch (refs/remotes/origin/HEAD); …
create  .claude/settings.json
        the guard hooks, run with node from the project's install: a PreToolUse hook refuses writes to protected files; a PostToolUse hook warns about writes outside the scope; a SessionStart hook says, as a session starts, what would hold every write of it
create  .mcp.json
        the spec-harness MCP server, run with node from the project's install: start_round, check_path, request_escalation, audit_round, list_rounds
advise  .git/hooks/pre-commit
        no pre-commit hook runs spec-harness: one refuses a commit that changes what the active brief protects, for any agent or none, a shell's writes included; run spec-harness init --git-hook --write to add it
advise  .github/allowed_signers
        rulings count only when signed by a key listed here on the base branch: one line per person, <email> namespaces="git" <public key>. …

Nothing was changed. Run again with --write to apply the plan.
$ npx --no-install @spec-family/spec-harness init --write
```

The last two lines are advice. The git hook is written only with
`--git-hook`, and this tutorial goes without it. Nor does `init` choose who
may sign *rulings*: Pat, the person who approves the work, gets a signing key
and a line in the allowed signers file. This key is a throwaway for the
tutorial, kept outside the repository; for real rulings use a FIDO2 key
(`-t ed25519-sk`), whose signature needs a touch no agent can supply.

```console
$ ssh-keygen -t ed25519 -N "" -C person@example.test -f ~/.ssh/ledger-person
$ git config gpg.format ssh
$ git config user.signingkey ~/.ssh/ledger-person
$ mkdir -p .github
$ echo "person@example.test namespaces=\"git\" $(cut -d' ' -f1,2 ~/.ssh/ledger-person.pub)" > .github/allowed_signers
$ git add -A && git commit -m "Configure the spec tools; Pat signs rulings"
$ npx --no-install @spec-family/spec-harness doctor
root    …/ledger
branch  main
brief   (none named)
base    main (.spec-harness.json), merge base 7fc662237b37
signers .github/allowed_signers is on main
        note: signers whose key is not a FIDO2 key: person@example.test (ssh-ed25519, line 1). …
plugin  spec-brief loads spec-harness's plugin (.spec-brief.json): its archive accepts a protected file a signed ruling allows
claude  init's entries: the guard hooks in .claude/settings.json, the server in .mcp.json
        Claude Code … runs the hooks, which need 2.1.139 or later
git     no pre-commit hook runs spec-harness (.git/hooks/pre-commit): …

found     spec-brief  … (0.14.0)
found     spec-graph  … (0.25.0)
found     spec-guard  … (0.34.0)
```

The note is about the throwaway key, and the `git` line about the hook this
tutorial goes without; neither fails `doctor`. A Claude Code older than
2.1.139 does, since it runs every write unguarded; the trimmed line names the
release on your `PATH`.

## 3. Hold the code to its ADRs

spec-guard reads `docs/**/*.md` by default and runs every assertion in a
document in force:

```console
$ npx --no-install @spec-family/spec-guard --verbose
spec-guard 2 specs · 2 assertions · javascript

✔ docs/adr/0001-dependencies-point-inward.md:12  @assert-layers src must keep its layers in order, Ledger.Domain < Ledger.Application < Ledger.Infrastructure (0 violating files)
✔ docs/adr/0002-money-is-decimal.md:13  @assert-absence "double" (0 matches) in src/Ledger.Domain

2 passed · 26ms
✔ every spec assertion holds
```

Add `using Ledger.Infrastructure;` to `Account.cs` and the ADR fails, on the
line that broke it:

```console
$ npx --no-install @spec-family/spec-guard
spec-guard 2 specs · 2 assertions · javascript

✖ docs/adr/0001-dependencies-point-inward.md:12  @assert-layers
    src must keep its layers in order, Ledger.Domain < Ledger.Application < Ledger.Infrastructure
    expected no violating files, found 1
    reason: dependencies point inward
      src/Ledger.Domain/Account.cs:1:1  Ledger.Domain -> Ledger.Infrastructure: using Ledger.Infrastructure

1 passed · 1 failed · 23ms
```

Exit 1. Take the line out again. `prove` shows each rule a violation of
itself, in memory, so a rule that cannot fail is found before it is trusted:

```console
$ npx --no-install @spec-family/spec-guard prove
spec-guard prove 2 specs · 2 rules

2 seen to fail · 28ms
✔ every rule in force was seen to fail
```

## 4. Keep the documents consistent

spec-graph checks what the documents say about each other. ADR-0002 says it
is constrained by ADR-0001, which spec-graph reads as `assumes`:

```console
$ npx --no-install @spec-family/spec-graph check
spec-graph 2 documents · 0 items · 1 relation · 0 open

24.98ms
✔ the specification graph is consistent
```

Mark ADR-0001 `superseded` and the ADR resting on it is reported:

```console
$ npx --no-install @spec-family/spec-graph check
spec-graph 2 documents · 0 items · 1 relation · 0 open

✖ docs/adr/0002-money-is-decimal.md:11:12  stale-premise
    ADR-0002 assumes ADR-0001, which no longer holds
    ↳ docs/adr/0001-dependencies-point-inward.md:2:9  ADR-0001 is retired ("superseded")
    → re-check this dependency: the constraint it assumes may have been lifted when ADR-0001 was retired

1 error · 22.91ms
✖ the specification graph is inconsistent
```

Exit 1. Put the status back.

## 5. Write a brief

A *brief* is the contract for one *round*. The agent drafts it; `new` gives it
the next free id and every section the configuration requires, each with a
comment saying what it must answer:

```console
$ npx --no-install @spec-family/spec-brief new "Compute interest in decimal" --type defect --wave 1
wrote briefs/001_compute-interest-in-decimal.md
$ npx --no-install @spec-family/spec-brief lint
briefs/001_compute-interest-in-decimal.md
  12  warning  the "Intent" section is empty  empty-section
               The state of the tree when this round is done, and why it matters. One paragraph.
  16  warning  the "Negative Scope" section is empty  empty-section
               What this round must not do, even where it would look helpful.
  …
0 errors, 5 warnings, 0 notes in 1 brief(s)
```

A draft's gaps are warnings; the same gaps in an active brief are errors.
Written, it reads:

```markdown
---
status: draft
date: 2026-09-30
type: defect
wave: 1
affectedFiles: [src/Ledger.Application/Interest.cs]
protectedFiles: [src/Ledger.Domain/**]
---

# 001 — Compute interest in decimal

## Intent

Interest is computed in `decimal` from end to end, so no account gains or
loses a fraction of a cent to binary rounding, as
[ADR-0002](../docs/adr/0002-money-is-decimal.md) requires of every amount.

## Negative Scope

- No change to how transfers work.
- No new rounding rule: the result is rounded as it is today.

## Not Empowered

- The domain model in `src/Ledger.Domain/`.

## Invariants

- [ ] no `double` in `src/Ledger.Application/Interest.cs`

<!-- @assert-absence target="src/Ledger.Application/Interest.cs" symbol="double" word="true" -->

## The Defect, Measured

`Interest.For` converts the balance and the rate to `double` and back:

<!-- @assert-count target="src/Ledger.Application/Interest.cs" symbol="double" word="true" min="1" -->
```

`affectedFiles` is what the round may write and `protectedFiles` what it
must not change. The assertion under *Invariants* is a *goal*: it must hold
when the round is done. The one under *The Defect, Measured* is a *premise*:
it holds now, and the round exists to make it stop.

```console
$ npx --no-install @spec-family/spec-brief lint
1 brief(s) checked, no findings
```

## 6. Plan the waves

A second brief, *Record every transfer*, is drafted for wave 1 too, with
`affectedFiles: [src/Ledger.Application/**, src/Ledger.Infrastructure/TransferLog.cs]`.
Two rounds in one *wave* run side by side, so they must not be able to write
the same file:

```console
$ npx --no-install @spec-family/spec-brief matrix
wave 1 · 2 briefs
       001  002
  001    ·    X
  002    X    ·
  X 001 "src/Ledger.Application/Interest.cs" and 002 "src/Ledger.Application/**" both cover src/Ledger.Application/Interest.cs
```

Exit 1. The scopes are compared as globs, so the collision is found although
no pattern repeats the other. `schedule` computes waves that hold, and says
why each brief moves:

```console
$ npx --no-install @spec-family/spec-brief schedule --write
wave 1 · 1 brief
  001  Compute interest in decimal
wave 2 · 1 brief
  002  Record every transfer        moves from wave 1
         wave 1 does not hold: 001 there also writes src/Ledger.Application/Interest.cs
         not wave 1, where 001 also writes src/Ledger.Application/Interest.cs ("src/Ledger.Application/**" and "src/Ledger.Application/Interest.cs")

wrote the wave of 1 brief: briefs/002_record-every-transfer.md
```

## 7. Approve the brief and start the round

The first human gate: Pat reads brief 001 - its scope and what it protects -
sets it `active`, and commits it. The agent works on a branch named after the
brief, which is how every spec-harness command knows which brief is in play:

```console
$ npx --no-install @spec-family/spec-brief list
ID   STATUS  WAVE  TASKS  READY  TITLE
001  active  1     0/1    yes    Compute interest in decimal
002  draft   2     0/2    no     Record every transfer
$ git switch -c brief/001-compute-interest
$ npx --no-install @spec-family/spec-harness context
# Round 001: Compute interest in decimal

Status active · wave 1 · branch `brief/001-compute-interest` · measured from `main`

## The contract
…
## Scope, as the guard reads it

May write:
- `src/Ledger.Application/Interest.cs`

Must not change without a ruling:
- `src/Ledger.Domain/**`

Rulings in force:
- none
…
## Rules in force for this scope

### docs/adr/0001-dependencies-point-inward.md

- line 12: src must keep its layers in order, Ledger.Domain < Ledger.Application < Ledger.Infrastructure - dependencies point inward
…
## Documents the brief cites

### `docs/adr/0002-money-is-decimal.md` - ADR-0002: Money is a decimal (accepted)
…
```

That is the *context packet*: the brief in full, then what it implies. Before
each write the agent can ask, and with `init`'s hooks Claude Code asks on its
own:

```console
$ npx --no-install @spec-family/spec-harness guard src/Ledger.Application/Interest.cs
ok       src/Ledger.Application/Interest.cs is in brief 001's scope (src/Ledger.Application/Interest.cs)
$ npx --no-install @spec-family/spec-harness guard src/Ledger.Application/Transfers.cs
warning  src/Ledger.Application/Transfers.cs is outside brief 001's scope, which covers src/Ledger.Application/Interest.cs
         if the round needs it, say so in briefs/001_compute-interest-in-decimal.md and add it to affectedFiles; the archive reports every file outside the scope
$ npx --no-install @spec-family/spec-harness guard src/Ledger.Domain/Account.cs
refused  brief 001 does not empower this round to change src/Ledger.Domain/Account.cs (protectedFiles: src/Ledger.Domain/**)
         if the round cannot be done without it, stop and ask for a ruling: spec-harness escalate --path <file> --reason <why>, or the request_escalation tool
```

The same refusal, as the PreToolUse hook answers an `Edit` of `Account.cs`:

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"spec-harness: brief 001 does not empower this round to change src/Ledger.Domain/Account.cs (protectedFiles: src/Ledger.Domain/**). Next: if the round cannot be done without it, stop and ask for a ruling: spec-harness escalate --path <file> --reason <why>, or the request_escalation tool."}}
```

## 8. Escalate, and rule

The agent decides the fix belongs on `Account`, which the brief protects. It
does not work around the refusal; it *escalates*:

```console
$ npx --no-install @spec-family/spec-harness escalate --path src/Ledger.Domain/Account.cs \
    --reason "Interest on a balance is the account's arithmetic; in Account it stays decimal where the balance lives." \
    --option "Allow: one new method, Account.InterestAt; no existing member changes" \
    --option "Refuse: Interest.cs multiplies the public Balance itself" \
    --recommend "Allow; the method is additive."
# Escalation E-001-1
…
## Options

1. **Allow** - one new method, Account.InterestAt; no existing member changes
2. **Refuse** - Interest.cs multiplies the public Balance itself

## The agent recommends

Allow; the method is additive.

## To rule

Allow: `spec-harness rule E-001-1 --allow --note "<what exactly is allowed>"`
Refuse: `spec-harness rule E-001-1 --deny --note "<why>"`
…
```

Exit 1: the round waits on a person. Pat rules, and the *ruling* is a row in
the brief that counts only once Pat's signature is on the commit that wrote
it:

```console
$ npx --no-install @spec-family/spec-harness rule E-001-1 --allow --note "Add Account.InterestAt only."
briefs/001_compute-interest-in-decimal.md now holds ruling R-001-1:

  | R-001-1 | `src/Ledger.Domain/Account.cs` | allow | Add Account.InterestAt only. |

It counts once you commit it signed, with a key the base branch's allowed signers list:

  git commit -S -m "ruling R-001-1: allow" -- briefs/001_compute-interest-in-decimal.md
$ npx --no-install @spec-family/spec-harness rulings
R-001-1  allow  src/Ledger.Domain/Account.cs  not verified: its row is not committed
$ git commit -S -m "ruling R-001-1: allow" -- briefs/001_compute-interest-in-decimal.md
$ npx --no-install @spec-family/spec-harness rulings
R-001-1  allow  src/Ledger.Domain/Account.cs  signed by person@example.test
$ npx --no-install @spec-family/spec-harness guard src/Ledger.Domain/Account.cs
ok       src/Ledger.Domain/Account.cs is protected by brief 001, and ruling R-001-1, signed by person@example.test, allows it
```

An agent can write the same row, and compute any hash; it cannot produce the
signature of a key in the *allowed signers* file as the *base* branch has it.

## 9. Do the work, and audit it

Before the work, the audit says what is missing:

```console
$ npx --no-install @spec-family/spec-harness audit
audit of brief 001 from main (079d71e74bf3)

error    briefs/001_compute-interest-in-decimal.md:29  "no `double` in `src/Ledger.Application/Interest.cs`" is neither ticked nor dispositioned  archive/open-task
         tick it, or say why under it, as a bullet or as a paragraph after a blank line, starting "**Delegated", "**Accepted debt", "**Rejected"
error    briefs/001_compute-interest-in-decimal.md:31  "double" must not appear in src/Ledger.Application/Interest.cs: expected no matches, found 2  goal-failed
         the round is not done until this holds
warning  briefs/001_compute-interest-in-decimal.md:37  a premise still holds after the round: "double" must appear at least 1 time in src/Ledger.Application/Interest.cs  premise-holds
         the round set out to change what this premise states; check that it did, or move the assertion out of the premises

measured: goals: 0 held, 1 failed · premises: 0 retired, 1 holding · archive: asked · rulings: 1 verified, 0 unverified · dependencies: 0 changed, 0 unread
2 error(s), 1 warning(s), 0 note(s)
```

The `measured:` line says what the audit read, so a part it could not read
shows there instead of passing unseen.

The agent adds `public decimal InterestAt(decimal rate) => Balance * rate;` to
`Account`, makes `Interest.For` return `account.InterestAt(rate)`, ticks the
box, and commits under its own name. Then:

```console
$ npx --no-install @spec-family/spec-harness audit
audit of brief 001 from main (079d71e74bf3)

note     briefs/001_compute-interest-in-decimal.md:7  spec-harness waives protected-file for src/Ledger.Domain/Account.cs: ruling R-001-1, signed by person@example.test, allows it  archive/waived
         review the waiver with the round; it stands where the refusal was
note     briefs/001_compute-interest-in-decimal.md:37  a premise no longer holds, as the round intended: "double" must appear at least 1 time in src/Ledger.Application/Interest.cs  premise-retired
         nothing to do

measured: goals: 1 held, 0 failed · premises: 1 retired, 0 holding · archive: asked · rulings: 1 verified, 0 unverified · dependencies: 0 changed, 0 unread
0 error(s), 0 warning(s), 2 note(s)
```

The goal holds, the premise is retired as intended, and the protected file
the round changed is covered by a signed ruling. The guard only advised; the
audit is the *gate*, and it measured the diff from the base whatever wrote it.

## 10. Archive, and merge

The second human gate. The archive runs on the branch, before the merge,
where the rulings verify:

```console
$ npx --no-install @spec-family/spec-brief archive 001 --dry-run --summary "Interest is computed in decimal."
would move briefs/001_compute-interest-in-decimal.md -> briefs/archive/001_compute-interest-in-decimal.md
  1 relative link rewritten
  the round changed 3 files

briefs/001_compute-interest-in-decimal.md
  7  note     spec-harness waives protected-file for src/Ledger.Domain/Account.cs: ruling R-001-1, signed by person@example.test, allows it  waived
              review the waiver with the round; it stands where the refusal was

banner:
  <!-- spec-brief:banner -->
  > **Archived 2026-11-09.**
  > Interest is computed in decimal.
  > Recorded at commit `7c4d711`: 3 files changed, +10 −2.
  > Relative links were rewritten to resolve from `briefs/archive/` (1); no other word changed.
  > The body below describes the tree before execution and is not maintained.
  <!-- /spec-brief:banner -->
```

Pat reads the plan, runs it without `--dry-run`, commits the result, and
merges with a merge commit, which keeps the signed ruling's commit as it was
(see [merge settings](adopting.md#merge-settings-that-keep-rulings)):

```console
$ npx --no-install @spec-family/spec-brief archive 001 --summary "Interest is computed in decimal."
moved briefs/001_compute-interest-in-decimal.md -> briefs/archive/001_compute-interest-in-decimal.md
…
nothing was committed; review the change and commit it with the round
$ git add -A && git commit -m "Archive brief 001"
$ git switch main && git merge --no-ff -m "Merge brief 001: compute interest in decimal" brief/001-compute-interest
$ git log --oneline --graph -6
*   5176739 Merge brief 001: compute interest in decimal
|\
| * 9652fea Archive brief 001
| * 7c4d711 Compute interest in decimal (brief 001)
| * 18bc2fa ruling R-001-1: allow
|/
* 09550f1 Briefs 001 and 002; 001 approved
* 7fc6622 Configure the spec tools; Pat signs rulings
$ npx --no-install @spec-family/spec-brief list --archived
ID   STATUS    WAVE  TASKS  READY  TITLE
002  draft     2     0/2    no     Record every transfer
001  archived  1     1/1    -      Compute interest in decimal
```

## In CI

On every change, CI runs the checks, and audits the round where a branch
names one. On `main` now no round is in flight, so `audit --if-round` says so
and passes, and each exits `0`:

```bash
npx --no-install @spec-family/spec-guard
npx --no-install @spec-family/spec-graph check
npx --no-install @spec-family/spec-brief lint
npx --no-install @spec-family/spec-brief matrix
npx --no-install @spec-family/spec-harness premises   # 0 premise(s) in 1 live brief(s), 0 no longer hold
npx --no-install @spec-family/spec-harness audit --if-round   # no brief is named by --brief, SPEC_BRIEF or the branch, so there is no round to audit, and --if-round passes the run
```

And it checks a change against the base branch's rules. Suppose a change
deletes ADR-0001's assertion and adds the forbidden `using` in the same
commit. Its own rules pass; `main`'s do not:

```console
$ npx --no-install @spec-family/spec-guard
spec-guard 2 specs · 1 assertion · javascript

1 passed · 13ms
✔ every spec assertion holds
$ git worktree add --detach ../base main
$ npx --no-install @spec-family/spec-guard "../base/docs/adr/**/*.md"
spec-guard 2 specs · 2 assertions · javascript

✖ ../base/docs/adr/0001-dependencies-point-inward.md:12  @assert-layers
    src must keep its layers in order, Ledger.Domain < Ledger.Application < Ledger.Infrastructure
    expected no violating files, found 1
    reason: dependencies point inward
      src/Ledger.Domain/Account.cs:1:1  Ledger.Domain -> Ledger.Infrastructure: using Ledger.Infrastructure

1 passed · 1 failed · 42ms
```

[Adopting](adopting.md) has both as jobs for GitHub Actions and GitLab CI,
and the forge settings that keep an agent from changing the rules it is
checked against.

## One claim, three tools

A specification can say how far each thing it promises holds, with a label
in code at the head of a list item: `Specified`, `Implemented`. Three tools
read the same claim, each for its own question: spec-guard whether it has
the evidence its label asks for, spec-graph what a change did to it, and
spec-brief whether the round that set out to raise it did.

On `main` again, Pat drafts the specification brief 002's round will build,
`docs/spec/transfers.md`, with one claim, named so that a brief can point at
it:

```markdown
# Transfers

Status: Draft

What the ledger promises about transfers. Each claim opens with how far it
holds: `Specified` is promised and not built, `Implemented` is built and
tested.

<!-- @spec-item id="transfer-log" -->
- `Specified`: every transfer writes one entry to the transfer log.
```

and a register of the decisions still to make, `docs/decisions.md`:

```markdown
# Decisions to make

| ID | Status | Decision |
| --- | --- | --- |
| log-retention | Proposed | How long the transfer log is kept |
```

Each tool is told what the labels mean. spec-guard, in a new
`.spec-guard.json`, which label needs a test, and how a test's name starts:

```json
{
  "claims": {
    "files": ["docs/spec/*.md"],
    "labels": { "Implemented": { "evidence": "test" }, "Specified": {} },
    "testPrefixes": ["public void "]
  }
}
```

spec-graph, in `.spec-graph.json`, which label leaves work open:

```json
{
  "historyPatterns": ["briefs/archive/**"],
  "claims": {
    "files": ["docs/spec/*.md"],
    "labels": { "Implemented": "done", "Specified": "open" }
  }
}
```

and spec-brief the same, with the status that settles a register row, in two
keys added to `.spec-brief.json`:

```json
{
  "claims": { "labels": { "Implemented": "done", "Specified": "open" } },
  "registers": { "settled": ["accepted"] }
}
```

Brief 002's front matter names the claim its round raises and the row it
waits on, and its scope takes in the tests and the specification, whose label
the round is to raise:

```yaml
status: draft
date: 2026-11-09
type: feature
wave: 2
affectedFiles: [src/Ledger.Application/**, src/Ledger.Infrastructure/TransferLog.cs, tests/**, docs/spec/transfers.md]
protectedFiles: [src/Ledger.Domain/**]
raises: [docs/spec/transfers.md#transfer-log]
awaits: [docs/decisions.md#log-retention]
```

Pat commits the draft. `Specified` asks for no evidence, so the claim holds
as it stands:

```console
$ npx --no-install @spec-family/spec-guard claims
spec-guard claims 1 document

options from .spec-guard.json: claims

1 claim: Implemented 0, Specified 1 · 9ms
✔ every claim has the evidence its label asks for
○ 2 labels of the vocabulary stand in prose and are no claims, which only a list item that opens with one is; --verbose says where
$ npx --no-install @spec-family/spec-guard claims --verbose
…
○ 2 labels of the vocabulary stand in prose and are no claims, which only a list item that opens with one is:
    docs/spec/transfers.md:6:8  Specified
    docs/spec/transfers.md:6:47  Implemented
```

The two labels in the sentence that explains them are no claims, and nothing
holds them to anything. The note counts them, `--verbose` says where, and
neither changes the exit code: it is there for a claim written in a sentence
by mistake, which would otherwise pass unseen.

Pat sets brief 002 `active` before deciding how long the log is kept, and
lint stops there. A draft may wait on an open row, with a warning; an active
brief may not:

```console
$ npx --no-install @spec-family/spec-brief lint
briefs/002_record-every-transfer.md
  …
  9  error    awaits "docs/decisions.md#log-retention", which is "proposed"  awaits
              the round starts once the row is "accepted": settle it first, or keep this brief a draft until it is

1 error, 0 warnings, 2 notes in 2 brief(s)
```

Exit 1. Pat accepts the decision, writing it into its row -
`| log-retention | Accepted | The transfer log is kept seven years |` -
accepts the specification, `Status: Accepted`, and commits; the agent starts
the round:

```console
$ npx --no-install @spec-family/spec-brief lint
briefs/002_record-every-transfer.md
  …

0 errors, 0 warnings, 2 notes in 2 brief(s)
$ git add -A && git commit -m "Brief 002 approved; the log is kept seven years"
$ git switch -c brief/002-record-every-transfer
```

The agent adds the log behind an interface in the application layer, so
ADR-0001 still holds, writes a test for it, ticks both boxes, and commits.
The archive refuses the round all the same, since the claim it raises still
says `Specified`:

```console
$ npx --no-install @spec-family/spec-brief archive 002 --dry-run --summary "Every transfer is logged."
cannot archive briefs/002_record-every-transfer.md:
briefs/002_record-every-transfer.md
  8  error    raises "docs/spec/transfers.md#transfer-log", which is still "Specified"  claim-not-raised
              raise it to "Implemented" once its evidence is in, or drop it from raises if this round does not raise it
```

Raising the label is the round's work, and spec-guard holds the raised label
to its evidence. Raised with nothing under it, the claim fails:

```console
$ npx --no-install @spec-family/spec-guard claims
spec-guard claims 1 document

✖ docs/spec/transfers.md:10  `Implemented` needs a test, and no directive under the claim names one (public void )  unevidenced-claim
    hint: write a directive under the claim that counts the test, as <!-- @assert-count target="..." symbol="public void ..." min="1" -->, or lower the label

options from .spec-guard.json: claims

1 claim: Implemented 1, Specified 0 · 8ms
✖ 1 claim finding
○ 2 labels of the vocabulary stand in prose and are no claims, which only a list item that opens with one is; --verbose says where
```

With a directive under it that counts the test, in a document in force, it
holds, and the archive takes the round:

```markdown
<!-- @spec-item id="transfer-log" -->
- `Implemented`: every transfer writes one entry to the transfer log.
  <!-- @assert-count target="tests" symbol="public void Transfer_writes_one_entry" min="1" -->
```

```console
$ npx --no-install @spec-family/spec-guard claims
spec-guard claims 1 document

options from .spec-guard.json: claims

1 claim: Implemented 1, Specified 0 · 18ms
✔ every claim has the evidence its label asks for
○ 2 labels of the vocabulary stand in prose and are no claims, which only a list item that opens with one is; --verbose says where
$ git commit -am "Raise the transfer-log claim"
$ npx --no-install @spec-family/spec-brief archive 002 --dry-run --summary "Every transfer is logged."
would move briefs/002_record-every-transfer.md -> briefs/archive/002_record-every-transfer.md
…
```

What the work did to the documents, from the specification Pat drafted to
the round's last commit, is spec-graph's `diff` of two exports:

```console
$ git worktree add --detach ../draft main~1
$ npx --no-install @spec-family/spec-graph graph --root ../draft --graph-format json > ../draft.json
$ npx --no-install @spec-family/spec-graph graph --graph-format json > ../head.json
$ npx --no-install @spec-family/spec-graph diff ../draft.json ../head.json
2 documents and 1 claim label changed.

Documents
  ~ log-retention  draft -> active; status Proposed -> Accepted; retitled "The transfer log is kept seven years"
  ~ transfers  draft -> active; status Draft -> Accepted

Claims
  raised      transfers: "`Implemented`: every transfer writes one entry to the transfer log." (Specified -> Implemented)
```

A register row is a document to spec-graph, so the decision's row rose with
Pat's approval, retitled by the answer written into it, beside the
specification's `Status:` label; the claim's label rose with the round. A
label lowered, or a document retired, is listed the same way. `diff` exits 0 whatever changed: it describes, and the
checks gate. In CI, `spec-guard claims` joins the checks once `claims` is
configured, and the diff of the base branch and the change can go to the job
summary with `--format markdown`.
