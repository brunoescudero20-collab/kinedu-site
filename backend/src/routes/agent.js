import { Router } from 'express';
import { requireAgentAuth } from '../agent/auth.js';
import { agentRateLimit } from '../agent/rateLimiter.js';
import { agentAuditLog } from '../agent/auditLog.js';
import * as articlesService from '../services/agent/articlesService.js';
import * as searchStatsService from '../services/agent/searchStatsService.js';
import * as articleStatisticsService from '../services/agent/articleStatisticsService.js';
import * as contentGapsService from '../services/agent/contentGapsService.js';
import * as curationService from '../services/agent/curationService.js';
import * as stateService from '../services/agent/stateService.js';

export const agentRouter = Router();

// Every /api/agent/* call must be authenticated, rate-limited, and logged
// to agent_audit_log — applied once here so no individual route can forget.
agentRouter.use(requireAgentAuth, agentRateLimit, agentAuditLog);

function fail(res, next, operation, err) {
  res.locals.operation = operation;
  res.locals.errorMessage = err.message;
  next(err);
}

// ── READ: articles & categories ─────────────────────────────────────────

agentRouter.get('/articles', async (req, res, next) => {
  res.locals.operation = 'list_articles';
  try {
    const { category, topic, date_from: dateFrom, date_to: dateTo, status, study_type: studyType, page, page_size: pageSize } = req.query;
    const result = await articlesService.listArticles({ category: category || topic, dateFrom, dateTo, status, studyType, page, pageSize });
    res.locals.recordCount = result.articles.length;
    res.json(result);
  } catch (err) { fail(res, next, 'list_articles', err); }
});

agentRouter.get('/categories', async (req, res, next) => {
  res.locals.operation = 'list_categories';
  try {
    const categories = await articlesService.listCategoriesWithCounts();
    res.locals.recordCount = categories.length;
    res.json({ categories });
  } catch (err) { fail(res, next, 'list_categories', err); }
});

// ── READ: search & content statistics ────────────────────────────────────

agentRouter.get('/search-statistics', async (req, res, next) => {
  res.locals.operation = 'search_statistics';
  try {
    const { period, from, to, limit } = req.query;
    const result = await searchStatsService.getSearchStatistics({ period, from, to, limit });
    res.locals.recordCount = result.terms.length;
    res.json(result);
  } catch (err) { fail(res, next, 'search_statistics', err); }
});

agentRouter.get('/search-trends', async (req, res, next) => {
  res.locals.operation = 'search_trends';
  try {
    const { topic, period } = req.query;
    const result = await searchStatsService.getSearchTrends({ topic, period });
    res.locals.recordCount = result.results.length;
    res.json(result);
  } catch (err) { fail(res, next, 'search_trends', err); }
});

agentRouter.get('/article-statistics', async (req, res, next) => {
  res.locals.operation = 'article_statistics';
  try {
    const { category, topic, from, to } = req.query;
    const result = await articleStatisticsService.getArticleStatistics({ category, topic, from, to });
    res.json(result);
  } catch (err) { fail(res, next, 'article_statistics', err); }
});

agentRouter.get('/content-gaps', async (req, res, next) => {
  res.locals.operation = 'content_gaps';
  try {
    const { period } = req.query;
    const result = await contentGapsService.getContentGaps({ period });
    res.locals.recordCount = result.gaps.length;
    res.json(result);
  } catch (err) { fail(res, next, 'content_gaps', err); }
});

// ── curation_runs ─────────────────────────────────────────────────────

agentRouter.get('/curation-runs', async (req, res, next) => {
  res.locals.operation = 'list_curation_runs';
  try {
    const { status, page, page_size: pageSize } = req.query;
    const result = await curationService.listRuns({ status, page, pageSize });
    res.locals.recordCount = result.runs.length;
    res.json(result);
  } catch (err) { fail(res, next, 'list_curation_runs', err); }
});

agentRouter.get('/curation-runs/:id', async (req, res, next) => {
  res.locals.operation = 'get_curation_run';
  res.locals.runId = req.params.id;
  try {
    const run = await curationService.getRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'not_found', message: 'Execução de curadoria não encontrada.' });
    res.json(run);
  } catch (err) { fail(res, next, 'get_curation_run', err); }
});

