// Integration tests for the Remote MCP server (/mcp). Runs against the
// real dev database (see docs/agent-api.md "Limitações"). Uses the MCP
// SDK's own Client + StreamableHTTPClientTransport rather than hand-rolled
// JSON-RPC HTTP calls — this is the spec-correct way to exercise a
// Streamable HTTP server and matches what a real Claude/Cowork connector
// does.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { app } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { env } from '../src/config/env.js';

let server;
let mcpUrl;
const createdRunIds = [];
const createdCandidateIds = [];
const createdStateKeys = [];
// StreamableHTTPClientTransport keeps an SSE stream open for server-initiated
// messages — never closing it would keep the event loop alive forever and
// `node --test` would hang after the last "ok" line. Track every client so
// after() can close them all before the process is expected to exit.
const openClients = [];

async function connectClient(headers) {
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), { requestInit: { headers } });
  const client = new Client({ name: 'mcp-test-client', version: '1.0.0' });
  await client.connect(transport);
  openClients.push(client);
  return client;
}

function toolJson(result) {
  return JSON.parse(result.content[0].text);
}

before(async () => {
  if (!env.mcpAuthSecret) throw new Error('MCP_AUTH_SECRET não definida — necessária para rodar os testes do MCP.');
  server = app.listen(0);
  const { port } = server.address();
  mcpUrl = `http://127.0.0.1:${port}/mcp`;
});

after(async () => {
  await Promise.all(openClients.map((c) => c.close().catch(() => {})));
  if (createdCandidateIds.length) await pool.query('DELETE FROM curation_candidates WHERE id = ANY($1)', [createdCandidateIds]);
  if (createdRunIds.length) await pool.query('DELETE FROM curation_runs WHERE id = ANY($1)', [createdRunIds]);
  if (createdStateKeys.length) await pool.query('DELETE FROM agent_state WHERE key = ANY($1)', [createdStateKeys]);
  await pool.end();
  await new Promise((resolve) => server.close(resolve));
});

