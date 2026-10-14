export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'brainwsp_theme';
export const THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)';
const PUBLIC_PATH = /^\/(?:$|login\/?$|register\/?$|terminos\/?$|privacidad\/?$|c(?:\/|$))/;

export function isPublicThemePath(pathname: string) {
  return PUBLIC_PATH.test(pathname);
}

export function parseThemePreference(value: string | null): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean, pathname: string): ResolvedTheme {
  if (isPublicThemePath(pathname)) return 'light';
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}

// Runs synchronously in <head>, before React or any panel content is painted.
// Keep the route rule and storage key shared with the client provider.
export const THEME_INIT_SCRIPT = `(function(){var p='system';try{var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(s==='light'||s==='dark')p=s}catch(e){}var d=false;try{d=window.matchMedia(${JSON.stringify(THEME_MEDIA_QUERY)}).matches}catch(e){}document.documentElement.dataset.theme=${PUBLIC_PATH}.test(location.pathname)?'light':(p==='system'?(d?'dark':'light'):p)})()`;
