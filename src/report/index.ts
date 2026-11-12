/**
 * Findings in the formats a forge reads beside a change: GitHub's workflow
 * commands, GitLab's Code Quality and SARIF 2.1.0 (ADR-0005). Each builds
 * what a tool writes and leaves the writing, and any hash, to the tool.
 */

export { escapeData, escapeProperty, githubCommand } from './github.js';
export type { GithubAnnotation } from './github.js';
export { fingerprintKeys, gitlabIssues, gitlabSeverity } from './gitlab.js';
export type { FingerprintEncoding, GitlabFinding, GitlabIssue, GitlabSeverity } from './gitlab.js';
export { findingText } from './level.js';
export type { Level } from './level.js';
export { sarifLog } from './sarif.js';
export type { SarifRegion, SarifRelated, SarifResult, SarifRule, SarifRun } from './sarif.js';
