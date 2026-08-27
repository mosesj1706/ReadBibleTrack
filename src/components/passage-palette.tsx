/**
 * Jumping to a book, a chapter, or a verse.
 *
 * Three steps, each narrowing: the sixty-six books, then that book's chapters,
 * then that chapter's verses. Chapters and verses are grids rather than lists
 * because they are numbers — a grid is scannable in a way a column of "17, 18,
 * 19" never is, and Psalm 119 has 176 of them.
 */

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BOOKS, getBook } from '@/bible/canon.ts';
import { lastVerse, verseCounts } from '@/bible/versification.ts';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Step = 'books' | 'chapters' | 'verses';

export function PassagePalette({
  book,
  chapter,
  onPick,
}: {
  /** Where the reader currently is, so it can be shown as selected. */
  readonly book: number;
  readonly chapter: number;
  readonly onPick: (book: number, chapter: number, verse?: number) => void;
}) {
  const theme = useTheme();
  const [step, setStep] = useState<Step>('books');
  const [chosenBook, setChosenBook] = useState(book);
  const [chosenChapter, setChosenChapter] = useState(chapter);

  const meta = getBook(chosenBook);

  return (
    <View style={styles.root}>
      <View style={styles.crumbs}>
        <Crumb label="Books" active={step === 'books'} onPress={() => setStep('books')} />
        {step !== 'books' && meta ? (
          <>
            <ThemedText type="small" themeColor="textFaint">
              ›
            </ThemedText>
            <Crumb
              label={meta.abbr}
              active={step === 'chapters'}
              onPress={() => setStep('chapters')}
            />
          </>
        ) : null}
        {step === 'verses' ? (
          <>
            <ThemedText type="small" themeColor="textFaint">
              ›
            </ThemedText>
            <Crumb label={String(chosenChapter)} active onPress={() => setStep('verses')} />
          </>
        ) : null}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {step === 'books' ? (
          <>
            {(['old', 'new'] as const).map((testament) => (
              <View key={testament} style={styles.group}>
                <ThemedText type="small" themeColor="textFaint" style={styles.eyebrow}>
                  {testament === 'old' ? 'Old Testament' : 'New Testament'}
                </ThemedText>
                {BOOKS.filter((b) => b.testament === testament).map((b) => {
                  const here = b.number === book;
                  return (
                    <Pressable
                      key={b.number}
                      onPress={() => {
                        setChosenBook(b.number);
                        setChosenChapter(1);
                        // One-chapter books have nothing to choose.
                        if (b.chapters === 1) onPick(b.number, 1);
                        else setStep('chapters');
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: here }}
                      style={[
                        styles.bookRow,
                        here ? { backgroundColor: theme.accentSoft } : undefined,
                      ]}
                    >
                      <ThemedText
                        type={here ? 'smallBold' : 'small'}
                        themeColor={here ? 'accent' : 'text'}
                        numberOfLines={1}
                      >
                        {b.name}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </>
        ) : null}

        {step === 'chapters' && meta ? (
          <View style={styles.grid}>
            {Array.from({ length: meta.chapters }, (_, i) => i + 1).map((c) => {
              const here = chosenBook === book && c === chapter;
              return (
                <Tile
                  key={c}
                  label={String(c)}
                  active={here}
                  onPress={() => onPick(chosenBook, c)}
                  onLongPress={() => {
                    setChosenChapter(c);
                    setStep('verses');
                  }}
                />
              );
            })}
          </View>
        ) : null}

        {step === 'verses' ? (
          <View style={styles.grid}>
            {Array.from({ length: lastVerse(chosenBook, chosenChapter) }, (_, i) => i + 1).map(
              (v) => (
                <Tile
                  key={v}
                  label={String(v)}
                  active={false}
                  onPress={() => onPick(chosenBook, chosenChapter, v)}
                />
              ),
            )}
          </View>
        ) : null}
      </ScrollView>

      {step === 'chapters' ? (
        <ThemedText type="small" themeColor="textFaint" style={styles.hint}>
          Hold a chapter to pick a verse
        </ThemedText>
      ) : null}
    </View>
  );
}

function Crumb({
  label,
  active,
  onPress,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.crumb}>
      <ThemedText type={active ? 'smallBold' : 'small'} themeColor={active ? 'accent' : 'textSecondary'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function Tile({
  label,
  active,
  onPress,
  onLongPress,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly onPress: () => void;
  readonly onLongPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        styles.tile,
        {
          backgroundColor: active ? theme.accent : theme.backgroundElement,
          borderColor: active ? theme.accent : theme.border,
        },
      ]}
    >
      <ThemedText
        type="small"
        style={{
          color: active ? theme.background : theme.text,
          fontVariant: ['tabular-nums'],
        }}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: Spacing.two },
  crumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    flexWrap: 'wrap',
  },
  crumb: { minHeight: 32, justifyContent: 'center' },
  scroll: { paddingHorizontal: Spacing.two, paddingBottom: Spacing.four, gap: Spacing.two },
  group: { gap: Spacing.half },
  eyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.two,
  },
  bookRow: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.small,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, paddingHorizontal: Spacing.one },
  tile: {
    minWidth: 42,
    minHeight: 42,
    paddingHorizontal: Spacing.one,
    borderRadius: Radius.small,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two, fontFamily: Fonts.sans },
});
