import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classify, maskPhone, type TrackedCall } from './call-handler.js';

const tracked = (over: Partial<TrackedCall> = {}): TrackedCall => ({
  callId: 'C1', instanceId: 'I', companyId: 'X', lineName: 'L', from: '1@s.whatsapp.net', isVideo: false,
  startedAt: Date.now(), finalized: false, simulated: true, contactName: null, phoneMasked: '', ...over,
});

test('maskPhone oculta todo menos los 3 últimos dígitos', () => {
  assert.equal(maskPhone('51960566821'), '+51 9•• ••• 821');
  assert.equal(maskPhone('5491122334455'), '+54 ••• ••• 455');
  assert.equal(maskPhone(null), 'Número oculto');
  assert.equal(maskPhone('123'), 'Número oculto');
});

test('offer nueva empieza; offer repetida se ignora', () => {
  assert.deepEqual(classify('offer', undefined), { kind: 'start' });
  assert.deepEqual(classify('offer', tracked()), { kind: 'ignore' });
});

test('eventos de una llamada desconocida o ya cerrada se ignoran', () => {
  assert.deepEqual(classify('terminate', undefined), { kind: 'ignore' });
  assert.deepEqual(classify('reject', tracked({ finalized: true })), { kind: 'ignore' });
});

test('contestada en otro dispositivo y luego colgada = answered', () => {
  assert.deepEqual(classify('accept', tracked()), { kind: 'answered' });
  assert.deepEqual(classify('accept', tracked({ acceptedAt: 1 })), { kind: 'ignore' });
  assert.deepEqual(classify('terminate', tracked({ acceptedAt: 1 })), { kind: 'end', reason: 'answered' });
});

test('sin contestar: timeout o terminate = perdida; reject = rechazada', () => {
  assert.deepEqual(classify('timeout', tracked()), { kind: 'end', reason: 'missed' });
  assert.deepEqual(classify('terminate', tracked()), { kind: 'end', reason: 'missed' });
  assert.deepEqual(classify('reject', tracked()), { kind: 'end', reason: 'declined' });
  assert.deepEqual(classify('ringing', tracked()), { kind: 'ignore' });
});
