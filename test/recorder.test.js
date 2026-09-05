import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { record } from '../src/recorder.js';

function tempCassettePath() {
  const unique = `${process.pid}-${Math.random().toString(16).slice(2)}`;
  return path.join(os.tmpdir(), `clockcassette-test-${unique}.json`);
}

test('record writes a cassette describing every intercepted call in order', async () => {
  const cassettePath = tempCassettePath();

  const result = await record(
    async () => {
      const now = Date.now();
      const rand = Math.random();
      return now + rand;
    },
    { cassettePath }
  );

  const cassette = JSON.parse(fs.readFileSync(cassettePath, 'utf8'));
  fs.unlinkSync(cassettePath);

  assert.equal(cassette.version, 1);
  assert.equal(cassette.calls.length, 2);
  assert.equal(cassette.calls[0].type, 'Date.now');
  assert.equal(cassette.calls[1].type, 'Math.random');
  assert.equal(typeof result, 'number');
});

test('record restores the real globals even when fn throws, and still writes the cassette', async () => {
  const cassettePath = tempCassettePath();
  const originalNow = Date.now;

  await assert.rejects(
    record(
      () => {
        Date.now();
        throw new Error('boom');
      },
      { cassettePath }
    ),
    /boom/
  );

  assert.equal(Date.now, originalNow);
  const cassette = JSON.parse(fs.readFileSync(cassettePath, 'utf8'));
  fs.unlinkSync(cassettePath);
  assert.equal(cassette.calls.length, 1);
  assert.equal(cassette.calls[0].type, 'Date.now');
});

test('record rejects a missing cassettePath instead of silently doing nothing', async () => {
  await assert.rejects(record(() => {}, {}), TypeError);
});
