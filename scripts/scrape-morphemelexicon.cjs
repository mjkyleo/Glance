#!/usr/bin/env node
// Scrape morphemelexicon.com into a compact, indexed dataset for Glance.
// Outputs app/data/{meta,exams,roots,roottrees,words,affixes}.json
// Resumable: every fetched shard is cached under .scratch/cache/.
// Polite: low concurrency + 429 Retry-After / exponential backoff.
const fs = require('fs');
const path = require('path');

const BASE = 'https://morphemelexicon.com/data';
const OUT = path.join(__dirname, '..', 'app', 'data');
const CACHE = path.join(__dirname, '..', '.scratch', 'cache');
const EXAMS = ['中考', '高考', '四级', '六级', '考研', '专四', '专八', '托福', '雅思', 'GRE'];
const CONC = 2;
const DELAY = 250;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchCached(rel, retries = 7) {
  const cf = path.join(CACHE, rel);
  if (fs.existsSync(cf)) {
    const txt = fs.readFileSync(cf, 'utf8');
    return txt === 'NULL' ? null : JSON.parse(txt);
  }
  const url = `${BASE}/${rel}`;
  for (let i = 0; i < retries; i++) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 40000);
      const res = await fetch(url, { signal: ctl.signal });
      clearTimeout(t);
      if (res.status === 404) { fs.mkdirSync(path.dirname(cf), { recursive: true }); fs.writeFileSync(cf, 'NULL'); return null; }
      if (res.status === 429 || res.status >= 500) {
        const ra = parseFloat(res.headers.get('retry-after'));
        const wait = (!isNaN(ra) ? ra * 1000 : 0) || Math.min(2000 * Math.pow(2, i), 45000);
        console.error(`  ${res.status} ${rel} wait ${Math.round(wait / 1000)}s`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      fs.mkdirSync(path.dirname(cf), { recursive: true });
      fs.writeFileSync(cf, JSON.stringify(j));
      return j;
    } catch (e) {
      if (i === retries - 1) { console.error('FAIL', rel, e.message); return null; }
      await sleep(Math.min(2000 * Math.pow(2, i), 30000));
    }
  }
  return null;
}

async function pool(items, fn, conc = CONC) {
  let idx = 0, done = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i], i);
      done++;
      if (done % 30 === 0) console.error(`  ...${done}/${items.length}`);
      await sleep(DELAY);
    }
  }
  await Promise.all(Array.from({ length: Math.min(conc, items.length) }, worker));
}

const shard = s => String(s).slice(0, 2).toLowerCase();
const uniq = a => [...new Set(a)];

