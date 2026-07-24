import { useColorScheme } from 'react-native';

import { useAppStore } from '@/store';
import { palette, type Scheme, type ThemeColors } from './index';

/** The effective scheme: the settings override, falling back to the system. */
export function useScheme(): Scheme {
  const system = useColorScheme();
  const override = useAppStore((s) => s.themeOverride);
  if (override !== 'system') return override;
  return system === 'dark' ? 'dark' : 'light';
}

export function useThemeColors(): ThemeColors {
  return palette[useScheme()];
}
