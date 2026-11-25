// Origen del enlace público de Clienera Chat ("/c/<empresa>/<origen>", ej. instagram, tiktok,
// volante-noviembre). Llega del navegador sin autenticar, así que se normaliza a un slug
// corto y seguro antes de guardarlo en Contact.source como "link:<origen>". El widget
// embebido en un ERP sigue usando source 'widget' y nunca pasa por aquí: son canales
// distintos aunque compartan la página.
const MAX_LENGTH = 32;

export function normalizeLinkSource(raw?: string | null): string | null {
  if (!raw) return null;
  const slug = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LENGTH)
    .replace(/-+$/g, '');
  return slug || null;
}

export function linkContactSource(raw?: string | null): string {
  const src = normalizeLinkSource(raw);
  return src ? `link:${src}` : 'link';
}
