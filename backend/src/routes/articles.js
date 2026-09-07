import { Router } from 'express';
import { pool } from '../db/pool.js';
import { validateArticleInput } from '../utils/validation.js';
import { slugify } from '../utils/slug.js';

export const articlesRouter = Router();

const CARD_FIELDS = `
  a.id, a.slug, a.title, a.title_pt, a.authors, a.published_at,
  a.reading_time_minutes, a.excerpt, a.study_type, a.evidence_level,
  c.name AS category_name, c.slug AS category_slug
`;

// GET /api/articles — list, card shape (no body_html — keeps the payload light).
articlesRouter.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    const { rows } = await pool.query(
      `SELECT ${CARD_FIELDS}
       FROM articles a LEFT JOIN categories c ON c.id = a.category_id
       WHERE a.status = 'approved'
       ORDER BY a.published_at DESC NULLS LAST
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    const { rows: countRows } = await pool.query("SELECT count(*) FROM articles WHERE status = 'approved'");
    res.json({ total: Number(countRows[0].count), limit, offset, articles: rows });
  } catch (err) { next(err); }
});

// GET /api/articles/:idOrSlug — full detail, including body_html.
// Accepts either the UUID primary key or the human slug (e.g. "art1") so the
// frontend can keep using the ids it already has in SP('art1').
articlesRouter.get('/:idOrSlug', async (req, res, next) => {
  try {
    const key = req.params.idOrSlug;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
    const { rows } = await pool.query(
      `SELECT a.*, c.name AS category_name, c.slug AS category_slug,
              (SELECT array_agg(t.name) FROM article_tags at JOIN tags t ON t.id = at.tag_id WHERE at.article_id = a.id) AS tags
       FROM articles a LEFT JOIN categories c ON c.id = a.category_id
       WHERE a.status = 'approved' AND ${isUuid ? 'a.id = $1' : 'a.slug = $1'}`,
      [key],
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found', message: 'Artigo não encontrado.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/articles — reserved for the future curation agent's *approved*
// promotions and manual editorial entry. Not used by the current frontend.
// Deliberately requires the full set of fields the spec calls out as
// mandatory, and never accepts a `status` of anything but 'pending' from
// this endpoint — promotion to 'approved' is a separate, explicit action,
// consistent with "the agent never writes straight into the public table."
articlesRouter.post('/', async (req, res, next) => {
  try {
    const errors = validateArticleInput(req.body);
    if (errors.length) return res.status(400).json({ error: 'validation_error', message: errors.join(' ') });

    const {
      title, title_pt, doi, pmid, journal, authors, published_at,
      study_type, evidence_level, abstract, summary_pt, methodology, population,
      main_results, conclusion, practical_application, limitations, excerpt,
      category_id, source,
    } = req.body;

    // Slug is derived from the title rather than required from the caller —
    // matches how the migrated articles got theirs (src/db/seed/migrate-articles.js)
    // and keeps this endpoint usable for the future agent's promotions, which
    // won't have a hand-picked slug either. A real collision (e.g. same title
    // reused) surfaces as a 409 via the articles_slug_key unique constraint.
    const slug = req.body.slug ? slugify(req.body.slug) : slugify(title);

    const { rows } = await pool.query(
      `INSERT INTO articles
         (slug, title, title_pt, doi, pmid, journal, authors, published_at,
          study_type, evidence_level, abstract, summary_pt, methodology, population,
          main_results, conclusion, practical_application, limitations, excerpt,
          category_id, source, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'pending')
       RETURNING *`,
      [slug, title, title_pt, doi, pmid, journal, authors, published_at,
        study_type, evidence_level, abstract, summary_pt, methodology, population,
        main_results, conclusion, practical_application, limitations, excerpt,
        category_id, source || 'manual_entry'],
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});
