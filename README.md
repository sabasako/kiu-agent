# kiu-agent

Ask an AI agent about your KIU LMS instead of fighting the website:

> "What's due this week?"
> "Did I submit the Software Engineering homework?"
> "Any new slides in Numerical Programming?"
> "Where is my Thursday class?"

It reads `lms.kiu.edu.ge` for you: assignments and deadlines, your submissions and scores,
course materials, announcements, timetable, grades and GPA. It logs in by itself and keeps
working even though the LMS logs you out every few minutes.

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

## Removing it

1. Delete "kiu-agent" on https://mysignins.microsoft.com/security-info
2. Delete the folder (or at least `.env`, `state/` and `.profile/`).

## For agents and tinkerers

Everything an agent needs is in [`AGENTS.md`](AGENTS.md). The CLI works without an agent too:
`node src/cli.mjs help`.
