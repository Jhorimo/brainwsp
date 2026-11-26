// Formulario de datos del enlace público de Clienera Chat ("/c/<empresa>[/<origen>]"). Nunca
// aplica al widget embebido en un ERP (Contact.source 'widget'): son canales distintos.
// Lógica pura (sin Prisma) para poder probarla con node:test.

export type PrechatFieldMode = 'required' | 'optional' | 'hidden';
export const PRECHAT_FIELD_MODES: PrechatFieldMode[] = ['required', 'optional', 'hidden'];

export type PrechatSettings = {
  enabled: boolean;
  name: PrechatFieldMode;
  email: PrechatFieldMode;
  phone: PrechatFieldMode;
};

type PrechatConfigSource = {
  prechatEnabled?: boolean;
  prechatName?: PrechatFieldMode;
  prechatEmail?: PrechatFieldMode;
  prechatPhone?: PrechatFieldMode;
};

// Por defecto: activo y todo obligatorio. El CORREO es siempre obligatorio (no se configura):
// identifica a la persona — mismo correo = mismo chat (ver WidgetService.saveProfile).
export function resolvePrechat(config?: PrechatConfigSource | null): PrechatSettings {
  const mode = (value: unknown, fallback: PrechatFieldMode) =>
    PRECHAT_FIELD_MODES.includes(value as PrechatFieldMode) ? (value as PrechatFieldMode) : fallback;
  const settings: PrechatSettings = {
    enabled: config?.prechatEnabled ?? true,
    name: mode(config?.prechatName, 'required'),
    email: 'required',
    phone: mode(config?.prechatPhone, 'required'),
  };
  return settings;
}

export function isLinkContact(source?: string | null) {
  return source === 'link' || !!source?.startsWith('link:');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type ProfileInput = { name?: string; email?: string; phone?: string };
export type CleanProfile = { name?: string; email?: string; phone?: string };

// Valida y limpia lo que mandó el visitante según la configuración. Devuelve el primer error
// en texto para mostrarlo tal cual (la página ya valida antes; esto es la red de seguridad).
export function cleanProfile(input: ProfileInput, settings: PrechatSettings): { profile?: CleanProfile; error?: string } {
  const profile: CleanProfile = {};

  const name = (input.name ?? '').replace(/\s+/g, ' ').trim();
  if (settings.name !== 'hidden') {
    if (!name && settings.name === 'required') return { error: 'Escribe tu nombre' };
    if (name && name.length < 2) return { error: 'El nombre es muy corto' };
    if (name.length > 80) return { error: 'El nombre es muy largo' };
    if (name) profile.name = name;
  }

  const email = (input.email ?? '').trim().toLowerCase();
  if (settings.email !== 'hidden') {
    if (!email && settings.email === 'required') return { error: 'Escribe tu correo' };
    if (email && (!EMAIL_RE.test(email) || email.length > 120)) return { error: 'Revisa tu correo, parece incompleto' };
    if (email) profile.email = email;
  }

  // Celular en formato internacional sin "+" (ej. 51987654321), igual que Contact.phone de
  // los contactos de WhatsApp, para poder relacionarlos.
  const phone = (input.phone ?? '').replace(/\D/g, '');
  if (settings.phone !== 'hidden') {
    if (!phone && settings.phone === 'required') return { error: 'Escribe tu celular' };
    if (phone && (phone.length < 8 || phone.length > 15)) return { error: 'Revisa tu celular, el número no está completo' };
    // Perú (+51): celular de 9 dígitos que empieza con 9.
    if (phone.startsWith('51') && !/^519\d{8}$/.test(phone)) return { error: 'Los celulares de Perú tienen 9 dígitos y empiezan con 9' };
    if (phone) profile.phone = phone;
  }

  return { profile };
}
