/**
 * Choosing what to read.
 *
 * Reading nothing in particular is a real choice here, not a fallback, so it
 * sits at the top of the list rather than the bottom.
 */

import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { planDays, planVerses, portionFor } from '@/bible/plan.ts';
import { BOOKS } from '@/bible/canon.ts';
import { formatReference } from '@/bible/reference.ts';
import { bookRange, countVerses } from '@/bible/versification.ts';
import { useAuth } from '@/auth/provider';
import { useCircle } from '@/circles/provider';
import { setCustomCirclePlan } from '@/circles/store';
import { Card, Ground } from '@/components/surfaces';
import { Animated, Rise  } from '@/components/motion';
import { ThemedText } from '@/components/themed-text';
import { Fonts, MaxPageWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { PLANS } from '@/plans/catalogue';
import { usePlan } from '@/plans/provider';

function leave(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function PlanScreen() {
  const theme = useTheme();
  // The ground drifts against this, so scrolling reads as a near plane moving
  // over a far one rather than content sliding on a flat colour.
  const scrolled = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrolled.value = event.contentOffset.y;
  });
  const { plan: current, choose, sharedWith, canChoose } = usePlan();

  // A plan a circle invents has to be stored somewhere, and the only place for
  // it is the circle. So this is offered to whoever started one, and to nobody
  // else — there is no per-device home for a definition this shape.
  const { circle, refresh } = useCircle();
  const { session } = useAuth();
  const mine = circle !== undefined && circle.createdBy === session?.user.id;
  const [building, setBuilding] = useState(false);
  const [ownName, setOwnName] = useState('');
  const [ownDays, setOwnDays] = useState('30');
  const [picked, setPicked] = useState<readonly number[]>([]);

  const pickedRanges = picked
    .map((book) => bookRange(book))
    .filter((range) => range !== undefined);
  const pickedVerses = countVerses(pickedRanges);
  const days = Math.max(1, Number(ownDays) || 0);
  const ready = ownName.trim().length > 0 && picked.length > 0 && days >= 1;

  return (
    <Ground style={styles.screen} scroll={scrolled}>
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
        </View>

        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <ThemedText type="title" style={[styles.title, { fontFamily: Fonts.serif }]}>
            What shall we read?
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {sharedWith
              ? canChoose
                ? `Everyone in ${sharedWith} reads this one. Choosing another moves the whole circle, starting today.`
                : `${sharedWith} reads this one together. Whoever started the circle chooses it.`
              : 'Choosing a plan starts it today. Everything already read stays read — progress is kept as verses, not as a position in a plan.'}
          </ThemedText>

          <View style={styles.list}>
            {PLANS.map((plan, index) => {
              const selected = plan.id === current.id;
              const days = planDays(plan);
              const verses = planVerses(plan);
              const first = portionFor(plan, 1);

              return (
                <Rise key={plan.id} delay={index * 40} style={styles.option}>
                <Pressable
                  onPress={() => {
                    choose(plan.id);
                    leave();
                  }}
                  disabled={!canChoose}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: !canChoose }}
                  style={styles.fill}
                >
                  <Card
                    inset={selected}
                    style={[
                      styles.optionBody,
                      selected ? { borderColor: theme.accent } : undefined,
                    ]}
                  >
                  <ThemedText
                    type="smallBold"
                    themeColor={selected ? 'accent' : 'text'}
                    style={{ fontFamily: Fonts.serif, fontSize: 17 }}
                  >
                    {plan.name}
                  </ThemedText>

                  {days > 0 ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {days} days · {verses.toLocaleString()} verses ·{' '}
                      {Math.round(verses / days)} a day
                    </ThemedText>
                  ) : (
                    <ThemedText type="small" themeColor="textSecondary">
                      Read whatever you like. Your place is kept either way.
                    </ThemedText>
                  )}

                  {first.length > 0 ? (
                    <ThemedText type="small" themeColor="textFaint">
                      Day one: {first.map((range) => formatReference(range)).join(' · ')} (
                      {countVerses(first)} verses)
                    </ThemedText>
                  ) : null}
                  </Card>
                </Pressable>
                </Rise>
              );
            })}
          </View>

          {/* Building your own, for a circle you started. The catalogue covers
              what most people want; "the Gospels and Acts over Lent" it does
              not, and that is exactly the sort of thing a circle agrees. */}
          {mine ? (
            building ? (
              <Card style={styles.builder}>
                <ThemedText type="smallBold" style={{ fontFamily: Fonts.serif, fontSize: 17 }}>
                  Your own plan
                </ThemedText>
                <TextInput
                  value={ownName}
                  onChangeText={setOwnName}
                  placeholder="The Gospels over Lent"
                  placeholderTextColor={theme.textFaint}
                  style={[styles.field, { color: theme.text, borderColor: theme.border }]}
                />
                <View style={styles.daysRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Over
                  </ThemedText>
                  <TextInput
                    value={ownDays}
                    onChangeText={(next) => setOwnDays(next.replace(/\D/g, '').slice(0, 4))}
                    inputMode="numeric"
                    keyboardType="number-pad"
                    style={[styles.days, { color: theme.text, borderColor: theme.border }]}
                  />
                  <ThemedText type="small" themeColor="textSecondary">
                    days
                  </ThemedText>
                </View>

                <ThemedText type="small" themeColor="textFaint">
                  {picked.length === 0
                    ? 'Tap the books to include.'
                    : `${picked.length} book${picked.length === 1 ? '' : 's'} · ${pickedVerses.toLocaleString()} verses · ${Math.max(1, Math.round(pickedVerses / days))} a day`}
                </ThemedText>

                <View style={styles.books}>
                  {BOOKS.map((book) => {
                    const on = picked.includes(book.number);
                    return (
                      <Pressable
                        key={book.number}
                        onPress={() =>
                          setPicked((was) =>
                            was.includes(book.number)
                              ? was.filter((n) => n !== book.number)
                              : [...was, book.number],
                          )
                        }
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        accessibilityLabel={book.name}
                        style={[
                          styles.book,
                          {
                            backgroundColor: on ? theme.accentSoft : theme.backgroundElement,
                            borderColor: on ? theme.accent : theme.border,
                          },
                        ]}
                      >
                        <ThemedText type="small" themeColor={on ? 'accent' : 'textSecondary'}>
                          {book.abbr}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.builderRow}>
                  <Pressable
                    onPress={() => setBuilding(false)}
                    accessibilityRole="button"
                    style={styles.quiet}
                  >
                    <ThemedText type="small" themeColor="textFaint">
                      Cancel
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (!ready || !circle) return;
                      void setCustomCirclePlan(circle.id, {
                        name: ownName,
                        books: picked,
                        days,
                      }).then(() => {
                        refresh();
                        leave();
                      });
                    }}
                    disabled={!ready}
                    accessibilityRole="button"
                    style={styles.quiet}
                  >
                    <ThemedText type="smallBold" themeColor={ready ? 'accent' : 'textFaint'}>
                      Read this together
                    </ThemedText>
                  </Pressable>
                </View>
              </Card>
            ) : (
              <Pressable
                onPress={() => setBuilding(true)}
                accessibilityRole="button"
                style={styles.quiet}
              >
                <ThemedText type="smallBold" themeColor="accent">
                  Build your own
                </ThemedText>
              </Pressable>
            )
          ) : null}
        </Animated.ScrollView>
      </SafeAreaView>
    </Ground>
  );
}

