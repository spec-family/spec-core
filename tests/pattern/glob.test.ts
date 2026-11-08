import { describe, expect, it } from 'vitest';

import {
  compileGlob,
  globAlternatives,
  globCovers,
  globWitness,
  isGlobSyntax,
  parseGlob,
  parseGlobList,
  rebaseGlob,
  AutomatonTooLarge,
  GlobError,
  MAX_ALTERNATIVES,
  MAX_STATES,
  type GlobOptions,
} from '../../src/pattern/index.js';
import { fastestRatioInTurn } from '../timing.js';

const PATH: GlobOptions = { dialect: 'path', caseSensitive: true };
const RIPGREP: GlobOptions = { dialect: 'ripgrep', caseSensitive: true };
const GITIGNORE: GlobOptions = { dialect: 'gitignore', caseSensitive: true };

function matches(pattern: string, path: string, options: GlobOptions = PATH): boolean {
  return compileGlob(pattern, options).match(path);
}

function error(pattern: string, options: GlobOptions = PATH): string {
  const parsed = parseGlob(pattern, options);
  if (parsed.ok) throw new Error(`"${pattern}" parsed`);
  return parsed.error;
}

describe('the syntax every dialect shares', () => {
  it.each([
    ['src/*.ts', 'src/a.ts', true],
    ['src/*.ts', 'src/deep/a.ts', false],
    ['src/*.ts', 'src/.hidden.ts', true],
    ['src/?.ts', 'src/a.ts', true],
    ['src/?.ts', 'src/ab.ts', false],
    ['src/[ab].ts', 'src/b.ts', true],
    ['src/[ab].ts', 'src/c.ts', false],
    ['src/[!ab].ts', 'src/c.ts', true],
    ['src/[^ab].ts', 'src/a.ts', false],
    ['src/[a-c].ts', 'src/b.ts', true],
    ['src/[]a].ts', 'src/].ts', true],
    ['src/[a-].ts', 'src/-.ts', true],
    ['src/[a-\\z].ts', 'src/m.ts', true],
    ['src/{a,b}.ts', 'src/b.ts', true],
    ['src/{a,b}.ts', 'src/c.ts', false],
    ['{src,lib}/**', 'lib/x/y.ts', true],
    ['src/{a,{b,c}}.ts', 'src/c.ts', true],
    ['src/{[,]x,y}.ts', 'src/,x.ts', true],
    ['src/{[,]x,y}.ts', 'src/y.ts', true],
    ['src/\\*.ts', 'src/*.ts', true],
    ['src/\\*.ts', 'src/a.ts', false],
    ['src/a}.ts', 'src/a}.ts', true],
    // An escaped brace or comma is a character, whether braces are open or not.
    ['src/\\{a,b}.ts', 'src/{a,b}.ts', true],
    ['src/\\{a,b}.ts', 'src/a.ts', false],
    ['src/{a\\,b,c}.ts', 'src/a,b.ts', true],
    ['src/{a\\,b,c}.ts', 'src/a.ts', false],
    // A group that closes inside a group leaves the commas after it at the top.
    ['src/{{a,b},c}.ts', 'src/c.ts', true],
    // A class hides its commas from the braces, a negated one too, and its
    // first member is a member even when it is `]`.
    ['src/{[!],]x,y}.ts', 'src/ax.ts', true],
    ['src/{[^],]x,y}.ts', 'src/ax.ts', true],
    ['src/{[],]x,y}.ts', 'src/]x.ts', true],
    ['src/[!]].ts', 'src/a.ts', true],
    ['src/[!]].ts', 'src/].ts', false],
    ['./src/*.ts', 'src/a.ts', true],
    ['src//a.ts', 'src/a.ts', true],
    ['src/./a.ts', 'src/a.ts', true],
    ['docs/./', 'docs/a.md', true],
  ])('%s against %s is %s', (pattern, path, expected) => {
    expect(matches(pattern, path)).toBe(expected);
  });

  it('reads a globstar as whole directories, and a trailing one as at least one segment', () => {
    expect(matches('a/**/b', 'a/b')).toBe(true);
    expect(matches('a/**/b', 'a/x/y/b')).toBe(true);
    expect(matches('a/**/b', 'a/xb')).toBe(false);
    expect(matches('**/b', 'b')).toBe(true);
    expect(matches('**/b', 'x/y/b')).toBe(true);
    expect(matches('a/**', 'a/x')).toBe(true);
    expect(matches('a/**', 'a/x/y')).toBe(true);
    // The directory itself is not in its contents: this is what keeps a
    // collision witness from being a directory.
    expect(matches('a/**', 'a')).toBe(false);
    expect(matches('**', 'x')).toBe(true);
    expect(matches('**', 'x/y/z')).toBe(true);
    expect(matches('a/**/**/b', 'a/b')).toBe(true);
    // A run of globstars means what one means, and costs what one costs: the
    // automaton, which bounds matching and a witness search's budget, is the same.
    expect(compileGlob('a/**/**/b', PATH).automaton).toEqual(compileGlob('a/**/b', PATH).automaton);
    expect(compileGlob('a/**/**', PATH).automaton).toEqual(compileGlob('a/**', PATH).automaton);
  });

  it('never lets a wildcard or a class cross a separator', () => {
    expect(matches('a*b', 'a/b')).toBe(false);
    expect(matches('a?b', 'a/b')).toBe(false);
    expect(matches('a[!x]b', 'a/b')).toBe(false);
    // Nor when case is ignored.
    const folded: GlobOptions = { ...PATH, caseSensitive: false };
    expect(matches('a*b', 'a/b', folded)).toBe(false);
    expect(matches('a[!x]b', 'a/b', folded)).toBe(false);
  });

  it('counts characters as code points, so ? matches one whatever its encoding', () => {
    expect(matches('?.md', '\u{1F600}.md')).toBe(true);
    expect(matches('??.md', '\u{1F600}.md')).toBe(false);
    expect(matches('[\u{1F600}-\u{1F64F}].md', '\u{1F610}.md')).toBe(true);
    // The last code point one UTF-16 unit holds is one character, and so is
    // the one after it.
    expect(matches('?x', '\u{FFFF}x')).toBe(true);
  });

  it('takes case from the caller, the same on every host', () => {
    expect(matches('SRC/*.ts', 'src/a.ts', { dialect: 'path', caseSensitive: true })).toBe(false);
    expect(matches('SRC/*.ts', 'src/a.ts', { dialect: 'path', caseSensitive: false })).toBe(true);
    expect(matches('src/[A-C].ts', 'src/b.ts', { dialect: 'path', caseSensitive: false })).toBe(true);
    // A negated class refuses both cases of what it names.
    expect(matches('src/[!a].ts', 'src/A.ts', { dialect: 'path', caseSensitive: false })).toBe(false);
    expect(matches('\u00c9t\u00e9.md', '\u00e9T\u00c9.md', { dialect: 'path', caseSensitive: false })).toBe(true);
    // No single-character upper case: matches only itself.
    expect(matches('\u00df.md', 'SS.md', { dialect: 'path', caseSensitive: false })).toBe(false);
    expect(matches('S.md', '\u00df.md', { dialect: 'path', caseSensitive: false })).toBe(false);
    // A title-case letter is neither its lower nor its upper case, and still itself.
    expect(matches('\u01c5.md', '\u01c5.md', { dialect: 'path', caseSensitive: false })).toBe(true);
  });

  it.each([
    ['', 'the pattern is empty'],
    ['   ', 'the pattern is empty'],
    ['!src', 'a negated pattern is a list entry, not a glob; narrow the positive pattern'],
    ['src/+(a|b)', 'extended globs such as "+(a|b)" are not supported: write alternatives as "{a,b}", and a literal parenthesis as "[(]"'],
    ['src/*(x|y).md', 'extended globs such as "+(a|b)" are not supported: write alternatives as "{a,b}", and a literal parenthesis as "[(]"'],
    ['src/@(a|b|c)', 'extended globs such as "+(a|b)" are not supported: write alternatives as "{a,b}", and a literal parenthesis as "[(]"'],
    ['@(README|CHANGELOG).md', 'extended globs such as "+(a|b)" are not supported: write alternatives as "{a,b}", and a literal parenthesis as "[(]"'],
    ['docs/*.+(md|mdx)', 'extended globs such as "+(a|b)" are not supported: write alternatives as "{a,b}", and a literal parenthesis as "[(]"'],
    ['!(a|b)/c', 'a negated pattern is a list entry, not a glob; narrow the positive pattern'],
    ['src/[ab', 'a "[" is never closed'],
    ['src/[a/b]', 'a "[" is never closed'],
    ['src/{a,b', 'a "{" is never closed'],
    ['docs/{a,b}/{c', 'a "{" is never closed'],
    ['src/[z-a]', 'the range "z-a" runs backwards'],
    ['src/[\\', 'a "[" is never closed'],
    ['src/[a-', 'a "[" is never closed'],
    ['docs/**.md', '"**" means any number of directories only as a whole segment: write "docs/**/*.md" for any depth, or "docs/*.md" for one level'],
    ['**.ts', '"**" means any number of directories only as a whole segment: write "**/*.ts" for any depth, or "*.ts" for one level'],
    ['a**b/c', '"**" means any number of directories only as a whole segment: write "a*/**/*b/c" for any depth, or "a*b/c" for one level'],
    ['src/***', '"**" means any number of directories only as a whole segment: write "src/**" for any depth, or "src/*" for one level'],
    ['../src', 'a pattern cannot climb out of its root with ".."'],
    ['src\\app', '"\\" escapes glob syntax; separate directories with "/"'],
    ['src\\', '"\\" escapes glob syntax; separate directories with "/"'],
    ['.', 'the pattern names no path'],
    ['/', 'the pattern names the root itself, not a path under it'],
    ['//', 'the pattern names the root itself, not a path under it'],
    ['./', 'the pattern names the root itself, not a path under it'],
    // `./` with more slashes, and another `./` after them, is still `./`.
    ['.//', 'the pattern names the root itself, not a path under it'],
    ['.//./', 'the pattern names the root itself, not a path under it'],
  ])('refuses %j: %s', (pattern, reason) => {
    expect(error(pattern)).toBe(reason);
  });

  it('refuses a brace alternative that names no path, as that text alone is, and names it', () => {
    for (const options of [PATH, RIPGREP, GITIGNORE]) {
      const refused = (pattern: string): string => error(pattern, options);
      // Its slash read, `./` would be the contents of `.`: every path.
      for (const pattern of ['{./,a}', '{a,./}', '{./}', '{x,{./,a}}', './{./,a}', '/{./,a}']) {
        expect(refused(pattern), `${options.dialect}: ${pattern}`).toBe('the braces expand to "./", which names no path');
      }
      expect(refused('{.//,a}')).toBe('the braces expand to ".//", which names no path');
      expect(refused('{././,a}')).toBe('the braces expand to "././", which names no path');
      expect(refused('{/./,a}')).toBe('the braces expand to "/./", which names no path');
      // The text refused is the one the braces give, which what stands
      // around them is part of.
      expect(refused('{.,a}/')).toBe('the braces expand to "./", which names no path');
      expect(refused('.{/,a}')).toBe('the braces expand to "./", which names no path');
      // A `.` alone, slashes alone - the root, not everything under it - and
      // nothing at all, which the empty pattern is refused for.
      expect(refused('{.,a}')).toBe('the braces expand to ".", which names no path');
      expect(refused('{/,a}')).toBe('the braces expand to "/", which names no path');
      expect(refused('{//,a}')).toBe('the braces expand to "//", which names no path');
      expect(refused('{,a}')).toBe('the braces expand to an empty pattern');
      expect(refused('{a,}')).toBe('the braces expand to an empty pattern');
      expect(refused('{}')).toBe('the braces expand to an empty pattern');
      // Without braces a pattern is refused in its own words.
      expect(refused('.')).toBe('the pattern names no path');
      expect(refused('./')).toBe('the pattern names the root itself, not a path under it');
    }
  });

  it('refuses a rooted `./` as it refuses a rooted `.`: the root, not everything under it', () => {
    for (const options of [PATH, RIPGREP, GITIGNORE]) {
      for (const pattern of ['/.', '/./', '/.//', '/././']) {
        expect(error(pattern, options), `${options.dialect}: ${pattern}`).toBe('the pattern names no path');
      }
    }
  });

  it('reads the slashes after a leading `./` with it, as POSIX reads `.//docs`: relative, never rooted', () => {
    // Rooted paths beside relative ones, and a name at the root and below
    // it, so `/docs`, `docs` and a name at any depth answer differently.
    const paths = ['docs', 'docs/a', 'x/docs', 'x/docs/a', '/docs', '/docs/a', 'x', 'y/x', '/x', 'a/docs'];
    for (const options of [PATH, RIPGREP, GITIGNORE]) {
      const answers = (pattern: string): boolean[] => paths.map((path) => matches(pattern, path, options));
      for (const pattern of ['.//docs', './//docs', './/.//docs', '././/docs', './/./docs']) {
        expect(answers(pattern), `${options.dialect}: ${pattern}`).toEqual(answers('./docs'));
      }
      // Inside braces as outside, and a slash the braces give after the
      // pattern's `./` is one of those slashes, as `./{/docs,x}` is `.//docs`
      // or `./x`.
      expect(answers('{.//docs,x}'), options.dialect).toEqual(answers('{./docs,x}'));
      expect(answers('./{/docs,x}'), options.dialect).toEqual(answers('{./docs,./x}'));
      expect(answers('.//{/docs,x}'), options.dialect).toEqual(answers('{./docs,./x}'));
      expect(answers('{.,a}//docs'), options.dialect).toEqual(answers('{./docs,a/docs}'));
    }
    // What that reading is in each dialect: the root's `docs` and what it
    // holds, a name at any depth, every `docs` directory - and never the
    // filesystem's `/docs`.
    expect(matches('.//docs', 'docs/a')).toBe(true);
    expect(matches('.//docs', '/docs')).toBe(false);
    expect(matches('.//docs', 'x/docs', RIPGREP)).toBe(true);
    expect(matches('.//docs', '/docs', RIPGREP)).toBe(false);
    expect(matches('.//docs', 'x/docs/a', GITIGNORE)).toBe(true);
    expect(matches('./{/docs,x}', 'docs')).toBe(true);
    expect(matches('./{/docs,x}', '/docs')).toBe(false);
    // A literal function is asked about the relative path, and the walk
    // starts below the root, not at the filesystem's.
    const asked: string[] = [];
    const glob = compileGlob('.//docs', {
      ...PATH,
      literal: (path) => {
        asked.push(path);
        return 'directory';
      },
    });
    expect(asked).toEqual(['docs']);
    expect(glob.bases).toEqual(['docs']);
    expect(compileGlob('.//docs/*.md', PATH).bases).toEqual(['docs']);
    // A slash before the `./` still roots the pattern: `/.//docs` is `/docs`.
    expect(matches('/.//docs', '/docs')).toBe(true);
    expect(matches('/.//docs', 'docs')).toBe(false);
  });

  it('keeps an alternative that names a path, whatever dots and slashes it holds', () => {
    // A leading `./` on a longer alternative is the current directory, and
    // dropped, as on a whole pattern: `{./a,b}` reads as `{a,b}`, which is
    // `./a` or `b`, in each dialect. In ripgrep that is `a` at any depth.
    const everywhere = ['a', 'a/x', 'x/a', 'x/a/y', 'b', 'x/b', 'c'];
    for (const options of [PATH, RIPGREP, GITIGNORE]) {
      const answers = (pattern: string): boolean[] => everywhere.map((path) => matches(pattern, path, options));
      expect(answers('{./a,b}'), options.dialect).toEqual(answers('{a,b}'));
      expect(answers('{./a,b}'), options.dialect).toEqual(everywhere.map((path) => matches('./a', path, options) || matches('b', path, options)));
    }
    expect(matches('{./a,b}', 'x/a', RIPGREP)).toBe(true);
    expect(matches('{./a,b}', 'x/a')).toBe(false);
    // A `.` or a slash with a name beside it names a path: the contents of
    // `src`, of `.github`, of `a`, and `a` itself.
    expect(matches('src/{./,a}', 'src/x/y')).toBe(true);
    expect(matches('src/{./,a}', 'src')).toBe(false);
    expect(matches('{.github/,a}', '.github/ci.yml')).toBe(true);
    expect(matches('{.github/,a}', '.github')).toBe(false);
    expect(matches('a{/,b}', 'a/x')).toBe(true);
    expect(matches('a{/,b}', 'a')).toBe(false);
    expect(matches('a{,.ts}', 'a')).toBe(true);
    expect(matches('a{,.ts}', 'a.ts')).toBe(true);
    expect(matches('{a/,b}', 'a/x')).toBe(true);
    expect(matches('{a/,b}', 'a')).toBe(false);
  });

  describe('a leading slash on a brace alternative', () => {
    // Rooted paths beside relative ones, and a name at the root, below it,
    // and at any depth, so a slash that roots, anchors or is dropped answers
    // differently.
    const paths = ['docs', 'docs/a', 'x/docs', 'x/docs/a', 'y/docs', 'y/docs/a', '/docs', '/docs/a', 'x', 'x/y', 'y/x', '/x', '/x/y', 'a/b', 'a/c', 'a/b/z', 'x/a/b', '/a/b', 'ac', 'bc', '/bc'];
    const dialects = [PATH, RIPGREP, GITIGNORE];
    const answers = (pattern: string, options: GlobOptions): boolean[] => paths.map((path) => matches(pattern, path, options));
    const either = (patterns: readonly string[], options: GlobOptions): boolean[] =>
      paths.map((path) => patterns.some((pattern) => matches(pattern, path, options)));

    it('means what it means on the pattern written alone, in each dialect', () => {
      // Braces expand before anything else is decided, the leading slash
      // included, so each alternative reads as that text alone reads.
      const cases: [string, ...string[]][] = [
        ['{/docs,x}', '/docs', 'x'],
        ['{x,/docs}', 'x', '/docs'],
        ['{/docs,/x}', '/docs', '/x'],
        ['{/docs}', '/docs'],
        ['{x,{/docs,y}}', 'x', '/docs', 'y'],
        ['{//docs,x}', '//docs', 'x'],
        ['{/docs/,x}', '/docs/', 'x'],
        ['{/a/b,x}', '/a/b', 'x'],
        ['{/*,x}', '/*', 'x'],
        ['{/**/docs,x}', '/**/docs', 'x'],
        ['{a,/b}c', 'ac', '/bc'],
        // A leading `./` is dropped first, from the alternative as from a
        // whole pattern, with the slashes after it.
        ['{.//docs,x}', './/docs', 'x'],
        ['{././/docs,x}', '././/docs', 'x'],
        ['./{/docs,x}', './/docs', './x'],
      ];
      for (const options of dialects) {
        for (const [braced, ...alone] of cases) {
          expect(answers(braced, options), `${options.dialect}: ${braced}`).toEqual(either(alone, options));
        }
      }
    });

    it('roots the alternative in the path and ripgrep dialects, and anchors it in gitignore', () => {
      // The filesystem's root, which a relative path is never under.
      expect(matches('{/docs,x}', '/docs/a')).toBe(true);
      expect(matches('{/docs,x}', 'docs')).toBe(false);
      expect(matches('{/docs,x}', '/x')).toBe(false);
      // A whole path, not a name at any depth, beside one that still is.
      expect(matches('{/docs,x}', '/docs', RIPGREP)).toBe(true);
      expect(matches('{/docs,x}', 'docs', RIPGREP)).toBe(false);
      expect(matches('{/docs,x}', 'x/docs', RIPGREP)).toBe(false);
      expect(matches('{/docs,x}', 'y/x', RIPGREP)).toBe(true);
      // The repository root, with everything in it, beside one that floats.
      expect(matches('{/docs,x}', 'docs/a', GITIGNORE)).toBe(true);
      expect(matches('{/docs,x}', 'y/docs', GITIGNORE)).toBe(false);
      expect(matches('{/docs,x}', 'y/x/a', GITIGNORE)).toBe(true);
      expect(matches('{/docs/,x}', 'docs', GITIGNORE)).toBe(true);
      expect(matches('{/docs/,x}', 'y/docs/a', GITIGNORE)).toBe(false);
    });

    it('asks a literal function about the rooted path, and walks from the root', () => {
      const asked: string[] = [];
      const glob = compileGlob('{/docs,x}', {
        ...PATH,
        literal: (path) => {
          asked.push(path);
          return 'directory';
        },
      });
      expect(asked).toEqual(['/docs', 'x']);
      expect(glob.bases).toEqual(['/docs', 'x']);
      expect(compileGlob('{/docs,x}', PATH).bases).toEqual(['/', '']);
      expect(compileGlob('{/docs/*.md,x}', RIPGREP).bases).toEqual(['/docs', '']);
      expect(compileGlob('{/src/gen/*.ts,x}', GITIGNORE).bases).toEqual(['src/gen', '']);
    });

    it('leaves a slash after a segment a doubled slash, and a slash before the braces rooting every alternative', () => {
      for (const options of dialects) {
        const reads = (pattern: string, ...alone: string[]): void => {
          expect(answers(pattern, options), `${options.dialect}: ${pattern}`).toEqual(either(alone, options));
        };
        // `a/{/b,c}` is `a//b` or `a/c`, and the empty segment in `a//b`
        // names nothing: it is `a/b`. Only a slash that starts a text leads it.
        reads('a/{/b,c}', 'a//b', 'a/c');
        reads('a/{/b,c}', 'a/b', 'a/c');
        reads('a{/b,c}', 'a/b', 'ac');
        reads('{a//b,x}', 'a/b', 'x');
        reads('/{docs,x}', '/docs', '/x');
        reads('{docs,x}', 'docs', 'x');
      }
      expect(matches('a/{/b,c}', 'a/b', RIPGREP)).toBe(true);
      expect(matches('a/{/b,c}', 'x/a/b', GITIGNORE)).toBe(false);
      expect(matches('/{docs,x}', '/x')).toBe(true);
      expect(matches('/{docs,x}', 'x')).toBe(false);
      expect(matches('/{docs,x}', 'x/y', GITIGNORE)).toBe(true);
      expect(matches('/{docs,x}', 'y/x', GITIGNORE)).toBe(false);
      expect(matches('{docs,x}', 'y/x', GITIGNORE)).toBe(true);
    });

    it('still refuses an alternative that names no path, before its slash is read', () => {
      for (const options of dialects) {
        expect(error('{/,a}', options)).toBe('the braces expand to "/", which names no path');
        expect(error('{/.,a}', options)).toBe('the braces expand to "/.", which names no path');
        expect(error('{.//,a}', options)).toBe('the braces expand to ".//", which names no path');
        expect(error('{/../a,b}', options)).toBe('a pattern cannot climb out of its root with ".."');
      }
    });
  });

  it('names the bracket that is never closed, not a brace closed before the separator', () => {
    // A class never reaches past a `/`, so the `}` before one closes the
    // group, and what is left open is the `[`.
    expect(error('src/{a,[b}/c]')).toBe('a "[" is never closed');
  });

  it('refuses ** inside a name with the two patterns the writer may have meant, built from theirs', () => {
    const advice = (pattern: string, options: GlobOptions = PATH): string =>
      error(pattern, options).replace('"**" means any number of directories only as a whole segment: ', '');
    // A name before the stars keeps one, and so does a name after them.
    expect(advice('src/a**')).toBe('write "src/a*/**" for any depth, or "src/a*" for one level');
    expect(advice('a**b**c')).toBe('write "a*/**/*b*/**/*c" for any depth, or "a*b*c" for one level');
    // What is not a run of stars inside a name is left as written: a leading
    // `./` or `/`, braces, a class, an escaped star, a trailing `/`, and a
    // globstar that already is a whole segment.
    expect(advice('./docs/**.md')).toBe('write "./docs/**/*.md" for any depth, or "./docs/*.md" for one level');
    expect(advice('/docs/**.md')).toBe('write "/docs/**/*.md" for any depth, or "/docs/*.md" for one level');
    expect(advice('src/**.{ts,tsx}')).toBe('write "src/**/*.{ts,tsx}" for any depth, or "src/*.{ts,tsx}" for one level');
    expect(advice('{docs,notes}/**.md')).toBe('write "{docs,notes}/**/*.md" for any depth, or "{docs,notes}/*.md" for one level');
    expect(advice('src/[**]x/**.md')).toBe('write "src/[**]x/**/*.md" for any depth, or "src/[**]x/*.md" for one level');
    expect(advice('[\\]**]x**')).toBe('write "[\\]**]x*/**" for any depth, or "[\\]**]x*" for one level');
    expect(advice('x\\**/docs/**.md')).toBe('write "x\\**/docs/**/*.md" for any depth, or "x\\**/docs/*.md" for one level');
    expect(advice('docs/**.md/')).toBe('write "docs/**/*.md/" for any depth, or "docs/*.md/" for one level');
    expect(advice('a/**/b**')).toBe('write "a/**/b*/**" for any depth, or "a/**/b*" for one level');
    expect(advice('a/***/b')).toBe('write "a/**/b" for any depth, or "a/*/b" for one level');
    // It mends the stars and nothing else: a class never closed is refused next.
    expect(advice('src/a**/[b')).toBe('write "src/a*/**/[b" for any depth, or "src/a*/[b" for one level');
    // Typed on a Windows shell, the advice is written with `/`.
    expect(advice('docs\\**.md', { ...PATH, backslash: 'separator' })).toBe('write "docs/**/*.md" for any depth, or "docs/*.md" for one level');
  });

  it('advises patterns that compile, beside a brace too', () => {
    for (const pattern of ['docs/**.md', 'src/a**', 'a**b**c', 'docs/{**.md,*.txt}', 'x{a**,b}y', '[\\]**]x**', 'a\\***', 'a/***/b']) {
      const [, deep, flat] = /write "(.*)" for any depth, or "(.*)" for one level$/.exec(error(pattern)) as RegExpExecArray;
      expect(parseGlob(deep as string, PATH).ok, `${pattern}: ${deep}`).toBe(true);
      expect(parseGlob(flat as string, PATH).ok, `${pattern}: ${flat}`).toBe(true);
    }
    expect(error('docs/{**.md,*.txt}')).toContain('write "docs/{*/**/*.md,*.txt}" for any depth');
  });

  it('reads parentheses without a bar in them as characters of a name', () => {
    expect(matches('docs/C++(notes).md', 'docs/C++(notes).md')).toBe(true);
    expect(matches('docs/team@(home).md', 'docs/team@(home).md')).toBe(true);
    expect(matches('books/*(2017).md', 'books/Dune (2017).md')).toBe(true);
    expect(matches('books/*(2017).md', 'books/Dune.md')).toBe(false);
    expect(matches('books/*[(]2017).md', 'books/x(2017).md')).toBe(true);
  });

  it('refuses a brace explosion', () => {
    const pattern = Array.from({ length: 9 }, () => '{a,b}').join('');
    expect(error(pattern)).toBe(`the braces expand to more than ${MAX_ALTERNATIVES} patterns`);
    expect(parseGlob(Array.from({ length: 8 }, () => '{a,b}').join(''), PATH).ok).toBe(true);
  });

  it('refuses a pattern that compiles to more states than the ceiling, and compiles one that fills it', () => {
    const tooLarge = `the pattern compiles to more than ${MAX_STATES} states`;
    // Alternatives are compiled side by side, so as many as the braces allow,
    // each a long name, outgrow the ceiling. The refusal is an answer, as a
    // malformed pattern's is, and not an exception.
    const wide = `${'{a,b}'.repeat(8)}/${'x'.repeat(300)}`;
    expect(parseGlob(wide, PATH)).toEqual({ ok: false, error: tooLarge });
    expect(parseGlobList(['docs/*.md', wide], PATH)).toEqual({ ok: false, error: `"${wide}": ${tooLarge}` });
    expect(() => compileGlob(wide, PATH)).toThrow(GlobError);
    // A literal needs a state for each character and one to accept.
    const file: GlobOptions = { ...PATH, literal: 'file' };
    expect(error('a'.repeat(MAX_STATES), file)).toBe(tooLarge);
    expect(() => compileGlob('a'.repeat(MAX_STATES), file)).toThrow(`invalid glob "${'a'.repeat(MAX_STATES)}": ${tooLarge}`);
    // The longest literal that compiles fills the ceiling exactly, and matches.
    const compiles = (length: number): boolean => parseGlob('a'.repeat(length), file).ok;
    let fits = 1;
    let refused = MAX_STATES;
    while (refused - fits > 1) {
      const middle = (fits + refused) >> 1;
      if (compiles(middle)) fits = middle;
      else refused = middle;
    }
    const longest = compileGlob('a'.repeat(fits), file);
    expect(longest.automaton.kinds.length).toBe(MAX_STATES);
    expect(longest.match('a'.repeat(fits))).toBe(true);
    expect(longest.match('a'.repeat(fits - 1))).toBe(false);
  });

  it("passes on what a literal reading throws, as the caller's failure and not a malformed pattern", () => {
    const reading = (): 'file' => {
      throw new Error('the tree could not be read');
    };
    expect(() => parseGlob('src/a', { ...PATH, literal: reading })).toThrow('the tree could not be read');
    expect(() => compileGlob('src/a', { ...PATH, literal: reading })).toThrow('the tree could not be read');
  });

  it('throws a GlobError naming the pattern from compileGlob', () => {
    expect(() => compileGlob('src/[ab', PATH)).toThrow(GlobError);
    expect(() => compileGlob('src/[ab', PATH)).toThrow('invalid glob "src/[ab": a "[" is never closed');
    // What a tool prints when it lets the error through names its kind.
    expect(String(new GlobError('src/[ab', 'a "[" is never closed'))).toBe('GlobError: invalid glob "src/[ab": a "[" is never closed');
    expect(String(new AutomatonTooLarge())).toBe(`AutomatonTooLarge: the pattern compiles to more than ${MAX_STATES} states`);
  });

  it('reads backslashes as separators when told to', () => {
    const windows: GlobOptions = { dialect: 'path', caseSensitive: true, backslash: 'separator' };
    expect(matches('src\\app\\*.ts', 'src/app/a.ts', windows)).toBe(true);
    expect(parseGlob('src\\app', windows).ok).toBe(true);
  });

  it('knows glob syntax when it sees it', () => {
    expect(isGlobSyntax('src/*.ts')).toBe(true);
    expect(isGlobSyntax('src/{a,b}')).toBe(true);
    expect(isGlobSyntax('src/[ab]')).toBe(true);
    expect(isGlobSyntax('src/a.ts')).toBe(false);
  });
});

