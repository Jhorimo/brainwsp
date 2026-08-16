import { randomUUID } from 'node:crypto';
import { Client } from 'minio';
import { config } from './config.js';

const bucket = config.minio.bucket;
const client = new Client({
  endPoint: config.minio.endpoint,
  port: config.minio.port,
  useSSL: config.minio.useSSL,
  accessKey: config.minio.accessKey,
  secretKey: config.minio.secretKey,
});

export async function ensureBucket() {
  const exists = await client.bucketExists(bucket).catch(() => false);
  if (!exists) await client.makeBucket(bucket);
}

export async function uploadBuffer(buffer: Buffer, mimetype: string, extension: string) {
  const objectName = `${randomUUID()}${extension ? `.${extension}` : ''}`;
  await client.putObject(bucket, objectName, buffer, buffer.length, { 'Content-Type': mimetype });
  const scheme = config.minio.useSSL ? 'https' : 'http';
  return { objectName, internalUrl: `${scheme}://${config.minio.endpoint}:${config.minio.port}/${bucket}/${objectName}` };
}

// The MinIO bucket is private, so WhatsApp's own servers (and Baileys, when it
// fetches a `{ url }` media source) can't read `mediaUrl` directly — it 403s.
// Outbound sends must download the object through this authenticated client
// and hand Baileys the raw buffer instead.
export async function downloadObjectBuffer(objectName: string): Promise<Buffer> {
  const stream = await client.getObject(bucket, objectName);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

export function objectNameFromUrl(url: string): string {
  return url.split('/').pop() as string;
}
