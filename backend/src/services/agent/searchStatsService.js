import { pool } from '../../db/pool.js';

const PERIOD_DAYS = { '7d': 7, '30d': 30, '90d': 90, '12m': 365 };

// Resolves the `period` query param (or explicit from/to) into a concrete
// date window. Defaults to 30d. Custom period: pass both `from` and `to`
// as YYYY-MM-DD.
export function resolvePeriod({ period, from, to } = {}) {
  if (from && to) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw Object.assign(new Error('from/to inválidos (use YYYY-MM-DD).'), { status: 400 });
    }
    return { from: fromDate, to: toDate, label: `${from}..${to}` };
  }
  const days = PERIOD_DAYS[period] || PERIOD_DAYS['30d'];
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: fromDate, to: toDate, label: period && PERIOD_DAYS[period] ? period : '30d', days };
}

// GET /api/agent/search-statistics — per-term counts within a period, plus
// all-time first/last occurrence for context. NOT semantic grouping (see
// docs/agent-api.md item 9) — one row per distinct lowercased query string.
export async function getSearchStatistics({ period, from, to, limit = 100 } = {}) {
  const window = resolvePeriod({ period, from, to });
  const { rows } = await pool.query(
    `WITH period_counts AS (
       SELECT lower(query) AS term, count(*) AS count,
              min(created_at) AS first_seen_in_period, max(created_at) AS last_seen_in_period
       FROM searches
       WHERE created_at >= $1 AND created_at <= $2
       GROUP BY lower(query)
     ),
     all_time AS (
       SELECT lower(query) AS term, min(created_at) AS first_seen_ever, max(created_at) AS last_seen_ever
       FROM searches
       GROUP BY lower(query)
     )
     SELECT p.term, p.count, p.first_seen_in_period, p.last_seen_in_period, a.first_seen_ever, a.last_seen_ever
     FROM period_counts p JOIN all_time a ON a.term = p.term
     ORDER BY p.count DESC
     LIMIT $3`,
    [window.from, window.to, Math.min(parseInt(limit, 10) || 100, 500)],
  );
  return {
    period: window.label,
    from: window.from.toISOString(),
    to: window.to.toISOString(),
    terms: rows.map((r) => ({ ...r, count: Number(r.count) })),
  };
}

// GET /api/agent/search-trends — growth/decline for a topic between the
// requested period and the immediately preceding period of equal length.
//
// Methodology: "topic" here means a category name matched against search
// query text with a simple case-insensitive substring (ILIKE) — not
// semantic grouping (explicitly out of scope this phase, see item 9). If
// no `topic` is given, every category is evaluated the same way.
//
// variation_pct = (current - previous) / previous * 100. When the previous
// period has zero matches, percentage growth is undefined (division by
// zero) — we return "insufficient_data" for that topic instead of
// fabricating a number (e.g. treating 0→N as "infinite growth").
export async function getSearchTrends({ topic, period } = {}) {
  const window = resolvePeriod({ period });
  const windowMs = window.to.getTime() - window.from.getTime();
  const prevTo = window.from;
  const prevFrom = new Date(window.from.getTime() - windowMs);

  const { rows: categories } = await pool.query('SELECT name, slug FROM categories ORDER BY name');
  const targets = topic ? categories.filter((c) => c.name.toLowerCase().includes(topic.toLowerCase()) || c.slug === topic) : categories;

  const results = [];
  for (const cat of targets) {
    const pattern = `%${cat.name}%`;
    const [{ rows: curRows }, { rows: prevRows }] = await Promise.all([
      pool.query('SELECT count(*) FROM searches WHERE query ILIKE $1 AND created_at >= $2 AND created_at <= $3', [pattern, window.from, window.to]),
      pool.query('SELECT count(*) FROM searches WHERE query ILIKE $1 AND created_at >= $2 AND created_at <= $3', [pattern, prevFrom, prevTo]),
    ]);
    const current = Number(curRows[0].count);
    const previous = Number(prevRows[0].count);
    results.push({
      topic: cat.name,
      category_slug: cat.slug,
      current_period_count: current,
      previous_period_count: previous,
      variation_pct: previous > 0 ? Number((((current - previous) / previous) * 100).toFixed(1)) : null,
      trend: previous > 0 ? (current > previous ? 'up' : current < previous ? 'down' : 'flat') : 'insufficient_data',
    });
  }

  return { period: window.label, current_window: { from: window.from.toISOString(), to: window.to.toISOString() }, previous_window: { from: prevFrom.toISOString(), to: prevTo.toISOString() }, matching_method: 'category name ILIKE substring match against search query text (not semantic)', results };
}
