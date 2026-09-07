import { Router } from 'express';
import { requireAdminAuth } from '../admin/auth.js';
import * as curationService from '../services/agent/curationService.js';
import { logger } from '../utils/logger.js';
import { createFixedWindowLimiter } from '../utils/rateLimiter.js';

export const adminRouter = Router();

const adminRateLimit = createFixedWindowLimiter({ windowMs: 60_000, maxRequests: 120, key: 'admin' });

// Every /api/admin/* call requires a valid admin session — checked here
// once so no individual route can forget. Completely separate middleware
// from the agent's requireAgentAuth; there is no token format either side
// accepts from the other. Rate limit applied even though the caller is
// already authenticated — bounds the blast radius of a leaked admin token.
adminRouter.use(requireAdminAuth, adminRateLimit);

adminRouter.get('/me', (req, res) => {
  res.json({ id: req.adminUser.id, email: req.adminUser.email, is_admin: true });
});

// GET /api/admin/candidates — filters: status, topic, category, study_type,
// year, discovered_from, discovered_to, page, page_size.
adminRouter.get('/candidates', async (req, res, next) => {
  try {
    const { status, topic, category, study_type: studyType, year, discovered_from: discoveredFrom, discovered_to: discoveredTo, page, page_size: pageSize } = req.query;
    const result = await curationService.listCandidates({ status, topic, category, studyType, year, discoveredFrom, discoveredTo, page, pageSize });
    res.json(result);
  } catch (err) { next(err); }
});

adminRouter.get('/candidates/:id', async (req, res, next) => {
  try {
    const candidate = await curationService.getCandidate(req.params.id);
    if (!candidate) return res.status(404).json({ error: 'not_found', message: 'Candidato não encontrado.' });
    res.json(candidate);
  } catch (err) { next(err); }
});

// POST /api/admin/candidates/:id/approve — PENDING_REVIEW -> APPROVED only.
// Never touches `articles`. "approved" means only "an admin reviewed and
// accepted this" — publication is a separate, not-yet-built step.
adminRouter.post('/candidates/:id/approve', async (req, res, next) => {
  try {
    const result = await curationService.approveCandidate(req.params.id, req.adminUser.id);
    if (result.notFound) return res.status(404).json({ error: 'not_found', message: 'Candidato não encontrado.' });
    if (result.invalidState) {
      return res.status(409).json({ error: 'invalid_state', message: `Candidato está em '${result.currentStatus}', não em 'pending_review'. Só é possível aprovar candidatos pendentes de revisão.` });
    }
    logger.info('Admin approved candidate', { candidateId: req.params.id, adminUserId: req.adminUser.id });
    res.json(result.candidate);
  } catch (err) { next(err); }
});

// POST /api/admin/candidates/:id/reject — PENDING_REVIEW -> REJECTED only.
// Requires a reason.
adminRouter.post('/candidates/:id/reject', async (req, res, next) => {
  try {
    const { reason } = req.body || {};
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ error: 'validation_error', message: 'Informe o motivo da rejeição.' });
    }
    const result = await curationService.rejectCandidate(req.params.id, req.adminUser.id, reason.trim());
    if (result.notFound) return res.status(404).json({ error: 'not_found', message: 'Candidato não encontrado.' });
    if (result.invalidState) {
      return res.status(409).json({ error: 'invalid_state', message: `Candidato está em '${result.currentStatus}', não em 'pending_review'. Só é possível rejeitar candidatos pendentes de revisão.` });
    }
    logger.info('Admin rejected candidate', { candidateId: req.params.id, adminUserId: req.adminUser.id });
    res.json(result.candidate);
  } catch (err) { next(err); }
});
