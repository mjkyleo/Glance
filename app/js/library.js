// Word-library parsing + normalization + morpheme derivation + card building.
(function () {
  function affixGloss(affixes, raw, kind) {
    if (!raw || !affixes) return '';
    const candidates = kind === 'prefix' ? [raw + '-', raw] : ['-' + raw, raw];
    for (const c of candidates) {
      const hit = affixes.get(c);
      if (hit) return hit.zh || hit.en || '';
    }
    return '';
  }

  function deriveMorphemes(entry, affixes) {
    const fam = entry.rootFamily;
    const word = entry.word || '';
    if (!fam || !fam.root) return [];
    const root = fam.root;
    const idx = word.toLowerCase().indexOf(root.toLowerCase());
    const chips = [];
    if (idx >= 0) {
      const pre = word.slice(0, idx);
      const suf = word.slice(idx + root.length);
      if (pre) chips.push({ text: pre, type: 'prefix', gloss: affixGloss(affixes, pre, 'prefix') });
      chips.push({ text: root, type: 'root', gloss: fam.rootZh || fam.rootEn || '' });
      if (suf) chips.push({ text: suf, type: 'suffix', gloss: affixGloss(affixes, suf, 'suffix') });
    } else {
      chips.push({ text: root, type: 'root', gloss: fam.rootZh || fam.rootEn || '' });
    }
    return chips;
  }

  function asList(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v.filter(Boolean).map(String);
    return String(v).split(/[;；\n]/).map(s => s.trim()).filter(Boolean);
  }

  function buildCards(entry) {
    const cards = [];
    if (entry.meaning) cards.push({ id: 'meaning', title: '释义', kind: 'text', text: entry.meaning });
    if (entry.rootFamily && entry.rootFamily.root) {
      const f = entry.rootFamily;
      cards.push({
        id: 'family', title: '词根家族', kind: 'text',
        text: `${f.root} · ${f.rootZh || ''}${f.rootEn ? ' (' + f.rootEn + ')' : ''}${f.origin ? ' · ' + f.origin : ''}`
      });
    }
    const syn = asList(entry.synonyms);
    if (syn.length) cards.push({ id: 'synonyms', title: '近义词', kind: 'list', items: syn });
    const ant = asList(entry.antonyms);
    if (ant.length) cards.push({ id: 'antonyms', title: '反义词', kind: 'list', items: ant });
    const ex = asList(entry.examples || entry.example);
    if (ex.length) cards.push({ id: 'examples', title: '例句', kind: 'list', items: ex });
    const col = asList(entry.collocations);
    if (col.length) cards.push({ id: 'collocations', title: '搭配', kind: 'list', items: col });
    return cards;
  }

  function fromCet6(json) {
    const affixes = new Map((json.affixes || []).map(a => [a.affix, a]));
    const entries = [];
    for (const g of json.groups || []) {
      const fam = { root: g.root, rootZh: g.rootZh, rootEn: g.rootEn, origin: g.origin, familySize: g.familySize };
      for (const w of g.words || []) {
        entries.push({
          word: w.word, meaning: w.meaning, cefr: w.cefr || '', phonetic: w.phonetic || '',
          example: w.example || '', rootFamily: fam
        });
      }
    }
    return { entries, affixes };
  }

  function fromFlat(arr) {
    const entries = arr.filter(w => w && w.word).map(w => ({
      word: w.word, meaning: w.meaning || w.zh || '', cefr: w.cefr || '', phonetic: w.phonetic || '',
      example: w.example || '', examples: w.examples, synonyms: w.synonyms, antonyms: w.antonyms,
      collocations: w.collocations,
      rootFamily: w.rootFamily || (w.root ? { root: w.root, rootZh: w.rootZh || '', rootEn: w.rootEn || '' } : null)
    }));
    return { entries, affixes: new Map() };
  }

  function fromTsv(text) {
    const entries = text.replace(/\r\n/g, '\n').split('\n')
      .map(l => l.trim()).filter(l => l && !l.startsWith('#'))
      .map(line => {
        const p = line.split('\t');
        return { word: (p[0] || '').trim(), meaning: (p[1] || '').trim(), example: (p[2] || '').trim(), phonetic: '', cefr: '', rootFamily: null };
      })
      .filter(w => w.word);
    return { entries, affixes: new Map() };
  }

  function parse(text, name) {
    const t = (text || '').trim();
    let base;
    if (t.startsWith('{') || t.startsWith('[')) {
      const json = JSON.parse(t);
      base = Array.isArray(json) ? fromFlat(json) : (json.groups ? fromCet6(json) : fromFlat(json.words || []));
    } else {
      base = fromTsv(t);
    }
    for (const e of base.entries) e.morphemes = deriveMorphemes(e, base.affixes);
    return { name: name || 'library', entries: base.entries, affixes: base.affixes };
  }

  window.Library = { parse, buildCards, deriveMorphemes };
})();