# kiu-agent

Ask an AI agent about your KIU LMS instead of fighting the website:

> "What's due this week?"
> "Did I submit the Software Engineering homework?"
> "Any new slides in Numerical Programming?"
> "Where is my Thursday class?"

It reads `lms.kiu.edu.ge` for you: assignments and deadlines, your submissions and scores,
course materials, announcements, timetable, grades and GPA. It logs in by itself whenever the
LMS session runs out (about once a day), with no phone involved.

## Getting started

You need: [Claude Code](https://claude.com/claude-code) (or another coding agent that reads
`AGENTS.md`), Node.js 20+, your KIU Microsoft account, and Microsoft Authenticator on your phone.

```
git clone https://github.com/sabasako/kiu-agent
cd kiu-agent
claude
```

Then say **"set me up"**. The agent walks you through everything (about 5 minutes, a few
number approvals on your phone) and from then on you just ask questions.

## How it works

- The agent registers its **own passkey** on your KIU Microsoft account, the same thing a
  password manager does, and signs in with it whenever the LMS drops your session. No
  password is stored and your phone isn't needed after setup.
- It talks to the LMS's internal API (the same one the website uses). `src/endpoints.mjs`
  lists what is known; `kiu discover` re-reads the live site so the agent can adapt when
  things change, and `AGENTS.md` tells it how to repair itself.
- You choose during setup whether the agent is **read-only** (can't change anything on the
  LMS) or has **full access** (can also submit, but must ask you first for every change).

## Know what you're agreeing to

- **The passkey file is a key to your whole KIU Microsoft account** (Outlook, Teams,
  OneDrive), not only the LMS. It lives in `.env` on your machine. Don't share that folder.
  You can revoke it any time: https://mysignins.microsoft.com/security-info -> delete
  "kiu-agent".
- **Unofficial.** This is not made or supported by KIU or ini.ge. The LMS can change and
  break it at any time.
- **Your LMS data goes to your AI provider** when you ask about it. The tool strips personal
  number, phone, address and birthday, but grades and course data are sent.

## Best practices

Mostly for running it on a schedule (a sync to your task manager or calendar). The details are in
[`AGENTS.md`](AGENTS.md#5-best-practices).

- **One passkey, one folder, one machine.** Every sign-in raises the passkey's signature counter
  (`state/passkey-counter.json`) and Microsoft refuses a passkey whose counter doesn't go up. Never
  copy `.env`/`state/` to a second machine or folder and run both; register a separate passkey
  there instead. Never lower the counter.
- **Runs never overlap.** Every command that can sign in or call the LMS holds a lock in `state/`
  (`run.lock`); a second run waits up to 5 minutes, then fails with a clear error. A lock left by a
  crashed run is cleaned up by itself. You don't need your own locking around `kiu`.
- **The token lasts about 24 hours.** Commands reuse it and sign in again only when the LMS
  refuses it, so a job every 15 minutes signs in about once a day. Don't schedule `kiu login`.
- **Schedule lightly:** e.g. homework (`kiu assignments --json`) every 15 minutes, everything
  else (courses, timetable, grades, materials, announcements, exams) every 6 hours. Treat LMS
  5xx errors and timeouts as passing; alert only after a few failures in a row.
- **Keep the guard read-only** for anything unattended. A scheduled job never writes to the LMS.
- **Watch the auth log.** Each run adds a line to `state/auth-log.jsonl`; `kiu auth-log [days]`
  shows passkey logins vs reused tokens, failures, and how long tokens lived. Set `KIU_SOURCE`
  (e.g. `cron`) per caller to tell them apart.
- **Integrations touch only what they created.** A sync that turns homework into tasks and exams
  into calendar events keeps its own map of LMS id -> item, changes only those items, and never
  moves a deadline silently. See the example in `AGENTS.md`.

## Removing it

1. Delete "kiu-agent" on https://mysignins.microsoft.com/security-info
2. Delete the folder (or at least `.env`, `state/` and `.profile/`).

## For agents and tinkerers

Everything an agent needs is in [`AGENTS.md`](AGENTS.md). The CLI works without an agent too:
`node src/cli.mjs help`. For your own scripts, `src/text.mjs` turns the LMS's HTML into readable
text and matches one course across endpoints (or use `--json --text`). Tests: `npm test`.
