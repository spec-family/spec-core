/**
 * GitLab Code Quality: a JSON array of issues, which a merge request shows
 * beside the lines they are on, and tells new from resolved by their
 * fingerprints (ADR-0005, amended 2026-09-30).
 *
 * A fingerprint is the hash of a finding's identity - its rule, its file or
 * document, and what it is about - and never of its message, hint or line, so
 * a reworded message or a moved line is not one issue resolved and another
 * found. Findings that share an identity are told apart by their order. The
 * hash is the caller's to give, since nothing here imports `node:crypto`;
 * each tool gives SHA-256 in hexadecimal.
 */

import type { Level } from './level.js';

/** GitLab's severities, lowest first. */
export type GitlabSeverity = 'info' | 'minor' | 'major' | 'critical' | 'blocker';

/**
 * The family's mapping: an error is `major`, a warning `minor`, a note
 * `info`. An error fails the run, but it is not the crash or the security hole
 * `critical` and `blocker` say in GitLab's own reports; those are for the
 * cases a tool's reference names.
 */
export function gitlabSeverity(level: Level): GitlabSeverity {
  return level === 'error' ? 'major' : level === 'warning' ? 'minor' : 'info';
}

/**
 * How an identity and its occurrence are written before they are hashed. The
 * tools wrote it two ways, and a change of way reopens every issue once, so
 * each keeps its own until it chooses to move:
 *
 * - `json`, spec-brief's and spec-graph's: the identity as a JSON array, and
 *   for the second and later findings of one identity the array with the
 *   occurrence after it, a number from 2;
 * - `nul`, spec-guard's and spec-harness's: the parts joined by U+0000, and
 *   for the second and later the count of those before it, from 1, joined on.
 */
export type FingerprintEncoding = 'json' | 'nul';

/**
 * What each identity is hashed as, in order, with the occurrence of each that
 * is not the first of its kind. Two identities are one kind where they are
 * written alike, so `nul` takes `['a\u0000b']` and `['a', 'b']` for one, as
 * the tools that write it did.
 */
export function fingerprintKeys(identities: readonly (readonly string[])[], encoding: FingerprintEncoding): string[] {
  const seen = new Map<string, number>();
  return identities.map((identity) => {
    const key = encoding === 'json' ? JSON.stringify(identity) : identity.join('\u0000');
    const before = seen.get(key) ?? 0;
    seen.set(key, before + 1);
    if (before === 0) return key;
    return encoding === 'json' ? JSON.stringify([...identity, before + 1]) : `${key}\u0000${before}`;
  });
}

/** A finding, as a Code Quality issue needs it. */
export interface GitlabFinding {
  readonly rule: string;
  readonly severity: GitlabSeverity;
  /** The message, with the hint after it (`findingText`). */
  readonly text: string;
  /** Repository-relative POSIX. */
  readonly file: string;
  /** From 1; a finding about a whole file is placed on its first line. */
  readonly line: number;
  /** What the finding is about, in parts that stay while it does. */
  readonly identity: readonly string[];
}

/** One issue, with the five fields GitLab reads, in the order the tools write them. */
export interface GitlabIssue {
  readonly description: string;
  readonly check_name: string;
  readonly fingerprint: string;
  readonly severity: GitlabSeverity;
  readonly location: { readonly path: string; readonly lines: { readonly begin: number } };
}

/** The issues of a report, for the caller to write with `JSON.stringify`. */
export function gitlabIssues(findings: readonly GitlabFinding[], hash: (key: string) => string, encoding: FingerprintEncoding): GitlabIssue[] {
  const keys = fingerprintKeys(
    findings.map((finding) => finding.identity),
    encoding,
  );
  return findings.map((finding, index) => ({
    description: finding.text,
    check_name: finding.rule,
    fingerprint: hash(keys[index]!),
    severity: finding.severity,
    location: { path: finding.file, lines: { begin: Math.max(finding.line, 1) } },
  }));
}
