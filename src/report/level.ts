/**
 * The family's severity words, which are SARIF's levels (ADR-0005, amended
 * 2026-11-12). A tool that still writes `warn` or `info` passes `warning` or
 * `note` here.
 */
export type Level = 'error' | 'warning' | 'note';

/**
 * What every format carries for a finding: its message, then its hint, the
 * next action (ADR-0005). A message that ends with a full stop keeps one, so
 * a sentence is not stopped twice; a finding with no hint yet is its message.
 */
export function findingText(message: string, hint?: string): string {
  if (hint === undefined) return message;
  return `${message.endsWith('.') ? message.slice(0, -1) : message}. ${hint}`;
}
