// Golden-file test: proves the whole point of clockcassette end to end.
// `createRequestId` (examples/flaky-request-id.js) is genuinely flaky on its
// own — it mixes Date.now() with Math.random() — but replaying it against a
// cassette committed to the repo (test/golden/request-id.json) makes its
// output pinned and assertable, run after run, machine after machine.

import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { replay } from '../src/player.js';
import { createRequestId } from '../examples/flaky-request-id.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const goldenCassettePath = path.join(__dirname, 'golden', 'request-id.json');

// The exact value baked into test/golden/request-id.json: Date.now() = seq 0
// (1757116800000) combined with Math.random() = seq 1 (0.123456789), run
// through createRequestId()'s own formatting. If this ever needs to change,
// regenerate it by recording createRequestId() and updating both together.
const GOLDEN_REQUEST_ID = '1757116800000-4fzzzx';

test('createRequestId is flaky when left to produce real values', () => {
  const first = createRequestId();
  const second = createRequestId();

  assert.notEqual(first, second);
  assert.match(first, /^\d+-[0-9a-z]{6}$/);
});

test('createRequestId becomes deterministic when replayed against the golden cassette', async () => {
  const result = await replay(() => createRequestId(), { cassettePath: goldenCassettePath });
  assert.equal(result, GOLDEN_REQUEST_ID);
});

test('replaying the same golden cassette repeatedly always yields the same id', async () => {
  const runs = [];
  for (let i = 0; i < 3; i++) {
    runs.push(await replay(() => createRequestId(), { cassettePath: goldenCassettePath }));
  }

  assert.equal(runs[0], GOLDEN_REQUEST_ID);
  assert.equal(runs[1], GOLDEN_REQUEST_ID);
  assert.equal(runs[2], GOLDEN_REQUEST_ID);
});
