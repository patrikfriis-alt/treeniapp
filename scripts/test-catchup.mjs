// Unit test for computeWeekCatchup, extracted from index.html (no build step in this repo).
// Run: node scripts/test-catchup.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const src = html.match(/\r?\nfunction computeWeekCatchup\([\s\S]*?\r?\n\}\r?\n/);
assert.ok(src, 'computeWeekCatchup not found in index.html');
const ctx = {}; vm.createContext(ctx); vm.runInContext(src[0] + '\nthis.f = computeWeekCatchup;', ctx);
const f = ctx.f;

const program = {
  t1: { name: 'Treeni 1', ex: [{ n: 'Penkki', t: '3×8', s: 3 }, { n: 'Soutu', t: '3×10', s: 3 }], collectsCatchup: false },
  t2: { name: 'Treeni 2', ex: [{ n: 'Ylätalja', t: '3×10', s: 3 }, { n: 'Reverse Pec Deck', t: '3×15', s: 3 }], collectsCatchup: false },
  t5: { name: 'Treeni 5', ex: [{ n: 'Reverse Pec Deck', t: '3×15', s: 3 }, { n: 'Pohjenousu', t: '4×12', s: 4 }], collectsCatchup: true },
  lepo: { name: 'Lepo', ex: [], collectsCatchup: false },
};
const set = (n, kg = 50, reps = 10) => ({ set_number: n, weight_kg: kg, reps });
const week = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];
const days = (map) => Object.fromEntries(week.map((d, i) => [d, map[i] || 'lepo']));
const run = (o) => JSON.parse(JSON.stringify(f(o)));

// 1. Missing sets in a done workout → catch-up; untouched exercise counts fully.
assert.deepEqual(run({
  doneSessions: [{ workout_date: week[0], session_type: 't1', is_done: true }],
  setsByDate: { [week[0]]: { Penkki: [set(1), set(2), set(3)], Soutu: [set(1)] } },
  program, daySessionByDate: days({ 0: 't1', 6: 't5' }), viewDate: week[6],
}), { Soutu: { remaining: 2, origins: ['Treeni 1'], targetDisplay: '3×10' } });

// 2. Not-done workout → ignored, even with missing sets.
assert.deepEqual(run({
  doneSessions: [],
  setsByDate: { [week[0]]: { Penkki: [set(1)] } },
  program, daySessionByDate: days({ 0: 't1', 6: 't5' }), viewDate: week[6],
}), {});

// 3. Same exercise missing in two workouts → combined, both origins listed.
assert.deepEqual(run({
  doneSessions: [{ workout_date: week[1], session_type: 't2', is_done: true },
                 { workout_date: week[2], session_type: 't2', is_done: true }],
  setsByDate: { [week[1]]: { Ylätalja: [set(1), set(2), set(3)], 'Reverse Pec Deck': [set(1), set(2)] },
                [week[2]]: { Ylätalja: [set(1), set(2), set(3)], 'Reverse Pec Deck': [set(1)] } },
  program, daySessionByDate: days({ 1: 't2', 2: 't2', 6: 't5' }), viewDate: week[6],
}), { 'Reverse Pec Deck': { remaining: 3, origins: ['Treeni 2'], targetDisplay: '3×15' } });

// 4. Rows without weight AND reps don't count as logged.
assert.deepEqual(run({
  doneSessions: [{ workout_date: week[0], session_type: 't1', is_done: true }],
  setsByDate: { [week[0]]: { Penkki: [set(1), set(2), { set_number: 3, weight_kg: null, reps: null }], Soutu: [set(1), set(2), set(3)] } },
  program, daySessionByDate: days({ 0: 't1', 6: 't5' }), viewDate: week[6],
}), { Penkki: { remaining: 1, origins: ['Treeni 1'], targetDisplay: '3×8' } });

// 5. A collecting workout never generates catch-up itself, even when done with missing sets.
assert.deepEqual(run({
  doneSessions: [{ workout_date: week[4], session_type: 't5', is_done: true }],
  setsByDate: { [week[4]]: { Pohjenousu: [set(1)] } },
  program, daySessionByDate: days({ 4: 't5', 6: 't5' }), viewDate: week[6],
}), {});

