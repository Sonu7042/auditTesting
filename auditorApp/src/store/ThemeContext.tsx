import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';

export const THEME_KEY = '@auditportal/auditor-theme';

type ThemeContextValue = {
  isDark: boolean;
  ready: boolean;
  setDark: (enabled: boolean) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({children}: {children: React.ReactNode}) {
  const [isDark, setIsDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then(value => setIsDark(value === 'dark'))
      .finally(() => setReady(true));
  }, []);

  const setDark = (enabled: boolean) => {
    setIsDark(enabled);
    AsyncStorage.setItem(THEME_KEY, enabled ? 'dark' : 'light');
  };

  const value = useMemo(
    () => ({isDark, ready, setDark}),
    [isDark, ready],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('ThemeProvider missing');
  return value;
}
