import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BOOKS, getBook } from './canon.ts';
import {
  USFM_BOOK_CODES,
  bookNumberFor,
  chapterVerseCounts,
  parseUsfm,
  readBookCode,
  readVerseContent,
  stripInlineMarkup,
  validateBook,
} from './usfm.ts';
import { toVerseId } from './verse-id.ts';

/**
 * Fixtures are written the way ebible.org actually writes USFM — Strong's
 * numbers on almost every word, footnotes mid-sentence, poetry in `\q1`/`\q2`.
 * `String.raw` keeps the backslashes readable.
 */

const THIRD_JOHN = String.raw`
\id 3JN World English Bible (WEB)
\ide UTF-8
\h 3 John
\toc1 The Third Letter of John
\mt1 3 John
\c 1
\p
\v 1 The elder to Gaius \w the|strong="G3588"\w* beloved.
\v 2 Beloved, I pray \w that|strong="G3754"\w* you may prosper.
\p
\v 3 I rejoiced greatly \w when|strong="G1063"\w* \w the|strong="G3588"\w* brothers came.
\p Peace be to you. The friends greet you.
`;

const PSALM = String.raw`
\id PSA World English Bible (WEB)
\h Psalms
\c 3
\d A Psalm by David, when he fled from Absalom his son.
\q1
\v 1 \w LORD|strong="H3068"\w*, how my adversaries have increased!
\q2 Many are those who rise up against me.
\q1
\v 2 Many there are who say of my soul,
\q2 “There is no help for him in God.” \qs Selah\qs*
\b
\q1
\v 3 But you, LORD, are a shield around me.
`;

describe('usfm book codes', () => {
  test('lines up one-to-one with the canon', () => {
    assert.equal(USFM_BOOK_CODES.length, 66);
    USFM_BOOK_CODES.forEach((code, index) => {
      assert.equal(bookNumberFor(code), index + 1, code);
      assert.ok(getBook(index + 1), `book ${index + 1} exists`);
    });
    assert.equal(new Set(USFM_BOOK_CODES).size, 66, 'codes are unique');
  });

  test('anchors at the ends and in the awkward middle', () => {
    assert.equal(bookNumberFor('GEN'), 1);
    assert.equal(bookNumberFor('PSA'), 19);
    assert.equal(bookNumberFor('SNG'), 22, 'Song of Solomon');
    assert.equal(bookNumberFor('JHN'), 43, 'John, not Jonah');
    assert.equal(bookNumberFor('JON'), 32, 'Jonah, not John');
    assert.equal(bookNumberFor('JUD'), 65, 'Jude, not Judges');
    assert.equal(bookNumberFor('JDG'), 7, 'Judges');
    assert.equal(bookNumberFor('REV'), 66);
  });

  test('ignores case and rejects front matter', () => {
    assert.equal(bookNumberFor('gen'), 1);
    assert.equal(bookNumberFor(' rev '), 66);
    assert.equal(bookNumberFor('FRT'), undefined, 'front matter');
    assert.equal(bookNumberFor('GLO'), undefined, 'glossary');
    assert.equal(bookNumberFor('TOB'), undefined, 'apocrypha is not bundled');
  });

  test('reads the code off a file without parsing it', () => {
    assert.equal(readBookCode(THIRD_JOHN), '3JN');
    assert.equal(readBookCode('\\id GEN - World English Bible'), 'GEN');
    assert.equal(readBookCode('no id line here'), undefined);
  });
});

describe('inline markup', () => {
  test('unwraps words and drops their Strong’s numbers', () => {
    assert.equal(
      stripInlineMarkup(String.raw`\w In|strong="H8064"\w* \w the|strong="H1254"\w* beginning`),
      'In the beginning',
    );
  });

  test('keeps contractions split across markers intact', () => {
    // WEB really does write "don’t" as two pieces around a Strong's tag.
    assert.equal(
      stripInlineMarkup(String.raw`Beloved, don’\w t|strong="G3588"\w* imitate evil.`),
      'Beloved, don’t imitate evil.',
    );
  });

  test('removes footnotes and cross references whole', () => {
    assert.equal(
      stripInlineMarkup(
        String.raw`God\f + \fr 1:1 \ft The Hebrew is “\+wh אֱלֹהִים\+wh*” (Elohim).\f* created.`,
      ),
      'God created.',
    );
    assert.equal(
      stripInlineMarkup(String.raw`the Word\x - \xo 1:1 \xt Genesis 1:1\x* was God.`),
      'the Word was God.',
    );
  });

  test('unwraps other character markers but keeps their text', () => {
    assert.equal(
      stripInlineMarkup(String.raw`\wj Come to me\wj*, he said. \qs Selah\qs*`),
      'Come to me, he said. Selah',
    );
  });

  test('collapses the whitespace USFM leaves behind', () => {
    assert.equal(stripInlineMarkup('  a   b \n c  '), 'a b c');
    assert.equal(stripInlineMarkup(''), '');
  });
});

