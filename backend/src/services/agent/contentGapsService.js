import { pool } from '../../db/pool.js';
import { resolvePeriod } from './searchStatsService.js';

// GET /api/agent/content-gaps
//
// Crosses demand (searches matching a category, by the same ILIKE
// substring heuristic used in search-trends — not semantic) against supply
// (approved articles in that category) and interest (views on those
// articles), per category, within a period (default 30d).
//
// gap_score formula (documented per item 12 — do not change without
// updating this comment and docs/agent-api.md):
//   gap_score = searches / (articles + 1)
// The "+1" avoids division by zero for categories with zero articles,
// and means a category with 0 articles and any search demand always
// scores above a category that already has coverage.
//
// Priority tiers (fixed thresholds on gap_score):
//   score >= 5   -> "alta"
//   1 <= score<5 -> "media"
//   score < 1    -> "baixa"
export async function getContentGaps({ period } = {}) {
  const window = resolvePeriod({ period });
  const { rows: categories } = await pool.query(`
    SELECT c.id, c.name, c.slug, count(a.id) FILTER (WHERE a.status = 'approved') AS article_count
    FROM categories c LEFT JOIN articles a ON a.category_id = c.id
    GROUP BY c.id ORDER BY c.name
  `);

  const results = [];
  for (const cat of categories) {
    const pattern = `%${cat.name}%`;
    const [{ rows: searchRows }, { rows: viewRows }] = await Promise.all([
      pool.query('SELECT count(*) FROM searches WHERE query ILIKE $1 AND created_at >= $2 AND created_at <= $3', [pattern, window.from, window.to]),
      pool.query(
        `SELECT count(v.id) FROM article_views v JOIN articles a ON a.id = v.article_id
         WHERE a.category_id = $1 AND v.created_at >= $2 AND v.created_at <= $3`,
        [cat.id, window.from, window.to],
      ),
    ]);
    const searches = Number(searchRows[0].count);
    const articleCount = Number(cat.article_count);
    const views = Number(viewRows[0].count);
    const gapScore = Number((searches / (articleCount + 1)).toFixed(2));
    const priority = gapScore >= 5 ? 'alta' : gapScore >= 1 ? 'media' : 'baixa';

    results.push({ topic: cat.name, category_slug: cat.slug, searches, articles: articleCount, views, gap_score: gapScore, priority });
  }

  results.sort((a, b) => b.gap_score - a.gap_score);
  return {
    period: window.label,
    from: window.from.toISOString(),
    to: window.to.toISOString(),
    formula: 'gap_score = searches / (articles + 1); priority: >=5 alta, >=1 media, <1 baixa',
    matching_method: 'category name ILIKE substring match against search query text (not semantic)',
    gaps: results,
  };
}
