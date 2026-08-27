/**
 * The three surfaces everything in the app is built from.
 *
 * `Ground` is the gradient the whole app sits on. `Glass` is frosted chrome
 * that floats over it — palettes, bars, sheets. `Card` is a raised opaque
 * surface for content and controls.
 *
 * There is deliberately no glass variant for running text. Translucency and
 * shadow behind a paragraph is a way of making something people read every day
 * harder to read, so the reading page stays opaque and quiet.
 */

import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Elevation, Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The ground everything floats over: a genuine top-to-bottom gradient.
 *
 * An absolutely positioned tint block was tried first and left a hard edge
 * across the screen wherever it stopped — a gradient in description only.
 */
export function Ground({ children, style }: { readonly children: ReactNode; readonly style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View style={[styles.fill, { backgroundColor: theme.background }, style]}>
      <LinearGradient
        pointerEvents="none"
        colors={[theme.backgroundTint, theme.background]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.fill}>{children}</View>
    </View>
  );
}

/**
 * Frosted chrome. The blur is real on web and on iOS 26's native backdrop;
 * elsewhere the translucent fill alone carries it, which still reads as a
 * layer above the ground.
 */
export function Glass({
  children,
  style,
  floating = false,
}: {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly floating?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.glass,
        {
          backgroundColor: theme.glass,
          borderColor: theme.glassBorder,
        },
        Platform.OS === 'web' ? ({ backdropFilter: 'blur(18px) saturate(150%)' } as ViewStyle) : null,
        floating ? Elevation.floating : Elevation.raised,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** A raised opaque surface: cards, rows, anything holding content. */
export function Card({
  children,
  style,
  inset = false,
}: {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  /** Pressed rather than raised — for a control that is currently active. */
  readonly inset?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: inset ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: theme.border,
        },
        inset ? Elevation.pressed : Elevation.raised,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** The opaque page a chapter is read on. No blur, no shadow, no argument. */
export function Page({ children, style }: { readonly children: ReactNode; readonly style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return <View style={[styles.page, { backgroundColor: theme.page }, style]}>{children}</View>;
}

/** Shadows on native are tinted per scheme; this keeps them from muddying dark. */
export function useShadowColor(): string {
  const theme = useTheme();
  const scheme = useColorScheme();
  return scheme === 'dark' ? '#000000' : theme.shadow;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  glass: {
    borderRadius: Radius.panel,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  card: {
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
  page: { borderRadius: Radius.card, overflow: 'hidden' },
});
