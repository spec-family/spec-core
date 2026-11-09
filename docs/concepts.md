# Concepts

The words the spec-\* tools use, each in a sentence or two, with a link to
where the tool that owns it defines it. The [tutorial](tutorial.md) shows
every one of them at work on a small repository.

## The work

### Brief

The contract for one round of work: a Markdown file in `briefs/` whose front
matter holds its status, `wave`, `dependsOn`, `affectedFiles` and
`protectedFiles`, and whose sections say what done looks like, what the round
must not do, and the checks that prove it finished. It is the record: no
manifest or index says anything a brief does not
([spec-brief](https://github.com/spec-family/spec-brief#a-brief),
[ADR-0002](https://github.com/spec-family/spec-brief/blob/main/docs/adr/0002-the-brief-is-the-record.md)).

A brief's status is one of four words, each configurable: `draft` (not yet
approved), `active` (the round may run), `deferred` (put off until the event
its `trigger` names) and `archived` (closed). How each tool reads status
words in general is the lifecycle table of
[ADR-0005](adr/0005-the-family-contract.md#documents-and-state). Those words
are English, and no tool reads a translation: a document may be written in
any language, and gives its status in English.

### Round

The work one brief describes, from the person's approval to the archive,
done by an agent on a branch named after the brief (`brief/012-rotate-tokens`
works on brief 012) and measured against the [base](#base). The branch (in
CI, the one the forge's variables name), the `--brief` flag or `SPEC_BRIEF`
names the brief; nothing guesses it
([spec-harness](https://github.com/spec-family/spec-harness/blob/main/docs/reference/rounds.md#a-round),
[ADR-0004](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0004-the-active-brief-is-named-not-guessed.md)).

### Wave

A number in a brief's front matter: rounds in the same wave run side by side,
so no two of them may be able to write the same file. `spec-brief matrix`
checks the briefs of a wave against each other as globs, and `spec-brief
schedule` computes the waves from the dependencies and the collisions
([spec-brief](https://github.com/spec-family/spec-brief#spec-brief-schedule),
[ADR-0011](https://github.com/spec-family/spec-brief/blob/main/docs/adr/0011-waves-are-computed-not-guessed.md)).

### dependsOn

The ids of the briefs a brief runs after. A brief is *ready* when every brief
it depends on is archived and it is neither a draft nor deferred, and it
belongs in a later wave than every dependency still live
([spec-brief](https://github.com/spec-family/spec-brief#spec-brief-list)).

## Scope

### affectedFiles

The globs a round may write, in spec-core's `path` dialect
([ADR-0003](adr/0003-glob-dialects.md)). A path with no glob syntax is read
from the tree; `src/newmod/` names a directory the round will create
([spec-brief](https://github.com/spec-family/spec-brief#a-brief)).

### protectedFiles

What the round is not empowered to change. Protection wins over
`affectedFiles`: the guard refuses a write to it and the archive refuses a
round that changed it, unless a signed [ruling](#ruling) allows the path
([spec-brief](https://github.com/spec-family/spec-brief#a-brief),
[spec-harness](https://github.com/spec-family/spec-harness/blob/main/docs/reference/guard.md#guard-path-and-the-hooks)).

### outOfScope

spec-harness's answer to a write outside `affectedFiles` that no protection
covers: `warn` (the default, after the write), `ask` (the person decides) or
`deny`. The archive reports every such file whatever the setting. It is a key
in `.spec-harness.json`, not the brief's *Negative Scope* section, which is
prose the agent reads
([spec-harness](https://github.com/spec-family/spec-harness/blob/main/docs/reference/configuration.md#configuration)).

## Checks

### Assertion

An HTML comment such as `<!-- @assert-absence target="src/" symbol="LegacyGateway" -->`
under the sentence it makes executable. spec-guard runs it against the code:
in an ADR it is a rule the code keeps, in a brief it is a [goal](#goal) or a
[premise](#premise). `spec-guard prove` shows each rule a violation of itself,
so a rule that cannot fail is found
([spec-guard](https://github.com/spec-family/spec-guard#directives),
[ADR-0016](https://github.com/spec-family/spec-guard/blob/main/docs/adr/0016-rules-seen-to-fail.md)).

### Goal

An assertion in a brief outside its premise sections: what must hold when the
round is done. `spec-harness audit` fails the round while a goal fails
(`goal-failed`); CI does not run goals, since each fails until its round is
done ([spec-harness](https://github.com/spec-family/spec-harness/blob/main/docs/reference/audit.md#audit-brief)).

### Premise

An assertion in a brief under a premise section (`The Defect, Measured`,
`Premises` or `Preconditions` by default): what was true before the round,
such as the defect measured. `spec-harness premises` runs them for every live
brief in CI; one that no longer holds is `stale-premise`, the defect gone
another way, except on the brief a round is working on, where that is the work
(`premise-retired`)
([spec-harness](https://github.com/spec-family/spec-harness/blob/main/docs/reference/premises.md#premises)).
spec-graph's rule of the same name is a different check: a document resting
on a decision that was retired
([spec-graph](https://github.com/spec-family/spec-graph#what-it-checks)).

### Claim

A list item in a specification that opens with a label in code, such as
`` `Implemented`: a refund over the captured amount is refused. ``, saying
how far what it states holds; `<!-- @spec-item id="refund-limit" -->` above
it gives it a name. What each label means is each tool's configuration.
`spec-guard claims` holds a claim to the evidence its label asks for, such as
a test a directive under it counts; spec-graph reads the label as the item's
state, and `spec-graph diff` lists a label raised or lowered; a brief names
the claims its round raises in `raises`, and spec-brief's archive refuses the
round while one still says the work is open. Its `awaits` names a register
row whose status must settle before the round starts. A label written in a
sentence is no claim, and `spec-guard claims` counts those in a note
([the tutorial](tutorial.md#one-claim-three-tools),
[spec-guard ADR-0020](https://github.com/spec-family/spec-guard/blob/main/docs/adr/0020-a-claim-is-held-to-its-evidence.md),
[spec-graph ADR-0024](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0024-a-claims-label-is-its-state.md),
[spec-brief ADR-0012](https://github.com/spec-family/spec-brief/blob/main/docs/adr/0012-a-brief-names-the-claims-it-raises.md)).

### Probe

A test a defect brief carries in a fenced `probe` block, with how it must
fail: a `signature` in the output, or a JUnit `test`. `spec-harness probe`
runs it in a temporary worktree at the base, where every run must fail for
that reason, and at the head, where every run must pass
([spec-harness](https://github.com/spec-family/spec-harness/blob/main/docs/reference/probe.md#probe-brief),
[ADR-0007](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0007-probes-declare-their-failure.md)).

## People and rulings

### Escalation

An agent's request for a ruling when the round cannot be done without a
protected file: `spec-harness escalate` (or the MCP tool
`request_escalation`) records it under the git directory, outside the working
tree, and prints a memo with the options, what each costs, and the agent's
recommendation
([spec-harness](https://github.com/spec-family/spec-harness/blob/main/docs/reference/rulings.md#escalate-rule-rulings),
[ADR-0003](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0003-state-outside-the-work-tree.md)).

### Ruling

A person's answer to an escalation, `allow` or `deny`, written by
`spec-harness rule` as a row of the brief's `## Rulings` table. It counts only
when the commit that last changed the row is signed by a key the
[allowed signers](#allowed-signers) list: an agent can write the row, but not
the signature
([spec-harness](https://github.com/spec-family/spec-harness/blob/main/docs/reference/rulings.md#escalate-rule-rulings),
[ADR-0006](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0006-a-ruling-is-a-signed-commit.md)).
A forge that rewrites commits when it merges drops the signature; see
[merge settings](adopting.md#merge-settings-that-keep-rulings).

What a ruling proves is that the agent did not sign it: the commit that
last changed its row is signed by a key the base branch's allowed-signers
file names, and the agent cannot use that key - kept away from its account,
or a FIDO2 key (`ed25519-sk`), whose every signature needs a touch no
process can supply
([adopting](adopting.md#3-give-the-agent-and-the-person-different-identities)).
What it does not prove is that a second person looked. A ruling is not
two-person review or separation of duties: one person may write the brief,
run the round and sign its rulings, and nothing checks that the signer is
someone other than the brief's author.

### Allowed signers

The OpenSSH allowed-signers file that names who may sign rulings,
`.github/allowed_signers` by default (`rulings.allowedSigners`), one line per
person: `<email> namespaces="git" <public key>`. It is read from the base
branch, never from the round's own tree, so a round cannot add a signer
([spec-harness](https://github.com/spec-family/spec-harness/blob/main/docs/reference/configuration.md#configuration)).

### Base

The branch rounds start from and merge into, `base` in `.spec-harness.json`,
which `init` also writes as spec-brief's `archiving.base`. A round's changes
are its diff from the merge base, the allowed signers are read on the base,
and CI checks a change against the base branch's rules, not the ones the
change carries ([spec-harness](https://github.com/spec-family/spec-harness/blob/main/docs/reference/init.md#init),
[adopting](adopting.md#2-check-a-change-against-the-base-branchs-rules)).

## Ending a round

### Guard and gate

The guard answers at each write - spec-harness's Claude Code hooks,
`spec-harness guard`, the git pre-commit hook - and is a guardrail: an agent
that writes through a shell passes it. The gates measure what the round
actually changed, whatever wrote it: `spec-harness audit`, `spec-brief
archive`, and CI
([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).

### Audit

One report at the end of a round: what the archive would refuse, the brief's
goals and premises through spec-guard, rulings whose signatures do not verify,
and every dependency the round added. A part that could not be measured is a
finding, never a silence
([spec-harness](https://github.com/spec-family/spec-harness/blob/main/docs/reference/audit.md#audit-brief)).

### Archive

Closing a round with `spec-brief archive`: refused while the brief has lint
errors, an open box, a live dependency or a protected file changed without a
ruling; otherwise it moves the brief to the archive directory with status
`archived`, a banner and an integrity hash, in one transaction. An archived
brief is a record, frozen: every tool reads it as history, not as a retired
decision
([spec-brief](https://github.com/spec-family/spec-brief#spec-brief-archive-brief),
[ADR-0004](https://github.com/spec-family/spec-brief/blob/main/docs/adr/0004-archival-is-a-planned-transaction.md),
[spec-graph ADR-0011](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0011-a-record-is-not-a-specification.md)).

### Dispositions

The words that close a task box without ticking it: a note under the box that
starts with `**Delegated`, `**Accepted debt` or `**Rejected`
(`archiving.dispositions`), saying where the work went or why it was not done
([spec-brief](https://github.com/spec-family/spec-brief#spec-brief-archive-brief)).

## The agent's side

### Context packet

What `spec-harness context`, or the MCP tool `start_round`, gives an agent at
the start of a round: the brief in full, its scope as the guard reads it, the
rulings, its dependencies, the rules spec-guard holds over the scope, and the
documents the brief links to, until `context.budget` characters; a document
left out is named by path
([spec-harness](https://github.com/spec-family/spec-harness/blob/main/docs/reference/context.md#context-brief)).

### Two kinds of plugin

- **A spec-brief plugin** is a module named in `plugins` in
  `.spec-brief.json`: it adds rules to `lint`, and may `waive` an archive
  refusal it can check. spec-harness ships one,
  `@spec-family/spec-harness/spec-brief-plugin`, which reads signed rulings,
  so the archive accepts a protected file a ruling allows, and says
  `spec-harness waives` where it does
  ([spec-brief](https://github.com/spec-family/spec-brief#plugins),
  [ADR-0007](https://github.com/spec-family/spec-brief/blob/main/docs/adr/0007-integrations-are-plugins.md)).
- **The Claude Code plugin** is the spec-harness repository installed into
  Claude Code (`/plugin install spec-harness@spec-tools`): four skills, the
  guard hooks and the MCP server. The hooks and server are the ones
  `spec-harness init` writes into `.claude/settings.json` and `.mcp.json`, so
  a repository uses one or the other
  ([spec-harness](https://github.com/spec-family/spec-harness/blob/main/docs/reference/install.md#as-a-claude-code-plugin),
  [ADR-0012](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0012-one-way-into-claude-code.md)).