describe('words of Jesus', () => {
  /** The red-letter slices, resolved back into the strings they point at. */
  const spoken = (raw: string) => {
    const { text, redLetter } = readVerseContent(raw);
    return redLetter.map(([start, end]) => text.slice(start, end));
  };

  test('marks only what Jesus says, not the words around it', () => {
    assert.deepEqual(
      spoken(String.raw`Jesus said to him, \wj “I am the way.”\wj* He then left.`),
      ['“I am the way.”'],
    );
  });

  test('lands on the right characters even with markup inside the span', () => {
    // The offsets have to survive the Strong's tags being stripped out, which
    // is the whole reason this cannot be done in two passes.
    const raw = String.raw`He said, \wj \w Follow|strong="G190"\w* \w me|strong="G1473"\w*\wj*.`;
    const { text, redLetter } = readVerseContent(raw);
    assert.equal(text, 'He said, Follow me.');
    assert.deepEqual(redLetter, [[9, 18]]);
    assert.equal(text.slice(9, 18), 'Follow me');
  });

  test('handles a verse that is entirely spoken', () => {
    const { text, redLetter } = readVerseContent(String.raw`\wj It is finished.\wj*`);
    assert.equal(text, 'It is finished.');
    assert.deepEqual(redLetter, [[0, text.length]]);
  });

  test('keeps several separate sayings apart', () => {
    assert.deepEqual(
      spoken(String.raw`\wj Watch\wj* and, he added, \wj pray.\wj*`),
      ['Watch', 'pray.'],
    );
  });

  test('leaves a verse nobody speaks alone', () => {
    assert.deepEqual(spoken('In the beginning, God created.'), []);
  });

  test('never includes the spaces at the edges of a span', () => {
    const { text, redLetter } = readVerseContent(
      String.raw`He said \wj  peace be with you  \wj* to them.`,
    );
    assert.equal(text, 'He said peace be with you to them.');
    const [[start, end]] = redLetter;
    assert.equal(text.slice(start, end), 'peace be with you');
  });
});

describe('footnotes', () => {
  test('are lifted out of the text and anchored where they hung', () => {
    const { text, notes } = readVerseContent(
      String.raw`In the beginning, God\f + \fr 1:1 \ft The Hebrew is Elohim.\f* created.`,
    );
    assert.equal(text, 'In the beginning, God created.');
    assert.equal(notes.length, 1);
    assert.equal(notes[0].text, 'The Hebrew is Elohim.', 'the caller and \\fr are dropped');
    assert.equal(text.slice(0, notes[0].position), 'In the beginning, God', 'anchored after God');
  });

  test('explain a verse the translation numbers but does not carry', () => {
    // This is Acts 8:37. Without the note the reader shows a blank verse.
    const { text, notes, } = readVerseContent(
      String.raw`\f + \fr 8:37 \ft TR adds “If you believe with all your heart, you may.”\f*`,
    );
    assert.equal(text, '');
    assert.equal(notes.length, 1);
    assert.equal(notes[0].position, 0);
    assert.match(notes[0].text, /^TR adds/);
  });

  test('several notes in one verse keep their order and places', () => {
    const { notes } = readVerseContent(
      String.raw`One\f + \ft first.\f* two three\f + \ft second.\f* four.`,
    );
    assert.deepEqual(notes.map((n) => n.text), ['first.', 'second.']);
    assert.ok(notes[0].position < notes[1].position);
  });

  test('cross references are dropped without a trace', () => {
    const { text, notes } = readVerseContent(
      String.raw`the Word\x - \xo 1:1 \xt Genesis 1:1\x* was God.`,
    );
    assert.equal(text, 'the Word was God.');
    assert.deepEqual(notes, [], 'a cross reference is not a note');
  });

  test('a footnote inside a red-letter span belongs to neither by accident', () => {
    const { text, redLetter, notes } = readVerseContent(
      String.raw`\wj I am\f + \ft A note.\f* the way.\wj*`,
    );
    assert.equal(text, 'I am the way.');
    assert.deepEqual(notes.map((n) => n.text), ['A note.']);
    assert.deepEqual(redLetter, [[0, text.length]], 'the whole saying is still red');
  });
});

