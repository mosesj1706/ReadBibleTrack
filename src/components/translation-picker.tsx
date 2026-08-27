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
  row: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    // Comfortably tappable with a thumb, not just a mouse pointer.
    minHeight: 44,
    justifyContent: 'center',
  },
});
