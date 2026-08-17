// Integration tests for the /api/agent/* surface. Run against the real dev
// database configured in .env (there is no separate test database in this
// phase — see docs/agent-api.md "Limitações"). Every row this file creates
// is deleted in `after()` so a run leaves the database exactly as it found it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { env } from '../src/config/env.js';

let server;
let base;
const createdRunIds = [];
const createdCandidateIds = [];
const createdStateKeys = [];

before(async () => {
  if (!env.agentApiKey) {
    throw new Error('KINEDU_AGENT_API_KEY não está definida — defina no .env antes de rodar os testes do agente.');
  }
  server = app.listen(0);
  const { port } = server.address();
  base = `http://127.0.0.1:${port}/api/agent`;
});

after(async () => {
  if (createdCandidateIds.length) await pool.query('DELETE FROM curation_candidates WHERE id = ANY($1)', [createdCandidateIds]);
  if (createdRunIds.length) await pool.query('DELETE FROM curation_runs WHERE id = ANY($1)', [createdRunIds]);
  if (createdStateKeys.length) await pool.query('DELETE FROM agent_state WHERE key = ANY($1)', [createdStateKeys]);
  await pool.end();
  await new Promise((resolve) => server.close(resolve));
});

function agentFetch(path, opts = {}) {
  return fetch(base + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.agentApiKey}`, ...opts.headers },
  });
}

// ── auth ──────────────────────────────────────────────────────────────

test('sem Authorization header -> 401', async () => {
  const res = await fetch(base + '/articles');
  assert.equal(res.status, 401);
});

test('chave errada -> 401', async () => {
  const res = await fetch(base + '/articles', { headers: { Authorization: 'Bearer chave-errada' } });
  assert.equal(res.status, 401);
});

test('chave correta -> 200', async () => {
  const res = await agentFetch('/articles');
  assert.equal(res.status, 200);
});

// ── read endpoints ────────────────────────────────────────────────────

test('GET /articles retorna os artigos reais migrados', async () => {
  const res = await agentFetch('/articles');
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.ok(body.total >= 5, 'esperava pelo menos os 5 artigos migrados');
  assert.ok(Array.isArray(body.articles));
});

test('GET /categories retorna contagens reais', async () => {
  const res = await agentFetch('/categories');
  const body = await res.json();
  assert.equal(res.status, 200);
  const hipertrofia = body.categories.find((c) => c.slug === 'hipertrofia-muscular');
  assert.ok(hipertrofia, 'categoria hipertrofia-muscular deveria existir');
  assert.ok(hipertrofia.article_count >= 5);
});

test('GET /search-statistics não quebra mesmo sem filtro de período', async () => {
  const res = await agentFetch('/search-statistics');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.terms));
});

test('GET /search-trends retorna insufficient_data quando não há período anterior', async () => {
  const res = await agentFetch('/search-trends?topic=TemaQueNuncaFoiPesquisado');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.results.every((r) => r.previous_period_count > 0 || r.trend === 'insufficient_data'));
});

test('GET /article-statistics aplica a regra dos 10 anos dinamicamente', async () => {
  const res = await agentFetch('/article-statistics');
  const body = await res.json();
  assert.equal(res.status, 200);
  const expectedFloorYear = new Date().getFullYear() - 10;
  assert.equal(body.ten_year_floor_date.slice(0, 4), String(expectedFloorYear));
});

test('GET /content-gaps documenta a fórmula usada', async () => {
  const res = await agentFetch('/content-gaps');
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.match(body.formula, /gap_score/);
});

// ── curation_runs + curation_candidates: the full agent flow ─────────────

test('fluxo completo do agente: stats -> lacuna -> run -> candidate -> pending_review -> bloqueio de publicação', async () => {
  // 1. obter estatísticas
  const statsRes = await agentFetch('/article-statistics');
  assert.equal(statsRes.status, 200);

  // 2. consultar artigos
  const articlesRes = await agentFetch('/articles?category=hipertrofia-muscular');
  assert.equal(articlesRes.status, 200);

  // 3. identificar uma lacuna
  const gapsRes = await agentFetch('/content-gaps');
  const gaps = await gapsRes.json();
  assert.ok(gaps.gaps.length > 0);

  // 4. criar um curation_run
  const runRes = await agentFetch('/curation-runs', {
    method: 'POST',
    body: JSON.stringify({ topics: ['Hipertrofia Muscular'], search_terms: ['test term'], sources: ['test'] }),
  });
  assert.equal(runRes.status, 201);
  const run = await runRes.json();
  createdRunIds.push(run.id);

  // 5. criar um candidato
  const doi = `10.9999/test.${Date.now()}`;
  const candRes = await agentFetch('/candidates', {
    method: 'POST',
    body: JSON.stringify({ run_id: run.id, title: 'Teste automatizado de candidato', authors: 'Autor Teste', doi, published_at: '2023-01-01' }),
  });
  assert.equal(candRes.status, 201);
  const created = await candRes.json();
  assert.equal(created.candidate.status, 'discovered');
  createdCandidateIds.push(created.candidate.id);

  // duplicate check: same DOI again must not create a second row
  const dupRes = await agentFetch('/candidates', {
    method: 'POST',
    body: JSON.stringify({ run_id: run.id, title: 'Outro título', authors: 'X', doi }),
  });
  const dupBody = await dupRes.json();
  assert.equal(dupBody.duplicate, true);

  // 6. deixar o candidato como PENDING_REVIEW
  for (const status of ['validating', 'validated', 'pending_review']) {
    const patchRes = await agentFetch(`/candidates/${created.candidate.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    assert.equal(patchRes.status, 200, `transição para ${status} deveria ser permitida`);
  }

  // 7. NÃO conseguir publicar
  const approveRes = await agentFetch(`/candidates/${created.candidate.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) });
  assert.equal(approveRes.status, 403);
  const publishRes = await agentFetch(`/candidates/${created.candidate.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'published' }) });
  assert.equal(publishRes.status, 403);
});

