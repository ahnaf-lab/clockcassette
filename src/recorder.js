import fs from 'node:fs';
import path from 'node:path';
import * as sandbox from './sandbox.js';

/**
 * Run `fn` with Date.now, Math.random and setTimeout patched, and write every
 * call they make (in order, with real return values) to a cassette JSON file.
 *
 * `fn` still runs for real: patched calls return genuine values and
 * setTimeout still schedules a genuine timer. Only the observation is new.
 *
 * @param {() => any} fn - function to execute under the sandbox
 * @param {{ cassettePath: string }} options - where to write the cassette
 * @returns {Promise<any>} whatever `fn` returns (or resolves to)
 */
export async function record(fn, options = {}) {
  const { cassettePath } = options;
  if (!cassettePath || typeof cassettePath !== 'string') {
    throw new TypeError('record() requires options.cassettePath to be a string path');
  }
  if (typeof fn !== 'function') {
    throw new TypeError('record() requires a function to execute');
  }

  sandbox.patch();
  const recordedAt = new Date().toISOString();
  let result;
  let thrown = null;
  let calls;

  try {
    result = await fn();
  } catch (err) {
    thrown = err;
  } finally {
    calls = sandbox.getLog();
    sandbox.unpatch();
  }

  const cassette = { version: 1, recordedAt, calls };
  const resolvedPath = path.resolve(cassettePath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, JSON.stringify(cassette, null, 2));

  if (thrown) throw thrown;
  return result;
}
