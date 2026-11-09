/**
 * Replays docs/tutorial.md against the published tools, and fails where an
 * output no longer reads as the document has it.
 *
 * The tutorial says its outputs come from the releases it names. Nothing held
 * that: by 2026-11-09 it named releases ten to sixteen minors behind npm's
 * `latest`, and several outputs read otherwise. So this builds the
 * tutorial's repository in a directory of its own, outside every repository,
 * installs the releases the tutorial names, runs every command its `console`
 * blocks show, in order, with the edits its prose describes in between, and
 * compares what each command prints with the lines under it.
 *
 * - A line that is `…` alone stands for any number of lines, none included;
 *   a `…` within a line, for any run of characters on it. Those are the
 *   tutorial's own trims.
 * - What differs from run to run is compared as a kind, not as it reads: a
 *   commit id, a duration.
 * - A command with no lines under it is run, and its output not compared:
 *   the tutorial shows what git and ssh-keygen print no more than it shows
 *   what `init --write` does.
 * - Each command's exit code is held to the one the step expects, 0 unless
 *   STEPS says otherwise.
 *
 *   node scripts/tutorial.mjs                     the releases the tutorial names; exit 1 on a difference
 *   node scripts/tutorial.mjs --versions latest   npm's `latest` instead, with what moved
 *   node scripts/tutorial.mjs --print             print every output, for re-recording
 *
 * `--warn` reports a difference as a GitHub warning and exits 0, for the
 * scheduled run against `latest`; `--summary <file>` appends a Markdown
 * report (the job summary); `--work <dir>` builds the repository there, in
 * an empty directory, and keeps it. It needs Node, git, bash and ssh-keygen,
 * and fetches the four packages from npm.
 */

import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TUTORIAL = path.join(ROOT, 'docs', 'tutorial.md');
export const TOOLS = ['spec-brief', 'spec-graph', 'spec-guard', 'spec-harness'];

/**
 * Whether a block's commands are run: a console or bash block, and a JSON
 * block that is a hook's answer. Every other block is input the replay
 * writes into the repository, or illustration.
 */
export const isReplayed = (block) => block.lang === 'console' || block.lang === 'bash' || (block.lang === 'json' && block.lines.some((line) => line.includes('"hookSpecificOutput"')));

/** Every commit is dated this second, and so is what spec-brief dates, so a run writes the same commits as the last. */
const EPOCH = '1794182400'; // 2026-11-09T00:00:00Z

// ---------------------------------------------------------------------------
// Reading the tutorial

/**
 * The fenced blocks of a Markdown text, in order: the info string's first
 * word, the lines between the fences, and the line of the opening fence.
 * @param {string} text
 */
export function blocksOf(text) {
  const lines = text.split('\n');
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const open = /^(`{3,})\s*([\w-]*)/.exec(lines[i]);
    if (open === null) continue;
    const fence = open[1];
    const start = i;
    const body = [];
    for (i++; i < lines.length && !(lines[i].startsWith(fence) && lines[i].trim() === fence); i++) body.push(lines[i]);
    blocks.push({ lang: open[2], lines: body, line: start + 1 });
  }
  return blocks;
}

/**
 * The release of each tool the tutorial says its outputs come from: the
 * paragraph that says "Every output below", which names all four.
 * @param {string} text
 */
export function versionsOf(text) {
  const paragraph = text.split(/\n\s*\n/).find((part) => part.includes('Every output below')) ?? '';
  const versions = {};
  for (const [, tool, version] of paragraph.matchAll(/\b(spec-(?:brief|graph|guard|harness)) (\d+\.\d+\.\d+)\b/g)) versions[tool] = version;
  const missing = TOOLS.filter((tool) => !(tool in versions));
  if (missing.length > 0) throw new Error(`the tutorial names no release of ${missing.join(', ')} in the paragraph that says "Every output below"`);
  return versions;
}

/**
 * A replayed block's commands, each with the lines the tutorial shows under
 * it. A console command is a line that opens with `$ `, continued on the
 * next line while it ends in `\`. A bash block's command is each line that
 * is not a comment, and what it prints is the comment after it, if any. A
 * JSON block is one output, and its command is the step's.
 * @param {{ lang: string, lines: string[], line: number }} block
 */
export function commandsOf(block) {
  if (block.lang === 'json') return [{ command: null, expected: block.lines, line: block.line + 1 }];
  if (block.lang === 'bash') {
    return block.lines.flatMap((text, index) => {
      if (text.trim() === '' || text.trim().startsWith('#')) return [];
      const [command, comment] = splitComment(text);
      return [{ command, expected: comment === null ? [] : [comment], line: block.line + 1 + index }];
    });
  }
  const commands = [];
  for (let i = 0; i < block.lines.length; i++) {
    const text = block.lines[i];
    if (!text.startsWith('$ ')) {
      if (commands.length === 0) throw new Error(`docs/tutorial.md:${block.line + 1 + i}: output before the first command of the block`);
      commands.at(-1).expected.push(text);
      continue;
    }
    const line = block.line + 1 + i;
    let command = text.slice(2);
    while (command.endsWith('\\') && i + 1 < block.lines.length) command = `${command.slice(0, -1).trimEnd()} ${block.lines[++i].trim()}`;
    commands.push({ command, expected: [], line });
  }
  return commands;
}

/** A bash line split at its comment: a `#` after a space, outside quotes. */
function splitComment(text) {
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote !== null) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '#' && (i === 0 || /\s/.test(text[i - 1]))) return [text.slice(0, i).trimEnd(), text.slice(i + 1).trim()];
  }
  return [text.trimEnd(), null];
}

