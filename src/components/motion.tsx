/**
 * Movement.
 *
 * The point of animation here is spatial, not decorative: things should arrive
 * from where they live and leave the way they came, so the app feels like one
 * place you move around rather than a stack of unrelated screens. Chrome gets
 * out of the way as you read into a chapter and comes back when you look up.
 *
 * Everything respects the system's reduce-motion setting. Someone who has
 * asked for less movement gets none of this — the same layout, arriving
 * instantly. That is not a degraded experience, it is the one they asked for.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/** A spring that settles rather than wobbles — this is a reading app. */
export const Settle = { damping: 20, stiffness: 190, mass: 0.7 } as const;
export const Quick = { duration: 180 } as const;

/** True when the person has asked the system for less movement. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => {
        if (alive) setReduced(on);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => setReduced(on));
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);

  return reduced;
}

/**
 * A control that gives way slightly under a finger.
 *
 * Small enough to feel like pressure rather than a bounce — 3% is about the
 * limit before a button starts to look like it is being played with.
 */
export function Tappable({
  children,
  onPress,
  onLongPress,
  disabled,
  style,
  accessibilityLabel,
  accessibilityRole = 'button',
  accessibilityState,
}: {
  readonly children: ReactNode;
  readonly onPress?: () => void;
  readonly onLongPress?: () => void;
  readonly disabled?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly accessibilityLabel?: string;
  readonly accessibilityRole?: 'button' | 'link';
  readonly accessibilityState?: { selected?: boolean; disabled?: boolean; busy?: boolean };
}) {
  const reduced = useReducedMotion();
  const pressed = useSharedValue(0);

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.03 }],
    opacity: 1 - pressed.value * 0.25,
  }));

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      onPressIn={() => {
        if (!reduced) pressed.value = withTiming(1, { duration: 90 });
      }}
      onPressOut={() => {
        if (!reduced) pressed.value = withSpring(0, Settle);
      }}
      style={style}
    >
      <Animated.View style={reduced ? undefined : animated}>{children}</Animated.View>
    </Pressable>
  );
}

/**
 * Something that arrives from an edge and leaves back through it.
 *
 * `from` is where it comes from, in points — negative for above or left.
 */
export function SlideIn({
  children,
  visible,
  fromY = 0,
  fromX = 0,
  style,
}: {
  readonly children: ReactNode;
  readonly visible: boolean;
  readonly fromY?: number;
  readonly fromX?: number;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const shown = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    shown.value = reduced
      ? (visible ? 1 : 0)
      : withSpring(visible ? 1 : 0, Settle);
  }, [visible, reduced, shown]);

  const animated = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [
      { translateY: fromY * (1 - shown.value) },
      { translateX: fromX * (1 - shown.value) },
    ],
  }));

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/**
 * Chrome that gets out of the way.
 *
 * Reads a scroll offset and collapses past a threshold, so reading into a
 * chapter gives the text the whole page and looking back up returns the
 * controls. The offset is a shared value so this never crosses to JS per frame.
 */
export function useCollapse(offset: SharedValue<number>, height: number) {
  const reduced = useReducedMotion();

  return useAnimatedStyle(() => {
    if (reduced) return {};
    // Past 40pt of scrolling, fold away over the next 60.
    const t = Math.min(Math.max((offset.value - 40) / 60, 0), 1);
    return {
      height: height * (1 - t),
      opacity: 1 - t,
      transform: [{ translateY: -8 * t }],
    };
  });
}

export { Animated };
