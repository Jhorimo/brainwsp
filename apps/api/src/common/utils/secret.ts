import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export function hashApiSecret(secret: string): string {
  const pepper = process.env.CREDENTIAL_HASH_PEPPER || 'local-dev-pepper';
  return createHash('sha256').update(`${pepper}:${secret}`).digest('hex');
}

export function verifyApiSecret(secret: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashApiSecret(secret), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Reversible AES-256-GCM encryption so the AUTH KEY can be shown again from the panel
// ("ver AUTH KEY"), separate from `hashApiSecret` above which stays irreversible and is
// what actually authenticates incoming API requests — this key only guards a display path.
function encryptionKey(): Buffer {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY || 'local-dev-encryption-key-change-me';
  return createHash('sha256').update(secret).digest();
}

export function encryptApiSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((buf) => buf.toString('base64')).join('.');
}

export function decryptApiSecret(encrypted: string): string {
  const [ivB64, tagB64, dataB64] = encrypted.split('.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

export function generateAuthKey(): string {
  return randomBytes(36).toString('base64url');
}

export function generateApiCredential() {
  return {
    appKey: randomUUID(),
    authKey: generateAuthKey(),
  };
}
