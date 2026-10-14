'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from './theme-provider';

export function ThemeToggle() {
  const { theme, setPreference } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      className="theme-toggle"
      type="button"
      role="switch"
      aria-label="Modo oscuro"
      aria-checked={dark}
      title={dark ? 'Activar modo claro' : 'Activar modo oscuro'}
      onClick={() => setPreference(dark ? 'light' : 'dark')}
    >
      <span className="theme-toggle-thumb" aria-hidden="true" />
      <Sun className="theme-toggle-sun" size={16} aria-hidden="true" />
      <Moon className="theme-toggle-moon" size={16} aria-hidden="true" />
    </button>
  );
}