describe('the path dialect', () => {
  it('reads a literal as either a file or a directory unless told which', () => {
    expect(matches('src/auth', 'src/auth')).toBe(true);
    expect(matches('src/auth', 'src/auth/login.ts')).toBe(true);
    expect(matches('src/auth', 'src/authz.ts')).toBe(false);
    const file: GlobOptions = { ...PATH, literal: 'file' };
    expect(matches('src/auth', 'src/auth', file)).toBe(true);
    expect(matches('src/auth', 'src/auth/login.ts', file)).toBe(false);
    const directory: GlobOptions = { ...PATH, literal: 'directory' };
    expect(matches('src/auth', 'src/auth', directory)).toBe(false);
    expect(matches('src/auth', 'src/auth/login.ts', directory)).toBe(true);
  });

  it('asks a function about each literal path, braces expanded', () => {
    const asked: string[] = [];
    const glob = compileGlob('src/{a.ts,lib}', {
      ...PATH,
      literal: (path) => {
        asked.push(path);
        return path.endsWith('.ts') ? 'file' : 'directory';
      },
    });
    expect(asked).toEqual(['src/a.ts', 'src/lib']);
    expect(glob.match('src/a.ts')).toBe(true);
    expect(glob.match('src/a.ts/x')).toBe(false);
    expect(glob.match('src/lib/x.ts')).toBe(true);
    expect(glob.match('src/lib')).toBe(false);
  });

  it('never asks about a pattern with glob syntax, and reads a trailing slash as a directory', () => {
    const glob = compileGlob('src/*', { ...PATH, literal: () => { throw new Error('asked'); } });
    expect(glob.match('src/a')).toBe(true);
    expect(glob.match('src/a/b')).toBe(false);
    expect(matches('src/', 'src/a/b')).toBe(true);
    expect(matches('src/', 'src')).toBe(false);
  });

  it('reads a trailing slash on a brace alternative as it reads one on the pattern: the contents', () => {
    // Braces expand first, so `src/` inside them is `src/` on its own.
    for (const pattern of ['src/', '{src,lib}/', '{src/,lib}', '{lib,src/}', '{src/,lib/}', '{src//,lib}', '{x,{src/,y}}', './{src/,lib}']) {
      expect(matches(pattern, 'src/a/b'), pattern).toBe(true);
      expect(matches(pattern, 'src'), pattern).toBe(false);
    }
    // The alternative with no slash is still a literal, read as either.
    expect(matches('{src/,lib}', 'lib')).toBe(true);
    expect(matches('{src/,lib}', 'lib/a')).toBe(true);
    // Deeper, and beside an alternative with glob syntax, which it leaves alone.
    expect(matches('{docs/adr/,*.md}', 'docs/adr/0001.md')).toBe(true);
    expect(matches('{docs/adr/,*.md}', 'docs/adr')).toBe(false);
    expect(matches('{docs/adr/,*.md}', 'a.md')).toBe(true);
    expect(matches('{docs/adr/,*.md}', 'docs/a.md')).toBe(false);
    // A slash before the end of an alternative is a separator, not a trailing one.
    expect(matches('{src/,lib}x', 'src/x')).toBe(true);
    expect(matches('{src/,lib}x', 'src/x/y')).toBe(true);
    expect(matches('{src/,lib}x', 'src/y')).toBe(false);
  });

  it('asks nothing about an alternative written as a directory, and walks into it', () => {
    const asked: string[] = [];
    const glob = compileGlob('{src/,lib}', {
      ...PATH,
      literal: (path) => {
        asked.push(path);
        return 'file';
      },
    });
    expect(asked).toEqual(['lib']);
    expect(glob.match('src/a.ts')).toBe(true);
    expect(glob.match('lib')).toBe(true);
    expect(glob.match('lib/a.ts')).toBe(false);
    expect(glob.bases).toEqual(['src', '']);
  });

  it('roots a pattern with a leading slash at the root of the filesystem', () => {
    expect(matches('/repo/docs/*.md', '/repo/docs/a.md')).toBe(true);
    expect(matches('/repo/docs/*.md', 'repo/docs/a.md')).toBe(false);
    expect(matches('/C:/repo/*.md', '/C:/repo/a.md')).toBe(true);
  });

  it('names the directories a walk must enter', () => {
    expect(compileGlob('docs/adr/*.md', PATH).bases).toEqual(['docs/adr']);
    expect(compileGlob('docs/**/x.md', PATH).bases).toEqual(['docs']);
    expect(compileGlob('**/x.md', PATH).bases).toEqual(['']);
    expect(compileGlob('{docs,specs}/*.md', PATH).bases).toEqual(['docs', 'specs']);
    // A literal may be a file, so the walk starts at the directory holding it.
    expect(compileGlob('docs/adr/0001.md', PATH).bases).toEqual(['docs/adr']);
    expect(compileGlob('docs/adr', { ...PATH, literal: 'directory' }).bases).toEqual(['docs/adr']);
    expect(compileGlob('/repo/docs/*.md', PATH).bases).toEqual(['/repo/docs']);
  });
});

