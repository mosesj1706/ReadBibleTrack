import { Link } from 'expo-router';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { portionFor, resumeAt } from '@/bible/plan.ts';
import { formatReference } from '@/bible/reference.ts';
import { canonSpan, subtractRanges } from '@/bible/verse-id.ts';
import { countVerses, progressThrough } from '@/bible/versification.ts';
import { Card, Glass, Ground } from '@/components/surfaces';
import { Animated, Rise, useFill } from '@/components/motion';
import { ScriptureText } from '@/components/scripture-text';
import { ThemedText } from '@/components/themed-text';
import { Fonts, MaxContentWidth, MaxPageWidth, Radius, Spacing, WideBreakpoint } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePlan } from '@/plans/provider';
import { useProgress } from '@/progress/provider';
import { usePassage } from '@/scripture/provider';

/** A share of something, drawn by filling rather than by appearing full. */
function Meter({ fraction }: { readonly fraction: number }) {
  const theme = useTheme();
  const fill = useFill(fraction);
  return (
    <View style={[styles.meter, { backgroundColor: theme.backgroundSelected }]}>
      <Animated.View style={[styles.meterFill, { backgroundColor: theme.accent }, fill]} />
    </View>
  );
}

export default function TodayScreen() {
  const theme = useTheme();
  // The ground drifts against this, so scrolling reads as a near plane moving
  // over a far one rather than content sliding on a flat colour.
  const scrolled = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrolled.value = event.contentOffset.y;
  });

  const { width } = useWindowDimensions();
  // Wide enough for two columns: what to read beside a taste of it. Stacked,
  // the passage preview sits below the fold and may as well not be there.
  const wide = width >= WideBreakpoint;
  const { plan, day } = usePlan();
  const { ranges: read, bookmark } = useProgress();

  // What the plan asks for today, in the order the plan lists it — never
  // sorted, so "Gospel first, then Psalm" survives.
  const portion = portionFor(plan, day);
  const planned = portion.length > 0;

  const total = countVerses(portion);
  const left = countVerses(subtractRanges(portion, read));
  const done = planned && left === 0;
  const share = progressThrough(portion, read);

  // With a plan, carry on inside today's portion. Without one, carry on from
  // wherever reading stopped, anywhere in the canon.
  const carryOn = planned ? resumeAt(portion, read) : (bookmark ?? resumeAt([canonSpan()], read));
  const readEverything = countVerses(read);

  // A taste of what you are about to read: the plan's portion if there is
  // one, otherwise the place you would resume from. Without a plan this used
  // to show nothing at all, which left the screen with less on it than the
  // person had actually asked for.
  const opening = portion[0]
    ? { start: portion[0].start, end: Math.min(portion[0].start + 3, portion[0].end) }
    : carryOn
      ? { start: carryOn, end: carryOn + 3 }
      : undefined;
  const openingVerses = usePassage(opening).verses;
  // Two columns only when the second one has something in it. With no plan
  // there is no passage to preview, and splitting anyway left the whole right
  // half of the display empty with the cards hugging the left edge.
  const split = wide && openingVerses.length > 0;

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <Ground style={styles.screen} scroll={scrolled}>
      <SafeAreaView style={styles.container}>
        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={[styles.header, wide && !split ? styles.solo : undefined]}>
            <ThemedText type="small" themeColor="textFaint" style={styles.eyebrow}>
              {today}
            </ThemedText>
            <ThemedText type="title" style={[styles.title, { fontFamily: Fonts.serif }]}>
              {planned ? 'Today’s reading' : 'Keep reading'}
            </ThemedText>
          </View>

          <View style={split ? styles.split : styles.stack}>
          <View style={wide ? [styles.column, split ? undefined : styles.solo] : styles.stack}>
          <Rise>
          <Link href="/plan" asChild>
            <Pressable accessibilityRole="link" style={styles.press}>
              {/* Frosted rather than solid: which plan is running is a setting
                  you glance at, so it should read as chrome over the ground
                  and not compete with the passage card below it. */}
              <Glass style={styles.planRow}>
              <View style={styles.planText}>
                <ThemedText type="small" themeColor="textFaint" style={styles.eyebrow}>
                  Plan
                </ThemedText>
                <ThemedText type="small">{plan.name}</ThemedText>
              </View>
              <ThemedText type="small" themeColor="accent">
                {planned ? `Day ${day}` : 'Choose'} ›
              </ThemedText>
              </Glass>
            </Pressable>
          </Link>
          </Rise>

          <Rise delay={60}>
          <Card style={styles.card}>
            {planned ? (
              <>
                <ThemedText type="subtitle" style={[styles.passage, { fontFamily: Fonts.serif }]}>
                  {portion.map((range) => formatReference(range)).join(' · ')}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {done
                    ? `Finished for today — all ${total} verses.`
                    : `${total - left} of ${total} verses read${
                        share > 0 ? ` · ${Math.round(share * 100)}%` : ''
                      }`}
                </ThemedText>
                <Meter fraction={share} />
              </>
            ) : (
              <>
                <ThemedText type="subtitle" style={[styles.passage, { fontFamily: Fonts.serif }]}>
                  {carryOn ? formatReference({ start: carryOn, end: carryOn }) : 'Genesis 1:1'}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {readEverything > 0
                    ? `${readEverything.toLocaleString()} verses read so far`
                    : 'Nothing read yet — start anywhere.'}
                </ThemedText>
                <Meter fraction={readEverything / countVerses([canonSpan()])} />
              </>
            )}
          </Card>
          </Rise>

          {carryOn ? (
            <Rise delay={120}>
            <Link
              href={{
                pathname: '/read/[reference]',
                params: { reference: formatReference({ start: carryOn, end: carryOn }) },
              }}
              asChild
            >
              <Pressable
                accessibilityRole="link"
                style={StyleSheet.flatten([styles.action, { backgroundColor: theme.accent }])}
              >
                <ThemedText type="smallBold" style={{ color: theme.background }}>
                  {left === total || readEverything === 0 ? 'Start reading' : 'Carry on'}
                </ThemedText>
              </Pressable>
            </Link>
            </Rise>
          ) : null}

          </View>

          {openingVerses.length > 0 ? (
          <View style={wide ? styles.column : styles.stack}>
          <Rise delay={180}>
            <Card style={styles.card}>
              <ScriptureText verses={openingVerses} />
            </Card>
          </Rise>
          </View>
          ) : null}
          </View>
        </Animated.ScrollView>
      </SafeAreaView>
    </Ground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  container: { flex: 1, width: '100%', maxWidth: MaxPageWidth },
  // The blocks on this screen are separate thoughts — which plan, what to
  // read, the button, a taste of it — so they get room to be separate. At the
  // old spacing they read as one stack of touching boxes on a phone.
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.five },
  header: { paddingTop: Spacing.four, gap: Spacing.two },
  // Two columns on a display, one on a phone. The reading measure still caps
  // the column that holds the passage itself.
  split: { flexDirection: 'row', gap: Spacing.five, alignItems: 'flex-start' },
  // The blocks live inside these wrappers, so the gap has to be on the wrapper
  // — the scroll view's own gap only ever separated the heading from the group
  // as a whole, which is why they still touched each other on a phone.
  stack: { gap: Spacing.five },
  column: { flex: 1, gap: Spacing.five, maxWidth: MaxContentWidth },
  // When there is only one column, it and the heading above it centre
  // together rather than sitting against the left edge of a display neither
  // of them is filling.
  solo: { maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
  eyebrow: { textTransform: 'uppercase', letterSpacing: 1.2 },
  title: { fontSize: 38, lineHeight: 42, fontWeight: '400' },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    minHeight: 56,
    gap: Spacing.two,
  },
  planText: { gap: Spacing.half, flexShrink: 1 },
  // Card supplies the surface, border and elevation; this is only the room
  // inside it.
  card: { padding: Spacing.four, gap: Spacing.two },
  passage: { fontSize: 24, lineHeight: 32, fontWeight: '400' },
  meter: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: Spacing.one },
  meterFill: { height: '100%', borderRadius: 3 },
  press: { borderRadius: Radius.card },
  action: {
    paddingVertical: Spacing.three,
    borderRadius: Radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
});
