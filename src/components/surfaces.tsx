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
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/components/motion';

import { Elevation, Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The ground everything floats over: a genuine top-to-bottom gradient.
 *
 * An absolutely positioned tint block was tried first and left a hard edge
 * across the screen wherever it stopped — a gradient in description only.
 */
export function Ground({
  children,
  style,
  tint,
  scroll,
}: {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  /**
   * A colour to wash the ground with — the current book's division, in the
   * reader. It is what makes the margins either side of a chapter belong to
   * Psalms or to the Gospels rather than being the same grey everywhere.
   */
  readonly tint?: string;
  /**
   * A scroll offset to drift against. The ground moves at a fraction of the
   * content's speed, which is what reads as depth: the page is a near thing
   * sliding over a far one.
   */
  readonly scroll?: SharedValue<number>;
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  // A stand-in so the hooks below are called the same number of times whether
  // or not a caller passed a scroll offset.
  const still = useSharedValue(0);
  const offset = scroll ?? still;

  const drift = useAnimatedStyle(() => {
    if (reduced) return {};
    // Capped: past a screen or so of travel the ground has said what it has to
    // say, and letting it run forever would drag the gradient off the top.
    const travel = Math.min(offset.value, 1400);
    return { transform: [{ translateY: -travel * 0.08 }] };
  });

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }, style]}>
      <Animated.View pointerEvents="none" style={[styles.drift, drift]}>
        <LinearGradient
          colors={[theme.background, theme.backgroundTint, theme.backgroundWarm]}
          locations={[0, 0.55, 1]}
          start={{ x: 0.05, y: 0 }}
          end={{ x: 0.95, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {tint ? (
          <LinearGradient
            colors={[`${tint}2E`, `${tint}12`, 'transparent']}
            locations={[0, 0.45, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
      </Animated.View>
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
  // Taller than the screen and hung above it, so drifting upward never
  // uncovers a hard edge at the bottom.
  drift: { position: 'absolute', left: 0, right: 0, top: -120, bottom: -220 },
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
