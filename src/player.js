import fs from 'node:fs';
import path from 'node:path';
import * as sandbox from './sandbox.js';

/**
 * Run `fn` with Date.now, Math.random and setTimeout replaying the exact
 * sequence of calls recorded in the cassette at `cassettePath`, in order.
 *
 * Every call `fn` makes to one of the three globals consumes the next entry
 * from the cassette instead of producing a real value. If `fn` calls the
 * wrong one, calls more than were recorded, or leaves recorded calls unused,
 * replay throws — the whole point is to fail loudly the moment the code
 * diverges from what was recorded, never to limp on with a stale or
 * mismatched value.
 *
 * @param {() => any} fn - function to execute against the replayed sandbox
 * @param {{ cassettePath: string }} options - which cassette file to replay
 * @returns {Promise<any>} whatever `fn` returns (or resolves to)
 */
export async function replay(fn, options = {}) {
  const { cassettePath } = options;
  if (!cassettePath || typeof cassettePath !== 'string') {
    throw new TypeError('replay() requires options.cassettePath to be a string path');
  }
  if (typeof fn !== 'function') {
    throw new TypeError('replay() requires a function to execute');
  }

  const resolvedPath = path.resolve(cassettePath);
  let cassette;
  try {
    cassette = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  } catch (err) {
    throw new Error(`clockcassette: could not read cassette at ${resolvedPath}: ${err.message}`);
  }
  if (!cassette || !Array.isArray(cassette.calls)) {
    throw new Error(`clockcassette: cassette at ${resolvedPath} has no "calls" array`);
  }

  sandbox.patchReplay(cassette.calls);
  let result;
  let thrown = null;

  try {
    result = await fn();
  } catch (err) {
    thrown = err;
  } finally {
    const leftover = sandbox.remaining();
    sandbox.unpatch();
    if (!thrown && leftover > 0) {
      thrown = new Error(
        `clockcassette: cassette has ${leftover} unconsumed call(s); code made fewer ` +
          'calls than were recorded'
      );
    }
  }

  if (thrown) throw thrown;
  return result;
}
