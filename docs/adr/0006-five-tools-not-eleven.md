---
status: accepted
date: 2026-09-26
---

# ADR-0006: Five tools, not eleven

## Context

By 2026-09-24 the family had three tools and plans for eight more: a shared
core, `spec-brief-author`, and six from planning prompts written on
2026-09-13 - `spec-decompose`, `spec-probe`, `agent-brief-harness`,
`spec-escalate`, `spec-mutation` and `spec-code-graph`. A review of the plans
against the code found three kinds of trouble:

1. **Overlap.** `spec-brief-author` duplicated the harness and decompose. The
   harness's MCP server duplicated spec-guard's. Code-graph's "specification
   layer" was spec-graph, and its import analysis was spec-guard's.
   Mutation's "vacuous green" was partly caught by spec-guard already.
2. **Conflict with decisions already taken.** `decomposition.json` and
   `.escalation/` state files against "the brief is the record"; automatic
   rollback and stash against "never write git"; Tree-sitter WASM (94 MB,
   measured by spec-guard ADR-0008) against zero dependencies; regex strings in
   configuration against "no pattern compiles to `RegExp`"; mutation scores as
   targets against scores as measured floors.
3. **Promises that cannot be kept as written.** A SHA-256 over token, option,
   time and actor is not a signature: the agent can compute it. Decomposing a
   goal written in prose is an LLM's work, not a zero-dependency tool's.
   Stopping an agent from a stream it has already acted on is too late.
   Symbol-level call graphs need a parser the family does not have.

Eleven repositories, each with CI, ADRs, releases and a mutation sweep, is also
more than one maintainer can hold to the standard the first three set.

## Decision

**Five repositories.** Each planned tool's deterministic part moves into the
tool whose data it needs; each non-deterministic part goes to the agent,
guided by prompts, and checked by a tool.

| Planned | Where it lives | What changed |
| --- | --- | --- |
| spec-core | **spec-core** | modules: `path`, `text`, `pattern`, `markdown`, `jsonrpc`, `color`, `report` |
| spec-brief-author | cancelled | its context, guard and status became spec-harness; its wave scheduling became `spec-brief schedule` |
| agent-brief-harness | **spec-harness** | the family's one agent-facing tool; named like its siblings |
| spec-probe | `spec-harness probe` | runs a declared test at the base commit in a temporary worktree; a failure signature is declared (JUnit XML or exit code and message), not compared as prose |
| spec-escalate | `spec-harness escalate` / `rule`, and a spec-brief hook | the ruling is a signed git object verified against allowed signers from the base branch; spec-brief's archive accepts a verified ruling for a protected path |
| spec-decompose | `spec-brief schedule`, plus prompts | cycles, waves by layering and collision colouring, deferrals with observable triggers - all deterministic; the prose goal is the agent's |
| spec-mutation | `spec-guard prove` | mutations applied in memory through spec-guard's `Io`, so every assertion is shown to fail on a violation it should catch |
| spec-code-graph | `spec-guard cites` and `spec-guard impact` | citations of specs in code comments (ghost and superseded ones) and module-level blast radius from spec-guard's import graph; symbol level waits for a parser API |

The family, by the question each tool answers:

| Tool | Question |
| --- | --- |
| spec-brief | Is this round's contract complete, can these rounds run in parallel, and is this one really done? |
| spec-graph | Do the documents agree with each other? |
| spec-guard | Does the code do what the documents say, and can each rule actually fail? |
| spec-harness | What does an agent need to start this round, may it touch this file, and did it stay inside the lines? |
| spec-core | (none - it is how the other four read Markdown, paths and patterns the same way) |

## Consequences

- One new repository, `spec-harness`, instead of seven.
- The smallest useful install is still one tool: spec-guard alone guards the
  code; spec-brief alone manages rounds. spec-harness is the entry point for a
  repository that wants the whole loop, and its `init` configures the others
  to agree from the first day.
- Whether a folded feature earns a repository of its own is decided the way
  ADR-0001 decides for the core: when its users, its maintainer or its release
  rhythm diverge from its host's.
