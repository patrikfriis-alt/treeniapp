// One-time (re-runnable) import: pulls fat-split, sodium, mineral, vitamin, and
// processing-method data from Fineli's official open dataset (Release 18, THL,
// CC-BY 4.0) via the GitHub mirror https://github.com/mafredri/fineli-sql, and
// generates a SQL file that updates existing fineli_foods rows in place.
//
// Usage: node scripts/import-fineli-extra-nutrients.mjs
// Output: scripts/fineli-extra-nutrients-import-01.sql, -02.sql, ... (paste each into
// the Supabase SQL editor in turn — the editor rejects one single ~1.5MB file as
// "too large", so the statements are chunked into smaller files instead).

import { readFileSync, writeFileSync } from 'node:fs';

const BASE = 'https://raw.githubusercontent.com/mafredri/fineli-sql/master/data/Fineli_Rel18_open';
const SB_URL = 'https://yznuzwbbyasgqeqllxic.supabase.co';
const SB_KEY = (() => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const m = html.match(/const SB_KEY = '([^']*)'/);
  if (!m) throw new Error('SB_KEY not found in index.html');
  return m[1];
})();

// EUFDNAME -> our column name, plus whether the source unit needs conversion.
// All of these are already in the unit we want to store (see spec's unit table) —
// no conversion needed, unlike the pre-existing salt mg->g conversion which happens
// at read time in searchFineli(), not at import time.
const COMPONENT_MAP = {
  FASAT:  'fat_saturated_per_100g',
  FAMCIS: 'fat_mono_per_100g',
  FAPU:   'fat_poly_per_100g',
  FATRN:  'fat_trans_per_100g',
  NA:     'sodium_per_100g',
  CA:     'calcium_per_100g',
  K:      'potassium_per_100g',
  MG:     'magnesium_per_100g',
  FE:     'iron_per_100g',
  ZN:     'zinc_per_100g',
  VITC:   'vitamin_c_per_100g',
  VITD:   'vitamin_d_per_100g',
};

function parseCsv(text) {
  return text.trim().split('\n').map(line => line.replace(/\r$/, '').split(';'));
}

async function fetchCsv(name) {
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`Failed to fetch ${name}: ${res.status}`);
  return parseCsv(await res.text());
}

function sqlNum(v) {
  if (v == null || v === '') return 'null';
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? String(n) : 'null';
}

function sqlStr(v) {
  if (v == null || v === '') return 'null';
  return `'${v.replace(/'/g, "''")}'`;
}

async function fetchAllIds() {
  // PostgREST caps responses at 1000 rows by default, so page through with Range headers.
  const ids = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const res = await fetch(`${SB_URL}/rest/v1/fineli_foods?select=id&order=id`, {
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        Range: `${offset}-${offset + pageSize - 1}`,
      },
    });
    if (!res.ok && res.status !== 206) throw new Error(`Failed to fetch existing ids: ${res.status}`);
    const page = await res.json();
    for (const r of page) ids.push(String(r.id));
    if (page.length < pageSize) break;
  }
  return ids;
}

async function main() {
  console.log('Fetching existing fineli_foods ids from Supabase...');
  const existingIds = new Set(await fetchAllIds());
  console.log(`${existingIds.size} existing fineli_foods rows.`);

  console.log('Fetching food.csv and component_value.csv from GitHub mirror...');
  const [foodRows, componentRows] = await Promise.all([
    fetchCsv('food.csv'),
    fetchCsv('component_value.csv'),
  ]);

  const foodHeader = foodRows[0];
  const foodIdIdx = foodHeader.indexOf('FOODID');
  const processIdx = foodHeader.indexOf('PROCESS');
  const processByFoodId = new Map();
  for (const row of foodRows.slice(1)) {
    const id = row[foodIdIdx];
    if (existingIds.has(id)) processByFoodId.set(id, row[processIdx]);
  }

  const cvHeader = componentRows[0];
  const cvFoodIdIdx = cvHeader.indexOf('FOODID');
  const cvNameIdx = cvHeader.indexOf('EUFDNAME');
  const cvValueIdx = cvHeader.indexOf('BESTLOC');
  const valuesByFoodId = new Map(); // id -> { column: value }
  for (const row of componentRows.slice(1)) {
    const id = row[cvFoodIdIdx];
    if (!existingIds.has(id)) continue;
    const column = COMPONENT_MAP[row[cvNameIdx]];
    if (!column) continue;
    if (!valuesByFoodId.has(id)) valuesByFoodId.set(id, {});
    valuesByFoodId.get(id)[column] = row[cvValueIdx];
  }

  const columns = Object.values(COMPONENT_MAP);
  const statements = [];
  for (const id of existingIds) {
    const values = valuesByFoodId.get(id);
    const process = processByFoodId.get(id);
    if (!values && !process) continue;
    const sets = columns
      .filter(col => values && values[col] !== undefined)
      .map(col => `${col} = ${sqlNum(values[col])}`);
    if (process) sets.push(`process_code = ${sqlStr(process)}`);
    if (sets.length === 0) continue;
    statements.push(`update fineli_foods set ${sets.join(', ')} where id = ${id};`);
  }

  // The Supabase SQL editor rejects one ~1.5MB paste as "too large" — split into
  // chunks of CHUNK_SIZE statements (~110KB per file) so each paste succeeds.
  const CHUNK_SIZE = 300;
  const chunkCount = Math.ceil(statements.length / CHUNK_SIZE);
  for (let i = 0; i < chunkCount; i++) {
    const chunk = statements.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const num = String(i + 1).padStart(2, '0');
    const lines = [
      `-- Generated by scripts/import-fineli-extra-nutrients.mjs — chunk ${num} of ${String(chunkCount).padStart(2, '0')}.`,
      '-- Paste this whole file into the Supabase SQL editor and run it, then move to the next chunk file.',
      '-- Only updates fineli_foods rows that already exist locally; adds no new rows.',
      ...chunk,
    ];
    writeFileSync(
      new URL(`./fineli-extra-nutrients-import-${num}.sql`, import.meta.url),
      lines.join('\n') + '\n',
    );
  }
  console.log(`Wrote ${statements.length} UPDATE statements across ${chunkCount} files: scripts/fineli-extra-nutrients-import-01.sql .. -${String(chunkCount).padStart(2, '0')}.sql`);
}

main().catch(err => { console.error(err); process.exit(1); });
