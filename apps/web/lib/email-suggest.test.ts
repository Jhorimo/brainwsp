import assert from 'node:assert/strict';
import { test } from 'node:test';
import { suggestEmail } from './email-suggest';

test('corrige errores típicos de dominio', () => {
  assert.equal(suggestEmail('maria@gmial.com'), 'maria@gmail.com');
  assert.equal(suggestEmail('maria@gmail.con'), 'maria@gmail.com');
  assert.equal(suggestEmail('Juan@Hotmial.com'), 'juan@hotmail.com');
  assert.equal(suggestEmail('ana@outlok.com'), 'ana@outlook.com');
  assert.equal(suggestEmail('ana@gmai.com'), 'ana@gmail.com');
});

test('no toca correos correctos ni dominios propios', () => {
  assert.equal(suggestEmail('maria@gmail.com'), null);
  assert.equal(suggestEmail('contabilidad@braintech.pe'), null);
  assert.equal(suggestEmail('a@uni.pe'), null);
  assert.equal(suggestEmail('incompleto@'), null);
  assert.equal(suggestEmail('sinarroba'), null);
});
