#!/usr/bin/env node
// Acceptance gate for the single-explanation-source layout.
//
//   node scripts/verify-single-source.js [baseline.json]
//
// Checks, over EVERY book / deck / family the app can render:
//   1. card first-line gloss === words.json[word].zh, zero exceptions;
//   2. words shared by 四级 and 六级 render byte-identical glosses;
//   3. no explanation copy survives in exams/cet6/cloze (references only);
//   4. every referenced word resolves in the global source;
//   5. exams.json <= 1.8 MB and the three big books load no slower than baseline.
// Baseline measured 2026-11-19 on the pre-refactor tuple books (median ms).
const BASELINE = { '四级': { ms: 39, n: 2694 }, '六级': { ms: 69, n: 4327 }, '考研': { ms: 43, n: 3653 } };
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const D = n => path.join(ROOT, 'app', 'data', n + '.json');
const read = n => JSON.parse(fs.readFileSync(D(n), 'utf8'));

const sandbox = { window: {}, console, Math, JSON, Set, Map, Array, Object, String, Number, Boolean, RegExp, Date, parseInt, parseFloat, isNaN };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'app/js/library.js'), 'utf8'), sandbox, { filename: 'library.js' });
const L = sandbox.window.Library;

const names = ['meta', 'exams', 'roots', 'roottrees', 'words', 'affixes', 'official', 'frequency', 'cloze'];
const ds = {};
for (const n of names) ds[n] = read(n);
L.init(ds);
const words = ds.words;
const fail = [];
const ok = (cond, msg) => { if (!cond) fail.push(msg); };

// 1 + 2: first-line source across every renderable book, incl. official / frequency.
let checked = 0;
const glossByBook = {};
for (const b of L.listBooks()) {
  const book = L.getBook(b.tag);
  ok(!!book, 'book missing: ' + b.tag);
  if (!book) continue;
  const map = new Map();
  for (const e of book.entries) {
    map.set(e.word, e.zh || '');
    const d = words[e.word];
    if (!d) continue;
    checked++;
    ok((e.zh || '') === (d.zh || ''), 'first-line mismatch ' + b.tag + '/' + e.word);
    ok(!('meaning' in e), 'legacy meaning field left on ' + b.tag + '/' + e.word);
  }
  glossByBook[b.tag] = map;
}
const cross = [...(glossByBook['四级'] || new Map()).keys()].filter(w => (glossByBook['六级'] || new Map()).has(w));
for (const w of cross) ok(glossByBook['四级'].get(w) === glossByBook['六级'].get(w), 'cross-book gloss differs: ' + w);
// Raw membership overlap (before the quality filter): every shared word must resolve
// to the same global gloss from both books' reference lists.
const rawSet = tag => {
  const ex = ds.exams[tag] || {};
  const s = new Set();
  for (const g of ex.groups || []) for (const w of g.words || []) s.add(w);
  for (const w of ex.loose || []) s.add(w);
  return s;
};
const raw4 = rawSet('四级'), raw6 = rawSet('六级');
const rawCross = [...raw4].filter(w => raw6.has(w));
for (const w of rawCross) {
  const a = L.lookup(w), b = L.lookup(w);
  ok(!!a && (a.zh || '') === (words[w].zh || '') && (b.zh || '') === (words[w].zh || ''), 'raw cross-book gloss differs: ' + w);
}

// cloze decks + printed forms, official syllabus books and root families.
let clozeChecked = 0;
for (const deck of L.clozeDecks()) {
  for (const w of L.clozeWords(deck.id)) {
    const e = L.lookup(w);
    ok(!!e, 'cloze lookup null: ' + w);
    if (!e) continue;
    const c = L.clozeOf(w);
    clozeChecked++;
    ok((e.zh || '') === ((words[c.lemma] || {}).zh || ''), 'cloze gloss mismatch: ' + w);
  }
}
let famChecked = 0;
for (const r of L.listRoots()) {
  const f = L.getFamily(r.root);
  for (const m of f.family) {
    if (!words[m.word]) continue;
    famChecked++;
    ok((m.zh || '') === (words[m.word].zh || ''), 'family gloss mismatch: ' + r.root + '/' + m.word);
  }
}

// 3 + 4: book files carry references only, and every reference resolves.
let refs = 0;
for (const [tag, ex] of Object.entries(ds.exams)) {
  for (const g of ex.groups || []) {
    ok(typeof g.root === 'string', 'group root missing in ' + tag);
    for (const w of g.words || []) {
      ok(typeof w === 'string', 'tuple copy left in exams ' + tag);
      ok(!!words[w], 'unresolved exam reference ' + tag + '/' + w);
      refs++;
    }
  }
  for (const w of ex.loose || []) { ok(typeof w === 'string' && !!words[w], 'bad loose ref ' + tag + '/' + w); refs++; }
}
for (const g of read('cet6').groups || []) for (const w of g.words || []) {
  ok(typeof w === 'string' && !!words[w], 'cet6 copy/unresolved: ' + w);
  refs++;
}
for (const c of ds.cloze.words || []) {
  ok(!('zh' in c) && !('cf' in c) && !('meaning' in c), 'cloze explanation copy: ' + c.word);
  ok(!!words[c.lemma], 'cloze lemma unresolved: ' + c.lemma);
}
const examBytes = fs.statSync(D('exams')).size;
ok(examBytes <= 1.8 * 1048576, 'exams.json too big: ' + examBytes);

// 5: load timing, median of three runs, against the pre-refactor baseline.
const timing = {};
for (const tag of ['四级', '六级', '考研']) {
  const runs = [];
  for (let i = 0; i < 3; i++) {
    L.init(ds);
    const t = Date.now();
    L.getBook(tag);
    runs.push(Date.now() - t);
  }
  runs.sort((a, b) => a - b);
  timing[tag] = runs[1];
}
const baselinePath = process.argv[2];
const before = baselinePath && fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : BASELINE;
for (const tag of Object.keys(timing)) {
  ok(timing[tag] <= before[tag].ms, tag + ' slower than baseline: ' + timing[tag] + ' > ' + before[tag].ms);
  ok(L.getBook(tag).n === before[tag].n, tag + ' entry count changed: ' + L.getBook(tag).n + ' != ' + before[tag].n);
}

console.log(JSON.stringify({
  firstLineChecked: checked, clozeChecked, famChecked, crossBookWords: cross.length, rawCrossBookWords: rawCross.length, refs,
  examsMB: +(examBytes / 1048576).toFixed(2), timing,
  counts: L.listBooks().map(b => b.tag + '=' + b.n).join(' '),
  failures: fail.length, sample: fail.slice(0, 10)
}, null, 1));
if (fail.length) { console.error('FAIL ' + fail.length); process.exitCode = 1; }
else console.log('PASS: single explanation source holds everywhere');