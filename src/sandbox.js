// Contains all monkey-patching in one place: this module is the only part of
// clockcassette that ever touches the real Date, Math or setTimeout globals.
// Recording and replay logic stay ignorant of *how* interception happens.

const originals = {
  dateNow: Date.now,
  mathRandom: Math.random,
  setTimeout: globalThis.setTimeout,
};

let log = [];
let active = false;
let callSeq = 0;

/**
 * Replace Date.now, Math.random and setTimeout with recording versions.
 * Real values are still produced (setTimeout still schedules a real timer);
 * every call and its result is appended to an in-memory log in call order.
 */
export function patch() {
  if (active) {
    throw new Error('sandbox is already patched; call unpatch() before patching again');
  }
  active = true;
  callSeq = 0;
  log = [];

  Date.now = function patchedNow() {
    const result = originals.dateNow();
    log.push({ type: 'Date.now', seq: callSeq++, args: [], result });
    return result;
  };

  Math.random = function patchedRandom() {
    const result = originals.mathRandom();
    log.push({ type: 'Math.random', seq: callSeq++, args: [], result });
    return result;
  };

  globalThis.setTimeout = function patchedSetTimeout(callback, delay, ...extraArgs) {
    const seq = callSeq++;
    const entry = {
      type: 'setTimeout',
      seq,
      args: [delay],
      result: null,
      fired: false,
      firedAt: null,
    };
    log.push(entry);

    const wrapped = (...callbackArgs) => {
      entry.fired = true;
      entry.firedAt = originals.dateNow();
      return callback(...callbackArgs, ...extraArgs);
    };

    return originals.setTimeout(wrapped, delay);
  };
}

/** Restore the three globals to whatever they were before patch() ran. */
export function unpatch() {
  if (!active) return;
  Date.now = originals.dateNow;
  Math.random = originals.mathRandom;
  globalThis.setTimeout = originals.setTimeout;
  active = false;
}

/** The recorded calls, in the order they happened, since the last patch(). */
export function getLog() {
  return log;
}

export function isActive() {
  return active;
}
