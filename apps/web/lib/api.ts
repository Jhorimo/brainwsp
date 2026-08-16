export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';

export function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('brainwsp_token') || '';
}

export function mediaUrl(messageId: string) {
  return `${API_URL}/media/${messageId}?token=${encodeURIComponent(getToken())}`;
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
    localStorage.removeItem('brainwsp_token');
    localStorage.removeItem('brainwsp_user');
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
