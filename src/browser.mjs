// Headless Chromium + Microsoft sign-in for KIU.
//
// Two ways past Microsoft's 2FA:
//   - passkey: a Chromium virtual authenticator holds the agent's own passkey
//     (KIU_PASSKEY, created once by `kiu setup-passkey`). Fully unattended.
//   - push: number-match push to Microsoft Authenticator. Only used to bootstrap the
//     passkey; the number is printed as "NUMBER nn" for the student to type on their phone.
//
// Progress goes to stderr, one line per event: STATE / NUMBER / OK / ERROR, so stdout
// stays clean for data.
import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { STATE, PROFILE, DEBUG } from './config.mjs';

const COUNTER = path.join(STATE, 'passkey-counter.json');
export const log = (line) => process.stderr.write(line + '\n');
const MS_HOSTS = ['login.microsoftonline.com', 'login.microsoft.com', 'login.live.com'];
const SUBMIT = ['#idSIButton9', 'button[type=submit]', 'input[type=submit]', '[data-testid="primaryButton"]'];

let lastState = '';
export const state = (s) => { if (s !== lastState) { log(`STATE ${s}`); lastState = s; } };

export async function dumpDebug(page, tag) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await page.screenshot({ path: path.join(DEBUG, `${stamp}-${tag}.png`), fullPage: true }).catch(() => {});
  const text = await page.locator('body').innerText().catch(() => '');
  // clickable elements, so a new Microsoft page can be taught to the script quickly
  const clickables = await page.locator('a, button, input[type=submit], input[type=button], [role=button], [role=link]').evaluateAll(
    (els) => els.filter((e) => e.offsetParent !== null).map((e) => `${e.tagName} #${e.id} [${(e.innerText || e.value || e.getAttribute('aria-label') || '').trim().slice(0, 60)}]`)
  ).catch(() => []);
  writeFileSync(path.join(DEBUG, `${stamp}-${tag}.txt`), `${page.url()}\n\n${text}\n\n--- clickables\n${clickables.join('\n')}`);
}

// Click the first visible element out of several selectors (old and new Microsoft UI).
export async function clickFirst(page, selectors) {
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible().catch(() => false)) { await el.click(); return true; }
  }
  return false;
}

// KIU_PASSKEY is base64 JSON: { credentialId, rpId, privateKey, userHandle }
export function loadPasskey() {
  if (!process.env.KIU_PASSKEY) return null;
  const cred = JSON.parse(Buffer.from(process.env.KIU_PASSKEY, 'base64').toString());
  const signCount = existsSync(COUNTER) ? JSON.parse(readFileSync(COUNTER, 'utf8')).signCount : 0;
  return { ...cred, signCount };
}

// The counter must only go up, or Microsoft may treat the passkey as cloned.
export function saveCounter(signCount) {
  writeFileSync(COUNTER, JSON.stringify({ signCount, savedAt: new Date().toISOString() }));
}

// mode 'passkey': virtual authenticator loaded with the saved passkey.
// mode 'push':    WebAuthn hidden on Microsoft's login pages, so it falls back to the push
//                 (with { authenticator: true } an empty authenticator is still attached,
//                 for pages like mysignins that create a passkey).
export async function openBrowser({ mode, authenticator = mode === 'passkey' }) {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: true,
    locale: 'en-US',
    timezoneId: 'Asia/Tbilisi',
    viewport: { width: 1280, height: 900 },
  });
  if (mode === 'push') {
    await ctx.addInitScript((hosts) => {
      // /fido/create is where mysignins registers a new passkey, which needs WebAuthn
      if (!hosts.includes(location.hostname) || location.pathname.includes('/fido/create')) return;
      delete window.PublicKeyCredential;
      try { Object.defineProperty(navigator, 'credentials', { get: () => undefined }); } catch {}
    }, MS_HOSTS);
  }
  const page = ctx.pages()[0] ?? await ctx.newPage();

  let cdp = null;
  let authenticatorId = null;
  if (authenticator) {
    cdp = await ctx.newCDPSession(page);
    await cdp.send('WebAuthn.enable', { enableUI: false });
    ({ authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    }));
    if (mode === 'passkey') {
      const pk = loadPasskey();
      if (!pk) throw new Error('KIU_PASSKEY missing, run `kiu setup-passkey` first');
      await cdp.send('WebAuthn.addCredential', {
        authenticatorId,
        credential: {
          credentialId: pk.credentialId,
          isResidentCredential: true,
          rpId: pk.rpId,
          privateKey: pk.privateKey,
          userHandle: pk.userHandle,
          signCount: pk.signCount,
        },
      });
    }
  }
  const credentials = async () => (cdp ? (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials : []);
  return { ctx, page, credentials };
}

