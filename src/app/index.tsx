import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatReference, parseReference } from '@/bible/reference.ts';
import { normaliseRanges, subtractRanges } from '@/bible/verse-id.ts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A stand-in until the plan engine arrives in phase 2. It exists so this screen
 * exercises the real reference and range code rather than hard-coded strings.
 */
const SAMPLE_DAY = ['John 1', 'Psalm 1', 'Proverbs 1:1-7'];

function todaysReading() {
  const ranges = normaliseRanges(
    SAMPLE_DAY.map(parseReference).filter((r) => r !== undefined),
  );
  return {
    ranges,
    label: ranges.map((r) => formatReference(r)).join(' · '),
  };
}

export default function TodayScreen() {
  const theme = useTheme();
  const { ranges, label } = todaysReading();

  // Nothing is logged yet, so everything in today's reading is still ahead.
  const remaining = subtractRanges(ranges, []);
  const done = remaining.length === 0;

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <ThemedText type="small" themeColor="textFaint" style={styles.eyebrow}>
            {today}
          </ThemedText>
          <ThemedText type="title" style={[styles.title, { fontFamily: Fonts.serif }]}>
            Today&rsquo;s reading
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <ThemedText type="subtitle" style={[styles.passage, { fontFamily: Fonts.serif }]}>
            {label}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {done ? 'Finished for today.' : `${ranges.length} passages, not started.`}
          </ThemedText>
        </View>

        <View style={[styles.note, { borderLeftColor: theme.accent }]}>
          <ThemedText type="small" themeColor="textSecondary">
            Phase 0 groundwork is in place: the canon, verse ids and range algebra.
            The reader, plans and circles come next.
          </ThemedText>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  header: { paddingTop: Spacing.six, gap: Spacing.two },
  eyebrow: { textTransform: 'uppercase', letterSpacing: 1.2 },
  title: { fontSize: 38, lineHeight: 42, fontWeight: '400' },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  passage: { fontSize: 24, lineHeight: 32, fontWeight: '400' },
  note: { borderLeftWidth: 2, paddingLeft: Spacing.three },
});
