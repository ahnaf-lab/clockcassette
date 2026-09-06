// A deliberately flaky function: every call mixes wall-clock time with a
// random suffix, so two calls never produce the same id and a test that
// asserts an exact value fails intermittently by design. It exists purely
// as the "flaky function" clockcassette is exercised against in tests.

/**
 * Build a request id from the current time and a short random suffix.
 * Nondeterministic on its own — id depends on Date.now() and Math.random()
 * at call time — but fully reproducible when its Date.now/Math.random calls
 * are replayed from a cassette instead of produced live.
 *
 * @returns {string} `${timestamp}-${randomSuffix}`
 */
export function createRequestId() {
  const timestamp = Date.now();
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${timestamp}-${suffix}`;
}
