import type { PrismaClient } from '@prisma/client';
import { jidToPhone } from './message-utils.js';

// Baileys guarda en WhatsAppAuthKey (type 'lid-mapping') la equivalencia que WhatsApp le da
// entre el @lid opaco de un cliente y su número: keyId '<numero>' -> '"<lid>"' y
// '<lid>_reverse' -> '"<numero>"'. Un mensaje puede llegar con una sola de las dos formas (o con
// la otra en remoteJidAlt), y buscar el contacto solo por la que vino creaba un segundo contacto
// para el mismo cliente. Se busca en todas las líneas de la empresa porque el contacto es por
// empresa, no por línea.
export async function completeLidPair(
  prisma: PrismaClient,
  companyId: string,
  jids: string[],
): Promise<{ lidJid: string | null; phoneJid: string | null }> {
  let lidJid = jids.find((jid) => jid.endsWith('@lid')) ?? null;
  let phoneJid = jids.find((jid) => jidToPhone(jid)) ?? null;
  if ((lidJid && phoneJid) || (!lidJid && !phoneJid)) return { lidJid, phoneJid };

  const keyId = lidJid ? `${lidJid.split('@')[0]}_reverse` : jidToPhone(phoneJid!)!;
  const row = await prisma.whatsAppAuthKey.findFirst({
    where: { type: 'lid-mapping', keyId, instance: { companyId } },
    select: { data: true },
  });
  const other = row ? JSON.parse(row.data) : null;
  if (typeof other !== 'string' || !/^\d+$/.test(other)) return { lidJid, phoneJid };
  if (lidJid) phoneJid = `${other}@s.whatsapp.net`;
  else lidJid = `${other}@lid`;
  return { lidJid, phoneJid };
}
