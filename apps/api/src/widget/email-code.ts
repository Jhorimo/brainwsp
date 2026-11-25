import { randomInt } from 'node:crypto';
import { hashApiSecret } from '../common/utils/secret';
import { escapeHtml } from './reply-email';

// Código de 6 dígitos para volver a un chat de Clienera Chat desde otro dispositivo (ver
// VisitorEmailCode en schema.prisma). Funciones puras para poder probarlas.
export const CODE_TTL_MS = 10 * 60 * 1000;
export const CODE_MAX_ATTEMPTS = 5;
export const CODE_RESEND_MS = 60 * 1000;
export const CODE_MAX_PER_HOUR = 5;

export function generateCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

// Atado a la sesión que lo pidió: el mismo código no sirve desde otro navegador.
export function hashCode(sessionId: string, code: string) {
  return hashApiSecret(`visitor-email-code:${sessionId}:${code}`);
}

export function normalizeCode(raw: string) {
  return raw.replace(/\D/g, '').slice(0, 6);
}

// "maria.lopez@gmail.com" → "m•••z@gmail.com" (lo suficiente para reconocer su correo).
export function maskEmail(email: string) {
  const [user, domain] = email.split('@');
  if (!user || !domain) return email;
  const masked = user.length <= 2 ? `${user[0]}•••` : `${user[0]}•••${user[user.length - 1]}`;
  return `${masked}@${domain}`;
}

export function buildCodeEmail(input: { companyName: string; color: string; code: string }) {
  const company = input.companyName.trim() || 'Nuestro equipo';
  const color = /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : '#3554d1';
  const pretty = `${input.code.slice(0, 3)} ${input.code.slice(3)}`;
  const subject = `${input.code} es tu código para volver a tu chat con ${company}`;
  const text = [
    `Tu código para volver a tu conversación con ${company} es: ${pretty}`,
    '',
    'Vence en 10 minutos.',
    'Si no fuiste tú, ignora este correo: nadie podrá ver tu conversación sin este código.',
  ].join('\n');
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#eef1f7;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f7;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden">
        <tr><td style="background:${color};height:6px;line-height:6px;font-size:0">&nbsp;</td></tr>
        <tr><td style="padding:26px 26px 8px">
          <div style="font-size:13px;color:#5f6678;font-weight:bold;text-transform:uppercase;letter-spacing:.5px">${escapeHtml(company)}</div>
          <h1 style="margin:8px 0 6px;font-size:21px;line-height:1.3;color:#1a1f2b">Tu código para volver a tu chat</h1>
          <p style="margin:0;font-size:15px;line-height:1.5;color:#3d4557">Escríbelo en la página del chat para ver tu conversación.</p>
        </td></tr>
        <tr><td align="center" style="padding:18px 26px">
          <div style="display:inline-block;font-size:34px;letter-spacing:8px;font-weight:bold;color:#1a1f2b;background:#f3f5f9;border-radius:12px;padding:14px 22px;font-family:'Courier New',monospace">${escapeHtml(pretty)}</div>
          <p style="margin:12px 0 0;font-size:13px;color:#5f6678">Vence en 10 minutos.</p>
        </td></tr>
        <tr><td style="padding:14px 26px 22px;border-top:1px solid #e6e9f0;font-size:12px;line-height:1.5;color:#5f6678">
          Si no fuiste tú, ignora este correo: nadie podrá ver tu conversación sin este código.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  return { subject, html, text };
}
