#!/usr/bin/env node
/**
 * Copies spec-core modules into a tool, byte for byte, and records their
 * hashes; or checks a tool's copy against its record and against spec-core as
 * it is now, and names the command that copies it again.
 *
 *   node scripts/vendor.mjs --into ../spec-brief --modules pattern,markdown
 *   node scripts/vendor.mjs --check ../spec-brief
 *
 * A module is copied with every module it may import (modules.json), into
 * `src/vendor/spec-core/<module>/` unless `--dir` says otherwise. The tool
 * keeps `VENDOR.json` beside the copies: the commit they came from and the
 * SHA-256 of every file. The tool's own test recomputes the hashes, so an edit
 * made to a copy in place fails that tool's build rather than drifting from
 * every other copy. docs/adr/0001-one-core-copied-by-hash.md. spec-core's
 * LICENSE goes beside them too: the tool's package carries the compiled
 * copies, so it ships that notice.
 *
 * `--check` exits 0 when the copy matches, 1 when it names a difference, and
 * 2 for arguments it cannot read or a directory with no `VENDOR.json`, which
 * holds no copy to check: a wrong path or a copy moved elsewhere fails rather
 * than passing a job that runs it on a schedule. This is spec-core's own
 * maintenance script, not one of the family's tools, so the contract's exit
 * codes (ADR-0005) and the freeze on them do not cover it.
 *
 * Nothing here runs at install or build time in any tool; it is run by a
 * person, and its result is a diff that person commits.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'modules.json'), 'utf8'));
const DEFAULT_DIR = 'src/vendor/spec-core';
const SOURCE = 'https://github.com/spec-family/spec-core';

function fail(message) {
  process.stderr.write(`vendor: ${message}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const options = { into: null, check: null, modules: null, dir: DEFAULT_DIR };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const next = argv[i + 1];
      if (next === undefined) fail(`${arg} needs a value`);
      i += 1;
      return next;
    };
    if (arg === '--into') options.into = value();
    else if (arg === '--check') options.check = value();
    else if (arg === '--modules') options.modules = value().split(',').map((m) => m.trim()).filter(Boolean);
    else if (arg === '--dir') options.dir = value();
    else fail(`unknown argument "${arg}"`);
  }
  if ((options.into === null) === (options.check === null)) fail('pass exactly one of --into <tool> or --check <tool>');
  return options;
}

/** A module and every module it may import, in dependency order. */
function closure(modules) {
  const out = [];
  const visit = (name, trail) => {
    if (!(name in MANIFEST)) fail(`there is no module "${name}"; the modules are ${Object.keys(MANIFEST).join(', ')}`);
    if (trail.includes(name)) fail(`modules.json has a cycle: ${[...trail, name].join(' -> ')}`);
    for (const dependency of MANIFEST[name]) visit(dependency, [...trail, name]);
    if (!out.includes(name)) out.push(name);
  };
  for (const name of modules) visit(name, []);
  return out;
}

function sha256(bytes) {
  return `sha256-${createHash('sha256').update(bytes).digest('hex')}`;
}

function sourceFiles(module) {
  return readdirSync(join(ROOT, 'src', module))
    .filter((name) => name.endsWith('.ts'))
    .sort();
}

function commitOf() {
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--', 'src', 'modules.json'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return { sha, dirty: dirty.length > 0 };
  } catch {
    return { sha: null, dirty: true };
  }
}

