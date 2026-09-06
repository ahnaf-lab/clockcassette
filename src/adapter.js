import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { record } from './recorder.js';
import { replay } from './player.js';

const DEFAULT_CASSETTE_DIR = 'cassettes';

/**
 * Whether the current process should be treated as running on CI: true when
 * `env.CI` is set to anything other than an empty string, "0" or "false"
 * (case-insensitive) — the same convention most CI providers already set.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isCI(env = process.env) {
  const value = env.CI;
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== '' && normalized !== '0' && normalized !== 'false';
}

/**
 * Turn a test name into a filesystem-safe slug: lowercase, alphanumerics
 * separated by single hyphens, no leading/trailing hyphen.
 *
 * @param {string} name
 * @returns {string}
 */
function slugify(name) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'cassette';
}

/**
 * Resolve the cassette file path for a test: an explicit `cassettePath`
 * wins, otherwise one is derived from the test name inside `cassetteDir`
 * (default `cassettes/`).
 *
 * @param {string} name
 * @param {{ cassettePath?: string, cassetteDir?: string }} options
 * @returns {string}
 */
function resolveCassettePath(name, options) {
  if (options.cassettePath) return options.cassettePath;
  const dir = options.cassetteDir || DEFAULT_CASSETTE_DIR;
  return path.join(dir, `${slugify(name)}.json`);
}

/**
 * Run `fn` under clockcassette, choosing record or replay automatically:
 *
 * - On CI (per `isCI()`, or `options.ci` if given), the cassette at the
 *   resolved path MUST already exist and is replayed; a missing cassette on
 *   CI throws immediately rather than recording nondeterministic values into
 *   a CI run and calling it a pass.
 * - Off CI, a missing cassette is recorded (first run); an existing one is
 *   replayed, so the same test is deterministic on every later run.
 *
 * @param {string} name - test name, used to derive the cassette path when
 *   `options.cassettePath` is not given
 * @param {() => any} fn - the function to run under record or replay
 * @param {{ cassettePath?: string, cassetteDir?: string, ci?: boolean }} [options]
 * @returns {Promise<any>}
 */
export async function useCassette(name, fn, options = {}) {
  if (typeof name !== 'string' || !name) {
    throw new TypeError('useCassette() requires a non-empty test name');
  }
  if (typeof fn !== 'function') {
    throw new TypeError('useCassette() requires a function to execute');
  }

  const cassettePath = resolveCassettePath(name, options);
  const exists = fs.existsSync(path.resolve(cassettePath));
  const ci = 'ci' in options ? Boolean(options.ci) : isCI();

  if (ci) {
    if (!exists) {
      throw new Error(
        `clockcassette: CI replay requested for "${name}" but no cassette exists at ` +
          `${cassettePath}. Run this test locally (outside CI) first to record one, then ` +
          'commit the cassette file.'
      );
    }
    return replay(fn, { cassettePath });
  }

  return exists ? replay(fn, { cassettePath }) : record(fn, { cassettePath });
}

/**
 * Build a `cassetteTest(name, [options], fn)` helper bound to a given
 * `node:test`-shaped `test` function, so the wiring between the test runner
 * and `useCassette()` can be exercised without registering real, globally
 * visible tests. `cassetteTest` itself (below) is `createCassetteTest`
 * bound to the real `node:test`.
 *
 * @param {typeof test} testImpl
 */
export function createCassetteTest(testImpl) {
  return function cassetteTest(name, optionsOrFn, maybeFn) {
    const hasOptions = typeof optionsOrFn !== 'function';
    const options = hasOptions ? optionsOrFn || {} : {};
    const fn = hasOptions ? maybeFn : optionsOrFn;

    if (typeof name !== 'string' || !name) {
      throw new TypeError('cassetteTest() requires a non-empty test name');
    }
    if (typeof fn !== 'function') {
      throw new TypeError('cassetteTest() requires a test function');
    }

    return testImpl(name, (t) => useCassette(name, () => fn(t), options));
  };
}

/**
 * `node:test`'s `test()`, wrapped so the test body runs under
 * `useCassette()`: auto-record on first run, auto-replay afterwards or on
 * CI. Use exactly like `test(name, fn)` — the cassette path and CI
 * detection are handled automatically.
 *
 * @example
 * import { cassetteTest } from 'clockcassette';
 *
 * cassetteTest('startedAt is stable', async () => {
 *   const startedAt = Date.now();
 *   assert.equal(typeof startedAt, 'number');
 * });
 */
export const cassetteTest = createCassetteTest(test);
