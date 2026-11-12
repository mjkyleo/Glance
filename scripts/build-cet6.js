#!/usr/bin/env node
// Fetch CET-6 vocabulary + root/affix (词根词缀) data from morphemelexicon.com
// and save an organized local dataset sorted by root-family size (desc).
const fs = require('fs');
const path = require('path');

const BASE = 'https://morphemelexicon.com/data';
const OUT_DIR = path.join(__dirname, '..', 'data');
const OUT_FILE = path.join(OUT_DIR, 'cet6.json');

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

(async () => {
  const [exam, lite] = await Promise.all([
    getJSON(`${BASE}/exam/${encodeURIComponent('六级')}.json`),
    getJSON(`${BASE}/index-lite.json`)
  ]);

  // roots: [key, en, familySize, origin, etymonType, flag, zh]
  const rootInfo = new Map(lite.roots.map(r => [r[0], r]));

  const groups = exam.groups.map(g => {
    const [root, rootZh, rootEn, familySize, words] = g;
    const info = rootInfo.get(root);
    return {
      root,
      rootZh,
      rootEn,
      familySize,
      origin: info ? info[3] : '',
      etymon: info ? info[4] : '',
      words: words.map(w => ({ word: w[0], meaning: w[1], cefr: w[2] || '', phonetic: w[3] || '' }))
    };
  });

  groups.sort((a, b) => b.familySize - a.familySize || a.root.localeCompare(b.root));

  // affixes: [key, type, en, count, zh]
  const affixes = lite.affixes.map(a => ({ affix: a[0], type: a[1], en: a[2], zh: a[4] || '', count: a[3] }));

  const out = {
    source: 'morphemelexicon.com',
    exam: exam.tag,
    built: new Date().toISOString().slice(0, 10),
    totalWords: exam.n,
    groupCount: groups.length,
    groups,
    affixes
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out));

  console.log(`Saved ${OUT_FILE}`);
  console.log(`words=${out.totalWords} groups=${out.groupCount} affixes=${affixes.length}`);
  console.log('Top 10 groups by family size:');
  groups.slice(0, 10).forEach(g => console.log(`  ${g.familySize}\t${g.root}\t${g.rootZh}\t(CET6 subset: ${g.words.length})`));
})().catch(e => { console.error(e); process.exitCode = 1; });