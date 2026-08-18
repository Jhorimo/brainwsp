import { getContentType, normalizeMessageContent, type WAMessage } from '@whiskeysockets/baileys';
import { MessageType } from '@prisma/client';

export function jidToPhone(jid: string): string | null {
  if (!jid.endsWith('@s.whatsapp.net')) return null;
  return jid.split('@')[0]?.split(':')[0]?.replace(/\D/g, '') || null;
}

export function extensionFromMime(mime?: string): string {
  if (!mime) return 'bin';
  const subtype = mime.split('/')[1]?.split(';')[0]?.trim();
  if (!subtype) return 'bin';
  return subtype.replace(/^x-/, '');
}

// WhatsApp proto encodes byte lengths as `number | Long | null` depending on magnitude;
// the `long` package's Long isn't a plain number, so it needs an explicit conversion.
function toFileSize(value: number | { toNumber(): number } | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  return typeof value === 'number' ? value : value.toNumber();
}

export function extractMessage(message: WAMessage): { type: MessageType; body?: string; caption?: string; fileName?: string; mimeType?: string; fileSize?: number } {
  // Baileys' getContentType only reads the outermost key — messages sent with
  // disappearing messages on, as "view once", or synced from another device arrive
  // wrapped (ephemeralMessage/viewOnceMessage*/deviceSentMessage) and need unwrapping
  // first, otherwise every one of them falls through to UNKNOWN regardless of the real
  // content inside (stickers included — that's the bug this fixes).
  const content = normalizeMessageContent(message.message);
  if (!content) return { type: MessageType.UNKNOWN };

  const type = getContentType(content);
  switch (type) {
    case 'conversation':
      return { type: MessageType.TEXT, body: content.conversation || '' };
    case 'extendedTextMessage':
      return { type: MessageType.TEXT, body: content.extendedTextMessage?.text || '' };
    case 'imageMessage':
      return { type: MessageType.IMAGE, caption: content.imageMessage?.caption || undefined, mimeType: content.imageMessage?.mimetype || undefined, fileSize: toFileSize(content.imageMessage?.fileLength) };
    case 'audioMessage':
      return { type: MessageType.AUDIO, mimeType: content.audioMessage?.mimetype || undefined, fileSize: toFileSize(content.audioMessage?.fileLength) };
    case 'videoMessage':
      return { type: MessageType.VIDEO, caption: content.videoMessage?.caption || undefined, mimeType: content.videoMessage?.mimetype || undefined, fileSize: toFileSize(content.videoMessage?.fileLength) };
    case 'documentMessage':
      return {
        type: MessageType.DOCUMENT,
        caption: content.documentMessage?.caption || undefined,
        fileName: content.documentMessage?.fileName || undefined,
        mimeType: content.documentMessage?.mimetype || undefined,
        fileSize: toFileSize(content.documentMessage?.fileLength),
      };
    case 'stickerMessage':
      return { type: MessageType.STICKER, mimeType: content.stickerMessage?.mimetype || undefined };
    case 'locationMessage':
      return { type: MessageType.LOCATION };
    case 'contactMessage':
    case 'contactsArrayMessage':
      return { type: MessageType.CONTACT };
    default:
      return { type: MessageType.UNKNOWN };
  }
}
