// Shared headword resolver for the corpus-frequency and exam-cloze builds.
// Surface tokens (inflections, British spellings, comparatives) fold onto the
// headwords the app actually indexes, so both datasets speak the same vocabulary.
// Irregular past / participle forms the dataset's inflection index does not carry.
const IRREGULAR = {
  arose: 'arise', arisen: 'arise', awoke: 'awake', awoken: 'awake',
  was: 'be', were: 'be', been: 'be', bore: 'bear', born: 'bear', borne: 'bear',
  beat: 'beat', beaten: 'beat', became: 'become', began: 'begin', begun: 'begin',
  bent: 'bend', bit: 'bite', bitten: 'bite', bled: 'bleed', blew: 'blow', blown: 'blow',
  broke: 'break', broken: 'break', bred: 'breed', brought: 'bring', built: 'build',
  burnt: 'burn', burst: 'burst', bought: 'buy', caught: 'catch', chose: 'choose',
  chosen: 'choose', clung: 'cling', came: 'come', cost: 'cost', crept: 'creep',
  cut: 'cut', dealt: 'deal', dug: 'dig', drew: 'draw', drawn: 'draw', dreamt: 'dream',
  drank: 'drink', drunk: 'drink', drove: 'drive', driven: 'drive', ate: 'eat', eaten: 'eat',
  fell: 'fall', fallen: 'fall', fed: 'feed', felt: 'feel', fought: 'fight', found: 'find',
  fled: 'flee', flew: 'fly', flown: 'fly', forbade: 'forbid', forbidden: 'forbid',
  forgot: 'forget', forgotten: 'forget', forgave: 'forgive', forgiven: 'forgive',
  froze: 'freeze', frozen: 'freeze', got: 'get', gotten: 'get', gave: 'give', given: 'give',
  went: 'go', gone: 'go', grew: 'grow', grown: 'grow', hung: 'hang', had: 'have',
  heard: 'hear', hid: 'hide', hidden: 'hide', hit: 'hit', held: 'hold', hurt: 'hurt',
  kept: 'keep', knelt: 'kneel', knew: 'know', known: 'know', laid: 'lay', led: 'lead',
  leant: 'lean', leapt: 'leap', learnt: 'learn', left: 'leave', lent: 'lend', let: 'let',
  lay: 'lie', lain: 'lie', lit: 'light', lost: 'lose', made: 'make', meant: 'mean',
  met: 'meet', paid: 'pay', proved: 'prove', proven: 'prove', put: 'put', quit: 'quit',
  read: 'read', rode: 'ride', ridden: 'ride', rang: 'ring', rung: 'ring', rose: 'rise',
  risen: 'rise', ran: 'run', said: 'say', saw: 'see', seen: 'see', sought: 'seek',
  sold: 'sell', sent: 'send', set: 'set', sewn: 'sew', shook: 'shake', shaken: 'shake',
  shed: 'shed', shone: 'shine', shot: 'shoot', showed: 'show', shown: 'show', shut: 'shut',
  sang: 'sing', sung: 'sing', sank: 'sink', sunk: 'sink', sat: 'sit', slept: 'sleep',
  slid: 'slide', smelt: 'smell', sowed: 'sow', sown: 'sow', spoke: 'speak', spoken: 'speak',
  sped: 'speed', spelt: 'spell', spent: 'spend', spilt: 'spill', spun: 'spin', spat: 'spit',
  split: 'split', spoilt: 'spoil', spread: 'spread', sprang: 'spring', sprung: 'spring',
  stood: 'stand', stole: 'steal', stolen: 'steal', stuck: 'stick', stung: 'sting',
  stank: 'stink', stunk: 'stink', strode: 'stride', struck: 'strike', stricken: 'strike',
  strove: 'strive', striven: 'strive', swore: 'swear', sworn: 'swear', swept: 'sweep',
  swelled: 'swell', swollen: 'swell', swam: 'swim', swum: 'swim', swung: 'swing',
  took: 'take', taken: 'take', taught: 'teach', tore: 'tear', torn: 'tear', told: 'tell',
  thought: 'think', threw: 'throw', thrown: 'throw', trod: 'tread', understood: 'understand',
  undertook: 'undertake', undertaken: 'undertake', undid: 'undo', undone: 'undo',
  woke: 'wake', woken: 'wake', wore: 'wear', worn: 'wear', wove: 'weave', woven: 'weave',
  wept: 'weep', won: 'win', wound: 'wind', withdrew: 'withdraw', withdrawn: 'withdraw',
  withheld: 'withhold', withstood: 'withstand', wrung: 'wring', wrote: 'write', written: 'write',
  cannot: 'can', men: 'man', women: 'woman', children: 'child', teeth: 'tooth',
  feet: 'foot', mice: 'mouse', geese: 'goose', people: 'person', lice: 'louse',
  oxen: 'ox', criteria: 'criterion', phenomena: 'phenomenon', media: 'medium',
  data: 'datum', alumni: 'alumnus', stimuli: 'stimulus', fungi: 'fungus',
  nuclei: 'nucleus', syllabi: 'syllabus', indices: 'index', appendices: 'appendix'
};

