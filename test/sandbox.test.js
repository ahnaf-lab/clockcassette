import test from 'node:test';
import assert from 'node:assert/strict';
import { patch, unpatch, getLog, isActive } from '../src/sandbox.js';

test('patch replaces the globals and unpatch restores them exactly', () => {
  const originalNow = Date.now;
  const originalRandom = Math.random;
  const originalSetTimeout = globalThis.setTimeout;

  patch();
  assert.equal(isActive(), true);
  assert.notEqual(Date.now, originalNow);
  assert.notEqual(Math.random, originalRandom);
  assert.notEqual(globalThis.setTimeout, originalSetTimeout);

  unpatch();
  assert.equal(isActive(), false);
  assert.equal(Date.now, originalNow);
  assert.equal(Math.random, originalRandom);
  assert.equal(globalThis.setTimeout, originalSetTimeout);
});

test('patched calls are logged in order with the real return values', () => {
  patch();
  const now = Date.now();
  const rand = Math.random();
  const log = getLog();
  unpatch();

  assert.equal(log.length, 2);
  assert.equal(log[0].type, 'Date.now');
  assert.equal(log[0].seq, 0);
  assert.equal(log[0].result, now);
  assert.equal(log[1].type, 'Math.random');
  assert.equal(log[1].seq, 1);
  assert.equal(log[1].result, rand);
});

test('patched setTimeout still fires the real callback and is recorded', () => {
  patch();
  return new Promise((resolve) => {
    setTimeout(() => {
      const log = getLog();
      unpatch();
      assert.equal(log.length, 1);
      assert.equal(log[0].type, 'setTimeout');
      assert.equal(log[0].args[0], 5);
      assert.equal(log[0].fired, true);
      assert.equal(typeof log[0].firedAt, 'number');
      resolve();
    }, 5);
  });
});

test('patch refuses to run twice without an unpatch in between', () => {
  patch();
  assert.throws(() => patch(), /already patched/);
  unpatch();
});
