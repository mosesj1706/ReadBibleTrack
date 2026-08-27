/**
 * Choosing what to read.
 *
 * Reading nothing in particular is a real choice here, not a fallback, so it
 * sits at the top of the list rather than the bottom.
 */

import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { planDays, planVerses, portionFor } from '@/bible/plan.ts';
import { formatReference } from '@/bible/reference.ts';
import { countVerses } from '@/bible/versification.ts';
import { Card, Ground } from '@/components/surfaces';
import { Rise } from '@/components/motion';
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
  const { plan: current, choose } = usePlan();

  return (
    <Ground style={styles.screen}>
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

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <ThemedText type="title" style={[styles.title, { fontFamily: Fonts.serif }]}>
            What shall we read?
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Choosing a plan starts it today. Everything already read stays read —
            progress is kept as verses, not as a position in a plan.
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
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
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
        </ScrollView>
      </SafeAreaView>
    </Ground>
  );
}

const styles = StyleSheet.create({
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
  option: { flexBasis: 320, flexGrow: 1, maxWidth: 460 },
  fill: { flex: 1 },
  optionBody: { flex: 1, padding: Spacing.three, gap: Spacing.half, minHeight: 44 },
});
