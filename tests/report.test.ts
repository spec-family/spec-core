/**
 * The report formats, against the four tools' own writers.
 *
 * Each reference below is a tool's writer as its main had it on 2026-11-12 -
 * spec-brief e5db4f1 `src/report.ts`, spec-graph 734f8a8 `src/report.ts`,
 * spec-guard ad46b21 `src/reporter.ts`, spec-harness 377ee47
 * `src/formats.ts` - cut to what it builds from a finding, with the tool's
 * own types and tables made parameters, and nothing else changed. A test
 * gives the core function what the tool would give it and asks for what the
 * tool wrote; where the core function writes something more, the test names
 * it.
 */

import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  escapeData,
  escapeProperty,
  findingText,
  fingerprintKeys,
  githubCommand,
  gitlabIssues,
  gitlabSeverity,
  sarifLog,
  type Level,
} from '../src/report/index.js';

const sha256 = (key: string): string => createHash('sha256').update(key).digest('hex');

/* ------------------------------------------------------------ references */

interface BriefFinding {
  readonly rule: string;
  readonly severity: Level;
  readonly file: string;
  readonly line: number;
  readonly message: string;
  readonly hint?: string;
  readonly brief?: string;
  readonly subject?: string;
}

function refEscapeData(text: string): string {
  return text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function refEscapeProperty(text: string): string {
  return refEscapeData(text).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

const BRIEF_GITHUB: Readonly<Record<Level, string>> = { error: 'error', warning: 'warning', note: 'notice' };

function briefGithub(findings: readonly BriefFinding[]): string {
  return findings
    .map((f) => {
      const message = f.hint === undefined ? f.message : `${f.message}. ${f.hint}`;
      const properties = `file=${refEscapeProperty(f.file)},line=${f.line},title=${refEscapeProperty(`spec-brief ${f.rule}`)}`;
      return `::${BRIEF_GITHUB[f.severity]} ${properties}::${refEscapeData(message)}\n`;
    })
    .join('');
}

const BRIEF_GITLAB: Readonly<Record<Level, string>> = { error: 'major', warning: 'minor', note: 'info' };

function briefIdentity(f: BriefFinding): readonly string[] {
  return [f.rule, f.file, f.brief ?? '', f.subject ?? ''];
}

function briefGitlab(findings: readonly BriefFinding[]): unknown[] {
  const seen = new Map<string, number>();
  return findings.map((f) => {
    const key = JSON.stringify(briefIdentity(f));
    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);
    return {
      description: f.hint === undefined ? f.message : `${f.message}. ${f.hint}`,
      check_name: f.rule,
      fingerprint: createHash('sha256')
        .update(occurrence === 1 ? key : JSON.stringify([...briefIdentity(f), occurrence]))
        .digest('hex'),
      severity: BRIEF_GITLAB[f.severity],
      location: { path: f.file, lines: { begin: f.line } },
    };
  });
}

function briefSarif(findings: readonly BriefFinding[], version: string, described: ReadonlyMap<string, { description: string; severity: Level | 'off' }>): unknown {
  const ids = [...new Set(findings.map((f) => f.rule))].sort();
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'spec-brief',
            version,
            informationUri: 'https://github.com/spec-family/spec-brief',
            rules: ids.map((id) => {
              const rule = described.get(id);
              return {
                id,
                shortDescription: { text: rule?.description ?? id },
                ...(rule !== undefined && rule.severity !== 'off' ? { defaultConfiguration: { level: rule.severity } } : {}),
              };
            }),
          },
        },
        results: findings.map((f) => ({
          ruleId: f.rule,
          level: f.severity,
          message: { text: f.hint === undefined ? f.message : `${f.message}. ${f.hint}` },
          locations: [{ physicalLocation: { artifactLocation: { uri: f.file, uriBaseId: '%SRCROOT%' }, region: { startLine: f.line } } }],
        })),
      },
    ],
  };
}

interface HarnessFinding {
  readonly rule: string;
  readonly severity: Level;
  readonly message: string;
  readonly hint: string;
  readonly file?: string;
  readonly line?: number;
  readonly subject?: string;
}

