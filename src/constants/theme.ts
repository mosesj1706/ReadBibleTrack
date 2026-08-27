/**
 * Design tokens.
 *
 * The ground is a soft gradient; chrome floats above it as frosted glass;
 * cards and controls sit on gentle elevation. The one surface that stays calm
 * is the page a chapter is read on — translucency and shadow behind running
 * text is a way of making something people read every day harder to read.
 *
 * Every colour in the app comes from here so light and dark stay in step.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    /**
     * The ground everything floats over, as three stops rather than two.
     * A single blue-grey read as off-white; running cool to warm across the
     * page gives the empty margins either side of the content something to
     * be, which on a wide display is most of what you see.
     */
    background: '#E7EDF7',
    backgroundTint: '#EFEAF4',
    backgroundWarm: '#F6EFE7',
    /**
     * Frosted chrome: bars and floating panels.
     *
     * 0.62 was too see-through: a books list laid over a chapter let the
     * scripture behind read through the book names, and the two sets of words
     * interleaved. Chrome that carries text of its own has to win against
     * whatever is behind it, so `glassSolid` is what panels use — the lighter
     * value is only for bars that hold a few controls.
     */
    glass: 'rgba(255,255,255,0.78)',
    glassSolid: 'rgba(252,253,255,0.97)',
    glassBorder: 'rgba(255,255,255,0.75)',
    /** Raised surfaces: cards, list rows, controls. */
    backgroundElement: '#FBFCFE',
    backgroundSelected: '#DFE6EF',
    /** The reading page — opaque and quiet on purpose. */
    page: '#FAF9F6',

    text: '#182230',
    textSecondary: '#4A586B',
    textFaint: '#8492A6',
    border: '#D3DBE5',

    accent: '#2F6B58',
    accentSoft: '#D7E7DF',
    redLetter: '#9C2B2B',

    /** Elevation, as a shadow colour the platform can tint. */
    shadow: '#1B2838',
  },
  dark: {
    background: '#0D131E',
    backgroundTint: '#141A28',
    backgroundWarm: '#1B1622',
    glass: 'rgba(30,38,50,0.80)',
    glassSolid: 'rgba(20,26,36,0.97)',
    glassBorder: 'rgba(255,255,255,0.10)',
    backgroundElement: '#1A222D',
    backgroundSelected: '#242E3B',
    page: '#151A21',

    text: '#E6EAF0',
    textSecondary: '#9AA7B8',
    textFaint: '#6B7889',
    border: '#2B3644',

    accent: '#6FBFA0',
    accentSoft: '#1E332B',
    redLetter: '#E08A84',

    shadow: '#000000',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * A colour per division of the canon — the Torah, the Gospels, the prophets.
 *
 * Muted on purpose. These sit behind book names and progress bars in long
 * lists, and a saturated palette at that density stops being information and
 * becomes noise. Each one has to stay legible against both grounds, so the
 * dark variants are lifted rather than being the same hue turned down.
 *
 * Revelation deliberately shares the red-letter red: it is the one book where
 * that colour is already the book's own.
 */
export const SectionColors = {
  light: {
    law: '#B4762A',
    history: '#A75B43',
    wisdom: '#6B4E9B',
    majorProphets: '#2F5C93',
    minorProphets: '#2C7A6E',
    gospels: '#2F6B58',
    acts: '#6B7A2E',
    letters: '#4A5C7A',
    revelation: '#9C2B2B',
  },
  dark: {
    law: '#D9A45E',
    history: '#D08C72',
    wisdom: '#A98CD8',
    majorProphets: '#7EA9DC',
    minorProphets: '#6FC0B0',
    gospels: '#6FBFA0',
    acts: '#AEBF6A',
    letters: '#93A6C4',
    revelation: '#E08A84',
  },
} as const;

/**
 * Depth, as three steps rather than arbitrary shadows.
 *
 * `raised` is a card. `floating` is something over the page — a sheet, a
 * palette. `pressed` is the inset a control takes when it is active. Web gets
 * a real box-shadow; native gets the platform's own elevation model.
 */
export const Elevation = {
  raised: Platform.select({
    web: { boxShadow: '0 1px 2px rgba(24,34,48,0.06), 0 6px 16px -8px rgba(24,34,48,0.18)' },
    default: {
      shadowColor: Colors.light.shadow,
      shadowOpacity: 0.1,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
  }),
  floating: Platform.select({
    web: { boxShadow: '0 2px 6px rgba(24,34,48,0.08), 0 20px 44px -18px rgba(24,34,48,0.34)' },
    default: {
      shadowColor: Colors.light.shadow,
      shadowOpacity: 0.18,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
      elevation: 10,
    },
  }),
  pressed: Platform.select({
    web: { boxShadow: 'inset 0 1px 3px rgba(24,34,48,0.16)' },
    default: {},
  }),
} as const;

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

/** Corner radii. Generous, but not so round that a card becomes a pill. */
export const Radius = {
  small: 10,
  card: 16,
  panel: 22,
  pill: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;

/**
 * The measure for running text. Never widen this: a line of prose much past
 * 680 is genuinely harder to read, and scripture is the one thing here that
 * is read rather than scanned.
 */
export const MaxContentWidth = 680;

/**
 * How wide a whole screen may get.
 *
 * Screens that are lists, grids and cards — progress, marked verses, plans,
 * a circle — are scanned, not read, and capping them at the prose measure
 * left a phone-shaped strip adrift in the middle of a desktop display. They
 * get the room; only the paragraphs inside them stay at `MaxContentWidth`.
 */
export const MaxPageWidth = 1100;

/** Past this the reader shows its side panels rather than stacking. */
export const WideBreakpoint = 960;
