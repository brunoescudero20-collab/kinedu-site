# KinEdu Remote MCP Server

Servidor MCP remoto (Model Context Protocol, transporte Streamable HTTP) que expõe ao Claude/Cowork exatamente os recursos que o agente pesquisador tem permissão de usar — nada mais.

```
Claude/Cowork → Remote MCP KinEdu (/mcp) → services/agent/*.js → PostgreSQL
```

Camada isolada em `backend/src/mcp/`, montada no mesmo processo Express que já serve `/api/*` (não é um serviço separado). Nenhuma ferramenta MCP implementa lógica de negócio própria — cada uma chama a mesma função de service que `routes/agent.js` já usa (ver `docs/agent-api.md`), então tudo que vale para a Agent API (regra dos 10 anos, dedup, fórmula de content-gaps, etc.) vale aqui sem duplicação.

## Status real desta entrega

- [x] **Implementado no código** — `backend/src/mcp/`, 13 ferramentas, autenticação, rate limit, log de auditoria, health check.
- [x] **Funcionando localmente** — testado de ponta a ponta neste ambiente (`http://localhost:3001/mcp`) com o `Client` oficial do SDK MCP: conexão, autenticação, as 13 ferramentas, e os dois bloqueios de segurança (aprovação e publicação) todos verificados.
- [ ] **Publicado na internet** — **não está.** Este backend roda hoje só no container efêmero desta sessão (`localhost:3001`), que não é acessível de fora. Não existe URL pública.
- [ ] **Pronto para conectar ao Claude/Cowork** — **ainda não**, exatamente por isso: um MCP remoto precisa de uma URL HTTPS pública, e não existe uma hoje. Ver "Deploy necessário" abaixo.

Nenhum desses quatro estados foi inflado — os dois primeiros são reais e testados, os dois últimos exigem uma ação de infraestrutura que ainda não foi feita (hospedar o backend publicamente), documentada abaixo.

## Autenticação

Bearer token estático, `MCP_AUTH_SECRET` — mesmo padrão da Agent API (`KINEDU_AGENT_API_KEY`, ver `docs/agent-api.md`), porém **uma credencial própria e diferente**, para que vazar uma não exponha a outra.

```
Authorization: Bearer <MCP_AUTH_SECRET>
```

**Por que Bearer token e não OAuth**: a especificação do MCP recomenda OAuth 2.1 para servidores remotos, e o SDK oferece suporte a isso do lado do cliente. Mas rodar um authorization server completo (registro de cliente, emissão/renovação de token, tela de consentimento) só se paga quando existe mais de um chamador ou chamadores não totalmente confiáveis para conter. Aqui há exatamente um chamador pretendido — um conector custom do Claude/Cowork, configurado pela mesma pessoa que opera este backend — alcançável apenas com um segredo que ela mesma gera e guarda. Se um segundo chamador menos confiável precisar de acesso no futuro, esse é o momento de implementar OAuth de verdade, não de esticar mais este token.

Se `MCP_AUTH_SECRET` não estiver definida, `/mcp` responde `503` em vez de derrubar o servidor inteiro.

Gerar uma chave:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Transporte

Streamable HTTP (a transport atual recomendada pela spec MCP para servidores remotos, sucessora do SSE puro), stateful: a primeira requisição (`initialize`) abre uma sessão identificada por um header `mcp-session-id`, reaproveitado nas chamadas seguintes. Sessões vivem em memória, por processo — não sobrevivem a um restart do backend nem coordenam múltiplas instâncias (mesma limitação documentada para os rate limiters).

## Health check

`GET /mcp/health` — sem autenticação (mesma convenção do `GET /api/health` já existente), nunca retorna segredos:
```json
{ "ok": true, "server": "kinedu", "version": "1.0.0", "mcp_configured": true, "database_connected": true, "active_sessions": 0 }
```

## Ferramentas

Todas fazem apenas leitura, exceto as três marcadas ESCRITA — e mesmo essas só escrevem em `agent_state`, `curation_runs` ou `curation_candidates`, nunca em `articles`/`categories`/`users`.

| Ferramenta | Tipo | Reutiliza |
|---|---|---|
| `kinEdu_get_articles` | leitura | `articlesService.listArticles` |
| `kinEdu_get_categories` | leitura | `articlesService.listCategoriesWithCounts` |
| `kinEdu_get_search_statistics` | leitura | `searchStatsService.getSearchStatistics` |
| `kinEdu_get_search_trends` | leitura | `searchStatsService.getSearchTrends` |
| `kinEdu_get_article_statistics` | leitura | `articleStatisticsService.getArticleStatistics` |
| `kinEdu_get_content_gaps` | leitura | `contentGapsService.getContentGaps` |
| `kinEdu_get_curation_runs` | leitura | `curationService.listRuns` |
| `kinEdu_get_candidates` | leitura | `curationService.listCandidates` |
| `kinEdu_get_agent_state` | leitura | `stateService.getState` / `listStateKeys` |
| `kinEdu_update_agent_state` | **escrita** | `stateService.setState` |
| `kinEdu_create_curation_run` | **escrita** | `curationService.createRun` |
| `kinEdu_create_candidate` | **escrita** | `curationService.createCandidate` |
| `kinEdu_update_candidate_status` | **escrita** | `curationService.updateCandidateStatus` |

