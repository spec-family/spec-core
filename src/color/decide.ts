/**
 * Whether a report is drawn in colour, and whether its marks are drawn in
 * ASCII, as every tool of the family decides both (ADR-0005, amended
 * 2026-10-09, 2026-10-11 and 2026-10-12).
 *
 * Pure: the caller reads the process - its environment, whether the stream
 * is a terminal, the platform - and passes what it read, with what its
 * command line asked for. spec-brief, spec-graph and spec-guard each wrote
 * the colour decision for themselves, and on 2026-11-12 the three answered
 * alike for every environment (`tests/color.test.ts`); this is the one they
 * move to.
 */

/** What a run read of the process it runs in. */
export interface Surroundings {
  /** The environment's variables, as the caller read them. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Whether the stream the report is written to is a terminal. */
  readonly isTTY?: boolean | undefined;
}

/**
 * Whether to draw colour. `asked` is `true` for `--color`, `false` for
 * `--no-color` and `undefined` for neither, and wins over everything else.
 * Then, as the family reads the conventions other programs set:
 *
 * - `NO_COLOR` set to anything turns colour off, as its specification has
 *   it, and wins over `FORCE_COLOR`;
 * - `FORCE_COLOR` is off for exactly `0` and exactly `false`, on a terminal
 *   too, and any other value forces colour on;
 * - either set to nothing is as unset;
 * - `TERM=dumb` turns colour off unless colour is forced;
 * - then colour is on where the stream is a terminal.
 *
 * `CI` decides nothing: it says who started the run, not what the stream
 * draws. A pipeline whose log is a terminal draws colour, and one that is
 * not sets `NO_COLOR`.
 */
export function useColor(surroundings: Surroundings, asked?: boolean): boolean {
  if (asked !== undefined) return asked;
  const { env } = surroundings;
  if ((env['NO_COLOR'] ?? '') !== '') return false;
  const forced = env['FORCE_COLOR'] ?? '';
  if (forced !== '') return forced !== '0' && forced !== 'false';
  if (env['TERM'] === 'dumb') return false;
  return surroundings.isTTY === true;
}

/** What a run read of the process, for the marks of its report. */
export interface MarkSurroundings {
  /** The environment's variables, as the caller read them. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** The platform, as Node names it: `win32`, `linux`, `darwin`. */
  readonly platform: string;
  /** The tool's own variable that asks for ASCII, such as `SPEC_GRAPH_ASCII`. */
  readonly variable: string;
}

/**
 * Whether to draw a report's marks in ASCII. `asked` is `true` for
 * `--ascii`, `false` for `--no-ascii` and `undefined` for neither, and wins.
 * Then the tool's variable asks for ASCII, set to anything but nothing, `0`
 * or `false`, in any case and with spaces around it, each of which is how a
 * script writes "off"; it asks for ASCII only. Then, on Windows only, ASCII
 * unless a terminal that draws the marks has said it is there:
 * `WT_SESSION` for Windows Terminal, `TERM_PROGRAM` for VS Code's terminal
 * and mintty, either set to nothing as unset. `TERM` is no such sign: Git for
 * Windows sets it for everything it starts, whatever draws the output.
 */
export function useAscii(surroundings: MarkSurroundings, asked?: boolean): boolean {
  if (asked !== undefined) return asked;
  const { env } = surroundings;
  const value = (env[surroundings.variable] ?? '').trim().toLowerCase();
  if (value !== '' && value !== '0' && value !== 'false') return true;
  if (surroundings.platform !== 'win32') return false;
  return (env['WT_SESSION'] ?? '') === '' && (env['TERM_PROGRAM'] ?? '') === '';
}
