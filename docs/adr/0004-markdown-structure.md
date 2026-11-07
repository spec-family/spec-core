---
status: accepted
date: 2026-09-26
---

# ADR-0004: Markdown structure is exact about code and comments, and simple about the rest

## Context

Every tool in the family reads Markdown for the same reason: to find the
structure a person wrote - headings, list items, links, directives - and to
ignore everything that only looks like structure because it sits in a code
sample or a comment. The three scanners agreed on that goal and disagreed on
details, and each detail was a defect somewhere:

- spec-graph read `## Hidden` inside `<!-- -->` as a heading.
- spec-graph read `` `<!--` `` in a code span as the start of a comment and
  masked every link after it until the next `-->`.
- spec-guard opened a fence on ```` ```js`x ```` (CommonMark: not a fence),
  closed one on a line carrying an info string (CommonMark: not a closer), and
  did not see fences indented inside list items, so a directive shown as an
  example there executed.

## Decision

**Follow CommonMark wherever it decides what is code or a comment; stay a
scanner everywhere else.** One pass, offsets throughout, no AST, no rendering.

Exact:

- Fenced code: ``` or ~~~, three or more; an opener up to three columns past
  the text of the list item it is in, or past the margin outside a list
  (list-nested fences are common); a backtick info string may not contain a
  backtick; a closer is the same character, at least as long, with nothing
  after it but whitespace; an unclosed fence runs to the end. A fence line
  deeper than that is indented code or a paragraph's text, so a lone one in an
  item's example no longer hides the rest of the document.
- Indented code four columns past the text of the list item it is in, or past
  the margin outside a list, after a blank line, never interrupting a
  paragraph. An item's text starts past its marker and the one to four spaces
  after it; a line left of that after a blank line is outside the item.
- `<script>`, `<pre>`, `<style>`, `<textarea>` blocks, whose content is not
  Markdown. Each names its element, lowercased as CommonMark matches it in
  any case, in `Block.tag`; a code block's is `null`. *Amended 2026-09-27*:
  the block did not say which element opened it, and spec-guard read the tag
  back out of the opening line to name it in a message.
- Code spans and HTML comments resolved **left to right in one pass**:
  whichever opens first wins. A run of backticks opens a span only if a run of
  the same length closes it before the paragraph ends; an escaped backtick
  opens nothing. `<!-->` and `<!--->` are complete comments. An unclosed `<!--`
  at the start of a line runs to the end of the document (an HTML block); one
  in the middle of a line is text.

Deliberately simple: headings (ATX and setext), list items and their extent,
links in six forms, pipe tables, front matter in the flat YAML subset
documents use. None of these needs a full parser to be read correctly in the
documents the family meets, and none is ever read from inside code or a
comment.

Front matter opened on the first line and never closed opens nothing: the
line is a thematic break and the rest of the document is Markdown, as
without it. The scan says that it was written, in `unclosedFrontMatter`,
with its kind and its line, so that a tool can tell such a document from one
with no front matter and say what went wrong. *Amended 2026-09-27*: the scan
read the two alike, and spec-graph read the first line again to tell them
apart.

A front matter key is a word of any script, as a YAML plain key may be: a
letter or `_` first, then letters, marks, digits and `_.-`. *Amended
2026-09-30*: only ASCII was read, a letter or `_` and then letters, digits
and `_.-`, so `狀態: 已接受` was `not a "key: value" line` and no entry, and
a status a document gave in Chinese never reached a tool that reads `狀態`
beside `status`. A digit or a mark first, a space, punctuation and a
full-width colon `：` still make no key: front matter is YAML, which reads
no full-width colon as one, and such a line is reported as it was.

Front matter is written back one key at a time, every other line left as it
was, and `renderScalar` writes a value plain only where a YAML plain scalar
reads back as the same string: a letter first, then letters, marks, digits,
spaces and `._/+-`, no space at the end, and none of the words YAML 1.2 or
1.1 reads as a boolean or a null. Anything else is double-quoted.
*Amended 2026-09-30*: a letter of any script counts, so a status of `封存`
or `已接受` is written as it is typed. Only an ASCII letter did, and every
other value was quoted: `封存` was written `"封存"`, which reads the same
and is not what a person writing Chinese types. A full-width space or
punctuation mark, and a digit or a mark first, are still quoted.

A link's text is read again for images, which CommonMark renders there: a
badge wrapped in a link, `[![build](badge.svg)](actions)`, has two
destinations, and a tool that rewrites or checks relative paths needs both.
Nothing else is read there. An image whose destination runs past the text's
`]` is not in the text, and an image's own text is alt text, with nothing in
it to follow. *Amended 2026-09-26*: until then the text was skipped, and the
image went unread.

**Links may not contain links**, at any depth, as CommonMark has it: in
`[a [b](inner.md) c](outer.md)` the inner pair is the link, and the brackets
around it and `(outer.md)` are text. The link inside may be of any bracket
form: with `[ref]` defined, `[a [ref] c](x.md)` is text around a shortcut,
and in `[foo [bar](/u)][ref]` the second label, left behind, is read as a
shortcut of its own. An image is not made text by a link in its alt text,
though the brackets around the image are, and a link may hold an image. What
a link or an image has read past its `]` - a destination, a title, a second
label - holds no link, so `[![b][badge]][ci]` stays a link by reference
around an image by reference. A wiki link is not CommonMark's and makes
nothing text. The pairs of a paragraph are read innermost first, as
CommonMark reads them at their `]`, before the paragraph is read for links,
so this costs one more pass over the pairs and no search. *Amended
2026-09-27*: the outer pair was the link and the inner one went unread, on
the view that no document the family meets writes one; a tool reading links
now sees the inner destination and not the outer, and spec-brief no longer
needs to read each link's text again to find it.

**A definition cannot interrupt a paragraph**, as CommonMark has it: it
opens a paragraph or follows a definition that did, and `[r]: r.md` on the
line under a paragraph's text, a lazy continuation line included, is that
text. A paragraph ends here where the scan sees one end: at a blank line, a
heading, a thematic break, code, front matter, the last line of an HTML
block a comment opens, and in a list item whose marker has nothing after it,
or a heading or a thematic break. A definition's label is CommonMark's link
label, with no unescaped bracket and at most 999 characters, and so is the
second bracket of a reference link: `[r][a[b]c]` is the shortcut `[r]`
followed by text. The text after a run of definitions is a paragraph of its
own, and its brackets pair with none before it. Still simple: a definition
is read on one line and at most three columns in, so a label, a destination
or a title that runs onto the next line defines nothing, a definition under
a title written on a line of its own is that paragraph's text, and so is
one indented four columns under another, where CommonMark takes the
indentation off; one on a list item's marker line is not read, as nothing
there is but the item; `[^1]: text` is a footnote, as GitHub reads it; and a
second bracket of nothing but spaces, `[r][ ]`, is read as `[r][]`, where
commonmark.js looks up an empty label and finds nothing. *Amended
2026-09-28*: a definition was read at the start of any line, and its label
could hold a `[`, so `Some text` over `[r]: r.md` defined `r`, and
`[[r]: r.md](z.md)` defined `r.md](z.md)`; a second bracket holding a
bracket left the first unread. Against commonmark.js 0.31.2, 37 of 95 cases
on definitions and labels disagreed, and 11 do now: ten are the
simplifications named here, and one is `===` under a definition, which the
heading reader takes for a setext underline.

**Three masks, one for each question a tool asks**, all preserving every
offset and line terminator:

| Mask | Blanked | Asked by |
| --- | --- | --- |
| `structure` | front matter, code, comments | "is this a heading, an item, a link?" |
| `prose` | front matter, comments | "does this section say anything?" |
| `directives` | front matter, code | "what does `<!-- @assert ... -->` say?" |

**What a caller does not read is not made.** Links, list items and the
`directives` mask are made the first time each is read, and kept; the
`structure` and `prose` masks, headings and tables are made with the scan,
since headings are read from both masks and every tool reads headings.
*Amended 2026-09-26*: all of it was made for every document, and a spec-guard
query, which reads none of the three, spent most of its time on them - 23 ms
a query against the 20 ms spec-guard's ADR-0012 allows. Over the family's own
Markdown, scanning took 28% less for what spec-guard reads and 34% less for
what spec-harness reads, 5% less for spec-graph, which reads everything, with
every answer identical.

*Amended 2026-11-07.* **Claims, read here.** A consumer of the family marks
each item of its specifications with how far it holds, `` - `Implemented`: ``
or `` `Specified` ``, `` `Target` ``, `` `Hypothesis` ``, and asked that a
claim be held to its evidence, and a checklist or a ledger to the claims it
cites. spec-guard does the first and spec-graph the second, so which item is
a claim, and of which label, is read here, once (`findClaims`):

- **A claim is a list item whose text opens with a code span holding a label
  of the vocabulary the caller names**, after a task checkbox where there is
  one, exact in case. Prose, emphasis, or a span the vocabulary lacks makes
  none: a code span at the head of an item is as often code.
- **An item's own text is the item less what is nested under it**, so a
  nested item is a claim of its own, and its labels are none of its parent's.
  `labels` lists every label the own text writes as a code span, each once,
  the opening one first; more than one is a claim that says two things, which
  is the caller's to report.
- **The item keeps its whole range**, so what is written under it, a
  directive with the rest, lies inside it, and the innermost claim around an
  offset is the one it belongs to.
- **One pass**, over the items and the code spans in document order with the
  open items on a stack: claims nested six hundred deep are read in time
  linear in the document (`tests/markdown/linear.test.ts`), and 300 documents
  made at random agree with a reading that compares every item and span with
  every other.

## Open questions

- **Slugs.** `slugify` keeps spec-graph's results, which drop `_` where
  GitHub's slugger keeps it. Matching GitHub exactly would change which
  anchors spec-graph resolves; it waits for a release that can say so.
- **Embeds.** `![[x]]` is reported as an image in the wiki form. A tool that
  drops images must keep wiki embeds if it reads them as references.
- **Inline comments.** A comment runs to the next `-->` across blank lines,
  as every scanner here always read it; CommonMark ends an inline comment
  with its paragraph. No document in the family's repositories differs.

## Consequences

Each tool moves to the shared scanner in its own release, with the behaviour
changes above in its changelog. The characterisation tests in
`tests/markdown/` run every old scanner beside the new one and name each
difference as a fix or as a dialect, so no difference arrives unexplained.
