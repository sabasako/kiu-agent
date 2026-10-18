// One-time: adds the agent's own passkey to the student's KIU Microsoft account
// (mysignins.microsoft.com -> Security info -> Add sign-in method -> Passkey) and saves it
// to the env file as KIU_PASSKEY. Signing in to mysignins needs Authenticator push
// approvals: watch stderr for "NUMBER nn" and type it on the phone.
// The passkey shows up on mysignins as "kiu-agent" and can be deleted there any time.
import { openBrowser, signIn, state, dumpDebug, saveCounter, log } from './browser.mjs';
import { setEnv } from './config.mjs';

const SECURITY_INFO = 'https://mysignins.microsoft.com/security-info';
const PASSKEY_NAME = 'kiu-agent';
const onSecurityInfo = async (p) => new URL(p.url()).host === 'mysignins.microsoft.com'
  && await p.getByText(/add sign-in method/i).first().isVisible().catch(() => false);

// Only these buttons are ever clicked, so nothing like "Delete" can be hit by accident.
const SAFE_BUTTONS = /^(next|continue|create|create passkey|done|ok|save|got it)$/i;

function savePasskey(cred) {
  setEnv('KIU_PASSKEY', Buffer.from(JSON.stringify({
    credentialId: cred.credentialId,
    rpId: cred.rpId,
    privateKey: cred.privateKey,
    userHandle: cred.userHandle,
  })).toString('base64'));
  saveCounter(cred.signCount);
}

export async function setupPasskey({ force = false } = {}) {
  if (process.env.KIU_PASSKEY && !force) {
    // replacing it would orphan the old one on the account; make that a deliberate choice
    throw new Error('KIU_PASSKEY already exists. Use --force to register another one (delete the old one on mysignins).');
  }
  const { ctx, page, credentials } = await openBrowser({ mode: 'push', authenticator: true });
  try {
    await page.goto(SECURITY_INFO, { waitUntil: 'domcontentloaded' });
    await signIn(page, { mode: 'push', done: onSecurityInfo });

    state('security info -> add passkey');
    await page.getByText(/add sign-in method/i).first().click();
    await page.waitForTimeout(1500);
    await page.getByText('Passkey', { exact: true }).first().click();

    let saved = false;
    let lastScreen = '';
    let idleTicks = 0;
    const deadline = Date.now() + 4 * 60 * 1000;
    while (Date.now() < deadline) {
      await page.waitForTimeout(1500);

      // save the key the moment it exists, before naming it, so it is never lost
      const creds = await credentials();
      if (creds.length && !saved) {
        savePasskey(creds[0]);
        saved = true;
        log(`STATE passkey created for ${creds[0].rpId}, saved as KIU_PASSKEY`);
      }

      const url = new URL(page.url());
      // the creation itself happens on login.microsoft.com/.../fido/create; the virtual
      // authenticator answers by itself (the safe-button logic below handles any Next there)
      if (url.pathname.includes('/fido/create')) {
        state('creating passkey');
      } else if (url.host !== 'mysignins.microsoft.com') {
        // mysignins may send us back through Microsoft login to re-verify
        await signIn(page, { mode: 'push', done: async (p) => {
          const u = new URL(p.url());
          return u.host === 'mysignins.microsoft.com' || u.pathname.includes('/fido/create');
        } });
        continue;
      }

      // the passkey wizard is not a standard [role=dialog], so work on the whole page;
      // the security-info page itself has no Next/Create/Done/OK buttons
      const tail = (await page.locator('body').innerText().catch(() => '')).trim().slice(-400);
      if (tail !== lastScreen) {
        lastScreen = tail;
        log(`STATE wizard: ${tail.split('\n').filter(Boolean).slice(-4, -2).join(' | ').slice(0, 120)}`);
        await dumpDebug(page, 'setup-passkey');
      }

      const nameInput = page.locator('input[type=text]:visible').first();
      if (saved && await nameInput.isVisible().catch(() => false) && (await nameInput.inputValue()) !== PASSKEY_NAME) {
        await nameInput.fill(PASSKEY_NAME);
      }

      let clicked = false;
      const buttons = page.locator('button:visible, input[type=submit]:visible');
      for (let i = 0; i < await buttons.count(); i++) {
        const b = buttons.nth(i);
        const label = ((await b.innerText().catch(() => '')) || (await b.getAttribute('value')) || '').trim();
        if (SAFE_BUTTONS.test(label) && await b.isEnabled().catch(() => false)) {
          await b.click();
          clicked = true;
          break;
        }
      }
      // finished once the key is saved and the wizard has no more buttons to press
      idleTicks = clicked ? 0 : idleTicks + 1;
      if (saved && idleTicks >= 3) break;
    }

    if (!saved) throw new Error('no passkey was created');
    log(`OK passkey "${PASSKEY_NAME}" registered and saved as KIU_PASSKEY`);
  } catch (e) {
    await dumpDebug(page, 'setup-passkey-error');
    throw e;
  } finally {
    await ctx.close();
  }
}
