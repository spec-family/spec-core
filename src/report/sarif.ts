/**
 * SARIF 2.1.0, which GitHub code scanning reads into alerts and an editor
 * into its problems pane (ADR-0005).
 *
 * The four tools each built the log themselves, alike in its frame and apart
 * in its parts: spec-graph alone gave columns and related locations,
 * spec-brief and spec-harness alone named `%SRCROOT%`, spec-brief alone gave
 * no fingerprint, and none gave a rule a page to read. This builds the frame
 * and every part any of them gave, each where the caller gives it, and leaves
 * writing it to the caller. Deterministic: no time, no path of the machine.
 */

import type { Level } from './level.js';

/** A rule the log describes: each that fired in the run, not each the tool has. */
export interface SarifRule {
  readonly id: string;
  /** One sentence on what the rule finds. */
  readonly text: string;
  /** The level the rule has unless a configuration changes it. */
  readonly level?: Level | undefined;
  /** A page that explains the rule: a release's reference, at its tag. */
  readonly helpUri?: string | undefined;
}

/** Where in a file: a line from 1, and the rest where the tool knows it. */
export interface SarifRegion {
  readonly line: number;
  readonly column?: number | undefined;
  readonly endLine?: number | undefined;
  readonly endColumn?: number | undefined;
}

/** A place a result points at, and what it says of it. */
export interface SarifRelated {
  readonly file: string;
  readonly region: SarifRegion;
  readonly text: string;
}

export interface SarifResult {
  readonly rule: string;
  readonly level: Level;
  /** The message, with the hint after it (`findingText`). */
  readonly text: string;
  /** Repository-relative POSIX. */
  readonly file: string;
  readonly region: SarifRegion;
  readonly related?: readonly SarifRelated[] | undefined;
  /**
   * What tells this alert from another across commits, by name: a hash of
   * the finding's identity, which the caller makes with its own hash.
   */
  readonly fingerprints?: Readonly<Record<string, string>> | undefined;
  /** Anything else the tool says of the result. */
  readonly properties?: Readonly<Record<string, unknown>> | undefined;
}

export interface SarifRun {
  /** The command's name, `spec-graph`. */
  readonly name: string;
  /** The release, written as SARIF's `version` and `semanticVersion`. */
  readonly version?: string | undefined;
  /** The tool's repository. */
  readonly informationUri: string;
  readonly rules: readonly SarifRule[];
  readonly results: readonly SarifResult[];
  /**
   * Whether each file is given relative to `%SRCROOT%`, which code scanning
   * resolves to the checkout. A path is repository-relative either way.
   */
  readonly sourceRoot?: boolean | undefined;
  /**
   * What the run measured, as notes of its invocation: SARIF's place for what
   * happened in a run that is not a finding, so a log with no result still
   * says what was checked.
   */
  readonly notes?: readonly string[] | undefined;
}

const SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';

/** The log of one run, for the caller to write with `JSON.stringify`. */
export function sarifLog(run: SarifRun): Record<string, unknown> {
  const location = (file: string, region: SarifRegion): Record<string, unknown> => ({
    physicalLocation: {
      artifactLocation: run.sourceRoot === true ? { uri: file, uriBaseId: '%SRCROOT%' } : { uri: file },
      region: {
        startLine: region.line,
        ...(region.column === undefined ? {} : { startColumn: region.column }),
        ...(region.endLine === undefined ? {} : { endLine: region.endLine }),
        ...(region.endColumn === undefined ? {} : { endColumn: region.endColumn }),
      },
    },
  });
  return {
    $schema: SCHEMA,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: run.name,
            ...(run.version === undefined ? {} : { version: run.version, semanticVersion: run.version }),
            informationUri: run.informationUri,
            rules: run.rules.map((rule) => ({
              id: rule.id,
              shortDescription: { text: rule.text },
              ...(rule.level === undefined ? {} : { defaultConfiguration: { level: rule.level } }),
              ...(rule.helpUri === undefined ? {} : { helpUri: rule.helpUri }),
            })),
          },
        },
        ...(run.notes === undefined || run.notes.length === 0
          ? {}
          : {
              invocations: [
                {
                  executionSuccessful: true,
                  toolExecutionNotifications: run.notes.map((note) => ({ level: 'note', message: { text: note } })),
                },
              ],
            }),
        results: run.results.map((result) => ({
          ruleId: result.rule,
          level: result.level,
          message: { text: result.text },
          locations: [location(result.file, result.region)],
          ...(result.related === undefined || result.related.length === 0
            ? {}
            : { relatedLocations: result.related.map((entry) => ({ ...location(entry.file, entry.region), message: { text: entry.text } })) }),
          ...(result.fingerprints === undefined ? {} : { partialFingerprints: result.fingerprints }),
          ...(result.properties === undefined ? {} : { properties: result.properties }),
        })),
      },
    ],
  };
}
