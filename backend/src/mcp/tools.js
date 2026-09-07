import { z } from 'zod';
import * as articlesService from '../services/agent/articlesService.js';
import * as searchStatsService from '../services/agent/searchStatsService.js';
import * as articleStatisticsService from '../services/agent/articleStatisticsService.js';
import * as contentGapsService from '../services/agent/contentGapsService.js';
import * as curationService from '../services/agent/curationService.js';
import * as stateService from '../services/agent/stateService.js';
import { logMcpToolCall } from './auditLog.js';

// Every tool here is a thin wrapper around the exact same service function
// routes/agent.js already calls — none of the domain logic (dedup, the
// 10-year rule, trend/gap math) is reimplemented. See docs/agent-api.md
// for what each underlying service actually does.

const PERIOD = z.enum(['7d', '30d', '90d', '12m']).optional();
const DATE_STR = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato YYYY-MM-DD').optional();
const PAGE = z.number().int().min(1).optional();
const PAGE_SIZE = z.number().int().min(1).max(100).optional();
// Short free-text fields (titles, names) vs. long ones (abstracts,
// methodology) get different caps — both exist purely so a misbehaving
// caller can't stuff megabytes into a single parameter (item 7 of the
// spec: "limitar tamanho dos parâmetros").
const SHORT_TEXT = (max) => z.string().max(max).optional();
const LONG_TEXT = (max) => z.string().max(max).optional();

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
function fail(message, extra) {
  return { content: [{ type: 'text', text: JSON.stringify({ error: 'tool_error', message, ...extra }, null, 2) }], isError: true };
}

async function withAudit(toolName, runId, fn) {
  try {
    const result = await fn();
    logMcpToolCall({ tool: toolName, result: 'success', recordCount: result?.recordCount, runId });
    return ok(result?.data ?? result);
  } catch (err) {
    logMcpToolCall({ tool: toolName, result: 'error', runId, error: err.message });
    return fail(err.message);
  }
}

