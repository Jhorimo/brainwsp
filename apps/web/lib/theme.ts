export type ThemePreference = 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'brainwsp_theme';
const PUBLIC_PATH = /^\/(?:$|login\/?$|register\/?$|terminos\/?$|privacidad\/?$|c(?:\/|$))/;

export function isPublicThemePath(pathname: string) {
  return PUBLIC_PATH.test(pathname);
}

export function parseThemePreference(value: string | null): ThemePreference {
  return value === 'dark' ? 'dark' : 'light';
}

export function resolveTheme(preference: ThemePreference, pathname: string): ResolvedTheme {
  if (isPublicThemePath(pathname)) return 'light';
  return preference;
}

// Runs synchronously in <head>, before React or any panel content is painted.
// Keep the route rule and storage key shared with the client provider.
export const THEME_INIT_SCRIPT = `(function(){var p='light';try{if(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})==='dark')p='dark'}catch(e){}document.documentElement.dataset.theme=${PUBLIC_PATH}.test(location.pathname)?'light':p})()`;
