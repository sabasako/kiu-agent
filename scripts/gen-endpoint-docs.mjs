// Regenerates docs/endpoints.md from a results file (state/snapshot.json from `kiu snapshot`,
// or any file with { results: [{ method, path, status, body|json }] }).
// Writes SHAPES ONLY (field names and types), never values, so the doc is safe to commit.
//
// Run: node scripts/gen-endpoint-docs.mjs <results.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { READ_ONLY, MARKS_OR_WRITES, endpointOf } from '../src/endpoints.mjs';

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/gen-endpoint-docs.mjs <results.json>'); process.exit(1); }
const { results } = JSON.parse(readFileSync(file, 'utf8'));

function shape(v, depth = 0) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return v.length ? `[${shape(v.find((x) => x !== null) ?? v[0], depth + 1)}]` : '[]';
  if (typeof v === 'object') {
    if (depth > 3) return '{...}';
    return `{ ${Object.entries(v).map(([k, x]) => `${k}: ${shape(x, depth + 1)}`).join(', ')} }`;
  }
  return typeof v;
}
const bodyKeys = (b) => (b && typeof b === 'object' && Object.keys(b).length ? `{ ${Object.entries(b).map(([k, x]) => `${k}: ${Array.isArray(x) ? 'array' : typeof x}`).join(', ')} }` : '-');

// keep the richest successful response per endpoint
const best = new Map();
for (const r of results) {
  const ep = endpointOf(r.path);
  const resp = r.json ?? r.body;
  const size = JSON.stringify(resp ?? '').length;
  const prev = best.get(ep);
  if (!prev || (r.status === 200 && (prev.status !== 200 || size > prev.size))) best.set(ep, { ...r, resp, size });
}

const lines = [
  '# LMS endpoints',
  '',
  'Base URL: `https://lms.kiu.edu.ge/student` + endpoint. Auth: `Authorization: Bearer <token>` (the `Student-Token` the web app keeps in localStorage).',
  '',
  '> Generated from real responses in October 2026, **shapes only** (no values). The LMS can change at any time: run `kiu discover` to diff against the live site and `kiu snapshot` for fresh data. Status 404/403 here means it did not work for a normal student account with the parameters tried, not that it never works.',
  '',
  '## Read-only endpoints (the guard allowlist)',
  '',
];
for (const ep of READ_ONLY) {
  const r = best.get(ep);
  lines.push(`### \`${ep}\``, '');
  if (!r) { lines.push('Not exercised yet.', ''); continue; }
  lines.push(`- Method: ${r.method}`, `- Body: ${bodyKeys(r.requestBody ?? (r.json ? undefined : null))}`, `- Status seen: ${r.status}`);
  if (r.status === 200) lines.push('', '```', shape(r.resp).slice(0, 1500), '```');
  lines.push('');
}
lines.push('## Writes and "marks as read" endpoints (never call without an explicit yes)', '');
for (const [ep, why] of Object.entries(MARKS_OR_WRITES)) lines.push(`- \`${ep}\`: ${why}`);
lines.push('', 'Everything else the frontend calls is listed by `kiu discover` as "unreviewed".', '');

writeFileSync(new URL('../docs/endpoints.md', import.meta.url), lines.join('\n'));
console.log(`wrote docs/endpoints.md (${best.size} endpoints with responses)`);
