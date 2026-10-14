import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { parseThemePreference, resolveTheme, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from './theme';

function bootstrap(pathname: string, saved: string | null, systemDark: boolean, storageBlocked = false) {
  const root = { dataset: { theme: 'light' } };
  runInNewContext(THEME_INIT_SCRIPT, {
    document: { documentElement: root },
    location: { pathname },
    window: { matchMedia: () => ({ matches: systemDark }) },
    localStorage: { getItem: (key: string) => {
      assert.equal(key, THEME_STORAGE_KEY);
      if (storageBlocked) throw new Error('Storage disabled');
      return saved;
    } },
  });
  return root.dataset.theme;
}

test('a saved dark preference applies before hydration, regardless of the system', () => {
  assert.equal(bootstrap('/conversations', 'dark', false), 'dark');
  assert.equal(bootstrap('/admin/settings', 'dark', false), 'dark');
});

test('light is the default even when the system prefers dark', () => {
  assert.equal(bootstrap('/dashboard', null, true), 'light');
  assert.equal(bootstrap('/dashboard', 'light', true), 'light');
  assert.equal(resolveTheme('light', '/dashboard'), 'light');
  assert.equal(resolveTheme('dark', '/dashboard'), 'dark');
});

test('public pages stay light while the saved panel preference remains dark', () => {
  for (const path of ['/', '/login', '/register', '/terminos', '/privacidad', '/c/demo']) {
    assert.equal(bootstrap(path, 'dark', true), 'light', path);
    assert.equal(resolveTheme('dark', path), 'light', path);
  }
  assert.equal(bootstrap('/automations/demo', 'dark', false), 'dark');
});

test('missing, legacy automatic, invalid, or inaccessible storage falls back to light', () => {
  for (const saved of [null, '', 'system', 'invalid']) {
    assert.equal(parseThemePreference(saved), 'light');
    assert.equal(bootstrap('/instances', saved, true), 'light');
    assert.equal(bootstrap('/instances', saved, false), 'light');
  }
  assert.equal(bootstrap('/instances', null, true, true), 'light');
});
