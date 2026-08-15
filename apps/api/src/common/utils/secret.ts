import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export function hashApiSecret(secret: string): string {
  const pepper = process.env.CREDENTIAL_HASH_PEPPER || 'local-dev-pepper';
  return createHash('sha256').update(`${pepper}:${secret}`).digest('hex');
}

export function verifyApiSecret(secret: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashApiSecret(secret), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function generateApiCredential() {
  return {
    appKey: randomUUID(),
    authKey: randomBytes(36).toString('base64url'),
  };
}
