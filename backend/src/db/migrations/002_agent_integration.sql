-- Agent integration layer (KINEDU_AGENT_API side). Additive only — no
-- existing column, constraint, or row from 001_init.sql is dropped or
-- renamed, so the public API and frontend keep working unchanged.

-- ── curation_runs: richer run bookkeeping ──────────────────────────────
ALTER TABLE curation_runs
  ADD COLUMN IF NOT EXISTS topics JSONB,
  ADD COLUMN IF NOT EXISTS search_terms JSONB,
  ADD COLUMN IF NOT EXISTS sources JSONB,
  ADD COLUMN IF NOT EXISTS validated_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duplicate_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS candidate_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_log TEXT;

-- ── curation_candidates: full candidate payload as real columns ───────
-- payload_json is kept as a passthrough for whatever raw extra data a
-- source API returned (e.g. the full Crossref/PubMed record) — the fields
-- below are the ones the platform and reviewers actually query/filter on.
ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS title_pt TEXT,
  ADD COLUMN IF NOT EXISTS authors TEXT,
  ADD COLUMN IF NOT EXISTS journal TEXT,
  ADD COLUMN IF NOT EXISTS published_at DATE,
  ADD COLUMN IF NOT EXISTS abstract TEXT,
  ADD COLUMN IF NOT EXISTS summary_pt TEXT,
  ADD COLUMN IF NOT EXISTS study_type TEXT,
  ADD COLUMN IF NOT EXISTS methodology TEXT,
  ADD COLUMN IF NOT EXISTS population TEXT,
  ADD COLUMN IF NOT EXISTS main_results TEXT,
  ADD COLUMN IF NOT EXISTS conclusion TEXT,
  ADD COLUMN IF NOT EXISTS practical_application TEXT,
  ADD COLUMN IF NOT EXISTS limitations TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS topic TEXT,
  ADD COLUMN IF NOT EXISTS tags JSONB,
  ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ,
  ALTER COLUMN payload_json DROP NOT NULL;

-- payload_json used to be mandatory; now that the real fields live in
-- their own columns it becomes optional (defaults to an empty object).
ALTER TABLE curation_candidates ALTER COLUMN payload_json SET DEFAULT '{}'::jsonb;

-- Full status lifecycle (see docs/agent-api.md). The agent may drive a
-- candidate up to PENDING_REVIEW; APPROVED/PUBLISHED are only ever set by
-- a human reviewer — enforced in the route handler, not just documented,
-- since a CHECK constraint can't know who the caller is.
ALTER TABLE curation_candidates DROP CONSTRAINT curation_candidates_status_check;
ALTER TABLE curation_candidates ADD CONSTRAINT curation_candidates_status_check
  CHECK (status IN (
    'discovered', 'validating', 'validated', 'pending_review',
    'approved', 'published', 'rejected', 'duplicate', 'invalid',
    -- legacy value from 001_init.sql ('approved'/'rejected' already covered
    -- above), kept valid for any pre-existing rows
    'pending'
  ));
ALTER TABLE curation_candidates ALTER COLUMN status SET DEFAULT 'discovered';

CREATE INDEX IF NOT EXISTS curation_candidates_topic_idx ON curation_candidates (topic);
CREATE INDEX IF NOT EXISTS curation_candidates_doi_idx ON curation_candidates (doi) WHERE doi IS NOT NULL;
CREATE INDEX IF NOT EXISTS curation_candidates_pmid_idx ON curation_candidates (pmid) WHERE pmid IS NOT NULL;

-- ── agent_state: small persistent key/value store ──────────────────────
-- Lets the scheduled tasks (A/B/C) share state across independent runs
-- without depending on any single session's memory (item 23 of the spec).
CREATE TABLE IF NOT EXISTS agent_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── agent_audit_log: every call the agent makes ─────────────────────────
-- Never stores the API key itself, request bodies, or secrets — just
-- enough to reconstruct what the agent did and when (item 21).
CREATE TABLE IF NOT EXISTS agent_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  operation TEXT NOT NULL,
  result TEXT NOT NULL,
  record_count INTEGER,
  run_id UUID,
  status_code INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_audit_log_occurred_at_idx ON agent_audit_log (occurred_at);
CREATE INDEX IF NOT EXISTS agent_audit_log_run_id_idx ON agent_audit_log (run_id);