function harnessPlace(findings: readonly HarnessFinding[], fallback: string): { finding: HarnessFinding; file: string; line: number; fingerprint: string }[] {
  const seen = new Map<string, number>();
  return findings.map((finding) => {
    const file = finding.file ?? fallback;
    const identity = [finding.rule, file, finding.subject ?? ''].join('\u0000');
    const repeat = seen.get(identity) ?? 0;
    seen.set(identity, repeat + 1);
    const fingerprint = createHash('sha256').update(repeat === 0 ? identity : `${identity}\u0000${repeat}`).digest('hex');
    return { finding, file, line: Math.max(finding.line ?? 1, 1), fingerprint };
  });
}

function harnessText(finding: HarnessFinding): string {
  return `${finding.message.replace(/\.$/, '')}. ${finding.hint}`;
}

function harnessGitlab(findings: readonly HarnessFinding[], fallback: string): unknown[] {
  return harnessPlace(findings, fallback).map(({ finding, file, line, fingerprint }) => ({
    description: harnessText(finding),
    check_name: finding.rule,
    fingerprint,
    severity: BRIEF_GITLAB[finding.severity],
    location: { path: file, lines: { begin: line } },
  }));
}

function harnessGithub(findings: readonly HarnessFinding[], fallback: string): string {
  return harnessPlace(findings, fallback)
    .map(({ finding, file, line }) => {
      const properties = `file=${refEscapeProperty(file)},line=${line},title=${refEscapeProperty(`spec-harness ${finding.rule}`)}`;
      return `::${BRIEF_GITHUB[finding.severity]} ${properties}::${refEscapeData(harnessText(finding))}\n`;
    })
    .join('');
}

function harnessSarif(findings: readonly HarnessFinding[], fallback: string, version: string, summary: string | undefined, describe: (id: string) => string): unknown {
  const placed = harnessPlace(findings, fallback);
  const ids = [...new Set(findings.map((finding) => finding.rule))].sort();
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        ...(summary === undefined
          ? {}
          : { invocations: [{ executionSuccessful: true, toolExecutionNotifications: [{ level: 'note', message: { text: summary } }] }] }),
        tool: {
          driver: {
            name: 'spec-harness',
            version,
            informationUri: 'https://github.com/spec-family/spec-harness',
            rules: ids.map((id) => ({ id, shortDescription: { text: describe(id) } })),
          },
        },
        results: placed.map(({ finding, file, line, fingerprint }) => ({
          ruleId: finding.rule,
          level: finding.severity,
          message: { text: harnessText(finding) },
          locations: [{ physicalLocation: { artifactLocation: { uri: file, uriBaseId: '%SRCROOT%' }, region: { startLine: line } } }],
          partialFingerprints: { specHarnessFinding: fingerprint },
        })),
      },
    ],
  };
}

interface GraphDiagnostic {
  readonly rule: string;
  readonly severity: 'error' | 'warn' | 'info';
  readonly message: string;
  readonly hint: string;
  readonly file: string;
  readonly line: number;
}

function graphGithub(diagnostics: readonly GraphDiagnostic[], escalated: ReadonlySet<string>): string {
  const level = (severity: GraphDiagnostic['severity']): string => (severity === 'error' ? 'error' : severity === 'warn' ? 'warning' : 'notice');
  return diagnostics
    .map((diagnostic) => {
      const title = escalated.has(diagnostic.rule) ? `${diagnostic.rule} (strict)` : diagnostic.rule;
      const place = `file=${refEscapeProperty(diagnostic.file)},line=${diagnostic.line}`;
      return `::${level(diagnostic.severity)} ${place},title=${refEscapeProperty(title)}::${refEscapeData(`${diagnostic.message}. ${diagnostic.hint}`)}\n`;
    })
    .join('');
}

function graphGitlabKeys(identities: readonly (readonly string[])[]): string[] {
  const occurrences = new Map<string, number>();
  return identities.map((identity) => {
    const key = JSON.stringify(identity);
    const occurrence = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, occurrence);
    return occurrence === 1 ? key : JSON.stringify([...identity, occurrence]);
  });
}

interface GuardAnnotation {
  readonly rule: string;
  readonly identity: readonly string[];
  readonly level: 'error' | 'warning' | 'notice';
  readonly file: string;
  readonly line: number;
  readonly message: string;
  readonly hint?: string;
}

