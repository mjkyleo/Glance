#!/usr/bin/env node
// Build app/data/cloze.json from assets/words/六级选词填空词库_2021-2026.json.
//
// CET-6 Part III Section A is a 15-option / 10-blank word bank (题号 26–35). The
// source JSON holds the A–O option lists per paper. This build keeps every paper
// intact for provenance and additionally classifies the option words by the POS
// the exam actually tests, so 考试专项 can offer 名词 / 动词 / 形容词 / 副词 decks
// plus a high-frequency deck built from the corpus statistic.
//
//   node scripts/build-cet6-cloze.js
const fs = require('fs');
const path = require('path');
const { buildReverseIndex, resolve, posSet } = require('./lib/lemma');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'words', '六级选词填空词库_2021-2026.json');
const WORDS = path.join(ROOT, 'app', 'data', 'words.json');
const FREQ = path.join(ROOT, 'app', 'data', 'frequency.json');
const OUT = path.join(ROOT, 'app', 'data', 'cloze.json');

const POS_GROUPS = [
  { id: 'n', name: '名词选项', desc: '空格前是冠词 / 形容词 / 介词，或空格作主语宾语' },
  { id: 'v', name: '动词选项', desc: '注意时态语态：原形 / -s / -ed / -ing 决定能否填入' },
  { id: 'adj', name: '形容词选项', desc: '修饰名词或作系动词补语，也含 -ed / -ing 分词形容词' },
  { id: 'adv', name: '副词选项', desc: '修饰动词、形容词或整句，去掉后句子依然完整' }
];
const POS_NORM = { n: 'n', v: 'v', vt: 'v', vi: 'v', a: 'adj', adj: 'adj', ad: 'adv', adv: 'adv' };

// Option words the indexed library does not carry as headwords. Their gloss is
// merged INTO app/data/words.json (the single explanation source) at build time;
// cloze.json itself stores only references plus exam facts (sets / letters / POS).
const EXTRA_GLOSS = {
  behavioural: { zh: 'a. 行为的，行为科学的', pos: 'adj' },
  demographics: { zh: 'n. 人口统计数据，人口结构', pos: 'n' },
  depictions: { zh: 'n. 描写，描绘（depiction 的复数）', pos: 'n' },
  duplications: { zh: 'n. 重复，复制（duplication 的复数）', pos: 'n' },
  logistical: { zh: 'a. 后勤的，统筹协调的', pos: 'adj' },
  prioritize: { zh: 'vt. 优先处理，按重要性排序', pos: 'v' },
  replanting: { zh: 'vt. 重新种植，补种（replant 的现在分词）', pos: 'v' },
  unmatchable: { zh: 'a. 无法匹敌的，无可比拟的', pos: 'adj' },
  proximately: { zh: 'adv. 近似地，接近地', pos: 'adv' },
  sceptically: { zh: 'adv. 怀疑地（美式 skeptically）', pos: 'adv' },
  evasively: { zh: 'adv. 逃避地，推托地', pos: 'adv' },
  amiably: { zh: 'adv. 和蔼地，亲切地', pos: 'adv' },
  ardently: { zh: 'adv. 热切地，热烈地', pos: 'adv' },
  arbitrary: { zh: 'a. 任意的，武断的', pos: 'adj' }
};

// The exam tests 词性判断: which of the 15 options can grammatically fill a blank.
// A derived option form carries its OWN part of speech, not its lemma's —
// "purchasable" is an adjective even though "purchase" is a noun/verb, and
// "correlated" fills a participle/adjective slot rather than a bare-verb slot.
const LY_ADJECTIVES = new Set(['friendly', 'likely', 'lovely', 'lonely', 'ugly', 'early', 'holy',
  'costly', 'orderly', 'elderly', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'worldly',
  'scholarly', 'cowardly', 'deadly', 'homely', 'lively', 'manly', 'sickly', 'stately', 'timely']);