function flattenRtree(nodes, acc = []) {
  for (const n of nodes || []) {
    if (Array.isArray(n)) {
      if (typeof n[0] === 'string') acc.push([n[0], n[2] || '']);
      if (Array.isArray(n[1])) flattenRtree(n[1], acc);
    }
  }
  return acc;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(CACHE, { recursive: true });
  console.error('1/6 index-lite...');
  const lite = await fetchCached('index-lite.json');
  if (!lite) throw new Error('index-lite failed');

  console.error('2/6 exam lists...');
  const exams = {};
  const examWords = new Set();
  const examRoots = new Set();
  for (const tag of EXAMS) {
    const j = await fetchCached(`exam/${encodeURIComponent(tag)}.json`);
    if (!j) { console.error('  skip exam', tag); continue; }
    const groups = (j.groups || []).map(g => {
      const [root, rootZh, rootEn, familySize, words] = g;
      examRoots.add(root);
      const ws = (words || []).map(w => { examWords.add(w[0]); return [w[0], w[1], w[2] || '', w[3] || '']; });
      return { root, rootZh, rootEn, familySize, words: ws };
    });
    const loose = (j.loose || []).map(w => { const wd = Array.isArray(w) ? w[0] : w; examWords.add(wd); return Array.isArray(w) ? [w[0], w[1], w[2] || '', w[3] || ''] : [w, '', '', '']; });
    exams[tag] = { n: j.n, groups, loose };
    console.error(`  ${tag}: ${j.n} words, ${groups.length} groups`);
    await sleep(DELAY);
  }

  const rShards = uniq([...examRoots].map(shard));
  console.error(`3/6 root shards (${rShards.length})...`);
  const roots = {}, roottrees = {};
  await pool(rShards, async s => {
    const j = await fetchCached(`r/${s}.json`);
    if (!j) return;
    for (const id of Object.keys(j)) {
      if (!examRoots.has(id)) continue;
      const r = j[id];
      let fam = [];
      if (r.etree && Array.isArray(r.etree.br)) for (const b of r.etree.br) for (const w of b.w || []) fam.push([w[0], w[1] || '']);
      if (!fam.length) fam = flattenRtree(r.rtree);
      const seen = new Set(); fam = fam.filter(w => w[0] && !seen.has(w[0]) && seen.add(w[0]));
      roots[id] = { g: r.g || '', zh: r.zh || '', tier: r.tier || '', size: fam.length, family: fam };
      if (r.rtree && r.rtree.length) roottrees[id] = r.rtree;
    }
  });

  const wShards = uniq([...examWords].map(shard));
  console.error(`4/6 word shards (${wShards.length})...`);
  const words = {};
  await pool(wShards, async s => {
    const j = await fetchCached(`w/${s}.json`);
    if (!j) return;
    for (const w of Object.keys(j)) {
      if (!examWords.has(w)) continue;
      const d = j[w];
      const def = (d.d || []).slice(0, 6).map(x => [x[0], x[1], (x[2] || []).slice(0, 5)]);
      words[w] = {
        zh: d.zh || '', ipa: (d.ipa2 && (d.ipa2.us || d.ipa2.uk)) || d.ph || '',
        cf: d.cf || '', fr: d.fr || 0, def,
        der: (d.der || []).slice(0, 12), inf: (d.inf || []).slice(0, 8),
        au: (d.au && d.au.us ? d.au.us.slice(0, 1) : []),
        ety: (d.e || '').slice(0, 200), tag: d.tag || [],
        root: (d.p && d.p[0] && d.p[0][1]) || ''
      };
    }
  });

  console.error('5/6 affix shards...');
  const affixIds = lite.affixes.map(a => a[0]);
  const affixSense = {};
  await pool(uniq(affixIds.map(shard)), async s => {
    const j = await fetchCached(`a/${s}.json`);
    if (!j) return;
    for (const id of Object.keys(j)) {
      const a = j[id];
      affixSense[id] = (a.s || []).slice(0, 6).map(x => [x.g, (x.ex || []).slice(0, 2)]);
    }
  });
  const affixes = lite.affixes.map(a => ({ id: a[0], k: a[1], en: a[2], zh: a[4] || '', count: a[3], s: affixSense[a[0]] || [] }));

  console.error('6/6 write files...');
  const meta = {
    source: 'morphemelexicon.com', built: new Date().toISOString().slice(0, 10),
    exams: Object.keys(exams),
    counts: { examWords: examWords.size, roots: Object.keys(roots).length, words: Object.keys(words).length, affixes: affixes.length, trees: Object.keys(roottrees).length }
  };
  const write = (name, obj) => {
    const f = path.join(OUT, name);
    fs.writeFileSync(f, JSON.stringify(obj));
    console.error(`  ${name}: ${(fs.statSync(f).size / 1048576).toFixed(2)} MB`);
  };
  write('meta.json', meta);
  write('exams.json', exams);
  write('roots.json', roots);
  write('roottrees.json', roottrees);
  write('words.json', words);
  write('affixes.json', affixes);
  console.error('DONE', JSON.stringify(meta.counts));
})().catch(e => { console.error(e); process.exitCode = 1; });