describe('the ripgrep dialect', () => {
  it('matches a pattern with no slash against the last segment at any depth', () => {
    expect(matches('*.ts', 'src/deep/a.ts', RIPGREP)).toBe(true);
    expect(matches('*.ts', 'a.ts', RIPGREP)).toBe(true);
    expect(matches('a.ts', 'src/a.ts', RIPGREP)).toBe(true);
    expect(matches('src', 'src/a.ts', RIPGREP)).toBe(false);
    expect(compileGlob('*.ts', RIPGREP).bases).toEqual(['']);
  });

  it('matches a pattern with a slash against the whole path', () => {
    expect(matches('src/*.ts', 'src/a.ts', RIPGREP)).toBe(true);
    expect(matches('src/*.ts', 'lib/src/a.ts', RIPGREP)).toBe(false);
    expect(matches('src/', 'src/a/b.ts', RIPGREP)).toBe(true);
    expect(matches('src/a.ts', 'src/a.ts/b', RIPGREP)).toBe(false);
  });

  it('treats each brace alternative on its own', () => {
    const glob = compileGlob('{*.ts,docs/*.md}', RIPGREP);
    expect(glob.match('deep/a.ts')).toBe(true);
    expect(glob.match('docs/a.md')).toBe(true);
    expect(glob.match('x/docs/a.md')).toBe(false);
  });

  it('reads an alternative with a trailing slash as `src/` alone: the contents, matched against the whole path', () => {
    const glob = compileGlob('{src/,*.md}', RIPGREP);
    expect(glob.match('src/deep/a.ts')).toBe(true);
    expect(glob.match('src')).toBe(false);
    // Not a name at any depth: the slash makes it a whole path.
    expect(glob.match('lib/src')).toBe(false);
    expect(glob.match('lib/src/a.ts')).toBe(false);
    expect(glob.match('lib/a.md')).toBe(true);
    expect(glob.bases).toEqual(['src', '']);
  });
});

