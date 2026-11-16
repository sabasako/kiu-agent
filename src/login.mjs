// Logs into lms.kiu.edu.ge through Microsoft SSO and saves the LMS bearer token to
// state/token.json, using the agent's own passkey. Phone pushes only ever happen during
// `kiu setup-passkey`, never from a normal command.
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { STATE, writeSecret } from './config.mjs';
import { openBrowser, signIn, dumpDebug, loadPasskey, saveCounter, log } from './browser.mjs';
import { READ_ONLY, endpointOf } from './endpoints.mjs';

const LMS = 'https://lms.kiu.edu.ge';
const TOKEN = path.join(STATE, 'token.json');

// what this process did, for the auth log (src/auth-log.mjs)
export const loginStats = { ok: 0, failed: 0 };

export function savedToken() {
  return existsSync(TOKEN) ? JSON.parse(readFileSync(TOKEN, 'utf8')).token : null;
}

// Ask the page itself where it is: page.url() can still name Microsoft's last page after the
// redirect has already loaded the LMS and stored its token.
const lmsToken = (page) => page.evaluate(
  (host) => (location.host === host ? localStorage.getItem('Student-Token') : null),
  new URL(LMS).host,
).catch(() => null);

export async function login() {
  if (!loadPasskey()) throw new Error('no passkey yet: run `kiu setup-passkey` first (see AGENTS.md setup)');
  const mode = 'passkey';
  const { ctx, page, credentials } = await openBrowser({ mode });

  // Every passkey signature bumps its counter on Microsoft's side, and Microsoft rejects a
  // counter that goes backwards. Save it on every exit (success, error or kill), or an
  // interrupted run leaves the saved counter behind and the passkey stops working.
  let counterSaved = false;
  const persistCounter = async () => {
    if (mode !== 'passkey' || counterSaved) return;
    counterSaved = true;
    const [cred] = await credentials().catch(() => []);
    if (cred) saveCounter(cred.signCount);
  };
  const onSignal = async () => { await persistCounter(); process.exit(1); };
  process.once('SIGTERM', onSignal);
  process.once('SIGINT', onSignal);

  // The LMS web app runs in this browser while logging in and fires its own background
  // calls. Hold them to the read-only list (plus the Microsoft handshake), whatever the
  // guard setting: the student did not ask for any of them.
  await ctx.route(`${LMS}/student/**`, (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/student/azureLogin' || pathname.startsWith('/student/azure/')) return route.continue();
    if (READ_ONLY.has(endpointOf(pathname.replace(/^\/student/, '')))) return route.continue();
    return route.abort();
  });

  try {
    await page.goto(`${LMS}/student/azureLogin`, { waitUntil: 'domcontentloaded' });
    await signIn(page, { mode, done: async (p) => !!(await lmsToken(p)) });
    const token = await lmsToken(page);
    writeSecret(TOKEN, JSON.stringify({ token, savedAt: new Date().toISOString() }));
    await persistCounter();
    loginStats.ok += 1;
    log(`OK ${mode} login`);
    return token;
  } catch (e) {
    loginStats.failed += 1;
    await persistCounter();
    await dumpDebug(page, 'login-error');
    throw e;
  } finally {
    process.off('SIGTERM', onSignal);
    process.off('SIGINT', onSignal);
    await ctx.close();
  }
}
