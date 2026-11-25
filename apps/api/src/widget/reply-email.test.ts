import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReplyEmail } from './reply-email';
import { createResumeToken, verifyResumeToken } from './resume-token';

const base = {
  companyName: 'Brain Tech',
  color: '#6b8afd',
  continueUrl: 'https://wsp.example.com/c/brain?r=abc',
  unsubscribeUrl: 'https://wsp.example.com/c/brain?baja=abc',
};

test('arma asunto, saludo y botón', () => {
  const mail = buildReplyEmail({ ...base, visitorName: 'María López', messages: [{ text: 'Hola María', at: new Date() }] });
  assert.equal(mail.subject, 'Brain Tech te respondió');
  assert.match(mail.html, /Hola María, te respondimos/);
  assert.match(mail.html, /Continuar la conversación/);
  assert.match(mail.text, /https:\/\/wsp\.example\.com\/c\/brain\?r=abc/);
  assert.match(mail.text, /No quiero|no recibir más/);
});

test('escapa el texto del chat (sin HTML inyectado)', () => {
  const mail = buildReplyEmail({ ...base, messages: [{ text: '<script>alert(1)</script> & "x"', at: new Date() }] });
  assert.ok(!mail.html.includes('<script>alert'));
  assert.match(mail.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;x&quot;/);
});

test('muestra los 3 últimos y cuenta el resto', () => {
  const messages = ['uno', 'dos', 'tres', 'cuatro', 'cinco'].map((text) => ({ text, at: new Date() }));
  const mail = buildReplyEmail({ ...base, messages });
  assert.equal(mail.subject, 'Brain Tech te respondió (5 mensajes)');
  assert.ok(!mail.html.includes('>uno<') && mail.html.includes('cinco'));
  assert.match(mail.html, /y 2 mensaje\(s\) más/);
});

test('color inválido no rompe el HTML', () => {
  const mail = buildReplyEmail({ ...base, color: 'red;"><script>', messages: [{ text: 'x', at: new Date() }] });
  assert.ok(!mail.html.includes('<script>'));
});

test('enlace para volver: firma válida solo para su empresa y contacto', () => {
  const token = createResumeToken('empresa-1', 'contacto-1');
  assert.equal(verifyResumeToken('empresa-1', token), 'contacto-1');
  assert.equal(verifyResumeToken('empresa-2', token), null);
  assert.equal(verifyResumeToken('empresa-1', token.replace('contacto-1', 'contacto-2')), null);
  assert.equal(verifyResumeToken('empresa-1', `${token}x`), null);
  assert.equal(verifyResumeToken('empresa-1', 'basura'), null);
  assert.equal(verifyResumeToken('empresa-1', undefined), null);
});
