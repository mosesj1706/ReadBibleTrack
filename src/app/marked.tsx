/**
 * Everything you have marked: highlights, favourites, and what you wrote.
 *
 * Grouped by what it is rather than by where it is, because people come here
 * asking "where was that thing I starred?" rather than browsing a book.
 */

import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatReference } from '@/bible/reference.ts';
import type { VerseRange } from '@/bible/verse-id.ts';
import { Card, Ground } from '@/components/surfaces';
import { Animated, Rise  } from '@/components/motion';
import { ThemedText } from '@/components/themed-text';
import { Fonts, MaxPageWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { MARK_TINTS, useMarks } from '@/marks/provider';

type Tab = 'highlights' | 'favourites' | 'notes';

function leave(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Every entry links back to the passage it belongs to. */
function Passage({ range, children }: { readonly range: VerseRange; readonly children: React.ReactNode }) {
  return (
    <Link
      href={{ pathname: '/read/[reference]', params: { reference: formatReference(range) } }}
      asChild
    >
      {children}
    </Link>
  );
}

export default function MarkedScreen() {
  const theme = useTheme();
  // The ground drifts against this, so scrolling reads as a near plane moving
  // over a far one rather than content sliding on a flat colour.
  const scrolled = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrolled.value = event.contentOffset.y;
  });
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { marks, notes, ready, forgetMark, forgetNote } = useMarks();
  const [tab, setTab] = useState<Tab>('highlights');

  const highlights = marks.filter((mark) => mark.colour);
  const favourites = marks.filter((mark) => mark.starred);

  const counts: Record<Tab, number> = {
    highlights: highlights.length,
    favourites: favourites.length,
    notes: notes.length,
  };

  const empty: Record<Tab, string> = {
    highlights: 'Nothing highlighted yet. Tap a verse while reading and pick a colour.',
    favourites: 'Nothing starred yet. Tap a verse and mark it a favourite.',
    notes: 'Nothing written yet. Tap a verse and write what you want to remember.',
  };

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
            Marked
          </ThemedText>

          <View style={styles.tabs}>
            {(['highlights', 'favourites', 'notes'] as const).map((option) => {
              const on = tab === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => setTab(option)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[
                    styles.tab,
                    {
                      backgroundColor: on ? theme.accentSoft : theme.backgroundElement,
                      borderColor: on ? theme.accent : theme.border,
                    },
                  ]}
                >
                  <ThemedText type="small" themeColor={on ? 'accent' : 'textSecondary'}>
                    {option[0].toUpperCase() + option.slice(1)} {counts[option]}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {!ready ? null : counts[tab] === 0 ? (
            <View style={[styles.note, { borderLeftColor: theme.border }]}>
              <ThemedText type="small" themeColor="textSecondary">
                {empty[tab]}
              </ThemedText>
            </View>
          ) : null}

          <View style={styles.entries}>
          {tab === 'notes'
            ? notes.map((note, index) => (
                <Rise key={note.id} delay={index * 30} style={styles.entry}>
                <Card style={styles.entryBody}>
                  <Passage range={note}>
                    <Pressable accessibilityRole="link">
                      <ThemedText type="smallBold" themeColor="accent" style={{ fontFamily: Fonts.serif }}>
                        {formatReference(note)}
                      </ThemedText>
                    </Pressable>
                  </Passage>
                  <ThemedText style={styles.body}>{note.body}</ThemedText>
                  <Pressable
                    onPress={() => forgetNote(note.id)}
                    accessibilityRole="button"
                    style={styles.remove}
                  >
                    <ThemedText type="small" themeColor="textFaint">
                      Remove
                    </ThemedText>
                  </Pressable>
                </Card>
                </Rise>
              ))
            : (tab === 'highlights' ? highlights : favourites).map((mark, index) => (
                <Rise key={mark.id} delay={index * 30} style={styles.entry}>
                <Card style={[styles.entryBody, styles.markRow]}>
                  {mark.colour ? (
                    <View
                      style={[styles.chip, { backgroundColor: MARK_TINTS[mark.colour][scheme] }]}
                    />
                  ) : (
                    <ThemedText themeColor="accent">★</ThemedText>
                  )}
                  <Passage range={mark}>
                    <Pressable accessibilityRole="link" style={styles.grow}>
                      <ThemedText style={{ fontFamily: Fonts.serif }}>
                        {formatReference(mark)}
                      </ThemedText>
                    </Pressable>
                  </Passage>
                  <Pressable
                    onPress={() => forgetMark(mark.id)}
                    accessibilityRole="button"
                    style={styles.remove}
                  >
                    <ThemedText type="small" themeColor="textFaint">
                      Remove
                    </ThemedText>
                  </Pressable>
                </Card>
                </Rise>
              ))}
          </View>
        </Animated.ScrollView>
      </SafeAreaView>
    </Ground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  container: { flex: 1, width: '100%', maxWidth: MaxPageWidth },
  topBar: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  leave: { minHeight: 44, justifyContent: 'center' },
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.two },
  title: { fontSize: 34, lineHeight: 40, fontWeight: '400' },
  tabs: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap', marginBottom: Spacing.two },
  tab: {
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
    justifyContent: 'center',
  },
  // Marked verses are scanned rather than read straight through, so they sit
  // two or three abreast where there is room instead of stretching one card
  // across a whole desktop display.
  entries: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  entry: { flexBasis: 340, flexGrow: 1, maxWidth: 480 },
  entryBody: { padding: Spacing.three, gap: Spacing.one },
  markRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  grow: { flexGrow: 1, minHeight: 44, justifyContent: 'center' },
  chip: { width: 20, height: 20, borderRadius: 10 },
  body: { fontSize: 15, lineHeight: 22 },
  remove: { minHeight: 44, justifyContent: 'center' },
  note: { borderLeftWidth: 2, paddingLeft: Spacing.three, paddingVertical: Spacing.two },
});
