#!/usr/bin/env node
// Compat gate for the single-explanation-source layout: legacy imports and stored
// books keep working, and explanation copies never win over the global source.
//
//   node scripts/verify-custom-compat.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const sandbox = { window: {}, console, Math, JSON, Set, Map, Array, Object, String, Number, Boolean, RegExp, Date, parseInt, parseFloat, isNaN };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'app/js/library.js'), 'utf8'), sandbox, { filename: 'library.js' });
const L = sandbox.window.Library;
const ds = {};
for (const n of ['meta', 'exams', 'roots', 'roottrees', 'words', 'affixes', 'official', 'frequency', 'cloze']) ds[n] = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/data', n + '.json'), 'utf8'));
L.init(ds);
const fail = [];
const ok = (c, m) => { if (!c) fail.push(m); };

// legacy TSV with a divergent gloss for a known word + a user-only word
const tsv = 'word\tmeaning\nabandon\t旧副本释义\nzzzq\t用户自造词释义\n';
const p = L.parse(tsv, 'legacy');
const byWord = new Map(p.entries.map(e => [e.word, e]));
ok(!('meaning' in byWord.get('abandon')), 'parse kept gloss copy for known word');
ok(byWord.get('zzzq').meaning === '用户自造词释义', 'parse dropped user-only gloss');

// legacy cet6-format JSON (object words) still parses
const legacyCet6 = JSON.stringify({ groups: [{ root: 'duc', rootZh: '引导', words: [{ word: 'conduct', meaning: '旧副本', cefr: 'B2', phonetic: '/x/' }] }] });
const pc = L.parse(legacyCet6, 'legacy-cet6');
ok(pc.entries[0].word === 'conduct' && !('meaning' in pc.entries[0]), 'legacy cet6 object import not normalized');

// new reference-only cet6.json parses as references
const refCet6 = fs.readFileSync(path.join(ROOT, 'app/data/cet6.json'), 'utf8');
const pr = L.parse(refCet6, 'ref-cet6');
ok(pr.entries.length === 5259 && pr.entries.every(e => !('meaning' in e)), 'reference cet6 parse wrong: ' + pr.entries.length);

// stored old-format book migrates once, then renders from the global source
const stored = { old: { entries: [{ word: 'abandon', meaning: '旧副本释义', cefr: 'B1', phonetic: '/x/' }, { word: 'zzzq', meaning: '用户自造词释义' }] } };
ok(L.migrateCustomBooks(stored) === true, 'migration did not report change');
ok(!('meaning' in stored.old.entries[0]), 'migration kept copy for known word');
ok(stored.old.entries[1].meaning === '用户自造词释义', 'migration dropped user-only gloss');
ok(L.migrateCustomBooks(stored) === false, 'migration not idempotent');
const cb = L.customBook('old', stored.old);
const m = new Map(cb.entries.map(e => [e.word, e]));
ok(m.get('abandon').zh === ds.words['abandon'].zh, 'custom known word not global gloss');
ok(m.get('abandon').senses.length > 0, 'custom known word lacks senses');
ok(m.get('zzzq').zh === '用户自造词释义', 'custom user-only word lost gloss');
ok(m.get('zzzq').senses.length === 1, 'custom user-only word lacks senses');

console.log(JSON.stringify({ failures: fail.length, fail }, null, 1));
if (fail.length) { console.error('FAIL ' + fail.length); process.exitCode = 1; }
else console.log('PASS: legacy compat + migration + custom rendering');