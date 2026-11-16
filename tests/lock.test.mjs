// The run lock (src/lock.mjs): runs in separate processes serialize, stale locks are taken over,
// a live one makes the waiter time out. Everything in a temp folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, utimesSync, statSync, readdirSync } from 'node:fs';
import { tmpdir, hostname } from 'node:os';
import path from 'node:path';
import { acquireLock, LockTimeoutError, readLock } from '../src/lock.mjs';

const LOCK_URL = new URL('../src/lock.mjs', import.meta.url).href;
const dir = () => mkdtempSync(path.join(tmpdir(), 'kiu-lock-'));

// a child process that takes the lock, writes "start"/"end" lines around holding it for HOLD ms,
// then releases it (MODE=release), process.exit()s without releasing (exit) or dies by SIGKILL (kill)
const HOLDER = `
  import { acquireLock } from ${JSON.stringify(LOCK_URL)};
  import { appendFileSync } from 'node:fs';
  const { LOCK, LOG, NAME, HOLD, MODE = 'release' } = process.env;
  const lock = await acquireLock(LOCK, { cmd: NAME, pollMs: 20 });
  appendFileSync(LOG, 'start ' + NAME + '\\n');
  await new Promise((r) => setTimeout(r, Number(HOLD)));
  appendFileSync(LOG, 'end ' + NAME + '\\n');
  if (MODE === 'kill') process.kill(process.pid, 'SIGKILL');
  if (MODE === 'exit') process.exit(0);
  lock.release();
`;
const holder = (env) => new Promise((resolve) => {
  const child = spawn(process.execPath, ['--input-type=module', '-e', HOLDER], { env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  child.stderr.on('data', (c) => { err += c; });
  child.on('close', (code, signal) => resolve({ code, signal, err, pid: child.pid }));
});
const lines = (file) => readFileSync(file, 'utf8').trim().split('\n');
// every "start X" is followed directly by "end X": no two holders overlapped
const assertSerialized = (log, n) => {
  const l = lines(log);
  assert.equal(l.length, 2 * n, l.join(' | '));
  for (let i = 0; i < l.length; i += 2) {
    assert.match(l[i], /^start /);
    assert.equal(l[i + 1], l[i].replace('start', 'end'));
  }
};
const deadPid = () => spawnSync(process.execPath, ['-e', '']).pid;
const writeLock = (file, info, ageMs = 0) => {
  writeFileSync(file, typeof info === 'string' ? info : JSON.stringify(info));
  const t = new Date(Date.now() - ageMs);
  utimesSync(file, t, t);
};

test('two concurrent runs serialize, and the lock is gone afterwards', async () => {
  const d = dir(), LOCK = path.join(d, 'run.lock'), LOG = path.join(d, 'log');
  const [a, b] = await Promise.all([holder({ LOCK, LOG, NAME: 'a', HOLD: 300 }), holder({ LOCK, LOG, NAME: 'b', HOLD: 300 })]);
  assert.equal(a.code, 0, a.err);
  assert.equal(b.code, 0, b.err);
  assertSerialized(LOG, 2);
  assert.equal(existsSync(LOCK), false);
  assert.deepEqual(readdirSync(d).sort(), ['log']); // no temp files left
});

test('several waiters on a stale lock: one takes over at a time', async () => {
  const d = dir(), LOCK = path.join(d, 'run.lock'), LOG = path.join(d, 'log');
  writeLock(LOCK, { pid: deadPid(), host: hostname(), cmd: 'old', startedAt: new Date().toISOString(), nonce: 'dead' });
  const runs = await Promise.all(['a', 'b', 'c', 'd'].map((NAME) => holder({ LOCK, LOG, NAME, HOLD: 100 })));
  for (const r of runs) assert.equal(r.code, 0, r.err);
  assertSerialized(LOG, 4);
  assert.equal(existsSync(LOCK), false);
});

test('a lock left by a killed run (SIGKILL) is taken over right away', async () => {
  const d = dir(), LOCK = path.join(d, 'run.lock'), LOG = path.join(d, 'log');
  const k = await holder({ LOCK, LOG, NAME: 'killed', HOLD: 10, MODE: 'kill' });
  assert.equal(k.signal, 'SIGKILL');
  assert.equal(readLock(LOCK).info.pid, k.pid); // still there, owner dead
  const t = Date.now();
  const lock = await acquireLock(LOCK, { waitMs: 5000, pollMs: 20 });
  assert.ok(Date.now() - t < 1000);
  assert.equal(readLock(LOCK).info.nonce, lock.info.nonce);
  lock.release();
  assert.equal(existsSync(LOCK), false);
});

test('process.exit() without release still frees the lock', async () => {
  const d = dir(), LOCK = path.join(d, 'run.lock'), LOG = path.join(d, 'log');
  const r = await holder({ LOCK, LOG, NAME: 'x', HOLD: 10, MODE: 'exit' });
  assert.equal(r.code, 0, r.err);
  assert.equal(existsSync(LOCK), false);
});

test('a live pid whose heartbeat stopped (pid reused) counts as stale', async () => {
  const d = dir(), LOCK = path.join(d, 'run.lock');
  writeLock(LOCK, { pid: process.pid, host: hostname(), cmd: 'ghost', startedAt: '2030-01-01T00:00:00Z', nonce: 'ghost' }, 10 * 60_000);
  const lock = await acquireLock(LOCK, { waitMs: 1000, pollMs: 20 });
  assert.equal(readLock(LOCK).info.nonce, lock.info.nonce);
  lock.release();
});

test('a live lock: the waiter says so once, then times out with a clear error, and leaves it alone', async () => {
  const d = dir(), LOCK = path.join(d, 'run.lock');
  writeLock(LOCK, { pid: process.pid, host: hostname(), cmd: 'assignments', startedAt: '2030-01-01T00:00:00Z', nonce: 'live' });
  const waits = [];
  await assert.rejects(acquireLock(LOCK, { waitMs: 300, pollMs: 20, onWait: (o) => waits.push(o.cmd) }),
    (e) => e instanceof LockTimeoutError && /another kiu run \(pid \d+, "assignments"/.test(e.message));
  assert.deepEqual(waits, ['assignments']);
  assert.equal(readLock(LOCK).info.nonce, 'live');
  assert.deepEqual(readdirSync(d), ['run.lock']);
});

test('an unreadable lock file: busy while fresh, taken over once old', async () => {
  const d = dir(), LOCK = path.join(d, 'run.lock');
  writeLock(LOCK, '');
  await assert.rejects(acquireLock(LOCK, { waitMs: 200, pollMs: 20 }), LockTimeoutError);
  writeLock(LOCK, '', 60_000);
  const lock = await acquireLock(LOCK, { waitMs: 1000, pollMs: 20 });
  lock.release();
});

test('the heartbeat keeps a long run fresh', async () => {
  const d = dir(), LOCK = path.join(d, 'run.lock');
  const lock = await acquireLock(LOCK, { heartbeatMs: 30 });
  const old = new Date(Date.now() - 10 * 60_000);
  utimesSync(LOCK, old, old);
  await new Promise((r) => setTimeout(r, 120));
  assert.ok(Date.now() - statSync(LOCK).mtimeMs < 1000);
  lock.release();
  lock.release(); // twice is fine
  assert.equal(existsSync(LOCK), false);
});

test('a takeover in progress is waited for; an abandoned one is cleared', async () => {
  const d = dir(), LOCK = path.join(d, 'run.lock');
  writeLock(LOCK, { pid: deadPid(), host: hostname(), cmd: 'old', startedAt: '2030-01-01T00:00:00Z', nonce: 'dead' });
  writeLock(`${LOCK}.takeover`, '');
  await assert.rejects(acquireLock(LOCK, { waitMs: 200, pollMs: 20 }), LockTimeoutError);
  writeLock(`${LOCK}.takeover`, '', 60_000);
  const lock = await acquireLock(LOCK, { waitMs: 1000, pollMs: 20 });
  lock.release();
  assert.deepEqual(readdirSync(d), []);
});
