import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { portionFor, resumeAt } from '@/bible/plan.ts';
import { formatReference } from '@/bible/reference.ts';
import { canonSpan, subtractRanges } from '@/bible/verse-id.ts';
import { countVerses, progressThrough } from '@/bible/versification.ts';
import { ScriptureText } from '@/components/scripture-text';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, MaxPageWidth, Spacing, WideBreakpoint } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePlan } from '@/plans/provider';
import { useProgress } from '@/progress/provider';
import { usePassage } from '@/scripture/provider';

export default function TodayScreen() {
  const theme = useTheme();
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
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={[styles.header, wide && !split ? styles.solo : undefined]}>
            <ThemedText type="small" themeColor="textFaint" style={styles.eyebrow}>
              {today}
            </ThemedText>
            <ThemedText type="title" style={[styles.title, { fontFamily: Fonts.serif }]}>
              {planned ? 'Today’s reading' : 'Keep reading'}
            </ThemedText>
          </View>

          <View style={split ? styles.split : undefined}>
          <View style={wide ? [styles.column, split ? undefined : styles.solo] : undefined}>
          <Link href="/plan" asChild>
            <Pressable
              accessibilityRole="link"
              style={StyleSheet.flatten([
                styles.planRow,
                { borderColor: theme.border, backgroundColor: theme.backgroundElement },
              ])}
            >
              <View style={styles.planText}>
                <ThemedText type="small" themeColor="textFaint" style={styles.eyebrow}>
                  Plan
                </ThemedText>
                <ThemedText type="small">{plan.name}</ThemedText>
              </View>
              <ThemedText type="small" themeColor="accent">
                {planned ? `Day ${day}` : 'Choose'} ›
              </ThemedText>
            </Pressable>
          </Link>

          <View
            style={[
              styles.card,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}
          >
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
              </>
            )}
          </View>

          {carryOn ? (
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
          ) : null}

          </View>

          {openingVerses.length > 0 ? (
          <View style={wide ? styles.column : undefined}>
            <View
              style={[
                styles.card,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}
            >
              <ScriptureText verses={openingVerses} />
            </View>
          </View>
          ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  container: { flex: 1, width: '100%', maxWidth: MaxPageWidth },
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.four },
  header: { paddingTop: Spacing.four, gap: Spacing.two },
  // Two columns on a display, one on a phone. The reading measure still caps
  // the column that holds the passage itself.
  split: { flexDirection: 'row', gap: Spacing.four, alignItems: 'flex-start' },
  column: { flex: 1, gap: Spacing.four, maxWidth: MaxContentWidth },
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
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    minHeight: 56,
    gap: Spacing.two,
  },
  planText: { gap: Spacing.half, flexShrink: 1 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  passage: { fontSize: 24, lineHeight: 32, fontWeight: '400' },
  action: {
    paddingVertical: Spacing.three,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
});
