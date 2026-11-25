import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { downloadPlainMedia, failureMeta, hasMediaKey, isNewsletterJid, mediaNode, nextRetryAt } from './media-recovery.js';

test('detecta canales', () => {
  assert.equal(isNewsletterJid('120363000000000000@newsletter'), true);
  assert.equal(isNewsletterJid('51999888777@s.whatsapp.net'), false);
  assert.equal(isNewsletterJid('120363407712729513@g.us'), false);
  assert.equal(isNewsletterJid(undefined), false);
});

test('encuentra el nodo multimedia, también envuelto', () => {
  const plain = mediaNode({ imageMessage: { directPath: '/v/t62/abc', url: 'https://mmg.whatsapp.net/x' } });
  assert.equal(plain?.directPath, '/v/t62/abc');
  const wrapped = mediaNode({ ephemeralMessage: { message: { videoMessage: { directPath: '/v/vid' } } } });
  assert.equal(wrapped?.directPath, '/v/vid');
  assert.equal(mediaNode({ conversation: 'hola' }), null);
  assert.equal(hasMediaKey(plain), false);
  assert.equal(hasMediaKey({ mediaKey: new Uint8Array([1, 2]) }), true);
  assert.equal(hasMediaKey({ mediaKey: new Uint8Array([]) }), false);
});

test('descarga directa verifica el hash', async () => {
  const body = Buffer.from('imagen de canal');
  const sha = createHash('sha256').update(body).digest();
  const okFetch = (async (url: string) => {
    assert.equal(url, 'https://mmg.whatsapp.net/v/t62/abc');
    return new Response(body);
  }) as unknown as typeof fetch;
  const buffer = await downloadPlainMedia({ directPath: '/v/t62/abc', fileSha256: sha }, okFetch);
  assert.equal(buffer.toString(), 'imagen de canal');

  const otherFetch = (async () => new Response(Buffer.from('otra cosa'))) as unknown as typeof fetch;
  await assert.rejects(downloadPlainMedia({ directPath: '/v/t62/abc', fileSha256: sha }, otherFetch), /no coincide/);
  const notFound = (async () => new Response('x', { status: 404 })) as unknown as typeof fetch;
  await assert.rejects(downloadPlainMedia({ directPath: '/v/t62/abc' }, notFound), /404/);
});

test('reintentos espaciados y con tope', () => {
  const now = Date.parse('2026-11-26T12:00:00Z');
  assert.equal(nextRetryAt(1, now), '2026-11-26T12:02:00.000Z');
  assert.equal(nextRetryAt(5, now), '2026-11-26T18:00:00.000Z');
  assert.equal(nextRetryAt(6, now), null);
  assert.deepEqual(failureMeta(new Error('fetch failed'), 0, now), { mediaError: 'fetch failed', mediaRetries: 1, mediaRetryAt: '2026-11-26T12:02:00.000Z' });
  assert.equal(failureMeta('x', 5, now).mediaRetryAt, null);
});
