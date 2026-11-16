// Helpers for LMS data: readable text from the LMS's HTML, LMS times, and matching one course
// across endpoints. Pure functions, no LMS access; import them from your own scripts:
//   import { plain, lmsTime, buildCourses, courseFinder, currentGrades } from './src/text.mjs';
//
// How the LMS names one course (checked Oct 2026):
//   `kiu courses`      course.name (Georgian), course.altName (English), course.listId, group.courseGroupId
//   timetable / grades / exam tables   bookName = course.name, exactly (bookId is another id space)
//   assignments        course = "<altName> / <groupName>" (the CLI's label)
//   materials / announcements   same label, plus group_id = group.courseGroupId
// So: group id first, then the exact label, then the Georgian or English name.

// "Data & Warehouses" -> "data-warehouses"; '' for a name with no Latin letters or digits
export const slug = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const norm = (s) => String(s ?? '').normalize('NFC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();

// `kiu courses --json` ({semester, groups:[{course, group}]}) -> [{key, id, nameEn, nameKa, groups:[{id, name, type}]}]
export function buildCourses(res) {
  const byId = new Map();
  for (const { course, group } of res?.groups ?? []) {
    if (!course?.listId) continue;
    let c = byId.get(course.listId);
    if (!c) byId.set(course.listId, c = { key: '', id: course.listId, nameEn: course.altName || course.name, nameKa: course.name || course.altName, groups: [] });
    if (group?.courseGroupId && !c.groups.some((g) => g.id === group.courseGroupId)) {
      c.groups.push({ id: group.courseGroupId, name: group.groupName, type: group.type });
    }
  }
  // key: slug of the English name, stable across runs; course-<id> if there is no Latin name
  const taken = new Set();
  for (const c of byId.values()) {
    let key = slug(c.nameEn) || `course-${c.id}`;
    if (taken.has(key)) key = `${key}-${c.id}`;
    taken.add(key);
    c.key = key;
  }
  return [...byId.values()];
}

// find({ groupId?, label?, name? }) -> course or null. Never guesses beyond exact (normalized) matches.
export function courseFinder(courses) {
  const byGroup = new Map(), byLabel = new Map(), byName = new Map();
  for (const c of courses ?? []) {
    for (const g of c.groups ?? []) {
      byGroup.set(g.id, c);
      byLabel.set(norm(`${c.nameEn} / ${g.name}`), c);
    }
    byName.set(norm(c.nameKa), c);
    if (!byName.has(norm(c.nameEn))) byName.set(norm(c.nameEn), c);
  }
  return ({ groupId, label, name } = {}) =>
    (groupId != null && byGroup.get(groupId))
    || (label && (byLabel.get(norm(label)) || byName.get(norm(String(label).split(' / ')[0]))))
    || (name && byName.get(norm(name)))
    || null;
}

// LMS HTML -> plain text that keeps its lines. The LMS editor writes <br style="..."> (attributes on
// the tag), headings, lists and tables, so every block end is a line break, a list item starts with
// "• " and table cells are joined with " · ".
export const plain = (html) => String(html ?? '')
  .replace(/<br\b[^>]*>/gi, '\n')
  .replace(/<li\b[^>]*>/gi, '\n• ')
  .replace(/<\/(p|div|li|h[1-6]|tr|blockquote|pre|ul|ol|table)>|<(ul|ol|table|h[1-6]|blockquote|pre)\b[^>]*>/gi, '\n')
  .replace(/<\/t[dh]>/gi, ' · ')
  .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/[ \t]+/g, ' ').replace(/ · *\n/g, '\n').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();

// LMS "2026-10-13 12:50:09" is Tbilisi time -> ISO with +04:00; anything else parseable -> UTC ISO; else null
export function lmsTime(s) {
  const m = String(s ?? '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?$/);
  if (m) return `${m[1]}T${m[2]}${m[3] ?? ':00'}+04:00`;
  const d = new Date(s ?? NaN);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// rows of the latest (year, semester) in `kiu grades` results: the running points of the current term
export function currentGrades(results) {
  const rows = (results ?? []).filter((r) => r && r.year && r.semester != null);
  if (!rows.length) return [];
  const latest = rows.reduce((a, r) => (r.year > a.year || (r.year === a.year && r.semester > a.semester) ? r : a));
  return rows.filter((r) => r.year === latest.year && r.semester === latest.semester);
}
