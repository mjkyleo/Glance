// Glance FSRS-6 contrast side-path — compares the self-developed scheduler (app/js/srs.js)
// against the reference ts-fsrs 6 FSRS-6 algorithm on identical {S, D, elapsed, grade} inputs.
// DEV/verification only: does NOT replace the in-use scheduler and touches no user data.
// Runs in the browser (app/dev/fsrs-contrast.html) and in Node (scripts/fsrs-contrast.mjs).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FsrsContrast = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

  // Classify a numeric pair. 'match' = within float precision; 'precision' = rounding-level;
  // 'deviation' = a real formula/behavior difference worth investigating.
  function classify(s, r) {
    const abs = Math.abs(s - r);
    const rel = abs / Math.max(Math.abs(r), 1e-9);
    let status = 'deviation';
    if (abs < 1e-6 && rel < 1e-6) status = 'match';
    else if (rel < 1e-4 && abs < 1e-3) status = 'precision';
    return { self: s, ref: r, abs, rel, status };
  }

  function bucket() {
    return { n: 0, match: 0, precision: 0, deviation: 0, maxAbs: 0, maxRel: 0, worst: [] };
  }
  function record(b, cmp, ctx) {
    b.n++; b[cmp.status]++;
    if (cmp.abs > b.maxAbs) b.maxAbs = cmp.abs;
    if (cmp.rel > b.maxRel) b.maxRel = cmp.rel;
    if (cmp.status === 'deviation' && b.worst.length < 6) b.worst.push(Object.assign({ ctx }, cmp));
  }

  function runContrast(SRS, TSFSRS, opts) {
    opts = opts || {};
    const seed = opts.seed == null ? 20261114 : opts.seed;
    const sequences = opts.sequences == null ? 200 : opts.sequences;
    const stepsPerSeq = opts.stepsPerSeq == null ? 12 : opts.stepsPerSeq;
    const rnd = mulberry32(seed);

    const w = SRS.DEFAULT_W.slice();
    const refW = TSFSRS.FSRS6_DEFAULT_WEIGHTS.slice();
    const weightsIdentical = w.length === refW.length && w.every((x, i) => x === refW[i]);
    // enableShortTerm=true matches the self-developed scheduler (always uses w17/w18).
    const algo = new TSFSRS.FSRS6Algorithm(refW, true, TSFSRS.FSRS6_MODEL_BOUNDS);
    const R = 0.9; // SRS.RETENTION

    const Ss = [0.212, 0.5, 1, 2, 5, 10, 30, 100, 365];
    const Ds = [1, 3, 5, 7, 10];
    const ts = [0, 0.5, 1, 2, 5, 10, 30, 100];
    const gs = [1, 2, 3];

    const methods = {
      retrievability: bucket(), initDS_S: bucket(), initDS_D: bucket(),
      nextD: bucket(), nextS_recall: bucket(), nextS_forget: bucket(),
      nextS_shortTerm: bucket(), interval: bucket()
    };

    // --- retrievability ---
    for (const S of Ss) for (const t of ts) {
      record(methods.retrievability, classify(SRS.retrievability(t, S, w), algo.forgetting_curve(t, S)), { S, t });
    }
    // --- initDS ---
    for (const g of gs) {
      const init = SRS.initDS(g, w);
      record(methods.initDS_S, classify(init.S, algo.init_stability(g)), { g });
      record(methods.initDS_D, classify(init.D, clamp(algo.init_difficulty(g), 1, 10)), { g });
    }
    // --- nextD ---
    for (const D of Ds) for (const g of gs) {
      record(methods.nextD, classify(SRS.nextD(D, g, w), algo.next_difficulty(D, g)), { D, g });
    }
    // --- nextS: recall (g>=2, elapsed>=1) ---
    for (const S of Ss) for (const D of Ds) for (const t of ts) for (const g of [2, 3]) {
      if (t < 1) continue; // recall branch only when not same-day
      const r = algo.forgetting_curve(t, S);
      record(methods.nextS_recall, classify(SRS.nextS(S, D, g, t, w, false), algo.next_recall_stability(D, S, r, g)), { S, D, t, g });
    }
    // --- nextS: forget (g=1, elapsed>=1) — compare full reference forget path incl. cap ---
    for (const S of Ss) for (const D of Ds) for (const t of ts) {
      if (t < 1) continue;
      const refS = algo.next_state({ stability: S, difficulty: D }, t, 1).stability;
      record(methods.nextS_forget, classify(SRS.nextS(S, D, 1, t, w, false), refS), { S, D, t });
    }
    // --- nextS: short-term (same-day) ---
    for (const S of Ss) for (const g of gs) {
      record(methods.nextS_shortTerm, classify(SRS.nextS(S, 5, g, 0, w, true), algo.next_short_term_stability(S, g)), { S, g });
    }
    // --- interval (fuzz disabled: Math.random()=0.5 → ±5% factor becomes exactly 1.0) ---
    const realRandom = Math.random;
    Math.random = function () { return 0.5; };
    try {
      for (const S of Ss) {
        const sI = SRS.interval(S, w, R);
        const rI = algo.next_interval(S, R);
        const abs = Math.abs(sI - rI);
        const cmp = { self: sI, ref: rI, abs, rel: abs / Math.max(rI, 1), status: abs === 0 ? 'match' : (abs <= 1 ? 'precision' : 'deviation') };
        record(methods.interval, cmp, { S });
      }
    } finally { Math.random = realRandom; }

    // --- migrate() probe: does it preserve an existing FSRS state? ---
    const modern = { box: 4, due: 0, reps: 6, lapses: 1, last: 0, state: 'learning', S: 24.4728247, D: 4.99022837 };
    const migrated = SRS.migrate(Object.assign({}, modern));
    const migrateProbe = {
      input: { S: modern.S, D: modern.D, box: modern.box },
      output: { S: migrated.S, D: migrated.D },
      preserved: migrated.S === modern.S && migrated.D === modern.D,
      clobbered: migrated.S !== modern.S || migrated.D !== modern.D
    };

    // --- integrated review() vs reference next_state over random sequences (integer elapsed days) ---
    const integrated = { sequences, steps: 0, matchS: 0, matchD: 0, devS: 0, devD: 0, maxAbsS: 0, maxAbsD: 0, worst: [] };
    const gradePool = [1, 2, 3, 3, 3, 2]; // mostly know/fuzzy, some forgot
    const elapsedPool = [0, 1, 1, 2, 3, 5, 10, 30];
    const DAY = SRS.DAY;
    for (let q = 0; q < sequences; q++) {
      let prev = null;            // self state
      let ref = null;             // {stability, difficulty}
      let now = 1700000000000;
      for (let k = 0; k < stepsPerSeq; k++) {
        const g = gradePool[Math.floor(rnd() * gradePool.length)];
        const elapsed = k === 0 ? 0 : elapsedPool[Math.floor(rnd() * elapsedPool.length)];
        now += elapsed * DAY;
        const gradeName = g === 1 ? 'forgot' : g === 2 ? 'fuzzy' : 'know';
        const selfState = SRS.review(prev, gradeName, now, w);
        const refState = algo.next_state(ref, elapsed, g);
        integrated.steps++;
        const cs = classify(selfState.S, refState.stability);
        const cd = classify(selfState.D, refState.difficulty);
        if (cs.status === 'deviation') integrated.devS++; else integrated.matchS++;
        if (cd.status === 'deviation') integrated.devD++; else integrated.matchD++;
        if (cs.abs > integrated.maxAbsS) integrated.maxAbsS = cs.abs;
        if (cd.abs > integrated.maxAbsD) integrated.maxAbsD = cd.abs;
        if ((cs.status === 'deviation' || cd.status === 'deviation') && integrated.worst.length < 8) {
          integrated.worst.push({ seq: q, step: k, elapsed, g, selfS: selfState.S, refS: refState.stability, selfD: selfState.D, refD: refState.difficulty, absS: cs.abs, absD: cd.abs });
        }
        prev = selfState; ref = refState;
      }
    }

    // --- short-term trigger probe: 0 < elapsed < 1 (self treats as same-day; reference t!==0 uses recall) ---
    const triggerProbe = [];
    for (const elapsed of [0, 0.25, 0.5, 0.9, 1, 2]) {
      const base = { box: 2, due: 0, reps: 3, lapses: 0, last: 1700000000000, state: 'learning', S: 5, D: 5 };
      const now = base.last + elapsed * DAY;
      const selfState = SRS.review(base, 'know', now, w);
      const refState = algo.next_state({ stability: 5, difficulty: 5 }, elapsed, 3);
      triggerProbe.push({ elapsed, selfS: selfState.S, refS: refState.stability, absS: Math.abs(selfState.S - refState.stability), selfBranch: elapsed < 1 ? 'short-term' : 'recall', refBranch: elapsed === 0 ? 'short-term' : 'recall' });
    }

    // --- findings ---
    const findings = [];
    if (!weightsIdentical) findings.push({ id: 'weights', severity: 'info', title: '默认权重不一致', detail: '自研 DEFAULT_W 与 ts-fsrs FSRS6_DEFAULT_WEIGHTS 不同。' });
    if (migrateProbe.clobbered) findings.push({
      id: 'migrate-clobber', severity: 'high',
      title: 'migrate() 每次复习都从 box 重置 S/D（核心 bug）',
      detail: `migrate() 无条件用 INTERVALS[box] 覆盖已有 FSRS 稳定度/难度。输入 S=${migrateProbe.input.S} → 输出 S=${migrateProbe.output.S}；D=${migrateProbe.input.D} → ${migrateProbe.output.D}。导致连续 FSRS 稳定度被粗粒度 Leitner box 取代，调度退化为近似 Leitner。`,
      recommendation: 'migrate() 仅在缺少 S/D（legacy 状态）时升级；已有 FSRS 状态原样返回。'
    });
    if (integrated.devS > 0 || integrated.devD > 0) findings.push({
      id: 'integrated-divergence', severity: migrateProbe.clobbered ? 'high' : 'medium',
      title: '整段复习序列 S/D 偏离参考实现',
      detail: `${integrated.steps} 步中 S 偏离 ${integrated.devS} 步、D 偏离 ${integrated.devD} 步；最大 |ΔS|=${integrated.maxAbsS.toFixed(4)}、|ΔD|=${integrated.maxAbsD.toFixed(4)}。`,
      recommendation: migrateProbe.clobbered ? '修复 migrate-clobber 后应回落到精度级。' : '排查 nextS/nextD 公式。'
    });
    const triggerDiv = triggerProbe.filter(p => p.elapsed > 0 && p.elapsed < 1 && p.absS > 1e-3);
    if (triggerDiv.length) findings.push({
      id: 'short-term-trigger', severity: 'low',
      title: '短期稳定度触发阈值不同（elapsed<1 vs t===0）',
      detail: `自研用 elapsed<1（24h 滚动窗）判短期；参考用 elapsed_days===0（同日）。0<elapsed<1 时分支不同，${triggerDiv.length} 个探针出现差异。`,
      recommendation: '设计取舍：Glance 以毫秒分数计算 elapsed，<1 近似同日。可保留并注明，或对齐为同日判定。'
    });
    if (methods.nextS_recall.deviation > 0 || methods.nextS_forget.deviation > 0 || methods.nextS_shortTerm.deviation > 0) findings.push({
      id: 'stability-floor', severity: 'low',
      title: '稳定度下限/上限与参考不同',
      detail: '自研下限 0.01、无上限；参考 sMin=0.001、sMax=36500。极小/极大 S 时出现差异。',
      recommendation: '对齐 sMin=0.001 并加 sMax=36500 上限（低风险）。'
    });
    const pureMatch = ['retrievability', 'initDS_S', 'initDS_D', 'nextD', 'nextS_recall', 'nextS_forget', 'nextS_shortTerm', 'interval']
      .every(k => methods[k].deviation === 0);
    if (pureMatch) findings.push({
      id: 'core-formulas-match', severity: 'info',
      title: '核心公式与参考实现一致',
      detail: 'retrievability / initDS / nextD / nextS(recall·forget·short-term) / interval 在网格输入下全部匹配（差异≤精度级）。自研 FSRS-6 数学忠实。',
      recommendation: '核心公式无需改动；migrate 保真守卫与稳定度边界（sMin/sMax）已对齐参考实现。'
    });

    return {
      meta: { generatedAt: new Date().toISOString(), seed, sequences, stepsPerSeq, weightsIdentical, refDecay: TSFSRS.FSRS6_DECAY, selfDecay: w[20], tolerance: 'rel<1e-6 match / rel<1e-4 precision' },
      methods, migrateProbe, integrated, triggerProbe, findings
    };
  }

  return { runContrast, mulberry32 };
});