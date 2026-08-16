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

  private internalUrl(objectName: string) {
    const scheme = process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http';
    const endpoint = process.env.MINIO_ENDPOINT || 'localhost';
    const port = process.env.MINIO_PORT || '9000';
    return `${scheme}://${endpoint}:${port}/${this.bucket}/${objectName}`;
  }
}
