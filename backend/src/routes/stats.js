import { Router } from 'express';
import { pool } from '../db/pool.js';

export const statsRouter = Router();

// GET /api/stats — the real numbers behind what today is hardcoded text
// ("150+ estudos", "42 artigos"...). Also the first place the future
// curation agent looks to compute its priority score (item 6-8 of the
// original agent brief): demand (searches) vs. supply (articles) per topic.
statsRouter.get('/', async (req, res, next) => {
  try {
    const [articles, categories, searches, views, topQueries] = await Promise.all([
      pool.query("SELECT count(*) FROM articles WHERE status = 'approved'"),
      pool.query(`
        SELECT c.name, c.slug, count(a.id) AS article_count
        FROM categories c LEFT JOIN articles a ON a.category_id = c.id AND a.status = 'approved'
        GROUP BY c.id ORDER BY article_count DESC, c.name
      `),
      pool.query('SELECT count(*) FROM searches'),
      pool.query('SELECT count(*) FROM article_views'),
      pool.query(`
        SELECT lower(query) AS query, count(*) AS times
        FROM searches
        GROUP BY lower(query)
        ORDER BY times DESC
        LIMIT 10
      `),
    ]);

    res.json({
      total_articles: Number(articles.rows[0].count),
      total_searches: Number(searches.rows[0].count),
      total_article_views: Number(views.rows[0].count),
      articles_by_category: categories.rows.map((r) => ({ ...r, article_count: Number(r.article_count) })),
      top_search_queries: topQueries.rows.map((r) => ({ ...r, times: Number(r.times) })),
    });
  } catch (err) { next(err); }
});