// Suffix folding. Each entry: [pattern, replacements, required base POS, min base length].
// Only candidates that exist as headwords AND satisfy the POS gate are accepted, so
// "hacker" cannot fold into "hack" and "lester" cannot fold into "lest".
// The plain -s strip runs first: "believes" is believe+s, not belief via the -ves rule.
const ADJ = ['a', 'adj', 'ad', 'adv'];
const VERB = ['v', 'vt', 'vi'];
const SUFFIX_RULES = [
  [/s$/, [''], null, 3],
  [/ies$/, ['y'], null, 3],
  [/ves$/, ['f', 'fe'], null, 3],
  [/ches$/, ['ch'], null, 3], [/shes$/, ['sh'], null, 3], [/xes$/, ['x'], null, 3], [/zes$/, ['z'], null, 3],
  [/([^s])ses$/, ['$1se', '$1s', '$1'], null, 3],
  [/oes$/, ['o', 'oe'], null, 3],
  [/ied$/, ['y'], VERB, 2],
  [/([^aeiou])\1ed$/, ['$1'], VERB, 2],
  [/ed$/, ['', 'e'], VERB, 2],
  [/ing$/, ['', 'e'], VERB, 2],
  [/iest$/, ['y'], ADJ, 3], [/ier$/, ['y'], ADJ, 3],
  [/est$/, ['', 'e'], ADJ, 3], [/er$/, ['', 'e'], ADJ, 3],
  [/ily$/, ['y'], ADJ, 3], [/ly$/, [''], ADJ, 3]
];

// Corpus tokens that look inflected but are not: lower-cased surnames and OCR
// fragments. Folding them would credit an unrelated headword ("peter" → pet).
const NO_FOLD = new Set(['peter', 'horner', 'venter', 'lester', 'hearted', 'eved', 'ading', 'iss', 'bes', 'layed']);

// A headword's POS abbreviations, read from the "n. … / vt. …" gloss branches.
function posSet(words, head) {
  const zh = String((words[head] || {}).zh || '');
  const out = new Set();
  for (const seg of zh.split('/')) {
    const m = seg.trim().match(/^([a-z]+)\./i);
    if (m) out.add(m[1].toLowerCase());
  }
  return out;
}


// Spelling variants: the dataset indexes some words only in the American form and
// others only in the British one, so both directions are tried. Deliberately narrow —
// a broad "-al"/"-ical" strip turned "judgmental" into "judge".
const SPELLING = [
  [/isation$/, 'ization'], [/isations$/, 'izations'], [/ise$/, 'ize'], [/ised$/, 'ized'],
  [/ises$/, 'izes'], [/ising$/, 'izing'],
  [/ization$/, 'isation'], [/izations$/, 'isations'], [/ize$/, 'ise'], [/ized$/, 'ised'],
  [/izes$/, 'ises'], [/izing$/, 'ising'],
  [/our$/, 'or'], [/ours$/, 'ors'], [/or$/, 'our'], [/ors$/, 'ours'],
  [/ogue$/, 'og'], [/og$/, 'ogue'],
  [/tre$/, 'ter'], [/ter$/, 'tre'],
  [/lling$/, 'ling'], [/lled$/, 'led'], [/ling$/, 'lling'], [/led$/, 'lled'],
  [/men$/, 'man'], [/sceptic/, 'skeptic'], [/skeptic/, 'sceptic']
];

function buildReverseIndex(words) {
  const rev = new Map();
  const add = (form, head) => { const k = String(form).toLowerCase().trim(); if (k && !rev.has(k)) rev.set(k, head); };
  for (const head of Object.keys(words)) {
    const d = words[head] || {};
    for (const f of d.inf || []) add(f, head);
    for (const dv of d.der || []) add(dv[0], head);
  }
  return rev;
}

function spellVariants(word) {
  const out = [];
  for (const [re, rep] of SPELLING) {
    if (!re.test(word)) continue;
    const cand = word.replace(re, rep);
    if (cand.length >= 4 && cand !== word && !out.includes(cand)) out.push(cand);
  }
  return out;
}

function resolve(token, words, rev) {
  const lw = String(token || '').toLowerCase();
  if (words[token]) return { head: token, how: 'exact' };
  if (NO_FOLD.has(lw)) return { head: null, how: 'unmatched' };

  if (rev.has(lw)) return { head: rev.get(lw), how: 'inflection' };
  if (IRREGULAR[lw] && words[IRREGULAR[lw]]) return { head: IRREGULAR[lw], how: 'irregular' };
  // Spelling variants only after the dataset's own inflection index has been tried:
  // "filled" is fill+ed, and the -lled/-led swap would otherwise read it as "filed".
  for (const v of spellVariants(lw)) {
    if (words[v]) return { head: v, how: 'spelling' };
    if (rev.has(v)) return { head: rev.get(v), how: 'spelling' };
    if (IRREGULAR[v] && words[IRREGULAR[v]]) return { head: IRREGULAR[v], how: 'spelling' };
  }

  // Inflection strips run on the token as printed, never on a spelling variant:
  // composing both directions turned "notre" into "not" via noter → not.
  for (const [re, reps, needPos, minBase] of SUFFIX_RULES) {
    if (!re.test(lw)) continue;
    for (const r of reps) {
      const base = lw.replace(re, r);
      if (!base || base.length < minBase) continue;
      for (const cand of [base, ...spellVariants(base)]) {
        if (!words[cand]) continue;
        if (needPos) {
          const pos = posSet(words, cand);
          // Modern exam prose verbs plain nouns ("texting", "networking"); the dataset's
          // POS labels predate that, so a longer base is accepted without a verb sense.
          if (!needPos.some(p => pos.has(p)) && !(needPos === VERB && cand.length >= 4)) continue;
        }
        return { head: cand, how: cand === base ? 'suffix' : 'spelling' };
      }
    }
  }
  return { head: null, how: 'unmatched' };
}

module.exports = { IRREGULAR, NO_FOLD, SUFFIX_RULES, SPELLING, posSet, spellVariants, buildReverseIndex, resolve };
