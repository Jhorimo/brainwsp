import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanProfile, isLinkContact, resolvePrechat } from './prechat';

test('valores por defecto: activo, nombre y correo obligatorios, celular opcional', () => {
  assert.deepEqual(resolvePrechat(null), { enabled: true, name: 'required', email: 'required', phone: 'optional' });
  assert.deepEqual(resolvePrechat({ prechatEnabled: false, prechatPhone: 'required' }), { enabled: false, name: 'required', email: 'required', phone: 'required' });
});

test('sin campos visibles el formulario queda desactivado', () => {
  assert.equal(resolvePrechat({ prechatName: 'hidden', prechatEmail: 'hidden', prechatPhone: 'hidden' }).enabled, false);
});

test('ignora modos inválidos guardados en la configuración', () => {
  assert.equal(resolvePrechat({ prechatName: 'otro' as never }).name, 'required');
});

test('limpia y valida los datos', () => {
  const s = resolvePrechat(null);
  assert.deepEqual(cleanProfile({ name: '  María   López ', email: ' Maria@Gmail.COM ', phone: '+51 987 654 321' }, s).profile, { name: 'María López', email: 'maria@gmail.com', phone: '51987654321' });
  assert.equal(cleanProfile({ name: '', email: 'a@b.co' }, s).error, 'Escribe tu nombre');
  assert.equal(cleanProfile({ name: 'Ana', email: 'ana@gmail' }, s).error, 'Revisa tu correo, parece incompleto');
  assert.equal(cleanProfile({ name: 'Ana', email: 'ana@gmail.com', phone: '98765' }, s).error, 'Revisa tu celular, el número no está completo');
  assert.deepEqual(cleanProfile({ name: 'Ana', email: 'ana@gmail.com', phone: '' }, s).profile, { name: 'Ana', email: 'ana@gmail.com' });
});

test('campos ocultos se ignoran aunque lleguen', () => {
  const s = resolvePrechat({ prechatEmail: 'hidden', prechatPhone: 'hidden' });
  assert.deepEqual(cleanProfile({ name: 'Ana', email: 'x', phone: '1' }, s).profile, { name: 'Ana' });
});

test('solo los contactos del enlace llevan formulario', () => {
  assert.equal(isLinkContact('link'), true);
  assert.equal(isLinkContact('link:instagram'), true);
  assert.equal(isLinkContact('widget'), false);
  assert.equal(isLinkContact(null), false);
});
