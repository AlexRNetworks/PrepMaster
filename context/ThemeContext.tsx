import React, { createContext, useContext, useMemo, useState, ReactNode, useCallback } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

export type ThemeMode = 'light' | 'dark' | 'system';
export type EffectiveScheme = 'light' | 'dark';

interface ThemeContextType {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  scheme: EffectiveScheme;
  toggleScheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProviderLocal({ children }: { children: ReactNode }) {
  const sys = useSystemColorScheme() ?? 'light';
  const [mode, setMode] = useState<ThemeMode>('system');
  const scheme: EffectiveScheme = useMemo(() => (mode === 'system' ? (sys as EffectiveScheme) : (mode as EffectiveScheme)), [mode, sys]);
  const toggleScheme = useCallback(() => { if (mode === 'system') { setMode(sys === 'dark' ? 'light' : 'dark'); } else { setMode(mode === 'dark' ? 'light' : 'dark'); } }, [mode, sys]);
  const value = useMemo(() => ({ mode, setMode, scheme, toggleScheme }), [mode, scheme, toggleScheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeLocal() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeLocal must be used within ThemeProviderLocal');
  return ctx;
}