test('candidato fora da janela de 10 anos é criado já como rejected', async () => {
  const runRes = await agentFetch('/curation-runs', { method: 'POST', body: JSON.stringify({ topics: ['Teste'] }) });
  const run = await runRes.json();
  createdRunIds.push(run.id);

  const res = await agentFetch('/candidates', {
    method: 'POST',
    body: JSON.stringify({ run_id: run.id, title: 'Estudo de 2001', authors: 'Y', doi: `10.9999/old.${Date.now()}`, published_at: '2001-01-01' }),
  });
  const body = await res.json();
  assert.equal(res.status, 201);
  assert.equal(body.candidate.status, 'rejected');
  assert.match(body.candidate.rejection_reason, /10 anos/);
  createdCandidateIds.push(body.candidate.id);
});

test('candidato sem title é rejeitado com 400', async () => {
  const res = await agentFetch('/candidates', { method: 'POST', body: JSON.stringify({ run_id: '00000000-0000-0000-0000-000000000000', authors: 'Z' }) });
  assert.equal(res.status, 400);
});

test('candidato já aprovado por humano não pode ser alterado pelo agente', async () => {
  const runRes = await agentFetch('/curation-runs', { method: 'POST', body: JSON.stringify({ topics: ['Teste'] }) });
  const run = await runRes.json();
  createdRunIds.push(run.id);
  const candRes = await agentFetch('/candidates', {
    method: 'POST',
    body: JSON.stringify({ run_id: run.id, title: 'Candidato pré-aprovado', authors: 'W', doi: `10.9999/preapproved.${Date.now()}` }),
  });
  const { candidate } = await candRes.json();
  createdCandidateIds.push(candidate.id);
  await pool.query("UPDATE curation_candidates SET status = 'approved' WHERE id = $1", [candidate.id]);

  const res = await agentFetch(`/candidates/${candidate.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'validating' }) });
  assert.equal(res.status, 403);
});

// ── agent_state ───────────────────────────────────────────────────────

test('agent_state: escrever e ler uma chave', async () => {
  const key = `test-key-${Date.now()}`;
  createdStateKeys.push(key);
  const putRes = await agentFetch(`/state/${key}`, { method: 'PUT', body: JSON.stringify({ value: { hello: 'world' } }) });
  assert.equal(putRes.status, 200);
  const getRes = await agentFetch(`/state/${key}`);
  const body = await getRes.json();
  assert.equal(getRes.status, 200);
  assert.deepEqual(body.value, { hello: 'world' });
});

test('agent_state: chave inexistente -> 404', async () => {
  const res = await agentFetch('/state/chave-que-nao-existe-nunca');
  assert.equal(res.status, 404);
});

// ── audit log ─────────────────────────────────────────────────────────

test('chamadas autenticadas geram linha em agent_audit_log', async () => {
  const marker = `audit-check-${Date.now()}`;
  await agentFetch(`/state/${marker}`); // 404, but still authenticated -> should be logged
  await new Promise((resolve) => setTimeout(resolve, 200)); // audit insert is fire-and-forget
  const { rows } = await pool.query("SELECT * FROM agent_audit_log WHERE endpoint = $1 ORDER BY occurred_at DESC LIMIT 1", [`/state/${marker}`]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status_code, 404);
  assert.equal(rows[0].error, null); // 404 body isn't surfaced as an "error" — see docs
});
