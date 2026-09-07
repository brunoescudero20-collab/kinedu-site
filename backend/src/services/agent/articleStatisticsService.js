import { pool } from '../../db/pool.js';
import { minimumPublicationDate } from '../../utils/dates.js';

// GET /api/agent/article-statistics
export async function getArticleStatistics({ category, topic, from, to } = {}) {
  const where = [`a.status = 'approved'`];
  const params = [];
  if (category) { params.push(category); where.push(`c.slug = $${params.length}`); }
  if (from) { params.push(from); where.push(`a.published_at >= $${params.length}`); }
  if (to) { params.push(to); where.push(`a.published_at <= $${params.length}`); }
  // "topic" has no dedicated column on articles — matched against category
  // name or tag name (same documented heuristic as search-trends).
  if (topic) {
    params.push(`%${topic}%`);
    where.push(`(c.name ILIKE $${params.length} OR EXISTS (SELECT 1 FROM article_tags at2 JOIN tags t2 ON t2.id = at2.tag_id WHERE at2.article_id = a.id AND t2.name ILIKE $${params.length}))`);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const fromJoin = `FROM articles a LEFT JOIN categories c ON c.id = a.category_id`;
  const tenYearFloor = minimumPublicationDate(10);

  const [total, byCategory, byYear, byStudyType, last10y, viewCounts] = await Promise.all([
    pool.query(`SELECT count(*) ${fromJoin} ${whereSql}`, params),
    pool.query(`SELECT c.name, c.slug, count(*) AS count ${fromJoin} ${whereSql} GROUP BY c.id, c.name, c.slug ORDER BY count DESC`, params),
    pool.query(`SELECT extract(year FROM a.published_at)::int AS year, count(*) AS count ${fromJoin} ${whereSql} AND a.published_at IS NOT NULL GROUP BY 1 ORDER BY 1 DESC`, params),
    pool.query(`SELECT coalesce(a.study_type, 'unclassified') AS study_type, count(*) AS count ${fromJoin} ${whereSql} GROUP BY 1 ORDER BY count DESC`, params),
    pool.query(`SELECT count(*) ${fromJoin} ${whereSql} AND a.published_at >= $${params.length + 1}`, [...params, tenYearFloor]),
    pool.query(
      `SELECT a.id, a.title, a.title_pt, c.slug AS category_slug, count(v.id) AS views
       ${fromJoin} LEFT JOIN article_views v ON v.article_id = a.id
       ${whereSql}
       GROUP BY a.id, a.title, a.title_pt, c.slug
       ORDER BY views DESC`,
      params,
    ),
  ]);

  const ranked = viewCounts.rows.map((r) => ({ ...r, views: Number(r.views) }));

  return {
    total_articles: Number(total.rows[0].count),
    published_last_10_years: Number(last10y.rows[0].count),
    ten_year_floor_date: tenYearFloor.toISOString().slice(0, 10),
    by_category: byCategory.rows.map((r) => ({ ...r, count: Number(r.count) })),
    by_year: byYear.rows.map((r) => ({ ...r, count: Number(r.count) })),
    by_study_type: byStudyType.rows.map((r) => ({ ...r, count: Number(r.count) })),
    most_viewed: ranked.slice(0, 5),
    least_viewed: ranked.slice(-5).reverse(),
  };
}
