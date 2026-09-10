/**
 * One person's reading, book by book and chapter by chapter.
 *
 * The Circle screen answers "how far has everyone got"; this answers "how far
 * has *she* got, and through what". A single number cannot tell you that
 * someone has read all of the Gospels and none of the prophets, and that is
 * usually the interesting part — it is what you would ask them about.
 *
 * Everything here is drawn with plain views rather than a charting library.
 * Sixty-six bars and a strip of chapter cells is not a chart problem, and a
 * dependency that ships its own renderer would be the largest thing in the
 * bundle by a distance.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BOOKS } from '@/bible/canon.ts';
import { chapterSpan, type VerseRange } from '@/bible/verse-id.ts';
import { bookRange, countVerses, progressThrough, verseCounts } from '@/bible/versification.ts';
import { Animated } from '@/components/motion';
import { Card, Ground } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { Fonts, MaxPageWidth, Radius, Spacing } from '@/constants/theme';
import { useCircle } from '@/circles/provider';
import { useTheme } from '@/hooks/use-theme';
import { pullCircleReading, type MemberReading } from '@/sync/sync';

/** A bar that is filled rather than drawn: no library, no layout thrash. */
function Bar({ fraction }: { readonly fraction: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.bar, { backgroundColor: theme.backgroundSelected }]}>
      <View
        style={[
          styles.barFill,
          // A hair of width for anything at all, so "started" never looks the
          // same as "not started".
          {
            backgroundColor: theme.accent,
            width: `${fraction > 0 ? Math.max(2, fraction * 100) : 0}%`,
          },
        ]}
      />
    </View>
  );
}

export default function MemberScreen() {
  const theme = useTheme();
  const scrolled = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrolled.value = event.contentOffset.y;
  });

  const { id } = useLocalSearchParams<{ id: string }>();
  const { nameOf } = useCircle();
  const [reading, setReading] = useState<readonly MemberReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<number | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      setReading(await pullCircleReading());
    } catch {
      // Their reading is not on this device and the network is how it gets
      // here. Nothing to show is better than an error over a progress bar.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const theirs = reading.find((person) => person.userId === id);
  const ranges = (theirs?.ranges ?? []) as VerseRange[];
  const name = nameOf(id) ?? 'Someone';
  const total = countVerses(ranges);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/circle'));

  if (loading) {
    return (
      <Ground style={styles.screen} scroll={scrolled}>
        <SafeAreaView style={[styles.container, styles.middle]}>
          <ActivityIndicator color={theme.accent} />
        </SafeAreaView>
      </Ground>
    );
  }

  return (
    <Ground style={styles.screen} scroll={scrolled}>
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <Pressable onPress={back} accessibilityRole="button" style={styles.leave}>
            <ThemedText type="small" themeColor="accent">
              ‹ Circle
            </ThemedText>
          </Pressable>
        </View>

        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <ThemedText type="title" style={[styles.title, { fontFamily: Fonts.serif }]}>
            {name}
          </ThemedText>

          <Card style={styles.summary}>
            <ThemedText type="small" themeColor="textFaint" style={styles.eyebrow}>
              Read
            </ThemedText>
            <ThemedText type="subtitle" style={{ fontFamily: Fonts.serif, fontSize: 30 }}>
              {total.toLocaleString()}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {theirs?.lastReadOn ? `Last read ${theirs.lastReadOn}` : 'Nothing marked yet'}
            </ThemedText>
          </Card>

          <ThemedText type="small" themeColor="textFaint" style={styles.eyebrow}>
            Book by book
          </ThemedText>

          {BOOKS.map((book) => {
            const span = bookRange(book.number);
            const fraction = span ? progressThrough([span], ranges) : 0;
            const showing = open === book.number;
            return (
              <View key={book.number}>
                <Pressable
                  onPress={() => setOpen(showing ? undefined : book.number)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showing }}
                  accessibilityLabel={`${book.name}, ${Math.round(fraction * 100)} per cent read`}
                  style={styles.row}
                >
                  <ThemedText type="small" style={styles.bookName}>
                    {book.name}
                  </ThemedText>
                  <View style={styles.barBox}>
                    <Bar fraction={fraction} />
                  </View>
                  <ThemedText type="small" themeColor="textFaint" style={styles.percent}>
                    {fraction > 0 ? `${Math.round(fraction * 100)}%` : '—'}
                  </ThemedText>
                </Pressable>

                {/* Chapters only for the book being looked at. Drawing all
                    1,189 of them at once is a second of work for something
                    nobody asked to see. */}
                {showing ? (
                  <View style={styles.chapters}>
                    {verseCounts(book.number).map((_, index) => {
                      const chapter = index + 1;
                      const read = progressThrough([chapterSpan(book.number, chapter)], ranges);
                      return (
                        <View
                          key={chapter}
                          accessibilityLabel={`Chapter ${chapter}, ${Math.round(read * 100)} per cent`}
                          style={[
                            styles.cell,
                            {
                              borderColor: theme.border,
                              backgroundColor:
                                read >= 0.999
                                  ? theme.accent
                                  : read > 0
                                    ? theme.accentSoft
                                    : theme.backgroundElement,
                            },
                          ]}
                        >
                          <ThemedText
                            type="small"
                            style={{
                              fontSize: 11,
                              color: read >= 0.999 ? theme.background : theme.textFaint,
                            }}
                          >
                            {chapter}
                          </ThemedText>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          })}
        </Animated.ScrollView>
      </SafeAreaView>
    </Ground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  container: { flex: 1, width: '100%', maxWidth: MaxPageWidth },
  middle: { alignItems: 'center', justifyContent: 'center' },
  topBar: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  leave: { minHeight: 44, justifyContent: 'center' },
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.two },
  title: { fontSize: 34, lineHeight: 40, fontWeight: '400' },
  summary: { padding: Spacing.three, gap: Spacing.half },
  eyebrow: { textTransform: 'uppercase', letterSpacing: 1.2, marginTop: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
  },
  bookName: { width: 108 },
  barBox: { flex: 1 },
  percent: { width: 40, textAlign: 'right' },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  chapters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    paddingBottom: Spacing.two,
  },
  cell: {
    minWidth: 28,
    height: 28,
    borderRadius: Radius.small,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.half,
  },
});
