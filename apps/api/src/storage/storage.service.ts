import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Client } from 'minio';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly bucket = process.env.MINIO_BUCKET || 'brainwsp-media';
  private readonly client = new Client({
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'brainwsp',
    secretKey: process.env.MINIO_SECRET_KEY || 'brainwsp-local-password',
  });

  async onModuleInit() {
    const exists = await this.client.bucketExists(this.bucket).catch(() => false);
    if (!exists) await this.client.makeBucket(this.bucket);
  }

  async uploadBuffer(buffer: Buffer, mimetype: string, extension: string) {
    const objectName = `${randomUUID()}${extension ? `.${extension}` : ''}`;
    await this.client.putObject(this.bucket, objectName, buffer, buffer.length, {
      'Content-Type': mimetype,
    });
    return { objectName, internalUrl: this.internalUrl(objectName) };
  }

  getObjectStream(objectName: string) {
    return this.client.getObject(this.bucket, objectName);
  }

  // `length` omitted reads through to the end of the object — used for open-ended Range
  // requests like `bytes=12345-`, which `<audio>`/`<video>` elements rely on to seek.
  getPartialObjectStream(objectName: string, offset: number, length?: number) {
    return length === undefined
      ? this.client.getPartialObject(this.bucket, objectName, offset)
      : this.client.getPartialObject(this.bucket, objectName, offset, length);
  }

  async statObject(objectName: string) {
    return this.client.statObject(this.bucket, objectName);
  }

  async removeObject(objectName: string) {
    await this.client.removeObject(this.bucket, objectName);
  }

  // MinIO no falla si algun nombre ya no existe (idempotente) — seguro para reintentar
  // una purga a medias, como el resto de esta app ya asume en otros lados.
  async removeObjects(objectNames: string[]) {
    if (objectNames.length === 0) return;
    await this.client.removeObjects(this.bucket, objectNames);
  }

  private internalUrl(objectName: string) {
    const scheme = process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http';
    const endpoint = process.env.MINIO_ENDPOINT || 'localhost';
    const port = process.env.MINIO_PORT || '9000';
    return `${scheme}://${endpoint}:${port}/${this.bucket}/${objectName}`;
  }
}
