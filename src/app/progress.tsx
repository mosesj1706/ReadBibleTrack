/**
 * What has been read.
 *
 * The grid is the point: 66 books, each a bar as wide as the book is long, so
 * Psalms is a slab and Obadiah a sliver. Sizing by chapter count would flatter
 * the short books and make the picture a lie — which is exactly why
 * `bookVerseTotal` exists.
 */

import { Link, router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BOOKS, type Testament } from '@/bible/canon.ts';
import { canonSpan } from '@/bible/verse-id.ts';
import {
  TOTAL_VERSES,
  bookRange,
  bookVerseTotal,
  countVerses,
  progressThrough,
} from '@/bible/versification.ts';
import { Card, Ground } from '@/components/surfaces';
import { Animated, Rise, useFill } from '@/components/motion';
import { ThemedText } from '@/components/themed-text';
import { Fonts, MaxPageWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useProgress } from '@/progress/provider';

function leave(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function ProgressScreen() {
  const theme = useTheme();
  const { ranges: read } = useProgress();

  const versesRead = countVerses(read);
  const whole = progressThrough([canonSpan()], read);

  // Bars are drawn in proportion to how long each book is, against the longest
  // (Psalms). `flexGrow` cannot do this: anything above 1 simply fills the row,
  // so every book past ~150 verses came out identical.
  const longest = Math.max(...BOOKS.map((book) => bookVerseTotal(book.number)));

  const testaments: { key: Testament; name: string }[] = [
    { key: 'old', name: 'Old Testament' },
    { key: 'new', name: 'New Testament' },
  ];

  return (
    <Ground style={styles.screen}>
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <Pressable onPress={leave} accessibilityRole="button" style={styles.leave}>
            <ThemedText type="small" themeColor="accent">
              ‹ Today
            </ThemedText>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
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

          {testaments.map((testament) => {
            const books = BOOKS.filter((book) => book.testament === testament.key);
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
              <View key={testament.key} style={styles.section}>
                <ThemedText type="small" themeColor="textFaint" style={styles.eyebrow}>
                  {testament.name} · {Math.round((doneHere / covered) * 100)}%
                </ThemedText>

                <View style={styles.books}>
                {books.map((book) => {
                  const range = bookRange(book.number)!;
                  const share = progressThrough([range], read);
                  const total = bookVerseTotal(book.number);

                  return (
                    <Link
                      key={book.number}
                      href={{
                        pathname: '/read/[reference]',
                        params: { reference: `${book.name} 1` },
                      }}
                      asChild
                    >
                      <Pressable accessibilityRole="link" style={styles.bookRow}>
                        <ThemedText type="small" style={styles.bookName} numberOfLines={1}>
                          {book.name}
                        </ThemedText>
                        {/* Width in proportion to the book's length, so the
                            picture is honest about how much Psalms is. */}
                        <View style={styles.trackArea}>
                          <View style={{ width: `${Math.max(3, (total / longest) * 100)}%` }}>
                            <Bar fraction={share} />
                          </View>
                        </View>
                        <ThemedText type="small" themeColor="textFaint" style={styles.percent}>
                          {share > 0 ? `${Math.round(share * 100)}%` : ''}
                        </ThemedText>
                      </Pressable>
                    </Link>
                  );
                })}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </Ground>
  );
}

function Bar({ fraction }: { readonly fraction: number }) {
  const theme = useTheme();
  const filled = Math.max(0, Math.min(1, fraction));
  const fill = useFill(filled);
  return (
    <View style={[styles.bar, { backgroundColor: theme.backgroundSelected }]}>
      <Animated.View
        style={[
          {
            height: '100%',
            backgroundColor: theme.accent,
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
  eyebrow: { textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: Spacing.two },
  // Sixty-six books in one column is a very long scroll and, on a desktop,
  // a narrow ribbon of content with the display empty either side. They flow
  // into as many columns as the width allows instead — three on a monitor,
  // one on a phone. Each bar stays proportional within its own column, so
  // Psalms still reads as the longest book.
  books: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.four },
  bookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
    flexBasis: 300,
    flexGrow: 1,
    maxWidth: 460,
  },
  bookName: { width: 132 },
  trackArea: { flex: 1, justifyContent: 'center' },
  percent: { width: 40, textAlign: 'right' },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden' },
});
