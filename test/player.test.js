import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { record } from '../src/recorder.js';
import { replay } from '../src/player.js';

function tempCassettePath() {
  const unique = `${process.pid}-${Math.random().toString(16).slice(2)}`;
  return path.join(os.tmpdir(), `clockcassette-player-test-${unique}.json`);
}

test('replay feeds back the exact values recorded, in the same order', async () => {
  const cassettePath = tempCassettePath();

  const recorded = await record(
    async () => {
      const now = Date.now();
      const rand = Math.random();
      return [now, rand];
    },
    { cassettePath }
  );

  const replayed = await replay(
    async () => {
      const now = Date.now();
      const rand = Math.random();
      return [now, rand];
    },
    { cassettePath }
  );

  fs.unlinkSync(cassettePath);
  assert.deepEqual(replayed, recorded);
});

test('replay throws when code calls the globals in a different order than recorded', async () => {
  const cassettePath = tempCassettePath();

  await record(
    async () => {
      Date.now();
      Math.random();
    },
    { cassettePath }
  );

  await assert.rejects(
    replay(
      async () => {
        Math.random();
        Date.now();
      },
      { cassettePath }
    ),
    /sequence mismatch/
  );

  fs.unlinkSync(cassettePath);
});

test('replay throws when code makes fewer calls than the cassette recorded', async () => {
  const cassettePath = tempCassettePath();

  await record(
    async () => {
      Date.now();
      Math.random();
    },
    { cassettePath }
  );

  await assert.rejects(
    replay(
      async () => {
        Date.now();
      },
      { cassettePath }
    ),
    /unconsumed/
  );

  fs.unlinkSync(cassettePath);
});

test('replay rejects a missing cassette file instead of silently doing nothing', async () => {
  await assert.rejects(
    replay(() => {}, { cassettePath: path.join(os.tmpdir(), 'clockcassette-does-not-exist.json') }),
    /could not read cassette/
  );
});

test('replay restores the real globals even when fn throws', async () => {
  const cassettePath = tempCassettePath();
  await record(() => {
    Date.now();
  }, { cassettePath });

  const originalNow = Date.now;
  await assert.rejects(
    replay(() => {
      Date.now();
      throw new Error('boom');
    }, { cassettePath }),
    /boom/
  );
  assert.equal(Date.now, originalNow);

  fs.unlinkSync(cassettePath);
});
