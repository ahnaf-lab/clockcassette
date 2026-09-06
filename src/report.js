import fs from 'node:fs';
import path from 'node:path';

const KNOWN_TYPES = ['Date.now', 'Math.random', 'setTimeout'];

/**
 * Load a cassette from disk and validate its shape the same way replay()
 * does, so a malformed file is reported clearly instead of throwing deep
 * inside summary math.
 *
 * @param {string} cassettePath
 * @returns {{ version?: number, recordedAt?: string, calls: Array<object> }}
 */
function readCassette(cassettePath) {
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
  return cassette;
}

/**
 * Summarise a cassette: how many calls of each entropy source it holds, the
 * total call count, and (for setTimeout) the range of delays recorded. Used
 * to build both the structured summary and the human-readable text report.
 *
 * @param {{ calls: Array<object> }} cassette
 * @returns {{
 *   total: number,
 *   byType: Record<string, number>,
 *   setTimeoutDelays: { min: number, max: number } | null,
 *   setTimeoutFired: number,
 * }}
 */
export function summarize(cassette) {
  if (!cassette || !Array.isArray(cassette.calls)) {
    throw new TypeError('summarize() requires a cassette with a "calls" array');
  }

  const byType = {};
  for (const type of KNOWN_TYPES) byType[type] = 0;

  let delayMin = null;
  let delayMax = null;
  let setTimeoutFired = 0;

  for (const call of cassette.calls) {
    const type = call && call.type;
    byType[type] = (byType[type] || 0) + 1;

    if (type === 'setTimeout') {
      const delay = Array.isArray(call.args) ? call.args[0] : undefined;
      if (typeof delay === 'number') {
        delayMin = delayMin === null ? delay : Math.min(delayMin, delay);
        delayMax = delayMax === null ? delay : Math.max(delayMax, delay);
      }
      if (call.fired) setTimeoutFired++;
    }
  }

  return {
    total: cassette.calls.length,
    byType,
    setTimeoutDelays: delayMin === null ? null : { min: delayMin, max: delayMax },
    setTimeoutFired,
  };
}

/**
 * Render a text summary of a cassette's recorded entropy sources and call
 * counts, suitable for printing to a terminal.
 *
 * @param {{ version?: number, recordedAt?: string, calls: Array<object> }|string} source
 *   either a parsed cassette object or a path to a cassette JSON file
 * @returns {string}
 */
export function report(source) {
  const cassette = typeof source === 'string' ? readCassette(source) : source;
  if (!cassette || !Array.isArray(cassette.calls)) {
    throw new TypeError('report() requires a cassette object or path with a "calls" array');
  }

  const summary = summarize(cassette);
  const lines = [];

  lines.push('clockcassette report');
  if (cassette.recordedAt) lines.push(`recorded at: ${cassette.recordedAt}`);
  lines.push(`total calls: ${summary.total}`);
  lines.push('');
  lines.push('entropy sources:');

  const knownWithCounts = KNOWN_TYPES.map((type) => [type, summary.byType[type]]);
  const unknownTypes = Object.keys(summary.byType)
    .filter((type) => !KNOWN_TYPES.includes(type))
    .sort();

  for (const [type, count] of knownWithCounts) {
    lines.push(`  ${type}: ${count}`);
  }
  for (const type of unknownTypes) {
    lines.push(`  ${type}: ${summary.byType[type]}`);
  }

  if (summary.byType['setTimeout'] > 0) {
    lines.push('');
    lines.push('setTimeout detail:');
    lines.push(`  fired: ${summary.setTimeoutFired}/${summary.byType['setTimeout']}`);
    if (summary.setTimeoutDelays) {
      lines.push(`  delay range: ${summary.setTimeoutDelays.min}ms - ${summary.setTimeoutDelays.max}ms`);
    }
  }

  return lines.join('\n');
}
