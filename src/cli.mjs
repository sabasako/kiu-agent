#!/usr/bin/env node
// kiu: read your KIU LMS from the terminal (built for AI agents, fine for humans).
// Run `node src/cli.mjs help` for commands. Progress/login lines go to stderr, data to stdout.
import { mkdirSync, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { HOME, ENV_FILE, STATE, readConfig, writeConfig, writeSecret } from './config.mjs';
import { call, lms, guardMode, BlockedEndpointError } from './api.mjs';
import { login, savedToken } from './login.mjs';
import { setupPasskey } from './setup-passkey.mjs';
import { loadPasskey } from './browser.mjs';
import { READ_ONLY } from './endpoints.mjs';
import { discover } from './discover.mjs';

const HELP = `kiu - KIU LMS for agents

  setup-passkey [--force]   one-time: register the agent's passkey (needs phone approvals)
  login                     log in now (normally automatic)
  status                    what is configured, guard mode, token age
  guard [read-only|off]     show or set the guard (see AGENTS.md)

  me                        name, email, program, semester (no personal numbers)
  courses                   this semester's courses and their lecture/seminar groups
  due [--days N]            unsubmitted assignments due in the next N days (default 14)
  assignments [filter]      every assignment with deadline and submission status
  assignment <id>           one assignment in full
  materials [filter]        course materials (files teachers uploaded)
  announcements [filter]    course announcements
  timetable                 weekly schedule with rooms
  grades                    results of finished courses + GPA by semester
  download <url> [dir]      download a file (assignment/material link) into dir
  raw <GET|POST> <path> [json-body]   any endpoint, guard applies
  snapshot                  call every read endpoint once -> state/snapshot.json
  discover                  re-read the live LMS code, report new/changed endpoints

  filter = part of a course or group name, e.g. "software" or "seminar"
  --json on any data command prints raw JSON instead of text`;

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); if (i === -1) return null; args.splice(i, 1); return true; };
const opt = (name) => { const i = args.indexOf(name); if (i === -1) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const asJson = flag('--json');
const out = (data, text) => console.log(asJson || !text ? JSON.stringify(data, null, 2) : text());

// Fields never shown to the agent; they add nothing and are sensitive.
const PRIVATE = new Set(['personalNumber', 'personalCardNum', 'birthday', 'address', 'phone', 'phoneSecond', 'photo_code', 'photo', 'jsonGuard']);
const redact = (v) => Array.isArray(v) ? v.map(redact)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !PRIVATE.has(k)).map(([k, x]) => [k, redact(x)]))
  : v;

async function semester() {
  const g = await call('POST', '/registration/group/getGroupForRegistration', {});
  return g.list.find((x) => x.id === g.selectedGroupId);
}

// [{ course, group }] for every lecture/seminar group this semester
async function groups(filter) {
  const sem = await semester();
  const res = await call('POST', '/lms/learningCourses/list', { learning_year: sem.seasonYear, registrationGroupId: sem.id });
  const all = res.data.flatMap((course) => course.items.map((group) => ({ course, group })));
  if (!filter) return all;
  const f = filter.toLowerCase();
  return all.filter(({ course, group }) => [course.altName, course.name, group.groupName].some((s) => s?.toLowerCase().includes(f)));
}

const courseLabel = ({ course, group }) => `${course.altName || course.name} / ${group.groupName}`;
const ids = ({ course, group }) => ({ id: course.listId, group_id: group.courseGroupId });

async function assignments(filter) {
  const rows = [];
  for (const g of await groups(filter)) {
    const res = await call('POST', '/lms/learningCourses/group/getAssignmentList', { ...ids(g), user_type: 'student' });
    for (const a of res.data ?? []) {
      rows.push({
        id: a.id,
        course: courseLabel(g),
        title: a.title,
        week: a.week,
        start: `${a.start_date} ${a.start_time?.slice(0, 5) ?? ''}`.trim(),
        due: `${a.end_date} ${a.end_time?.slice(0, 5) ?? ''}`.trim(),
        dueAt: new Date(`${a.end_date}T${a.end_time ?? '23:59:00'}+04:00`), // LMS times are Tbilisi
        submittedAt: a.student_submited_at,
        score: a.student_score,
        files: (a.file_urls ? String(a.file_urls).split(',') : []).filter(Boolean),
        description: a.description,
      });
    }
  }
  return rows.sort((x, y) => x.dueAt - y.dueAt);
}

