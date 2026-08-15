import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationState,
  type SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import type { PrismaClient } from '@prisma/client';

export async function usePrismaAuthState(prisma: PrismaClient, instanceId: string): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  clear: () => Promise<void>;
}> {
  const stored = await prisma.whatsAppAuthCredential.findUnique({ where: { instanceId } });
  const creds = stored ? JSON.parse(stored.data, BufferJSON.reviver) : initAuthCreds();

  const state: AuthenticationState = {
    creds,
    keys: {
      get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
        const result: { [id: string]: SignalDataTypeMap[T] } = {};
        const rows = await prisma.whatsAppAuthKey.findMany({
          where: { instanceId, type: String(type), keyId: { in: ids } },
        });

        for (const row of rows) {
          let value = JSON.parse(row.data, BufferJSON.reviver);
          if (type === 'app-state-sync-key' && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(value);
          }
          result[row.keyId] = value as SignalDataTypeMap[T];
        }
        return result;
      },
      set: async (data) => {
        const operations: Promise<unknown>[] = [];
        for (const category of Object.keys(data) as (keyof SignalDataTypeMap)[]) {
          const values = data[category];
          if (!values) continue;
          for (const [keyId, value] of Object.entries(values)) {
            if (value) {
              operations.push(
                prisma.whatsAppAuthKey.upsert({
                  where: { instanceId_type_keyId: { instanceId, type: String(category), keyId } },
                  update: { data: JSON.stringify(value, BufferJSON.replacer) },
                  create: { instanceId, type: String(category), keyId, data: JSON.stringify(value, BufferJSON.replacer) },
                }),
              );
            } else {
              operations.push(
                prisma.whatsAppAuthKey.deleteMany({ where: { instanceId, type: String(category), keyId } }),
              );
            }
          }
        }
        await Promise.all(operations);
      },
    },
  };

  return {
    state,
    saveCreds: async () => {
      await prisma.whatsAppAuthCredential.upsert({
        where: { instanceId },
        update: { data: JSON.stringify(state.creds, BufferJSON.replacer) },
        create: { instanceId, data: JSON.stringify(state.creds, BufferJSON.replacer) },
      });
    },
    clear: async () => {
      await prisma.$transaction([
        prisma.whatsAppAuthKey.deleteMany({ where: { instanceId } }),
        prisma.whatsAppAuthCredential.deleteMany({ where: { instanceId } }),
      ]);
    },
  };
}
