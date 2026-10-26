// Países del selector de "Nuevo chat". `min`/`max` son los dígitos del número nacional (sin el
// código), para avisar antes de enviar: un número sin código de país (ej. 987654321) se manda a un
// destino que no existe y WhatsApp lo deja en "enviado" para siempre, sin error.
export type PhoneCountry = { iso: string; name: string; dial: string; min: number; max: number; startsWith?: string; mobilePrefix?: string };

export const DEFAULT_COUNTRY = 'PE';
export const OTHER_COUNTRY = 'other';

export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: 'PE', name: 'Perú', dial: '51', min: 9, max: 9, startsWith: '9' },
  // WhatsApp identifica los celulares argentinos como 54 9 + 10 dígitos.
  { iso: 'AR', name: 'Argentina', dial: '54', min: 10, max: 11, mobilePrefix: '9' },
  { iso: 'BO', name: 'Bolivia', dial: '591', min: 8, max: 8 },
  { iso: 'BR', name: 'Brasil', dial: '55', min: 10, max: 11 },
  { iso: 'CL', name: 'Chile', dial: '56', min: 9, max: 9 },
  { iso: 'CO', name: 'Colombia', dial: '57', min: 10, max: 10 },
  { iso: 'CR', name: 'Costa Rica', dial: '506', min: 8, max: 8 },
  { iso: 'CU', name: 'Cuba', dial: '53', min: 8, max: 8 },
  { iso: 'EC', name: 'Ecuador', dial: '593', min: 9, max: 9 },
  { iso: 'SV', name: 'El Salvador', dial: '503', min: 8, max: 8 },
  { iso: 'ES', name: 'España', dial: '34', min: 9, max: 9 },
  { iso: 'US', name: 'EE. UU. / Canadá', dial: '1', min: 10, max: 10 },
  { iso: 'GT', name: 'Guatemala', dial: '502', min: 8, max: 8 },
  { iso: 'HN', name: 'Honduras', dial: '504', min: 8, max: 8 },
  { iso: 'IT', name: 'Italia', dial: '39', min: 9, max: 10 },
  { iso: 'MX', name: 'México', dial: '52', min: 10, max: 10 },
  { iso: 'NI', name: 'Nicaragua', dial: '505', min: 8, max: 8 },
  { iso: 'PA', name: 'Panamá', dial: '507', min: 8, max: 8 },
  { iso: 'PY', name: 'Paraguay', dial: '595', min: 9, max: 9 },
  { iso: 'DO', name: 'Rep. Dominicana', dial: '1', min: 10, max: 10 },
  { iso: 'UY', name: 'Uruguay', dial: '598', min: 8, max: 8 },
  { iso: 'VE', name: 'Venezuela', dial: '58', min: 10, max: 10 },
];

export type PhoneParts = { country: string; customDial: string; national: string };

// Separa un número completo (ej. el de un mensaje o el de un autor de grupo) en país + número
// nacional. Un celular peruano escrito sin código (9 dígitos que empiezan con 9) se toma como Perú.
export function splitPhone(raw: string): PhoneParts {
  const digits = raw.replace(/\D/g, '');
  if (/^9\d{8}$/.test(digits)) return { country: DEFAULT_COUNTRY, customDial: '', national: digits };
  const match = [...PHONE_COUNTRIES]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((item) => {
      const size = digits.length - item.dial.length;
      return digits.startsWith(item.dial) && size >= item.min && size <= item.max;
    });
  if (match) return { country: match.iso, customDial: '', national: digits.slice(match.dial.length) };
  if (digits.length > 9) return { country: OTHER_COUNTRY, customDial: '', national: digits };
  return { country: DEFAULT_COUNTRY, customDial: '', national: digits };
}

// Número completo (código + nacional) listo para enviar, o el motivo por el que no es válido.
export function buildPhone({ country, customDial, national: rawNational }: PhoneParts): { phone?: string; error?: string } {
  const national = rawNational.replace(/\D/g, '');
  if (country === OTHER_COUNTRY) {
    const code = customDial.replace(/\D/g, '');
    if (!code) return { error: 'Escribe el código de país' };
    const phone = national.startsWith(code) && national.length > 9 ? national : code + national;
    if (phone.length < 8 || phone.length > 15) return { error: 'El número completo debe tener entre 8 y 15 dígitos' };
    return { phone };
  }
  const item = PHONE_COUNTRIES.find((entry) => entry.iso === country);
  if (!item) return { error: 'Selecciona el país' };
  if (!national) return { error: 'Escribe el número' };
  if (national.length < item.min || national.length > item.max) {
    const size = item.min === item.max ? `${item.min}` : `${item.min} a ${item.max}`;
    return { error: `Los números de ${item.name} tienen ${size} dígitos (sin el +${item.dial})` };
  }
  if (item.startsWith && !national.startsWith(item.startsWith)) {
    return { error: `Los celulares de ${item.name} empiezan con ${item.startsWith}` };
  }
  const withPrefix = item.mobilePrefix && national.length === item.min ? item.mobilePrefix + national : national;
  return { phone: item.dial + withPrefix };
}
