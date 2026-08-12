-- KinEdu — Phase 1 schema
-- Run via: npm run migrate  (backend/src/db/migrate.js)
--
-- Design notes:
--   * DOI/PMID are nullable but unique WHEN PRESENT (partial unique indexes) —
--     an article can lack one, but two articles can never share one.
--   * study_type / evidence_level / status use CHECK constraints instead of
--     separate lookup tables — the vocab is small, fixed, and already defined
--     by the scientific-curator skill's classification table, so a lookup
--     table would be indirection without benefit at this scale.
--   * article_views has no denormalized counter column. View counts are
--     computed with COUNT(*) at query time (see /api/stats) — the table is
--     small enough that this is simpler and can never drift from the truth.
--     Add a cached counter later only if this measurably matters.
--   * body_html stores each migrated article's existing rendered HTML
--     fragment verbatim (see db/seed/migrate-articles.js) — nothing was
--     re-authored. This is what lets the frontend fetch real content from
--     the API while staying visually identical to today's hardcoded page.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tags (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE articles (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  TEXT NOT NULL UNIQUE,
  title                 TEXT NOT NULL,
  title_pt              TEXT,
  doi                   TEXT,
  pmid                  TEXT,
  journal               TEXT,
  authors               TEXT NOT NULL,
  published_at          DATE,
  study_type            TEXT CHECK (study_type IN (
                          'meta_analysis','systematic_review','rct','cohort',
                          'cross_sectional','case_control','narrative_review',
                          'position_stand','case_report','pilot_study','other'
                        )),
  evidence_level        SMALLINT CHECK (evidence_level BETWEEN 1 AND 5),
  abstract              TEXT,
  summary_pt            TEXT,
  methodology           TEXT,
  population            TEXT,
  main_results          TEXT,
  conclusion            TEXT,
  practical_application TEXT,
  limitations           TEXT,
  excerpt               TEXT,
  body_html             TEXT,
  reading_time_minutes  SMALLINT,
  category_id           UUID REFERENCES categories(id),
  source                TEXT NOT NULL DEFAULT 'manual_migration',
  status                TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending','approved','archived')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dedup guards (item 14 of the spec): DOI and PMID unique when present;
-- title+year as a best-effort third tier for articles lacking both identifiers.
CREATE UNIQUE INDEX articles_doi_unique  ON articles (doi)  WHERE doi  IS NOT NULL;
CREATE UNIQUE INDEX articles_pmid_unique ON articles (pmid) WHERE pmid IS NOT NULL;
CREATE UNIQUE INDEX articles_title_year_unique ON articles (lower(title), published_at) WHERE doi IS NULL AND pmid IS NULL;

CREATE INDEX articles_category_idx ON articles (category_id);
CREATE INDEX articles_status_idx ON articles (status);

-- Full-text search across the fields listed in the spec's search requirement
-- (title, title_pt, abstract, summary_pt). Tags/category are joined separately.
ALTER TABLE articles ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', coalesce(title_pt, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(summary_pt, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(abstract, '')), 'C')
  ) STORED;
CREATE INDEX articles_search_idx ON articles USING GIN (search_vector);

CREATE TABLE article_tags (
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  tag_id     UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, tag_id)
);

CREATE TABLE searches (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id),
  query      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX searches_created_at_idx ON searches (created_at);
CREATE INDEX searches_query_idx ON searches (lower(query));

CREATE TABLE article_views (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX article_views_article_idx ON article_views (article_id);
CREATE INDEX article_views_created_at_idx ON article_views (created_at);

-- Staging area for the future curation agent (Phase 2+). Nothing writes here yet.
CREATE TABLE curation_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic          TEXT NOT NULL,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at    TIMESTAMPTZ,
  terms_used     JSONB,
  found_count    INTEGER NOT NULL DEFAULT 0,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  log            TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE curation_candidates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           UUID NOT NULL REFERENCES curation_runs(id) ON DELETE CASCADE,
  doi              TEXT,
  pmid             TEXT,
  title            TEXT NOT NULL,
  payload_json     JSONB NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  rejection_reason TEXT,
  reviewed_by      UUID REFERENCES users(id),
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX curation_candidates_run_idx ON curation_candidates (run_id);
CREATE INDEX curation_candidates_status_idx ON curation_candidates (status);
-- The agent must never write straight into `articles` — this staging table
-- (and the approval workflow that promotes a row into `articles`) is the
-- entire enforcement mechanism for that rule at this phase. There is no
-- foreign key or trigger from curation_candidates into articles on purpose:
-- promotion is an explicit, human-reviewed application action, not a
-- database-level cascade.
