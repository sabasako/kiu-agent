// Run lock: one kiu run at a time per state folder.
//
// Why: every passkey sign-in is a signature with a counter, and Microsoft refuses a passkey whose
// counter does not go up (it looks cloned). Two runs that sign in at the same time both start
// from the same saved counter (state/passkey-counter.json), so Microsoft sees the same value twice
// and refuses the second, and whichever run saves last can move the saved counter backwards, which
// breaks every later login. A scheduled sync and a manual run overlapping is enough for that, so
// every command that can log in or call the API holds this lock for its whole run.
//
// How (plain Node, any OS):
// - The lock is a file, created atomically: the owner's details are written to a temp file that
//   is then hard-linked to the lock name. link() fails if the name exists, so exactly one run wins,
//   and nobody ever sees a half-written lock.
// - Waiters poll, up to 5 min by default, then fail with a clear error.
// - Stale locks: the owner touches the file every 30 s (heartbeat). A lock is stale when its
//   owner's pid is gone (same host), or when the heartbeat stopped for 3 min (covers a pid that was
//   reused by another program, and a lock folder shared between hosts). Node can't read a process's
//   start time portably, so the heartbeat stands in for it.
// - Taking over a stale lock happens under a second, short-lived lock (<lock>.takeover), and only
//   if the lock still belongs to the owner judged dead, so two waiters can never both take over.
// - Released on normal exit, on error and on process.exit(); a lock left by a killed run (SIGKILL,
//   power loss) is cleaned up by the next run through the stale check.
import { writeFileSync, readFileSync, linkSync, unlinkSync, statSync, utimesSync, openSync, writeSync, closeSync } from 'node:fs';
import { hostname } from 'node:os';
import { randomBytes } from 'node:crypto';

export const WAIT_MS = 5 * 60_000;
export const HEARTBEAT_MS = 30_000;
export const STALE_MS = 3 * 60_000;
const UNREADABLE_STALE_MS = 10_000; // a lock file that isn't ours (empty, garbage) and this old
const TAKEOVER_STALE_MS = 30_000; // taking over takes milliseconds; an older .takeover was abandoned

export class LockTimeoutError extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } // EPERM: alive, another user's
}

// { info, mtimeMs } or null when there is no lock. Content first, then mtime: if the file is replaced
// in between, the new file's fresh mtime makes the old content look alive, never the other way round.
export function readLock(file) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  let info = null;
  try { info = JSON.parse(text); } catch {}
  let mtimeMs;
  try { mtimeMs = statSync(file).mtimeMs; } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  return { info: info?.nonce ? info : null, mtimeMs };
}

// why the lock is stale, or null while its owner looks alive
export function staleReason(held, { staleMs = STALE_MS, now = Date.now() } = {}) {
  const age = now - held.mtimeMs;
  if (!held.info) return age > UNREADABLE_STALE_MS ? 'unreadable lock file' : null;
  const { pid, host } = held.info;
  if (host === hostname() && !alive(pid)) return `process ${pid} is gone`;
  if (age > staleMs) return `no heartbeat for ${Math.round(age / 1000)} s`;
  return null;
}

// create `file` with `content` only if it doesn't exist; true when created
function create(file, tmp, content) {
  try { linkSync(tmp, file); return true; } catch (e) {
    if (e.code === 'EEXIST') return false;
    if (!['EPERM', 'ENOTSUP', 'ENOSYS', 'EXDEV', 'EOPNOTSUPP'].includes(e.code)) throw e;
  }
  // a filesystem without hard links: exclusive create. Readers may briefly see it empty, which
  // counts as alive for UNREADABLE_STALE_MS.
  let fd;
  try { fd = openSync(file, 'wx', 0o600); } catch (e) { if (e.code === 'EEXIST') return false; throw e; }
  try { writeSync(fd, content); } finally { closeSync(fd); }
  return true;
}

// removes the stale lock `judged` unless someone else is on it; true when the lock is gone
function takeOver(file, judged, opts) {
  const guard = `${file}.takeover`;
  let fd;
  try { fd = openSync(guard, 'wx', 0o600); } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    try { if (Date.now() - statSync(guard).mtimeMs > TAKEOVER_STALE_MS) unlinkSync(guard); } catch {}
    return false; // someone else is taking over right now; the caller polls again
  }
  try {
    closeSync(fd);
    const now = readLock(file);
    if (!now) return true;
    const same = (now.info?.nonce ?? null) === (judged.info?.nonce ?? null);
    if (!same || !staleReason(now, opts)) return false;
    unlinkSync(file);
    return true;
  } finally {
    try { unlinkSync(guard); } catch {}
  }
}

// Waits for the lock and returns { release, info, waitedMs }. onWait(owner info) is called once if
// the lock is busy. Throws LockTimeoutError after waitMs.
export async function acquireLock(file, { cmd = '', waitMs = WAIT_MS, pollMs = 250, staleMs = STALE_MS, heartbeatMs = HEARTBEAT_MS, onWait } = {}) {
  const info = { pid: process.pid, host: hostname(), cmd, startedAt: new Date().toISOString(), nonce: randomBytes(8).toString('hex') };
  const content = JSON.stringify(info) + '\n';
  const tmp = `${file}.${info.nonce}.tmp`;
  const start = Date.now();
  let told = false;
  writeFileSync(tmp, content, { mode: 0o600 });
  try {
    for (;;) {
      if (create(file, tmp, content)) break;
      const held = readLock(file);
      if (!held) continue; // released between our attempts
      if (staleReason(held, { staleMs }) && takeOver(file, held, { staleMs })) continue;
      if (Date.now() - start >= waitMs) {
        const o = held.info;
        throw new LockTimeoutError(`another kiu run${o ? ` (pid ${o.pid}, "${o.cmd}", since ${o.startedAt})` : ''} still holds ${file} after ${Math.round(waitMs / 1000)} s; try again later`);
      }
      if (!told) { told = true; onWait?.(held.info); }
      await sleep(pollMs);
    }
  } finally {
    try { unlinkSync(tmp); } catch {}
  }

  const beat = setInterval(() => { const t = new Date(); try { utimesSync(file, t, t); } catch {} }, heartbeatMs);
  beat.unref();
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    clearInterval(beat);
    process.off('exit', release);
    try { if (readLock(file)?.info?.nonce === info.nonce) unlinkSync(file); } catch {}
  };
  process.on('exit', release); // process.exit() anywhere (e.g. the signal handler in login.mjs)
  return { release, info, waitedMs: Date.now() - start };
}
