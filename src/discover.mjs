// Re-derives the LMS API from the live web app: downloads its JavaScript bundle, finds
// every endpoint the frontend calls (with the request-body keys it sends), and diffs that
// against endpoints.mjs. Read-only: it fetches public JS files, never calls the API.
//
// It only REPORTS. A new endpoint is never added to READ_ONLY automatically: names lie
// (readAllEvent, acknowledgeOverdue, ...), so a human or agent has to read the calling code
// first (see AGENTS.md "Repairing").
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { STATE } from './config.mjs';
import { READ_ONLY, MARKS_OR_WRITES, endpointOf } from './endpoints.mjs';

const SITE = 'https://lms.kiu.edu.ge';

async function bundle() {
  const html = await (await fetch(`${SITE}/`)).text();
  const files = new Map();
  const queue = [...html.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map((m) => m[1]);
  // chunks import other chunks; follow until nothing new turns up
  while (queue.length) {
    const f = queue.shift().replace(/^\.?\//, '');
    if (files.has(f) || f.startsWith('http')) continue;
    const r = await fetch(`${SITE}/${f}`);
    if (!r.ok) continue;
    const js = await r.text();
    files.set(f, js);
    for (const m of js.matchAll(/chunk-[A-Za-z0-9_-]+\.js/g)) if (!files.has(m[0])) queue.push(m[0]);
  }
  return files;
}

export function extractEndpoints(src) {
  const found = new Map(); // endpoint -> { verbs:Set, keys:Set, sample }
  const add = (verb, url, keys, sample) => {
    const ep = endpointOf(url.replace(/\$\{[^}]*\}/g, '')).replace(/[^/]+$/, (last) => (url.includes('?') ? '' : last));
    if (!ep.startsWith('/') || ep.length < 3) return;
    const e = found.get(ep) ?? { verbs: new Set(), keys: new Set(), sample: sample.slice(0, 300) };
    e.verbs.add(verb.toUpperCase());
    keys.forEach((k) => e.keys.add(k));
    found.set(ep, e);
  };
  // service methods: name(e){return this.http.post(`/path`,e)} and inline calls with object bodies
  for (const m of src.matchAll(/this\.http\.(get|post|put|delete)(?:<[^>]*>)?\(\s*[`"']([^`"']+)[`"']\s*(?:\+[^,)]*)?(?:,\s*(\{[^{}]{0,400}\}|\w+))?/g)) {
    const [, verb, url, body] = m;
    const keys = body?.startsWith('{') ? [...body.matchAll(/(?:^|[{,])\s*(\w+)\s*:/g)].map((k) => k[1]) : [];
    // when the body is a variable, look up how the wrapping method is called elsewhere
    if (!keys.length) {
      const before = src.slice(Math.max(0, m.index - 80), m.index);
      const method = before.match(/(\w+)\(\w*\)\{(?:let [^;]*;)?return\s*$/)?.[1];
      if (method) {
        for (const c of src.matchAll(new RegExp(`\\.${method}\\(\\{([^{}]{0,400})\\}`, 'g'))) {
          for (const k of c[1].matchAll(/(?:^|,)\s*(\w+)\s*:/g)) keys.push(k[1]);
        }
      }
    }
    add(verb, url, keys, src.slice(Math.max(0, m.index - 120), m.index + 180));
  }
  return found;
}

// A hint for triage only. Never treat "looks like a read" as proof (see readAllEvent).
const WRITE_WORDS = /add|remove|delete|save|upload|update|cancel|write|attach|change|send|create|edit|buy|reserve|register|mark|read|seen|acknowledge|logout|export|check/i;
const hint = (ep) => (WRITE_WORDS.test(ep.split('/').filter(Boolean).pop() ?? '') ? 'looks like a write' : 'looks like a read, still unverified');

export async function discover() {
  const files = await bundle();
  const found = extractEndpoints([...files.values()].join('\n'));
  const known = new Set([...READ_ONLY, ...Object.keys(MARKS_OR_WRITES)]);
  const fresh = [...found.keys()].filter((ep) => !known.has(ep) && !ep.startsWith('/assets')).sort();
  const gone = [...READ_ONLY].filter((ep) => !found.has(ep)).sort();

  const report = {
    fetchedAt: new Date().toISOString(),
    bundleFiles: files.size,
    endpointsInBundle: found.size,
    unreviewed: fresh.map((ep) => ({ endpoint: ep, hint: hint(ep), verbs: [...found.get(ep).verbs], bodyKeys: [...found.get(ep).keys], codeSample: found.get(ep).sample })),
    allowlistedButNotInBundle: gone,
    all: Object.fromEntries([...found].map(([ep, e]) => [ep, { verbs: [...e.verbs], bodyKeys: [...e.keys], status: READ_ONLY.has(ep) ? 'read-only' : MARKS_OR_WRITES[ep] ? `write: ${MARKS_OR_WRITES[ep]}` : 'unreviewed' }])),
  };
  mkdirSync(STATE, { recursive: true });
  const file = path.join(STATE, 'discover.json');
  writeFileSync(file, JSON.stringify(report, null, 2));
  return { report, file };
}