describe('the gitignore dialect', () => {
  it('matches a pattern with no slash against any segment, and everything beneath it', () => {
    expect(matches('tests', 'packages/x/tests/a.ts', GITIGNORE)).toBe(true);
    expect(matches('tests', 'tests', GITIGNORE)).toBe(true);
    expect(matches('tests', 'attests/a.ts', GITIGNORE)).toBe(false);
    expect(matches('*.log', 'a/b.log/c', GITIGNORE)).toBe(true);
  });

  it('anchors a pattern with a slash, or a leading one, at the root', () => {
    expect(matches('src/config', 'src/config/a.ts', GITIGNORE)).toBe(true);
    expect(matches('src/config', 'lib/src/config', GITIGNORE)).toBe(false);
    expect(matches('/build', 'build/a', GITIGNORE)).toBe(true);
    expect(matches('/build', 'x/build/a', GITIGNORE)).toBe(false);
    expect(matches('**/gen', 'a/b/gen/c.ts', GITIGNORE)).toBe(true);
  });

  it('reads a trailing slash as nothing more than the name', () => {
    expect(matches('build/', 'build', GITIGNORE)).toBe(true);
    expect(matches('build/', 'x/build/y', GITIGNORE)).toBe(true);
    // At the end of a brace alternative too, and a `.` segment names nothing:
    // neither is a slash that anchors, and the directory is excluded with
    // what is in it, where the other dialects read the slash as contents.
    expect(matches('{build/,dist}', 'x/build/y', GITIGNORE)).toBe(true);
    expect(matches('{build/,dist}', 'x/build', GITIGNORE)).toBe(true);
    expect(matches('{dist,build/}', 'build', GITIGNORE)).toBe(true);
    expect(matches('{build//,dist}', 'x/build', GITIGNORE)).toBe(true);
    expect(compileGlob('{build/,dist}', GITIGNORE).bases).toEqual(['']);
    expect(matches('build/.', 'x/build/y', GITIGNORE)).toBe(true);
    // A slash inside the alternative still anchors it.
    expect(matches('{src/gen/,dist}', 'src/gen', GITIGNORE)).toBe(true);
    expect(matches('{src/gen/,dist}', 'src/gen/a.ts', GITIGNORE)).toBe(true);
    expect(matches('{src/gen/,dist}', 'x/src/gen/a.ts', GITIGNORE)).toBe(false);
  });

  it('names no base for a floating pattern', () => {
    expect(compileGlob('tests', GITIGNORE).bases).toEqual(['']);
    expect(compileGlob('src/gen/*.ts', GITIGNORE).bases).toEqual(['src/gen']);
    expect(compileGlob('src/config', GITIGNORE).bases).toEqual(['src']);
    expect(compileGlob('src/gen/config', GITIGNORE).bases).toEqual(['src/gen']);
  });
});

