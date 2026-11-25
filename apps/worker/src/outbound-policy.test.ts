import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifySendError, shouldKeepWaiting } from './outbound-policy.js';

test('clasifica los errores de envío', () => {
  assert.equal(classifySendError('WhatsApp requiere escanear el QR antes de enviar'), 'needs-qr');
  assert.equal(classifySendError('La sesión de WhatsApp fue cerrada; genera un QR nuevo'), 'needs-qr');
  assert.equal(classifySendError('WhatsApp aún no está conectado; el mensaje será reintentado'), 'reconnecting');
  assert.equal(classifySendError('Connection Closed'), 'reconnecting');
  assert.equal(classifySendError('Media upload failed on all hosts'), 'other');
});

test('espera la reconexión hasta 10 minutos desde que se creó el mensaje', () => {
  const now = Date.parse('2026-11-26T12:00:00Z');
  assert.equal(shouldKeepWaiting(new Date(now - 9 * 60 * 1000), now), true);
  assert.equal(shouldKeepWaiting(new Date(now - 11 * 60 * 1000), now), false);
});
