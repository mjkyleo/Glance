#!/usr/bin/env node
// One-time migration to the single-explanation-source layout.
//
// Before: every exam book stored [word, meaning, cefr, phonetic] tuples, so the
// same word carried up to ten divergent gloss copies. After: books store only
// word references plus root grouping; words.json is the single explanation source.
//
//   node scripts/migrate-single-source.js
//
// Idempotent: running it on already-migrated data is a no-op. Future rebuilds go
// through scrape-morphemelexicon.cjs / build-cet6-cloze.js, which emit references
// directly, so this script is only needed to replay the migration from history.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const D = n => path.join(ROOT, 'app', 'data', n + '.json');
const read = n => JSON.parse(fs.readFileSync(D(n), 'utf8'));
const write = (n, obj) => fs.writeFileSync(D(n), JSON.stringify(obj), 'utf8');

const words = read('words');
const exams = read('exams');
const roots = read('roots');
const cet6 = read('cet6');
const cloze = read('cloze');

const isRefBook = ex => (ex.groups || []).every(g => (g.words || []).every(w => typeof w === 'string'));
const migrated = isRefBook(exams[Object.keys(exams)[0]]);

// 1. Global source must cover every word any book/deck references. Absorb the only
//    available gloss for words the site index lacks (a, i) and cloze-only options.
const added = [];
const tagsOf = {};
for (const [tag, ex] of Object.entries(exams)) {
  const all = [...(ex.groups || []).flatMap(g => g.words || []), ...(ex.loose || [])];
  for (const w of all) {
    const word = Array.isArray(w) ? w[0] : w;
    (tagsOf[word] = tagsOf[word] || new Set()).add(tag);
    if (words[word]) continue;
    const t = Array.isArray(w) ? w : [word, '', '', ''];
    words[word] = {
      zh: String(t[1] || '').replace(/[\r\n]+/g, '').trim(), ipa: t[3] || '', cf: t[2] || '',
      fr: 0, def: [], der: [], inf: [], au: [], ety: '', tag: [...tagsOf[word]], root: ''
    };
    added.push(word);
  }
}
for (const c of cloze.words || []) {
  if (words[c.lemma]) continue;
  words[c.lemma] = {
    zh: c.zh || '', ipa: '', cf: c.cf || '', fr: 0, def: [], der: [], inf: [], au: [],
    ety: '', tag: ['六级'], root: ''
  };
  added.push(c.lemma);
}

// 2. Exam books: references + grouping only. Group meta lives in roots.json; the
//    few roots the index lacks keep their inline meta and win at runtime.
let inlineGroups = 0;
const refExams = {};
for (const [tag, ex] of Object.entries(exams)) {
  refExams[tag] = {
    groups: (ex.groups || []).map(g => {
      const ws = (g.words || []).map(w => (Array.isArray(w) ? w[0] : w));
      if (roots[g.root]) return { root: g.root, words: ws };
      inlineGroups++;
      return { root: g.root, rootZh: g.rootZh, rootEn: g.rootEn, familySize: g.familySize, words: ws };
    }),
    loose: (ex.loose || []).map(w => (Array.isArray(w) ? w[0] : w))
  };
}

// 3. Legacy cet6 seed: same partition as exams['六级'], references only. origin/etymon
//    are root-level etymology notes roots.json does not carry, so they stay.
const refCet6 = {
  source: cet6.source, exam: cet6.exam, built: cet6.built,
  totalWords: cet6.totalWords, groupCount: cet6.groupCount,
  groups: (cet6.groups || []).map(g => {
    const o = { root: g.root, words: (g.words || []).map(w => (typeof w === 'string' ? w : w.word)) };
    if (g.origin) o.origin = g.origin;
    if (g.etymon) o.etymon = g.etymon;
    if (!roots[g.root]) { o.rootZh = g.rootZh; o.rootEn = g.rootEn; o.familySize = g.familySize; }
    return o;
  }),
  affixes: cet6.affixes || []
};

// 4. Cloze corpus: sets/options/POS are exam facts and stay; gloss/CEFR copies go.
const refCloze = Object.assign({}, cloze, {
  words: (cloze.words || []).map(c => {
    const o = Object.assign({}, c);
    delete o.zh; delete o.cf; delete o.tags;
    o.inLibrary = !!words[c.lemma];
    return o;
  })
});

// 5. Assertions: no explanation copy survives in any book/deck file.
const assertNoCopies = () => {
  for (const [tag, ex] of Object.entries(refExams)) {
    for (const g of ex.groups) for (const w of g.words) {
      if (typeof w !== 'string') throw new Error('tuple left in exams ' + tag);
      if (!words[w]) throw new Error('exam word missing from global source: ' + w);
    }
    for (const w of ex.loose) if (!words[w]) throw new Error('loose word missing: ' + w);
  }
  for (const g of refCet6.groups) for (const w of g.words) {
    if (typeof w !== 'string' || !words[w]) throw new Error('cet6 copy/missing: ' + w);
  }
  for (const c of refCloze.words) {
    if ('zh' in c || 'cf' in c) throw new Error('cloze gloss copy left: ' + c.word);
    if (!words[c.lemma]) throw new Error('cloze lemma missing: ' + c.lemma);
  }
};
assertNoCopies();

if (migrated && !added.length) {
  console.log('already migrated; no book writes');
} else {
  write('words', words);
  write('exams', refExams);
  write('cet6', refCet6);
  write('cloze', refCloze);
}
const meta = read('meta');
if (meta.counts && meta.counts.words !== Object.keys(words).length) {
  meta.counts.words = Object.keys(words).length;
  write('meta', meta);
  console.log('meta.counts.words synced to ' + meta.counts.words);
}
const mb = n => (fs.statSync(D(n)).size / 1048576).toFixed(2) + ' MB';
console.log('added to words.json: ' + (added.join(', ') || '(none)') + ' -> ' + Object.keys(words).length + ' headwords');
console.log('inline-meta groups kept: ' + inlineGroups);
console.log('exams ' + mb('exams') + ' | cet6 ' + mb('cet6') + ' | cloze ' + mb('cloze') + ' | words ' + mb('words'));