import { pool } from '../../db/pool.js';

const FIELDS = `
  a.id, a.title, a.title_pt, a.authors, a.doi, a.pmid, a.journal, a.published_at,
  a.study_type, a.status, c.name AS category_name, c.slug AS category_slug,
  (SELECT array_agg(t.name) FROM article_tags at JOIN tags t ON t.id = at.tag_id WHERE at.article_id = a.id) AS tags
`;

// GET /api/agent/articles — read-only, paginated, filterable. Returns only
// the fields listed in the spec (item 6) — no body_html, no internal ids
// beyond article id.
export async function listArticles({ category, dateFrom, dateTo, status, studyType, page = 1, pageSize = 20 }) {
  const limit = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 100);
  const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;

  const where = [];
  const params = [];
  if (category) { params.push(category); where.push(`c.slug = $${params.length}`); }
  if (status) { params.push(status); where.push(`a.status = $${params.length}`); }
  if (studyType) { params.push(studyType); where.push(`a.study_type = $${params.length}`); }
  if (dateFrom) { params.push(dateFrom); where.push(`a.published_at >= $${params.length}`); }
  if (dateTo) { params.push(dateTo); where.push(`a.published_at <= $${params.length}`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT ${FIELDS} FROM articles a LEFT JOIN categories c ON c.id = a.category_id
     ${whereSql} ORDER BY a.published_at DESC NULLS LAST LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  const { rows: countRows } = await pool.query(
    `SELECT count(*) FROM articles a LEFT JOIN categories c ON c.id = a.category_id ${whereSql}`,
    params,
  );
  return { total: Number(countRows[0].count), page: Math.max(parseInt(page, 10) || 1, 1), pageSize: limit, articles: rows };
}

// GET /api/agent/categories — coverage overview.
export async function listCategoriesWithCounts() {
  const { rows } = await pool.query(`
    SELECT c.id, c.name, c.slug, count(a.id) FILTER (WHERE a.status = 'approved') AS article_count
    FROM categories c LEFT JOIN articles a ON a.category_id = c.id
    GROUP BY c.id ORDER BY c.name
  `);
  return rows.map((r) => ({ ...r, article_count: Number(r.article_count) }));
}
