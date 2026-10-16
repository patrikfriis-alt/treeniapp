// Unit test for the mesocycle week maths, extracted from index.html (no build step in this repo).
// Run: node scripts/test-mesocycle.mjs   (also under other time zones, e.g. TZ=America/New_York)
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const grab = (re, name) => { const m = html.match(re); assert.ok(m, `${name} not found in index.html`); return m[0]; };
const src = [
  grab(/const MESOCYCLE_WEEKS = \d+;/, 'MESOCYCLE_WEEKS'),
  ...['weeksBetweenMondays', 'getMesocycleWeek', 'rolledMesocycleStart']
    .map(n => grab(new RegExp(`\\r?\\nfunction ${n}\\([\\s\\S]*?\\r?\\n\\}\\r?\\n`), n)),
].join('\n');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(src + '\nthis.week = getMesocycleWeek; this.roll = rolledMesocycleStart;', ctx);
const { week, roll } = ctx;

// Basic cycle: start week = 1, +5 weeks = 6 (deload), +6 = 1 again, before start = null.
assert.equal(week('2026-10-12', '2026-10-12'), 1);
assert.equal(week('2026-10-12', '2026-11-16'), 6);
assert.equal(week('2026-10-12', '2026-11-23'), 1);
assert.equal(week('2026-10-12', '2026-10-05'), null);
assert.equal(week(null, '2026-10-12'), null);

// Year boundary with a 53-week ISO year: 2026-12-21 = W52, 2026-12-28 = W53, 2027-01-04 = W1.
const s1 = '2026-12-14'; // W51
assert.deepEqual(['2026-12-14', '2026-12-21', '2026-12-28', '2027-01-04', '2027-01-11', '2027-01-18', '2027-01-25'].map(d => week(s1, d)),
  [1, 2, 3, 4, 5, 6, 1]);
// Ordinary 52 → 1 transition: 2027-12-27 = W52 of 2027, 2028-01-03 = W1 of 2028.
assert.equal(week('2027-12-20', '2027-12-27'), 2);
assert.equal(week('2027-12-20', '2028-01-03'), 3);

// DST changes (EU: 29.3.2026 and 25.10.2026) don't shift the count.
assert.equal(week('2026-03-23', '2026-03-30'), 2);
assert.equal(week('2026-10-19', '2026-10-26'), 2);

// Rolling the start forward in whole 6-week steps.
assert.equal(roll('2026-09-07', '2026-10-12'), '2026-09-07');  // week 6: same cycle
assert.equal(roll('2026-09-07', '2026-10-19'), '2026-10-19');  // week 7 → new cycle starts this week
assert.equal(roll('2026-09-07', '2026-12-07'), '2026-11-30');  // 13 weeks later → 2 cycles on, week 2
assert.equal(week(roll('2026-09-07', '2026-12-07'), '2026-12-07'), 2);
assert.equal(roll('2026-12-14', '2027-01-25'), '2027-01-25');  // across the year boundary

console.log(`mesocycle: all cases pass (TZ=${process.env.TZ || 'system'})`);
