import type { PrismaService } from '../../prisma/prisma.service';

// waId con el que la empresa ya tiene guardado a este número, o null si es un contacto nuevo.
// WhatsApp puede tenerlo como un @lid opaco (ver session-manager del worker), y armar siempre
// '<numero>@s.whatsapp.net' creaba un segundo contacto para alguien ya conocido. Además del
// teléfono guardado, se usa la equivalencia número -> @lid que Baileys guarda en
// WhatsAppAuthKey (type 'lid-mapping', keyId '<numero>' -> '"<lid>"'), porque un contacto @lid
// antiguo puede no tener el teléfono guardado. Se excluyen las filas @broadcast, que comparten
// el teléfono legítimamente.
export async function findExistingContactWaId(prisma: PrismaService, companyId: string, phone: string): Promise<string | null> {
  const mapping = await prisma.whatsAppAuthKey.findFirst({
    where: { type: 'lid-mapping', keyId: phone, instance: { companyId } },
    select: { data: true },
  });
  const lid = mapping ? JSON.parse(mapping.data) : null;
  const existing = await prisma.contact.findFirst({
    where: {
      companyId,
      OR: [
        { phone, waId: { not: { endsWith: '@broadcast' } } },
        { waId: `${phone}@s.whatsapp.net` },
        ...(typeof lid === 'string' && /^\d+$/.test(lid) ? [{ waId: `${lid}@lid` }] : []),
      ],
    },
    // El más antiguo es el que lleva el historial.
    orderBy: { createdAt: 'asc' },
    select: { waId: true },
  });
  return existing?.waId ?? null;
}