### Sobre `kinEdu_update_candidate_status`

Não estava na lista numerada original do pedido, mas foi adicionada porque o próprio fluxo descrito logo abaixo dela — `DISCOVERED → VALIDATING → VALIDATED → PENDING_REVIEW` — não tem como acontecer sem alguma ferramenta que avance o status. Sem ela, `kinEdu_create_candidate` só conseguiria produzir candidatos presos para sempre em `discovered`, e nenhum chegaria a um revisor humano. Reaproveita `curationService.updateCandidateStatus`, que já bloqueia `approved`/`published` (usado por `routes/agent.js`) — e esta ferramenta adiciona um segundo bloqueio independente: o schema Zod do parâmetro `status` é construído diretamente a partir de `AGENT_WRITABLE_STATUSES`, então `"approved"` e `"published"` **não existem como valor aceitável**, nem chegam a ser validados pelo service — o pedido é rejeitado antes de qualquer código de negócio rodar.

### Parâmetros (resumo — detalhes completos em `docs/agent-api.md`, que cada tool espelha)

- `kinEdu_get_articles`: `category`, `topic`, `date_from`/`date_to` (YYYY-MM-DD), `status`, `study_type`, `page`, `page_size`.
- `kinEdu_get_search_statistics` / `kinEdu_get_search_trends` / `kinEdu_get_content_gaps`: `period` (`7d`|`30d`|`90d`|`12m`) ou `from`/`to` personalizados.
- `kinEdu_get_candidates`: `status`, `run_id`, `topic`, `category`, `study_type`, `year`, `page`, `page_size`.
- `kinEdu_create_candidate`: `run_id` (obrigatório), `title` (obrigatório), demais campos opcionais — mesma validação, mesma checagem de duplicidade (DOI → PMID → título+ano) e mesma regra dos 10 anos da Agent API.
- `kinEdu_update_candidate_status`: `candidate_id`, `status` (um de `discovered|validating|validated|pending_review|rejected|duplicate|invalid` — literalmente os únicos valores aceitos pelo schema), `rejection_reason` opcional.

Todo parâmetro de texto tem um limite máximo de tamanho (títulos até 500 caracteres, campos longos como resumo/metodologia até 3000-5000) — nenhuma ferramenta aceita um payload arbitrariamente grande.

### Respostas e erros

Toda ferramenta retorna `{ content: [{ type: "text", text: "<JSON>" }] }`. Em erro de negócio (ex.: candidato não encontrado), retorna `isError: true` com a mensagem no mesmo formato. Erro de validação de schema (tipo errado, enum inválido, string maior que o limite) também retorna `isError: true`, com a mensagem de validação do Zod — nunca lança uma exceção que derruba a sessão.

## Permissões (resumo do que este MCP pode e não pode)

**LER**: artigos, categorias, estatísticas de busca, tendências, estatísticas de artigos, lacunas de conteúdo, execuções de curadoria, candidatos, estado do agente.

**ESCREVER**: `agent_state`, `curation_runs`, `curation_candidates` — e mesmo em `curation_candidates`, só até `pending_review`.

**NUNCA**: aprovar, rejeitar (via ação humana — o agente pode marcar `rejected` como parte de sua própria triagem, mas isso é diferente da rejeição humana registrada em `candidate_review_log`), publicar, excluir ou modificar artigos existentes, ou qualquer ação em `/api/admin/*`. Não existe nenhuma ferramenta MCP com esses nomes ou esse efeito — verificado por teste automatizado, não é só uma regra de negócio checada em runtime.

## Registro de chamadas (auditoria)

Toda chamada de ferramenta grava uma linha em `agent_audit_log` (a mesma tabela que a Agent API usa), com `operation` prefixado `mcp:` (ex.: `mcp:kinEdu_create_candidate`) para diferenciar a origem. Nunca grava o `MCP_AUTH_SECRET`.

## Rate limiting

120 requisições/minuto por processo (mesmo mecanismo dos outros surfaces, `backend/src/utils/rateLimiter.js`) — em memória, reinicia com o processo.

## Segurança

- Entrada validada por schema Zod em toda ferramenta antes de qualquer chamada ao banco.
- Nenhuma ferramenta aceita SQL bruto, string de conexão de banco, ou qualquer forma de execução de código — todas chamam funções de service com queries parametrizadas já existentes.
- Nenhum segredo (chaves, senhas, tokens) é retornado por nenhuma ferramenta ou aparece em log.
- HTTPS é responsabilidade da camada de hospedagem/proxy reverso em produção — não implementado neste código (Node/Express não termina TLS sozinho tipicamente); ver "Deploy necessário".

## Como as tarefas A/B/C usam o MCP

Mesma divisão de `docs/agent-api.md`, agora via ferramentas MCP em vez de chamadas HTTP diretas à Agent API:

