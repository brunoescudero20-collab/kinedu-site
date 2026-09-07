-- Human review layer for curation_candidates. Additive only.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
-- No signup path ever sets this — an admin can only be promoted by direct
-- DB access (see docs/admin-review.md). Self-service admin signup would be
-- a privilege-escalation hole.

-- One row per approve/reject action a human takes, independent of the
-- reviewed_by/reviewed_at columns already on curation_candidates (which
-- only ever hold the *latest* review). This is the durable audit trail
-- item 6 of the spec asks for: who, when, which candidate, what action.
CREATE TABLE IF NOT EXISTS candidate_review_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES curation_candidates(id) ON DELETE CASCADE,
  admin_user_id UUID NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN ('approved', 'rejected')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candidate_review_log_candidate_idx ON candidate_review_log (candidate_id);
CREATE INDEX IF NOT EXISTS candidate_review_log_admin_idx ON candidate_review_log (admin_user_id);