describe('a witness', () => {
  const glob = (pattern: string, options: GlobOptions = PATH) => compileGlob(pattern, options);

  it('is a shortest path both scopes match, spelled readably', () => {
    expect(globWitness([glob('src/**'), glob('**/*.ts')])).toEqual({ kind: 'found', path: 'src/.ts' });
    expect(globWitness([glob('docs/adr/**'), glob('docs/adr/**')])).toEqual({ kind: 'found', path: 'docs/adr/x' });
    expect(globWitness([glob('src/a.ts'), glob('src/**')])).toEqual({ kind: 'found', path: 'src/a.ts' });
    expect(globWitness([glob('src/[0-9]*'), glob('src/*9')])).toEqual({ kind: 'found', path: 'src/9' });
  });

  it('finds characters no readable one can stand in for', () => {
    // Only the point just past the end of a range lies in both: the search
    // must try the boundaries of every set, not a list of favourites.
    const char = (point: number): string => String.fromCodePoint(point);
    const beyond = `[!${char(0x01)}-${char(0xff)}]`;
    expect(globWitness([glob(beyond), glob(beyond)])).toEqual({ kind: 'found', path: char(0x100) });
    const cyrillic = glob(`[${char(0x400)}-${char(0x4ff)}]`);
    const narrow = glob(`[${char(0x450)}-${char(0x460)}]`);
    expect(globWitness([cyrillic, narrow])).toEqual({ kind: 'found', path: char(0x450) });
    expect(globWitness([glob('?'), glob(beyond)])).toEqual({ kind: 'found', path: char(0x100) });
    // Avoiding every character `?` names leaves none, readable or not.
    expect(globWitness([glob(beyond)], [glob('?')])).toEqual({ kind: 'none' });
    // The character may be one only a pattern to avoid names, whatever else
    // the patterns to avoid hold.
    expect(globWitness([glob('?')], [glob(`[!${char(0x100)}]`)])).toEqual({ kind: 'found', path: char(0x100) });
    expect(globWitness([glob('?')], [glob('*/x'), glob(`[${char(0x01)}-${char(0xff)}]`)])).toEqual({ kind: 'found', path: char(0x100) });
    // And past the last code point there is none to try.
    expect(globWitness([glob(`[!${char(0x01)}-${char(0x10ffff)}]`)])).toEqual({ kind: 'none' });
  });

  it('is a file, never a directory or an empty segment', () => {
    expect(globWitness([glob('a/*/b', PATH), glob('a/*/b', PATH)])).toEqual({ kind: 'found', path: 'a/x/b' });
    expect(globWitness([glob('*'), glob('.*')])).toEqual({ kind: 'found', path: '.x' });
  });

  it('is a valid path: no `..` segment and no NUL, even where only those would do', () => {
    expect(globWitness([glob('.?'), glob('?.')])).toEqual({ kind: 'none' });
    expect(globWitness([glob('a?'), glob(`?${String.fromCodePoint(0)}`)])).toEqual({ kind: 'none' });
  });

  it('proves there is none', () => {
    expect(globWitness([glob('src/**'), glob('lib/**')])).toEqual({ kind: 'none' });
    expect(globWitness([glob('src/a.ts', { ...PATH, literal: 'file' }), glob('**/x.ts')])).toEqual({ kind: 'none' });
    expect(globWitness([glob('*.ts'), glob('*.md')])).toEqual({ kind: 'none' });
  });

  it('avoids what either side protects', () => {
    const everything = glob('src/**');
    const schema = glob('src/db/schema.ts');
    expect(globWitness([everything, glob('src/db/**')], [schema])).toEqual({ kind: 'found', path: 'src/db/x' });
    expect(globWitness([everything, glob('src/db/schema.ts')], [schema])).toEqual({ kind: 'none' });
  });

  it('decides whether one scope lies inside others', () => {
    expect(globCovers([glob('src/**')], glob('src/db/schema.ts'))).toBe(true);
    expect(globCovers([glob('src/db/schema.ts')], glob('src/**'))).toBe(false);
    expect(globCovers([glob('src/*.ts'), glob('src/*.md')], glob('src/{a.ts,b.md}', { ...PATH, literal: 'file' }))).toBe(true);
    // Read as either, a literal also names everything beneath it, which no
    // pattern with a wildcard in its last segment covers.
    expect(globCovers([glob('src/*.ts')], glob('src/a.ts'))).toBe(false);
  });

  it('says undecided when the budget runs out, never a guess', () => {
    expect(globWitness([glob('src/**'), glob('**/*.ts')], [], 1)).toEqual({ kind: 'undecided' });
    expect(globCovers([glob('src/*.ts')], glob('src/**'), 1)).toBe('undecided');
    // The budget counts the search states visited: the start, then the one a
    // one-character witness ends on.
    const file = glob('a', { ...PATH, literal: 'file' });
    expect(globWitness([file], [], 1)).toEqual({ kind: 'undecided' });
    expect(globWitness([file], [], 2)).toEqual({ kind: 'found', path: 'a' });
  });

  it('refuses to compare scopes that ignore case, or to look for a path nothing asks for', () => {
    expect(() => globWitness([compileGlob('a', { dialect: 'path', caseSensitive: false })])).toThrow(
      '"a" ignores case; scopes are compared case-sensitively',
    );
    expect(() => globWitness([], [glob('a')])).toThrow('a witness search needs at least one automaton to satisfy');
  });
});

