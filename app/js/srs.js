// Glance SRS — FSRS-6 spaced repetition (free-spaced-repetition scheduler) with 认识/模糊/忘记 feedback.
// Pure scheduling math; persistence + personalization triggering live in the app store.
// Legacy Leitner `box`/`state` fields are kept (derived from stability) so the UI/stats stay compatible.
(function () {
  const MIN = 60000, DAY = 86400000;
  // Legacy box thresholds (days) — used only for the mastery histogram and the "已掌握" cutoff.
  const INTERVALS = [0, 1, 2, 4, 7, 15, 30, 60, 120];
  const MAX_BOX = INTERVALS.length - 1;
  const GRADUATED = 5; // stability >= 15 days counts as "已掌握"
  // FSRS-6 stability bounds (match ts-fsrs FSRS6_MODEL_BOUNDS sMin/sMax).
  const S_MIN = 0.001, S_MAX = 36500;

  const GRADE = { KNOW: 'know', FUZZY: 'fuzzy', FORGOT: 'forgot' };
  const G = { forgot: 1, fuzzy: 2, know: 3 }; // FSRS grade codes (no "easy" in this app)
  const RETENTION = 0.9; // desired recall probability at review time

  // FSRS-6 default weights (w0..w20). w20 is the forgetting-curve decay.
  const DEFAULT_W = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542];

  function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
  function factor(w) { return Math.pow(0.9, -1 / w[20]) - 1; }
  // Retrievability after `t` days given stability `S`.
  function retrievability(t, S, w) { return Math.pow(1 + factor(w) * Math.max(t, 0) / Math.max(S, 0.01), -w[20]); }
  function clampD(x) { return clamp(x, 1, 10); }

  // Initial difficulty/stability for a brand-new card given its first grade.
  function initDS(g, w) {
    return { S: w[g - 1], D: clampD(w[4] - Math.exp(w[5] * (g - 1)) + 1) };
  }
  // Difficulty after a review (mean-reverting toward the ideal D0(4)).
  function nextD(D, g, w) {
    const d0 = w[4] - Math.exp(w[5] * 3) + 1;
    const raw = D - w[6] * (g - 3) * (10 - D) / 9;
    return clampD(w[7] * d0 + (1 - w[7]) * raw);
  }
  // Stability after a review. `sameDay` selects the short-term (within-day) update.
  function nextS(S, D, g, t, w, sameDay) {
    if (sameDay) {
      let mult = Math.exp(w[17] * (g - 3 + w[18])) * Math.pow(S, -w[19]);
      if (g >= 2) mult = Math.max(mult, 1);
      return clamp(S * mult, S_MIN, S_MAX);
    }
    const R = retrievability(t, S, w);
    if (g === 1) {
      const forget = clamp(w[11] * Math.pow(D, -w[12]) * (Math.pow(S + 1, w[13]) - 1) * Math.exp(w[14] * (1 - R)), S_MIN, S_MAX);
      return clamp(Math.min(forget, S / Math.exp(w[17] * w[18])), S_MIN, S_MAX);
    }
    const hard = g === 2 ? w[15] : 1;
    const easy = g === 4 ? w[16] : 1;
    const growth = 1 + Math.exp(w[8]) * (11 - D) * Math.pow(S, -w[9]) * (Math.exp(w[10] * (1 - R)) - 1) * hard * easy;
    return clamp(S * growth, S_MIN, S_MAX);
  }
  // Scheduled interval (days) for a target retention, with ±5% fuzz once long enough.
  function interval(S, w, r) {
    let I = Math.round((S / factor(w)) * (Math.pow(r, -1 / w[20]) - 1));
    I = clamp(I, 1, 36500);
    if (I >= 3) I = Math.round(I * (0.95 + Math.random() * 0.1));
    return clamp(I, 1, 36500);
  }
  function boxFromS(S) {
    let b = 0;
    for (let i = 1; i < INTERVALS.length; i++) { if (S >= INTERVALS[i]) b = i; else break; }
    return b;
  }

  function newState(now) {
    return { box: 0, due: 0, reps: 0, lapses: 0, last: 0, state: 'new', S: 0, D: 0 };
  }
  function isNew(s) { return !s || (s.reps === 0 && s.box === 0); }
  function isDue(s, now) { return !!s && !isNew(s) && s.due <= now; }
  function isKnown(s) { return !!s && s.box >= GRADUATED; }

  // Upgrade a legacy Leitner state (no S/D) into FSRS form, preserving progress.
  // A state that already carries valid FSRS S/D is returned untouched — re-deriving S/D
  // from the coarse box on every review would collapse continuous stability back to Leitner.
  function migrate(prev) {
    if (typeof prev.S === 'number' && prev.S > 0 && typeof prev.D === 'number' && prev.D > 0) return prev;
    const box = prev.box || 0;
    return Object.assign({}, prev, {
      S: Math.max(0.212, INTERVALS[box] || 0.212),
      D: clampD(6.4 - 0.6 * box)
    });
  }

  // Return a NEW state after grading. `w` optional per-user weights (defaults otherwise).
  function review(prev, grade, now, w) {
    w = w || DEFAULT_W;
    const g = G[grade] || 3;
    const first = isNew(prev);
    let s = first ? newState(now) : migrate(Object.assign({}, prev));
    const elapsed = s.last ? (now - s.last) / DAY : 0;
    const sameDay = !first && elapsed < 1;
    let S, D;
    if (first) {
      const init = initDS(g, w); S = init.S; D = init.D;
    } else {
      D = nextD(s.D, g, w);
      S = nextS(s.S, s.D, g, elapsed, w, sameDay);
    }
    s.S = S; s.D = D;
    s.box = boxFromS(S);
    s.last = now;
    s.reps = (s.reps || 0) + 1;
    if (g === 1) {
      s.lapses = (s.lapses || 0) + 1;
      s.due = now + 10 * MIN;
      s.state = 'relearn';
    } else if (sameDay && g === 2) {
      s.due = now + 30 * MIN;
      s.state = 'learning';
    } else {
      s.due = now + interval(S, w, RETENTION) * DAY;
      s.state = s.box >= GRADUATED ? 'known' : 'learning';
    }
    return s;
  }

  // ---- personalization: per-user weight optimization (FSRS coordinate descent) ----
  // Re-simulate a card's review sequence with candidate weights, return mean log-loss
  // of predicted retrievability vs actual recall (grade>=2 = recalled).
  function seqLoss(seq, w) {
    let S = null, D = null, loss = 0, n = 0;
    for (let i = 0; i < seq.length; i++) {
      const t = seq[i].t, g = seq[i].g;
      if (S === null) { const init = initDS(g, w); S = init.S; D = init.D; continue; }
      const R = clamp(retrievability(t, S, w), 1e-6, 1 - 1e-6);
      const y = g >= 2 ? 1 : 0;
      loss += -(y * Math.log(R) + (1 - y) * Math.log(1 - R)); n++;
      const nd = nextD(D, g, w);
      S = nextS(S, D, g, t, w, t < 1); D = nd;
    }
    return { loss, n };
  }
  function totalLoss(seqs, w) {
    let loss = 0, n = 0;
    for (const k of Object.keys(seqs)) { const r = seqLoss(seqs[k], w); loss += r.loss; n += r.n; }
    return n ? loss / n : Infinity;
  }
  // Tune the recall-growth weights (w8,w10,w11,w13,w14) ±30% to fit this user's memory.
  function optimize(seqs, baseW) {
    const w = (baseW || DEFAULT_W).slice();
    if (totalLoss(seqs, w) === Infinity) return w;
    const params = [8, 10, 11, 13, 14];
    for (let pass = 0; pass < 2; pass++) {
      for (const p of params) {
        const orig = w[p];
        let best = orig, bestLoss = totalLoss(seqs, w);
        for (const m of [0.7, 1.3]) {
          w[p] = orig * m;
          const l = totalLoss(seqs, w);
          if (l < bestLoss) { bestLoss = l; best = w[p]; }
        }
        w[p] = best;
      }
    }
    return w;
  }

  // Build a study session from book entries + per-word states + daily plan.
  function buildQueue(entries, states, plan, now) {
    const reviews = [], news = [];
    for (const e of entries) {
      const s = states[e.word];
      if (isNew(s)) news.push(e);
      else if (isDue(s, now)) reviews.push(e);
    }
    reviews.sort((a, b) => (states[a.word].due - states[b.word].due));
    const cappedReviews = plan.reviewCap > 0 ? reviews.slice(0, plan.reviewCap) : reviews;
    const cappedNews = plan.newLeft > 0 ? news.slice(0, plan.newLeft) : [];
    return { reviews: cappedReviews, news: cappedNews, dueTotal: reviews.length, newTotal: news.length };
  }

  function session(reviews, news) {
    const out = [];
    let i = 0, j = 0;
    while (i < reviews.length || j < news.length) {
      if (i < reviews.length) out.push({ entry: reviews[i++], kind: 'review' });
      if (j < news.length) out.push({ entry: news[j++], kind: 'new' });
    }
    return out;
  }

  function nextDueLabel(s, now) {
    if (!s || isNew(s)) return '新词';
    const d = s.due - now;
    if (d <= 0) return '待复习';
    if (d < DAY) return Math.max(1, Math.round(d / 3600000)) + ' 小时后';
    return Math.round(d / DAY) + ' 天后';
  }

  window.SRS = {
    GRADE, G, INTERVALS, MAX_BOX, GRADUATED, DEFAULT_W, RETENTION, DAY,
    newState, isNew, isDue, isKnown, review, migrate, retrievability, interval,
    optimize, buildQueue, session, nextDueLabel,
    // Pure internals exposed for the ts-fsrs contrast side-path (app/dev). No behavior change.
    factor, initDS, nextD, nextS, boxFromS
  };
})();