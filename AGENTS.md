# kiu-agent: instructions for the AI agent

You are helping a KIU (Kutaisi International University) student use their LMS
(`lms.kiu.edu.ge`) through this repo. The student talks to you in plain language; you run
the `kiu` CLI and answer. The student is not expected to run commands themselves.

## 0. Is setup done?

Run `node src/cli.mjs status`.

- `KIU_EMAIL: MISSING` or `KIU_PASSKEY: missing` -> do **Setup** (section 1) before anything else.
- `guard: ... (default, not chosen yet)` -> do **Guard choice** (section 2).
- Otherwise go to **Daily use** (section 3).

## 1. Setup (first run)

Walk the student through this, one step at a time. Explain briefly, don't dump everything at once.

1. **Requirements.** Node.js 20+ (`node -v`). Then `npm install` (also downloads a headless Chromium).
2. **Explain how login works and get consent.** KIU uses Microsoft sign-in with 2FA, and the
   LMS session drops after minutes, so logging in by hand is not usable. Instead the agent
   registers **its own passkey** on the student's KIU Microsoft account (like a password
   manager would) and logs in with it whenever needed, with no phone involved. Say plainly:
   - the passkey (in `.env`) can sign in to their **whole KIU Microsoft account** (Outlook,
     Teams, OneDrive), not only the LMS. Anyone who gets that file can too. Keep `.env` private.
   - it shows up on https://mysignins.microsoft.com/security-info as **"kiu-agent"** and can be
     deleted there at any time, which instantly revokes it.
   - this uses the LMS's internal API, which is unofficial and can change or break.
   - their LMS data passes through the AI provider when they ask about it.
   Continue only if they agree.
3. **Email.** Ask for their KIU email and write it to `.env` as `KIU_EMAIL=...`
   (create the file if needed, then `chmod 600 .env`). The password is never needed.