const IRREGULAR_PLURALS = new Set(['men', 'women', 'children', 'teeth', 'feet', 'mice', 'geese',
  'people', 'lice', 'oxen', 'criteria', 'phenomena', 'media', 'data', 'alumni', 'stimuli',
  'fungi', 'nuclei', 'syllabi', 'indices', 'appendices']);
const ADJ_SUFFIX = /(able|ible|ous|ious|eous|ive|less|ful|ish|worthy|proof|al|ial|ical|ic|ant|ent|ary|ory|ile)$/;
const NOUN_SUFFIX = /(tion|sion|ation|ment|ness|ity|ety|ance|ence|ancy|ency|ship|hood|dom|ism|ist|ee|ure|ics|ology|cracy)$/;
const VERB_SUFFIX = /(ify|ise|ize|ate)$/;

function formPos(form, lemma, how, lemmaPos) {
  const w = form.toLowerCase();
  const same = w === String(lemma || '').toLowerCase();
  if (same) return lemmaPos.length ? lemmaPos : ['n'];
  // -men / -children plurals are nouns, never verbs ("laymen", not lay + -men).
  if (IRREGULAR_PLURALS.has(w) || /(men|children)$/.test(w)) return ['n'];
  const out = new Set();
  if (/ly$/.test(w) && !LY_ADJECTIVES.has(w)) out.add('adv');
  if (/(ing|ed)$/.test(w)) { out.add('v'); out.add('adj'); }
  if (how === 'irregular') { out.add('v'); out.add('adj'); }
  if (ADJ_SUFFIX.test(w)) out.add('adj');
  if (NOUN_SUFFIX.test(w)) out.add('n');
  if (VERB_SUFFIX.test(w)) out.add('v');
  // A bare -s plural / 3rd-person -s is ambiguous, so the lemma decides.
  if (!out.size) lemmaPos.forEach(p => out.add(p));
  return out.size ? [...out] : ['n'];
}

