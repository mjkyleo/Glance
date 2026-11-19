// 六级真题 txt → JSON 分片构建器（方案：真题txt转JSON方案.md）
// 用法: node scripts/build-exams.js [--src .scratch/zhenti-src] [--out app/data/exams]
// 源语料: Gitee Mjs_00987/cet6_exam_questions_txt_collection (cet6_zhenti_cleaned/, 62 txt)
// 产物: manifest.json + report.json + 每套一个分片；answers 固定 null 留位；全量幂等（版本号由源内容派生）。
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const SRC = path.resolve(argOf('--src', '.scratch/zhenti-src'));
const OUT = path.resolve(argOf('--out', 'app/data/exams'));

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
const NOISE = ['我的作文', '播放听力', '我的翻译', '翻译范文', '译文', '答案解析', '参考答案', '听力原文', '查看答案'];
const isNoise = line => {
  const t = line.replace(/\s+/g, '').toLowerCase();
  if (!t) return true;
  if (NOISE.some(n => t === n.toLowerCase())) return true;
  if (/^[-—]?\d{1,3}[-—]?$/.test(t)) return true;
  if (/^-{3,}$/.test(t)) return true;
  return false;
};
const Q_RE = /^(\d{1,2})\s*[.、)．]\s*(.*)$/;
const OPT_MULTI = /(?<![A-Za-z0-9])([A-D])\s*[.、)．]\s*/g;
const OPT_SINGLE = /^([A-D])\s*[.、)．]\s*(.*)$/;
const PARA_RE = /^\[([A-O])\]\s*(.*)$/;
const RANGE_RE = /^Questions?\s+(\d{1,2})\s+to\s+(\d{1,2})\s+are\s+based\s+on/i;
const PASSAGE_RE = /^Passage\s+(One|Two|Three|Four|Five)\b/i;
const BANK_RE = /([A-O])\)\s*([A-Za-z][A-Za-z-]*)/g;
const hasCJK = s => /[\u4e00-\u9fff]/.test(s);
const typeByNo = no => no <= 25 ? 'listening' : no <= 35 ? 'cloze' : no <= 45 ? 'matching' : 'reading';
const PART_TITLE = { listening: '听力', cloze: '选词填空', matching: '信息匹配', reading: '仔细阅读' };

function normalize(text) {
  return text.replace(/\r\n?/g, '\n').replace(/\u3000/g, ' ').replace(/[ \t]+/g, ' ');
}

