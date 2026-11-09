/**
 * The replay of docs/tutorial.md (scripts/tutorial.mjs), as far as it runs
 * without the network.
 *
 * The replay itself installs the releases the tutorial names and runs every
 * step, which the Tutorial workflow does; here are the parts that decide what
 * it compares and what it accepts: how the tutorial's blocks are read, what a
 * `…` stands for, what counts as the same output on another run, and that
 * the replay's steps still line up with the tutorial's blocks, so an edit to
 * the document that moves a block fails here before it fails there.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { blocksOf, commandsOf, exitOf, isReplayed, lineMatches, normalize, outputMatches, pair, STEPS, TOOLS, TUTORIAL, versionsOf, type Block } from '../scripts/tutorial.mjs';

const text = readFileSync(TUTORIAL, 'utf8');
const fence = '```';

describe('the tutorial, read', () => {
  it('names one release of each tool, in the paragraph that says where its outputs come from', () => {
    const versions = versionsOf(text);
    expect(Object.keys(versions).sort()).toEqual([...TOOLS].sort());
    for (const version of Object.values(versions)) expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('refuses a paragraph that leaves a tool out, rather than replaying it against some release', () => {
    expect(() => versionsOf('Every output below comes from spec-brief 0.13.0, spec-graph 0.24.0 and spec-guard 0.33.0.')).toThrow(/spec-harness/);
  });

  it('lines up with the replay: one step per block it runs, each starting with the command its step expects', () => {
    const { pairs, faults } = pair(blocksOf(text));
    expect(faults).toEqual([]);
    expect(pairs).toHaveLength(STEPS.length);
  });

  it('says so, by line, where a block was added or a step starts with another command', () => {
    const blocks = blocksOf(text);
    const first = blocks.findIndex(isReplayed);
    const extra: Block = { lang: 'console', lines: ['$ echo added'], line: 1 };
    const { faults } = pair([...blocks.slice(0, first), extra, ...blocks.slice(first)]);
    expect(faults[0]).toMatch(/has 30 blocks to replay .* and the replay has 29 steps/);
    expect(faults[1]).toMatch(/^docs\/tutorial\.md:1: step 1 expects a block that starts "npm install --save-dev", and it starts "echo added"$/);
  });
});

describe('a fenced block', () => {
  it('is read with its language, its lines and the line it opens on, a longer fence holding a shorter one', () => {
    const blocks = blocksOf(['prose', `${fence}console`, '$ a', 'out', fence, '', `${fence}${fence.slice(0, 1)}markdown`, `${fence}json`, '{}', fence, `${fence}${fence.slice(0, 1)}`].join('\n'));
    expect(blocks).toEqual([
      { lang: 'console', lines: ['$ a', 'out'], line: 2 },
      { lang: 'markdown', lines: [`${fence}json`, '{}', fence], line: 7 },
    ]);
  });

  it('is replayed where it is a console or a bash block, or JSON a hook answered; any other is input', () => {
    const block = (lang: string, ...lines: string[]): Block => ({ lang, lines, line: 1 });
    expect(isReplayed(block('console', '$ a'))).toBe(true);
    expect(isReplayed(block('bash', 'a'))).toBe(true);
    expect(isReplayed(block('json', '{"hookSpecificOutput":{}}'))).toBe(true);
    expect(isReplayed(block('json', '{ "claims": {} }'))).toBe(false);
    expect(isReplayed(block('markdown', '$ a'))).toBe(false);
  });

  it('gives each console command the lines under it, a command continued while its line ends in a backslash', () => {
    const commands = commandsOf({ lang: 'console', lines: ['$ one \\', '    --flag \\', '    value', 'out 1', '', 'out 2', '$ two'], line: 10 });
    expect(commands).toEqual([
      { command: 'one --flag value', expected: ['out 1', '', 'out 2'], line: 11 },
      { command: 'two', expected: [], line: 17 },
    ]);
  });

  it('refuses output before the first command of a console block', () => {
    expect(() => commandsOf({ lang: 'console', lines: ['out', '$ one'], line: 1 })).toThrow(/output before the first command/);
  });

  it('gives each bash command the comment after it as what it prints, a # inside quotes being no comment', () => {
    const commands = commandsOf({ lang: 'bash', lines: ['# a heading', 'one   # it says this', 'two "#3"', ''], line: 1 });
    expect(commands).toEqual([
      { command: 'one', expected: ['it says this'], line: 3 },
      { command: 'two "#3"', expected: [], line: 4 },
    ]);
  });
});

describe('an output, compared', () => {
  it('reads a commit id and a duration as kinds, so another run of the same step reads the same', () => {
    expect(normalize('merge base 13a2b7b59d70 · 18.85ms')).toBe(normalize('merge base 7fc662237b37 · 3ms'));
    expect(normalize('*   1234567 Merge')).toBe(normalize('*   d92f021 Merge'));
    expect(normalize('2 passed · 1.5s')).toBe('2 passed · <time>');
    expect(normalize('3 files changed, +10 −2')).toBe('3 files changed, +10 −2');
  });

  it('takes a … within a line for any run of characters, and the rest of the line as written', () => {
    expect(lineMatches('root    …/ledger', 'root    C:/work/ledger')).toBe(true);
    expect(lineMatches('note: a key. …', 'note: a key. Where an agent runs as the person, a FIDO2 key')).toBe(true);
    expect(lineMatches('Claude Code … runs the hooks', 'Claude Code 2.1.235 runs the hooks')).toBe(true);
    expect(lineMatches('root    …/ledger', 'root    C:/work/ledger2')).toBe(false);
    expect(lineMatches('2 passed', '2 passed, 1 failed')).toBe(false);
  });

  it('takes a … alone on its line for any number of lines, none included', () => {
    expect(outputMatches(['a', '…', 'd'], ['a', 'b', 'c', 'd'])).toBe(true);
    expect(outputMatches(['a', '  …', 'd'], ['a', 'd'])).toBe(true);
    expect(outputMatches(['a', '…'], ['a'])).toBe(true);
    expect(outputMatches(['a', '…', 'd'], ['a', 'b', 'c'])).toBe(false);
  });

  it('fails a line added, a line missing and a line that reads otherwise', () => {
    expect(outputMatches(['a', 'b'], ['a', 'b', 'c'])).toBe(false);
    expect(outputMatches(['a', 'b'], ['a'])).toBe(false);
    expect(outputMatches(['✔ every rule holds'], ['+ every rule holds'])).toBe(false);
  });

  it('leaves out trailing blank lines and trailing spaces on either side, and nothing else', () => {
    expect(outputMatches(['|\\', 'x'], ['|\\  ', 'x', '', ''])).toBe(true);
    expect(outputMatches(['a', 'b'], ['a', '', 'b'])).toBe(false);
    expect(outputMatches([' a'], ['a'])).toBe(false);
  });
});

describe('an exit code', () => {
  it('is 0 unless the step names the command, by the longest start that fits, once or one code for each time it runs', () => {
    const step = { exits: { 'npx a': 1, 'npx a b': 2, 'npx c': [1, 0] } };
    expect(exitOf(step, 'npx z')).toBe(0);
    expect(exitOf(step, 'npx a --verbose')).toBe(1);
    expect(exitOf(step, 'npx a b')).toBe(2);
    expect(exitOf(step, 'npx c', 0)).toBe(1);
    expect(exitOf(step, 'npx c', 1)).toBe(0);
    expect(exitOf(step, 'npx c', 5)).toBe(0);
    expect(exitOf({}, 'npx a')).toBe(0);
  });
});