function main() {
  const words = JSON.parse(fs.readFileSync(WORDS, 'utf8'));
  const freq = fs.existsSync(FREQ) ? JSON.parse(fs.readFileSync(FREQ, 'utf8')) : { map: {} };
  const src = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const rev = buildReverseIndex(words);

  const recent = src['近五年词库'] || [];
  const older = src['补充词库_2016-2020'] || [];
  const sets = [];
  const surface = new Map();

  for (const [list, isRecent] of [[recent, true], [older, false]]) {
    for (const s of list) {
      const options = Object.entries(s['选项'] || {}).map(([k, v]) => [k, String(v)]);
      if (options.length !== 15) throw new Error('expected 15 options: ' + s['考试'] + ' got ' + options.length);
      const id = String(s['年份']) + '-' + s['月份'] + '_' + s['套题'];
      sets.push({
        id, year: s['年份'], month: s['月份'], paper: s['套题'], exam: s['考试'],
        recent: isRecent, lead: s['篇目首句'] || '', file: s['来源文件'] || '', options
      });
      for (const [letter, word] of options) {
        const key = word.toLowerCase();
        let e = surface.get(key);
        if (!e) { e = { word, letters: [], sets: [] }; surface.set(key, e); }
        e.sets.push(id);
        e.letters.push(id + ':' + letter);
      }
    }
  }
  sets.sort((a, b) => b.year - a.year || b.month.localeCompare(a.month) || a.paper.localeCompare(b.paper));

  const entries = [];
  const merged = [];
  const stats = { exact: 0, inflection: 0, irregular: 0, suffix: 0, spelling: 0, unmatched: 0, extra: 0 };
  for (const e of surface.values()) {
    let { head, how } = resolve(e.word, words, rev);
    stats[how]++;
    if (!head) {
      const g = EXTRA_GLOSS[e.word.toLowerCase()];
      if (!g) throw new Error('no gloss for option word: ' + e.word + ' — add it to app/data/words.json first');
      head = e.word.toLowerCase();
      if (!words[head]) {
        words[head] = { zh: g.zh, ipa: '', cf: '', fr: 0, def: [], der: [], inf: [], au: [], ety: '', tag: ['六级'], root: '' };
        merged.push(head);
      }
      stats.extra++;
    }
    const d = words[head];
    const zh = d.zh || '';
    if (!zh) throw new Error('no gloss for option word: ' + e.word);
    const allPos = [...new Set([...posSet(words, head)].map(p => POS_NORM[p]).filter(Boolean))];
    const posAll = formPos(e.word, head, how, allPos);
    const f = freq.map[head] || freq.map[e.word] || null;
    entries.push({
      word: e.word,
      lemma: head,
      inLibrary: true,
      how,
      pos: posAll[0],
      // Every slot type this exact form can fill: the exam's 15 options mix
      // categories, and "pattern" legitimately belongs to both the noun and verb decks.
      posAll,
      n: e.sets.length,
      sets: e.sets,
      letters: e.letters,
      fr: f ? f.r : 0,
      ff: f ? f.f : 0
    });
  }
  if (merged.length) {
    fs.writeFileSync(WORDS, JSON.stringify(words), 'utf8');
    console.log('merged into words.json: ' + merged.join(', '));
  }
  // Exam repeat count first (the whole point of a 真题 deck), then corpus frequency.
  entries.sort((a, b) => b.n - a.n || (b.ff - a.ff) || a.word.localeCompare(b.word));

  const decks = POS_GROUPS.map(g => ({
    ...g,
    words: entries.filter(e => e.posAll.includes(g.id)).map(e => e.word)
  }));
  const repeated = entries.filter(e => e.n >= 2);
  decks.push({
    id: 'repeat', name: '重复考过的选项', desc: '在两套及以上真题的 15 个选项里出现过',
    words: repeated.map(e => e.word)
  });
  const recentOnly = entries.filter(e => e.sets.some(id => sets.find(s => s.id === id && s.recent)));
  decks.push({
    id: 'recent', name: '近五年选项', desc: '2021–2026 年真题出现过的全部选项词',
    words: recentOnly.map(e => e.word)
  });
  decks.push({
    id: 'all', name: '全部选项词', desc: '2016–2026 年 26 套真题的 A–O 选项去重汇总',
    words: entries.map(e => e.word)
  });

  const out = {
    source: src.meta && src.meta['数据来源'] || '',
    sourceFile: 'assets/words/六级选词填空词库_2021-2026.json',
    built: new Date().toISOString().slice(0, 10),
    section: 'Part III Reading Comprehension · Section A',
    range: '26–35',
    shape: '15 选 10',
    setCount: sets.length,
    slotCount: sets.length * 15,
    wordCount: entries.length,
    recentSetCount: sets.filter(s => s.recent).length,
    notes: (src.meta && src.meta['清洗记录']) || [],
    missing: (src.missing_in_repo || []).map(m => ({
      exam: m['考试'], year: m['年份'], month: m['月份'], paper: m['套题'], file: m['来源文件'] || ''
    })),
    stats,
    decks,
    sets,
    words: entries
  };
  fs.writeFileSync(OUT, JSON.stringify(out), 'utf8');

  console.log('sets=' + sets.length + ' slots=' + out.slotCount + ' uniqueWords=' + entries.length);
  console.log('resolve: ' + JSON.stringify(stats));
  console.log('decks: ' + decks.map(d => d.id + '=' + d.words.length).join(' '));
  console.log('repeated(>=2 sets): ' + repeated.slice(0, 12).map(e => e.word + '×' + e.n).join(' '));
  console.log('gloss merges into words.json: ' + stats.extra);
  console.log('missing papers: ' + out.missing.length);
  console.log('wrote ' + path.relative(ROOT, OUT) + ' (' + fs.statSync(OUT).size + ' bytes)');
}

main();