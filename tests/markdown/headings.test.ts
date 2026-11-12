import { describe, expect, it } from 'vitest';

import { githubSlug, scanMarkdown, sectionsOf, slugify, titleOf } from '../../src/markdown/index.js';
import { EDGES, LINKS_AND_EMPHASIS, UNDERSCORES_AND_SCRIPTS, type AnchoredDocument } from './github-anchors.js';

const doc = (...lines: string[]): string => lines.join('\n');
const headings = (text: string): [string, number, string][] =>
  scanMarkdown(text).headings.map((h) => [h.form, h.level, h.text]);
const texts = (text: string): string[] => scanMarkdown(text).headings.map((h) => h.text);

describe('ATX headings', () => {
  it('reads the level and the text, trimmed', () => {
    expect(headings(doc('# One', '###### Six  ', '   ## Indented', '#\tTab'))).toEqual([
      ['atx', 1, 'One'],
      ['atx', 6, 'Six'],
      ['atx', 2, 'Indented'],
      ['atx', 1, 'Tab'],
    ]);
  });

  it('takes off a closing sequence only after a space or a tab', () => {
    expect(texts(doc('# a #', '## b ##   ', '# c#', '# C# and F#', '# d \\#', '### e ###x'))).toEqual([
      'a',
      'b',
      'c#',
      'C# and F#',
      'd \\#',
      'e ###x',
    ]);
  });

  it('reads a heading of nothing but hashes as empty, at the end of its line', () => {
    expect(texts(doc('#', '### ###', '# #', '##  '))).toEqual(['', '', '', '']);
    const offsets = (text: string): [number, number][] => scanMarkdown(text).headings.map((h) => [h.textStart, h.textEnd]);
    expect(offsets('##   ')).toEqual([[5, 5]]);
    expect(offsets('# #')).toEqual([[2, 2]]);
    expect(offsets('#')).toEqual([[1, 1]]);
    expect(offsets(' #')).toEqual([[2, 2]]);
  });

  it('gives the offsets of the line and of the text', () => {
    const s = scanMarkdown('x\n>  ## Title ##\n');
    expect(s.headings).toEqual([
      {
        form: 'atx',
        level: 2,
        text: 'Title',
        slug: 'title',
        anchor: 'title',
        githubAnchor: 'title',
        start: 4,
        end: 16,
        textStart: 8,
        textEnd: 13,
        line: 2,
        endLine: 2,
      },
    ]);
  });

  it('leaves comments out of the text and keeps code spans in it', () => {
    expect(texts(doc('## Goals <!-- what this is for -->', '## A <!-- x --> B', '## <!-- x --> C', '## The `x` option'))).toEqual([
      'Goals',
      'A  B',
      'C',
      'The `x` option',
    ]);
    expect(texts('## D ## <!-- c -->')).toEqual(['D']);
    const s = scanMarkdown('## A <!-- x --> B');
    expect(s.text.slice(s.headings[0]?.textStart, s.headings[0]?.textEnd)).toBe('A <!-- x --> B');
  });

  it('is not one in code, in a comment, or on a line a comment or span opened above runs into', () => {
    expect(texts(doc('```', '# a', '```', '    # b', '<!--', '# c', '-->', '<!-- x --> # d'))).toEqual([]);
    expect(texts(doc('#hashtag', '    # indented', 'text # not'))).toEqual([]);
  });
});