// ---------------------------------------------------------------------------
// Comparing

const ESCAPE = String.fromCharCode(27);
const COLOUR = new RegExp(`${ESCAPE}\\[[0-9;]*m`, 'g');

/**
 * A line as it is compared: what differs between two runs of the same step
 * made one word. A commit id is any run of seven to forty hexadecimal
 * digits, digits alone included, since an abbreviated id is that one time in
 * twenty-seven; a duration is a number with `ms` or `s`.
 * @param {string} line
 */
export function normalize(line) {
  return line
    .replace(COLOUR, '')
    .replace(/\b\d+(?:\.\d+)?m?s\b/g, '<time>')
    .replace(/\b[0-9a-f]{7,40}\b/g, '<commit>')
    .trimEnd();
}

const GAP = '…';
const isGap = (line) => line.trim() === GAP;

/** Whether `actual` reads as the tutorial's `expected` line, a `…` within it standing for any run of characters. */
export function lineMatches(expected, actual) {
  const parts = normalize(expected).split(GAP).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${parts.join('.*')}$`, 's').test(normalize(actual));
}

/**
 * Whether the lines a command printed read as the lines the tutorial shows,
 * a `…` line standing for any number of lines. Trailing blank lines on
 * either side are not compared.
 * @param {string[]} expected
 * @param {string[]} actual
 */
export function outputMatches(expected, actual) {
  const e = trimBlank(expected);
  const a = trimBlank(actual);
  const seen = new Map();
  const from = (i, j) => {
    const key = i * (a.length + 1) + j;
    if (seen.has(key)) return seen.get(key);
    let result;
    if (i === e.length) result = j === a.length;
    else if (isGap(e[i])) {
      result = false;
      for (let k = j; k <= a.length && !result; k++) result = from(i + 1, k);
    } else result = j < a.length && lineMatches(e[i], a[j]) && from(i + 1, j + 1);
    seen.set(key, result);
    return result;
  };
  return from(0, 0);
}

function trimBlank(lines) {
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === '') end--;
  return lines.slice(0, end);
}

// ---------------------------------------------------------------------------
// The repository, and what the prose does between the blocks

/** The files of the repository the tutorial's step 1 lists, that the tutorial does not show in full. */
function sources(defect) {
  return {
    'src/Ledger.Domain/Account.cs': [
      'namespace Ledger.Domain;',
      '',
      'public sealed class Account',
      '{',
      '    public Account(string id, decimal balance)',
      '    {',
      '        Id = id;',
      '        Balance = balance;',
      '    }',
      '',
      '    public string Id { get; }',
      '',
      '    public decimal Balance { get; private set; }',
      '',
      '    public void Deposit(decimal amount) => Balance += amount;',
      '',
      '    public void Withdraw(decimal amount) => Balance -= amount;',
      '}',
      '',
    ].join('\n'),
    'src/Ledger.Application/Interest.cs': [
      'using Ledger.Domain;',
      '',
      'namespace Ledger.Application;',
      '',
      'public static class Interest',
      '{',
      ...defect.map((line) => `    ${line}`),
      '}',
      '',
    ].join('\n'),
    'src/Ledger.Application/Transfers.cs': [
      'using Ledger.Domain;',
      '',
      'namespace Ledger.Application;',
      '',
      'public static class Transfers',
      '{',
      '    public static void Move(Account from, Account to, decimal amount)',
      '    {',
      '        from.Withdraw(amount);',
      '        to.Deposit(amount);',
      '    }',
      '}',
      '',
    ].join('\n'),
    'src/Ledger.Infrastructure/AccountStore.cs': [
      'using System.Collections.Generic;',
      'using Ledger.Domain;',
      '',
      'namespace Ledger.Infrastructure;',
      '',
      'public sealed class AccountStore',
      '{',
      '    private readonly Dictionary<string, Account> accounts = new();',
      '',
      '    public Account Find(string id) => accounts[id];',
      '',
      '    public void Save(Account account) => accounts[account.Id] = account;',
      '}',
      '',
    ].join('\n'),
    '.gitignore': 'node_modules/\nbin/\nobj/\n',
    'package.json': '{ "name": "ledger", "private": true }\n',
  };
}

/** Brief 002, which step 6 says is drafted and does not show. */
const BRIEF_002 = [
  '---',
  'status: draft',
  'date: 2026-11-09',
  'type: feature',
  'wave: 1',
  'affectedFiles: [src/Ledger.Application/**, src/Ledger.Infrastructure/TransferLog.cs]',
  'protectedFiles: [src/Ledger.Domain/**]',
  '---',
  '',
  '# 002 — Record every transfer',
  '',
  '## Intent',
  '',
  'Every transfer is recorded in a log that outlives the process, so a',
  'balance can be explained from the transfers that made it.',
  '',
  '## Negative Scope',
  '',
  '- No change to how interest is computed.',
  '',
  '## Not Empowered',
  '',
  '- The domain model in `src/Ledger.Domain/`.',
  '',
  '## Invariants',
  '',
  '- [ ] a transfer that fails writes nothing to the log',
  '',
  '## Acceptance Criteria',
  '',
  '- [ ] every transfer writes one entry to the transfer log',
  '',
].join('\n');

/** What the agent writes in brief 002's round: the log behind an interface the application layer owns, and its test. */
const TRANSFER_LOG = {
  'src/Ledger.Application/ITransferLog.cs': [
    'namespace Ledger.Application;',
    '',
    'public interface ITransferLog',
    '{',
    '    void Record(string from, string to, decimal amount);',
    '}',
    '',
  ].join('\n'),
  'src/Ledger.Infrastructure/TransferLog.cs': [
    'using System.Collections.Generic;',
    'using Ledger.Application;',
    '',
    'namespace Ledger.Infrastructure;',
    '',
    'public sealed class TransferLog : ITransferLog',
    '{',
    '    private readonly List<string> entries = new();',
    '',
    '    public IReadOnlyList<string> Entries => entries;',
    '',
    '    public void Record(string from, string to, decimal amount) => entries.Add(from + " -> " + to + ": " + amount);',
    '}',
    '',
  ].join('\n'),
  'tests/Ledger.Tests/TransferLogTests.cs': [
    'using Ledger.Application;',
    'using Ledger.Domain;',
    'using Ledger.Infrastructure;',
    'using Xunit;',
    '',
    'namespace Ledger.Tests;',
    '',
    'public sealed class TransferLogTests',
    '{',
    '    [Fact]',
    '    public void Transfer_writes_one_entry()',
    '    {',
    '        var log = new TransferLog();',
    '        Transfers.Move(new Account("a", 10m), new Account("b", 0m), 4m, log);',
    '        Assert.Single(log.Entries);',
    '    }',
    '}',
    '',
  ].join('\n'),
};

const USING = 'using Ledger.Infrastructure;\n';
const ASSERT_LAYERS = /^<!-- @assert-layers .*-->\n\n?/m;

/**
 * One step per replayed block, in the tutorial's order. `first` is how the
 * block's first command starts, so a block added, moved or taken away fails
 * here by name rather than replaying against the wrong output. `before` is
 * what the tutorial's prose does ahead of the block; `exits`, each command
 * that does not exit 0, by how it starts, with one code for each time the
 * block runs it where they differ.
 */
export const STEPS = [
  // 2. Install and configure
  { first: 'npm install --save-dev', before: (t) => t.createRepository() },
  { first: 'ssh-keygen ' },
  // 3. Hold the code to its ADRs
  { first: 'npx --no-install @spec-family/spec-guard --verbose' },
  { first: 'npx --no-install @spec-family/spec-guard', before: (t) => t.edit('src/Ledger.Domain/Account.cs', (s) => USING + s), exits: { 'npx --no-install @spec-family/spec-guard': 1 } },
  { first: 'npx --no-install @spec-family/spec-guard prove', before: (t) => t.edit('src/Ledger.Domain/Account.cs', (s) => s.replace(USING, '')) },
  // 4. Keep the documents consistent
  { first: 'npx --no-install @spec-family/spec-graph check' },
  {
    first: 'npx --no-install @spec-family/spec-graph check',
    before: (t) => t.edit('docs/adr/0001-dependencies-point-inward.md', (s) => s.replace('status: accepted', 'status: superseded')),
    exits: { 'npx --no-install @spec-family/spec-graph check': 1 },
  },
  // 5. Write a brief
  { first: 'npx --no-install @spec-family/spec-brief new', before: (t) => t.edit('docs/adr/0001-dependencies-point-inward.md', (s) => s.replace('status: superseded', 'status: accepted')) },
  { first: 'npx --no-install @spec-family/spec-brief lint', before: (t) => t.write('briefs/001_compute-interest-in-decimal.md', t.shown('markdown', '# 001 ')) },
  // 6. Plan the waves
  { first: 'npx --no-install @spec-family/spec-brief matrix', before: (t) => t.write('briefs/002_record-every-transfer.md', BRIEF_002), exits: { 'npx --no-install @spec-family/spec-brief matrix': 1 } },
  { first: 'npx --no-install @spec-family/spec-brief schedule --write' },
  // 7. Approve the brief and start the round
  {
    first: 'npx --no-install @spec-family/spec-brief list',
    before: (t) => {
      t.edit('briefs/001_compute-interest-in-decimal.md', (s) => s.replace('status: draft', 'status: active'));
      t.git('add', '-A');
      t.git('commit', '--quiet', '-m', 'Briefs 001 and 002; 001 approved');
    },
  },
  { first: 'npx --no-install @spec-family/spec-harness guard src/Ledger.Application/Interest.cs', exits: { 'npx --no-install @spec-family/spec-harness guard src/Ledger.Domain/Account.cs': 1 } },
  { hook: { tool_name: 'Edit', file: 'src/Ledger.Domain/Account.cs', tool_input: { old_string: '    public decimal Balance { get; private set; }', new_string: '    public decimal Balance { get; private set; }\n\n    public decimal InterestAt(decimal rate) => Balance * rate;' } } },
  // 8. Escalate, and rule
  { first: 'npx --no-install @spec-family/spec-harness escalate', exits: { 'npx --no-install @spec-family/spec-harness escalate': 1 } },
  { first: 'npx --no-install @spec-family/spec-harness rule E-001-1', exits: { 'npx --no-install @spec-family/spec-harness rulings': [1, 0] } },
  // 9. Do the work, and audit it
  { first: 'npx --no-install @spec-family/spec-harness audit', exits: { 'npx --no-install @spec-family/spec-harness audit': 1 } },
  {
    first: 'npx --no-install @spec-family/spec-harness audit',
    before: (t) => {
      t.edit('src/Ledger.Domain/Account.cs', (s) =>
        s.replace('    public decimal Balance { get; private set; }\n', '    public decimal Balance { get; private set; }\n\n    public decimal InterestAt(decimal rate) => Balance * rate;\n'),
      );
      t.edit('src/Ledger.Application/Interest.cs', (s) => s.replace('(decimal)((double)account.Balance * (double)rate);', 'account.InterestAt(rate);'));
      t.edit('briefs/001_compute-interest-in-decimal.md', (s) => s.replace('- [ ] no `double`', '- [x] no `double`'));
      t.git('add', '-A');
      t.git('commit', '--quiet', '-m', 'Compute interest in decimal (brief 001)', { agent: true });
    },
  },
  // 10. Archive, and merge
  { first: 'npx --no-install @spec-family/spec-brief archive 001 --dry-run' },
  { first: 'npx --no-install @spec-family/spec-brief archive 001 --summary' },
  // In CI
  { first: 'npx --no-install @spec-family/spec-guard' },
  {
    first: 'npx --no-install @spec-family/spec-guard',
    before: (t) => {
      t.git('switch', '--quiet', '-c', 'loosen-the-rule');
      t.edit('docs/adr/0001-dependencies-point-inward.md', (s) => s.replace(ASSERT_LAYERS, ''));
      t.edit('src/Ledger.Domain/Account.cs', (s) => USING + s);
      t.git('commit', '--quiet', '-a', '-m', 'Let the domain use the store');
    },
    exits: { 'npx --no-install @spec-family/spec-guard "../base': 1 },
  },
  // One claim, three tools
  {
    first: 'npx --no-install @spec-family/spec-guard claims',
    before: (t) => {
      t.git('switch', '--quiet', 'main');
      t.git('worktree', 'remove', '--force', '../base');
      t.write('docs/spec/transfers.md', t.shown('markdown', '# Transfers'));
      t.write('docs/decisions.md', t.shown('markdown', '# Decisions to make'));
      t.merge('.spec-guard.json', t.shown('json', '"testPrefixes"'));
      t.merge('.spec-graph.json', t.shown('json', '"historyPatterns"'));
      t.merge('.spec-brief.json', t.shown('json', '"registers"'));
      t.frontMatter('briefs/002_record-every-transfer.md', t.shown('yaml', 'raises:'));
      t.git('add', '-A');
      t.git('commit', '--quiet', '-m', 'The transfer specification, drafted');
    },
  },
  {
    first: 'npx --no-install @spec-family/spec-brief lint',
    before: (t) => t.edit('briefs/002_record-every-transfer.md', (s) => s.replace('status: draft', 'status: active')),
    exits: { 'npx --no-install @spec-family/spec-brief lint': 1 },
  },
  {
    first: 'npx --no-install @spec-family/spec-brief lint',
    before: (t) => {
      t.edit('docs/decisions.md', (s) => s.replace('| log-retention | Proposed | How long the transfer log is kept |', '| log-retention | Accepted | The transfer log is kept seven years |'));
      t.edit('docs/spec/transfers.md', (s) => s.replace('Status: Draft', 'Status: Accepted'));
    },
  },
  {
    first: 'npx --no-install @spec-family/spec-brief archive 002 --dry-run',
    before: (t) => {
      for (const [file, text] of Object.entries(TRANSFER_LOG)) t.write(file, text);
      t.edit('src/Ledger.Application/Transfers.cs', (s) =>
        s.replace('decimal amount)\n', 'decimal amount, ITransferLog log)\n').replace('        to.Deposit(amount);\n', '        to.Deposit(amount);\n        log.Record(from.Id, to.Id, amount);\n'),
      );
      t.edit('briefs/002_record-every-transfer.md', (s) => s.replaceAll('- [ ] ', '- [x] '));
      t.git('add', '-A');
      t.git('commit', '--quiet', '-m', 'Record every transfer (brief 002)', { agent: true });
    },
    exits: { 'npx --no-install @spec-family/spec-brief archive 002 --dry-run': 1 },
  },
  {
    first: 'npx --no-install @spec-family/spec-guard claims',
    before: (t) => t.edit('docs/spec/transfers.md', (s) => s.replace('- `Specified`: every transfer', '- `Implemented`: every transfer')),
    exits: { 'npx --no-install @spec-family/spec-guard claims': 1 },
  },
  {
    first: 'npx --no-install @spec-family/spec-guard claims',
    before: (t) => {
      const claim = t.shown('markdown', 'symbol="public void Transfer_writes_one_entry"');
      t.edit('docs/spec/transfers.md', (s) => s.replace(/<!-- @spec-item id="transfer-log" -->\n.*\n/, claim));
    },
  },
  { first: 'git worktree add --detach ../draft main~1' },
];

/** The environment a reader's shell would not have, which the tools read: CI, a forge, Claude Code, colour, the marks. */
const NOT_A_READERS = /^(?:CI|CI_.*|GITHUB_.*|GITLAB_.*|RUNNER_.*|FORGEJO_.*|GIT_.*|SPEC_.*|CLAUDE.*|NO_COLOR|FORCE_COLOR|WT_SESSION|TERM_PROGRAM|NODE_OPTIONS|npm_.*|NPM_.*)$/i;

/** The Claude Code release the tutorial's reader has, which `doctor` reads from `claude --version`. */
const CLAUDE_CODE = '2.1.235';

/**
 * A `claude` on `PATH` that answers `--version` as Claude Code does, so
 * `doctor` reads one release on every runner, CI's included, which has none.
 * On Windows spec-harness starts no script and reads the release from the
 * package.json of the package npm's shim names, so the stand-in is that shim
 * and that file.
 */
function standInClaude(bin) {
  mkdirSync(bin, { recursive: true });
  if (process.platform === 'win32') {
    const pkg = path.join(bin, 'node_modules', '@anthropic-ai', 'claude-code');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(path.join(pkg, 'package.json'), `${JSON.stringify({ name: '@anthropic-ai/claude-code', version: CLAUDE_CODE })}\n`);
    writeFileSync(path.join(bin, 'claude.cmd'), '@"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe" %*\r\n');
  } else {
    writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\necho '${CLAUDE_CODE} (Claude Code)'\n`, { mode: 0o755 });
  }
}

