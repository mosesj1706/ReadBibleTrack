/**
 * What has been read.
 *
 * The grid is the point: 66 books, each a bar as wide as the book is long, so
 * Psalms is a slab and Obadiah a sliver. Sizing by chapter count would flatter
 * the short books and make the picture a lie — which is exactly why
 * `bookVerseTotal` exists.
 */

import { Link, router } from 'expo-router';
import { Fragment, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BOOKS } from '@/bible/canon.ts';
import { SECTIONS } from '@/bible/sections.ts';
import { canonSpan } from '@/bible/verse-id.ts';
import {
  TOTAL_VERSES,
  bookRange,
  bookVerseTotal,
  chapterRange,
  countVerses,
  progressThrough,
} from '@/bible/versification.ts';
import { Card, Ground } from '@/components/surfaces';
import { Animated, Rise, useFill } from '@/components/motion';
import { ThemedText } from '@/components/themed-text';
import { Fonts, MaxPageWidth, Radius, SectionColors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { isFullyRead, useProgress } from '@/progress/provider';
import { usePlan } from '@/plans/provider';
import { carryOnAt, portionFor } from '@/bible/plan.ts';
import { formatReference } from '@/bible/reference.ts';

function leave(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function ProgressScreen() {
  const theme = useTheme();
  // The ground drifts against this, so scrolling reads as a near plane moving
  // over a far one rather than content sliding on a flat colour.
  const scrolled = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrolled.value = event.contentOffset.y;
  });
  const { ranges: read, bookmark, mark, unmark } = useProgress();
  const { plan, day } = usePlan();
  const carryOn = carryOnAt(portionFor(plan, day), read, bookmark);
  // Which book has its chapters open. One at a time: this is a list of
  // sixty-six, and several expanded at once stops being a list.
  const [open, setOpen] = useState<number | undefined>(undefined);

  const versesRead = countVerses(read);
  const whole = progressThrough([canonSpan()], read);

  // Bars are drawn in proportion to how long each book is, against the longest
  // (Psalms). `flexGrow` cannot do this: anything above 1 simply fills the row,
  // so every book past ~150 verses came out identical.
  const longest = Math.max(...BOOKS.map((book) => bookVerseTotal(book.number)));

  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  return (
    <Ground style={styles.screen} scroll={scrolled}>
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <Pressable onPress={leave} accessibilityRole="button" style={styles.leave}>
            <ThemedText type="small" themeColor="accent">
              ‹ Today
            </ThemedText>
          </Pressable>
        </View>

        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <ThemedText type="title" style={[styles.title, { fontFamily: Fonts.serif }]}>
            What we’ve read
          </ThemedText>

          <Rise>
          <Card style={styles.summary}>
            <ThemedText type="subtitle" style={{ fontFamily: Fonts.serif, fontSize: 30 }}>
              {versesRead.toLocaleString()}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              of {TOTAL_VERSES.toLocaleString()} verses · {(whole * 100).toFixed(1)}% of the Bible
            </ThemedText>
            <Bar fraction={whole} />
          </Card>
          </Rise>

          {/* The way back to what you were reading. Tapping a tab replaces the
              screen rather than stacking on it, so opening this page from a
              chapter closes the chapter — right for a tab, but it left the
              book list as the one place with a hundred ways in and none back.
              Same rule as Today's, so the two never offer different verses. */}
          {carryOn ? (
            <Rise delay={60}>
              <Link
                href={{
                  pathname: '/read/[reference]',
                  params: { reference: formatReference({ start: carryOn, end: carryOn }) },
                }}
                asChild
              >
                <Pressable accessibilityRole="link" style={[styles.carryOn, { borderColor: theme.border }]}>
                  <ThemedText type="smallBold" themeColor="accent">
                    Carry on with {formatReference({ start: carryOn, end: carryOn })} ›
                  </ThemedText>
                </Pressable>
              </Link>
            </Rise>
          ) : null}

          {SECTIONS.map((section) => {
            const hue = SectionColors[scheme][section.key];
            const books = BOOKS.filter(
              (book) => book.number >= section.first && book.number <= section.last,
            );
            const covered = books.reduce(
              (total, book) => total + countVerses([bookRange(book.number)!]),
              0,
            );
            const doneHere = books.reduce(
              (total, book) =>
                total + progressThrough([bookRange(book.number)!], read) * bookVerseTotal(book.number),
              0,
            );

            return (
              <View key={section.key} style={styles.section}>
                <View style={styles.sectionHead}>
                  <View style={[styles.swatch, { backgroundColor: hue }]} />
                  <ThemedText type="small" style={[styles.eyebrow, { color: hue }]}>
                    {section.name} · {Math.round((doneHere / covered) * 100)}%
                  </ThemedText>
                </View>

                <View style={styles.books}>
                {books.map((book) => {
                  const range = bookRange(book.number)!;
                  const share = progressThrough([range], read);
                  const total = bookVerseTotal(book.number);

                  const chapters = Array.from({ length: book.chapters }, (_, i) => i + 1);
                  const wholeBookRead = isFullyRead(range, read);

                  return (
                    <Fragment key={book.number}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: open === book.number }}
                      accessibilityLabel={`${book.name}, ${Math.round(share * 100)} per cent read`}
                      onPress={() =>
                        setOpen((current) => (current === book.number ? undefined : book.number))
                      }
                      style={styles.bookRow}
                    >
                      <ThemedText type="small" style={styles.bookName} numberOfLines={1}>
                        {book.name}
                      </ThemedText>
                      {/* Width in proportion to the book's length, so the
                          picture is honest about how much Psalms is. */}
                      <View style={styles.trackArea}>
                        <View style={{ width: `${Math.max(3, (total / longest) * 100)}%` }}>
                          <Bar fraction={share} tint={hue} />
                        </View>
                      </View>
                      <ThemedText type="small" themeColor="textFaint" style={styles.percent}>
                        {share > 0 ? `${Math.round(share * 100)}%` : ''}
                      </ThemedText>
                    </Pressable>

                    {/* Chapters as a grid of boxes to tick. Someone reading a
                        paper Bible has no page to scroll to the bottom of, and
                        opening fifty chapters to record a week of reading is
                        not a thing anyone would do twice. */}
                    {open === book.number ? (
                      <View style={styles.chapters}>
                        <View style={styles.chapterHead}>
                          <ThemedText type="small" themeColor="textSecondary">
                            Tap a chapter you have read
                          </ThemedText>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => (wholeBookRead ? unmark(range) : mark(range))}
                            style={styles.wholeBook}
                          >
                            <ThemedText type="smallBold" style={{ color: hue }}>
                              {wholeBookRead ? 'Clear the book' : 'The whole book'}
                            </ThemedText>
                          </Pressable>
                        </View>

                        <View style={styles.chapterGrid}>
                          {chapters.map((chapter) => {
                            const span = chapterRange(book.number, chapter);
                            const done = isFullyRead(span, read);
                            return (
                              <Pressable
                                key={chapter}
                                accessibilityRole="checkbox"
                                // `aria-checked` rather than accessibilityState:
                                // React Native Web does not emit the attribute
                                // from the latter, so a screen reader announced
                                // "checkbox" without ever saying whether it was
                                // ticked. This maps to both platforms.
                                aria-checked={done}
                                accessibilityLabel={`${book.name} ${chapter}`}
                                onPress={() => {
                                  if (!span) return;
                                  if (done) unmark(span);
                                  else mark(span);
                                }}
                                style={[
                                  styles.chapterCell,
                                  {
                                    borderColor: done ? hue : theme.border,
                                    backgroundColor: done ? hue : 'transparent',
                                  },
                                ]}
                              >
                                <ThemedText
                                  type="small"
                                  style={{ color: done ? theme.background : theme.textSecondary }}
                                >
                                  {chapter}
                                </ThemedText>
                              </Pressable>
                            );
                          })}
                        </View>

                        <Link
                          href={{
                            pathname: '/read/[reference]',
                            params: { reference: `${book.name} 1` },
                          }}
                          asChild
                        >
                          <Pressable accessibilityRole="link" style={styles.readInstead}>
                            <ThemedText type="small" themeColor="accent">
                              Read {book.name} instead ›
                            </ThemedText>
                          </Pressable>
                        </Link>
                      </View>
                    ) : null}
                    </Fragment>
                  );
                })}
                </View>
              </View>
            );
          })}
        </Animated.ScrollView>
      </SafeAreaView>
    </Ground>
  );
}