describe('a list', () => {
  it('lets the last entry that matches decide, and a ! entry take paths back out', () => {
    const parsed = parseGlobList(['docs/**/*.md', '!docs/drafts/**', 'docs/drafts/keep.md'], PATH);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.list.match('docs/a.md')).toBe(true);
    expect(parsed.list.match('docs/drafts/b.md')).toBe(false);
    expect(parsed.list.match('docs/drafts/keep.md')).toBe(true);
    expect(parsed.list.match('src/a.ts')).toBe(false);
    expect(parsed.list.entries.map((e) => e.negated)).toEqual([false, true, false]);
  });

  it('names the entry that does not parse', () => {
    expect(parseGlobList(['docs/*.md', ' !docs/[x'], PATH)).toEqual({
      ok: false,
      error: '" !docs/[x": a "[" is never closed',
    });
  });
});

describe("a pattern's alternatives, as each is read", () => {
  const read = (source: string, options: Pick<GlobOptions, 'backslash'> = {}): { rooted: boolean; alternatives: [boolean, string][] } => {
    const result = globAlternatives(source, options);
    if (!result.ok) throw new Error(result.error);
    return { rooted: result.rooted, alternatives: result.alternatives.map((alternative) => [alternative.rooted, alternative.text]) };
  };
  const refusal = (source: string): string => {
    const result = globAlternatives(source);
    if (result.ok) throw new Error(`"${source}" was read`);
    return result.error;
  };

  it('gives each text the braces give, in their order, rooted as parseGlob roots it', () => {
    expect(read('docs/*.md')).toEqual({ rooted: false, alternatives: [[false, 'docs/*.md']] });
    expect(read('{a,{b,c}}d')).toEqual({ rooted: false, alternatives: [[false, 'ad'], [false, 'bd'], [false, 'cd']] });
    // A leading slash on the pattern roots every alternative; one on an
    // alternative roots that one; one after a segment roots nothing.
    expect(read('/{docs,x}')).toEqual({ rooted: true, alternatives: [[true, 'docs'], [true, 'x']] });
    expect(read('{/docs,x}')).toEqual({ rooted: false, alternatives: [[true, 'docs'], [false, 'x']] });
    expect(read('a/{/b,c}')).toEqual({ rooted: false, alternatives: [[false, 'a//b'], [false, 'a/c']] });
    // Without the slashes that lead it, and a `./` before them, as `/./docs`
    // and `//docs` are read.
    expect(read('//docs')).toEqual({ rooted: true, alternatives: [[true, 'docs']] });
    expect(read('/./docs')).toEqual({ rooted: true, alternatives: [[true, 'docs']] });
    expect(read(' /docs ')).toEqual({ rooted: true, alternatives: [[true, 'docs']] });
    expect(read('{/./docs,/.//x}')).toEqual({ rooted: false, alternatives: [[true, 'docs'], [true, 'x']] });
    // A `./` takes the slashes after it, and leaves a slash the braces give
    // after the pattern's `./` rootless.
    expect(read('.//docs')).toEqual({ rooted: false, alternatives: [[false, 'docs']] });
    expect(read('{.//docs,./x}')).toEqual({ rooted: false, alternatives: [[false, 'docs'], [false, 'x']] });
    expect(read('./{/docs,x}')).toEqual({ rooted: false, alternatives: [[false, 'docs'], [false, 'x']] });
    // A `!` after a `./` is a character of a name, not a negation.
    expect(read('./!a')).toEqual({ rooted: false, alternatives: [[false, '!a']] });
    expect(read('{./!a,x}')).toEqual({ rooted: false, alternatives: [[false, '!a'], [false, 'x']] });
    // A trailing slash stays, for the dialect to read.
    expect(read('{src/,/lib/}')).toEqual({ rooted: false, alternatives: [[false, 'src/'], [true, 'lib/']] });
    // A `\` is a separator when the caller reads it as one.
    expect(read('{\\docs,x}', { backslash: 'separator' })).toEqual({ rooted: false, alternatives: [[true, 'docs'], [false, 'x']] });
  });

  it('gives each rooted alternative as parseGlob reads it, in every dialect', () => {
    const paths = ['docs', 'docs/a', 'x/docs', '/docs', '/docs/a', 'x', 'y/x', '/x', 'a/b', '/a/b', '!a', 'x/!a'];
    for (const options of [PATH, RIPGREP, GITIGNORE]) {
      for (const pattern of ['{/docs,x}', '/{docs,x}', './{/docs,x}', '{.//docs,/x}', 'a/{/b,c}', '{/a/b,x}', './!a', '{./!a,/x}']) {
        const result = globAlternatives(pattern);
        if (!result.ok) throw new Error(result.error);
        // Written alone, a relative text goes behind `./`, which keeps a `!`
        // it starts with a character.
        const alone = result.alternatives.map((alternative) => `${alternative.rooted ? '/' : './'}${alternative.text}`);
        const either = paths.map((path) => alone.some((text) => matches(text, path, options)));
        expect(paths.map((path) => matches(pattern, path, options)), `${options.dialect}: ${pattern}`).toEqual(either);
      }
    }
  });

  it('writes a brace or a comma no group took as a class, so the text reads the same inside braces again', () => {
    expect(read('{/a,b}c,d')).toEqual({ rooted: false, alternatives: [[true, 'ac[,]d'], [false, 'bc[,]d']] });
    expect(read('{/a,b}}')).toEqual({ rooted: false, alternatives: [[true, 'a[}]'], [false, 'b[}]']] });
    // An escaped one, and one inside a class, are copied as written.
    expect(read('{/a,b\\,c\\}}')).toEqual({ rooted: false, alternatives: [[true, 'a'], [false, 'b\\,c\\}']] });
    expect(read('{/[,}]a,[!,]b}')).toEqual({ rooted: false, alternatives: [[true, '[,}]a'], [false, '[!,]b']] });
    expect(read('{/[\\],]a,b}')).toEqual({ rooted: false, alternatives: [[true, '[\\],]a'], [false, 'b']] });
    expect(read('{/[],]a,b}')).toEqual({ rooted: false, alternatives: [[true, '[],]a'], [false, 'b']] });
    // A `[` that closes no class is a character, and a `]` that closes none.
    expect(read('{/[a,b}')).toEqual({ rooted: false, alternatives: [[true, '[a'], [false, 'b']] });
    expect(read('{/a,b}c,]')).toEqual({ rooted: false, alternatives: [[true, 'ac[,]]'], [false, 'bc[,]]']] });
    // Written again inside braces, the alternatives read as the pattern did.
    const paths = ['ac,d', 'bc,d', '/ac,d', 'a}', 'b}', '/a}', 'b,c}', ',a', '/,a', ']a', '/]a'];
    for (const pattern of ['{/a,b}c,d', '{/a,b}}', '{/a,b\\,c\\}}', '{/[,}]a,[!,]b}', '{/[\\],]a,b}', '{/[],]a,b}']) {
      const result = globAlternatives(pattern);
      if (!result.ok) throw new Error(result.error);
      const again = `{${result.alternatives.map((alternative) => `${alternative.rooted ? '/' : ''}${alternative.text}`).join(',')}}`;
      expect(paths.map((path) => matches(again, path)), pattern).toEqual(paths.map((path) => matches(pattern, path)));
    }
  });

  it('refuses only what stops it reading an alternative, in the words parseGlob uses', () => {
    expect(refusal('')).toBe('the pattern is empty');
    expect(refusal('!docs')).toBe('a negated pattern is a list entry, not a glob; narrow the positive pattern');
    expect(refusal('+(a|b)')).toBe(error('+(a|b)'));
    expect(refusal('{a,b')).toBe('a "{" is never closed');
    expect(refusal('{a,b}'.repeat(9))).toBe(`the braces expand to more than ${MAX_ALTERNATIVES} patterns`);
    // An alternative parseGlob refuses is read all the same.
    expect(read('{/,x}')).toEqual({ rooted: false, alternatives: [[true, ''], [false, 'x']] });
    expect(read('./')).toEqual({ rooted: false, alternatives: [[false, '']] });
  });
});

