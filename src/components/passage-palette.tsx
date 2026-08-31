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
import {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import { BOOKS, getBook } from '@/bible/canon.ts';
import { SECTIONS, sectionOf } from '@/bible/sections.ts';
import { lastVerse } from '@/bible/versification.ts';
import { Animated, Quick, Settle, Tappable, useReducedMotion } from '@/components/motion';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, SectionColors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

type Step = 'books' | 'chapters' | 'verses';

/**
 * The gesture that walks the panel back a step.
 *
 * Built here rather than in the component because the React Compiler will not
 * allow a shared value to be written from a function created during render,
 * and a gesture is configured by exactly such functions. It is a piece of
 * machinery handed the things it needs, which is what it looks like.
 *
 * `activeOffsetX` and `failOffsetY` do the claiming: sideways wins, downwards
 * goes to the list underneath, and neither has to be perfectly straight. A
 * hand-written responder did this badly, demanding a drag stay within ten
 * pixels of level, which no real finger does.
 */
function swipeBack(
  drag: SharedValue<number>,
  width: number,
  immediate: boolean,
  back: () => void,
) {
  return Gesture.Pan()
    .activeOffsetX(10)
    .failOffsetY([-14, 14])
    .onUpdate((event) => {
      // Never leftwards: there is nothing that way, and letting it move would
      // promise something the release cannot deliver.
      drag.value = Math.max(0, event.translationX);
    })
    .onEnd((event) => {
      if (event.translationX < 40 && event.velocityX < 300) {
        drag.value = withSpring(0, Settle);
        return;
      }
      // From the list of books there is no further step to slide away to: the
      // panel itself is what leaves, and it has its own way of doing that.
      if (immediate) {
        drag.value = 0;
        runOnJS(back)();
        return;
      }
      drag.value = withTiming(width, Quick, (done) => {
        if (!done) return;
        // Once the outgoing step has left, so the two never overlap. The step
        // arriving comes from the left, as the thing you are going back to
        // does.
        runOnJS(back)();
        drag.value = -32;
        drag.value = withSpring(0, Settle);
      });
    });
}

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

  // The panel travels under the finger, the way a screen does when it is
  // swiped away. Detecting the swipe and then jumping is the same navigation
  // and a quite different thing to use: nothing moves until everything has,
  // so there is no moment where you can see what the gesture is doing and
  // change your mind about it.
  //
  // Gesture handler rather than PanResponder: the drag runs on the UI thread,
  // so it keeps up with the finger even while this thread is laying out a
  // hundred and fifty chapters. `activeOffsetX` and `failOffsetY` do the
  // claiming that a hand-written responder was doing badly — sideways wins,
  // downwards goes to the list, and neither has to be perfectly straight.
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const drag = useSharedValue(0);
  const travelling = useAnimatedStyle(() => ({ transform: [{ translateX: drag.value }] }));

  const atBooks = step === 'books';

  const swipe = swipeBack(drag, width, atBooks || reduced, back);

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
    <GestureDetector gesture={swipe}>
    <Animated.View style={[styles.root, travelling]}>
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
    </Animated.View>
    </GestureDetector>
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