function guardGithub(annotations: readonly GuardAnnotation[]): string {
  const described = (annotation: GuardAnnotation): string => (annotation.hint === undefined ? annotation.message : `${annotation.message}. ${annotation.hint}`);
  return annotations
    .map(
      (annotation) =>
        `::${annotation.level} file=${refEscapeProperty(annotation.file)},line=${Math.max(annotation.line, 1)},title=${refEscapeProperty(annotation.rule)}::${refEscapeData(described(annotation))}`,
    )
    .join('\n');
}

function guardKeys(annotations: readonly { identity: readonly string[] }[]): string[] {
  const seen = new Map<string, number>();
  return annotations.map(({ identity }) => {
    const key = identity.join('\u0000');
    const repeat = seen.get(key) ?? 0;
    seen.set(key, repeat + 1);
    return (repeat === 0 ? identity : [...identity, String(repeat)]).join('\u0000');
  });
}

/* ----------------------------------------------------------------- inputs */

const BRIEF: readonly BriefFinding[] = [
  { rule: 'missing-section', severity: 'error', file: 'docs/briefs/001-a.md', line: 3, message: 'brief 001 has no Intent', hint: 'write what the round is for', brief: '001', subject: 'Intent' },
  { rule: 'missing-section', severity: 'error', file: 'docs/briefs/001-a.md', line: 9, message: 'brief 001 has no Intent', hint: 'write what the round is for', brief: '001', subject: 'Intent' },
  { rule: 'glob, odd: name', severity: 'warning', file: 'docs/a,b:c%.md', line: 1, message: 'two\nlines\r100%', brief: '002' },
  { rule: 'unscoped', severity: 'note', file: 'docs/briefs/003-c.md', line: 12, message: 'nothing scoped' },
  { rule: 'missing-section', severity: 'error', file: 'docs/briefs/001-a.md', line: 20, message: 'brief 001 has no Intent', hint: 'write it', brief: '001', subject: 'Intent' },
];

const HARNESS: readonly HarnessFinding[] = [
  { rule: 'out-of-scope', severity: 'warning', message: 'src/a.ts is outside the scope.', hint: 'add it to affectedFiles', file: 'src/a.ts', line: 0 },
  { rule: 'out-of-scope', severity: 'warning', message: 'src/a.ts is outside the scope', hint: 'add it to affectedFiles', file: 'src/a.ts' },
  { rule: 'unsigned-ruling', severity: 'error', message: 'ruling 2 is not signed', hint: 'sign it', subject: '2' },
  { rule: 'out-of-scope', severity: 'note', message: 'x', hint: 'y', file: 'src/a.ts', line: 7 },
];

const briefGithubAnnotation = (f: BriefFinding): Parameters<typeof githubCommand>[0] => ({
  level: f.severity,
  file: f.file,
  line: f.line,
  title: `spec-brief ${f.rule}`,
  text: f.hint === undefined ? f.message : findingText(f.message, f.hint),
});

const harnessFile = (f: HarnessFinding): string => f.file ?? 'docs/briefs/007-x.md';

/* ------------------------------------------------------------------ tests */