class Replay {
  /**
   * @param {{ blocks: ReturnType<typeof blocksOf>, versions: Record<string, string>, work: string }} options
   */
  constructor({ blocks, versions, work }) {
    this.blocks = blocks;
    this.versions = versions;
    this.home = path.join(work, 'home');
    this.repo = path.join(work, 'ledger');
    mkdirSync(path.join(this.home, '.ssh'), { recursive: true });
    mkdirSync(this.repo, { recursive: true });
    writeFileSync(path.join(this.home, '.gitconfig'), '');
    const bin = path.join(work, 'bin');
    standInClaude(bin);
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !NOT_A_READERS.test(name) && !/^path$/i.test(name)));
    this.env = {
      ...env,
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
      // The tools draw their marks on every terminal but a Windows console
      // that names none; this names one, so a run on Windows prints what one
      // on Linux or macOS does, and what the tutorial shows.
      TERM_PROGRAM: 'tutorial',
      HOME: this.home,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: path.join(this.home, '.gitconfig'),
      GIT_AUTHOR_NAME: 'Pat',
      GIT_AUTHOR_EMAIL: 'person@example.test',
      GIT_COMMITTER_NAME: 'Pat',
      GIT_COMMITTER_EMAIL: 'person@example.test',
      GIT_AUTHOR_DATE: `${EPOCH} +0000`,
      GIT_COMMITTER_DATE: `${EPOCH} +0000`,
      SOURCE_DATE_EPOCH: EPOCH,
    };
  }

  /** The one block of `lang` the tutorial shows with `marker` in it, as a file's text. */
  shown(lang, marker) {
    const found = this.blocks.filter((block) => block.lang === lang && block.lines.some((line) => line.includes(marker)));
    if (found.length !== 1) throw new Error(`the tutorial shows ${found.length} ${lang} blocks with "${marker}" in them, where the replay reads one`);
    return `${found[0].lines.join('\n')}\n`;
  }

  createRepository() {
    const defect = this.shown('csharp', 'public static decimal For').trimEnd().split('\n');
    const files = {
      'docs/adr/0001-dependencies-point-inward.md': this.shown('markdown', '# ADR-0001'),
      'docs/adr/0002-money-is-decimal.md': this.shown('markdown', '# ADR-0002'),
      ...sources(defect),
    };
    for (const [file, text] of Object.entries(files)) this.write(file, text);
    this.git('init', '--quiet', '--initial-branch=main');
    this.git('add', '-A');
    this.git('commit', '--quiet', '-m', 'The ledger, with two ADRs');
  }

  write(file, text) {
    const at = path.join(this.repo, file);
    mkdirSync(path.dirname(at), { recursive: true });
    writeFileSync(at, text);
  }

  edit(file, change) {
    const at = path.join(this.repo, file);
    const before = readFileSync(at, 'utf8');
    const after = change(before);
    if (after === before) throw new Error(`the replay's edit of ${file} changed nothing`);
    writeFileSync(at, after);
  }

  /** The keys of a JSON object the tutorial shows, written into a configuration file, or a new one. */
  merge(file, json) {
    const at = path.join(this.repo, file);
    const before = existsSync(at) ? JSON.parse(readFileSync(at, 'utf8')) : {};
    writeFileSync(at, `${JSON.stringify({ ...before, ...JSON.parse(json) }, null, 2)}\n`);
  }

  /** A brief's front matter, made the one the tutorial shows. */
  frontMatter(file, yaml) {
    this.edit(file, (s) => s.replace(/^---\n[\s\S]*?\n---\n/, `---\n${yaml}---\n`));
  }

  /** A git command the prose implies; it must succeed. The last argument may be `{ agent: true }`, which commits as the agent. */
  git(...args) {
    const last = args.at(-1);
    const agent = typeof last === 'object' && last.agent === true;
    const words = agent ? args.slice(0, -1) : args;
    const env = agent ? { ...this.env, GIT_AUTHOR_NAME: 'Agent', GIT_AUTHOR_EMAIL: 'agent@example.test', GIT_COMMITTER_NAME: 'Agent', GIT_COMMITTER_EMAIL: 'agent@example.test' } : this.env;
    const run = spawnSync('git', words, { cwd: this.repo, env, encoding: 'utf8' });
    if (run.status !== 0) throw new Error(`git ${words.join(' ')} failed: ${run.stderr || run.stdout}`);
  }

  /**
   * A command as the tutorial's reader types it, in bash, with what it prints
   * on either stream in the order it was printed. The install takes the
   * releases the tutorial names, and runs no install script.
   */
  run(command, input) {
    let line = command;
    if (/^npm install\b/.test(line)) {
      line = line.replace(/@spec-family\/(spec-[a-z]+)/g, (name, tool) => `${name}@${this.versions[tool]}`);
      line = line.replace(/^npm install\b/, 'npm install --ignore-scripts --no-audit --no-fund');
    }
    const run = spawnSync('bash', ['-c', `exec 2>&1\n${line}`], { cwd: this.repo, env: this.env, input: input ?? '', encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (run.error) throw run.error;
    const lines = run.stdout.split(/\r?\n/).filter((text) => !/^npm (?:notice|warn)\b/.test(text));
    return { status: run.status, lines };
  }

  /** The PreToolUse hook `init` wrote, asked about a tool call as Claude Code asks it. */
  hook({ tool_name, file, tool_input }) {
    const settings = JSON.parse(readFileSync(path.join(this.repo, '.claude', 'settings.json'), 'utf8'));
    const entries = (settings.hooks?.PreToolUse ?? []).filter((entry) => new RegExp(`^(?:${entry.matcher ?? '.*'})$`).test(tool_name));
    const hooks = entries.flatMap((entry) => entry.hooks.filter((hook) => hook.type === 'command'));
    if (hooks.length !== 1) throw new Error(`.claude/settings.json has ${hooks.length} PreToolUse commands for ${tool_name}, where the replay asks one`);
    const question = {
      session_id: 'tutorial',
      transcript_path: path.join(this.home, 'transcript.jsonl'),
      cwd: this.repo,
      permission_mode: 'default',
      hook_event_name: 'PreToolUse',
      tool_name,
      tool_input: { file_path: path.join(this.repo, file), ...tool_input },
      tool_use_id: 'toolu_tutorial',
    };
    // An entry with `args` is started as a program with its arguments, each
    // with the project's directory written in, as Claude Code starts it; one
    // without, as a shell command.
    const { command, args } = hooks[0];
    const env = { ...this.env, CLAUDE_PROJECT_DIR: this.repo };
    const options = { cwd: this.repo, env, input: JSON.stringify(question), encoding: 'utf8' };
    const run = Array.isArray(args) ? spawnSync(command, args.map((arg) => arg.replaceAll('${CLAUDE_PROJECT_DIR}', this.repo)), options) : spawnSync('bash', ['-c', command], options);
    if (run.error) throw run.error;
    return { status: run.status, lines: run.stdout.split(/\r?\n/) };
  }
}

/**
 * Pairs each replayed block with its step, and fails where the two lists
 * disagree: a block the steps do not know, or a step whose block starts with
 * another command.
 * @param {ReturnType<typeof blocksOf>} blocks
 * @param {typeof STEPS} steps
 */
export function pair(blocks, steps = STEPS) {
  const replayed = blocks.filter(isReplayed);
  const faults = [];
  if (replayed.length !== steps.length) faults.push(`the tutorial has ${replayed.length} blocks to replay (console, bash, json) and the replay has ${steps.length} steps`);
  const pairs = replayed.slice(0, steps.length).map((block, index) => {
    const step = steps[index];
    const commands = commandsOf(block);
    if (step.hook !== undefined) {
      if (block.lang !== 'json') faults.push(`docs/tutorial.md:${block.line}: step ${index + 1} replays a hook, and the block is ${block.lang}`);
    } else if (!(commands[0]?.command ?? '').startsWith(step.first)) {
      faults.push(`docs/tutorial.md:${block.line}: step ${index + 1} expects a block that starts "${step.first}", and it starts "${commands[0]?.command ?? ''}"`);
    }
    return { block, step, commands };
  });
  return { pairs, faults };
}

/**
 * The expected exit code of a command, from the step's `exits`: the entry
 * whose key the command starts with, the longest one where several do. A
 * list gives one code for each time the block runs a command it covers,
 * `seen` being how many it ran before.
 */
export function exitOf(step, command, seen = 0) {
  const keys = Object.keys(step.exits ?? {}).filter((key) => command.startsWith(key));
  keys.sort((a, b) => b.length - a.length);
  if (keys.length === 0) return 0;
  const code = step.exits[keys[0]];
  return Array.isArray(code) ? (code[seen] ?? code.at(-1)) : code;
}

/** The latest release of each tool on npm. */
function latest() {
  return Object.fromEntries(
    TOOLS.map((tool) => {
      const run = spawnSync('bash', ['-c', `npm view @spec-family/${tool} version`], { encoding: 'utf8' });
      if (run.status !== 0) throw new Error(`npm view @spec-family/${tool} version failed: ${run.stderr}`);
      return [tool, run.stdout.trim()];
    }),
  );
}

function parseArgs(argv) {
  const options = { versions: 'named', print: false, warn: false, summary: null, work: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--print') options.print = true;
    else if (arg === '--warn') options.warn = true;
    else if (arg === '--versions' || arg === '--summary' || arg === '--work') {
      const value = argv[++i];
      if (value === undefined || value === '') throw new Error(`${arg} takes a value`);
      options[arg.slice(2)] = value;
    } else throw new Error(`unknown argument ${arg}`);
  }
  if (options.versions !== 'named' && options.versions !== 'latest') throw new Error('--versions is "named" or "latest"');
  return options;
}

/** @param {string[]} argv */
export function main(argv) {
  const options = parseArgs(argv);
  const text = readFileSync(TUTORIAL, 'utf8');
  const blocks = blocksOf(text);
  const named = versionsOf(text);
  const versions = options.versions === 'latest' ? latest() : named;
  const { pairs, faults } = pair(blocks);
  const report = [];
  const differences = [];
  const behind = TOOLS.filter((tool) => versions[tool] !== named[tool]);

  if (faults.length > 0) {
    for (const fault of faults) console.error(fault);
    return 2;
  }
  if (options.work !== null && existsSync(options.work) && readdirSync(options.work).length > 0) throw new Error(`--work ${options.work} is not empty`);
  const work = options.work ?? mkdtempSync(path.join(tmpdir(), 'spec-tutorial-'));
  mkdirSync(work, { recursive: true });
  const replay = new Replay({ blocks, versions, work });
  console.log(`tutorial: replaying ${pairs.length} blocks with ${TOOLS.map((tool) => `${tool} ${versions[tool]}`).join(', ')}`);
  console.log(`tutorial: in ${replay.repo}`);
  if (behind.length > 0) console.log(`tutorial: the tutorial names ${behind.map((tool) => `${tool} ${named[tool]}`).join(', ')}; latest is ${behind.map((tool) => versions[tool]).join(', ')}`);

  let finished = false;
  try {
    for (const { block, step, commands } of pairs) {
      try {
        step.before?.(replay);
      } catch (error) {
        throw new Error(`docs/tutorial.md:${block.line}: what the prose does before this block failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      const ran = new Map();
      for (const { command, expected, line } of commands) {
        const got = step.hook !== undefined ? replay.hook(step.hook) : replay.run(command);
        const seen = ran.get(command) ?? 0;
        ran.set(command, seen + 1);
        const want = step.hook !== undefined ? 0 : exitOf(step, command, seen);
        const shownAs = command ?? `the PreToolUse hook, asked about ${step.hook.tool_name} of ${step.hook.file}`;
        if (options.print) {
          console.log(`\n$ ${shownAs}    (exit ${got.status}, docs/tutorial.md:${line})`);
          console.log(trimBlank(got.lines).join('\n'));
        }
        const problems = [];
        if (got.status !== want) problems.push(`exit ${got.status}, where the step expects ${want}`);
        if (expected.length > 0 && !outputMatches(expected, got.lines)) problems.push('the output differs');
        if (problems.length === 0) continue;
        differences.push({ line, command: shownAs, problems, expected, actual: trimBlank(got.lines) });
      }
    }
    finished = true;
  } finally {
    // The repository is kept where something went wrong, for a look at it.
    if (options.work === null && finished && differences.length === 0) rmSync(work, { recursive: true, force: true });
    else if (!finished) console.error(`tutorial: the repository is kept in ${replay.repo}`);
  }

  for (const { line, command, problems, expected, actual } of differences) {
    const head = `docs/tutorial.md:${line}: ${command}: ${problems.join('; ')}`;
    if (options.warn) console.log(`::warning file=docs/tutorial.md,line=${line}::${escapeCommand(`${command}: ${problems.join('; ')}`)}`);
    else console.error(head);
    console.error(['  the tutorial shows:', ...expected.map((l) => `    ${l}`), '  the run printed:', ...actual.map((l) => `    ${l}`)].join('\n'));
    report.push(`### \`${command}\`, docs/tutorial.md:${line}`, '', problems.join('; '), '', '```diff', ...expected.map((l) => `- ${l}`), ...actual.map((l) => `+ ${l}`), '```', '');
  }
  const verdict =
    differences.length === 0
      ? `every output of the tutorial reads as the run printed it, with ${TOOLS.map((tool) => `${tool} ${versions[tool]}`).join(', ')}`
      : `${differences.length} command(s) of the tutorial read otherwise than the run printed them, with ${TOOLS.map((tool) => `${tool} ${versions[tool]}`).join(', ')}`;
  console.log(`tutorial: ${verdict}`);
  if (differences.length > 0 && options.work === null) console.log(`tutorial: the repository is kept in ${replay.repo}`);
  if (options.summary !== null) {
    const lines = ['## The tutorial, replayed', '', verdict + '.', ''];
    if (behind.length > 0) lines.push(`The tutorial names ${behind.map((tool) => `${tool} ${named[tool]}`).join(', ')}; npm's \`latest\` is ${behind.map((tool) => `${tool} ${versions[tool]}`).join(', ')}.`, '');
    appendFileSync(options.summary, [...lines, ...report].join('\n') + '\n');
  }
  if (options.warn && behind.length > 0) console.log(`::warning file=docs/tutorial.md::${escapeCommand(`the tutorial names ${behind.map((tool) => `${tool} ${named[tool]}`).join(', ')}, behind npm's latest ${behind.map((tool) => versions[tool]).join(', ')}`)}`);
  return differences.length === 0 || options.warn ? 0 : 1;
}

/** A workflow command's message, with what GitHub reads as its end escaped. */
const escapeCommand = (text) => text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`tutorial: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