// Drives Microsoft's sign-in pages until done(page) is true.
export async function signIn(page, { mode, done, timeoutMs = 4 * 60 * 1000 }) {
  const { KIU_EMAIL } = process.env;
  if (!KIU_EMAIL) throw new Error('KIU_EMAIL missing in the env file (see AGENTS.md setup)');

  let shownNumber = null;
  let unknownTicks = 0;
  let resends = 0;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await page.waitForTimeout(1000);
    if (await done(page)) return;

    const url = new URL(page.url());
    if (!MS_HOSTS.includes(url.host)) {
      state(`waiting on ${url.host}${url.pathname}`);
      continue;
    }

    const body = await page.locator('body').innerText().catch(() => '');
    // Microsoft keeps both the email and password inputs on every page and hides one,
    // so tell the pages apart by their heading, not by which input looks visible
    const heading = (await page.locator('[role=heading], #loginHeader, .title').first().innerText().catch(() => '')).trim();

    if (url.pathname.includes('/fido/create')) {
      state('passkey registration page');
      continue;
    }
    if (url.pathname.includes('/fido')) {
      if (mode === 'passkey') {
        // the virtual authenticator answers on its own; "Try again" means it was refused
        if (await page.locator('#idSIButton9:has-text("Try again"), input[value="Try again"]').isVisible().catch(() => false)) {
          throw new Error('Microsoft refused the passkey');
        }
        state('passkey -> signing');
        continue;
      }
      state('passkey prompt -> back');
      if (await clickFirst(page, ['#idBtn_Back'])) continue;
      const cancel = url.searchParams.get('cancelUrl');
      if (cancel) await page.goto(cancel, { waitUntil: 'domcontentloaded' });
      continue;
    }

    // account picker from an earlier session
    const tile = page.locator(`[data-test-id="${KIU_EMAIL}"], div[role=listitem]:has-text("${KIU_EMAIL}")`).first();
    if (await tile.isVisible().catch(() => false)) {
      state('account picker');
      await tile.click();
      continue;
    }

    const email = page.locator('input[name=loginfmt]').first();
    if (/^sign in$/i.test(heading) && await email.isEditable().catch(() => false)) {
      state('email');
      await email.fill(KIU_EMAIL);
      await clickFirst(page, SUBMIT);
      continue;
    }

    // never type a password: switch to the app sign-in instead
    if (/^enter password/i.test(heading)) {
      state('password page -> use an app instead');
      if (!(await clickFirst(page, ['#idA_PWD_SwitchToRemoteNGC', 'text=/Use an app instead/i']))) {
        throw new Error('password page without an "Use an app instead" option');
      }
      continue;
    }

    // Microsoft sometimes fails to deliver the push (e.g. after several in a row)
    if (/^request wasn.t sent/i.test(heading)) {
      resends += 1;
      if (resends > 2) throw new Error('Microsoft could not send the push notification');
      state(`push not sent -> resend (${resends}/2)`);
      await clickFirst(page, ['#idSIButton9']);
      continue;
    }

    // "Verify your identity" list
    if (/^verify your identity/i.test(heading)) {
      state('verify identity -> authenticator push');
      await clickFirst(page, ['text=/Approve a request on my Microsoft Authenticator app/i']);
      continue;
    }

    // number matching: Microsoft shows a 2-digit number to type on the phone
    const sign = page.locator('#idRichContext_DisplaySign, .displaySign, [data-testid="displaySign"]').first();
    if (await sign.isVisible().catch(() => false)) {
      const n = (await sign.innerText()).trim();
      if (n && n !== shownNumber) { log(`NUMBER ${n}`); shownNumber = n; }
      state('waiting for push approval');
      continue;
    }
    if (/approve sign in request|open your authenticator app/i.test(body)) {
      const m = body.match(/\b(\d{2,3})\b/);
      if (m && m[1] !== shownNumber) { log(`NUMBER ${m[1]}`); shownNumber = m[1]; }
      state('waiting for push approval');
      continue;
    }

    if (/stay signed in/i.test(body)) {
      state('stay signed in -> yes');
      await page.locator('#KmsiCheckboxField').check().catch(() => {});
      await clickFirst(page, SUBMIT);
      continue;
    }

    if (/request was denied|we didn't hear from you/i.test(body)) {
      throw new Error('push approval denied or timed out');
    }

    // pages are often just mid-transition; only capture one that sticks around
    unknownTicks = lastState === 'unknown microsoft page' ? unknownTicks + 1 : 0;
    state('unknown microsoft page');
    if (unknownTicks === 5) await dumpDebug(page, 'unknown');
  }
  throw new Error(`timed out on state "${lastState}"`);
}
