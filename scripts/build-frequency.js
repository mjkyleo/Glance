#!/usr/bin/env node
// Build app/data/frequency.json from assets/words/cet6_full_vocabulary_frequency.csv.
//
// The CSV is a CET-6 exam-paper corpus statistic (rank + raw occurrence count per
// surface token). The app's word library is headword-indexed, so surface tokens are
// folded onto headwords: exact match, then the dataset's own inflection/derivative
// index, then conservative suffix rules, then a short irregular-verb table.
// A headword keeps its own exact row plus the folded rows of every form it owns.
//
//   node scripts/build-frequency.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'words', 'cet6_full_vocabulary_frequency.csv');
const WORDS = path.join(ROOT, 'app', 'data', 'words.json');
const OUT = path.join(ROOT, 'app', 'data', 'frequency.json');

const { buildReverseIndex, resolve } = require('./lib/lemma');

function parseCsv(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  const rows = [];
  for (const line of lines.slice(1)) {
    const c = line.split(',');
    const rank = Number(c[0]), word = String(c[1] || '').trim(), freq = Number(c[2]);
    if (!word || !Number.isFinite(rank) || !Number.isFinite(freq)) continue;
    rows.push({ rank, word, freq });
  }
  return rows;
}

function main() {
  const words = JSON.parse(fs.readFileSync(WORDS, 'utf8'));
  const rows = parseCsv(fs.readFileSync(SRC, 'utf8'));
  const rev = buildReverseIndex(words);

  const agg = new Map();
  const forms = [];
  const stats = { exact: 0, inflection: 0, irregular: 0, suffix: 0, spelling: 0, unmatched: 0, skipped: 0 };
  const unmatched = [];

  for (const r of rows) {
    // Corpus artefacts: OCR fragments ("-hour", "--have") and single/double-letter
    // noise are not vocabulary and would pollute a headword's count.
    if (!/^[a-z][a-z'-]{1,}$/.test(r.word.toLowerCase())) { stats.skipped++; continue; }
    const { head, how } = resolve(r.word, words, rev);
    stats[how]++;
    if (!head) { unmatched.push(r); continue; }
    const key = head.toLowerCase();
    let a = agg.get(key);
    if (!a) { a = { word: head, freq: 0, n: 0, rank: r.rank, exact: null, forms: [] }; agg.set(key, a); }
    a.freq += r.freq;
    a.n++;
    if (r.rank < a.rank) a.rank = r.rank;
    if (how === 'exact') a.exact = { rank: r.rank, freq: r.freq };
    a.forms.push([r.word.toLowerCase(), r.rank, r.freq]);
    forms.push({ word: r.word, rank: r.rank, freq: r.freq, head, how });
  }

  const entries = [...agg.values()].sort((a, b) => b.freq - a.freq || a.rank - b.rank);
  entries.forEach((e, i) => {
    e.rank = i + 1;
    e.forms.sort((x, y) => y[2] - x[2] || x[1] - y[1]);
    e.coverage = e.freq ? +(e.forms.filter(f => f[0] === e.word.toLowerCase()).reduce((s, f) => s + f[2], 0) / e.freq).toFixed(3) : 0;
  });
  const map = {};
  for (const e of entries) {
    map[e.word] = { r: e.rank, f: e.freq, n: e.n, er: e.exact ? e.exact.rank : 0, ef: e.exact ? e.exact.freq : 0 };
  }
  const total = entries.reduce((s, e) => s + e.freq, 0);
  const out = {
    source: 'CET-6 真题语料词频统计',
    sourceFile: 'assets/words/cet6_full_vocabulary_frequency.csv',
    built: new Date().toISOString().slice(0, 10),
    rows: rows.length,
    headwords: entries.length,
    totalFreq: total,
    top: entries.slice(0, 1).map(e => ({ word: e.word, freq: e.freq }))[0] || null,
    stats,
    map
  };
  fs.writeFileSync(OUT, JSON.stringify(out), 'utf8');

  fs.mkdirSync(path.join(ROOT, '.scratch'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, '.scratch', 'frequency-forms.json'),
    JSON.stringify({ forms, unmatched, entries: entries.slice(0, 40) }, null, 1), 'utf8');

  console.log('rows=' + rows.length + ' headwords=' + entries.length + ' totalFreq=' + total);
  console.log('resolve: ' + JSON.stringify(stats));
  console.log('top10: ' + entries.slice(0, 10).map(e => e.word + '(' + e.freq + '/' + e.n + ')').join(' '));
  console.log('unmatched sample: ' + unmatched.slice(0, 20).map(r => r.word).join(' '));
  console.log('wrote ' + path.relative(ROOT, OUT) + ' (' + fs.statSync(OUT).size + ' bytes)');
}

main();