describe('GitHub workflow commands', () => {
  const samples = ['', 'plain', '100%', '%0A', 'a\nb', 'a\r\nb', 'a:b,c', '::error::', 'C:\\x,y', '%%\r\r\n\n::,,', 'ünï cödé'];

  it('escapes a message and a property as each tool did', () => {
    for (const sample of samples) {
      expect(escapeData(sample), JSON.stringify(sample)).toBe(refEscapeData(sample));
      expect(escapeProperty(sample), JSON.stringify(sample)).toBe(refEscapeProperty(sample));
    }
    expect(escapeData('a%\r\n:,')).toBe('a%25%0D%0A:,');
    expect(escapeProperty('a%\r\n:,')).toBe('a%25%0D%0A%3A%2C');
  });

  it("writes spec-brief's lines", () => {
    expect(BRIEF.map((f) => githubCommand(briefGithubAnnotation(f))).join('')).toBe(briefGithub(BRIEF));
  });

  it("writes spec-harness's lines, a message's full stop and a line before the first as it did", () => {
    const lines = HARNESS.map((f) =>
      githubCommand({ level: f.severity, file: harnessFile(f), line: f.line ?? 1, title: `spec-harness ${f.rule}`, text: findingText(f.message, f.hint) }),
    );
    expect(lines.join('')).toBe(harnessGithub(HARNESS, 'docs/briefs/007-x.md'));
  });

  it("writes spec-graph's lines, a rule only --strict made an error marked so", () => {
    const diagnostics: GraphDiagnostic[] = [
      { rule: 'broken-reference', severity: 'error', message: 'a.md cites b.md', hint: 'fix the link', file: 'docs/a.md', line: 4 },
      { rule: 'stale-premise', severity: 'warn', message: 'x', hint: 'y', file: 'docs/b.md', line: 1 },
      { rule: 'orphan', severity: 'info', message: 'z', hint: 'w', file: 'docs/c.md', line: 2 },
    ];
    const escalated = new Set(['stale-premise']);
    const levels: Readonly<Record<GraphDiagnostic['severity'], Level>> = { error: 'error', warn: 'warning', info: 'note' };
    const lines = diagnostics.map((d) =>
      githubCommand({ level: levels[d.severity], file: d.file, line: d.line, title: escalated.has(d.rule) ? `${d.rule} (strict)` : d.rule, text: findingText(d.message, d.hint) }),
    );
    expect(lines.join('')).toBe(graphGithub(diagnostics, escalated));
  });

  it("writes spec-guard's lines, which it joined with a line feed and ended with none", () => {
    const annotations: GuardAnnotation[] = [
      { rule: 'assert-absence', identity: ['a'], level: 'error', file: 'docs/adr/1.md', line: 0, message: 'found 2', hint: 'remove them' },
      { rule: 'not-in-force', identity: ['b'], level: 'notice', file: 'docs/adr/2.md', line: 1, message: 'draft' },
    ];
    const levels: Readonly<Record<GuardAnnotation['level'], Level>> = { error: 'error', warning: 'warning', notice: 'note' };
    const lines = annotations.map((a) => githubCommand({ level: levels[a.level], file: a.file, line: a.line, title: a.rule, text: findingText(a.message, a.hint) }));
    expect(lines.join('')).toBe(`${guardGithub(annotations)}\n`);
  });

  it('writes the end of a range and the columns where they are given, in the order GitHub lists them', () => {
    const base = { level: 'warning' as const, file: 'a.md', line: 2, title: 'r', text: 't' };
    expect(githubCommand({ ...base, endLine: 3 })).toBe('::warning file=a.md,line=2,endLine=3,title=r::t\n');
    expect(githubCommand({ ...base, column: 5 })).toBe('::warning file=a.md,line=2,col=5,title=r::t\n');
    expect(githubCommand({ ...base, endColumn: 9 })).toBe('::warning file=a.md,line=2,endColumn=9,title=r::t\n');
    expect(githubCommand({ ...base, endLine: 3, column: 5, endColumn: 9 })).toBe('::warning file=a.md,line=2,endLine=3,col=5,endColumn=9,title=r::t\n');
    expect(githubCommand({ ...base, level: 'note', line: -4 })).toBe('::notice file=a.md,line=1,title=r::t\n');
    expect(githubCommand({ ...base, level: 'error' })).toBe('::error file=a.md,line=2,title=r::t\n');
  });
});

describe('the text of a finding', () => {
  it('is the message, then the hint, a full stop between and none doubled', () => {
    expect(findingText('a is b', 'do c')).toBe('a is b. do c');
    expect(findingText('a is b.', 'do c')).toBe('a is b. do c');
    expect(findingText('a is b..', 'do c')).toBe('a is b.. do c');
    expect(findingText('a is b.')).toBe('a is b.');
    expect(findingText('', 'do c')).toBe('. do c');
  });

  it("is spec-harness's text, and spec-brief's for a message that ends in no full stop", () => {
    for (const f of HARNESS) expect(findingText(f.message, f.hint)).toBe(harnessText(f));
    for (const f of BRIEF) if (f.hint !== undefined) expect(findingText(f.message, f.hint)).toBe(`${f.message}. ${f.hint}`);
  });
});

