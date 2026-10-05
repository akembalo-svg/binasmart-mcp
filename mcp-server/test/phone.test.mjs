import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normPhone, maskPhone } from '../lib/phone.mjs';

test('normPhone accepts the three Ethiopian forms', () => {
  assert.equal(normPhone('0900000011'), '+251900000011');
  assert.equal(normPhone('+251 900 000 011'), '+251900000011');
  assert.equal(normPhone('251900000011'), '+251900000011');
  assert.equal(normPhone('0700000011'), '+251700000011');
});

test('normPhone rejects short, foreign and empty', () => {
  assert.equal(normPhone('090000001'), null);
  assert.equal(normPhone('+254700000011'), null);
  assert.equal(normPhone(''), null);
  assert.equal(normPhone(undefined), null);
});

test('maskPhone keeps only the last 3 digits', () => {
  assert.equal(maskPhone('+251900000011'), '+251••••••011');
  assert.equal(maskPhone(null), '-');
});