// 6. Caught up on an EARLIER collecting day this week → subtracted on the later one.
//    Fri (t5): own Reverse Pec Deck 3 + 1 catch-up logged = 4 sets → 1 caught up of 2.
assert.deepEqual(run({
  doneSessions: [{ workout_date: week[1], session_type: 't2', is_done: true }],
  setsByDate: { [week[1]]: { Ylätalja: [set(1), set(2), set(3)], 'Reverse Pec Deck': [set(1)] },
                [week[4]]: { 'Reverse Pec Deck': [set(1), set(2), set(3), set(4)] } },
  program, daySessionByDate: days({ 1: 't2', 4: 't5', 6: 't5' }), viewDate: week[6],
}), { 'Reverse Pec Deck': { remaining: 1, origins: ['Treeni 2'], targetDisplay: '3×15' } });

// 7. The viewed day's own logged sets are NOT subtracted (they fill the rows shown).
assert.deepEqual(run({
  doneSessions: [{ workout_date: week[0], session_type: 't1', is_done: true }],
  setsByDate: { [week[0]]: { Penkki: [set(1), set(2), set(3)], Soutu: [set(1)] },
                [week[6]]: { Soutu: [set(1), set(2)] } },
  program, daySessionByDate: days({ 0: 't1', 6: 't5' }), viewDate: week[6],
}), { Soutu: { remaining: 2, origins: ['Treeni 1'], targetDisplay: '3×10' } });

// 8. Everything done → nothing.
assert.deepEqual(run({
  doneSessions: [{ workout_date: week[0], session_type: 't1', is_done: true }],
  setsByDate: { [week[0]]: { Penkki: [set(1), set(2), set(3)], Soutu: [set(1), set(2), set(3)] } },
  program, daySessionByDate: days({ 0: 't1', 6: 't5' }), viewDate: week[6],
}), {});

// 9. Same exercise missing in two DIFFERENT workouts → one entry, origins in date order, summed, target from earlier.
const program2 = { ...program, t1: { ...program.t1, ex: [...program.t1.ex, { n: 'Reverse Pec Deck', t: '3×12', s: 3 }] } };
assert.deepEqual(run({
  doneSessions: [{ workout_date: week[0], session_type: 't1', is_done: true },
                 { workout_date: week[1], session_type: 't2', is_done: true }],
  setsByDate: { [week[0]]: { Penkki: [set(1), set(2), set(3)], Soutu: [set(1), set(2), set(3)], 'Reverse Pec Deck': [set(1)] },
                [week[1]]: { Ylätalja: [set(1), set(2), set(3)], 'Reverse Pec Deck': [set(1), set(2)] } },
  program: program2, daySessionByDate: days({ 0: 't1', 1: 't2', 6: 't5' }), viewDate: week[6],
}), { 'Reverse Pec Deck': { remaining: 3, origins: ['Treeni 1', 'Treeni 2'], targetDisplay: '3×12' } });

// 10. Catch-up logged on a LATER collecting day (Sun) is subtracted when viewing an EARLIER one (Fri).
assert.deepEqual(run({
  doneSessions: [{ workout_date: week[1], session_type: 't2', is_done: true }],
  setsByDate: { [week[1]]: { Ylätalja: [set(1), set(2), set(3)], 'Reverse Pec Deck': [set(1)] },
                [week[6]]: { 'Reverse Pec Deck': [set(1), set(2), set(3), set(4)] } },
  program, daySessionByDate: days({ 1: 't2', 4: 't5', 6: 't5' }), viewDate: week[4],
}), { 'Reverse Pec Deck': { remaining: 1, origins: ['Treeni 2'], targetDisplay: '3×15' } });

console.log('computeWeekCatchup: all 10 cases pass');
// catchupExId: stable, negative, distinct for distinct names.
const idSrc = html.match(/\r?\nfunction catchupExId\([\s\S]*?\r?\n\}\r?\n/);
assert.ok(idSrc, 'catchupExId not found');
vm.runInContext(idSrc[0] + '\nthis.id = catchupExId;', ctx);
const a = ctx.id('Yksikätinen soutulaite'), b = ctx.id('Yksikätinen soutulaite'), c = ctx.id('Reverse Pec Deck');
assert.equal(a, b); assert.ok(a < 0 && Number.isInteger(a)); assert.notEqual(a, c);
console.log('catchupExId: ok');