function parseExam(file, raw) {
  const examId = path.basename(file, '.txt');
  const m = examId.match(/^(\d{4})-(\d{2})[-_](\d{2})$/);
  if (!m) throw new Error('bad examId ' + examId);
  const lines = normalize(raw).split('\n').map(l => l.trim());
  const title = lines.find(l => l && !isNoise(l)) || examId;
  let noiseCount = 0;
  const kept = [];
  for (const l of lines) { if (isNoise(l)) { if (l) noiseCount++; continue; } kept.push(l); }

  const sections = [];
  let writing = { directions: '', prompt: '' };
  let translation = { directions: '', passage: '' };
  let part = '', kind = '', sub = '';
  let sec = null, group = null, question = null;
  let phase = 'passage'; // passage | stem | options
  let lastOpt = '';
  let lastNo = 0;
  const duplicateNos = [];
  const seenNos = new Set();
  let dirsTarget = null, dirsBuf = [];

  const flushDirs = () => {
    if (!dirsTarget) return;
    const text = dirsBuf.join(' ').trim();
    if (dirsTarget === 'writing') writing.directions = text;
    else if (dirsTarget === 'translation') translation.directions = text;
    else if (sec) sec.directions = text;
    dirsTarget = null; dirsBuf = [];
  };
  const ensureSection = (type, sectionLetter) => {
    const DEFAULT_SUB = { listening: 'A', cloze: 'A', matching: 'B', reading: 'C' };
    const letter = sectionLetter || DEFAULT_SUB[type] || '';
    if (sec && sec.type === type && sec.section === letter && sec.part === part) return sec;
    flushDirs();
    sec = { part, partTitle: PART_TITLE[type] || '', section: letter, type, directions: '', groups: [] };
    sections.push(sec);
    group = null; question = null; phase = 'passage';
    return sec;
  };
  const ensureGroup = (range, prompt) => {
    if (!sec) ensureSection(kind || 'reading', sub);
    group = { range: range || '', prompt: prompt || '', passage: '', questions: [] };
    if (sec.type === 'matching') group.paragraphs = {};
    if (sec.type === 'cloze') group.bank = {};
    sec.groups.push(group);
    question = null; phase = 'passage';
    return group;
  };
  const addQuestion = (no, stem, type) => {
    if (seenNos.has(no)) { duplicateNos.push(no); return null; }
    seenNos.add(no);
    if (!sec || sec.type !== type) ensureSection(type, type === 'listening' ? sub : '');
    if (!group) ensureGroup('', '');
    question = { no, type, stem: stem || '', options: {}, missingOptions: [] };
    group.questions.push(question);
    phase = 'stem'; lastOpt = '';
    if (!group.range && type !== 'matching') group.range = String(no);
    return question;
  };

  for (const line of kept) {
    let mm;
    // Part 标记（可与其他文字同行）
    if ((mm = line.match(/^Part\s+(IV|III|II|I)\b\s*(.*)$/i))) {
      flushDirs();
      part = mm[1].toUpperCase();
      const rest = mm[2];
      if (/writing/i.test(rest)) { kind = 'writing'; dirsTarget = 'writing'; }
      else if (/listening/i.test(rest)) { kind = 'listening'; sec = null; group = null; }
      else if (/reading/i.test(rest)) { kind = 'reading'; sec = null; group = null; }
      else if (/translation/i.test(rest)) { kind = 'translation'; dirsTarget = 'translation'; }
      continue;
    }
    if (/^Writing\b/i.test(line) || /^写作$/.test(line)) { flushDirs(); kind = 'writing'; dirsTarget = 'writing'; continue; }
    if (/Listening\s+Comprehension/i.test(line)) { flushDirs(); kind = 'listening'; sec = null; group = null; question = null; phase = 'passage'; continue; }
    if (/Reading\s+Comprehension/i.test(line)) { flushDirs(); kind = 'reading'; sec = null; group = null; question = null; phase = 'passage'; continue; }
    if (/^Translation\b/i.test(line) || /^翻译$/.test(line)) { flushDirs(); kind = 'translation'; dirsTarget = 'translation'; continue; }
    if ((mm = line.match(/^Section\s+([ABC])\b/i))) {
      flushDirs();
      sub = mm[1].toUpperCase();
      if (kind === 'reading') {
        const t = sub === 'A' ? 'cloze' : sub === 'B' ? 'matching' : 'reading';
        ensureSection(t, sub); ensureGroup('', '');
      } else if (kind === 'listening') { ensureSection('listening', sub); ensureGroup('', ''); }
      continue;
    }
    if (/^Directions\s*:/i.test(line)) {
      flushDirs();
      // 阅读 Part 内靠 Directions 内容区分子段（语料常缺 Section B/C 标记）
      if (kind === 'reading') {
        if (/ten statements|Identify the paragraph/i.test(line)) ensureSection('matching', 'B');
        else if (/two passages|four choices/i.test(line)) ensureSection('reading', 'C');
      }
      dirsTarget = kind === 'writing' ? 'writing' : kind === 'translation' ? 'translation' : (sec || null);
      dirsBuf = [line];
      continue;
    }
    if (dirsTarget) {
      // Directions 续行： wrapped  prose 以句末标点收尾即结束；结构标记也结束
      if (Q_RE.test(line) || RANGE_RE.test(line) || PASSAGE_RE.test(line) || PARA_RE.test(line) || hasCJK(line)) flushDirs();
      else {
        dirsBuf.push(line);
        if (/[.!?]["”]?\s*$/.test(line)) flushDirs();
        continue;
      }
    }
    if (kind === 'writing') {
      if (!writing.directions) writing.directions = line;
      const qm = line.match(/[“"]([^”"]{20,})[”"]/);
      if (qm && !writing.prompt) writing.prompt = qm[1];
      continue;
    }
    if (kind === 'translation') {
      if (hasCJK(line)) translation.passage += (translation.passage ? '\n' : '') + line;
      continue;
    }
    if ((mm = line.match(RANGE_RE))) {
      const type = +mm[1] <= 25 ? 'listening' : 'reading';
      ensureSection(type, type === 'listening' ? sub : '');
      ensureGroup(mm[1] + '-' + mm[2], line);
      continue;
    }
    if (PASSAGE_RE.test(line)) { ensureSection('reading', ''); ensureGroup('', ''); continue; }
    if ((mm = line.match(PARA_RE))) {
      ensureSection('matching', sub === 'B' || sub === 'C' ? sub : '');
      if (!group || !group.paragraphs) ensureGroup('', '');
      group.paragraphs[mm[1]] = mm[2];
      phase = 'passage';
      continue;
    }
    if (sec && sec.type === 'matching' && group && group.paragraphs && phase === 'passage' && !Q_RE.test(line)) {
      const letters = Object.keys(group.paragraphs);
      if (letters.length) { group.paragraphs[letters[letters.length - 1]] += ' ' + line; continue; }
    }
    if (sec && sec.type === 'cloze') {
      const bankHits = [...line.matchAll(BANK_RE)];
      if (bankHits.length >= 3) {
        if (!group) ensureGroup('', '');
        for (const h of bankHits) group.bank[h[1]] = h[2];
        continue;
      }
      if (!Q_RE.test(line)) {
        if (!group) ensureGroup('', '');
        group.passage += (group.passage ? '\n' : '') + line;
        continue;
      }
    }
    if ((mm = line.match(Q_RE))) {
      const no = parseInt(mm[1], 10);
      if (no < 1 || no > 55) { /* 年份等误判：当材料续行 */ }
      else if (no <= lastNo) { /* 题号回退：材料里的数字，丢弃锚点当续行 */ }
      else {
        lastNo = no;
        const type = (sec && kind === 'listening' && no <= 25) ? 'listening'
          : (sec && sec.type === 'matching' && no >= 36 && no <= 45) ? 'matching'
          : (sec && sec.type === 'reading' && no >= 46) ? 'reading'
          : typeByNo(no);
        addQuestion(no, mm[2], type);
        // 题号与选项同行（听力主流排版）：把内联选项从题干里拆出来
        if (question && (question.type === 'listening' || question.type === 'reading')) {
          const rest = mm[2];
          const single = rest.match(OPT_SINGLE);
          const multi = [...rest.matchAll(OPT_MULTI)];
          const picked = []; const seenL = new Set();
          for (const h of multi) { if (seenL.has(h[1])) break; seenL.add(h[1]); picked.push(h); }
          if (picked.length >= 2) {
            question.stem = '';
            for (let i = 0; i < picked.length; i++) {
              const start = picked[i].index + picked[i][0].length;
              const end = i + 1 < picked.length ? picked[i + 1].index : rest.length;
              question.options[picked[i][1]] = rest.slice(start, end).trim();
              lastOpt = picked[i][1];
            }
            phase = 'options';
          } else if (single) {
            question.stem = '';
            question.options[single[1]] = single[2].trim();
            lastOpt = single[1]; phase = 'options';
          }
        }
        continue;
      }
    }
    // 选项与续行
    if (question && (question.type === 'listening' || question.type === 'reading')) {
      const single = line.match(OPT_SINGLE);
      const multi = [...line.matchAll(OPT_MULTI)];
      const picked = [];
      const seen = new Set();
      for (const h of multi) { if (seen.has(h[1])) break; seen.add(h[1]); picked.push(h); }
      if (picked.length >= 2) {
        for (let i = 0; i < picked.length; i++) {
          const start = picked[i].index + picked[i][0].length;
          const end = i + 1 < picked.length ? picked[i + 1].index : line.length;
          question.options[picked[i][1]] = line.slice(start, end).trim();
          lastOpt = picked[i][1];
        }
        phase = 'options';
        continue;
      }
      if (single && (phase === 'options' || /^[A-D]\s*[.、)．]/.test(line))) {
        question.options[single[1]] = single[2].trim();
        lastOpt = single[1]; phase = 'options';
        continue;
      }
      if (phase === 'options' && lastOpt) { question.options[lastOpt] += ' ' + line; continue; }
      if (phase === 'stem') { question.stem += (question.stem ? ' ' : '') + line; continue; }
    }
    if (question && question.type === 'matching' && phase === 'stem') { question.stem += ' ' + line; continue; }
    // 材料续行
    if (group && phase === 'passage') { group.passage += (group.passage ? '\n' : '') + line; continue; }
    if (sec && !group) { ensureGroup('', ''); group.passage += (group.passage ? '\n' : '') + line; continue; }
  }
  flushDirs();

  // 收尾：组区间回填、选项缺字母、cloze 空号提取、writing prompt 兜底
  for (const s of sections) {
    for (const g of s.groups) {
      if (s.type === 'cloze' && g.passage) {
        const blanks = [...new Set([...g.passage.matchAll(/\b(2[6-9]|3[0-5])\b/g)].map(x => parseInt(x[1], 10)))].sort((a, b) => a - b);
        for (const no of blanks) if (!g.questions.some(q => q.no === no)) g.questions.push({ no, type: 'cloze', stem: '', options: {} });
        g.questions.sort((a, b) => a.no - b.no);
      }
      if (g.paragraphs) {
        g.passage = Object.entries(g.paragraphs).map(([k, v]) => '[' + k + '] ' + v).join('\n');
        delete g.paragraphs; // 段落字母并入 passage 行首，客户端按 [X] 切段
      }
      const nos = g.questions.map(q => q.no);
      if (nos.length) g.range = Math.min(...nos) + '-' + Math.max(...nos);
      for (const q of g.questions) {
        if (q.type === 'listening' || q.type === 'reading') {
          q.missingOptions = ['A', 'B', 'C', 'D'].filter(L => !(L in q.options));
        } else { delete q.missingOptions; }
        q.stem = q.stem.trim();
      }
    }
    s.groups = s.groups.filter(g => g.questions.length || g.passage || Object.keys(g.bank || {}).length);
  }
  const keptSections = sections.filter(s => s.groups.length);
  sections.length = 0; sections.push(...keptSections);
  const allQ = sections.flatMap(s => s.groups.flatMap(g => g.questions));
  if (!writing.prompt && writing.directions) {
    const qm = writing.directions.match(/[“"]([^”"]{20,})[”"]/);
    if (qm) writing.prompt = qm[1];
  }
  const nos = allQ.map(q => q.no).sort((a, b) => a - b);
  const gaps = [];
  if (nos.length) for (let n = nos[0]; n <= nos[nos.length - 1]; n++) if (!nos.includes(n)) gaps.push(n);
  const optionsIncomplete = allQ.filter(q => q.missingOptions && q.missingOptions.length).map(q => ({ no: q.no, missing: q.missingOptions }));
  const quality = {
    questionCount: allQ.length,
    maxNo: nos.length ? nos[nos.length - 1] : 0,
    gaps, duplicateNos, optionsIncomplete,
    chineseNoiseLines: noiseCount,
    needsReview: gaps.length > 0 || duplicateNos.length > 0 || optionsIncomplete.length > 0 || allQ.length === 0
  };
  return {
    examId, year: +m[1], month: +m[2], set: +m[3], title,
    sections, writing, translation, answers: null, quality, source: { file: path.basename(file) }
  };
}

function build() {
  if (!fs.existsSync(SRC)) { console.error('源目录不存在: ' + SRC + '\n请先 git clone --depth 1 https://gitee.com/Mjs_00987/cet6_exam_questions_txt_collection.git 并拷贝 cet6_zhenti_cleaned/*.txt 到该目录'); process.exit(1); }
  const files = fs.readdirSync(SRC).filter(f => f.endsWith('.txt')).sort();
  if (!files.length) { console.error('源目录没有 txt'); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const shards = [];
  const sourceHash = crypto.createHash('sha256');
  for (const f of files) {
    const raw = fs.readFileSync(path.join(SRC, f), 'utf-8');
    sourceHash.update(f).update(raw);
    const exam = parseExam(f, raw);
    const body = JSON.stringify(exam);
    const buf = Buffer.from(body + '\n', 'utf-8');
    fs.writeFileSync(path.join(OUT, exam.examId + '.json'), buf);
    const types = [...new Set(exam.sections.map(s => s.type))];
    shards.push({
      examId: exam.examId, year: exam.year, month: exam.month, set: exam.set,
      path: exam.examId + '.json', sha256: sha256(buf), size: buf.length,
      questionCount: exam.quality.questionCount, needsReview: exam.quality.needsReview,
      types, writing: !!exam.writing.prompt || !!exam.writing.directions, translation: !!exam.translation.passage
    });
  }
  shards.sort((a, b) => b.year - a.year || b.month - a.month || a.set - b.set);
  const version = 'data-' + sourceHash.digest('hex').slice(0, 12);
  const totalBytes = shards.reduce((s, x) => s + x.size, 0);
  const manifest = { version, schema: 1, source: 'cet6_zhenti_cleaned', count: shards.length, totalBytes, exams: shards };
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest) + '\n');

  const withAny = (lo, hi) => shards.filter(s => {
    const ex = JSON.parse(fs.readFileSync(path.join(OUT, s.path), 'utf-8'));
    return ex.sections.some(sec => sec.groups.some(g => g.questions.some(q => q.no >= lo && q.no <= hi)));
  }).length;
  const report = {
    version, totalExams: shards.length,
    avgQuestionCount: +(shards.reduce((s, x) => s + x.questionCount, 0) / shards.length).toFixed(1),
    coverage: {
      '1-25': { examsWithAny: withAny(1, 25) },
      '26-35': { examsWithAny: withAny(26, 35) },
      '36-45': { examsWithAny: withAny(36, 45) },
      '46-55': { examsWithAny: withAny(46, 55) }
    },
    missingOptionsTotal: shards.reduce((s, x) => {
      const ex = JSON.parse(fs.readFileSync(path.join(OUT, x.path), 'utf-8'));
      return s + ex.quality.optionsIncomplete.reduce((t, o) => t + o.missing.length, 0);
    }, 0),
    zeroQuestionExams: shards.filter(s => s.questionCount === 0).map(s => s.examId),
    needsReviewCount: shards.filter(s => s.needsReview).length
  };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report) + '\n');
  return { manifest, report };
}

