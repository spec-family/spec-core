/**
 * The colour and ASCII decisions, against the three tools' own.
 *
 * Each reference below is a tool's function as its main had it on
 * 2026-11-12 - spec-brief e5db4f1 `src/cli.ts` `useColor`, spec-graph
 * 734f8a8 `src/report.ts` `shouldUseColor` and `shouldUseAscii` with the
 * line of `src/cli.ts` that reads its options first, spec-guard ad46b21
 * `src/reporter.ts` `shouldUseColor` and `shouldUseAscii` - with what each
 * read of the process made a parameter, and nothing else changed. Every
 * environment of the values below is put to all of them.
 */

import { describe, expect, it } from 'vitest';

import { useAscii, useColor } from '../src/color/index.js';

type Env = Readonly<Record<string, string | undefined>>;

function briefColor(noColor: boolean, color: boolean, env: Env, isTTY: boolean | undefined): boolean {
  if (noColor) return false;
  if (color) return true;
  if ((env['NO_COLOR'] ?? '') !== '') return false;
  const force = env['FORCE_COLOR'];
  if (force !== undefined && force !== '') return force !== '0' && force !== 'false';
  if (env['TERM'] === 'dumb') return false;
  return isTTY === true;
}

function graphColor(option: boolean | undefined, env: Env, isTTY: boolean | undefined): boolean {
  if (option !== undefined) return option;
  if (env['NO_COLOR'] !== undefined && env['NO_COLOR'] !== '') return false;
  const forced = env['FORCE_COLOR'];
  if (forced === '0' || forced === 'false') return false;
  if (forced !== undefined && forced !== '') return true;
  if (env['TERM'] === 'dumb') return false;
  return isTTY === true;
}

function guardColor(stream: { isTTY?: boolean | undefined }, flag: boolean | undefined, env: Env): boolean {
  if (flag !== undefined) return flag;
  if (env['NO_COLOR']) return false;
  if (env['FORCE_COLOR']) return env['FORCE_COLOR'] !== '0' && env['FORCE_COLOR'] !== 'false';
  if (env['TERM'] === 'dumb') return false;
  return Boolean(stream.isTTY);
}

function graphAscii(env: Env, platform: string): boolean {
  const asked = (env['SPEC_GRAPH_ASCII'] ?? '').trim().toLowerCase();
  if (asked !== '' && asked !== '0' && asked !== 'false') return true;
  if (platform !== 'win32') return false;
  return (env['WT_SESSION'] ?? '') === '' && (env['TERM_PROGRAM'] ?? '') === '';
}

function guardAscii(env: Env, platform: string): boolean {
  const asked = (env['SPEC_GUARD_ASCII'] ?? '').trim().toLowerCase();
  if (asked !== '' && asked !== '0' && asked !== 'false') return true;
  if (platform !== 'win32') return false;
  return !env['WT_SESSION'] && !env['TERM_PROGRAM'];
}

/** Every combination of the values given for each key, a key left out where its value is `undefined`. */
function environments(values: Readonly<Record<string, readonly (string | undefined)[]>>): Env[] {
  let out: Record<string, string | undefined>[] = [{}];
  for (const [key, options] of Object.entries(values)) {
    out = out.flatMap((env) => options.map((value) => (value === undefined ? { ...env } : { ...env, [key]: value })));
  }
  return out;
}