describe('setext headings', () => {
  it('reads a paragraph line underlined with = or -', () => {
    const s = scanMarkdown(doc('Title', '=====', '', 'Sub  ', '-', '', '  Indented', '   ---'));
    expect(s.headings.map((h) => [h.form, h.level, h.text, h.line, h.endLine])).toEqual([
      ['setext', 1, 'Title', 1, 2],
      ['setext', 2, 'Sub', 4, 5],
      ['setext', 2, 'Indented', 7, 8],
    ]);
    expect(s.headings[1]).toMatchObject({ start: 13, end: 20, textStart: 13, textEnd: 16 });
    expect(s.listItems).toEqual([]);
  });

  it('keeps a code span in the text and leaves a comment out', () => {
    expect(texts(doc('`code` here <!-- x -->', '---'))).toEqual(['`code` here']);
  });

  it('is a thematic break under a blank line, a list item, a heading, a table or another rule', () => {
    const cases = [
      doc('text', '', '---'),
      doc('- item', '---'),
      doc('1. item', '---'),
      doc('# Heading', '---'),
      doc('***', '---'),
      doc('| a | b |', '| - | - |', '| 1 | 2 |', '---'),
      doc('    indented', '---'),
      doc('text', '    more', '---'),
      doc('<!-- note -->', '---'),
      doc('Title', '===', '---'),
    ];
    for (const text of cases) expect(texts(text).filter((t) => t !== 'Title' && t !== 'Heading'), text).toEqual([]);
    expect(texts(doc('Title', '===', '---'))).toEqual(['Title']);
  });

  it('is nothing when the underline is not Markdown or not in the same block quote', () => {
    expect(texts(doc('text <!--', '---', '-->'))).toEqual([]);
    expect(texts(doc('text', '```', '---', '```'))).toEqual([]);
    expect(texts(doc('> text', '---'))).toEqual([]);
    expect(texts(doc('> text', '> ---'))).toEqual(['text']);
    expect(texts(doc('text', '--- x'))).toEqual([]);
  });

  it('never takes the front matter delimiter for an underline', () => {
    expect(texts(doc('---', 'title: x', '---', 'body'))).toEqual([]);
    expect(texts(doc('---', 'title: x', '...', '---'))).toEqual([]);
  });
});

describe('slugs and anchors', () => {
  it.each([
    ['Hello, World!', 'hello-world'],
    ['A  B', 'a--b'],
    ['C++ & Rust', 'c--rust'],
    ['Über Straße 2', 'über-straße-2'],
    ['`code` here', 'code-here'],
    ['[link](x) text', 'linkx-text'],
    ['  trim  ', 'trim'],
    ['! Hello', 'hello'],
    ['a-b_c', 'a-bc'],
    ['', ''],
  ])('slugs %j as %j', (text, slug) => {
    expect(slugify(text)).toBe(slug);
  });

  it('suffixes the second and later headings that slug alike, as GitHub does', () => {
    const anchors = (text: string): string[] => scanMarkdown(text).headings.map((h) => h.anchor);
    expect(anchors(doc('# Foo', '# foo', '# Foo', '# Bar'))).toEqual(['foo', 'foo-1', 'foo-2', 'bar']);
    expect(anchors(doc('# foo', '# foo', '# foo-1'))).toEqual(['foo', 'foo-1', 'foo-1-1']);
    expect(anchors(doc('# foo-1', '# foo', '# foo'))).toEqual(['foo-1', 'foo', 'foo-2']);
    expect(anchors(doc('#', '#', 'Setext', '---', '# Setext'))).toEqual(['', '-1', 'setext', 'setext-1']);
  });
});

