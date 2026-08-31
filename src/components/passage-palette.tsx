/**
 * Jumping to a book, a chapter, or a verse.
 *
 * Three steps, each narrowing: the sixty-six books, then that book's chapters,
 * then that chapter's verses. Chapters and verses are grids rather than lists
 * because they are numbers — a grid is scannable in a way a column of "17, 18,
 * 19" never is, and Psalm 119 has 176 of them.
 *
 * The steps are state, not screens, so there is no stack for a back gesture to
 * pop — and this panel sits over the chapter, where the system gesture is
 * turned off so it cannot take the whole reader away underneath it. A swipe
 * here is therefore handled here: it walks back up the three steps and, from
 * the top, closes the panel and gives the chapter back.
 */

import { useRef, useState } from 'react';
import { PanResponder, ScrollView, StyleSheet, View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import { BOOKS, getBook } from '@/bible/canon.ts';
import { SECTIONS, sectionOf } from '@/bible/sections.ts';
import { lastVerse } from '@/bible/versification.ts';
import { Tappable } from '@/components/motion';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, SectionColors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

type Step = 'books' | 'chapters' | 'verses';

export function PassagePalette({
  book,
  chapter,
  onPick,
  onBack,
}: {
  /** Where the reader currently is, so it can be shown as selected. */
  readonly book: number;
  readonly chapter: number;
  readonly onPick: (book: number, chapter: number, verse?: number) => void;
  /** Swiping back from the list of books, which is as far back as this goes. */
  readonly onBack?: () => void;
}) {
  const theme = useTheme();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const hueOf = (bookNumber: number) => SectionColors[scheme][sectionOf(bookNumber)];
  const [step, setStep] = useState<Step>('books');
  const [chosenBook, setChosenBook] = useState(book);
  const [chosenChapter, setChosenChapter] = useState(chapter);

  const meta = getBook(chosenBook);

  const scroller = useRef<ScrollView>(null);
  // Where the list of books was left. Sixty-six books do not fit on a phone,
  // so returning to the top of them is returning to the wrong place: the book
  // you just came out of is the one you are most likely to want again.
  const booksAt = useRef(0);

  const back = () => {
    if (step === 'verses') setStep('chapters');
    else if (step === 'chapters') setStep('books');
    else onBack?.();
  };

  // Built each render rather than held in a ref, so `back` is never the
  // version from a step ago.
  //
  // Capture, so this is asked before the list underneath rather than after:
  // the list claimed every drag that was not almost perfectly level, which is
  // most of them, and the swipe only answered to a long deliberate one. The
  // test is which way the drag is *going*, not how straight it is — a real
  // finger wanders — and a flick counts as well as a long pull.
  const swipe = PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_event, gesture) =>
      gesture.dx > 8 && gesture.dx > Math.abs(gesture.dy) * 1.5,
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dx > 40 || gesture.vx > 0.3) back();
    },
  });

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (step === 'books') booksAt.current = event.nativeEvent.contentOffset.y;
  };

  // The restore has to wait for the books to be laid out again, and the
  // content changing size is the moment they are. No flag saying a restore is
  // due: scrolling the books does not change the content's size, so the only
  // time this fires on the book list is when the list has just come back.
  const onContentSize = () => {
    if (step !== 'books') return;
    scroller.current?.scrollTo({ y: booksAt.current, animated: false });
  };

  return (
    <View style={styles.root} {...swipe.panHandlers}>
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

      <ScrollView
        ref={scroller}
        onScroll={onScroll}
        onContentSizeChange={onContentSize}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {step === 'books' ? (
          <>
            {SECTIONS.map((section) => (
              <View key={section.key} style={styles.group}>
                <View style={styles.sectionHead}>
                  <View
                    style={[styles.swatch, { backgroundColor: SectionColors[scheme][section.key] }]}
                  />
                  <ThemedText
                    type="small"
                    style={[styles.eyebrow, { color: SectionColors[scheme][section.key] }]}
                  >
                    {section.name}
                  </ThemedText>
                </View>
                {BOOKS.filter(
                  (b) => b.number >= section.first && b.number <= section.last,
                ).map((b) => {
                  const here = b.number === book;
                  return (
                    <Tappable
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
                      <View style={styles.bookLine}>
                        {/* The spine down the left edge is what makes a long
                            list scannable: you find the Gospels by colour
                            before you have read a single name. */}
                        <View style={[styles.spine, { backgroundColor: hueOf(b.number) }]} />
                        <ThemedText
                          type={here ? 'smallBold' : 'small'}
                          themeColor={here ? 'accent' : 'text'}
                          numberOfLines={1}
                        >
                          {b.name}
                        </ThemedText>
                      </View>
                    </Tappable>
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
    <Tappable onPress={onPress} accessibilityRole="button" style={styles.crumb}>
      <ThemedText type={active ? 'smallBold' : 'small'} themeColor={active ? 'accent' : 'textSecondary'}>
        {label}
      </ThemedText>
    </Tappable>
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
    <Tappable
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
    </Tappable>
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
  crumb: { minHeight: 44, justifyContent: 'center' },
  scroll: { paddingHorizontal: Spacing.two, paddingBottom: Spacing.four, gap: Spacing.two },
  group: { gap: Spacing.half },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.two,
  },
  swatch: { width: 8, height: 8, borderRadius: 4 },
  bookLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  spine: { width: 3, height: 18, borderRadius: 2 },
  eyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.two,
  },
  bookRow: {
    // 44 is the smallest a finger reliably hits. A list of 66 books is
    // exactly where it is tempting to shave a few points off each row, and
    // exactly where the misses accumulate.
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.small,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, paddingHorizontal: Spacing.one },
  tile: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: Spacing.one,
    borderRadius: Radius.small,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two, fontFamily: Fonts.sans },
});