const styles = StyleSheet.create({
  builder: { gap: Spacing.two, padding: Spacing.three },
  field: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    minHeight: 48,
    fontSize: 17,
  },
  daysRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  days: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    minHeight: 44,
    minWidth: 72,
    textAlign: 'center',
    fontSize: 17,
  },
  // Abbreviations, so all sixty-six fit without scrolling sideways.
  books: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  book: {
    paddingHorizontal: Spacing.two,
    minHeight: 36,
    borderRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  builderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  quiet: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  screen: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  container: { flex: 1, width: '100%', maxWidth: MaxPageWidth },
  topBar: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  leave: { minHeight: 44, justifyContent: 'center' },
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.three },
  title: { fontSize: 34, lineHeight: 40, fontWeight: '400' },
  // Plans are cards to be compared, so they sit side by side where there is
  // room rather than in one tall column with the display empty beside it.
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  // Grows to share a row, but never past this: without a cap a lone card
  // left over on the last row stretches the whole width and stops looking
  // like one of a set.
  // flexShrink because React Native defaults it to 0, unlike CSS: without it
  // a 320pt basis cannot shrink into the ~272pt a 320pt phone actually has,
  // and the card is clipped off the right edge instead of narrowing.
  option: { flexBasis: 320, flexGrow: 1, flexShrink: 1, minWidth: 0, maxWidth: 460 },
  fill: { flex: 1 },
  optionBody: { flex: 1, padding: Spacing.three, gap: Spacing.half, minHeight: 44 },
});
