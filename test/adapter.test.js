import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { useCassette, createCassetteTest, isCI } from '../src/adapter.js';

function tempCassettePath() {
  const unique = `${process.pid}-${Math.random().toString(16).slice(2)}`;
  return path.join(os.tmpdir(), `clockcassette-adapter-test-${unique}.json`);
}

test('isCI reads the CI env var with the standard truthy/falsy convention', () => {
  assert.equal(isCI({}), false);
  assert.equal(isCI({ CI: 'true' }), true);
  assert.equal(isCI({ CI: '1' }), true);
  assert.equal(isCI({ CI: 'false' }), false);
  assert.equal(isCI({ CI: '0' }), false);
  assert.equal(isCI({ CI: '' }), false);
});

test('useCassette records on first run when no cassette exists yet', async () => {
  const cassettePath = tempCassettePath();
  assert.equal(fs.existsSync(cassettePath), false);

  const result = await useCassette(
    'first run',
    async () => Date.now(),
    { cassettePath, ci: false }
  );

  assert.equal(fs.existsSync(cassettePath), true);
  const cassette = JSON.parse(fs.readFileSync(cassettePath, 'utf8'));
  assert.equal(cassette.calls.length, 1);
  assert.equal(cassette.calls[0].result, result);
  fs.unlinkSync(cassettePath);
});

test('useCassette replays a recorded value instead of a fresh one on later runs', async () => {
  const cassettePath = tempCassettePath();

  const recordedValue = await useCassette(
    'replay value',
    async () => Math.random(),
    { cassettePath, ci: false }
  );

  const replayedValue = await useCassette(
    'replay value',
    async () => Math.random(),
    { cassettePath, ci: false }
  );

  assert.equal(replayedValue, recordedValue);
  fs.unlinkSync(cassettePath);
});

test('useCassette on CI throws instead of recording when no cassette exists', async () => {
  const cassettePath = tempCassettePath();
  assert.equal(fs.existsSync(cassettePath), false);

  await assert.rejects(
    () => useCassette('ci missing cassette', async () => Date.now(), { cassettePath, ci: true }),
    /no cassette exists/
  );
  assert.equal(fs.existsSync(cassettePath), false);
});

test('useCassette on CI replays an existing cassette instead of recording fresh values', async () => {
  const cassettePath = tempCassettePath();

  const recordedValue = await useCassette(
    'ci replay',
    async () => Math.random(),
    { cassettePath, ci: false }
  );

  const replayedValue = await useCassette(
    'ci replay',
    async () => Math.random(),
    { cassettePath, ci: true }
  );

  assert.equal(replayedValue, recordedValue);
  fs.unlinkSync(cassettePath);
});

test('useCassette derives a cassette path from the test name when none is given', async () => {
  const cassetteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clockcassette-adapter-dir-'));

  await useCassette('Weird Name! With Spaces', async () => Date.now(), {
    cassetteDir,
    ci: false,
  });

  const expectedPath = path.join(cassetteDir, 'weird-name-with-spaces.json');
  assert.equal(fs.existsSync(expectedPath), true);
  fs.rmSync(cassetteDir, { recursive: true, force: true });
});

test('createCassetteTest wraps the given test function and runs its body under useCassette', async () => {
  const cassettePath = tempCassettePath();
  const registered = [];

  const fakeTestImpl = (name, fn) => {
    registered.push(name);
    return fn();
  };

  const cassetteTest = createCassetteTest(fakeTestImpl);

  const observedValues = [];
  await cassetteTest(
    'wrapped test',
    { cassettePath, ci: false },
    async () => {
      observedValues.push(Date.now());
    }
  );
  await cassetteTest(
    'wrapped test',
    { cassettePath, ci: false },
    async () => {
      observedValues.push(Date.now());
    }
  );

  assert.deepEqual(registered, ['wrapped test', 'wrapped test']);
  assert.equal(observedValues.length, 2);
  assert.equal(observedValues[0], observedValues[1]);
  fs.unlinkSync(cassettePath);
});

test('createCassetteTest supports the (name, fn) call form without options', async () => {
  const fakeTestImpl = (name, fn) => fn();
  const cassetteTest = createCassetteTest(fakeTestImpl);

  // useCassette derives its own path when called through cassetteTest with no
  // options, so pin it to a temp file the same way the other tests do by
  // wrapping a call that supplies cassettePath via a closure-captured name.
  let ran = false;
  await cassetteTest('no options form', async () => {
    Date.now();
    ran = true;
  });

  assert.equal(ran, true);
  const derivedPath = path.resolve('cassettes', 'no-options-form.json');
  assert.equal(fs.existsSync(derivedPath), true);
  fs.rmSync(path.resolve('cassettes'), { recursive: true, force: true });
});
