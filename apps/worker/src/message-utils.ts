import { getContentType, type WAMessage } from '@whiskeysockets/baileys';
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

export function extractMessage(message: WAMessage): { type: MessageType; body?: string; caption?: string; fileName?: string; mimeType?: string } {
  const content = message.message;
  if (!content) return { type: MessageType.UNKNOWN };

  const type = getContentType(content);
  switch (type) {
    case 'conversation':
      return { type: MessageType.TEXT, body: content.conversation || '' };
    case 'extendedTextMessage':
      return { type: MessageType.TEXT, body: content.extendedTextMessage?.text || '' };
    case 'imageMessage':
      return { type: MessageType.IMAGE, caption: content.imageMessage?.caption || undefined, mimeType: content.imageMessage?.mimetype || undefined };
    case 'audioMessage':
      return { type: MessageType.AUDIO, mimeType: content.audioMessage?.mimetype || undefined };
    case 'videoMessage':
      return { type: MessageType.VIDEO, caption: content.videoMessage?.caption || undefined, mimeType: content.videoMessage?.mimetype || undefined };
    case 'documentMessage':
      return {
        type: MessageType.DOCUMENT,
        caption: content.documentMessage?.caption || undefined,
        fileName: content.documentMessage?.fileName || undefined,
        mimeType: content.documentMessage?.mimetype || undefined,
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