describe('parsing a book', () => {
  const john = parseUsfm(THIRD_JOHN);

  test('identifies the book from \\id and \\h', () => {
    assert.equal(john.code, '3JN');
    assert.equal(john.book, 64);
    assert.equal(john.name, '3 John');
  });

  test('numbers verses into real verse ids', () => {
    assert.deepEqual(
      john.verses.map((v) => v.id),
      [toVerseId(64, 1, 1), toVerseId(64, 1, 2), toVerseId(64, 1, 3)],
    );
  });

  test('strips markup out of the text', () => {
    assert.equal(john.verses[0].text, 'The elder to Gaius the beloved.');
  });

  test('a bare \\p after the last verse continues that verse', () => {
    // 3 John is where this bites. WEB and the KJV both end at verse 14, and the
    // closing greeting rides along on it; translations following the critical
    // text number that greeting separately as verse 15.
    assert.equal(
      john.verses[2].text,
      'I rejoiced greatly when the brothers came. Peace be to you. The friends greet you.',
    );
  });

  test('records which verses open a paragraph', () => {
    assert.deepEqual(
      john.verses.map((v) => v.startsParagraph),
      [true, false, true],
    );
    assert.deepEqual(john.verses.map((v) => v.style), ['p', 'p', 'p']);
  });

  test('carries red letter and notes through to the verse', () => {
    assert.deepEqual(john.verses[0].redLetter, [], '3 John quotes nobody');
    assert.deepEqual(john.verses[0].notes, []);
  });

  test('drops headers, titles and front matter', () => {
    assert.ok(!JSON.stringify(john.verses).includes('Third Letter'));
  });
});

describe('parsing poetry', () => {
  const psalm = parseUsfm(PSALM);

  test('keeps the superscription out of verse 1', () => {
    assert.equal(
      psalm.titles.get(toVerseId(19, 3, 1)),
      'A Psalm by David, when he fled from Absalom his son.',
    );
    assert.ok(!psalm.verses[0].text.includes('Absalom'));
    assert.equal(psalm.verses[0].verse, 1, 'the title is not a verse');
  });

  test('carries the poetry marker through as the style', () => {
    assert.deepEqual(psalm.verses.map((v) => v.style), ['q1', 'q1', 'q1']);
  });

  test('folds continuation lines into the verse they belong to', () => {
    assert.equal(
      psalm.verses[0].text,
      'LORD, how my adversaries have increased! Many are those who rise up against me.',
    );
    assert.equal(
      psalm.verses[1].text,
      'Many there are who say of my soul, “There is no help for him in God.” Selah',
    );
  });

  test('a stanza break does not swallow the next verse', () => {
    assert.equal(psalm.verses[2].text, 'But you, LORD, are a shield around me.');
    assert.equal(psalm.verses.length, 3);
  });

  test('keeps every heading when a chapter has more than one', () => {
    // Psalm 119 carries twenty-two acrostic headings, one per Hebrew letter.
    // Keyed by chapter they would collapse to the last; keyed by verse they
    // land where they belong.
    const acrostic = parseUsfm(String.raw`
\id PSA
\h Psalms
\c 119
\d ALEPH
\q1
\v 1 Blessed are those whose ways are blameless.
\v 2 Blessed are those who keep his statutes.
\d BETH
\q1
\v 9 How can a young man keep his way pure?
`);
    assert.deepEqual(
      [...acrostic.titles],
      [
        [toVerseId(19, 119, 1), 'ALEPH'],
        [toVerseId(19, 119, 9), 'BETH'],
      ],
    );
  });

  test('an acrostic marker is a heading, not a line of the poem', () => {
    // The BSB writes Psalm 119's letters as \\qa. Treating that as a paragraph
    // marker glued "BETH" onto the end of the previous verse.
    const bsbStyle = parseUsfm(String.raw`
\id PSA
\h Psalms
\c 119
\qa ALEPH
\q1
\v 8 I will keep Your statutes; do not utterly forsake me.
\qa BETH
\q1
\v 9 How can a young man keep his way pure?
`);
    assert.equal(
      bsbStyle.verses[0].text,
      'I will keep Your statutes; do not utterly forsake me.',
      'the next stanza\u2019s letter does not belong to this verse',
    );
    assert.deepEqual(
      [...bsbStyle.titles],
      [
        [toVerseId(19, 119, 8), 'ALEPH'],
        [toVerseId(19, 119, 9), 'BETH'],
      ],
    );
  });

  test('a section heading stands before the verse it introduces', () => {
    const withSections = parseUsfm(String.raw`
\id JHN
\h John
\c 1
\s1 The Word Became Flesh
\p
\v 1 In the beginning was the Word.
\s1 The Witness of John
\p
\v 6 There came a man sent from God.
`);
    assert.deepEqual(
      [...withSections.titles],
      [
        [toVerseId(43, 1, 1), 'The Word Became Flesh'],
        [toVerseId(43, 1, 6), 'The Witness of John'],
      ],
    );
    assert.equal(withSections.verses[0].text, 'In the beginning was the Word.');
  });

  test('drops a heading that introduces nothing', () => {
    const dangling = parseUsfm(String.raw`
\id PSA
\h Psalms
\c 1
\p
\v 1 Blessed is the man.
\d A heading with no verse after it
\c 2
\p
\v 1 Why do the nations rage?
`);
    assert.equal(dangling.titles.size, 0);
  });

  test('refuses a file that is not scripture', () => {
    assert.throws(() => parseUsfm('\\id FRT Front matter\n\\p Hello.'), /not a book of the canon/);
  });
});

