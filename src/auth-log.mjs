// Auth log: one JSON line per run in state/auth-log.jsonl, so you can see how often runs reuse the
// LMS token and how often they sign in with the passkey (and whether the counter behaves).
//
//   { at, source, cmd, ok, exit, secs, waitedSecs?, passkeyLogin, loginFailed?, counterBefore, counter, error? }
//
// source: $KIU_SOURCE (e.g. "cron", "sync") or "cli". passkeyLogin: this run signed in with the
// passkey (the saved token was missing or refused); false means the saved token was reused (or the
// command made no LMS call). counter: the passkey signature counter after the run.
// `kiu auth-log [days]` prints summarize() of the last days.
import { appendFileSync, readFileSync, existsSync } from 'node:fs';

const TZ_MS = 4 * 3600e3; // the LMS and its students are in Tbilisi (UTC+4, no DST)

export function readCounter(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')).signCount ?? null; } catch { return null; }
}

export function appendAuthLog(file, entry) {
  appendFileSync(file, JSON.stringify(entry) + '\n', { mode: 0o600 });
}

// rows of the last `days` days; lines that don't parse are skipped
export function readAuthLog(file, { days = 14, now = Date.now() } = {}) {
  if (!existsSync(file)) return [];
  const since = now - days * 86400e3;
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap((l) => {
    try { const r = JSON.parse(l); return Date.parse(r.at) >= since ? [r] : []; } catch { return []; }
  });
}

const failed = (r) => r.ok === false || (r.ok === undefined && r.exit !== 0);
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '-');
const line = (rs) => {
  const logins = rs.filter((r) => r.passkeyLogin).length;
  const reused = rs.filter((r) => !r.passkeyLogin && !failed(r)).length;
  return `${rs.length} runs, ${logins} passkey logins (${pct(logins, rs.length)}), ${reused} reused token, ${rs.filter(failed).length} failed`;
};

export function summarize(rows, { days = 14 } = {}) {
  if (!rows.length) return `no kiu runs in the last ${days} days`;
  const out = [`last ${days} days: ${line(rows)}`];
  for (const src of new Set(rows.map((r) => r.source))) out.push(`  ${src}: ${line(rows.filter((r) => r.source === src))}`);

  out.push('', 'per day (Tbilisi):');
  const byDay = new Map();
  for (const r of rows) {
    const day = new Date(Date.parse(r.at) + TZ_MS).toISOString().slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), r]);
  }
  for (const [day, rs] of byDay) out.push(`  ${day}  ${line(rs)}`);

  // how long a token lived: the longest gap between a login and a later run that still reused it
  const logins = rows.filter((r) => r.passkeyLogin).map((r) => Date.parse(r.at));
  const reusedAfter = rows.filter((r) => !r.passkeyLogin && !failed(r)).map((r) => {
    const prev = logins.filter((t) => t <= Date.parse(r.at)).at(-1);
    return prev ? (Date.parse(r.at) - prev) / 60e3 : null;
  }).filter((m) => m != null);
  if (reusedAfter.length) out.push('', `longest a token was still accepted after its login: ${Math.round(Math.max(...reusedAfter))} min`);
  const backwards = rows.filter((r) => r.counterBefore != null && r.counter != null && r.counter < r.counterBefore).length;
  if (backwards) out.push(`WARNING: the passkey counter went backwards in ${backwards} run(s); see AGENTS.md "Microsoft refused the passkey"`);
  out.push(`last passkey counter: ${rows.at(-1).counter ?? '-'}`);
  return out.join('\n');
}
