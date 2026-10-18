// The one place that talks to the LMS API.
//
// - Guard: with config.json { "guard": "read-only" } (the default until setup asks), any
//   endpoint not in READ_ONLY throws before a request leaves the machine. With "off"
//   everything is allowed; the agent must still get the student's yes for writes.
// - Re-login: the LMS often drops tokens within minutes, so on 401 the client logs in
//   again (passkey, ~10 s, no phone) and retries once.
import { readConfig } from './config.mjs';
import { READ_ONLY, MARKS_OR_WRITES, endpointOf } from './endpoints.mjs';
import { login, savedToken } from './login.mjs';

const API = 'https://lms.kiu.edu.ge/student';

export class BlockedEndpointError extends Error {}

export const guardMode = () => readConfig().guard ?? 'read-only';

export function checkAllowed(method, p) {
  const ep = endpointOf(p);
  if (method !== 'GET' && method !== 'POST') throw new BlockedEndpointError(`blocked: method ${method}`);
  if (guardMode() === 'off') return;
  if (!READ_ONLY.has(ep)) {
    const why = MARKS_OR_WRITES[ep] ? ` (${MARKS_OR_WRITES[ep]})` : '';
    throw new BlockedEndpointError(`blocked by read-only guard: ${ep}${why}. See AGENTS.md "Guard".`);
  }
}

async function send(method, p, body, token) {
  const r = await fetch(API + p, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text: json ? undefined : text.slice(0, 2000) };
}

// Returns { status, json, text }. Throws BlockedEndpointError when the guard says no.
export async function lms(method, p, body) {
  checkAllowed(method, p);
  let token = savedToken() ?? await login();
  let res = await send(method, p, body, token);
  if (res.status === 401) {
    token = await login();
    res = await send(method, p, body, token);
  }
  return res;
}

// Convenience for the CLI: returns json, throws on anything but HTTP 200.
export async function call(method, p, body) {
  const res = await lms(method, p, body);
  if (res.status !== 200) throw new Error(`${method} ${p} -> HTTP ${res.status} ${res.text ?? JSON.stringify(res.json)}`.slice(0, 500));
  return res.json;
}