- **Tarefa A**: `kinEdu_get_article_statistics` + `kinEdu_get_content_gaps` + `kinEdu_get_search_trends` → `kinEdu_update_agent_state(key: "priorities", ...)`.
- **Tarefa B**: `kinEdu_get_agent_state(key: "priorities")` → `kinEdu_create_curation_run` → `kinEdu_create_candidate` (um por estudo encontrado, fora desta API) → `kinEdu_update_candidate_status` até `pending_review`.
- **Tarefa C**: `kinEdu_get_article_statistics` + `kinEdu_get_search_statistics` → `kinEdu_update_agent_state(key: "diagnostic", ...)`.
- **Tarefa D (Publicação)**: nenhuma ferramenta MCP permite isso. Candidatos ficam em `pending_review` até um humano agir em `#admin-curation` (`docs/admin-review.md`).

Cada tarefa é uma sessão independente — nunca depende de memória de uma execução anterior. Todo estado que precisa sobreviver entre tarefas vive em `agent_state` (via `kinEdu_get_agent_state`/`kinEdu_update_agent_state`) ou nas próprias tabelas de curadoria.

## Deploy necessário (não finja que já está pronto)

**Onde está hoje**: só neste sandbox efêmero, em `localhost:3001`. Nada aqui é público.

**O que falta para o Claude/Cowork conseguir conectar**:

1. Hospedar este backend Express (o processo inteiro — `/api/*`, `/mcp`, tudo junto, já que é um único app) em um serviço que aceite um processo Node de longa duração com HTTPS — ex.: Render, Railway, Fly.io. (Não dá para usar só Supabase aqui: Supabase hospeda Postgres + PostgREST + Edge Functions, mas não um processo Express arbitrário como este; seria uma reescrita, não um deploy.)
2. Um PostgreSQL acessível publicamente a partir desse host (pode ser o Postgres gerenciado do próprio provedor de hospedagem, ou um serviço de Postgres gerenciado à parte).
3. Variáveis de ambiente no novo host: `DATABASE_URL` (apontando para o Postgres público), `PORT`, `CORS_ORIGIN` (origem real do frontend, se também for publicado), `BCRYPT_ROUNDS`, `SESSION_SECRET`, `KINEDU_AGENT_API_KEY`, `MCP_AUTH_SECRET` — as três últimas com valores reais gerados para produção, nunca os valores usados neste ambiente de desenvolvimento.
4. Rodar as migrations (`npm run migrate`) contra o banco de produção antes do primeiro uso.
5. Confirmar HTTPS de fato ativo na URL pública (a maioria desses provedores já entrega isso automaticamente).

Nenhum desses passos foi executado nesta entrega — é hospedagem externa, decisão e custo do operador do projeto, não algo que se faz "por padrão" dentro deste ambiente de desenvolvimento.

## Claude Cowork setup

**Só possível depois do deploy acima.** Com uma URL pública em mãos (ex.: `https://kinedu-api.exemplo.com`):

1. No Claude/Cowork, abrir as configurações de conectores e escolher "Add custom connector" (ou equivalente na versão em uso).
2. URL do servidor: `https://<seu-host>/mcp`.
3. Autenticação: cabeçalho `Authorization: Bearer <MCP_AUTH_SECRET>` (o valor gerado para produção no passo 3 do deploy) — usar o mecanismo de header/token que a UI do conector oferecer, já que este servidor usa Bearer token e não OAuth (ver "Autenticação" acima).
4. Salvar e testar a conexão — o conector deve listar as 13 ferramentas descritas acima.
5. Verificar rapidamente com uma chamada de leitura (ex.: pedir para o Claude listar as categorias do KinEdu) antes de confiar em chamadas de escrita.

## Testar localmente

```bash
cd backend
npm test              # inclui backend/test/mcp.test.js (16 testes)
```

Ou manualmente com o `Client` do próprio SDK MCP (é como os testes automatizados fazem, e como um conector real se comportaria):
```js
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const transport = new StreamableHTTPClientTransport(new URL('http://localhost:3001/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${process.env.MCP_AUTH_SECRET}` } },
});
const client = new Client({ name: 'test', version: '1.0.0' });
await client.connect(transport);
const result = await client.callTool({ name: 'kinEdu_get_categories', arguments: {} });
console.log(result.content[0].text);
```

## Limitações desta fase (não escondidas)

- **Não publicado publicamente** — ver "Deploy necessário".
- Autenticação por Bearer token estático, não OAuth — proporcional ao único chamador confiável desta fase (justificado acima); reavaliar se isso mudar.
- Sessões e rate limit em memória, por processo — não sobrevivem a restart nem coordenam múltiplas instâncias.
- `kinEdu_update_candidate_status` foi adicionada além da lista original — necessária para o fluxo funcionar, mas é uma decisão de implementação, não algo pedido literalmente; sinalizada aqui para revisão.
- Sem interface de aprovação/publicação a partir do MCP, por design — isso é o painel administrativo (`docs/admin-review.md`), que continua sendo o único caminho para `approved`/`published`.
