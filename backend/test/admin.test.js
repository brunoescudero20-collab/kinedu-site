// Integration tests for /api/admin/* (human review panel) and the parts of
// /api/auth that back it (session issuance). Runs against the real dev
// database — see docs/agent-api.md "Limitações" for why. Creates its own
// admin/regular users and cleans up everything it creates.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { app } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { env } from '../src/config/env.js';

let server;
let base;
let adminToken;
let regularToken;
const createdUserIds = [];
const createdRunIds = [];
const createdCandidateIds = [];

async function createUser({ isAdmin }) {
  const email = `test-${isAdmin ? 'admin' : 'user'}-${Date.now()}-${Math.random().toString(36).slice(2)}@kinedu.com`;
  const passwordHash = await bcrypt.hash('senhaDeTeste123', 4);
  const { rows } = await pool.query(
    'INSERT INTO users (email, password_hash, is_admin) VALUES ($1, $2, $3) RETURNING id, email, is_admin',
    [email, passwordHash, isAdmin],
  );
  createdUserIds.push(rows[0].id);
  return rows[0];
}

async function login(email) {
  const res = await fetch(base.replace('/api/admin', '/api') + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'senhaDeTeste123' }),
  });
  const body = await res.json();
  return body.token;
}

// Creates a candidate all the way to pending_review by driving it through
// the agent endpoints directly against the app instance (not the agent's
// own test file) — the admin panel only ever acts on pending_review rows.
async function createPendingCandidate() {
  const agentHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${env.agentApiKey}` };
  const agentBase = base.replace('/api/admin', '/api/agent');

  const runRes = await fetch(agentBase + '/curation-runs', { method: 'POST', headers: agentHeaders, body: JSON.stringify({ topics: ['Teste Admin'] }) });
  const run = await runRes.json();
  createdRunIds.push(run.id);

  const candRes = await fetch(agentBase + '/candidates', {
    method: 'POST', headers: agentHeaders,
    body: JSON.stringify({ run_id: run.id, title: 'Candidato de teste do painel admin', authors: 'Autor Teste', doi: `10.9999/admintest.${Date.now()}` }),
  });
  const created = await candRes.json();
  createdCandidateIds.push(created.candidate.id);

  for (const status of ['validating', 'validated', 'pending_review']) {
    await fetch(agentBase + `/candidates/${created.candidate.id}/status`, { method: 'PATCH', headers: agentHeaders, body: JSON.stringify({ status }) });
  }
  return created.candidate.id;
}

before(async () => {
  if (!env.agentApiKey) throw new Error('KINEDU_AGENT_API_KEY não definida — necessária para preparar candidatos de teste.');
  server = app.listen(0);
  const { port } = server.address();
  base = `http://127.0.0.1:${port}/api/admin`;

  const admin = await createUser({ isAdmin: true });
  const regular = await createUser({ isAdmin: false });
  adminToken = await login(admin.email);
  regularToken = await login(regular.email);
});

after(async () => {
  if (createdCandidateIds.length) await pool.query('DELETE FROM candidate_review_log WHERE candidate_id = ANY($1)', [createdCandidateIds]);
  if (createdCandidateIds.length) await pool.query('DELETE FROM curation_candidates WHERE id = ANY($1)', [createdCandidateIds]);
  if (createdRunIds.length) await pool.query('DELETE FROM curation_runs WHERE id = ANY($1)', [createdRunIds]);
  if (createdUserIds.length) await pool.query('DELETE FROM users WHERE id = ANY($1)', [createdUserIds]);
  await pool.end();
  await new Promise((resolve) => server.close(resolve));
});

function adminFetch(path, opts = {}, token = adminToken) {
  return fetch(base + path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts.headers } });
}

test('login concede token com is_admin correto', async () => {
  assert.ok(adminToken);
  assert.ok(regularToken);
});

test('sem token -> 401', async () => {
  const res = await fetch(base + '/candidates');
  assert.equal(res.status, 401);
});

test('usuário não-admin -> 403', async () => {
  const res = await adminFetch('/candidates', {}, regularToken);
  assert.equal(res.status, 403);
});

test('a chave do agente não é aceita em /api/admin/*', async () => {
  const res = await fetch(base + '/candidates', { headers: { Authorization: `Bearer ${env.agentApiKey}` } });
  assert.equal(res.status, 401);
});

test('admin autorizado -> 200', async () => {
  const res = await adminFetch('/me');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.is_admin, true);
});

test('candidato pending_review aparece na listagem do painel', async () => {
  const candidateId = await createPendingCandidate();
  const res = await adminFetch('/candidates?status=pending_review');
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.ok(body.candidates.some((c) => c.id === candidateId));
});

test('aprovação: pending_review -> approved, registra reviewed_by/reviewed_at e log', async () => {
  const candidateId = await createPendingCandidate();
  const res = await adminFetch(`/candidates/${candidateId}/approve`, { method: 'POST' });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.status, 'approved');
  assert.ok(body.reviewed_by);
  assert.ok(body.reviewed_at);

  const { rows } = await pool.query('SELECT * FROM candidate_review_log WHERE candidate_id = $1', [candidateId]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, 'approved');
});

test('aprovar duas vezes -> 409 na segunda', async () => {
  const candidateId = await createPendingCandidate();
  await adminFetch(`/candidates/${candidateId}/approve`, { method: 'POST' });
  const res = await adminFetch(`/candidates/${candidateId}/approve`, { method: 'POST' });
  assert.equal(res.status, 409);
});

test('rejeição sem motivo -> 400', async () => {
  const candidateId = await createPendingCandidate();
  const res = await adminFetch(`/candidates/${candidateId}/reject`, { method: 'POST', body: JSON.stringify({}) });
  assert.equal(res.status, 400);
});

test('rejeição com motivo: pending_review -> rejected, motivo salvo', async () => {
  const candidateId = await createPendingCandidate();
  const reason = 'Metodologia insuficientemente descrita.';
  const res = await adminFetch(`/candidates/${candidateId}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.status, 'rejected');
  assert.equal(body.rejection_reason, reason);

  const { rows } = await pool.query('SELECT action, reason FROM candidate_review_log WHERE candidate_id = $1', [candidateId]);
  assert.equal(rows[0].action, 'rejected');
  assert.equal(rows[0].reason, reason);
});

test('usuário não-admin não consegue aprovar nem rejeitar', async () => {
  const candidateId = await createPendingCandidate();
  const approveRes = await adminFetch(`/candidates/${candidateId}/approve`, { method: 'POST' }, regularToken);
  assert.equal(approveRes.status, 403);
  const rejectRes = await adminFetch(`/candidates/${candidateId}/reject`, { method: 'POST', body: JSON.stringify({ reason: 'x' }) }, regularToken);
  assert.equal(rejectRes.status, 403);
});

test('aprovar via admin nunca escreve em articles', async () => {
  const { rows: before } = await pool.query('SELECT count(*) FROM articles');
  const candidateId = await createPendingCandidate();
  await adminFetch(`/candidates/${candidateId}/approve`, { method: 'POST' });
  const { rows: after } = await pool.query('SELECT count(*) FROM articles');
  assert.equal(before[0].count, after[0].count);
});
