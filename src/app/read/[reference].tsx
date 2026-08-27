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
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getBook } from '@/bible/canon.ts';
import { formatReference, parseReference } from '@/bible/reference.ts';
import { fromVerseId } from '@/bible/verse-id.ts';
import { chapterRange, nextChapter, previousChapter } from '@/bible/versification.ts';
import { ChapterMarkings } from '@/components/chapter-markings';
import { PassagePalette } from '@/components/passage-palette';
import { ScriptureText } from '@/components/scripture-text';
import { Glass, Ground, Page } from '@/components/surfaces';
import { VerseActions } from '@/components/verse-actions';
import { TranslationPicker } from '@/components/translation-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, Radius, Spacing, WideBreakpoint } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isFullyRead, useProgress } from '@/progress/provider';
import { usePassage } from '@/scripture/provider';
import { useMarks, MARK_TINTS } from '@/marks/provider';
import { useColorScheme } from '@/hooks/use-color-scheme';

function open(reference: string): void {
  router.replace({ pathname: '/read/[reference]', params: { reference } });
}

/** Jump from the palette: a book and chapter, optionally a verse within it. */
function goTo(book: number, chapter: number, verse?: number): void {
  const name = getBook(book)?.name ?? 'Genesis';
  open(verse ? `${name} ${chapter}:${verse}` : `${name} ${chapter}`);
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

  const { width } = useWindowDimensions();
  const wide = width >= WideBreakpoint;
  // On a narrow screen the panels become one drawer at a time, because two
  // columns beside a reading measure leaves nothing for the reading.
  const [drawer, setDrawer] = useState<'none' | 'palette' | 'marks'>('none');

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

  const palette = (
    <PassagePalette book={at.book} chapter={at.chapter} onPick={(b, c, v) => { setDrawer('none'); goTo(b, c, v); }} />
  );
  const markings = <ChapterMarkings range={range} onJump={(id) => setSelected(id)} />;

  return (
    <Ground>
      <Stack.Screen options={{ title }} />
      <SafeAreaView style={styles.frame}>
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
          {!wide ? (
            <View style={styles.toggles}>
              <Toggle label="☰" hint="Books and chapters" on={drawer === 'palette'}
                onPress={() => setDrawer((d) => (d === 'palette' ? 'none' : 'palette'))} />
              <Toggle label="✎" hint="Marked in this chapter" on={drawer === 'marks'}
                onPress={() => setDrawer((d) => (d === 'marks' ? 'none' : 'marks'))} />
            </View>
          ) : null}
        </View>

        <View style={styles.columns}>
        {wide ? <Glass style={styles.side}>{palette}</Glass> : null}
        <View style={styles.middle}>
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

        <Page style={styles.pageFill}>
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
        </Page>
        </View>
        {wide ? <Glass style={styles.side}>{markings}</Glass> : null}
        </View>

        {/* One drawer at a time on a narrow screen. */}
        {!wide && drawer !== 'none' ? (
          <View style={styles.drawer} pointerEvents="box-none">
            <Glass floating style={styles.drawerPanel}>
              {drawer === 'palette' ? palette : markings}
            </Glass>
          </View>
        ) : null}

        {/* Pinned rather than in the scroll: the sheet belongs to the verse you
            just tapped, and hunting for it at the end of a 176-verse chapter is
            not an interaction. */}
        {selected !== undefined ? (
          <View style={styles.sheetHolder} pointerEvents="box-none">
            <VerseActions verseId={selected} onClose={() => setSelected(undefined)} />
          </View>
        ) : null}
      </SafeAreaView>
    </Ground>
  );
}

function Toggle({
  label,
  hint,
  on,
  onPress,
}: {
  readonly label: string;
  readonly hint: string;
  readonly on: boolean;
  readonly onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={hint}
      accessibilityState={{ selected: on }}
      style={[
        styles.toggle,
        { backgroundColor: on ? theme.accentSoft : 'transparent', borderColor: on ? theme.accent : theme.border },
      ]}
    >
      <ThemedText type="small" themeColor={on ? 'accent' : 'textSecondary'}>{label}</ThemedText>
    </Pressable>
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
  frame: { flex: 1, width: '100%' },
  // Every link in this chain needs to be allowed to shrink. Without it the
  // middle column grows to the height of the whole chapter and the scroll
  // never happens inside it — the header ends up above the top of the window.
  columns: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  // Wide enough for a book name and a grid of chapter numbers, narrow enough
  // that the reading measure keeps the middle.
  side: { width: 248, minHeight: 0, marginBottom: Spacing.three },
  middle: { flex: 1, minHeight: 0, maxWidth: MaxContentWidth, width: '100%', overflow: 'hidden' },
  pageFill: { flex: 1, minHeight: 0, marginBottom: Spacing.three },
  toggles: { flexDirection: 'row', gap: Spacing.one },
  toggle: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawer: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, padding: Spacing.three },
  drawerPanel: { flex: 1 },
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
