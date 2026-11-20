// Import schema-2 exam shards from an external directory and rebuild the manifest.
// Shards are the single source of truth; the manifest is always derived from them.
// Usage: node scripts/import-exams.js <src-dir-with-shards>
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SRC = process.argv[2];
if (!SRC) { console.error('usage: node scripts/import-exams.js <src-dir>'); process.exit(1); }
const OUT = path.join(__dirname, '..', 'app', 'data', 'exams');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

const files = fs.readdirSync(SRC).filter(f => f.endsWith('.json') && f !== 'manifest.json' && f !== 'index.json');
if (!files.length) { console.error('no shards found in ' + SRC); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
const exams = [];
let totalBytes = 0;
for (const f of files) {
  const buf = fs.readFileSync(path.join(SRC, f));
  const ex = JSON.parse(buf.toString('utf8'));
  if (!ex.examId || !Array.isArray(ex.sections)) { console.error('bad shard: ' + f); process.exit(1); }
  if (ex.examId + '.json' !== f) { console.error('filename/examId mismatch: ' + f); process.exit(1); }
  let questionCount = 0;
  const types = [];
  ex.sections.forEach(s => {
    if (!types.includes(s.type)) types.push(s.type);
    (s.groups || []).forEach(g => { questionCount += (g.questions || []).length; });
  });
  fs.writeFileSync(path.join(OUT, f), buf);
  totalBytes += buf.length;
  exams.push({
    examId: ex.examId, year: ex.year, month: ex.month, set: ex.set, path: f,
    sha256: sha(buf), size: buf.length, questionCount,
    hasAnswers: !!ex.hasAnswers, answersComplete: !!ex.answersComplete,
    answersCoverage: ex.answersCoverage || 0,
    types, writing: !!ex.writing, translation: !!ex.translation,
    needsReview: !!(ex.quality && ex.quality.needsReview)
  });
}
exams.sort((a, b) => b.year - a.year || b.month - a.month || b.set - a.set);
const manifest = {
  version: 'import-' + sha(Buffer.from(exams.map(e => e.examId + e.sha256).join('|'))).slice(0, 12),
  schema: 2,
  source: 'import-exams',
  count: exams.length,
  totalBytes,
  exams
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const stale = fs.readdirSync(OUT).filter(f => f.endsWith('.json') && f !== 'manifest.json' && !files.includes(f));
stale.forEach(f => { fs.unlinkSync(path.join(OUT, f)); console.log('removed stale shard ' + f); });
console.log(`imported ${exams.length} shards, ${totalBytes} bytes; withAnswers=${exams.filter(e => e.hasAnswers).length}`);