# clockcassette

A zero-dependency Node library that intercepts `Date.now`, `Math.random` and
`setTimeout`, records every call and its real return value to a cassette file,
and (in a later milestone) replays that exact sequence so nondeterministic
code becomes reproducible in tests.

This milestone ships the **recorder**: patching the three globals, logging
every call in order, and writing the result to a JSON cassette file. Replay
and the `node:test` adapter are not built yet.

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

For lower-level control, the sandbox itself is exported too:

```js
import { sandbox } from 'clockcassette';

sandbox.patch();
// ... code that calls Date.now() / Math.random() / setTimeout() ...
const calls = sandbox.getLog();
sandbox.unpatch();
```

## Status

Built autonomously and gated on passing tests: every change ships only after
the automated test suite passes.
