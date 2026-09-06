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
let remainingQueue = null;

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

/**
 * Replace Date.now, Math.random and setTimeout with replaying versions: each
 * call consumes the next entry from `calls`, in order, and returns its
 * recorded result instead of a real one. A call whose type doesn't match the
 * next entry's type, or that happens after the cassette is exhausted, throws
 * immediately — the whole point is to fail loudly the moment code diverges
 * from what was recorded, not to limp on with wrong values.
 *
 * @param {Array<object>} calls - the `calls` array from a cassette file
 */
export function patchReplay(calls) {
  if (active) {
    throw new Error('sandbox is already patched; call unpatch() before patching again');
  }
  active = true;
  callSeq = 0;
  log = [];
  const queue = Array.isArray(calls) ? calls.slice() : [];

  function consume(type) {
    const entry = queue.shift();
    if (!entry) {
      throw new Error(
        `clockcassette: cassette exhausted, but code called ${type} (expected no more calls)`
      );
    }
    if (entry.type !== type) {
      throw new Error(
        `clockcassette: sequence mismatch at call ${callSeq}: cassette recorded ${entry.type}, ` +
          `but code called ${type}`
      );
    }
    callSeq++;
    log.push(entry);
    return entry;
  }

  Date.now = function replayedNow() {
    return consume('Date.now').result;
  };

  Math.random = function replayedRandom() {
    return consume('Math.random').result;
  };

  globalThis.setTimeout = function replayedSetTimeout(callback, delay, ...extraArgs) {
    const entry = consume('setTimeout');

    const wrapped = (...callbackArgs) => {
      entry.fired = true;
      return callback(...callbackArgs, ...extraArgs);
    };

    return originals.setTimeout(wrapped, delay);
  };

  remainingQueue = queue;
}

/** Restore the three globals to whatever they were before patch() ran. */
export function unpatch() {
  if (!active) return;
  Date.now = originals.dateNow;
  Math.random = originals.mathRandom;
  globalThis.setTimeout = originals.setTimeout;
  active = false;
  remainingQueue = null;
}

/** The recorded calls, in the order they happened, since the last patch(). */
export function getLog() {
  return log;
}

export function isActive() {
  return active;
}

/**
 * Number of cassette entries not yet consumed by a replay in progress (or
 * since the last patchReplay()). Used to detect the code making *fewer*
 * calls than were recorded, which is also a sequence mismatch.
 */
export function remaining() {
  return remainingQueue ? remainingQueue.length : 0;
}
