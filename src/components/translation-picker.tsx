import { Pressable, StyleSheet, View } from 'react-native';

import { TRANSLATIONS } from '@/bible/translations.ts';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/scripture/provider';

/**
 * Picks which bundled translation to read. It changes only what is displayed —
 * reading progress is stored as verse ids and is not touched by switching.
 */
export function TranslationPicker() {
  const theme = useTheme();
  const { translation, choose } = useTranslation();

  return (
    <View style={styles.row}>
      {TRANSLATIONS.map((option) => {
        const selected = option.id === translation.id;
        return (
          <Pressable
            key={option.id}
            onPress={() => choose(option.id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={option.name}
            style={[
              styles.chip,
              {
                backgroundColor: selected ? theme.accentSoft : theme.backgroundElement,
                borderColor: selected ? theme.accent : theme.border,
              },
            ]}
          >
            <ThemedText type="small" themeColor={selected ? 'accent' : 'textSecondary'}>
              {option.abbreviation}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Natural width on purpose: the chips must never stack one per line, and
  // must never grow and shove the bar's other controls onto a row of their
  // own. The bar decides what wraps; this just stays the size it needs.
  row: { flexDirection: 'row', gap: Spacing.two },
  chip: {
    // Snug on purpose: the labels are three letters, and at 16pt of side
    // padding the three chips plus the bar's other controls came a hair over
    // a 390pt phone's width and wrapped the whole row for the sake of 1pt.
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    // Comfortably tappable with a thumb, not just a mouse pointer.
    minHeight: 44,
    justifyContent: 'center',
  },
});
