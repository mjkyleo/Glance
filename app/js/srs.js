// Glance SRS — Leitner-box spaced repetition with 认识/模糊/忘记 feedback.
// Pure scheduling logic; persistence lives in the app store.
(function () {
  const MIN = 60000, DAY = 86400000;
  // Interval (days) granted when a word graduates INTO box index 1..8.
  const INTERVALS = [0, 1, 2, 4, 7, 15, 30, 60, 120];
  const MAX_BOX = INTERVALS.length - 1;
  const GRADUATED = 5; // box >= 5 counts as "已掌握"

  const GRADE = { KNOW: 'know', FUZZY: 'fuzzy', FORGOT: 'forgot' };

  function newState(now) {
    return { box: 0, due: 0, reps: 0, lapses: 0, last: 0, state: 'new' };
  }

  function isNew(s) { return !s || (s.reps === 0 && s.box === 0); }
  function isDue(s, now) { return !!s && !isNew(s) && s.due <= now; }
  function isKnown(s) { return !!s && s.box >= GRADUATED; }

  // Return a NEW state object after grading. `wasNew` gates the first-step interval.
  function review(prev, grade, now) {
    const s = Object.assign(newState(now), prev || {});
    const first = isNew(prev);
    s.last = now;
    if (grade === GRADE.KNOW) {
      s.box = Math.min(s.box + 1, MAX_BOX);
      s.reps += 1;
      // First successful recall reinforces same day; later steps use full intervals.
      const days = first ? 0.5 : INTERVALS[s.box];
      s.due = now + Math.max(days * DAY, 30 * MIN);
      s.state = s.box >= GRADUATED ? 'known' : 'learning';
    } else if (grade === GRADE.FUZZY) {
      s.reps += 1;
      const days = INTERVALS[s.box] * 0.4;
      s.due = now + Math.max(days * DAY, 30 * MIN);
      s.state = 'learning';
    } else { // FORGOT — relearn soon
      s.box = 1;
      s.reps += 1;
      s.lapses += 1;
      s.due = now + 10 * MIN;
      s.state = 'relearn';
    }
    return s;
  }

  // Build a study session from book entries + per-word states + daily plan.
  // plan: { newLeft, reviewCap }. Returns { reviews, news } (entry arrays).
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

  // Interleave reviews and new words for a varied session (reviews first by due).
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

  window.SRS = { GRADE, INTERVALS, MAX_BOX, GRADUATED, newState, isNew, isDue, isKnown, review, buildQueue, session, nextDueLabel, DAY };
})();