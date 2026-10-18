// Where secrets and state live, and how the agent is allowed to use the API.
//
//   KIU_HOME      folder for state/ (token, passkey counter, debug captures, snapshots),
//                 .profile/ (browser profile) and config.json. Default: the repo root.
//   KIU_ENV_FILE  file holding KIU_EMAIL and KIU_PASSKEY. Default: $KIU_HOME/.env
//
// config.json: { "guard": "read-only" | "off" }  (chosen during setup, see AGENTS.md)
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HOME = path.resolve(process.env.KIU_HOME || REPO);
export const ENV_FILE = path.resolve(process.env.KIU_ENV_FILE || path.join(HOME, '.env'));
export const STATE = path.join(HOME, 'state');
export const PROFILE = path.join(HOME, '.profile');
export const DEBUG = path.join(STATE, 'debug');
const CONFIG = path.join(HOME, 'config.json');

mkdirSync(DEBUG, { recursive: true, mode: 0o700 });

// Minimal .env reader (KEY=value, optional quotes), so no extra dependency is needed.
// Values already in process.env win.
export function loadEnv() {
  if (!existsSync(ENV_FILE)) return;
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    let v = m[2];
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}
loadEnv();

// Sets or replaces one KEY=value line in the env file, keeping everything else.
export function setEnv(key, value) {
  const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8').split('\n').filter((l) => l && !l.startsWith(`${key}=`)) : [];
  lines.push(`${key}=${value}`);
  writeSecret(ENV_FILE, lines.join('\n') + '\n');
  process.env[key] = value;
}

export function writeSecret(file, data) {
  writeFileSync(file, data);
  chmodSync(file, 0o600);
}

export function readConfig() {
  return existsSync(CONFIG) ? JSON.parse(readFileSync(CONFIG, 'utf8')) : {};
}

export function writeConfig(patch) {
  writeFileSync(CONFIG, JSON.stringify({ ...readConfig(), ...patch }, null, 2) + '\n');
}
