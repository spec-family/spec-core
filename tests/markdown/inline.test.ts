import { describe, expect, it } from 'vitest';

import { renderedText } from '../../src/markdown/inline.js';
import { RENDERED } from './github-anchors.js';

describe('the text a line shows', () => {
  it.each(RENDERED)('shows %j as GitHub does', (source, shown) => {
    expect(renderedText(source)).toBe(shown);
  });

  it('decodes the first and the last name of the ISO 8859-1 range, and the names beyond it', () => {
    expect(renderedText('&nbsp;&yuml;')).toBe('\u00a0ÿ');
    expect(renderedText('&iexcl;&thorn;')).toBe('¡þ');
    expect(renderedText('&lowbar;&UnderBar;&apos;')).toBe("__'");
  });

  it('decodes a number past the last code point, or naming a surrogate or none, as U+FFFD', () => {
    expect(renderedText('&#x10FFFF;&#x110000;&#xD7FF;&#xD800;&#xDFFF;&#xE000;&#0;&#1;')).toBe('\u{10ffff}�\ud7ff��\ue000�\u0001');
  });

  it('leaves the text undecided where a name is outside the table it knows', () => {
    expect(renderedText('caf&eacute;')).toBe('café');
    expect(renderedText('&ab; x')).toBeNull();
    expect(renderedText('&Alpha;')).toBeNull();
  });

  it('leaves the text undecided at a full reference link, which a definition elsewhere decides', () => {
    expect(renderedText('[a][b]')).toBeNull();
    expect(renderedText('[a][b\\]c]')).toBeNull();
    expect(renderedText('x [a][ b ] y')).toBeNull();
  });

  it('reads as written a second bracket that cannot be a label', () => {
    expect(renderedText('[a][]')).toBe('[a][]');
    expect(renderedText('[a][ \t]')).toBe('[a][ \t]');
    expect(renderedText('[a][b')).toBe('[a][b');
    expect(renderedText('[a][b\\')).toBe('[a][b\\');
    expect(renderedText(`[a][${'b'.repeat(998)}]`)).toBeNull();
    expect(renderedText(`[a][${'b'.repeat(999)}]`)).toBeNull();
    expect(renderedText(`[a][${'b'.repeat(1000)}]`)).toBe(`[a][${'b'.repeat(1000)}]`);
  });

  it('reads a full reference only after a bracket that can still open a link', () => {
    expect(renderedText('[x [a](b)][c]')).toBe('[x a][c]');
  });

  it('takes a line feed, a form feed and a carriage return as whitespace beside a delimiter run', () => {
    expect(renderedText('a\n_b_\nc')).toBe('a\nb\nc');
    expect(renderedText('a\f_b_\fc')).toBe('a\fb\fc');
    expect(renderedText('a\r_b_\rc')).toBe('a\rb\rc');
    expect(renderedText('a\u2028_b_\u2028c')).toBe('a\u2028_b_\u2028c');
  });

  it('takes the whitespace of HTML between the parts of a tag', () => {
    expect(renderedText('<a\nb="c">x</a\n>')).toBe('x');
    expect(renderedText('<a\rb\f=\r"c"\f/>x')).toBe('x');
    expect(renderedText('<a\u00a0b>x')).toBe('<a\u00a0b>x');
  });

  it('ends an autolink at a control character, which none may hold', () => {
    expect(renderedText('<ab:c\u0001d>')).toBe('<ab:c\u0001d>');
    expect(renderedText('<ab:c_d_>')).toBe('ab:c_d_');
  });

  it('reads the code point before a delimiter run whole, where it is a surrogate pair', () => {
    expect(renderedText('\u{10100}_a_\u{10100}')).toBe('\u{10100}a\u{10100}');
    expect(renderedText(' \udc00_a_')).toBe(' \udc00_a_');
    expect(renderedText('\udc00_a_')).toBe('\udc00_a_');
    expect(renderedText('𐀀_a_')).toBe('𐀀_a_');
  });

  it('finds each code span its own closer, the cursors of two lengths apart', () => {
    expect(renderedText('`a` ``b`` `c` ``d``')).toBe('a b c d');
    expect(renderedText('``a` `b``')).toBe('a` `b');
  });

  it('leaves out of emphasis outside a link every delimiter its text left open', () => {
    expect(renderedText('_a [x"_"y](d) z')).toBe('_a x"_"y z');
    expect(renderedText('[x"_"y](d) z_')).toBe('x"_"y z_');
  });

  it('keeps apart the closers of each character that found no opener', () => {
    expect(renderedText('_a b* c_')).toBe('a b* c');
    expect(renderedText('*a b_ c*')).toBe('a b_ c');
  });

  it('shows a bracket that opened nothing as written', () => {
    expect(renderedText('![a')).toBe('![a');
    expect(renderedText('x [a')).toBe('x [a');
  });

  it('shows what a link holds, and nothing of an image, at any depth', () => {
    expect(renderedText('x ![a ![b](c) d](e) y')).toBe('x  y');
    expect(renderedText('[a _b_ c](d) _e_')).toBe('a b c e');
    expect(renderedText('_a [b_ c](d)')).toBe('_a b_ c');
  });
});
