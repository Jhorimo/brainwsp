import { Facebook, Instagram, Link2, Mail, MessageCircle, Music2, QrCode, Tag, type LucideIcon } from 'lucide-react';

// Orígenes del enlace público de Clienera Chat ("/c/<empresa>/<origen>"). El backend guarda
// el origen en Contact.source como "link:<origen>" (ver apps/api/src/widget/link-source.ts);
// el widget embebido en un ERP es otro canal y queda como 'widget'.
export type LinkSourcePreset = { id: string; label: string; icon: LucideIcon; hint: string };

export const LINK_SOURCE_PRESETS: LinkSourcePreset[] = [
  { id: '', label: 'General', icon: Link2, hint: 'Para cualquier lugar' },
  { id: 'instagram', label: 'Instagram', icon: Instagram, hint: 'Bio, historias o mensajes' },
  { id: 'facebook', label: 'Facebook', icon: Facebook, hint: 'Página, Messenger o posts' },
  { id: 'tiktok', label: 'TikTok', icon: Music2, hint: 'Perfil o mensajes' },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, hint: 'Estados o grupos' },
  { id: 'correo', label: 'Correo', icon: Mail, hint: 'Firma o campañas' },
  { id: 'qr', label: 'QR impreso', icon: QrCode, hint: 'Volantes, local o tarjetas' },
];

const MAX_LENGTH = 32;

// Mismo algoritmo que normalizeLinkSource del API, para que el enlace que se copia en el
// panel sea exactamente el origen que después se guarda.
export function normalizeLinkSource(raw?: string | null): string {
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LENGTH)
    .replace(/-+$/g, '');
}

export function buildShareLink(siteUrl: string, companySlug: string, src: string) {
  const base = `${siteUrl.replace(/\/+$/, '')}/c/${companySlug}`;
  return src ? `${base}/${src}` : base;
}

// Contact.source / Lead.source → etiqueta legible. null si no es un contacto del enlace.
export function linkSourceInfo(source?: string | null): { label: string; icon: LucideIcon } | null {
  if (!source || (source !== 'link' && !source.startsWith('link:'))) return null;
  const id = source === 'link' ? '' : source.slice(5);
  const preset = LINK_SOURCE_PRESETS.find((p) => p.id === id);
  if (preset) return { label: id ? preset.label : 'Enlace', icon: preset.icon };
  return { label: id.replace(/-/g, ' '), icon: Tag };
}

// Texto corto para listados (Lead.source también puede ser 'widget', 'whatsapp', etc.).
export function sourceLabel(source?: string | null): string {
  if (!source) return '';
  const info = linkSourceInfo(source);
  if (info) return `Enlace · ${info.label}`;
  if (source === 'widget') return 'Widget web';
  return source;
}
