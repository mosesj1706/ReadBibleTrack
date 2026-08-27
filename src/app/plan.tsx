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
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
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
    <ThemedView style={styles.screen}>
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
            {PLANS.map((plan) => {
              const selected = plan.id === current.id;
              const days = planDays(plan);
              const verses = planVerses(plan);
              const first = portionFor(plan, 1);

              return (
                <Pressable
                  key={plan.id}
                  onPress={() => {
                    choose(plan.id);
                    leave();
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[
                    styles.option,
                    {
                      backgroundColor: selected ? theme.accentSoft : theme.backgroundElement,
                      borderColor: selected ? theme.accent : theme.border,
                    },
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
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  container: { flex: 1, width: '100%', maxWidth: MaxContentWidth },
  topBar: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  leave: { minHeight: 44, justifyContent: 'center' },
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.three },
  title: { fontSize: 34, lineHeight: 40, fontWeight: '400' },
  list: { gap: Spacing.two, marginTop: Spacing.two },
  option: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.half,
    minHeight: 44,
  },
});
