/**
 * What you have marked in the chapter currently open.
 *
 * Scoped to this chapter rather than everything, because that is the question
 * being asked while reading: what did I make of *this*. The Marked screen is
 * where everything lives.
 */

import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { formatReference } from '@/bible/reference.ts';
import type { VerseRange } from '@/bible/verse-id.ts';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { MARK_TINTS, useMarks } from '@/marks/provider';

export function ChapterMarkings({
  range,
  onJump,
}: {
  /** The chapter on screen. */
  readonly range: VerseRange;
  readonly onJump: (verseId: number) => void;
}) {
  const theme = useTheme();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { marks, notes, forgetMark, forgetNote } = useMarks();

  const within = <T extends VerseRange>(items: readonly T[]) =>
    items.filter((item) => item.start <= range.end && item.end >= range.start);

  const here = within(marks);
  const written = within(notes);
  const nothing = here.length === 0 && written.length === 0;

  return (
    <View style={styles.root}>
      <ThemedText type="small" themeColor="textFaint" style={styles.eyebrow}>
        In this chapter
      </ThemedText>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {nothing ? (
          <ThemedText type="small" themeColor="textFaint" style={styles.empty}>
            Nothing marked here yet. Tap a verse to highlight it, star it, or
            write something.
          </ThemedText>
        ) : null}

        {here.map((mark) => (
          <View key={mark.id} style={[styles.row, { borderColor: theme.border }]}>
            <Pressable
              onPress={() => onJump(mark.start)}
              accessibilityRole="button"
              style={styles.rowMain}
            >
              {mark.colour ? (
                <View style={[styles.chip, { backgroundColor: MARK_TINTS[mark.colour][scheme] }]} />
              ) : (
                <ThemedText themeColor="accent">★</ThemedText>
              )}
              <ThemedText type="small" style={{ fontFamily: Fonts.serif, flexGrow: 1 }}>
                {formatReference(mark)}
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => forgetMark(mark.id)}
              accessibilityRole="button"
              accessibilityLabel={`Remove mark on ${formatReference(mark)}`}
              style={styles.remove}
            >
              <ThemedText type="small" themeColor="textFaint">
                ×
              </ThemedText>
            </Pressable>
          </View>
        ))}

        {written.map((note) => (
          <View key={note.id} style={[styles.note, { borderColor: theme.border }]}>
            <View style={styles.noteHead}>
              <Pressable
                onPress={() => onJump(note.start)}
                accessibilityRole="button"
                style={styles.noteMain}
              >
                <ThemedText type="smallBold" themeColor="accent" style={{ fontFamily: Fonts.serif }}>
                  {formatReference(note)}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {note.body}
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => forgetNote(note.id)}
                accessibilityRole="button"
                accessibilityLabel={`Remove note on ${formatReference(note)}`}
                style={styles.remove}
              >
                <ThemedText type="small" themeColor="textFaint">
                  ×
                </ThemedText>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: Spacing.two },
  eyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  scroll: { paddingHorizontal: Spacing.two, paddingBottom: Spacing.four, gap: Spacing.two },
  empty: { paddingHorizontal: Spacing.two, lineHeight: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.small,
    borderWidth: StyleSheet.hairlineWidth,
  },
  note: {
    gap: Spacing.half,
    padding: Spacing.two,
    borderRadius: Radius.small,
    borderWidth: StyleSheet.hairlineWidth,
  },
  // The jump target and the remove button are siblings, never nested. A
  // button inside a button is invalid HTML — React reports it as a hydration
  // error on the web — and leaves the inner one unreachable by keyboard.
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 44,
  },
  noteHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  noteMain: { flexGrow: 1, flexShrink: 1, gap: Spacing.half, minHeight: 44 },
  chip: { width: 16, height: 16, borderRadius: 8 },
  remove: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
});
