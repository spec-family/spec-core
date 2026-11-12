/**
 * GitHub Actions workflow commands: one line for each finding, which a job's
 * log turns into an annotation on the pull request's diff without an upload.
 *
 * The four tools each escaped a command the same way, in four copies, as
 * GitHub's own toolkit escapes one (`@actions/core`, `command.ts`): a message
 * keeps a `%` and the line breaks that would end the command from ending it,
 * and a property keeps a `:` and a `,` from ending the property too.
 */

import type { Level } from './level.js';

/** A workflow command's message: `%`, and the line breaks that would end the command. */
export function escapeData(text: string): string {
  return text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

/** A workflow command's property: as a message, and the `:` and `,` that would end the property. */
export function escapeProperty(text: string): string {
  return escapeData(text).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

/** A finding, placed, as a workflow command writes it. */
export interface GithubAnnotation {
  readonly level: Level;
  /** Repository-relative POSIX. */
  readonly file: string;
  /** From 1; a finding about a whole file is placed on its first line. */
  readonly line: number;
  readonly endLine?: number | undefined;
  readonly column?: number | undefined;
  readonly endColumn?: number | undefined;
  /** What the annotation is headed with: the rule, as each tool words it. */
  readonly title: string;
  /** The message, with the hint after it (`findingText`). */
  readonly text: string;
}

/** What GitHub calls each level: a note is a `notice`. */
const COMMAND: Readonly<Record<Level, string>> = { error: 'error', warning: 'warning', note: 'notice' };

/**
 * One workflow command, ending in a line feed:
 * `::error file=a.md,line=3,title=rule::message`. The end of the range and the
 * columns are written where they are given, in the order GitHub lists them,
 * so a tool that gives none writes the line it wrote before. A line before
 * the first is the first, as spec-guard placed one.
 */
export function githubCommand(annotation: GithubAnnotation): string {
  const properties = [`file=${escapeProperty(annotation.file)}`, `line=${Math.max(annotation.line, 1)}`];
  if (annotation.endLine !== undefined) properties.push(`endLine=${annotation.endLine}`);
  if (annotation.column !== undefined) properties.push(`col=${annotation.column}`);
  if (annotation.endColumn !== undefined) properties.push(`endColumn=${annotation.endColumn}`);
  properties.push(`title=${escapeProperty(annotation.title)}`);
  return `::${COMMAND[annotation.level]} ${properties.join(',')}::${escapeData(annotation.text)}\n`;
}