describe('a pattern typed below the root', () => {
  const SEPARATOR: Pick<GlobOptions, 'backslash'> = { backslash: 'separator' };
  const rebased = (entry: string, directory: string, options: Pick<GlobOptions, 'backslash'> = {}): string => {
    const result = rebaseGlob(entry, directory, options);
    if (!result.ok) throw new Error(result.error);
    return result.pattern;
  };
  const refused = (entry: string, directory: string, options: Pick<GlobOptions, 'backslash'> = {}): string => {
    const result = rebaseGlob(entry, directory, options);
    if (result.ok) throw new Error(`"${entry}" was rebased to "${result.pattern}"`);
    return result.error;
  };
  // Relative paths inside and outside the directory, and rooted ones.
  const paths = ['sub/docs', 'sub/docs/a', 'sub/x', 'sub/x/a', 'docs', 'docs/a', 'x', '/docs', '/docs/a', '/x', 'sub/deep/b', 'sub/a', 'sub/b', 'a', 'b'];
  // What the rebased pattern matches, as the list a tool compiles it into.
  const answers = (pattern: string): boolean[] => {
    const parsed = parseGlobList([pattern], PATH);
    if (!parsed.ok) throw new Error(parsed.error);
    return paths.map((path) => parsed.list.match(path));
  };
  const either = (...patterns: string[]): boolean[] => paths.map((path) => patterns.some((pattern) => matches(pattern, path)));

  it('puts the directory in front of a relative pattern, keeping its braces', () => {
    expect(rebased('docs/*.md', 'sub')).toBe('sub/docs/*.md');
    expect(rebased('*.md', 'sub/deep')).toBe('sub/deep/*.md');
    expect(rebased('{docs,x}', 'sub')).toBe('sub/{docs,x}');
    expect(rebased('{a,b}/*.md', 'sub')).toBe('sub/{a,b}/*.md');
    // Read as `parseGlob` reads it: trimmed, and without its `./`.
    expect(rebased('  docs ', 'sub')).toBe('sub/docs');
    expect(rebased('./docs', 'sub')).toBe('sub/docs');
    expect(answers(rebased('{docs,x}', 'sub'))).toEqual(either('sub/docs', 'sub/x'));
  });

  it('leaves an entry typed at the root as it was typed', () => {
    for (const entry of ['docs', ' docs', '{/docs,x}', '!/docs', '../x', '']) expect(rebased(entry, '')).toBe(entry);
  });

  it('keeps a rooted pattern, which names the same place from anywhere, and asks nothing of the directory', () => {
    expect(rebased('/docs', 'sub')).toBe('/docs');
    expect(rebased('//docs', 'sub')).toBe('//docs');
    expect(rebased('/{docs,x}', 'sub')).toBe('/{docs,x}');
    expect(rebased('{/docs,/x}', 'sub')).toBe('{/docs,/x}');
    expect(rebased('{/a,/b}/c', 'sub')).toBe('{/a,/b}/c');
    expect(rebased(' /docs', 'a[1]')).toBe('/docs');
    expect(rebased('{/docs,/x}', 'a[1]')).toBe('{/docs,/x}');
    // A `\` is a separator when the caller reads it as one, so `\docs` is `/docs`.
    expect(rebased('\\docs', 'sub', SEPARATOR)).toBe('/docs');
    expect(answers(rebased('/docs', 'sub'))).toEqual(either('/docs'));
  });

  it('rebases each brace alternative as that text written alone, rooted or relative', () => {
    // The rooted alternative is kept, as `/docs` is, and the relative one moves.
    expect(rebased('{/docs,x}', 'sub')).toBe('{/docs,sub/x}');
    expect(answers(rebased('{/docs,x}', 'sub'))).toEqual(either('/docs', 'sub/x'));
    expect(rebased('{x,/docs}/*.md', 'sub')).toBe('{sub/x/*.md,/docs/*.md}');
    expect(rebased('{/docs,x}', 'sub', SEPARATOR)).toBe('{/docs,sub/x}');
    expect(rebased('{\\docs,x}', 'sub', SEPARATOR)).toBe('{/docs,sub/x}');
    // Only a slash that starts a text roots it: after a segment, or after the
    // pattern's `./`, it is a separator, and the braces stay.
    expect(rebased('a/{/b,c}', 'sub')).toBe('sub/a/{/b,c}');
    expect(rebased('./{/docs,x}', 'sub')).toBe('sub/{/docs,x}');
    expect(answers(rebased('./{/docs,x}', 'sub'))).toEqual(either('sub/docs', 'sub/x'));
    expect(rebased('{.//docs,x}', 'sub')).toBe('sub/{.//docs,x}');
    expect(answers(rebased('{.//docs,x}', 'sub'))).toEqual(either('sub/docs', 'sub/x'));
    // An alternative that names no path is kept as the braces gave it, and
    // refused as it is at the root: typed below it, `{/,x}` is not the
    // directory's contents.
    expect(rebased('{/,x}', 'sub')).toBe('{/,sub/x}');
    expect(error(rebased('{/,x}', 'sub'))).toBe('the braces expand to "/", which names no path');
  });

  it('keeps a leading `!` in front, as a list reads it', () => {
    expect(rebased('!docs/x', 'sub')).toBe('!sub/docs/x');
    expect(rebased(' ! docs', 'sub')).toBe('!sub/docs');
    expect(rebased('!/docs', 'sub')).toBe('!/docs');
    expect(rebased('!{/docs,x}', 'sub')).toBe('!{/docs,sub/x}');
    const list = parseGlobList(['sub/**', rebased('!docs/**', 'sub')], PATH);
    if (!list.ok) throw new Error(list.error);
    expect(list.list.match('sub/x/a')).toBe(true);
    expect(list.list.match('sub/docs/a')).toBe(false);
  });

  it('climbs out of the directory with a leading `..`, and no further than the root', () => {
    expect(rebased('../*.md', 'docs/deep')).toBe('docs/*.md');
    expect(rebased('../../*.md', 'a/b/c')).toBe('a/*.md');
    expect(rebased('..', 'docs/deep')).toBe('docs/');
    expect(rebased('./../x', 'sub/deep')).toBe('sub/x');
    expect(rebased('..//../x', 'a/b/c')).toBe('a/x');
    expect(rebased('../{a,b}', 'sub/deep')).toBe('sub/{a,b}');
    // To the root itself, the rest is read from the root, and the root alone
    // is refused as `./` is.
    expect(rebased('../x', 'sub')).toBe('./x');
    expect(answers(rebased('../x', 'sub'))).toEqual(either('x'));
    expect(rebased('../{/docs,x}', 'sub')).toBe('./{/docs,x}');
    expect(answers(rebased('../{/docs,x}', 'sub'))).toEqual(either('docs', 'x'));
    expect(rebased('..', 'sub')).toBe('./');
    expect(error(rebased('..', 'sub'))).toBe('the pattern names the root itself, not a path under it');
    // Each alternative climbs as far as it says.
    expect(rebased('{../a,b}', 'sub/deep')).toBe('{sub/a,sub/deep/b}');
    expect(answers(rebased('{../a,b}', 'sub/deep'))).toEqual(either('sub/a', 'sub/deep/b'));
    expect(rebased('{../a,../b}', 'sub/deep')).toBe('{sub/a,sub/b}');
    expect(rebased('{..,x}/a', 'sub/deep')).toBe('{sub/a,sub/deep/x/a}');
    expect(rebased('..{/a,b}', 'sub/deep')).toBe('{sub/a,sub/deep/..b}');
    // Past the root is refused, in the words a pattern climbing out is.
    const climbs = 'a pattern cannot climb out of its root with ".."';
    expect(refused('../../x', 'sub')).toBe(climbs);
    expect(refused('{x,../../y}', 'sub')).toBe(climbs);
    expect(refused('..\\..\\x', 'sub', SEPARATOR)).toBe(climbs);
  });

  it('refuses what parseGlob refuses before it reads an alternative, in its words', () => {
    expect(refused('', 'sub')).toBe('the pattern is empty');
    expect(refused(' ! ', 'sub')).toBe('the pattern is empty');
    expect(refused('!!docs', 'sub')).toBe('a negated pattern is a list entry, not a glob; narrow the positive pattern');
    expect(refused('+(a|b)', 'sub')).toBe(error('+(a|b)'));
    expect(refused('{a,b', 'sub')).toBe('a "{" is never closed');
    expect(refused('{a,b}'.repeat(9), 'sub')).toBe(`the braces expand to more than ${MAX_ALTERNATIVES} patterns`);
  });

  it('refuses a directory whose name a pattern would read as syntax', () => {
    for (const directory of ['a*', 'a?', 'a[1]', '{a}', 'a\\b', '!a', ' a', 'x/a[1]']) {
      expect(refused('docs', directory), directory).toBe(
        `the directory "${directory}" cannot be named in a pattern: a "*", "?", "[", "{" or "\\" in it, or a "!" or a space it starts with, would be read as syntax`,
      );
    }
    // What a pattern reads as a name is written as one.
    expect(rebased('docs', 'x/!a')).toBe('x/!a/docs');
    expect(rebased('docs', 'x/ a]')).toBe('x/ a]/docs');
    expect(matches(rebased('docs', 'x/!a'), 'x/!a/docs')).toBe(true);
    expect(matches(rebased('{a,b}', 'x,y}'), 'x,y}/a')).toBe(true);
  });

  it('refuses to write alternatives out when one would split its braces', () => {
    const splits = (piece: string): string => `the braces cannot be rebased one alternative at a time: "${piece}" holds a "," or a "}"`;
    expect(refused('{/docs,x}', 'a,b')).toBe(splits('a,b/x'));
    expect(refused('{/docs,a\\,b}', 'sub')).toBe(splits('sub/a\\,b'));
    expect(refused('{/docs,x}}', 'sub')).toBe(splits('/docs}'));
  });

  it('throws for a directory that is not one under the root', () => {
    for (const directory of ['/sub', 'sub/', 'a//b', '.', 'a/./b', '..', 'a/..']) {
      expect(() => rebaseGlob('docs', directory), directory).toThrow(`"${directory}" is not a directory under the root`);
    }
  });
});