describe('validation', () => {
  const messages = (usfm: string, severity: 'error' | 'note') =>
    validateBook(parseUsfm(usfm))
      .filter((p) => p.severity === severity)
      .map((p) => p.message);

  test('passes a sound book', () => {
    assert.deepEqual(validateBook(parseUsfm(THIRD_JOHN)), []);
  });

  test('catches a chapter count that disagrees with canon.ts', () => {
    assert.ok(
      messages(PSALM, 'error').some((m) => m.includes('150 chapters')),
      'expected a chapter-count complaint',
    );
  });

  test('a verse the translation leaves out is a note, not an error', () => {
    const gappy = String.raw`
\id 3JN
\h 3 John
\c 1
\p
\v 1 First.
\v 3 Third — the second is missing.
`;
    assert.deepEqual(messages(gappy, 'note'), ['3 John 1:2 is absent from this translation']);
    assert.deepEqual(messages(gappy, 'error'), []);
  });

  test('a verse numbered with only a footnote is a note, not an error', () => {
    // This is Romans 16:25 in the WEB: the number is kept so the numbering
    // still lines up with the Textus Receptus, but there is no text.
    const placeholder = String.raw`
\id 3JN
\h 3 John
\c 1
\p
\v 1 First.
\v 2 \f + \fr 1:2 \ft Some manuscripts add this verse.\f*
`;
    const parsed = parseUsfm(placeholder);
    assert.equal(parsed.verses[1].text, '');
    assert.equal(parsed.verses[1].placeholder, true, 'numbered but empty on purpose');
    assert.deepEqual(messages(placeholder, 'note'), ['3 John 1:2 is numbered but carries no text here']);
    assert.deepEqual(messages(placeholder, 'error'), []);
  });

  test('a verse with nothing at all is an error', () => {
    const broken = String.raw`
\id 3JN
\h 3 John
\c 1
\p
\v 1 First.
\v 2
\v 2 Again.
`;
    const parsed = parseUsfm(broken);
    assert.equal(parsed.verses[1].placeholder, false, 'no footnote stood in for it');
    const errors = messages(broken, 'error');
    assert.ok(errors.some((m) => m.includes('is empty')), 'empty verse');
    assert.ok(errors.some((m) => m.includes('appears twice')), 'duplicate verse');
  });
});

describe('verse counts', () => {
  test('reports the highest verse number per chapter', () => {
    assert.deepEqual(chapterVerseCounts(parseUsfm(THIRD_JOHN)), [3]);
  });

  test('indexes from chapter 1 even when a chapter is missing', () => {
    const skipped = String.raw`
\id REV
\h Revelation
\c 1
\p
\v 1 One.
\c 3
\p
\v 1 One.
\v 2 Two.
`;
    assert.deepEqual(chapterVerseCounts(parseUsfm(skipped)), [1, 0, 2]);
  });

  test('canon.ts is the authority on how many chapters exist', () => {
    assert.equal(BOOKS.length, USFM_BOOK_CODES.length);
  });
});
