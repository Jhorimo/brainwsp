export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';

const AUTH_KEYS = ['brainwsp_token', 'brainwsp_user', 'brainwsp_company'] as const;

// "Recuérdame" decide dónde vive la sesión: localStorage (persiste entre reinicios del
// navegador) o sessionStorage (se borra al cerrar la pestaña/navegador). Se lee de ambos
// storages porque distintas partes de la app (login, registro, impersonación) escriben
// con distinta persistencia, y cualquiera de las dos puede tener la sesión vigente.
function readAuthItem(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(key) ?? localStorage.getItem(key);
}

function writeAuthItem(key: string, value: string, persist: boolean) {
  (persist ? localStorage : sessionStorage).setItem(key, value);
  (persist ? sessionStorage : localStorage).removeItem(key);
}

export function getToken() {
  return readAuthItem('brainwsp_token') || '';
}

export function getStoredUser<T = Record<string, unknown>>(): T {
  try { return JSON.parse(readAuthItem('brainwsp_user') || '{}') as T; } catch { return {} as T; }
}

export function getStoredCompany<T = Record<string, unknown>>(): T {
  try { return JSON.parse(readAuthItem('brainwsp_company') || '{}') as T; } catch { return {} as T; }
}

export function setAuthSession(data: { accessToken: string; user: unknown; company?: unknown }, persist: boolean) {
  writeAuthItem('brainwsp_token', data.accessToken, persist);
  writeAuthItem('brainwsp_user', JSON.stringify(data.user), persist);
  if (data.company !== undefined) writeAuthItem('brainwsp_company', JSON.stringify(data.company), persist);
}

// Patches the stored user/company object in place (same storage it was already in) so a
// profile edit shows up immediately without forcing a re-login to refresh the JWT payload.
function patchAuthItem(key: string, patch: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  const persist = localStorage.getItem(key) !== null;
  const current = JSON.parse(readAuthItem(key) || '{}');
  writeAuthItem(key, JSON.stringify({ ...current, ...patch }), persist);
}

export function updateStoredUser(patch: Record<string, unknown>) { patchAuthItem('brainwsp_user', patch); }
export function updateStoredCompany(patch: Record<string, unknown>) { patchAuthItem('brainwsp_company', patch); }

export function clearAuthSession() {
  for (const key of AUTH_KEYS) { localStorage.removeItem(key); sessionStorage.removeItem(key); }
}

const IMPERSONATOR_PREFIX = 'brainwsp_impersonator_';

// Al entrar como "soporte" al panel de un cliente (SUPERADMIN → OWNER de otra empresa),
// respaldamos la sesión actual bajo un prefijo aparte antes de reemplazarla, para poder
// restaurarla con un clic en vez de forzar un logout/login manual (ver stopImpersonation).
export function startImpersonation(session: { accessToken: string; user: unknown; company?: unknown }) {
  for (const key of AUTH_KEYS) {
    const value = readAuthItem(key);
    if (value) localStorage.setItem(IMPERSONATOR_PREFIX + key, value);
  }
  setAuthSession(session, true);
}

export function isImpersonating() {
  return typeof window !== 'undefined' && !!localStorage.getItem(IMPERSONATOR_PREFIX + 'brainwsp_token');
}

export function stopImpersonation() {
  for (const key of AUTH_KEYS) {
    const backupKey = IMPERSONATOR_PREFIX + key;
    const backup = localStorage.getItem(backupKey);
    if (backup) localStorage.setItem(key, backup);
    sessionStorage.removeItem(key);
    localStorage.removeItem(backupKey);
  }
}

export function mediaUrl(messageId: string) {
  return `${API_URL}/media/${messageId}?token=${encodeURIComponent(getToken())}`;
}

export function stickerFileUrl(stickerId: string) {
  return `${API_URL}/stickers/${stickerId}/file?token=${encodeURIComponent(getToken())}`;
}

export function quickReplyFileUrl(quickReplyId: string) {
  return `${API_URL}/quick-replies/${quickReplyId}/file?token=${encodeURIComponent(getToken())}`;
}

// Turns a quick reply's stored attachment back into a real File, so it can flow through
// the same attach-and-send composer path as a freshly picked file.
export async function fetchAsFile(url: string, fileName: string, mimeType: string): Promise<File> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!response.ok) throw new Error('No se pudo obtener el archivo');
  const blob = await response.blob();
  return new File([blob], fileName, { type: mimeType });
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });

  if (response.status === 401 && typeof window !== 'undefined') {
    clearAuthSession();
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const data = await response.json();
      detail = Array.isArray(data.message) ? data.message.join(', ') : data.message || detail;
    } catch {}
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}
