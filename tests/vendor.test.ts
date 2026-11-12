/**
 * `scripts/vendor.mjs`, run as a person runs it, on a tool made for each test
 * in a temporary directory. The check that a tool's copy is still spec-core's
 * is `--check`, by hand and on a schedule, so what it says and how it exits
 * are held here.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'vendor.mjs');
const DIR = 'src/vendor/spec-core';

interface Run {
  status: number | null;
  lines: string[];
  stderr: string;
}

interface VendorRecord {
  source: string;
  commit: string | null;
  modules: Record<string, { files: Record<string, string> }>;
}

function vendor(...args: string[]): Run {
  const run = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' });
  return { status: run.status, lines: run.stdout.split('\n').filter((line) => line !== ''), stderr: run.stderr };
}

const made: string[] = [];
afterEach(() => {
  for (const directory of made.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function directory(): string {
  const path = mkdtempSync(join(tmpdir(), 'spec-core-vendor-'));
  made.push(path);
  return path;
}

/** A tool with these modules copied into it, as `--into` copies them. */
function tool(modules: string, dir?: string): string {
  const root = directory();
  writeFileSync(join(root, 'package.json'), '{}');
  const copied = vendor('--into', root, '--modules', modules, ...(dir === undefined ? [] : ['--dir', dir]));
  expect(copied.status, copied.stderr).toBe(0);
  return root;
}

function readRecord(root: string): VendorRecord {
  return JSON.parse(readFileSync(join(root, DIR, 'VENDOR.json'), 'utf8'));
}

function writeRecord(root: string, record: VendorRecord): void {
  writeFileSync(join(root, DIR, 'VENDOR.json'), JSON.stringify(record));
}

const sha256 = (text: string): string => `sha256-${createHash('sha256').update(text).digest('hex')}`;
const word = (text: string): string => (text.includes(' ') ? JSON.stringify(text) : text);
const again = (root: string, modules: string, dir = ''): string => `to copy again, in spec-core: node scripts/vendor.mjs --into ${word(root)} --modules ${modules}${dir}`;

describe('vendor --check', () => {
  it('finds a copy just made the same as spec-core, with the modules it imports, and exits 0', () => {
    const root = tool('markdown');
    expect(existsSync(join(root, DIR, 'text', 'index.ts'))).toBe(true);
    expect(existsSync(join(root, DIR, 'LICENSE'))).toBe(true);
    expect(vendor('--check', root)).toEqual({ status: 0, lines: ['markdown, text: the copy matches spec-core'], stderr: '' });
  });

  it('names a file spec-core changed since the copy, and the command that copies it again', () => {
    const root = tool('path');
    const record = readRecord(root);
    writeFileSync(join(root, DIR, 'path', 'index.ts'), 'old');
    record.modules['path']!.files['index.ts'] = sha256('old');
    writeRecord(root, record);
    expect(vendor('--check', root)).toEqual({
      status: 1,
      lines: ['path/index.ts has changed in spec-core since it was copied', again(root, 'path')],
      stderr: '',
    });
  });

  it('names a file new in spec-core, and one spec-core no longer has', () => {
    const root = tool('path');
    const record = readRecord(root);
    const files = record.modules['path']!.files;
    delete files['index.ts'];
    rmSync(join(root, DIR, 'path', 'index.ts'));
    files['gone.ts'] = sha256('gone');
    writeFileSync(join(root, DIR, 'path', 'gone.ts'), 'gone');
    writeRecord(root, record);
    expect(vendor('--check', root).lines).toEqual([
      'path/gone.ts no longer exists in spec-core',
      'path/index.ts is new in spec-core and not in the tool',
      again(root, 'path'),
    ]);
  });

  it('names a copy edited in the tool, a copy missing from it, and a missing LICENSE', () => {
    const edited = tool('path');
    writeFileSync(join(edited, DIR, 'path', 'index.ts'), `${readFileSync(join(edited, DIR, 'path', 'index.ts'), 'utf8')} `);
    rmSync(join(edited, DIR, 'LICENSE'));
    expect(vendor('--check', edited)).toEqual({
      status: 1,
      lines: ['LICENSE is missing; the copies ship under it', 'path/index.ts was edited in the tool', again(edited, 'path')],
      stderr: '',
    });

    const missing = tool('path');
    rmSync(join(missing, DIR, 'path', 'index.ts'));
    expect(vendor('--check', missing).lines).toEqual(['path/index.ts is missing from the tool', again(missing, 'path')]);
  });

  it('names a module the tool has not copied that one it copied may import', () => {
    const root = tool('markdown');
    const record = readRecord(root);
    delete record.modules['text'];
    rmSync(join(root, DIR, 'text'), { recursive: true });
    writeRecord(root, record);
    expect(vendor('--check', root)).toEqual({
      status: 1,
      lines: ['markdown may import text (modules.json), which the tool has not copied', again(root, 'markdown')],
      stderr: '',
    });
  });

  it('names a module spec-core no longer has, and leaves it out of the command', () => {
    const root = tool('path');
    const record = readRecord(root);
    record.modules['gone'] = { files: { 'index.ts': sha256('gone') } };
    mkdirSync(join(root, DIR, 'gone'));
    writeFileSync(join(root, DIR, 'gone', 'index.ts'), 'gone');
    writeRecord(root, record);
    expect(vendor('--check', root).lines).toEqual([
      'gone/index.ts no longer exists in spec-core',
      "gone is no longer a spec-core module; its copy is the tool's to remove",
      again(root, 'path'),
    ]);
  });

  it('reads the directory it is given, and names that directory in the command', () => {
    const root = tool('path', 'lib/core');
    writeFileSync(join(root, 'lib', 'core', 'path', 'index.ts'), 'edited');
    expect(vendor('--check', root, '--dir', 'lib/core').lines).toEqual(['path/index.ts was edited in the tool', again(root, 'path', ' --dir lib/core')]);
    expect(vendor('--check', root).status).toBe(2);
  });

  it('refuses a directory with no record, where saying the copy matches would pass a wrong path', () => {
    const empty = directory();
    const run = vendor('--check', empty);
    expect(run.status).toBe(2);
    expect(run.lines).toEqual([]);
    expect(run.stderr).toContain('has no VENDOR.json; --check names the root of a tool that copies spec-core');
  });
});

describe('vendor arguments', () => {
  it('refuses what it cannot read, with exit 2 and the reason', () => {
    const root = tool('path');
    const refused = (args: string[]): string => {
      const run = vendor(...args);
      expect(run.status, args.join(' ')).toBe(2);
      return run.stderr;
    };
    expect(refused([])).toBe('vendor: pass exactly one of --into <tool> or --check <tool>\n');
    expect(refused(['--check', root, '--into', root])).toBe('vendor: pass exactly one of --into <tool> or --check <tool>\n');
    expect(refused(['--check'])).toBe('vendor: --check needs a value\n');
    expect(refused(['--check', root, '--all'])).toBe('vendor: unknown argument "--all"\n');
    expect(refused(['--into', root])).toBe('vendor: --modules names at least one module\n');
    expect(refused(['--into', directory(), '--modules', 'path'])).toContain("has no package.json; --into names a tool's root");
    expect(refused(['--into', root, '--modules', 'nothing'])).toContain('there is no module "nothing"; the modules are ');
  });
});
