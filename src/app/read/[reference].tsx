/**
 * The reader. One chapter at a time.
 *
 * The chapter lives in the URL — `/read/John 3` — so on the web a passage is a
 * link someone can send, and on native the route is the same code. The
 * reference is parsed rather than passed as ids, because `parseReference` is
 * already forgiving about how people write one.
 */

import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getBook } from '@/bible/canon.ts';
import { formatReference, parseReference } from '@/bible/reference.ts';
import { fromVerseId } from '@/bible/verse-id.ts';
import { chapterRange, nextChapter, previousChapter } from '@/bible/versification.ts';
import { ScriptureText } from '@/components/scripture-text';
import { VerseActions } from '@/components/verse-actions';
import { TranslationPicker } from '@/components/translation-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isFullyRead, useProgress } from '@/progress/provider';
import { usePassage } from '@/scripture/provider';
import { useMarks, MARK_TINTS } from '@/marks/provider';
import { useColorScheme } from '@/hooks/use-color-scheme';

function open(reference: string): void {
  router.replace({ pathname: '/read/[reference]', params: { reference } });
}

/**
 * Leaving the reader. Chapter navigation uses `replace`, so the history is not
 * a trail of every chapter passed through — going back should land on Today,
 * not walk backwards through the reading.
 */
function leave(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function ReaderScreen() {
  const theme = useTheme();
  const { ranges, mark, unmark } = useProgress();
  const params = useLocalSearchParams<{ reference: string }>();

  // A reference may name any span; the reader shows the chapter it starts in.
  const requested = parseReference(params.reference ?? '');
  const at = requested ? fromVerseId(requested.start) : { book: 43, chapter: 1, verse: 1 };
  const range = chapterRange(at.book, at.chapter);
  const book = getBook(at.book);

  const passage = usePassage(range);
  const read = isFullyRead(range, ranges);

  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { marks, notes: written } = useMarks();
  const [selected, setSelected] = useState<number | undefined>();

  // A verse is marked when a mark's range covers it, so a highlight over
  // several verses paints all of them.
  const covering = (id: number) => marks.filter((m) => m.start <= id && id <= m.end);
  const tintOf = (id: number) => {
    const colour = covering(id).find((m) => m.colour)?.colour;
    return colour ? MARK_TINTS[colour][scheme] : undefined;
  };
  const starredOn = (id: number) => covering(id).some((m) => m.starred);
  const notedOn = (id: number) => written.some((n) => n.start <= id && id <= n.end);

  const previous = previousChapter(at.book, at.chapter);
  const next = nextChapter(at.book, at.chapter);
  const title = range ? formatReference(range) : 'Not found';

  if (!range || !book) {
    return (
      <ThemedView style={styles.screen}>
        <SafeAreaView style={styles.container}>
          <ThemedText type="subtitle">No such passage</ThemedText>
          <ThemedText themeColor="textSecondary">
            “{params.reference}” is not a reference we could read.
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title }} />
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <Pressable
            onPress={leave}
            accessibilityRole="button"
            accessibilityLabel="Back to today"
            style={styles.leave}
          >
            <ThemedText type="small" themeColor="accent">
              ‹ Today
            </ThemedText>
          </Pressable>
          {/* Translation belongs here, not on a home screen: it is changed
              while reading, usually to compare a verse. */}
          <TranslationPicker />
        </View>

        <View style={[styles.bar, { borderBottomColor: theme.border }]}>
          <Step
            label="‹"
            hint={previous ? formatReference(chapterRange(previous.book, previous.chapter)!) : undefined}
            onPress={
              previous
                ? () => open(formatReference(chapterRange(previous.book, previous.chapter)!))
                : undefined
            }
          />
          <View style={styles.title}>
            <ThemedText style={[styles.chapter, { fontFamily: Fonts.serif }]}>{title}</ThemedText>
          </View>
          <Step
            label="›"
            hint={next ? formatReference(chapterRange(next.book, next.chapter)!) : undefined}
            onPress={
              next ? () => open(formatReference(chapterRange(next.book, next.chapter)!)) : undefined
            }
          />
        </View>

        <ScrollView contentContainerStyle={styles.text} showsVerticalScrollIndicator={false}>
          <ScriptureText
            verses={passage.verses}
            headings={passage.headings}
            notes={passage.notes}
            tintOf={tintOf}
            starredOn={starredOn}
            notedOn={notedOn}
            selectedId={selected}
            onSelect={(verse) => setSelected((at) => (at === verse.id ? undefined : verse.id))}
          />


          <Pressable
            onPress={() => (read ? unmark(range) : mark(range))}
            accessibilityRole="button"
            accessibilityState={{ selected: read }}
            style={[
              styles.action,
              {
                backgroundColor: read ? theme.accentSoft : theme.backgroundElement,
                borderColor: read ? theme.accent : theme.border,
              },
            ]}
          >
            <ThemedText type="smallBold" themeColor={read ? 'accent' : 'textSecondary'}>
              {read ? `✓ ${title} read` : `Mark ${title} read`}
            </ThemedText>
          </Pressable>
        </ScrollView>

        {/* Pinned rather than in the scroll: the sheet belongs to the verse you
            just tapped, and hunting for it at the end of a 176-verse chapter is
            not an interaction. */}
        {selected !== undefined ? (
          <View style={styles.sheetHolder} pointerEvents="box-none">
            <VerseActions verseId={selected} onClose={() => setSelected(undefined)} />
          </View>
        ) : null}
      </SafeAreaView>
    </ThemedView>
  );
}

function Step({
  label,
  hint,
  onPress,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly onPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={hint ?? label}
      style={styles.step}
    >
      <ThemedText style={{ color: onPress ? theme.accent : theme.textFaint, fontSize: 28 }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  container: { flex: 1, width: '100%', maxWidth: MaxContentWidth },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // 44pt is Apple's minimum touch target and Android's is close to it. The
  // glyph is small; the tappable area must not be.
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
    gap: Spacing.two,
  },
  leave: { minHeight: 44, justifyContent: 'center', paddingRight: Spacing.two },
  step: {
    paddingHorizontal: Spacing.three,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { alignItems: 'center', gap: Spacing.half },
  eyebrow: { textTransform: 'uppercase', letterSpacing: 1.2 },
  chapter: { fontSize: 22, lineHeight: 28, fontWeight: '400' },
  text: { padding: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.three },
  sheetHolder: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    bottom: Spacing.three,
  },
  action: {
    marginTop: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
});
