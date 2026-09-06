# clockcassette

A zero-dependency Node library that intercepts `Date.now`, `Math.random` and
`setTimeout`, records every call and its real return value to a cassette file,
and replays that exact sequence later so nondeterministic code becomes
reproducible in tests.

This milestone adds a **`node:test` adapter**: `useCassette` and
`cassetteTest` wrap a test body so it auto-records the first time it runs and
auto-replays every time after, including on CI.

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

`report` reads a cassette (by path, or an already-parsed object) and prints a
text summary of what it recorded:

```js
import { report } from 'clockcassette';

console.log(report('./cassettes/example.json'));
```

```
clockcassette report
recorded at: 2026-09-06T00:00:00.000Z
total calls: 3
entropy sources:
  Date.now: 1
  Math.random: 1
  setTimeout: 1

setTimeout detail:
  fired: 1/1
  delay range: 5ms - 5ms
```

`summarize` returns the same numbers as a plain object, for callers that want
to check counts programmatically instead of parsing text:

```js
import { summarize } from 'clockcassette';

const { total, byType } = summarize(cassette);
```

`cassetteTest` wraps `node:test`'s own `test()` so a test body runs under
record/replay automatically — no explicit `cassettePath` needed, and no
"record mode" flag to remember to flip back:

```js
import assert from 'node:assert/strict';
import { cassetteTest } from 'clockcassette';

cassetteTest('startedAt is a number', async () => {
  const startedAt = Date.now();
  assert.equal(typeof startedAt, 'number');
});
```

The first time this test runs (on a developer machine, with no cassette file
yet) it records real `Date.now`/`Math.random`/`setTimeout` calls to
`cassettes/startedat-is-a-number.json`, derived from the test name. Once that
file exists — commit it alongside the test — every later run, local or on
CI, replays the same values instead of producing new ones.

CI is detected from the standard `CI` environment variable (set by GitHub
Actions, and most other CI providers, automatically). On CI, a missing
cassette is a **hard error** instead of a silent recording: CI runs should
never write new fixtures, only verify against ones already committed.

`useCassette` is the lower-level function `cassetteTest` is built on, for
callers who want record/replay behaviour without going through the test
runner, or who want to pick the cassette path themselves:

```js
import { useCassette } from 'clockcassette';

await useCassette(
  'startedAt is a number',
  async () => Date.now(),
  { cassettePath: './cassettes/example.json' }
);
```

Both accept `{ cassettePath }` (an exact file) or `{ cassetteDir }` (a
directory to derive the filename in, from the test name); `{ ci: true|false }`
overrides CI auto-detection for testing the adapter itself.

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

## Golden-file tests

`examples/flaky-request-id.js` exports `createRequestId()`, a function whose
output mixes `Date.now()` and `Math.random()` — genuinely flaky, since two
calls never produce the same id. `test/golden.test.js` replays it against a
cassette committed to the repo (`test/golden/request-id.json`) and asserts
the *exact* resulting id, across several separate replay runs. That is the
whole point of clockcassette demonstrated end to end: code that is provably
nondeterministic on its own becomes something a test can pin to one fixed
value, forever, as long as the cassette stays committed alongside it.

## Status

Built autonomously and gated on passing tests: every change ships only after
the automated test suite passes.
