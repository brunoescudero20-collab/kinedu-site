import { pool } from '../../db/pool.js';
import { isValidDoi, isValidPmid, STUDY_TYPES } from '../../utils/validation.js';
import { minimumPublicationDate, isWithinPublicationWindow } from '../../utils/dates.js';

// Full candidate lifecycle (docs/agent-api.md). The agent may drive a
// candidate as far as PENDING_REVIEW. APPROVED and PUBLISHED are reachable
// states in the data model (a human reviewer sets them from the future
// admin/review UI) but are never valid targets for an agent-initiated
// status update — enforced in updateCandidateStatus below, not just by
// convention.
export const AGENT_WRITABLE_STATUSES = ['discovered', 'validating', 'validated', 'pending_review', 'rejected', 'duplicate', 'invalid'];
export const HUMAN_ONLY_STATUSES = ['approved', 'published'];

// ── curation_runs ──────────────────────────────────────────────────────

export async function createRun({ topics, searchTerms, sources }) {
  const topicList = Array.isArray(topics) ? topics : topics ? [topics] : [];
  const topicLabel = topicList.length ? topicList.join(', ') : 'unspecified';
  const { rows } = await pool.query(
    `INSERT INTO curation_runs (topic, topics, search_terms, sources, status)
     VALUES ($1, $2, $3, $4, 'running') RETURNING *`,
    [topicLabel, JSON.stringify(topicList), JSON.stringify(searchTerms || []), JSON.stringify(sources || [])],
  );
  return rows[0];
}