describe('colour', () => {
  const envs = environments({
    NO_COLOR: [undefined, '', '1', '0', ' ', 'false'],
    FORCE_COLOR: [undefined, '', '0', 'false', 'FALSE', '1', 'true', 'no', ' 0', '2'],
    TERM: [undefined, '', 'dumb', 'DUMB', 'xterm-256color'],
    CI: [undefined, 'true'],
  });

  it('answers as each of the three tools did, for every environment, terminal and option', () => {
    let compared = 0;
    for (const env of envs) {
      for (const isTTY of [true, false, undefined]) {
        for (const asked of [undefined, true, false]) {
          const expected = useColor({ env, isTTY }, asked);
          expect(briefColor(asked === false, asked === true, env, isTTY), JSON.stringify({ env, isTTY, asked })).toBe(expected);
          expect(graphColor(asked, env, isTTY)).toBe(expected);
          expect(guardColor({ isTTY }, asked, env)).toBe(expected);
          compared += 1;
        }
      }
    }
    expect(compared).toBe(envs.length * 9);
  });

  it('lets an option win over everything the environment says', () => {
    expect(useColor({ env: { NO_COLOR: '1' }, isTTY: false }, true)).toBe(true);
    expect(useColor({ env: { FORCE_COLOR: '1' }, isTTY: true }, false)).toBe(false);
  });

  it('turns colour off for NO_COLOR set to anything, before FORCE_COLOR', () => {
    expect(useColor({ env: { NO_COLOR: '0', FORCE_COLOR: '1' }, isTTY: true })).toBe(false);
    expect(useColor({ env: { NO_COLOR: '', FORCE_COLOR: '1' }, isTTY: false })).toBe(true);
  });

  it('reads FORCE_COLOR as off for exactly 0 and false, on a terminal too, and as on for any other value', () => {
    expect(useColor({ env: { FORCE_COLOR: '0' }, isTTY: true })).toBe(false);
    expect(useColor({ env: { FORCE_COLOR: 'false' }, isTTY: true })).toBe(false);
    expect(useColor({ env: { FORCE_COLOR: 'FALSE' }, isTTY: false })).toBe(true);
    expect(useColor({ env: { FORCE_COLOR: 'no', TERM: 'dumb' }, isTTY: false })).toBe(true);
    expect(useColor({ env: { FORCE_COLOR: '' }, isTTY: false })).toBe(false);
  });

  it('reads TERM=dumb as no colour, and CI as nothing', () => {
    expect(useColor({ env: { TERM: 'dumb' }, isTTY: true })).toBe(false);
    expect(useColor({ env: { TERM: 'DUMB' }, isTTY: true })).toBe(true);
    expect(useColor({ env: { CI: 'true' }, isTTY: true })).toBe(true);
    expect(useColor({ env: { CI: 'true' }, isTTY: false })).toBe(false);
    expect(useColor({ env: {} })).toBe(false);
  });
});

describe('ASCII marks', () => {
  const envs = environments({
    SPEC_X_ASCII: [undefined, '', '0', 'false', ' FALSE ', ' 0 ', '1', 'yes'],
    WT_SESSION: [undefined, '', 'x'],
    TERM_PROGRAM: [undefined, '', 'vscode'],
    TERM: [undefined, 'xterm'],
  });

  it('answers as spec-graph and spec-guard did, for every environment and platform', () => {
    for (const env of envs) {
      for (const platform of ['win32', 'linux', 'darwin']) {
        const expected = useAscii({ env, platform, variable: 'SPEC_X_ASCII' });
        const renamed = (name: string): Env => ({ ...env, [name]: env['SPEC_X_ASCII'], SPEC_X_ASCII: undefined });
        expect(graphAscii(renamed('SPEC_GRAPH_ASCII'), platform), JSON.stringify({ env, platform })).toBe(expected);
        expect(guardAscii(renamed('SPEC_GUARD_ASCII'), platform)).toBe(expected);
      }
    }
  });

  it('lets an option win, and reads only the variable the tool names', () => {
    expect(useAscii({ env: {}, platform: 'linux', variable: 'SPEC_GRAPH_ASCII' }, true)).toBe(true);
    expect(useAscii({ env: { SPEC_GRAPH_ASCII: '1' }, platform: 'win32', variable: 'SPEC_GRAPH_ASCII' }, false)).toBe(false);
    expect(useAscii({ env: { SPEC_GUARD_ASCII: '1' }, platform: 'linux', variable: 'SPEC_GRAPH_ASCII' })).toBe(false);
  });

  it('reads the variable as off for nothing, 0 and false, in any case and with spaces around it', () => {
    const asked = (value: string): boolean => useAscii({ env: { V: value }, platform: 'linux', variable: 'V' });
    expect([' ', '0', ' 0 ', 'false', 'FALSE', ' False '].map(asked)).toEqual([false, false, false, false, false, false]);
    expect(['1', 'yes', 'off'].map(asked)).toEqual([true, true, true]);
  });

  it('draws ASCII on Windows unless a terminal that draws the marks said it is there', () => {
    const win = (env: Env): boolean => useAscii({ env, platform: 'win32', variable: 'V' });
    expect(win({})).toBe(true);
    expect(win({ WT_SESSION: 'x' })).toBe(false);
    expect(win({ TERM_PROGRAM: 'vscode' })).toBe(false);
    expect(win({ WT_SESSION: '', TERM_PROGRAM: '' })).toBe(true);
    expect(win({ TERM: 'xterm-256color' })).toBe(true);
    expect(useAscii({ env: {}, platform: 'darwin', variable: 'V' })).toBe(false);
  });
});
