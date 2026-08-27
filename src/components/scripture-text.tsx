import { Fragment } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { VerseId } from '@/bible/verse-id.ts';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ScriptureNote, ScriptureVerse } from '@/scripture/queries';

/** Poetry is indented by its USFM marker; anything else reads as prose. */
const INDENT: Record<string, number> = { q1: Spacing.three, q2: Spacing.five };

/**
 * `noteAts` is a list because two footnotes can hang at the same character.
 * KJV Genesis 2:23 has exactly that — one note on "Woman", one on "Man", both
 * anchored at offset 128 — and taking only the first left the second with a
 * number in the footnote list and nothing in the text pointing at it.
 */
type Piece = {
  readonly text: string;
  readonly spoken: boolean;
  readonly noteAts: readonly number[];
};

/**
 * Cut a verse into runs of text at every point something changes: where Jesus
 * starts or stops speaking, and where a note hangs. Both are character offsets
 * into the same string, so this is one sorted walk rather than two passes.
 */
function cut(verse: ScriptureVerse, noteMarks: readonly number[]): Piece[] {
  const boundaries = new Set<number>([0, verse.text.length]);
  for (const [start, end] of verse.redLetter) {
    boundaries.add(start);
    boundaries.add(end);
  }
  for (const mark of noteMarks) boundaries.add(mark);

  const ordered = [...boundaries].sort((a, b) => a - b);
  const spokenAt = (index: number) =>
    verse.redLetter.some(([start, end]) => index >= start && index < end);
  const notesAt = (offset: number) =>
    noteMarks.flatMap((mark, index) => (mark === offset ? [index] : []));

  const pieces: Piece[] = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const from = ordered[i];
    const to = ordered[i + 1];
    pieces.push({
      text: verse.text.slice(from, to),
      spoken: spokenAt(from),
      noteAts: notesAt(from),
    });
  }

  // Notes sitting at the very end of the verse have no run to lead.
  const trailing = notesAt(verse.text.length);
  if (trailing.length > 0) pieces.push({ text: '', spoken: false, noteAts: trailing });
  return pieces;
}

function Verse({
  verse,
  heading,
  notes,
  firstNote,
  tint,
  starred,
  hasNote,
  selected,
  onSelect,
  onLayoutY,
}: {
  readonly verse: ScriptureVerse;
  readonly heading?: string;
  readonly notes: readonly ScriptureNote[];
  readonly firstNote: number;
  readonly tint?: string;
  readonly starred?: boolean;
  readonly hasNote?: boolean;
  readonly selected?: boolean;
  readonly onSelect?: (verse: ScriptureVerse) => void;
  readonly onLayoutY?: (id: VerseId, y: number) => void;
}) {
  const theme = useTheme();
  const pieces = cut(
    verse,
    notes.map((note) => note.position),
  );

  return (
    <>
      {heading ? (
        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={[styles.heading, { fontFamily: Fonts.serif }]}
        >
          {heading}
        </ThemedText>
      ) : null}
      <ThemedText
        onPress={onSelect ? () => onSelect(verse) : undefined}
        onLayout={
          onLayoutY ? (event) => onLayoutY(verse.id, event.nativeEvent.layout.y) : undefined
        }
        suppressHighlighting
        style={[
          styles.verse,
          { fontFamily: Fonts.serif, marginLeft: INDENT[verse.style] ?? 0 },
          verse.startsParagraph && !heading && styles.paragraph,
          tint ? { backgroundColor: tint } : undefined,
          selected ? { backgroundColor: theme.backgroundSelected } : undefined,
        ]}
      >
        <Text style={[styles.number, { color: theme.textFaint }]}>{verse.id % 1000} </Text>
        {starred ? <Text style={{ color: theme.accent }}>★ </Text> : null}
        {verse.text === '' ? (
          // Numbered but not carried by this translation. The note beside it
          // says why; a blank line would read as a bug instead of a difference
          // between manuscripts.
          <Text style={[styles.absent, { color: theme.textFaint }]}>
            not in this translation
          </Text>
        ) : (
          pieces.map((piece, index) => (
            <Fragment key={index}>
              {piece.noteAts.map((at) => (
                <Text key={at} style={[styles.marker, { color: theme.accent }]}>
                  {String(firstNote + at + 1)}
                </Text>
              ))}
              <Text style={piece.spoken ? { color: theme.redLetter } : undefined}>
                {piece.text}
              </Text>
            </Fragment>
          ))
        )}
        {hasNote ? <Text style={{ color: theme.accent }}> ✎</Text> : null}
      </ThemedText>
    </>
  );
}

export function ScriptureText({
  verses,
  headings,
  notes = [],
  tintOf,
  starredOn,
  notedOn,
  selectedId,
  onSelect,
  onVerseLayout,
}: {
  readonly verses: readonly ScriptureVerse[];
  readonly headings?: ReadonlyMap<VerseId, string>;
  readonly notes?: readonly ScriptureNote[];
  /** The highlight colour behind a verse, if it has one. */
  readonly tintOf?: (id: VerseId) => string | undefined;
  readonly starredOn?: (id: VerseId) => boolean;
  readonly notedOn?: (id: VerseId) => boolean;
  readonly selectedId?: VerseId;
  readonly onSelect?: (verse: ScriptureVerse) => void;
  /**
   * Where each verse sits inside this block, so a caller that owns the scroll
   * view can jump to one. The y is relative to this component's own root.
   */
  readonly onVerseLayout?: (id: VerseId, y: number) => void;
}) {
  const theme = useTheme();

  // Notes are numbered once across the whole passage, the way a printed page
  // numbers them, so each verse needs to know where its own run starts.
  let running = 0;
  const numbered = verses.map((verse) => {
    const mine = notes.filter((note) => note.verseId === verse.id);
    const firstNote = running;
    running += mine.length;
    return { verse, mine, firstNote };
  });

  return (
    <View>
      {numbered.map(({ verse, mine, firstNote }) => (
        <Verse
          key={verse.id}
          verse={verse}
          heading={headings?.get(verse.id)}
          notes={mine}
          firstNote={firstNote}
          tint={tintOf?.(verse.id)}
          starred={starredOn?.(verse.id)}
          hasNote={notedOn?.(verse.id)}
          selected={selectedId === verse.id}
          onSelect={onSelect}
          onLayoutY={onVerseLayout}
        />
      ))}

      {notes.length > 0 ? (
        <View style={[styles.notes, { borderTopColor: theme.border }]}>
          {notes.map((note, index) => (
            <ThemedText
              key={`${note.verseId}-${note.position}-${index}`}
              type="small"
              themeColor="textFaint"
            >
              <Text style={{ color: theme.accent }}>{index + 1} </Text>
              {note.text}
            </ThemedText>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  verse: { fontSize: 18, lineHeight: 30, fontWeight: '400' },
  paragraph: { marginTop: Spacing.three },
  number: { fontSize: 12, lineHeight: 30 },
  marker: { fontSize: 11, lineHeight: 30 },
  absent: { fontStyle: 'italic' },
  heading: {
    marginTop: Spacing.four,
    marginBottom: Spacing.one,
    fontStyle: 'italic',
  },
  notes: {
    marginTop: Spacing.four,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.one,
  },
});
