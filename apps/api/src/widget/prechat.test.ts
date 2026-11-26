import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanProfile, isLinkContact, resolvePrechat } from './prechat';

test('valores por defecto: activo y todo obligatorio', () => {
  assert.deepEqual(resolvePrechat(null), { enabled: true, name: 'required', email: 'required', phone: 'required' });
  assert.deepEqual(resolvePrechat({ prechatEnabled: false, prechatPhone: 'optional' }), { enabled: false, name: 'required', email: 'required', phone: 'optional' });
});

test('el correo es siempre obligatorio aunque la configuración diga otra cosa', () => {
  assert.equal(resolvePrechat({ prechatEmail: 'hidden' }).email, 'required');
  assert.equal(resolvePrechat({ prechatEmail: 'optional' }).email, 'required');
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
  assert.equal(cleanProfile({ name: 'Ana', email: 'ana@gmail.com', phone: '' }, s).error, 'Escribe tu celular');
  assert.equal(cleanProfile({ name: 'Ana', email: 'ana@gmail.com', phone: '51887654321' }, s).error, 'Los celulares de Perú tienen 9 dígitos y empiezan con 9');
  assert.equal(cleanProfile({ name: 'Ana', email: 'ana@gmail.com', phone: '5198765432' }, s).error, 'Los celulares de Perú tienen 9 dígitos y empiezan con 9');
  assert.deepEqual(cleanProfile({ name: 'Ana', email: 'ana@gmail.com', phone: '573001234567' }, s).profile, { name: 'Ana', email: 'ana@gmail.com', phone: '573001234567' });
});

test('campos ocultos se ignoran aunque lleguen', () => {
  const s = resolvePrechat({ prechatPhone: 'hidden' });
  assert.deepEqual(cleanProfile({ name: 'Ana', email: 'ana@gmail.com', phone: '1' }, s).profile, { name: 'Ana', email: 'ana@gmail.com' });
});

test('solo los contactos del enlace llevan formulario', () => {
  assert.equal(isLinkContact('link'), true);
  assert.equal(isLinkContact('link:instagram'), true);
  assert.equal(isLinkContact('widget'), false);
  assert.equal(isLinkContact(null), false);
});
