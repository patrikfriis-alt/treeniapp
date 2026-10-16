// Unit test for fetchAllRows (index.html): pages past PostgREST's 1000-row cap.
// Run: node scripts/test-fetch-all-rows.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const src = html.match(/const SB_PAGE_SIZE = \d+;\r?\nasync function fetchAllRows\([\s\S]*?\r?\n\}\r?\n/);
assert.ok(src, 'fetchAllRows not found');
const ctx = {}; vm.createContext(ctx); vm.runInContext(src[0] + '\nthis.f = fetchAllRows;', ctx);

// Fake query builder that behaves like PostgREST: .range(a, b) returns at most 1000 rows.
const fakeTable = (n, failOnPage = null) => () => ({
  range(a, b) {
    if (failOnPage != null && a / 1000 === failOnPage) return Promise.resolve({ data: null, error: { message: 'boom' } });
    const end = Math.min(b, a + 999, n - 1);
    return Promise.resolve({ data: a >= n ? [] : Array.from({ length: end - a + 1 }, (_, i) => ({ id: a + i })), error: null });
  },
});

for (const n of [0, 1, 999, 1000, 1001, 1141, 2000, 3000]) {
  const { data, error } = await ctx.f(fakeTable(n));
  assert.equal(error, null); assert.equal(data.length, n, `n=${n}`);
  assert.deepEqual(JSON.parse(JSON.stringify(data.map(r => r.id))), Array.from({ length: n }, (_, i) => i), `order n=${n}`);
}
const failed = await ctx.f(fakeTable(3000, 1));
assert.equal(failed.data, null); assert.equal(failed.error.message, 'boom');
console.log('fetchAllRows: all cases pass (0…3000 rows, page boundaries, error)');
