import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCodeEmail, generateCode, hashCode, maskEmail, normalizeCode } from './email-code';

test('genera códigos de 6 dígitos', () => {
  for (let i = 0; i < 200; i++) assert.match(generateCode(), /^\d{6}$/);
});

test('el hash depende de la sesión', () => {
  assert.equal(hashCode('s1', '123456'), hashCode('s1', '123456'));
  assert.notEqual(hashCode('s1', '123456'), hashCode('s2', '123456'));
  assert.notEqual(hashCode('s1', '123456'), hashCode('s1', '123457'));
});

test('normaliza lo que escribe o pega el visitante', () => {
  assert.equal(normalizeCode(' 123 456 '), '123456');
  assert.equal(normalizeCode('123-4567'), '123456');
});

test('enmascara el correo', () => {
  assert.equal(maskEmail('maria.lopez@gmail.com'), 'm•••z@gmail.com');
  assert.equal(maskEmail('jo@uni.pe'), 'j•••@uni.pe');
});

test('correo del código: asunto, código separado y empresa escapada', () => {
  const mail = buildCodeEmail({ companyName: 'Brain <Tech>', color: '#6b8afd', code: '048213' });
  assert.equal(mail.subject, '048213 es tu código para volver a tu chat con Brain <Tech>');
  assert.match(mail.html, /048 213/);
  assert.match(mail.html, /Brain &lt;Tech&gt;/);
  assert.match(mail.text, /Vence en 10 minutos/);
});
