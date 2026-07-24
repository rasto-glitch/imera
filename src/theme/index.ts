import { Platform } from 'react-native';

// Visual identity — see README.md. One accent per scheme, never pure white,
// never pure black. The warm off-white surface is load-bearing.
export const palette = {
  light: {
    accent: '#2E6B57', // patina
    surface: '#EDEAE0', // warm paper
    text: '#22201D',
    textMuted: '#6F6A63',
    border: '#D9D4C7',
    destructive: '#A8442E',
  },
  dark: {
    accent: '#C08A4A', // bronze
    surface: '#22201D', // ink
    text: '#EDEAE0',
    textMuted: '#8F887B',
    border: '#3A362F',
    destructive: '#C4604A',
  },
} as const;

export type Scheme = keyof typeof palette;
export type ThemeColors = (typeof palette)[Scheme];

/** Settings value: follow the system scheme or force one. */
export type ThemeOverride = 'system' | Scheme;

// Interface text is system sans (the platform default — no fontFamily needed).
// Note body text is a serif, because notes are meant to be read.
export const noteSerif = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'Georgia, "Times New Roman", serif',
});
