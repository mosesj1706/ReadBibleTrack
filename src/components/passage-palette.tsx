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
 *
 * All three steps are laid out side by side on one track, and moving between
 * them moves the track. They were one pane whose contents were swapped, which
 * meant a swipe slid the step away to reveal the chapter behind the panel and
 * then changed what it said — you never saw where you were going, only where
 * you had been leaving from. Side by side, the step you are going back to is
 * already there, and the swipe uncovers it.
 *
 * The books keep their scroll position for free as a result: the list is never
 * unmounted, it is only moved off to the side.
 */

import { useState } from 'react';
import {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { BOOKS, getBook } from '@/bible/canon.ts';
import { SECTIONS, sectionOf } from '@/bible/sections.ts';
import { lastVerse } from '@/bible/versification.ts';
import { Animated, Quick, Settle, Tappable, useReducedMotion } from '@/components/motion';
import { Panel } from '@/components/surfaces';
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
  offset: SharedValue<number>,
  rest: number,
  pane: number,
  atStart: boolean,
  back: () => void,
) {
  return Gesture.Pan()
    .activeOffsetX(10)
    .failOffsetY([-14, 14])
    .onUpdate((event) => {
      // Never leftwards: there is nothing that way, and letting it move would
      // promise something the release cannot deliver.
      offset.value = rest + Math.max(0, event.translationX);
    })
    .onEnd((event) => {
      if (event.translationX < 40 && event.velocityX < 300) {
        offset.value = withSpring(rest, Settle);
        return;
      }
      // At the first step the track has nowhere further left to go: what is
      // behind the panel is the chapter, and closing the panel is what shows
      // it. The panel has its own way of leaving.
      if (atStart) {
        offset.value = rest;
        runOnJS(back)();
        return;
      }
      // Straight to where the previous step rests, so nothing has to be put
      // back afterwards — the step changes when the track is already there,
      // and there is no frame in which the two disagree.
      offset.value = withTiming(rest + pane, Quick, (done) => {
        if (done) runOnJS(back)();
      });
    });
}

/** Left to right, in the order they narrow. */
const STEPS = ['books', 'chapters', 'verses'] as const;

/** Moving the track, from anywhere that is not a gesture. */
function slideTo(offset: SharedValue<number>, to: number, animated: boolean) {
  offset.value = animated ? withSpring(to, Settle) : to;
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

  // The panel's own width, which the panes are cut to. Measured rather than
  // assumed: this is a drawer on a phone and a column on a desktop.
  const [pane, setPane] = useState(0);
  const index = STEPS.indexOf(step);
  const rest = -index * pane;

  const reduced = useReducedMotion();
  const offset = useSharedValue(0);
  const track = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  // At the first step the track cannot move, so the panel itself does.
  const panel = useAnimatedStyle(() => ({
    transform: [{ translateX: index === 0 ? offset.value : 0 }],
  }));

  const go = (next: Step) => {
    setStep(next);
    slideTo(offset, -STEPS.indexOf(next) * pane, !reduced);
  };

  const back = () => {
    if (step === 'verses') go('chapters');
    else if (step === 'chapters') go('books');
    else onBack?.();
  };

  const swipe = swipeBack(offset, rest, pane, index === 0 || reduced, back);

  return (
    <Panel style={[styles.root, panel]}>
      <View
        style={styles.measure}
        onLayout={(event) => setPane(event.nativeEvent.layout.width)}
      />
      <View style={styles.crumbs}>
        <Crumb label="Books" active={step === 'books'} onPress={() => go('books')} />
        {step !== 'books' && meta ? (
          <>
            <ThemedText type="small" themeColor="textFaint">
              ›
            </ThemedText>
            <Crumb label={meta.abbr} active={step === 'chapters'} onPress={() => go('chapters')} />
          </>
        ) : null}
        {step === 'verses' ? (
          <>
            <ThemedText type="small" themeColor="textFaint">
              ›
            </ThemedText>
            <Crumb label={String(chosenChapter)} active onPress={() => go('verses')} />
          </>
        ) : null}
      </View>

      <View style={styles.viewport}>
        <GestureDetector gesture={swipe}>
          <Animated.View style={[styles.track, track]}>
            <View style={{ width: pane }}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scroll}
              >
                {SECTIONS.map((section) => (
                  <View key={section.key} style={styles.group}>
                    <View style={styles.sectionHead}>
                      <View
                        style={[
                          styles.swatch,
                          { backgroundColor: SectionColors[scheme][section.key] },
                        ]}
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
                            else go('chapters');
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: here }}
                          style={[
                            styles.bookRow,
                            here ? { backgroundColor: theme.accentSoft } : undefined,
                          ]}
                        >
                          <View style={styles.bookLine}>
                            {/* The spine down the left edge is what makes a
                                long list scannable: you find the Gospels by
                                colour before you have read a single name. */}
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
              </ScrollView>
            </View>

            <View style={{ width: pane }}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scroll}
              >
                <View style={styles.grid}>
                  {meta
                    ? Array.from({ length: meta.chapters }, (_, i) => i + 1).map((c) => (
                        <Tile
                          key={c}
                          label={String(c)}
                          active={chosenBook === book && c === chapter}
                          onPress={() => onPick(chosenBook, c)}
                          onLongPress={() => {
                            setChosenChapter(c);
                            go('verses');
                          }}
                        />
                      ))
                    : null}
                </View>
              </ScrollView>
            </View>

            <View style={{ width: pane }}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scroll}
              >
                <View style={styles.grid}>
                  {Array.from(
                    { length: lastVerse(chosenBook, chosenChapter) },
                    (_, i) => i + 1,
                  ).map((v) => (
                    <Tile
                      key={v}
                      label={String(v)}
                      active={false}
                      onPress={() => onPick(chosenBook, chosenChapter, v)}
                    />
                  ))}
                </View>
              </ScrollView>
            </View>
          </Animated.View>
        </GestureDetector>
      </View>

      {step === 'chapters' ? (
        <ThemedText type="small" themeColor="textFaint" style={styles.hint}>
          Hold a chapter to pick a verse
        </ThemedText>
      ) : null}
    </Panel>
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
  // The track is wider than the panel; without this it would be drawn
  // spilling out over the chapter beside it.
  // Nothing to look at: it exists to report the panel's width, which the
  // panes are cut to. Measuring the panel itself would mean measuring the
  // thing whose transform is being animated.
  measure: { position: 'absolute', left: 0, right: 0, height: 0 },
  viewport: { flex: 1, overflow: 'hidden' },
  track: { flex: 1, flexDirection: 'row' },
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
