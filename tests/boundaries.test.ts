/**
 * The rules that make this library safe to copy into four tools.
 *
 * Each module is copied on its own, so a module may import only the modules
 * its manifest entry says it needs, and nothing from outside the library - not
 * even `node:`, which would tie a pure function to one runtime and hide I/O in
 * code every tool trusts not to do any. docs/adr/0001-one-core-copied-by-hash.md.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');

/**
 * Which modules each module may import, from the manifest the vendoring
 * script also reads: a module is copied with exactly these. Anything else is
 * a violation.
 */
const ALLOWED = JSON.parse(readFileSync(join(ROOT, 'modules.json'), 'utf8')) as Readonly<Record<string, readonly string[]>>;

function files(directory: string, keep: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...files(full, keep));
    else if (keep(entry.name)) out.push(full);
  }
  return out;
}

function importsOf(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /(?:^|\n)\s*(?:import|export)\b[^'"]*?from\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (let match = pattern.exec(source); match !== null; match = pattern.exec(source)) {
    specifiers.push((match[1] ?? match[2]) as string);
  }
  return specifiers;
}

describe('module boundaries', () => {
  const sources = files(SRC, (name) => name.endsWith('.ts'));

  it('has a manifest entry for every module and a module for every entry', () => {
    // A directory is a module once it has an index; an empty one is work in progress.
    const modules = readdirSync(SRC, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && readdirSync(join(SRC, entry.name)).includes('index.ts'))
      .map((entry) => entry.name)
      .sort();
    expect(modules).toEqual(Object.keys(ALLOWED).sort());
  });

  it.each(sources.map((file) => [relative(SRC, file).replace(/\\/g, '/')]))('%s imports only what its module may', (file) => {
    const module = file.split('/')[0] as string;
    const source = readFileSync(join(SRC, file), 'utf8');
    for (const specifier of importsOf(source)) {
      expect(specifier.startsWith('.'), `${file} imports "${specifier}", which is not inside the library`).toBe(true);
      expect(specifier.endsWith('.js'), `${file} imports "${specifier}" without the .js a NodeNext build needs`).toBe(true);
      const target = relative(SRC, join(SRC, file, '..', specifier)).replace(/\\/g, '/');
      const targetModule = target.split('/')[0] as string;
      if (targetModule === module) continue;
      expect(ALLOWED[module], `${file} imports ${target}`).toContain(targetModule);
    }
  });

  it('compiles no pattern at run time', () => {
    for (const file of sources) {
      const source = readFileSync(file, 'utf8');
      expect(/\bnew\s+RegExp\s*\(|\bRegExp\s*\(/.test(source), `${relative(ROOT, file)} builds a RegExp`).toBe(false);
    }
  });

  it('declares no runtime dependency', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as Record<string, unknown>;
    expect(manifest['dependencies']).toEqual({});
    expect(manifest['peerDependencies']).toBeUndefined();
    expect(manifest['optionalDependencies']).toBeUndefined();
  });

  it('exports every module the manifest names, and nothing else', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { exports: Record<string, unknown> };
    const exported = Object.keys(manifest.exports)
      .filter((key) => key !== './package.json')
      .map((key) => key.slice(2))
      .sort();
    expect(exported).toEqual(Object.keys(ALLOWED).sort());
  });
});

describe('the files themselves', () => {
  const skip = new Set(['node_modules', 'dist', 'coverage', 'reports', '.stryker-tmp', '.git']);
  // Stryker writes a setup file for each of its workers into the sandbox it
  // runs the tests in, as many as the runner has cores for. A case for each
  // would make the cases differ from one shard of a sweep to the next, and the
  // merge refuses shards that ran different tests.
  const transient = /^stryker-setup-\d+\.js$/;
  const text = (directory: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (skip.has(entry.name) || transient.test(entry.name)) continue;
      const full = join(directory, entry.name);
      if (entry.isDirectory()) out.push(...text(full));
      else if (/\.(?:ts|mjs|js|json|md|yml|yaml)$/.test(entry.name) || entry.name.startsWith('.git')) out.push(full);
    }
    return out;
  };

  it.each(text(ROOT).map((file) => [relative(ROOT, file).replace(/\\/g, '/')]))('%s is LF with no control characters', (file) => {
    const content = readFileSync(join(ROOT, file), 'utf8');
    expect(content.includes('\r'), `${file} has a carriage return`).toBe(false);
    // Tab and line feed are the only control characters a source file needs;
    // anything else invisible is written as an escape.
    const control = [...content].findIndex((ch) => {
      const code = ch.codePointAt(0) as number;
      return (code < 0x20 && code !== 0x09 && code !== 0x0a) || code === 0x7f || code === 0xfeff;
    });
    expect(control, `${file} has a control character at ${control}`).toBe(-1);
  });
});
