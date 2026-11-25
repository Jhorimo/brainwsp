import { createHash } from 'node:crypto';
import { getContentType, getUrlFromDirectPath, normalizeMessageContent, type proto } from '@whiskeysockets/baileys';

// Recuperación de adjuntos entrantes que no se pudieron guardar al llegar (el panel mostraba
// "Imagen no disponible"). Dos casos, confirmados en producción el 26/11/2026:
//  1. Canales de WhatsApp (@newsletter): su multimedia NO va cifrada, llega sin mediaKey y
//     Baileys siempre intenta descifrar ("Cannot derive from empty media key"). Se descarga
//     tal cual desde directPath y se verifica con fileSha256.
//  2. Fallos de red/WhatsApp al descargar ("fetch failed", enlace vencido): se reintenta más
//     tarde con la clave guardada en metadata.rawContent (y reupload desde el celular).
// Funciones puras aquí; el reintento con socket vive en SessionManager.

export const MEDIA_RETRY_DELAYS_MS = [2, 10, 30, 120, 360].map((min) => min * 60 * 1000);
export const MAX_MEDIA_RETRIES = MEDIA_RETRY_DELAYS_MS.length;

// Datos que se guardan en Message.metadata cuando falla la descarga.
export type MediaFailureMeta = { mediaError: string; mediaRetries: number; mediaRetryAt: string | null };

export function isNewsletterJid(jid?: string | null) {
  return !!jid && jid.endsWith('@newsletter');
}

type MediaNode = { directPath?: string | null; url?: string | null; mediaKey?: Uint8Array | null; fileSha256?: Uint8Array | null };

// El nodo multimedia (imageMessage, videoMessage, …) ya desenvuelto.
export function mediaNode(message: proto.IMessage | null | undefined): MediaNode | null {
  const content = normalizeMessageContent(message);
  if (!content) return null;
  const type = getContentType(content);
  if (!type) return null;
  const node = content[type] as MediaNode | null | undefined;
  return node && (node.directPath || node.url) ? node : null;
}

export function hasMediaKey(node: MediaNode | null) {
  return !!node?.mediaKey && node.mediaKey.length > 0;
}

// Multimedia sin cifrar (canales): GET directo y verificación del hash que trae el mensaje.
export async function downloadPlainMedia(node: MediaNode, fetchImpl: typeof fetch = fetch): Promise<Buffer> {
  const url = node.directPath ? getUrlFromDirectPath(node.directPath) : node.url;
  if (!url) throw new Error('el mensaje no trae enlace de descarga');
  const response = await fetchImpl(url, { headers: { Origin: 'https://web.whatsapp.com' }, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`descarga directa respondió ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (node.fileSha256?.length) {
    const actual = createHash('sha256').update(buffer).digest();
    if (!actual.equals(Buffer.from(node.fileSha256))) throw new Error('el archivo descargado no coincide con el hash del mensaje');
  }
  return buffer;
}

// Próximo reintento: 2 min, 10 min, 30 min, 2 h, 6 h; después ya no (null).
export function nextRetryAt(retries: number, now = Date.now()): string | null {
  const delay = MEDIA_RETRY_DELAYS_MS[retries - 1];
  return delay === undefined ? null : new Date(now + delay).toISOString();
}

export function failureMeta(error: unknown, previousRetries: number, now = Date.now()): MediaFailureMeta {
  const retries = previousRetries + 1;
  const message = error instanceof Error ? error.message : String(error);
  return { mediaError: message.slice(0, 200), mediaRetries: retries, mediaRetryAt: retries > MAX_MEDIA_RETRIES ? null : nextRetryAt(retries, now) };
}