function verify(manifest) {
  const errors = [];
  const ok = (cond, msg) => { if (!cond) errors.push(msg); };
  ok(manifest.version && manifest.schema === 1 && Array.isArray(manifest.exams), 'manifest 必备字段缺失');
  const ids = manifest.exams.map(e => e.examId);
  ok(new Set(ids).size === ids.length, 'examId 重复');
  ok(manifest.count === manifest.exams.length, 'count 与分片数不一致');
  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.json') && f !== 'manifest.json' && f !== 'report.json');
  ok(files.length === manifest.count, '分片文件数与 count 不一致');
  let total = 0;
  for (const e of manifest.exams) {
    const p = path.join(OUT, e.path);
    if (!fs.existsSync(p)) { errors.push('缺分片 ' + e.path); continue; }
    const buf = fs.readFileSync(p);
    total += buf.length;
    ok(sha256(buf) === e.sha256, e.examId + ' sha256 不符');
    ok(buf.length === e.size, e.examId + ' size 不符');
    let ex;
    try { ex = JSON.parse(buf.toString('utf-8')); } catch { errors.push(e.examId + ' JSON 非法'); continue; }
    const allQ = ex.sections.flatMap(s => s.groups.flatMap(g => g.questions));
    ok(allQ.every(q => q.no >= 1 && q.no <= 55), e.examId + ' 题号越界');
    ok(ex.quality.duplicateNos.length === 0, e.examId + ' 重复题号 ' + ex.quality.duplicateNos.join(','));
    ok(allQ.every(q => Object.keys(q.options).every(k => 'ABCD'.includes(k))), e.examId + ' 选项字母越界');
    ok(ex.quality.questionCount === allQ.length, e.examId + ' questionCount 不符');
    ok(ex.answers === null || typeof ex.answers === 'object', e.examId + ' answers 形状非法');
  }
  ok(total === manifest.totalBytes, 'totalBytes 不符');
  return errors;
}

const { manifest, report } = build();
const errors = verify(manifest);
console.log('构建完成: ' + manifest.count + ' 套, ' + manifest.totalBytes + ' 字节, 版本 ' + manifest.version);
console.log('覆盖率: ' + JSON.stringify(report.coverage) + ' 平均题数 ' + report.avgQuestionCount + ' 缺选项 ' + report.missingOptionsTotal + ' 零题套 ' + report.zeroQuestionExams.join(',') + ' needsReview ' + report.needsReviewCount);
if (errors.length) { console.error('严格校验失败 ' + errors.length + ' 项:'); errors.forEach(e => console.error(' - ' + e)); process.exit(1); }
console.log('严格校验: 0 个结构错误');