describe('GitHub anchors', () => {
  /**
   * The headings whose anchor is not GitHub's, and why. Each of the others
   * has the anchor GitHub gave it, in the document it was measured in.
   */
  const OTHERWISE: ReadonlyMap<string, string | null> = new Map([
    // A full reference link is a link or literal text by a definition elsewhere.
    ['[ref link][r]', null],
    ['[defined][d]', null],
    // A name outside the few known is a character or literal text by HTML's table.
    ['&nosuch; entity', null],
    // GitHub links a bare URL by itself and keeps the underscores in it, which
    // are read here as emphasis.
    ['https://x.y/_a_ bare', 'httpsxya-bare'],
    ['www.x.y/_a_ bare', 'wwwxya-bare'],
  ]);

  it.each<[string, AnchoredDocument]>([
    ['underscores and scripts', UNDERSCORES_AND_SCRIPTS],
    ['links and emphasis', LINKS_AND_EMPHASIS],
    ['edges', EDGES],
  ])('gives each heading of the document of %s the anchor GitHub gave it', (_, measured) => {
    const text = measured.headings.map(([heading]) => `## ${heading}\n`).join('\n') + (measured.tail === '' ? '' : `\n${measured.tail}`);
    const scanned = scanMarkdown(text).headings;
    expect(scanned.map((h) => h.text)).toEqual(measured.headings.map(([heading]) => heading));
    expect(scanned.map((h) => h.githubAnchor)).toEqual(measured.headings.map(([heading, anchor]) => (OTHERWISE.has(heading) ? OTHERWISE.get(heading) : anchor)));
  });

  it('keeps the slug and the anchor item ids are made of as they were', () => {
    const [heading] = scanMarkdown('## Why remove restricted_std\n').headings;
    expect([heading?.slug, heading?.anchor, heading?.githubAnchor]).toEqual(['why-remove-restrictedstd', 'why-remove-restrictedstd', 'why-remove-restricted_std']);
  });

  it('lowers each character on its own, so a final sigma is not made', () => {
    expect(githubSlug('ΣΑΣ')).toBe('σασ');
    expect(slugify('ΣΑΣ')).toBe('σας');
  });

  it('keeps letters, marks, decimal digits and connector punctuation, and makes each space a hyphen', () => {
    expect(githubSlug('a\u0301 \u0663 \u2167 \u203f \u00b2 \u00bd \u2011 \t\u00a0x')).toBe('a\u0301-\u0663-\u2177-\u203f----x');
  });

  it('counts the repeats among the headings whose GitHub slug is known, and gives none to the others', () => {
    const anchors = (text: string): (string | null)[] => scanMarkdown(text).headings.map((h) => h.githubAnchor);
    expect(anchors(doc('# a_b', '# &ab; a_b', '# a_b', '# [a_b][x]', '# a_b'))).toEqual(['a_b', null, 'a_b-1', null, 'a_b-2']);
    expect(githubSlug('&ab;')).toBeNull();
  });
});

describe('sections and the title', () => {
  const text = doc('# Title', 'intro', '## One', 'a', '### Deep', 'b', '## Two', 'c');

  it('ends a section at the first heading at its level, not a later one', () => {
    const s = scanMarkdown(doc('## A', '## B', '## C'));
    expect(sectionsOf(s).map((x) => x.endLine)).toEqual([2, 3, 4]);
  });

  it('runs each heading to the next at its level or above', () => {
    const s = scanMarkdown(text);
    expect(sectionsOf(s).map((x) => [x.heading.text, x.start, x.bodyStart, x.end, x.endLine])).toEqual([
      ['Title', 0, 8, 42, 9],
      ['One', 14, 21, 34, 7],
      ['Deep', 23, 32, 34, 7],
      ['Two', 34, 41, 42, 9],
    ]);
  });

  it('keeps only the headings at a level or deeper', () => {
    expect(sectionsOf(scanMarkdown(text), 2).map((x) => x.heading.text)).toEqual(['One', 'Deep', 'Two']);
    expect(sectionsOf(scanMarkdown(text), 3).map((x) => x.heading.text)).toEqual(['Deep']);
  });

  it('starts a setext section after its underline, and ends a last heading at the end', () => {
    const s = scanMarkdown(doc('Top', '===', 'body', '# Last'));
    expect(sectionsOf(s).map((x) => [x.heading.text, x.bodyStart, x.end, x.endLine])).toEqual([
      ['Top', 8, 13, 4],
      ['Last', 19, 19, 5],
    ]);
  });

  it('takes the first level-one heading as the title, of either form', () => {
    expect(titleOf(scanMarkdown(doc('## Sub', '# Main', '# Other')))?.text).toBe('Main');
    expect(titleOf(scanMarkdown(doc('Main', '====')))?.text).toBe('Main');
    expect(titleOf(scanMarkdown('## Sub'))).toBeUndefined();
  });
});
