# clockcassette

A zero-dependency Node library that intercepts `Date.now`, `Math.random` and
`setTimeout`, records every call and its real return value to a cassette file,
and replays that exact sequence later so nondeterministic code becomes
reproducible in tests.

This milestone adds the **player**: replaying a cassette feeds recorded values
back to `Date.now`, `Math.random` and `setTimeout`, in the exact order they
were recorded, and throws immediately if the code under test calls the wrong
one, calls more than were recorded, or leaves recorded calls unconsumed. The
`node:test` adapter is not built yet.

## Install

```bash
npm install
```

No runtime dependencies — this is plain Node.js (`>=18`), zero-dependency by
design: the standard library (`node:fs`, `node:path`) is enough to record
calls and write a JSON file, so there is nothing worth adding a package for.

## Usage

```js
import { record } from 'clockcassette';

const result = await record(
  async () => {
    const startedAt = Date.now();
    const jitter = Math.random();
    return startedAt + jitter;
  },
  { cassettePath: './cassettes/example.json' }
);
```

While `fn` runs, `Date.now`, `Math.random` and `setTimeout` still behave
normally — real values are returned and real timers still fire — but every
call is appended, in order, to the cassette written at `cassettePath`:

```json
{
  "version": 1,
  "recordedAt": "2026-09-06T00:00:00.000Z",
  "calls": [
    { "type": "Date.now", "seq": 0, "args": [], "result": 1757116800000 },
    { "type": "Math.random", "seq": 1, "args": [], "result": 0.4213 }
  ]
}
```

Later, `replay` feeds that cassette back to the same three globals, in the
same order, instead of producing real values — the wall-clock time, the
random jitter and the timer delay observed above happen again exactly:

```js
import { replay } from 'clockcassette';

const result = await replay(
  async () => {
    const startedAt = Date.now();
    const jitter = Math.random();
    return startedAt + jitter;
  },
  { cassettePath: './cassettes/example.json' }
);
```

If the code under replay calls the globals in a different order than they
were recorded, calls more of them than the cassette has, or never calls some
that were recorded, `replay` throws instead of returning a value that no
longer matches what actually happened.

For lower-level control, the sandbox itself is exported too:

```js
import { sandbox } from 'clockcassette';

sandbox.patch();
// ... code that calls Date.now() / Math.random() / setTimeout() ...
const calls = sandbox.getLog();
sandbox.unpatch();

sandbox.patchReplay(calls);
// ... code that calls the same globals, in the same order ...
sandbox.remaining(); // 0 once every recorded call has been consumed
sandbox.unpatch();
```

## Status

Built autonomously and gated on passing tests: every change ships only after
the automated test suite passes.