4. **Register the passkey.** Tell them to open Microsoft Authenticator on their phone. Run
   `node src/cli.mjs setup-passkey` **in the background** and watch its stderr:
   - `NUMBER 42` -> show it to the student immediately and big ("Enter **42** in Microsoft
     Authenticator"). Expect 2-3 numbers in total (each sign-in step asks again).
   - `STATE ...` lines are progress. `OK passkey "kiu-agent" registered` -> done.
   - `Request wasn't sent` / `Microsoft could not send the push notification` -> Microsoft is
     throttling pushes after too many attempts. **Stop and wait about an hour**; retrying makes
     it worse.
   - Anything else failing -> see **Repairing**.
5. **Check.** `node src/cli.mjs login` (should print `OK passkey login` with no phone prompt),
   then `node src/cli.mjs due`.

## 2. Guard choice

Ask the student which mode they want, with the tradeoff:

- **read-only** (`node src/cli.mjs guard read-only`): the client refuses every endpoint that is
  not on the reviewed read list in `src/endpoints.mjs`, before any request is sent. You can't
  accidentally submit, delete, register, or mark things as read. Downside: the list was
  reviewed once (Oct 2026) on one account; it may block something harmless or new, and you
  can't do writes like submitting homework.
- **off** (`node src/cli.mjs guard off`): every endpoint is callable, including writes.
  Downside: real changes are possible, and some endpoints that look like reads quietly mark
  things as seen. With guard off you must still describe any write and get a yes first
  (see Rules).

They can switch any time by asking you.

## 3. Daily use

Run `node src/cli.mjs <command>` (add `--json` for raw data). Progress goes to stderr, data to stdout.

| Student asks | Command |
|---|---|
| what's due / what homework do I have | `due` (`--days 30` for further ahead) |
| all assignments for a course, did I submit X | `assignments <course filter>` |
| details or files of one assignment | `assignment <id>` |
| new slides / files from a teacher | `materials <filter>` |
| announcements, deadline changes from teachers | `announcements <filter>` |
| my schedule, where is my class | `timetable` |
| my grades, GPA | `grades` (current-semester rows are running points, not final grades) |
| my courses and groups | `courses` |
| download an attachment | `download <url> <dir>` |
| anything else the LMS shows | `raw POST <endpoint> '<json body>'` (see `docs/endpoints.md`) |

- Times from the LMS are Tbilisi time (UTC+4); say so if the student may be elsewhere.
- Login is automatic: the client re-logs in with the passkey (~10 s) whenever the LMS drops
  the session. You never need to ask the student to log in.
- `docs/endpoints.md` lists endpoints with example response **shapes**; it can be outdated.
  `node src/cli.mjs snapshot` fetches every read endpoint into `state/snapshot.json` for fresh data.

## 4. Rules

- Talk to the LMS **only** through this repo's client (`src/api.mjs`, via the CLI). No `curl`
  or ad-hoc `fetch` with the token: you'd skip the guard, the re-login, and the redaction.
- **Writes need the student's explicit yes for that exact call**, even with guard off. Before
  calling, say what will change ("submit `hw3.pdf` to Software Engineering Assignment 3"). This
  includes "mark as read/seen" endpoints (see `MARKS_OR_WRITES` in `src/endpoints.mjs`).
- Never print, paste, or send anywhere the contents of `.env`, `state/token.json` or the passkey.
- The CLI strips personal fields (personal number, phone, address, birthday). Don't go fetching
  them with `raw` unless the student asks for that specific thing.
- Don't run `setup-passkey --force` unless the student wants a new passkey; tell them to delete
  the old "kiu-agent" entry on mysignins afterwards.

## 5. Repairing (when something breaks)

You are expected to fix things yourself. Work out first **which layer** broke.

### Login broke (Microsoft changed a page)

- Symptoms: `ERROR timed out on state "unknown microsoft page"`, or a new `STATE` that loops.
- Look at the newest files in `state/debug/`: each capture has a screenshot (`.png`) and a
  `.txt` with the URL, the page text and every clickable element (tag, id, label).
- The login is a loop in `signIn()` in `src/browser.mjs` that recognises pages by their
  **heading** (Microsoft keeps hidden email/password inputs on every page, so don't detect
  pages by "visible input"). Add a branch for the new page, using ids/labels from the capture.
- Test with `node src/cli.mjs login`. Each successful passkey login is harmless; failed
  push-based attempts count toward Microsoft's throttle.

### "Microsoft refused the passkey"

- Almost always the **signature counter**. Microsoft rejects a counter that doesn't increase.
  The client saves it after every login (`state/passkey-counter.json`); if a run was killed
  hard it can fall behind. Fix: raise it well above the last value and retry:
  `node -e "import('./src/browser.mjs').then(m => m.saveCounter(5000))"`.
  Gaps are fine, going backwards is not. Never run two copies of the same passkey (two
  machines or folders): their counters will fight.
- If it still fails, the passkey may have been deleted on mysignins: run `setup-passkey --force`.

### The API changed (404s, empty data, new fields)

1. `node src/cli.mjs discover`: downloads the live web app's JavaScript and lists every endpoint
   it calls with the request-body keys, diffed against `src/endpoints.mjs`. Full report in
   `state/discover.json`, including a code sample around each call.
2. For a renamed/moved endpoint, read the code sample (or grep the downloaded bundle) to see
   which page calls it and with what body. Try it with `raw`.
3. **Classifying a new endpoint as read-only:** only after reading what the frontend does with
   it. The name is not enough: `readAllEvent`, `acknowledgeOverdue`, `markAsReadTasks` look
   harmless and change state; the web app fires some of them automatically when a dialog closes.
   When unsure, it is not read-only. Put reads in `READ_ONLY`, state-changing ones in
   `MARKS_OR_WRITES` with a short reason.
4. API base is `https://lms.kiu.edu.ge/student` + endpoint (an Angular interceptor adds
   `/student`). Many reads are POST. Paginated lists take `?page=1&limit=20`.

### The token dies immediately / 401 loops

- The client logs in again on 401 and retries once. If it keeps failing, check whether the LMS
  now returns a different status (403 with `redirect_back`, or `{ error: "token_expired" }`)
  and extend the re-login condition in `lms()` in `src/api.mjs`.

## 6. Files and settings

- `src/cli.mjs` commands; `src/api.mjs` HTTP client (guard + re-login); `src/endpoints.mjs`
  endpoint lists; `src/login.mjs` LMS login; `src/browser.mjs` Chromium + Microsoft sign-in
  state machine; `src/setup-passkey.mjs` passkey registration; `src/discover.mjs` bundle diff.
- `.env` (`KIU_EMAIL`, `KIU_PASSKEY`), `config.json` (guard), `state/` (token, passkey counter,
  debug captures, snapshots), `.profile/` (browser profile). All gitignored, all private.
- `KIU_HOME=<dir>` moves `.env`/`config.json`/`state/`/`.profile/` elsewhere;
  `KIU_ENV_FILE=<file>` points at a different env file.