const fmtAssignment = (a) => {
  const status = a.submittedAt ? `submitted ${a.submittedAt.slice(0, 10)}` : (a.dueAt < new Date() ? 'NOT submitted, past due' : 'NOT submitted');
  const score = a.score != null ? `, score ${a.score}` : '';
  return `#${a.id}  ${a.due}  ${a.course}: ${a.title} (week ${a.week}) - ${status}${score}${a.files.length ? `\n      files: ${a.files.join(' ')}` : ''}`;
};

async function listPerGroup(endpoint, filter, fmt) {
  const result = [];
  for (const g of await groups(filter)) {
    const res = await call('POST', endpoint, ids(g));
    for (const item of res.data ?? []) result.push({ course: courseLabel(g), ...item });
  }
  out(redact(result), () => result.map(fmt).join('\n') || '(none)');
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pad = (n) => String(n).padStart(2, '0');

const commands = {
  async help() { console.log(HELP); },

  async 'setup-passkey'() { await setupPasskey({ force: !!flag('--force') }); },

  async login() { await login(); },

  async status() {
    const tokenSaved = savedToken() ? 'yes' : 'no';
    console.log([
      `KIU_HOME:      ${HOME}`,
      `env file:      ${ENV_FILE}`,
      `KIU_EMAIL:     ${process.env.KIU_EMAIL ? 'set' : 'MISSING'}`,
      `KIU_PASSKEY:   ${loadPasskey() ? 'set' : 'missing (run setup-passkey)'}`,
      `guard:         ${guardMode()}${readConfig().guard ? '' : ' (default, not chosen yet)'}`,
      `token saved:   ${tokenSaved}`,
    ].join('\n'));
  },

  async guard() {
    const mode = args[1];
    if (!mode) return console.log(guardMode());
    if (!['read-only', 'off'].includes(mode)) throw new Error('guard must be "read-only" or "off"');
    writeConfig({ guard: mode });
    console.log(`guard set to ${mode}`);
  },

  async me() {
    const d = (await call('GET', '/registration/getStudentData')).data;
    const info = await call('GET', `/dashboardInfo/?id=${d.educationInfo.id}`);
    const s = info.student ?? {};
    const me = { name: `${s.firstNameEng ?? ''} ${s.lastNameEng ?? ''}`.trim() || d.student.name, email: s.mail, semester: d.educationInfo.semester, status: d.educationInfo.status, eduId: d.educationInfo.id, studentId: d.student.id };
    out(me, () => Object.entries(me).map(([k, v]) => `${k}: ${v}`).join('\n'));
  },

  async courses() {
    const sem = await semester();
    const gs = await groups();
    out(redact({ semester: sem, groups: gs }), () => `${sem.season} ${sem.seasonYear}\n` +
      gs.map(({ course, group }) => `${course.altName || course.name}  [${group.type}] ${group.groupName} - ${group.profName} (listId ${course.listId}, groupId ${group.courseGroupId})`).join('\n'));
  },

  async due() {
    const days = Number(opt('--days') ?? 14);
    const now = new Date();
    const limit = new Date(now.getTime() + days * 86400000);
    const rows = (await assignments()).filter((a) => !a.submittedAt && a.dueAt > now && a.dueAt <= limit);
    out(rows, () => rows.length ? rows.map(fmtAssignment).join('\n') : `nothing unsubmitted due in the next ${days} days`);
  },

  async assignments() {
    const rows = await assignments(args[1]);
    out(rows, () => rows.map(fmtAssignment).join('\n') || '(none)');
  },

  async assignment() {
    if (!args[1]) throw new Error('usage: assignment <id>');
    const res = await call('POST', '/lms/learningCourses/group/getAssignment', { assignment_id: Number(args[1]) });
    out(redact(res.data ?? res));
  },

  async materials() {
    await listPerGroup('/lms/learningCourses/group/getMaterialList', args[1],
      (m) => `${m.created_at?.slice(0, 10)}  ${m.course}: ${m.title}${m.description ? ` - ${m.description.replace(/<[^>]+>/g, '').slice(0, 200)}` : ''}${m.file_urls?.length ? `\n      files: ${m.file_urls.join(' ')}` : ''}`);
  },

  async announcements() {
    await listPerGroup('/lms/learningCourses/group/announcementList', args[1],
      (a) => `${a.created_at?.slice(0, 10)}  ${a.course}: ${String(a.title).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400)}${a.file_urls?.length ? `\n      files: ${a.file_urls.join(' ')}` : ''}${a.comments?.length ? `\n      ${a.comments.length} comment(s)` : ''}`);
  },

  async timetable() {
    const rows = await call('POST', '/registration/getMyBookGroups', {});
    const sorted = [...rows].sort((a, b) => a.day - b.day || a.h - b.h || a.m - b.m);
    out(redact(sorted), () => sorted.map((r) => `${DAYS[r.day] ?? r.day} ${pad(r.h)}:${pad(r.m)}  ${r.bookName} [${r.type}] - ${r.auditoria} - ${r.profName}`).join('\n'));
  },

  async grades() {
    const results = (await call('POST', '/registration/getBookResults', {})).data ?? [];
    const d = (await call('GET', '/registration/getStudentData')).data;
    const gpa = (await call('POST', '/stat/gpaBySemester', { eduId: d.educationInfo.id })).data;
    const rows = results.map((r) => ({ year: r.year, semester: r.semester, course: r.bookName, score: r.score, result: r.result, credit: r.credit }));
    out({ results: rows, gpaBySemester: gpa }, () =>
      rows.map((r) => `${r.year} sem ${r.semester}  ${r.course}: ${r.score} (${r.result}), ${r.credit} cr`).join('\n') +
      (gpa?.labels ? `\n\nGPA by semester: ${gpa.labels.map((l, i) => `${l}: ${gpa.data[i]}`).join(', ')}` : ''));
  },

  async download() {
    const [, url, dir = '.'] = args;
    if (!url) throw new Error('usage: download <url> [dir]');
    // attachments live on storage.ini.ge behind unguessable links, no LMS token needed
    const u = new URL(url);
    if (!u.hostname.endsWith('ini.ge') && !u.hostname.endsWith('kiu.edu.ge')) throw new Error(`refusing to download from ${u.hostname}`);
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, decodeURIComponent(u.pathname.split('/').pop()).replace(/^[0-9a-f]{10,}_/, ''));
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    await pipeline(Readable.fromWeb(r.body), createWriteStream(file));
    console.log(file);
  },

  async raw() {
    const [, method, p, body] = args;
    if (!method || !p) throw new Error('usage: raw <GET|POST> <path> [json-body]');
    const res = await lms(method.toUpperCase(), p, body ? JSON.parse(body) : undefined);
    console.log(JSON.stringify({ status: res.status, body: redact(res.json ?? res.text) }, null, 2));
  },

  async discover() {
    const { report, file } = await discover();
    console.log(`${report.endpointsInBundle} endpoints in ${report.bundleFiles} bundle files -> ${file}`);
    console.log(`unreviewed (not in endpoints.mjs): ${report.unreviewed.length}`);
    for (const u of report.unreviewed) console.log(`  ${u.verbs.join('/')} ${u.endpoint}  body: {${u.bodyKeys.join(', ')}}  (${u.hint})`);
    if (report.allowlistedButNotInBundle.length) console.log(`allowlisted but no longer in the bundle: ${report.allowlistedButNotInBundle.join(' ')}`);
  },

  async snapshot() {
    const results = [];
    for (const ep of READ_ONLY) {
      const method = ['/registration/getStudentData', '/registration/getStudentHistory', '/registration/getLists', '/registration/getMinorList', '/registration/groups', '/bib/getOverdueState', '/chancellery/getUserInfo', '/hr/calendar/getMandatoryEvents', '/message/count', '/notification/getUnreadNotificationCount', '/userNotification/getUnreadUserNotificationCount', '/task/getUnreadTaskCount', '/el-learning/getUnreadElLearningCount', '/finances/getVerifyStatus', '/dashboardInfo/'].includes(ep) ? 'GET' : 'POST';
      const p = ep.endsWith('/') ? `${ep}?page=1&limit=20` : ep;
      try {
        const res = await lms(method, p, {});
        results.push({ method, path: p, status: res.status, body: redact(res.json ?? res.text) });
      } catch (e) {
        results.push({ method, path: p, error: e.message });
      }
    }
    const file = path.join(STATE, 'snapshot.json');
    writeSecret(file, JSON.stringify({ fetchedAt: new Date().toISOString(), results }, null, 2));
    console.log(`${results.filter((r) => r.status === 200).length}/${results.length} endpoints returned 200 -> ${file}`);
  },
};

const cmd = args[0] ?? 'help';
try {
  if (!commands[cmd]) throw new Error(`unknown command "${cmd}", see: kiu help`);
  await commands[cmd]();
} catch (e) {
  console.error(e instanceof BlockedEndpointError ? e.message : `ERROR ${e.message}`);
  process.exit(1);
}
