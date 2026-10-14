'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from './theme-provider';
import type { ThemePreference } from '@/lib/theme';

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const Icon = preference === 'system' ? Monitor : preference === 'dark' ? Moon : Sun;
  return (
    <label className="theme-toggle" title="Apariencia del panel">
      <Icon size={16} aria-hidden="true" />
      <select aria-label="Tema del panel" value={preference} onChange={(event) => setPreference(event.target.value as ThemePreference)}>
        <option value="light">Claro</option>
        <option value="dark">Oscuro</option>
        <option value="system">Automático</option>
      </select>
    </label>
  );
}