describe('cost', () => {
  it('matches in time linear in the path, whatever the pattern', () => {
    const glob = compileGlob('*-*-*-*-*-*x', RIPGREP);
    // A name four times as long takes about four times as long to match, and
    // the check allows twice that: a ratio, which a slow or busy machine
    // keeps, where a number of milliseconds is one it can break. It is read
    // past a stall, as ADR-0007 has it since 2026-10-19, with no allowance
    // for noise; the tenth of a millisecond it once allowed was about two of
    // the shorter name's runs, and a stall that spoiled the three stretches
    // it read failed a mutant that changes nothing. A matcher that lets a
    // state it has taken be taken again, as many times as there are ways to
    // reach it, took 27 microseconds on the shorter name and 12 milliseconds
    // on the longer, and 11 seconds on the one below.
    const shorter = `${'a-'.repeat(5)}y`;
    const longer = `${'a-'.repeat(20)}y`;
    const read = (): number => fastestRatioInTurn(21, 3, () => glob.match(shorter), () => glob.match(longer));
    const first = read();
    expect(first < 8 ? first : Math.min(first, read())).toBeLessThan(8);
    // A backtracking engine takes about 28 seconds on this; see the ADR.
    expect(glob.match(`${'a-'.repeat(60)}y`)).toBe(false);
  });

  it('reads a name no further than the first character that leaves no state live', () => {
    // Past that character nothing can make the name match, so the matcher
    // stops there, and a name of 1,024 characters that fails at its first
    // costs what one of 16 does. No answer shows it: read to its end, the
    // name is refused all the same. With the stop taken out the longer read
    // 38 to 57 times the shorter, plain and under coverage, and with it 0.67
    // to 1.66 over 200 readings (ADR-0007, 2026-10-24).
    const glob = compileGlob('src/**/*.ts', PATH);
    const short = `x${'a'.repeat(15)}`;
    const long = `x${'a'.repeat(1023)}`;
    expect(glob.match(long)).toBe(false);
    const read = (): number => fastestRatioInTurn(21, 3, () => glob.match(short), () => glob.match(long));
    const first = read();
    expect(first < 2 ? first : Math.min(first, read())).toBeLessThan(2);
    // A name the pattern keeps live is read to its end.
    expect(glob.match(`src/${'a'.repeat(1017)}.ts`)).toBe(true);
    expect(glob.match(`src/${'a'.repeat(1017)}.tsx`)).toBe(false);
  });
});
