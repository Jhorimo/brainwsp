import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldRecordPresence } from './conversation-events.service';

test('solo registra cambios de presencia (sin avisos repetidos)', () => {
  assert.equal(shouldRecordPresence('visitor_joined', null, 'link:instagram'), true);
  assert.equal(shouldRecordPresence('visitor_joined', { type: 'visitor_left' }, 'link:instagram'), true);
  assert.equal(shouldRecordPresence('visitor_joined', { type: 'visitor_joined', via: 'link:instagram' }, 'link:instagram'), false);
  assert.equal(shouldRecordPresence('visitor_left', { type: 'visitor_joined', via: 'link' }), true);
  assert.equal(shouldRecordPresence('visitor_left', { type: 'visitor_left' }), false);
  assert.equal(shouldRecordPresence('visitor_left', null), false);
});

test('otro dispositivo u otra vía mientras sigue conectado: también se avisa', () => {
  assert.equal(shouldRecordPresence('visitor_joined', { type: 'visitor_joined', via: 'link:instagram' }, 'unverified'), true);
  assert.equal(shouldRecordPresence('visitor_joined', { type: 'visitor_joined', via: 'link:instagram' }, 'link:tiktok'), true);
});