agentRouter.post('/curation-runs', async (req, res, next) => {
  res.locals.operation = 'create_curation_run';
  try {
    const { topics, search_terms: searchTerms, sources } = req.body || {};
    const run = await curationService.createRun({ topics, searchTerms, sources });
    res.locals.runId = run.id;
    res.status(201).json(run);
  } catch (err) { fail(res, next, 'create_curation_run', err); }
});

agentRouter.patch('/curation-runs/:id', async (req, res, next) => {
  res.locals.operation = 'update_curation_run';
  res.locals.runId = req.params.id;
  try {
    const run = await curationService.updateRun(req.params.id, req.body || {});
    if (!run) return res.status(404).json({ error: 'not_found', message: 'Execução de curadoria não encontrada.' });
    res.json(run);
  } catch (err) { fail(res, next, 'update_curation_run', err); }
});

// ── curation_candidates ──────────────────────────────────────────────────

agentRouter.get('/candidates', async (req, res, next) => {
  res.locals.operation = 'list_candidates';
  try {
    const { status, run_id: runId, topic, page, page_size: pageSize } = req.query;
    const result = await curationService.listCandidates({ status, runId, topic, page, pageSize });
    res.locals.recordCount = result.candidates.length;
    res.json(result);
  } catch (err) { fail(res, next, 'list_candidates', err); }
});

agentRouter.get('/candidates/:id', async (req, res, next) => {
  res.locals.operation = 'get_candidate';
  try {
    const candidate = await curationService.getCandidate(req.params.id);
    if (!candidate) return res.status(404).json({ error: 'not_found', message: 'Candidato não encontrado.' });
    res.json(candidate);
  } catch (err) { fail(res, next, 'get_candidate', err); }
});

agentRouter.post('/candidates', async (req, res, next) => {
  res.locals.operation = 'create_candidate';
  res.locals.runId = req.body?.run_id;
  try {
    const result = await curationService.createCandidate(req.body || {});
    if (result.errors) return res.status(400).json({ error: 'validation_error', message: result.errors.join(' ') });
    if (result.duplicate) {
      res.locals.recordCount = 0;
      return res.status(200).json(result);
    }
    res.locals.recordCount = 1;
    res.status(201).json(result);
  } catch (err) { fail(res, next, 'create_candidate', err); }
});

// Status update — the one place agent write privileges are actually
// bounded. newStatus is checked against AGENT_WRITABLE_STATUSES before
// the service layer is even called, so 'approved'/'published' can never
// reach curationService.updateCandidateStatus as a target.
agentRouter.patch('/candidates/:id/status', async (req, res, next) => {
  res.locals.operation = 'update_candidate_status';
  try {
    const { status: newStatus, rejection_reason: rejectionReason } = req.body || {};
    if (!newStatus || !curationService.AGENT_WRITABLE_STATUSES.includes(newStatus)) {
      return res.status(403).json({
        error: 'forbidden_transition',
        message: `O agente só pode definir um destes status: ${curationService.AGENT_WRITABLE_STATUSES.join(', ')}. ` +
          `'approved' e 'published' são exclusivos de revisão humana.`,
      });
    }
    const result = await curationService.updateCandidateStatus(req.params.id, newStatus, { rejectionReason });
    if (result.notFound) return res.status(404).json({ error: 'not_found', message: 'Candidato não encontrado.' });
    if (result.forbidden) return res.status(403).json({ error: 'forbidden_transition', message: result.reason });
    res.locals.recordCount = 1;
    res.json(result.candidate);
  } catch (err) { fail(res, next, 'update_candidate_status', err); }
});

// ── agent_state (shared state across scheduled tasks) ────────────────────

agentRouter.get('/state/:key', async (req, res, next) => {
  res.locals.operation = 'get_state';
  try {
    const state = await stateService.getState(req.params.key);
    if (!state) return res.status(404).json({ error: 'not_found', message: 'Chave de estado não encontrada.' });
    res.json(state);
  } catch (err) { fail(res, next, 'get_state', err); }
});

agentRouter.put('/state/:key', async (req, res, next) => {
  res.locals.operation = 'set_state';
  try {
    const state = await stateService.setState(req.params.key, req.body?.value ?? req.body ?? {});
    res.json(state);
  } catch (err) { fail(res, next, 'set_state', err); }
});

agentRouter.get('/state', async (req, res, next) => {
  res.locals.operation = 'list_state_keys';
  try {
    const keys = await stateService.listStateKeys();
    res.json({ keys });
  } catch (err) { fail(res, next, 'list_state_keys', err); }
});
