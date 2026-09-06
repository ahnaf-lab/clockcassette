import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { record } from '../src/recorder.js';
import { report, summarize } from '../src/report.js';

function tempCassettePath() {
  const unique = `${process.pid}-${Math.random().toString(16).slice(2)}`;
  return path.join(os.tmpdir(), `clockcassette-report-test-${unique}.json`);
}

test('summarize counts calls per entropy source', async () => {
  const cassettePath = tempCassettePath();

  await record(
    async () => {
      Date.now();
      Date.now();
      Math.random();
    },
    { cassettePath }
  );

  const cassette = JSON.parse(fs.readFileSync(cassettePath, 'utf8'));
  fs.unlinkSync(cassettePath);

  const summary = summarize(cassette);
  assert.equal(summary.total, 3);
  assert.equal(summary.byType['Date.now'], 2);
  assert.equal(summary.byType['Math.random'], 1);
  assert.equal(summary.byType['setTimeout'], 0);
});

test('summarize captures setTimeout delay range and fired count', async () => {
  const cassettePath = tempCassettePath();

  await record(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    setTimeout(() => {}, 20);
  }, { cassettePath });

  const cassette = JSON.parse(fs.readFileSync(cassettePath, 'utf8'));
  fs.unlinkSync(cassettePath);

  const summary = summarize(cassette);
  assert.equal(summary.byType['setTimeout'], 2);
  assert.equal(summary.setTimeoutFired, 1);
  assert.deepEqual(summary.setTimeoutDelays, { min: 5, max: 20 });
});

test('report renders a text summary with counts and header', async () => {
  const cassettePath = tempCassettePath();

  await record(async () => {
    Date.now();
    Math.random();
  }, { cassettePath });

  const text = report(cassettePath);
  fs.unlinkSync(cassettePath);

  assert.match(text, /clockcassette report/);
  assert.match(text, /total calls: 2/);
  assert.match(text, /Date\.now: 1/);
  assert.match(text, /Math\.random: 1/);
});

test('report accepts a parsed cassette object as well as a path', async () => {
  const cassettePath = tempCassettePath();

  await record(async () => {
    Date.now();
  }, { cassettePath });

  const cassette = JSON.parse(fs.readFileSync(cassettePath, 'utf8'));
  fs.unlinkSync(cassettePath);

  const text = report(cassette);
  assert.match(text, /total calls: 1/);
});

test('report rejects a missing cassette file instead of silently doing nothing', () => {
  assert.throws(
    () => report(path.join(os.tmpdir(), 'clockcassette-report-does-not-exist.json')),
    /could not read cassette/
  );
});

test('summarize rejects a value without a calls array', () => {
  assert.throws(() => summarize({}), TypeError);
});
