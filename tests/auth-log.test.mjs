// The auth log (src/auth-log.mjs) and the CLI's line per run. Synthetic data, temp folders.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { appendAuthLog, readAuthLog, readCounter, summarize } from '../src/auth-log.mjs';

const dir = () => mkdtempSync(path.join(tmpdir(), 'kiu-authlog-'));
const CLI = new URL('../src/cli.mjs', import.meta.url).pathname;

const NOW = Date.parse('2030-03-10T12:00:00Z');
const row = (at, o = {}) => ({ at, source: 'cron', cmd: 'assignments', ok: true, exit: 0, secs: 2, passkeyLogin: false, counterBefore: 10, counter: 10, ...o });
const ROWS = [
  row('2030-03-08T20:30:00Z', { passkeyLogin: true, counterBefore: 10, counter: 11, secs: 9 }), // 9 Mar 00:30 in Tbilisi
  row('2030-03-09T08:00:00Z', { counterBefore: 11, counter: 11 }),
  row('2030-03-09T18:00:00Z', { source: 'cli', cmd: 'due', counterBefore: 11, counter: 11 }),
  row('2030-03-10T06:00:00Z', { ok: false, exit: 1, error: 'HTTP 502', counterBefore: 11, counter: 11 }),
  row('2030-03-10T07:00:00Z', { passkeyLogin: true, counterBefore: 11, counter: 12 }),
];

test('appendAuthLog / readAuthLog: one JSON line per run, filtered by days, bad lines skipped', () => {
  const file = path.join(dir(), 'auth-log.jsonl');
  assert.deepEqual(readAuthLog(file), []);
  appendAuthLog(file, row('2030-02-01T00:00:00Z'));
  for (const r of ROWS) appendAuthLog(file, r);
  writeFileSync(file, readFileSync(file, 'utf8') + 'not json\n');
  assert.equal(readFileSync(file, 'utf8').split('\n').filter(Boolean).length, 7);
  assert.deepEqual(readAuthLog(file, { days: 14, now: NOW }), ROWS);
  assert.deepEqual(readAuthLog(file, { days: 1, now: NOW }).map((r) => r.at), ['2030-03-09T18:00:00Z', '2030-03-10T06:00:00Z', '2030-03-10T07:00:00Z']);
});

test('readCounter', () => {
  const d = dir();
  writeFileSync(path.join(d, 'c.json'), JSON.stringify({ signCount: 42, savedAt: '2030-01-01T00:00:00Z' }));
  assert.equal(readCounter(path.join(d, 'c.json')), 42);
  assert.equal(readCounter(path.join(d, 'missing.json')), null);
});

test('summarize: totals, per source, per Tbilisi day, token lifetime, last counter', () => {
  assert.equal(summarize(ROWS, { days: 3 }), [
    'last 3 days: 5 runs, 2 passkey logins (40%), 2 reused token, 1 failed',
    '  cron: 4 runs, 2 passkey logins (50%), 1 reused token, 1 failed',
    '  cli: 1 runs, 0 passkey logins (0%), 1 reused token, 0 failed',
    '',
    'per day (Tbilisi):',
    '  2030-03-09  3 runs, 1 passkey logins (33%), 2 reused token, 0 failed',
    '  2030-03-10  2 runs, 1 passkey logins (50%), 0 reused token, 1 failed',
    '',
    'longest a token was still accepted after its login: 1290 min',
    'last passkey counter: 12',
  ].join('\n'));
  assert.equal(summarize([], { days: 7 }), 'no kiu runs in the last 7 days');
});

test('summarize: lines without ok (exit only) and a counter that went backwards', () => {
  const s = summarize([
    { at: '2030-03-09T08:00:00Z', source: 'manual', cmd: 'due', exit: 0, passkeyLogin: false, counter: 5 },
    { at: '2030-03-09T09:00:00Z', source: 'manual', cmd: 'due', exit: 1, passkeyLogin: false, counter: 5 },
    row('2030-03-09T10:00:00Z', { counterBefore: 9, counter: 7 }),
  ]);
  assert.match(s, /^last 14 days: 3 runs, 0 passkey logins \(0%\), 2 reused token, 1 failed/);
  assert.match(s, /WARNING: the passkey counter went backwards in 1 run/);
});

// the CLI in a temp KIU_HOME, with no passkey: `login` fails before any network call
const cli = (home, args, env = {}) => new Promise((resolve) => {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('KIU_')));
  const child = spawn(process.execPath, [CLI, ...args], { env: { ...clean, KIU_HOME: home, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  child.stdout.on('data', (c) => { out += c; });
  child.stderr.on('data', (c) => { err += c; });
  child.on('close', (code) => resolve({ code, out, err }));
});

test('CLI: a locked command writes one auth-log line and releases the lock; `auth-log` summarizes', async () => {
  const home = dir();
  const r = await cli(home, ['login'], { KIU_SOURCE: 'test' });
  assert.equal(r.code, 1);
  assert.match(r.err, /no passkey yet/);
  const lines = readFileSync(path.join(home, 'state/auth-log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 1);
  const [l] = lines;
  assert.deepEqual({ ...l, at: typeof l.at, secs: typeof l.secs }, {
    at: 'string', source: 'test', cmd: 'login', ok: false, exit: 1, secs: 'number',
    passkeyLogin: false, counterBefore: null, counter: null, error: 'no passkey yet: run `kiu setup-passkey` first (see AGENTS.md setup)',
  });
  assert.equal(existsSync(path.join(home, 'state/run.lock')), false);

  const s = await cli(home, ['auth-log', '1']);
  assert.equal(s.code, 0, s.err);
  assert.match(s.out, /^last 1 days: 1 runs, 0 passkey logins \(0%\), 0 reused token, 1 failed\n {2}test: 1 runs/);

  // commands that never touch the LMS take no lock and write no line
  assert.equal((await cli(home, ['help'])).code, 0);
  assert.equal(readFileSync(path.join(home, 'state/auth-log.jsonl'), 'utf8').trim().split('\n').length, 1);
});