describe('GitLab Code Quality', () => {
  it('maps the levels as the family does', () => {
    expect((['error', 'warning', 'note'] as const).map(gitlabSeverity)).toEqual(['major', 'minor', 'info']);
  });

  const identities: (readonly string[])[] = [['r', 'a', 's'], ['r', 'a', 's'], ['r', 'a\u0000s'], ['r', 'a', 's'], ['q', 'b', ''], ['r', 'a\u0000s']];

  it("writes spec-brief's and spec-graph's keys as JSON, the occurrence from 2", () => {
    expect(fingerprintKeys(identities, 'json')).toEqual(graphGitlabKeys(identities));
    expect(fingerprintKeys([['r'], ['r'], ['r']], 'json')).toEqual(['["r"]', '["r",2]', '["r",3]']);
  });

  it("writes spec-guard's and spec-harness's keys joined by U+0000, the count before from 1, and reads two ways of writing one key as one", () => {
    expect(fingerprintKeys(identities, 'nul')).toEqual(guardKeys(identities.map((identity) => ({ identity }))));
    expect(fingerprintKeys([['r'], ['r'], ['r']], 'nul')).toEqual(['r', 'r\u00001', 'r\u00002']);
    expect(fingerprintKeys([['r', 'a\u0000s'], ['r', 'a', 's']], 'nul')).toEqual(['r\u0000a\u0000s', 'r\u0000a\u0000s\u00001']);
    expect(fingerprintKeys([['r', 'a\u0000s'], ['r', 'a', 's']], 'json')).toEqual(['["r","a\\u0000s"]', '["r","a","s"]']);
  });

  it("builds spec-brief's issues", () => {
    const issues = gitlabIssues(
      BRIEF.map((f) => ({ rule: f.rule, severity: gitlabSeverity(f.severity), text: f.hint === undefined ? f.message : findingText(f.message, f.hint), file: f.file, line: f.line, identity: briefIdentity(f) })),
      sha256,
      'json',
    );
    expect(issues).toEqual(briefGitlab(BRIEF));
    expect(JSON.stringify(issues)).toBe(JSON.stringify(briefGitlab(BRIEF)));
  });

  it("builds spec-harness's issues, a line before the first placed on the first", () => {
    const issues = gitlabIssues(
      HARNESS.map((f) => ({
        rule: f.rule,
        severity: gitlabSeverity(f.severity),
        text: findingText(f.message, f.hint),
        file: harnessFile(f),
        line: f.line ?? 1,
        identity: [f.rule, harnessFile(f), f.subject ?? ''],
      })),
      sha256,
      'nul',
    );
    expect(JSON.stringify(issues)).toBe(JSON.stringify(harnessGitlab(HARNESS, 'docs/briefs/007-x.md')));
  });

  it('hashes with the function it is given', () => {
    const [issue] = gitlabIssues([{ rule: 'r', severity: 'blocker', text: 't', file: 'f', line: 3, identity: ['r', 'f'] }], (key) => `<${key}>`, 'json');
    expect(issue).toEqual({ description: 't', check_name: 'r', fingerprint: '<["r","f"]>', severity: 'blocker', location: { path: 'f', lines: { begin: 3 } } });
  });
});