test('1. servidor MCP inicia e responde ao health check', async () => {
  const res = await fetch(mcpUrl.replace(/\/mcp$/, '/mcp/health'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.database_connected, true);
  assert.equal(body.mcp_configured, true);
});

test('2. acesso sem autenticação é rejeitado', async () => {
  await assert.rejects(() => connectClient({}));
});

test('2b. autenticação com chave errada é rejeitada', async () => {
  await assert.rejects(() => connectClient({ Authorization: 'Bearer chave-completamente-errada' }));
});

test('3. autenticação correta conecta e lista as ferramentas esperadas', async () => {
  const client = await connectClient({ Authorization: `Bearer ${env.mcpAuthSecret}` });
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  for (const expected of [
    'kinEdu_get_articles', 'kinEdu_get_categories', 'kinEdu_get_search_statistics',
    'kinEdu_get_search_trends', 'kinEdu_get_article_statistics', 'kinEdu_get_content_gaps',
    'kinEdu_get_curation_runs', 'kinEdu_get_candidates', 'kinEdu_get_agent_state',
    'kinEdu_update_agent_state', 'kinEdu_create_curation_run', 'kinEdu_create_candidate',
  ]) {
    assert.ok(names.includes(expected), `esperava a ferramenta ${expected}`);
  }
  // Nenhuma ferramenta administrativa jamais foi registrada — não é uma
  // política aplicada em runtime, é a ausência estrutural da própria
  // ferramenta.
  assert.ok(!names.some((n) => /approve|publish|delete.*article|update.*article/i.test(n)), 'não deveria existir nenhuma ferramenta administrativa');
});

test('3. kinEdu_get_articles retorna dados reais', async () => {
  const client = await connectClient({ Authorization: `Bearer ${env.mcpAuthSecret}` });
  const result = await client.callTool({ name: 'kinEdu_get_articles', arguments: { category: 'hipertrofia-muscular' } });
  const body = toolJson(result);
  assert.equal(result.isError, undefined);
  assert.ok(body.total >= 5);
});

test('4. kinEdu_get_search_statistics não inventa dados', async () => {
  const client = await connectClient({ Authorization: `Bearer ${env.mcpAuthSecret}` });
  const result = await client.callTool({ name: 'kinEdu_get_search_statistics', arguments: { period: '30d' } });
  const body = toolJson(result);
  assert.ok(Array.isArray(body.terms));
});

test('5. kinEdu_get_search_trends retorna insufficient_data quando aplicável', async () => {
  const client = await connectClient({ Authorization: `Bearer ${env.mcpAuthSecret}` });
  const result = await client.callTool({ name: 'kinEdu_get_search_trends', arguments: { topic: 'TemaSemHistoricoNenhum' } });
  const body = toolJson(result);
  assert.ok(body.results.every((r) => r.previous_period_count > 0 || r.trend === 'insufficient_data'));
});

test('6. kinEdu_get_content_gaps reutiliza a fórmula documentada', async () => {
  const client = await connectClient({ Authorization: `Bearer ${env.mcpAuthSecret}` });
  const result = await client.callTool({ name: 'kinEdu_get_content_gaps', arguments: {} });
  const body = toolJson(result);
  assert.match(body.formula, /gap_score/);
});

test('7. kinEdu_get_candidates funciona (lista vazia é uma resposta válida)', async () => {
  const client = await connectClient({ Authorization: `Bearer ${env.mcpAuthSecret}` });
  const result = await client.callTool({ name: 'kinEdu_get_candidates', arguments: { status: 'pending_review' } });
  const body = toolJson(result);
  assert.ok(Array.isArray(body.candidates));
});

test('8. kinEdu_get_agent_state / kinEdu_update_agent_state', async () => {
  const client = await connectClient({ Authorization: `Bearer ${env.mcpAuthSecret}` });
  const key = `mcp-test-${Date.now()}`;
  createdStateKeys.push(key);
  const setResult = await client.callTool({ name: 'kinEdu_update_agent_state', arguments: { key, value: { a: 1 } } });
  assert.equal(setResult.isError, undefined);
  const getResult = await client.callTool({ name: 'kinEdu_get_agent_state', arguments: { key } });
  const body = toolJson(getResult);
  assert.deepEqual(body.value, { a: 1 });
});

test('9. kinEdu_create_curation_run', async () => {
  const client = await connectClient({ Authorization: `Bearer ${env.mcpAuthSecret}` });
  const result = await client.callTool({ name: 'kinEdu_create_curation_run', arguments: { topics: ['Teste MCP'] } });
  const body = toolJson(result);
  assert.ok(body.id);
  createdRunIds.push(body.id);
});

test('10. kinEdu_create_candidate respeita dedup e a regra dos 10 anos', async () => {
  const client = await connectClient({ Authorization: `Bearer ${env.mcpAuthSecret}` });
  const runResult = await client.callTool({ name: 'kinEdu_create_curation_run', arguments: { topics: ['Teste MCP'] } });
  const run = toolJson(runResult);
  createdRunIds.push(run.id);

  const doi = `10.9999/mcp-dedup-test.${Date.now()}`;
  const first = await client.callTool({ name: 'kinEdu_create_candidate', arguments: { run_id: run.id, title: 'Candidato MCP', authors: 'Autor', doi } });
  const firstBody = toolJson(first);
  assert.equal(firstBody.created, true);
  createdCandidateIds.push(firstBody.candidate.id);

  const second = await client.callTool({ name: 'kinEdu_create_candidate', arguments: { run_id: run.id, title: 'Outro título', authors: 'X', doi } });
  const secondBody = toolJson(second);
  assert.equal(secondBody.duplicate, true);

  const old = await client.callTool({ name: 'kinEdu_create_candidate', arguments: { run_id: run.id, title: 'Estudo antigo', authors: 'Y', doi: `10.9999/old.${Date.now()}`, published_at: '2001-01-01' } });
  const oldBody = toolJson(old);
  assert.equal(oldBody.candidate.status, 'rejected');
  createdCandidateIds.push(oldBody.candidate.id);
});

test('11. MCP -> tentativa de aprovação é BLOQUEADA (não é um valor de status válido)', async () => {
  const client = await connectClient({ Authorization: `Bearer ${env.mcpAuthSecret}` });
  const runResult = await client.callTool({ name: 'kinEdu_create_curation_run', arguments: { topics: ['Teste MCP'] } });
  const run = toolJson(runResult);
  createdRunIds.push(run.id);
  const candResult = await client.callTool({ name: 'kinEdu_create_candidate', arguments: { run_id: run.id, title: 'Candidato para bloqueio', authors: 'Z', doi: `10.9999/block.${Date.now()}` } });
  const cand = toolJson(candResult).candidate;
  createdCandidateIds.push(cand.id);

  // callTool doesn't reject for a schema validation failure — it resolves
  // with isError:true and the validation message in content[0].text
  // (confirmed against the SDK's actual behavior, not assumed).
  const approveResult = await client.callTool({ name: 'kinEdu_update_candidate_status', arguments: { candidate_id: cand.id, status: 'approved' } });
  assert.equal(approveResult.isError, true);
  assert.match(approveResult.content[0].text, /Invalid|invalid/);
});

test('12. MCP -> tentativa de publicação é BLOQUEADA', async () => {
  const client = await connectClient({ Authorization: `Bearer ${env.mcpAuthSecret}` });
  const runResult = await client.callTool({ name: 'kinEdu_create_curation_run', arguments: { topics: ['Teste MCP'] } });
  const run = toolJson(runResult);
  createdRunIds.push(run.id);
  const candResult = await client.callTool({ name: 'kinEdu_create_candidate', arguments: { run_id: run.id, title: 'Candidato para bloqueio 2', authors: 'W', doi: `10.9999/block2.${Date.now()}` } });
  const cand = toolJson(candResult).candidate;
  createdCandidateIds.push(cand.id);

  const publishResult = await client.callTool({ name: 'kinEdu_update_candidate_status', arguments: { candidate_id: cand.id, status: 'published' } });
  assert.equal(publishResult.isError, true);
  assert.match(publishResult.content[0].text, /Invalid|invalid/);
});

test('13. payload inválido é rejeitado com erro claro', async () => {
  const client = await connectClient({ Authorization: `Bearer ${env.mcpAuthSecret}` });
  const result = await client.callTool({ name: 'kinEdu_create_candidate', arguments: { run_id: '00000000-0000-0000-0000-000000000000', title: '' } });
  assert.equal(result.isError, true);
});

test('14. acesso sem autenticação continua bloqueado (repetido, ponto de verificação final)', async () => {
  await assert.rejects(() => connectClient({ Authorization: 'Bearer ' }));
});
