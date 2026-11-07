import { describe, expect, it } from 'vitest';

import { bindToItems, findItemIds, scanMarkdown } from '../../src/markdown/index.js';

/**
 * Which item a comment is about, and the name a `@spec-item id` gives it, as
 * spec-graph read them before the rule moved here (ADR-0004). These are its
 * cases, each answered as it answered them.
 */

/** The id each item of the document is named by, or `null`. */
const ids = (...lines: string[]): (string | null)[] => {
  const scan = scanMarkdown(lines.join('\n'));
  const named = findItemIds(scan);
  return scan.listItems.map((item) => named.get(item) ?? null);
};

describe('the item a @spec-item is about', () => {
  it('is the item directly below it, and not the one after', () => {
    expect(ids('<!-- @spec-item id="one" -->', '- [ ] first', '- [ ] second')).toEqual(['one', null]);
    expect(ids('<!-- @spec-item id="one" -->', '- [ ] first', '', '- [ ] second')).toEqual(['one', null]);
    expect(ids('<!-- @spec-item id="one" -->', '- [ ] first', '  - [ ] nested')).toEqual(['one', null]);
  });

  it('is reached across blank lines and other comments, and across nothing else', () => {
    expect(ids('<!-- @spec-item id="one" -->', '', '<!-- prettier-ignore -->', '- [ ] first')).toEqual(['one']);
    expect(ids('> <!-- @spec-item id="one" -->', '> - [ ] first', '> - [ ] second')).toEqual(['one', null]);
    expect(ids('<!-- @spec-item id="one" -->', 'Prose.', '- [ ] first')).toEqual([null]);
    expect(ids('<!-- @spec-item id="one" -->', '## Next', '- [ ] first')).toEqual([null]);
    expect(ids('<!-- @spec-item id="one" -->', '```', '', '```', '- [ ] first')).toEqual([null]);
    expect(ids('<!-- @spec-item id="one" -->', '<pre>', '</pre>', '- [ ] first')).toEqual([null]);
    expect(ids('Prose. <!-- @spec-item id="one" -->', '', '- [ ] first')).toEqual([null]);
    expect(ids('---', 'id: x', '---', '<!-- @spec-item id="one" -->', '- first')).toEqual(['one']);
  });

  it('is never one that ended before it', () => {
    expect(ids('- [ ] first', '', 'Prose. <!-- @spec-item id="one" -->')).toEqual([null]);
    expect(ids('- [ ] first', '', 'Prose.', '', '  - [ ] second', '  <!-- @spec-item id="two" -->')).toEqual([null, 'two']);
  });

  it('is the item it is written on, or indented under, and not the sibling below', () => {
    expect(ids('- [ ] first <!-- @spec-item id="one" -->', '- [ ] second')).toEqual(['one', null]);
    expect(ids('- [ ] first', '  <!-- @spec-item id="one" -->', '- [ ] second')).toEqual(['one', null]);
  });

  it('is the second of two items it is written flush between, and the first where there is no second', () => {
    expect(ids('- [ ] first', '<!-- @spec-item id="two" -->', '- [ ] second')).toEqual([null, 'two']);
    expect(ids('- [ ] first', '<!-- @spec-item id="one" -->')).toEqual(['one']);
  });

  it('keeps a parent and the item nested in it to their own', () => {
    expect(ids('<!-- @spec-item id="parent" -->', '- [ ] parent', '  <!-- @spec-item id="child" -->', '  - [ ] child')).toEqual(['parent', 'child']);
    expect(ids('- [ ] parent', '  - [ ] child <!-- @spec-item id="child" -->')).toEqual([null, 'child']);
    expect(ids('- [ ] parent', '  - [ ] child', '  <!-- @spec-item id="parent" -->', '- [ ] next')).toEqual(['parent', null, null]);
  });

  it('gives an item with two above it the nearer one, and the last read where two are its own', () => {
    expect(ids('<!-- @spec-item id="far" -->', '<!-- @spec-item id="near" -->', '- [ ] first')).toEqual(['near']);
    expect(ids('<!-- @spec-item id="named" -->', '<!-- @spec-item state="open" -->', '- [ ] first')).toEqual([null]);
  });

  it('reads a directive from a comment, and nothing else the comment holds', () => {
    expect(ids('<!-- @spec-item id="one" -->', '<!--', '- [ ] parked', '-->', '- [ ] first')).toEqual(['one']);
  });
});

describe('the name a @spec-item gives', () => {
  it('is its id, quoted with either mark or bare, the last one written, in any case of the name', () => {
    expect(ids("<!-- @spec-item id='single' -->", '- a')).toEqual(['single']);
    expect(ids('<!-- @spec-item id=bare state="open" -->', '- a')).toEqual(['bare']);
    expect(ids('<!-- @spec-item id="first" ID="second" -->', '- a')).toEqual(['second']);
    expect(ids('<!-- @spec-item title="x" id -->', '- a')).toEqual(['true']);
    // An attribute whose name begins with the two letters is another attribute.
    expect(ids('<!-- @spec-item id="limit" identity="other" -->', '- a')).toEqual(['limit']);
  });

  it('is read only from @spec-item, opening a closed comment', () => {
    expect(ids('<!-- @spec-node id="ADR-0001" -->', '- a')).toEqual([null]);
    expect(ids('<!-- @spec-items id="x" -->', '- a')).toEqual([null]);
    expect(ids('<!--@spec-item id="tight"-->', '- a', '<!--   @spec-item id="wide" -->', '- b')).toEqual(['tight', 'wide']);
    expect(ids('<!-- note @spec-item id="x" -->', '- a')).toEqual([null]);
    expect(ids('Write `<!-- @spec-item id="x" -->` above.', '', '- a')).toEqual([null]);
    expect(ids('- a', '<!-- @spec-item id="x"')).toEqual([null]);
  });
});

describe('the names found', () => {
  it('are only of items, and only where the directive gives an id', () => {
    const scan = (text: string) => findItemIds(scanMarkdown(text));
    expect(scan('<!-- @spec-item id="nowhere" -->\n\nProse.\n').size).toBe(0);
    expect(scan('<!-- @spec-item state="open" -->\n- a\n').size).toBe(0);
    expect([...scan('<!-- @spec-item id="one" -->\n- a\n').values()]).toEqual(['one']);
  });
});

describe('an annotation of no item', () => {
  it('binds to nothing, and none asked binds none', () => {
    const scan = scanMarkdown('Prose. <!-- a -->\n\n# Heading\n');
    expect(bindToItems(scan, [{ start: 7, line: 1 }])).toEqual([null]);
    expect(bindToItems(scan, [])).toEqual([]);
  });
});