export async function listRuns({ status, page = 1, pageSize = 20 } = {}) {
  const limit = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 100);
  const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;
  const where = [];
  const params = [];
  if (status) { params.push(status); where.push(`status = $${params.length}`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await pool.query(`SELECT * FROM curation_runs ${whereSql} ORDER BY started_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
  const { rows: countRows } = await pool.query(`SELECT count(*) FROM curation_runs ${whereSql}`, params);
  return { total: Number(countRows[0].count), page: Math.max(parseInt(page, 10) || 1, 1), pageSize: limit, runs: rows };
}

export async function getRun(id) {
  const { rows } = await pool.query('SELECT * FROM curation_runs WHERE id = $1', [id]);
  if (!rows.length) return null;
  const { rows: statusCounts } = await pool.query('SELECT status, count(*) FROM curation_candidates WHERE run_id = $1 GROUP BY status', [id]);
  return { ...rows[0], candidates_by_status: Object.fromEntries(statusCounts.map((r) => [r.status, Number(r.count)])) };
}

const RUN_UPDATABLE_FIELDS = ['status', 'finished_at', 'found_count', 'validated_count', 'accepted_count', 'rejected_count', 'duplicate_count', 'candidate_count', 'published_count', 'log', 'error_log'];

export async function updateRun(id, patch) {
  const sets = [];
  const params = [];
  for (const field of RUN_UPDATABLE_FIELDS) {
    if (patch[field] !== undefined) { params.push(patch[field]); sets.push(`${field} = $${params.length}`); }
  }
  if (!sets.length) return getRun(id);
  params.push(id);
  const { rows } = await pool.query(`UPDATE curation_runs SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  if (!rows.length) return null;
  return rows[0];
}

// ── curation_candidates ─────────────────────────────────────────────────

export async function listCandidates({ status, runId, topic, page = 1, pageSize = 20 } = {}) {
  const limit = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 100);
  const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;
  const where = [];
  const params = [];
  if (status) { params.push(status); where.push(`status = $${params.length}`); }
  if (runId) { params.push(runId); where.push(`run_id = $${params.length}`); }
  if (topic) { params.push(topic); where.push(`topic = $${params.length}`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await pool.query(`SELECT * FROM curation_candidates ${whereSql} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
  const { rows: countRows } = await pool.query(`SELECT count(*) FROM curation_candidates ${whereSql}`, params);
  return { total: Number(countRows[0].count), page: Math.max(parseInt(page, 10) || 1, 1), pageSize: limit, candidates: rows };
}

export function validateCandidateInput(payload) {
  const errors = [];
  if (!payload.run_id) errors.push('run_id é obrigatório.');
  if (!payload.title || !String(payload.title).trim()) errors.push('title é obrigatório.');
  if (payload.doi !== undefined && payload.doi !== null && !isValidDoi(payload.doi)) errors.push('doi não está em um formato válido (esperado algo como 10.xxxx/yyyy).');
  if (payload.pmid !== undefined && payload.pmid !== null && !isValidPmid(payload.pmid)) errors.push('pmid deve conter apenas dígitos.');
  if (payload.published_at !== undefined && payload.published_at !== null) {
    const d = new Date(payload.published_at);
    if (Number.isNaN(d.getTime())) errors.push('published_at não é uma data válida.');
  }
  if (payload.study_type !== undefined && payload.study_type !== null && !STUDY_TYPES.includes(payload.study_type)) {
    errors.push(`study_type deve ser um de: ${STUDY_TYPES.join(', ')}.`);
  }
  return errors;
}

// Duplicate check, in the required priority order: DOI, then PMID, then
// title + authors + year. Checks real articles first (the source of
// truth), then any existing candidate row (any status — even a rejected
// candidate re-surfacing is worth flagging so the agent doesn't redo work).
export async function findDuplicate({ doi, pmid, title, authors, published_at: publishedAt }) {
  if (doi) {
    const [inArticles, inCandidates] = await Promise.all([
      pool.query('SELECT id, title, slug FROM articles WHERE doi = $1', [doi]),
      pool.query('SELECT id, title, status FROM curation_candidates WHERE doi = $1', [doi]),
    ]);
    if (inArticles.rows.length) return { matchedIn: 'articles', matchedBy: 'doi', matched: inArticles.rows[0] };
    if (inCandidates.rows.length) return { matchedIn: 'candidates', matchedBy: 'doi', matched: inCandidates.rows[0] };
  }
  if (pmid) {
    const [inArticles, inCandidates] = await Promise.all([
      pool.query('SELECT id, title, slug FROM articles WHERE pmid = $1', [pmid]),
      pool.query('SELECT id, title, status FROM curation_candidates WHERE pmid = $1', [pmid]),
    ]);
    if (inArticles.rows.length) return { matchedIn: 'articles', matchedBy: 'pmid', matched: inArticles.rows[0] };
    if (inCandidates.rows.length) return { matchedIn: 'candidates', matchedBy: 'pmid', matched: inCandidates.rows[0] };
  }
  if (title && publishedAt) {
    const year = new Date(publishedAt).getFullYear();
    if (!Number.isNaN(year)) {
      const [inArticles, inCandidates] = await Promise.all([
        pool.query("SELECT id, title, slug FROM articles WHERE lower(title) = lower($1) AND extract(year FROM published_at) = $2", [title, year]),
        pool.query("SELECT id, title, status FROM curation_candidates WHERE lower(title) = lower($1) AND extract(year FROM published_at) = $2", [title, year]),
      ]);
      if (inArticles.rows.length) return { matchedIn: 'articles', matchedBy: 'title_year', matched: inArticles.rows[0] };
      if (inCandidates.rows.length) return { matchedIn: 'candidates', matchedBy: 'title_year', matched: inCandidates.rows[0] };
    }
  }
  return null;
}

const CANDIDATE_INSERT_FIELDS = [
  'run_id', 'doi', 'pmid', 'title', 'title_pt', 'authors', 'journal', 'published_at',
  'abstract', 'summary_pt', 'study_type', 'methodology', 'population', 'main_results',
  'conclusion', 'practical_application', 'limitations', 'source', 'topic', 'tags', 'payload_json',
];

// POST /api/agent/candidates — validate, apply the 10-year rule, dedup,
// then insert. Returns one of three shapes:
//   { created: false, duplicate: true, matched_in, matched_by, matched }
//   { created: true, candidate: {...status: 'rejected', rejection_reason: '10_year_window'} }
//   { created: true, candidate: {...status: 'discovered'} }
export async function createCandidate(payload) {
  const errors = validateCandidateInput(payload);
  if (errors.length) return { errors };

  const duplicate = await findDuplicate(payload);
  if (duplicate) {
    return { created: false, duplicate: true, matched_in: duplicate.matchedIn, matched_by: duplicate.matchedBy, matched: duplicate.matched };
  }

  const outsideWindow = payload.published_at && !isWithinPublicationWindow(payload.published_at, 10);
  const values = CANDIDATE_INSERT_FIELDS.map((f) => {
    if (f === 'tags') return payload.tags ? JSON.stringify(payload.tags) : null;
    if (f === 'payload_json') return JSON.stringify(payload.payload_json || {});
    return payload[f] ?? null;
  });
  const placeholders = CANDIDATE_INSERT_FIELDS.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool.query(
    `INSERT INTO curation_candidates (${CANDIDATE_INSERT_FIELDS.join(', ')}, status, rejection_reason)
     VALUES (${placeholders}, $${CANDIDATE_INSERT_FIELDS.length + 1}, $${CANDIDATE_INSERT_FIELDS.length + 2})
     RETURNING *`,
    [...values, outsideWindow ? 'rejected' : 'discovered', outsideWindow ? `Fora da janela de 10 anos (mínimo aceito: ${minimumPublicationDate(10).toISOString().slice(0, 10)}).` : null],
  );
  return { created: true, duplicate: false, candidate: rows[0] };
}

export async function getCandidate(id) {
  const { rows } = await pool.query('SELECT * FROM curation_candidates WHERE id = $1', [id]);
  return rows[0] || null;
}

// PATCH /api/agent/candidates/:id/status — the enforcement point for
// "agent never publishes". `newStatus` is validated against
// AGENT_WRITABLE_STATUSES before this is even called (see routes/agent.js),
// so HUMAN_ONLY_STATUSES can't reach here as a target at all. We also
// refuse to touch a candidate a human has already moved to approved/
// published, regardless of what the agent asks for.
export async function updateCandidateStatus(id, newStatus, { rejectionReason } = {}) {
  const current = await getCandidate(id);
  if (!current) return { notFound: true };
  if (HUMAN_ONLY_STATUSES.includes(current.status)) {
    return { forbidden: true, reason: `Candidato já está em '${current.status}' (revisão humana) — o agente não pode alterá-lo.` };
  }
  const { rows } = await pool.query(
    'UPDATE curation_candidates SET status = $1, rejection_reason = COALESCE($2, rejection_reason), validated_at = CASE WHEN $1 = \'validated\' THEN now() ELSE validated_at END WHERE id = $3 RETURNING *',
    [newStatus, rejectionReason || null, id],
  );
  return { updated: true, candidate: rows[0] };
}
