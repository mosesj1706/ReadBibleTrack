/**
 * The reader. One chapter at a time.
 *
 * The chapter lives in the URL — `/read/John 3` — so on the web a passage is a
 * link someone can send, and on native the route is the same code. The
 * reference is parsed rather than passed as ids, because `parseReference` is
 * already forgiving about how people write one.
 */

import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { ScrollView } from 'react-native';
import { useAnimatedRef, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getBook } from '@/bible/canon.ts';
import { sectionOf } from '@/bible/sections.ts';
import { formatReference, parseReference } from '@/bible/reference.ts';
import { fromVerseId } from '@/bible/verse-id.ts';
import { chapterRange, nextChapter, previousChapter } from '@/bible/versification.ts';
import { ChapterMarkings } from '@/components/chapter-markings';
import { Animated, SlideIn, useCollapse } from '@/components/motion';
import { setNextDirection } from '@/components/navigation';
import { PassagePalette } from '@/components/passage-palette';
import { ScriptureText } from '@/components/scripture-text';
import { Glass, Ground, Page } from '@/components/surfaces';
import { VerseActions } from '@/components/verse-actions';
import { TranslationPicker } from '@/components/translation-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, Radius, SectionColors, Spacing, WideBreakpoint } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isFullyRead, useProgress } from '@/progress/provider';
import { usePassage } from '@/scripture/provider';
import { useMarks, MARK_TINTS } from '@/marks/provider';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Stepping to the next or previous chapter.
 *
 * A push, and it travels the way the arrow points: forward slides in from the
 * right, back from the left. It used to replace, which kept the stack short
 * but meant a back gesture skipped everything you had read and dropped you on
 * Today — undoing the whole session rather than the last move.
 *
 * The cost of pushing is a stack that grows while you read. That is what the
 * control in the corner is for: it leaves the reader outright rather than
 * retreating through the chapters one at a time.
 */
function open(reference: string, travelling: 'forward' | 'back' = 'forward'): void {
  setNextDirection(travelling === 'back' ? 'slide_from_left' : 'slide_from_right');
  router.push({ pathname: '/read/[reference]', params: { reference } });
}

/**
 * Jumping from the palette: a book and chapter, optionally a verse.
 *
 * A push, unlike stepping. Choosing a book from a list is a deliberate move
 * to somewhere else, and going back from it should return to what you were
 * reading — not throw you out of the reader entirely, which is what a replace
 * did: the chapter replaced itself, and back then landed on whatever had
 * opened the reader in the first place, usually Today.
 */
function goTo(book: number, chapter: number, verse?: number): void {
  const name = getBook(book)?.name ?? 'Genesis';
  const reference = verse ? `${name} ${chapter}:${verse}` : `${name} ${chapter}`;
  setNextDirection('slide_from_right');
  router.push({ pathname: '/read/[reference]', params: { reference } });
}

/**
 * Leaving the reader entirely, however many chapters deep you are.
 *
 * `dismissAll` rather than `back`, because back now steps one chapter at a
 * time — which is what it should do, and which would make this button take
 * thirty taps after thirty chapters.
 */
