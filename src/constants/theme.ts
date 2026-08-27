/**
 * Design tokens. Ink on paper, with a verdigris accent for progress and action.
 * Every colour in the app comes from here so light and dark stay in step.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    background: '#F2F3EF',
    backgroundElement: '#FBFBF8',
    backgroundSelected: '#EAECE6',
    text: '#1B2430',
    textSecondary: '#566072',
    textFaint: '#8A93A0',
    border: '#D8DAD2',
    accent: '#2F6B58',
    accentSoft: '#DCE7E1',
    /** Words of Jesus, where a translation marks them. */
    redLetter: '#9C2B2B',
  },
  dark: {
    background: '#14181C',
    backgroundElement: '#1C2126',
    backgroundSelected: '#232A30',
    text: '#E4E7E2',
    textSecondary: '#99A3A0',
    textFaint: '#6E7880',
    border: '#2C333A',
    accent: '#6FBFA0',
    accentSoft: '#1E2E28',
    redLetter: '#E08A84',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'system-ui, sans-serif',
    serif: 'Georgia, ui-serif, serif',
    rounded: 'system-ui, sans-serif',
    mono: 'ui-monospace, Menlo, monospace',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 680;