export function registerTools(server) {
  server.registerTool(
    'kinEdu_get_articles',
    {
      title: 'Listar artigos do KinEdu',
      description: 'Consulta os artigos reais publicados no KinEdu, com paginação e filtros por categoria/tema, status, tipo de estudo e período de publicação.',
      inputSchema: {
        category: SHORT_TEXT(100),
        topic: SHORT_TEXT(100),
        date_from: DATE_STR,
        date_to: DATE_STR,
        status: z.enum(['pending', 'approved', 'archived']).optional(),
        study_type: SHORT_TEXT(50),
        page: PAGE,
        page_size: PAGE_SIZE,
      },
    },
    (args) => withAudit('kinEdu_get_articles', undefined, () => articlesService.listArticles({
      category: args.category || args.topic, dateFrom: args.date_from, dateTo: args.date_to,
      status: args.status, studyType: args.study_type, page: args.page, pageSize: args.page_size,
    })),
  );

  server.registerTool(
    'kinEdu_get_categories',
    {
      title: 'Listar categorias do KinEdu',
      description: 'Retorna todas as categorias com id, nome, slug e quantidade real de artigos aprovados em cada uma.',
      inputSchema: {},
    },
    () => withAudit('kinEdu_get_categories', undefined, async () => ({ categories: await articlesService.listCategoriesWithCounts() })),
  );

  server.registerTool(
    'kinEdu_get_search_statistics',
    {
      title: 'Estatísticas de busca',
      description: 'Termos mais pesquisados no KinEdu em um período (7d, 30d, 90d, 12m, ou from/to personalizado), com contagem real e primeira/última ocorrência. Nunca inventa números — reflete exatamente o que está em `searches`.',
      inputSchema: { period: PERIOD, from: DATE_STR, to: DATE_STR, limit: z.number().int().min(1).max(500).optional() },
    },
    (args) => withAudit('kinEdu_get_search_statistics', undefined, () => searchStatsService.getSearchStatistics(args)),
  );

  server.registerTool(
    'kinEdu_get_search_trends',
    {
      title: 'Tendência de busca por tema',
      description: 'Compara o volume de buscas do período atual com o período imediatamente anterior de mesma duração, por tema/categoria. Quando não há dados suficientes no período anterior, retorna trend="insufficient_data" em vez de uma tendência inventada.',
      inputSchema: { topic: SHORT_TEXT(100), period: PERIOD },
    },
    (args) => withAudit('kinEdu_get_search_trends', undefined, () => searchStatsService.getSearchTrends(args)),
  );

  server.registerTool(
    'kinEdu_get_article_statistics',
    {
      title: 'Estatísticas de artigos',
      description: 'Total de artigos, por categoria, por ano, por tipo de estudo, quantos foram publicados nos últimos 10 anos (janela recalculada dinamicamente, nunca um ano fixo), e os mais/menos visualizados.',
      inputSchema: { category: SHORT_TEXT(100), topic: SHORT_TEXT(100), from: DATE_STR, to: DATE_STR },
    },
    (args) => withAudit('kinEdu_get_article_statistics', undefined, () => articleStatisticsService.getArticleStatistics(args)),
  );

  server.registerTool(
    'kinEdu_get_content_gaps',
    {
      title: 'Lacunas de conteúdo',
      description: 'Cruza demanda (buscas) x cobertura (artigos) x interesse (visualizações) por categoria, usando a mesma fórmula documentada em docs/agent-api.md (gap_score = searches / (articles + 1)). Não recalcula nada por conta própria — chama contentGapsService diretamente.',
      inputSchema: { period: PERIOD },
    },
    (args) => withAudit('kinEdu_get_content_gaps', undefined, () => contentGapsService.getContentGaps(args)),
  );

  server.registerTool(
    'kinEdu_get_curation_runs',
    {
      title: 'Consultar execuções de curadoria',
      description: 'Lista execuções (runs) anteriores do agente de curadoria, com filtro opcional por status e paginação.',
      inputSchema: { status: z.enum(['running', 'completed', 'failed']).optional(), page: PAGE, page_size: PAGE_SIZE },
    },
    (args) => withAudit('kinEdu_get_curation_runs', undefined, () => curationService.listRuns(args)),
  );

  server.registerTool(
    'kinEdu_get_candidates',
    {
      title: 'Consultar candidatos a artigo',
      description: 'Lista candidatos a artigo científico encontrados pelo agente, filtráveis por status (discovered, validating, validated, pending_review, approved, published, rejected, duplicate, invalid), tema/categoria, tipo de estudo, ano e período de descoberta.',
      inputSchema: {
        status: z.enum(['discovered', 'validating', 'validated', 'pending_review', 'approved', 'published', 'rejected', 'duplicate', 'invalid']).optional(),
        run_id: z.string().uuid().optional(),
        topic: SHORT_TEXT(100),
        category: SHORT_TEXT(100),
        study_type: SHORT_TEXT(50),
        year: z.number().int().min(1900).max(2100).optional(),
        page: PAGE,
        page_size: PAGE_SIZE,
      },
    },
    (args) => withAudit('kinEdu_get_candidates', args.run_id, () => curationService.listCandidates({
      status: args.status, runId: args.run_id, topic: args.topic, category: args.category,
      studyType: args.study_type, year: args.year, page: args.page, pageSize: args.page_size,
    })),
  );

  server.registerTool(
    'kinEdu_get_agent_state',
    {
      title: 'Consultar estado do agente',
      description: 'Lê o estado persistente compartilhado entre as tarefas agendadas do agente (ex.: "priorities" gravado pela Tarefa A, "diagnostic" gravado pela Tarefa C). Sem `key`, lista todas as chaves existentes. Nunca depende de memória de sessão — é a forma correta de uma tarefa recuperar contexto de uma execução anterior independente.',
      inputSchema: { key: z.string().max(100).optional() },
    },
    (args) => withAudit('kinEdu_get_agent_state', undefined, async () => {
      if (!args.key) return { keys: await stateService.listStateKeys() };
      const state = await stateService.getState(args.key);
      if (!state) throw new Error(`Chave de estado '${args.key}' não encontrada.`);
      return state;
    }),
  );

  server.registerTool(
    'kinEdu_update_agent_state',
    {
      title: 'Atualizar estado do agente',
      description: 'Grava (upsert) um valor na chave indicada do estado compartilhado do agente. Só escreve em agent_state — nunca em articles, categories ou qualquer outra tabela da plataforma.',
      inputSchema: {
        key: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/, 'Use apenas letras, números, "-" e "_"'),
        value: z.unknown(),
      },
    },
    (args) => withAudit('kinEdu_update_agent_state', undefined, () => {
      const serialized = JSON.stringify(args.value ?? {});
      if (serialized.length > 50_000) throw new Error('Valor excede o limite de 50KB para agent_state.');
      return stateService.setState(args.key, args.value ?? {});
    }),
  );

  server.registerTool(
    'kinEdu_create_curation_run',
    {
      title: 'Criar execução de curadoria',
      description: 'Registra uma nova execução (run) do agente de curadoria, com os temas, termos de busca e fontes que serão usados. Não pesquisa nada por conta própria — é só o registro da execução.',
      inputSchema: {
        topics: z.array(z.string().max(200)).max(20).optional(),
        search_terms: z.array(z.string().max(200)).max(50).optional(),
        sources: z.array(z.string().max(100)).max(20).optional(),
      },
    },
    (args) => withAudit('kinEdu_create_curation_run', undefined, async () => {
      const run = await curationService.createRun({ topics: args.topics, searchTerms: args.search_terms, sources: args.sources });
      return { data: run, recordCount: 1 };
    }),
  );

  server.registerTool(
    'kinEdu_create_candidate',
    {
      title: 'Criar candidato a artigo',
      description:
        'Envia um artigo candidato para a fila de revisão. Aplica, nesta ordem, exatamente as mesmas regras da Agent API: validação de campos e formato (DOI/PMID/data), verificação de duplicidade (DOI → PMID → título+ano) contra artigos já publicados e candidatos existentes, e a regra dos 10 anos (candidatos fora da janela são criados já como "rejected", preservados para auditoria em vez de recusados silenciosamente). Sempre entra com status "discovered" — nunca "approved" ou "published".',
      inputSchema: {
        run_id: z.string().uuid(),
        title: z.string().min(1).max(500),
        title_pt: SHORT_TEXT(500),
        authors: SHORT_TEXT(500),
        journal: SHORT_TEXT(300),
        doi: SHORT_TEXT(200),
        pmid: SHORT_TEXT(50),
        published_at: DATE_STR,
        abstract: LONG_TEXT(5000),
        summary_pt: LONG_TEXT(5000),
        study_type: z.enum(['meta_analysis', 'systematic_review', 'rct', 'cohort', 'cross_sectional', 'case_control', 'narrative_review', 'position_stand', 'case_report', 'pilot_study', 'other']).optional(),
        methodology: LONG_TEXT(3000),
        population: LONG_TEXT(1000),
        main_results: LONG_TEXT(3000),
        conclusion: LONG_TEXT(2000),
        practical_application: LONG_TEXT(2000),
        limitations: LONG_TEXT(2000),
        source: SHORT_TEXT(100),
        topic: SHORT_TEXT(200),
        tags: z.array(z.string().max(100)).max(20).optional(),
      },
    },
    (args) => withAudit('kinEdu_create_candidate', args.run_id, async () => {
      const result = await curationService.createCandidate(args);
      if (result.errors) throw new Error(result.errors.join(' '));
      return { data: result, recordCount: result.created ? 1 : 0 };
    }),
  );

  // Not in the original numbered tool list, but necessary for the flow the
  // spec itself describes underneath it (DISCOVERED -> ... -> PENDING_REVIEW
  // via the agent): without a way to advance status, kinEdu_create_candidate
  // could only ever produce candidates stuck at "discovered", and no
  // candidate would ever reach a human reviewer. Reuses
  // curationService.updateCandidateStatus, which already hard-blocks
  // approved/published — this tool adds a second, independent block at the
  // schema level: the zod enum below is built directly from
  // AGENT_WRITABLE_STATUSES, so "approved"/"published" are not even
  // expressible as input, not just rejected at runtime.
  server.registerTool(
    'kinEdu_update_candidate_status',
    {
      title: 'Atualizar status de um candidato',
      description:
        `Avança um candidato pelo fluxo permitido ao agente: ${curationService.AGENT_WRITABLE_STATUSES.join(' -> ')}. ` +
        'Este MCP NUNCA pode definir "approved" ou "published" — essas transições são exclusivas do painel administrativo humano (#admin-curation) e nem sequer existem como valor aceito por esta ferramenta.',
      inputSchema: {
        candidate_id: z.string().uuid(),
        status: z.enum(curationService.AGENT_WRITABLE_STATUSES),
        rejection_reason: SHORT_TEXT(1000),
      },
    },
    (args) => withAudit('kinEdu_update_candidate_status', undefined, async () => {
      const result = await curationService.updateCandidateStatus(args.candidate_id, args.status, { rejectionReason: args.rejection_reason });
      if (result.notFound) throw new Error('Candidato não encontrado.');
      return { data: result.candidate, recordCount: 1 };
    }),
  );
}