describe('SARIF', () => {
  const described = new Map<string, { description: string; severity: Level | 'off' }>([
    ['missing-section', { description: 'A section the brief must have is missing.', severity: 'error' }],
    ['unscoped', { description: 'Nothing is scoped.', severity: 'off' }],
  ]);

  it("builds spec-brief's log, with semanticVersion beside the version", () => {
    const ids = [...new Set(BRIEF.map((f) => f.rule))].sort();
    const log = sarifLog({
      name: 'spec-brief',
      version: '0.14.0',
      informationUri: 'https://github.com/spec-family/spec-brief',
      sourceRoot: true,
      rules: ids.map((id) => {
        const rule = described.get(id);
        return { id, text: rule?.description ?? id, level: rule === undefined || rule.severity === 'off' ? undefined : rule.severity };
      }),
      results: BRIEF.map((f) => ({ rule: f.rule, level: f.severity, text: f.hint === undefined ? f.message : findingText(f.message, f.hint), file: f.file, region: { line: f.line } })),
    });
    const expected = briefSarif(BRIEF, '0.14.0', described) as { runs: [{ tool: { driver: Record<string, unknown> } }] };
    const { name, version, informationUri, rules } = expected.runs[0].tool.driver;
    expected.runs[0].tool.driver = { name, version, semanticVersion: version, informationUri, rules };
    expect(JSON.stringify(log)).toBe(JSON.stringify(expected));
  });

  it("builds spec-harness's log, its notes and fingerprints, the invocation after the tool", () => {
    const placed = harnessPlace(HARNESS, 'docs/briefs/007-x.md');
    const log = sarifLog({
      name: 'spec-harness',
      version: '0.25.0',
      informationUri: 'https://github.com/spec-family/spec-harness',
      sourceRoot: true,
      notes: ['audited 3 commits'],
      rules: [...new Set(HARNESS.map((f) => f.rule))].sort().map((id) => ({ id, text: `about ${id}` })),
      results: placed.map(({ finding, file, line, fingerprint }) => ({
        rule: finding.rule,
        level: finding.severity,
        text: findingText(finding.message, finding.hint),
        file,
        region: { line },
        fingerprints: { specHarnessFinding: fingerprint },
      })),
    });
    const expected = harnessSarif(HARNESS, 'docs/briefs/007-x.md', '0.25.0', 'audited 3 commits', (id) => `about ${id}`) as { runs: [{ tool: { driver: Record<string, unknown> } }] };
    expected.runs[0].tool.driver['semanticVersion'] = '0.25.0';
    expect(log).toEqual(expected);
  });

  it("builds spec-graph's parts: columns, related locations, fingerprints and properties, with no source root", () => {
    const log = sarifLog({
      name: 'spec-graph',
      version: '0.25.0',
      informationUri: 'https://github.com/spec-family/spec-graph',
      rules: [{ id: 'broken-reference', text: 'A reference that resolves to nothing.', level: 'error', helpUri: 'https://example.com/rules.md#broken-reference' }],
      results: [
        {
          rule: 'broken-reference',
          level: 'error',
          text: 'a. b',
          file: 'docs/a.md',
          region: { line: 3, column: 5, endLine: 3, endColumn: 9 },
          related: [{ file: 'docs/b.md', region: { line: 1, column: 1, endLine: 2, endColumn: 4 }, text: 'cited here' }],
          fingerprints: { specGraphIdentity: 'broken-reference/ADR-1/b.md' },
          properties: { nodes: ['ADR-1'], escalated: false },
        },
      ],
    });
    expect(log).toEqual({
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'spec-graph',
              version: '0.25.0',
              semanticVersion: '0.25.0',
              informationUri: 'https://github.com/spec-family/spec-graph',
              rules: [
                {
                  id: 'broken-reference',
                  shortDescription: { text: 'A reference that resolves to nothing.' },
                  defaultConfiguration: { level: 'error' },
                  helpUri: 'https://example.com/rules.md#broken-reference',
                },
              ],
            },
          },
          results: [
            {
              ruleId: 'broken-reference',
              level: 'error',
              message: { text: 'a. b' },
              locations: [{ physicalLocation: { artifactLocation: { uri: 'docs/a.md' }, region: { startLine: 3, startColumn: 5, endLine: 3, endColumn: 9 } } }],
              relatedLocations: [
                {
                  physicalLocation: { artifactLocation: { uri: 'docs/b.md' }, region: { startLine: 1, startColumn: 1, endLine: 2, endColumn: 4 } },
                  message: { text: 'cited here' },
                },
              ],
              partialFingerprints: { specGraphIdentity: 'broken-reference/ADR-1/b.md' },
              properties: { nodes: ['ADR-1'], escalated: false },
            },
          ],
        },
      ],
    });
  });

  it('leaves out what it is not given, and an empty list of notes or related places', () => {
    const log = sarifLog({
      name: 't',
      informationUri: 'u',
      rules: [],
      notes: [],
      results: [{ rule: 'r', level: 'note', text: 'x', file: 'f', region: { line: 1 }, related: [] }],
    });
    expect(JSON.stringify(log)).toBe(
      JSON.stringify({
        $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
        version: '2.1.0',
        runs: [
          {
            tool: { driver: { name: 't', informationUri: 'u', rules: [] } },
            results: [{ ruleId: 'r', level: 'note', message: { text: 'x' }, locations: [{ physicalLocation: { artifactLocation: { uri: 'f' }, region: { startLine: 1 } } }] }],
          },
        ],
      }),
    );
    expect(JSON.stringify(sarifLog({ name: 't', informationUri: 'u', rules: [], results: [], sourceRoot: false }))).not.toContain('SRCROOT');
  });
});
