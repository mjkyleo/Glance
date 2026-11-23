#!/usr/bin/env node
// Gate for the unified study panel: one order list + one toggle set, shared by the
// study page and the word sheet. Legacy cardOrder/autoExplain must migrate away.
//
//   node scripts/verify-panel-order.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const IDS = ['phonetic', 'morphemes', 'mnemonic', 'meaning', 'definitions', 'family', 'synonyms',
  'derivatives', 'inflections', 'etymology', 'examples', 'collocations', 'freq', 'cloze', 'dict', 'ai'];

function makeStore(raw) {
  const saved = [];
  const sandbox = {
    window: {}, console, Math, JSON, Set, Map, Array, Object, String, Number, Boolean, RegExp, Date,
    parseInt, parseFloat, isNaN, Promise,
    setTimeout: () => 0, clearTimeout: () => {},
    Platform: { getSettings: async () => raw, saveSettings: d => saved.push(d) },
    SRS: {
      DEFAULT_W: [], DAY: 86400000, G: {}, GRADE: { KNOW: 3, FUZZY: 2, FORGOT: 1 }, GRADUATED: 5, MAX_BOX: 8,
      isNew: s => !s || !s.box, isKnown: s => !!s && s.box >= 5, review: () => ({}), optimize: () => []
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'app/js/store.js'), 'utf8'), sandbox, { filename: 'store.js' });
  return { Store: sandbox.window.Store, saved };
}

const fail = [];
const ok = (c, m) => { if (!c) fail.push(m); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  // 1. defaults: 16 unique blocks, all toggles on, no legacy keys
  const fresh = makeStore({});
  await fresh.Store.load();
  const d0 = fresh.Store.data;
  ok(same(d0.studyPanelOrder, IDS), 'default order is not the 16-block list');
  ok(same(fresh.Store.defaultPanelOrder(), IDS), 'defaultPanelOrder() drifted from DEFAULTS');
  ok(IDS.every(id => d0.studyPanel[id] === true), 'a default toggle is off');
  ok(!('cardOrder' in d0), 'cardOrder survived in defaults');
  ok(!('autoExplain' in d0.ai), 'ai.autoExplain survived in defaults');

  // 2. legacy stored order migrates: relative order kept, missing blocks appended, key removed
  const legacyOrder = ['etymology', 'examples', 'definitions', 'family', 'synonyms', 'derivatives', 'inflections', 'collocations'];
  const legacy = makeStore({ cardOrder: legacyOrder, studyPanel: { examples: false }, ai: { provider: 'deepseek', autoExplain: true } });
  await legacy.Store.load();
  const d1 = legacy.Store.data;
  ok(!('cardOrder' in d1), 'legacy cardOrder not deleted on load');
  ok(same(d1.studyPanelOrder.slice(0, legacyOrder.length), legacyOrder), 'legacy relative order lost');
  ok(same(d1.studyPanelOrder, legacyOrder.concat(IDS.filter(id => !legacyOrder.includes(id)))), 'legacy migration did not append missing blocks');
  ok(d1.studyPanel.examples === false && d1.studyPanel.dict === true, 'legacy toggles not merged with defaults');
  ok(!('autoExplain' in d1.ai), 'legacy ai.autoExplain not dropped');

  // 3. dirty order (unknown ids + duplicates) is cleaned and completed
  const dirty = makeStore({ studyPanelOrder: ['ai', 'bogus', 'ai', 'freq'] });
  await dirty.Store.load();
  ok(same(dirty.Store.data.studyPanelOrder, ['ai', 'freq'].concat(IDS.filter(id => !['ai', 'freq'].includes(id)))), 'dirty order not normalized');

  // 4. export carries the unified panel and no legacy keys / secrets
  const ex = fresh.Store.exportData();
  ok(same(ex.data.settings.studyPanelOrder, IDS), 'export lost studyPanelOrder');
  ok(IDS.every(id => ex.data.settings.studyPanel[id] === true), 'export lost studyPanel toggles');
  ok(!('cardOrder' in ex.data.settings), 'export still carries cardOrder');
  ok(!('autoExplain' in ex.data.settings.ai), 'export still carries ai.autoExplain');
  ok(!('key' in ex.data.settings.ai) && !('keys' in ex.data.settings.dict), 'export leaked API keys');

  // 5. importing a legacy backup keeps its card order and toggles
  const legacyBackup = {
    app: 'Glance', kind: 'learning-data', schema: 1, words: [],
    data: { settings: { cardOrder: legacyOrder, studyPanel: { etymology: false }, ai: { enabled: true, provider: 'deepseek', autoExplain: true } } }
  };
  const imp = makeStore({});
  await imp.Store.load();
  imp.Store.importData(legacyBackup, 'replace');
  const d2 = imp.Store.data;
  ok(same(d2.studyPanelOrder, legacyOrder.concat(IDS.filter(id => !legacyOrder.includes(id)))), 'legacy backup import lost card order');
  ok(d2.studyPanel.etymology === false && d2.studyPanel.ai === true, 'legacy backup import lost toggles');
  ok(!('autoExplain' in d2.ai), 'legacy backup import resurrected ai.autoExplain');

  // 6. importing a current backup restores the exact order
  const newBackup = {
    app: 'Glance', kind: 'learning-data', schema: 1, words: [],
    data: { settings: { studyPanelOrder: IDS.slice().reverse(), studyPanel: { cloze: false } } }
  };
  const imp2 = makeStore({});
  await imp2.Store.load();
  imp2.Store.importData(newBackup, 'replace');
  ok(same(imp2.Store.data.studyPanelOrder, IDS.slice().reverse()), 'current backup import lost exact order');
  ok(imp2.Store.data.studyPanel.cloze === false, 'current backup import lost toggle');

  console.log(JSON.stringify({ failures: fail.length, fail }, null, 1));
  if (fail.length) { console.error('FAIL ' + fail.length); process.exitCode = 1; }
  else console.log('PASS: unified panel order/toggles + legacy migration + export/import');
})();