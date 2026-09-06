import test from 'node:test';
import assert from 'node:assert/strict';
import { patch, unpatch, getLog, isActive, patchReplay, remaining } from '../src/sandbox.js';

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

test('patchReplay feeds recorded values back in order', () => {
  patchReplay([
    { type: 'Date.now', seq: 0, args: [], result: 111 },
    { type: 'Math.random', seq: 1, args: [], result: 0.42 },
  ]);

  assert.equal(Date.now(), 111);
  assert.equal(Math.random(), 0.42);
  assert.equal(remaining(), 0);
  unpatch();
});

test('patchReplay throws on a type mismatch instead of returning a wrong value', () => {
  patchReplay([{ type: 'Math.random', seq: 0, args: [], result: 0.5 }]);
  assert.throws(() => Date.now(), /sequence mismatch/);
  unpatch();
});

test('patchReplay throws once the cassette is exhausted', () => {
  patchReplay([{ type: 'Date.now', seq: 0, args: [], result: 1 }]);
  Date.now();
  assert.throws(() => Date.now(), /exhausted/);
  unpatch();
});

test('remaining() reports how many recorded calls are still unconsumed', () => {
  patchReplay([
    { type: 'Date.now', seq: 0, args: [], result: 1 },
    { type: 'Date.now', seq: 1, args: [], result: 2 },
  ]);
  assert.equal(remaining(), 2);
  Date.now();
  assert.equal(remaining(), 1);
  unpatch();
});
