import assert from 'node:assert/strict';
import { test } from 'node:test';
import { linkContactSource, normalizeLinkSource } from './link-source';

test('normaliza orígenes a un slug corto', () => {
  assert.equal(normalizeLinkSource('Instagram'), 'instagram');
  assert.equal(normalizeLinkSource('  Volante Noviembre!! '), 'volante-noviembre');
  assert.equal(normalizeLinkSource('Campaña Año Nuevo'), 'campana-ano-nuevo');
  assert.equal(normalizeLinkSource('a'.repeat(50)), 'a'.repeat(32));
});

test('descarta orígenes vacíos o solo símbolos', () => {
  assert.equal(normalizeLinkSource(undefined), null);
  assert.equal(normalizeLinkSource(''), null);
  assert.equal(normalizeLinkSource('<script>'), 'script');
  assert.equal(normalizeLinkSource('---'), null);
});

test('arma Contact.source con prefijo link', () => {
  assert.equal(linkContactSource('tiktok'), 'link:tiktok');
  assert.equal(linkContactSource(null), 'link');
});