function readVendor(target) {
  const file = join(target, 'VENDOR.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { source: SOURCE, commit: null, modules: {} };
}

function vendor(options) {
  const tool = resolve(options.into);
  if (!existsSync(join(tool, 'package.json'))) fail(`${tool} has no package.json; --into names a tool's root`);
  if (options.modules === null || options.modules.length === 0) fail('--modules names at least one module');
  const target = join(tool, options.dir);
  const record = readVendor(target);
  const { sha, dirty } = commitOf();
  if (dirty) process.stderr.write('vendor: spec-core has uncommitted changes under src/; the copy names no commit\n');

  for (const module of closure(options.modules)) {
    const directory = join(target, module);
    rmSync(directory, { recursive: true, force: true });
    mkdirSync(directory, { recursive: true });
    const files = {};
    for (const name of sourceFiles(module)) {
      const bytes = readFileSync(join(ROOT, 'src', module, name));
      writeFileSync(join(directory, name), bytes);
      files[name] = sha256(bytes);
    }
    record.modules[module] = { files };
  }
  record.source = SOURCE;
  record.commit = dirty ? null : sha;
  const sorted = Object.fromEntries(Object.entries(record.modules).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(join(target, 'LICENSE'), readFileSync(join(ROOT, 'LICENSE')));
  writeFileSync(join(target, 'VENDOR.json'), `${JSON.stringify({ ...record, modules: sorted }, null, 2)}\n`);
  writeFileSync(
    join(target, 'README.md'),
    [
      '# Vendored from spec-core',
      '',
      'These files are copies of modules from',
      `[spec-core](${SOURCE}), byte for byte. Do not edit them here: change`,
      'spec-core, then run `node scripts/vendor.mjs --into <this tool>` there.',
      '`VENDOR.json` records the commit and the SHA-256 of every file, and this',
      "tool's tests fail when a file no longer matches its hash. `LICENSE` is",
      "spec-core's, and ships in this tool's package with the compiled copies.",
      '',
    ].join('\n'),
  );
  process.stdout.write(`vendored ${Object.keys(sorted).join(', ')} into ${target}${record.commit ? ` at ${record.commit}` : ''}\n`);
}

function check(options) {
  const target = join(resolve(options.check), options.dir);
  // Without a record there is nothing to check, and saying the copy matches would be a pass on a wrong path.
  if (!existsSync(join(target, 'VENDOR.json'))) fail(`${target} has no VENDOR.json; --check names the root of a tool that copies spec-core`);
  const record = readVendor(target);
  const problems = [];
  if (!existsSync(join(target, 'LICENSE'))) problems.push('LICENSE is missing; the copies ship under it');
  for (const [module, { files }] of Object.entries(record.modules)) {
    for (const [name, hash] of Object.entries(files)) {
      const copy = join(target, module, name);
      if (!existsSync(copy)) problems.push(`${module}/${name} is missing from the tool`);
      else if (sha256(readFileSync(copy)) !== hash) problems.push(`${module}/${name} was edited in the tool`);
      const original = join(ROOT, 'src', module, name);
      if (!existsSync(original)) problems.push(`${module}/${name} no longer exists in spec-core`);
      else if (sha256(readFileSync(original)) !== hash) problems.push(`${module}/${name} has changed in spec-core since it was copied`);
    }
    for (const name of existsSync(join(ROOT, 'src', module)) ? sourceFiles(module) : []) {
      if (!(name in files)) problems.push(`${module}/${name} is new in spec-core and not in the tool`);
    }
    // A module that gained a dependency in modules.json reaches for a module the tool never copied.
    if (!(module in MANIFEST)) problems.push(`${module} is no longer a spec-core module; its copy is the tool's to remove`);
    else {
      for (const dependency of MANIFEST[module]) {
        if (!(dependency in record.modules)) problems.push(`${module} may import ${dependency} (modules.json), which the tool has not copied`);
      }
    }
  }
  if (problems.length > 0) {
    const current = Object.keys(record.modules).filter((module) => module in MANIFEST);
    if (current.length > 0) problems.push(`to copy again, in spec-core: ${copyAgain(options, current)}`);
    process.stdout.write(`${problems.join('\n')}\n`);
    process.exit(1);
  }
  process.stdout.write(`${Object.keys(record.modules).join(', ')}: the copy matches spec-core\n`);
}

/** The command that copies these modules into the tool again, naming the tool and the directory as the person did. */
function copyAgain(options, modules) {
  const word = (text) => (text.includes(' ') ? JSON.stringify(text) : text);
  const dir = options.dir === DEFAULT_DIR ? '' : ` --dir ${word(options.dir)}`;
  return `node scripts/vendor.mjs --into ${word(options.check)} --modules ${modules.join(',')}${dir}`;
}

const options = parseArgs(process.argv.slice(2));
if (options.into !== null) vendor(options);
else check(options);
