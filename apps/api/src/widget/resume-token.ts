import { createHmac, timingSafeEqual } from 'node:crypto';

// Enlace "Continuar la conversación" de los correos de Clienera Chat: abre el mismo chat
// desde cualquier dispositivo sin volver a llenar nada. Es una firma HMAC del contacto (no
// se guarda nada en la base), así que no vence: el visitante puede usar un correo de hace
// meses. Lo firma una clave derivada de CREDENTIAL_ENCRYPTION_KEY (ya secreta en producción);
// rotar esa clave invalida todos los enlaces enviados.
function key() {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY || 'local-dev-encryption-key-change-me';
  return createHmac('sha256', secret).update('clienera-resume-v1').digest();
}

function sign(companyId: string, contactId: string) {
  return createHmac('sha256', key()).update(`${companyId}:${contactId}`).digest('base64url').slice(0, 32);
}

export function createResumeToken(companyId: string, contactId: string) {
  return `${contactId}.${sign(companyId, contactId)}`;
}

// Devuelve el contactId si la firma es válida para esa empresa; null si no.
export function verifyResumeToken(companyId: string, token: string | undefined | null): string | null {
  if (!token || token.length > 120) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const contactId = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(companyId, contactId));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return contactId;
}