function Bar({ fraction, tint }: { readonly fraction: number; readonly tint?: string }) {
  const theme = useTheme();
  const filled = Math.max(0, Math.min(1, fraction));
  const fill = useFill(filled);
  // The empty part of the track carries the section's colour at low opacity,
  // so a book reads as belonging to the Torah or the Gospels even when none of
  // it has been read yet. Without it every unread book is the same grey and
  // the colour only survives in the headings.
  const track = tint ? `${tint}24` : theme.backgroundSelected;
  return (
    <View style={[styles.bar, { backgroundColor: track }]}>
      <Animated.View
        style={[
          {
            height: '100%',
            backgroundColor: tint ?? theme.accent,
            opacity: filled === 1 ? 1 : 0.75,
            borderRadius: 3,
          },
          fill,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  container: { flex: 1, width: '100%', maxWidth: MaxPageWidth },
  topBar: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  leave: { minHeight: 44, justifyContent: 'center' },
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.three },
  title: { fontSize: 34, lineHeight: 40, fontWeight: '400' },
  summary: { padding: Spacing.four, gap: Spacing.two },
  section: { gap: Spacing.half, marginTop: Spacing.two },
  eyebrow: { textTransform: 'uppercase', letterSpacing: 1.2 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  // Sixty-six books in one column is a very long scroll and, on a desktop,
  // a narrow ribbon of content with the display empty either side. They flow
  // into as many columns as the width allows instead — three on a monitor,
  // one on a phone. Each bar stays proportional within its own column, so
  // Psalms still reads as the longest book.
  books: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.four },
  // Full width, so opening a book breaks the line rather than squeezing the
  // grid into one column of the book list.
  chapters: {
    flexBasis: '100%',
    width: '100%',
    gap: Spacing.two,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
  },
  chapterHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  wholeBook: { minHeight: 44, justifyContent: 'center' },
  chapterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chapterCell: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.small,
  },
  carryOn: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  readInstead: { minHeight: 44, justifyContent: 'center' },
  bookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
    flexBasis: 300,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: 460,
  },
  bookName: { width: 132 },
  trackArea: { flex: 1, justifyContent: 'center' },
  percent: { width: 40, textAlign: 'right' },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden' },
});
