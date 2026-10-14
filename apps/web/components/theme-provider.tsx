'use client';

import { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { parseThemePreference, resolveTheme, THEME_MEDIA_QUERY, THEME_STORAGE_KEY, type ResolvedTheme, type ThemePreference } from '@/lib/theme';

type ThemeContextValue = {
  preference: ThemePreference;
  theme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [theme, setTheme] = useState<ResolvedTheme>('light');
  const preferenceRef = useRef<ThemePreference>('system');
  const initialized = useRef(false);

  const apply = (next: ThemePreference) => {
    const resolved = resolveTheme(next, window.matchMedia(THEME_MEDIA_QUERY).matches, pathname);
    document.documentElement.dataset.theme = resolved;
    setTheme(resolved);
  };

  const setPreference = (next: ThemePreference) => {
    preferenceRef.current = next;
    setPreferenceState(next);
    try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* In-memory preference still works. */ }
    apply(next);
  };

  // Layout effect also handles soft navigation public <-> panel before the next paint.
  useLayoutEffect(() => {
    if (!initialized.current) {
      try { preferenceRef.current = parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY)); } catch {}
      initialized.current = true;
      setPreferenceState(preferenceRef.current);
    }
    const media = window.matchMedia(THEME_MEDIA_QUERY);
    const sync = () => {
      const resolved = resolveTheme(preferenceRef.current, media.matches, pathname);
      document.documentElement.dataset.theme = resolved;
      setTheme(resolved);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      // Ignore sessionStorage events, without requiring access to localStorage.
      if (event.storageArea !== null) {
        try { if (event.storageArea !== window.localStorage) return; } catch { return; }
      }
      preferenceRef.current = parseThemePreference(event.newValue);
      setPreferenceState(preferenceRef.current);
      sync();
    };
    sync();
    media.addEventListener('change', sync);
    window.addEventListener('storage', onStorage);
    return () => {
      media.removeEventListener('change', sync);
      window.removeEventListener('storage', onStorage);
    };
  }, [pathname]);

  return <ThemeContext.Provider value={{ preference, theme, setPreference }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme requires ThemeProvider');
  return context;
}