function leave(): void {
  if (router.canDismiss()) router.dismissAll();
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

  // How far into the chapter you have read. Kept on the UI thread so the
  // header can fold away without a round trip per frame.
  const scrolled = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrolled.value = event.contentOffset.y;
  });
  const chromeStyle = useCollapse(scrolled, 52);

  // Jumping to a verse. The palette can name one, and a reference like
  // "John 14:20" should land on verse 20 rather than the top of the chapter.
  // Verses report their own offsets as they lay out, which happens after the
  // passage loads, so the jump waits for the verse it was asked for.
  const scroller = useAnimatedRef<ScrollView>();
  const offsets = useRef(new Map<number, number>());
  const wanted = requested && range && requested.start !== range.start
    ? requested.start
    : undefined;
  // Cleared per reference so the same verse can be picked again after
  // scrolling away from it.
  const jumped = useRef<number | undefined>(undefined);
  useEffect(() => {
    offsets.current.clear();
    jumped.current = undefined;
  }, [at.book, at.chapter]);

  // Plain function, not useCallback: this app builds with the React Compiler
  // (app.json, experiments.reactCompiler), and a manual memo it cannot prove
  // equivalent makes it skip optimising the whole component. Here it did
  // exactly that to the reader, which is the last screen worth deoptimising.
  // The compiler memoises this itself.
  const jumpIfReady = (id: number, y: number) => {
    offsets.current.set(id, y);
    if (wanted === undefined || jumped.current === wanted || id !== wanted) return;
    jumped.current = wanted;
    // Sits the verse a little below the chapter bar rather than flush against
    // it, so it reads as the top of a passage, not a cut-off one.
    scroller.current?.scrollTo({ y: Math.max(y - Spacing.four, 0), animated: true });
    // Deliberately not selected: asking to go to a verse is navigation, and
    // opening the mark-and-note sheet over half the screen answers a question
    // nobody asked. Landing at the top of the view says enough.
  };

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
    <Ground tint={SectionColors[scheme][sectionOf(at.book)]} scroll={scrolled}>
      <Stack.Screen options={{ title }} />
      <SafeAreaView style={styles.frame}>
        <Glass style={styles.topBar}>
          <Pressable
            onPress={leave}
            accessibilityRole="button"
            accessibilityLabel="Back to today"
            style={styles.leave}
          >
            <ThemedText type="small" themeColor="accent">
              {/* "Close" rather than "Back": the swipe steps back a chapter,
                  this leaves the reader. Calling both of them Back would name
                  two different things the same. */}
              {router.canDismiss() ? '‹ Close' : '‹ Today'}
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
        </Glass>

        <View style={styles.columns}>
        {wide ? <Glass solid style={styles.side}>{palette}</Glass> : null}
        <View style={styles.middle}>
        <Animated.View style={[styles.bar, { borderBottomColor: theme.border }, chromeStyle]}>
          <Step
            label="‹"
            hint={previous ? formatReference(chapterRange(previous.book, previous.chapter)!) : undefined}
            onPress={
              previous
                ? () => open(formatReference(chapterRange(previous.book, previous.chapter)!), 'back')
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
              next
                ? () => open(formatReference(chapterRange(next.book, next.chapter)!), 'forward')
                : undefined
            }
          />
        </Animated.View>

        <Page style={styles.pageFill}>
        <Animated.ScrollView
          ref={scroller}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={styles.text}
          showsVerticalScrollIndicator={false}
        >
          <ScriptureText
            verses={passage.verses}
            headings={passage.headings}
            notes={passage.notes}
            tintOf={tintOf}
            starredOn={starredOn}
            notedOn={notedOn}
            selectedId={selected}
            onSelect={(verse) => setSelected((at) => (at === verse.id ? undefined : verse.id))}
            onVerseLayout={jumpIfReady}
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
        </Animated.ScrollView>
        </Page>
        </View>
        {wide ? <Glass solid style={styles.side}>{markings}</Glass> : null}
        </View>

        {/* One drawer at a time on a narrow screen. */}
        {!wide && drawer !== 'none' ? (
          <View style={[styles.drawer, { pointerEvents: 'box-none' }]}>
            <SlideIn
              visible
              fromX={drawer === 'palette' ? -40 : 40}
              style={styles.drawerPanel}
            >
              <Glass floating solid style={styles.drawerFill}>
                {drawer === 'palette' ? palette : markings}
              </Glass>
            </SlideIn>
          </View>
        ) : null}

        {/* Pinned rather than in the scroll: the sheet belongs to the verse you
            just tapped, and hunting for it at the end of a 176-verse chapter is
            not an interaction. */}
        {selected !== undefined ? (
          <View style={[styles.sheetHolder, { pointerEvents: 'box-none' }]}>
            <SlideIn visible fromY={28}>
              <VerseActions verseId={selected} onClose={() => setSelected(undefined)} />
            </SlideIn>
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

/**
 * The reader at its widest: two 248pt panels either side of the reading
 * measure, plus the gaps and padding between them. The top bar is held to the
 * same width so its controls sit over the columns rather than out at the far
 * corners of a large display.
 */
const ReaderWidth = 248 * 2 + MaxContentWidth + Spacing.three * 4;

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
    // Without this the middle column stops at the reading measure and every
    // remaining point of a wide display piles up on the right, leaving the
    // three panes shoved against the left edge.
    justifyContent: 'center',
    width: '100%',
    maxWidth: ReaderWidth,
    alignSelf: 'center',
  },
  // Wide enough for a book name and a grid of chapter numbers, narrow enough
  // that the reading measure keeps the middle.
  side: { width: 248, minHeight: 0, marginBottom: Spacing.three },
  middle: { flex: 1, minHeight: 0, maxWidth: MaxContentWidth, width: '100%', overflow: 'hidden' },
  pageFill: { flex: 1, minHeight: 0, marginBottom: Spacing.three },
  // No auto margin here: it would absorb the bar's free space and force a
  // wrap even on a 390pt phone that has room for one row. These keep their
  // size and drop to a second row only when the bar genuinely runs out.
  toggles: { flexDirection: 'row', gap: Spacing.one, flexShrink: 0 },
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
  drawerFill: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    // The bar folds to nothing on scroll; without this the chapter title
    // spills out of the shrinking box instead of being clipped by it.
    overflow: 'hidden',
  },
  // 44pt is Apple's minimum touch target and Android's is close to it. The
  // glyph is small; the tappable area must not be.
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
    width: '100%',
    // Glass draws a rounded panel, so the bar needs to sit in from the edges
    // rather than run flush to them.
    maxWidth: ReaderWidth - Spacing.three * 2,
    alignSelf: 'center',
    marginBottom: Spacing.two,
    // On a phone too narrow for one row — a 320pt screen with three
    // translations — the chips drop to a second line rather than pushing the
    // panel toggles off the edge, where they were unreachable.
    flexWrap: 'wrap',
  },
  leave: { minHeight: 44, justifyContent: 'center', paddingRight: Spacing.two, flexShrink: 0 },
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
