// One-time migration: extract the 5 real articles that exist today as hardcoded
// HTML in ../../../index.html and load them into the `articles` table, verbatim.
//
// Nothing here is invented. Fields the site doesn't structure explicitly
// (methodology, population, main_results, conclusion, practical_application,
// limitations) are left NULL rather than guessed — see the delivery report
// for why. `body_html` carries the article's full original content, so the
// frontend can render exactly what's on the page today, sourced from the DB.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { pool } from '../pool.js';
import { logger } from '../../utils/logger.js';
import { slugify } from '../../utils/slug.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_HTML = path.join(__dirname, '../../../../index.html');

const ARTICLE_IDS = ['art1', 'art2', 'art3', 'art4', 'art5'];

const MONTHS = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

function parsePtDate(text) {
  // e.g. "Jun 2025" or "14 jun 2025" -> a DATE. Day defaults to the 1st when absent —
  // the site only ever displays month+year for these, so the day was never real data.
  const m = text.trim().toLowerCase().match(/(?:(\d{1,2})\s+)?([a-zç]{3})[a-zç]*\.?\s+(\d{4})/i);
  if (!m) return null;
  const [, day, monAbbr, year] = m;
  const month = MONTHS[monAbbr.slice(0, 3)];
  if (!month) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day || 1).padStart(2, '0')}`;
}

function parseReadingMinutes(text) {
  const m = text.match(/(\d+)\s*min/);
  return m ? parseInt(m[1], 10) : null;
}

function extractArticle($, id) {
  const $root = $(`#p-${id}`);
  const $hero = $root.find('.article-hero').first();

  const titleHtml = $hero.find('h1').first().html() || '';
  const title = $hero.find('h1').first().text().trim();
  const lead = $hero.find('.article-lead').first().text().trim();
  const authorName = $hero.find('.author-name').first().text().trim();
  const authorTitle = $hero.find('.author-title').first().text().trim();

  const metaItems = $hero.find('.meta-item').map((_, el) => $(el).text().trim()).get();
  const dateText = metaItems.find((t) => /\d{4}/.test(t) && !/min|visualiza/.test(t)) || '';
  const readingText = metaItems.find((t) => /min/.test(t)) || '';
  const viewsText = metaItems.find((t) => /visualiza/.test(t)) || '';

  const chips = $hero.find('.cat-chip').map((_, el) => $(el).text().trim()).get();
  const subtopicTag = chips[0] || null; // e.g. "Biomecânica", "Nutrição Esportiva"

  const bodyHtml = $root.find('.article-body').first().html();
  if (!bodyHtml) throw new Error(`No .article-body found for #p-${id}`);

  const citeText = $root.find('.cite-text').first().text().trim();

  return {
    slug: id,
    title,
    title_html: titleHtml,
    excerpt: lead,
    summary_pt: lead,
    authors: authorName ? `${authorName}${authorTitle ? ' (' + authorTitle + ')' : ''}` : null,
    published_at: dateText ? parsePtDate(dateText) : null,
    reading_time_minutes: readingText ? parseReadingMinutes(readingText) : null,
    subtopic_tag: subtopicTag,
    body_html: bodyHtml.trim(),
    citation_text: citeText || null,
    source_views_text: viewsText || null, // kept only for the migration log, not stored
  };
}

async function upsertCategory(client, name) {
  const slug = slugify(name);
  const { rows } = await client.query(
    `INSERT INTO categories (name, slug)
     VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [name, slug],
  );
  return rows[0].id;
}

async function upsertTag(client, name) {
  if (!name) return null;
  const slug = slugify(name);
  const { rows } = await client.query(
    `INSERT INTO tags (name, slug) VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [name, slug],
  );
  return rows[0].id;
}

// The categories index page (p-categories in index.html) lists these 10 areas.
// Only "Hipertrofia Muscular" has real articles today; the rest are seeded as
// empty categories so the schema already matches what the site promises.
const ALL_CATEGORIES = [
  'Hipertrofia Muscular', 'Fisiologia do Exercício', 'Anatomia', 'Biomecânica',
  'Força', 'Potência', 'Nutrição', 'Periodização', 'Psicologia', 'Recuperação',
];

async function main() {
  const html = readFileSync(INDEX_HTML, 'utf8');
  const $ = cheerio.load(html);

  const client = await pool.connect();
  const log = [];
  try {
    await client.query('BEGIN');

    const categoryIds = {};
    for (const name of ALL_CATEGORIES) {
      categoryIds[name] = await upsertCategory(client, name);
    }
    log.push(`Seeded ${ALL_CATEGORIES.length} categories.`);

    let inserted = 0;
    let skipped = 0;
    for (const id of ARTICLE_IDS) {
      const a = extractArticle($, id);
      const categoryId = categoryIds['Hipertrofia Muscular'];
      const tagId = await upsertTag(client, a.subtopic_tag);

      const { rows: existing } = await client.query('SELECT id FROM articles WHERE slug = $1', [a.slug]);
      if (existing.length) {
        log.push(`SKIP ${a.slug} — already migrated (slug exists).`);
        skipped++;
        continue;
      }

      const { rows } = await client.query(
        `INSERT INTO articles
           (slug, title, title_pt, authors, published_at, reading_time_minutes,
            excerpt, summary_pt, body_html, category_id, source, status)
         VALUES ($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,'manual_migration','approved')
         RETURNING id`,
        [a.slug, a.title, a.authors, a.published_at, a.reading_time_minutes,
          a.excerpt, a.summary_pt, a.body_html, categoryId],
      );
      const articleId = rows[0].id;

      if (tagId) {
        await client.query(
          'INSERT INTO article_tags (article_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [articleId, tagId],
        );
      }

      log.push(
        `OK ${a.slug} — "${a.title}" | autores: ${a.authors || '(vazio)'} | `
        + `publicado: ${a.published_at || '(vazio)'} | leitura: ${a.reading_time_minutes || '?'}min | `
        + `tag: ${a.subtopic_tag || '(nenhuma)'} | body_html: ${a.body_html.length} chars | `
        + `views no site (não migrado, é texto fixo): ${a.source_views_text || 'n/d'}`,
      );
      inserted++;
    }

    await client.query('COMMIT');
    log.push(`Done. Inserted ${inserted}, skipped ${skipped}.`);
  } catch (err) {
    await client.query('ROLLBACK');
    log.push(`FAILED: ${err.message}`);
    throw err;
  } finally {
    client.release();
    const report = log.join('\n');
    console.log(report);
    writeFileSync(path.join(__dirname, 'last-migration-report.txt'), report + '\n');
    await pool.end();
  }
}

main().catch((err) => {
  logger.error('Article migration failed', { error: err.message });
  process.exit(1);
});
