// src/text.mjs on synthetic data shaped like the LMS (made-up courses, groups and texts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { slug, buildCourses, courseFinder, plain, lmsTime, currentGrades } from '../src/text.mjs';

test('plain: the LMS editor\'s styled <br>, paragraphs and inline tags', () => {
  assert.equal(plain('<p style="margin:0">Read chapter 3<br style="color: rgb(0, 0, 0); font-size: 14px;">then answer<BR/>all <b>five</b> questions</p>'),
    'Read chapter 3\nthen answer\nall five questions');
  assert.equal(plain('<p>Hello&nbsp;<b>all</b></p><div>Line &quot;two&quot; &amp; more</div>end<br>x'), 'Hello all\nLine "two" & more\nend\nx');
  assert.equal(plain('<p>a</p><p></p><p></p><p>b</p>'), 'a\n\nb');
});

// a block that ends and one that starts both break the line, so blocks may be one blank line apart
test('plain: headings, lists and tables keep their lines', () => {
  assert.equal(plain('<h2 class="x">Task 1</h2><p>Write a parser.</p><h3>Rules</h3><ul><li>no libraries</li><li style="a">tests <i>required</i></li></ul><ol><li>one</li></ol>after'),
    'Task 1\nWrite a parser.\n\nRules\n\n• no libraries\n\n• tests required\n\n• one\n\nafter');
  assert.equal(plain('<table><tr><th>Part</th><th>Points</th></tr><tr><td>A</td><td>5</td></tr><tr><td>B</td><td> 10 </td></tr></table>Total'),
    'Part · Points\nA · 5\nB · 10\n\nTotal');
  assert.equal(plain('<blockquote>quote</blockquote><pre>code</pre>'), 'quote\n\ncode');
});

test('plain: entities, whitespace, empty input', () => {
  assert.equal(plain('5 &lt; 6 &gt; 4 &amp;&amp; it&#39;s &#039;ok&#039; &#169; &#4304;'), '5 < 6 > 4 && it\'s \'ok\' \u00a9 \u10d0');
  assert.equal(plain('&amp;lt;b&amp;gt;'), '&lt;b&gt;'); // decoded once, not twice
  assert.equal(plain('  a \t  b  <br>   c  '), 'a b\nc');
  assert.equal(plain(null), '');
  assert.equal(plain(undefined), '');
  assert.equal(plain(42), '42');
});

test('lmsTime: LMS local times are Tbilisi (+04:00)', () => {
  assert.equal(lmsTime('2030-10-13 12:50:09'), '2030-10-13T12:50:09+04:00');
  assert.equal(lmsTime('2030-10-13 12:50'), '2030-10-13T12:50:00+04:00');
  assert.equal(lmsTime('2030-10-13T12:50:09'), '2030-10-13T12:50:09+04:00');
  assert.equal(lmsTime('2030-10-13T08:50:09.000Z'), '2030-10-13T08:50:09.000Z');
  assert.equal(new Date(lmsTime('2030-10-13 00:30')).toISOString(), '2030-10-12T20:30:00.000Z');
  assert.equal(lmsTime(''), null);
  assert.equal(lmsTime(undefined), null);
  assert.equal(lmsTime('soon'), null);
});

const group = (listId, name, altName, courseGroupId, groupName, type) =>
  ({ course: { listId, name, altName, items: [] }, group: { listId, courseGroupId, groupName, type, name, altName } });
const RES = {
  semester: { season: 'autumn', seasonYear: '2030/2031' },
  groups: [
    group(11, 'ტესტური კურსი', 'Intro to Testing', 101, 'All Testing', 'lecture'),
    group(11, 'ტესტური კურსი', 'Intro to Testing', 102, 'Testing Seminar G1', 'seminar'),
    group(11, 'ტესტური კურსი', 'Intro to Testing', 102, 'Testing Seminar G1', 'seminar'), // repeated row
    group(12, 'მონაცემები და საწყობები', 'Data & Warehouses', 201, 'G2', 'seminar'),
    group(13, 'მხოლოდ ქართული', '', 301, 'Lectures', 'lecture'),
    group(14, 'სხვა კურსი', 'Intro to Testing', 401, 'Labs', 'seminar'),
  ],
};

test('slug', () => {
  assert.equal(slug('Signals & Systems: Part II'), 'signals-systems-part-ii');
  assert.equal(slug('  Café / Numérique  '), 'cafe-numerique');
  assert.equal(slug('მხოლოდ ქართული'), '');
  assert.equal(slug(null), '');
});

test('buildCourses: one entry per course, groups merged, unique stable keys', () => {
  const cs = buildCourses(RES);
  assert.deepEqual(cs.map((c) => c.key), ['intro-to-testing', 'data-warehouses', 'course-13', 'intro-to-testing-14']);
  assert.deepEqual(cs[0], {
    key: 'intro-to-testing', id: 11, nameEn: 'Intro to Testing', nameKa: 'ტესტური კურსი',
    groups: [{ id: 101, name: 'All Testing', type: 'lecture' }, { id: 102, name: 'Testing Seminar G1', type: 'seminar' }],
  });
  assert.equal(cs[2].nameEn, 'მხოლოდ ქართული'); // no English name: the Georgian one
  assert.deepEqual(buildCourses(null), []);
  assert.deepEqual(buildCourses({ groups: [{ course: null, group: null }] }), []);
});

test('courseFinder: group id, label, Georgian and English names; never guesses', () => {
  const find = courseFinder(buildCourses(RES));
  assert.equal(find({ groupId: 201 })?.key, 'data-warehouses');
  assert.equal(find({ label: 'Intro to Testing / Testing Seminar G1' })?.key, 'intro-to-testing');
  assert.equal(find({ label: 'intro to testing / labs' })?.key, 'intro-to-testing-14'); // the label picks the right one of two same-named courses
  assert.equal(find({ label: 'Data & Warehouses / G9' })?.key, 'data-warehouses'); // unknown group, known course
  assert.equal(find({ name: 'ტესტური კურსი' })?.key, 'intro-to-testing');
  assert.equal(find({ name: '  მონაცემები   და საწყობები ' })?.key, 'data-warehouses');
  assert.equal(find({ name: 'DATA & warehouses' })?.key, 'data-warehouses');
  assert.equal(find({ name: 'მხოლოდ ქართული' })?.key, 'course-13');
  assert.equal(find({ name: 'Intro to' }), null);
  assert.equal(find({ name: 'უცნობი კურსი' }), null);
  assert.equal(find({ label: 'Unknown / G1' }), null);
  assert.equal(find({ groupId: 999 }), null);
  assert.equal(find(), null);
  assert.equal(courseFinder(undefined)({ name: 'x' }), null);
});

test('currentGrades: only the latest year and semester', () => {
  const rows = [
    { year: '2029/2030', semester: 5, course: 'ა', score: 40 },
    { year: '2030/2031', semester: 7, course: 'ა', score: 12 },
    { year: '2030/2031', semester: 7, course: 'ბ', score: 0 },
    { year: '2029/2030', semester: 6, course: 'გ', score: 80 },
    null,
  ];
  assert.deepEqual(currentGrades(rows).map((r) => r.course), ['ა', 'ბ']);
  assert.deepEqual(currentGrades([]), []);
  assert.deepEqual(currentGrades(undefined), []);
});
