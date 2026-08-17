# KinEdu Agent API

API isolada para o agente pesquisador científico consultar dados reais da plataforma e enviar candidatos a artigo para revisão humana. Não expõe nem permite nenhum caminho de publicação automática.

```
AGENTE  →  /api/agent/*  (rotas finas, backend/src/routes/agent.js)
        →  services/agent/*.js  (regras de negócio + SQL, backend/src/services/agent/)
        →  PostgreSQL
```

Totalmente isolada dos routers públicos (`/api/articles`, `/api/search`, etc., usados pelo frontend) e da lógica do frontend — nenhum dos dois se importa ou depende do outro.

## Autenticação

Uma única credencial estática, definida em `KINEDU_AGENT_API_KEY` (variável de ambiente, nunca commitada — ver `.env.example`). Envie em todo request:

```
Authorization: Bearer <KINEDU_AGENT_API_KEY>
```

A chave é comparada com `crypto.timingSafeEqual` sobre o hash SHA-256 de ambos os lados (evita timing attack e evita o erro de comparar buffers de tamanhos diferentes). Se `KINEDU_AGENT_API_KEY` não estiver definida, toda a API do agente responde `503 agent_api_disabled` — o servidor não recusa subir, só desliga esse conjunto de rotas.

**Por que uma API key estática e não OAuth/JWT**: há exatamente um chamador confiável (o agente, operado pela mesma pessoa que opera este backend). Um segredo rotacionável comparado de forma seguro é proporcional a esse risco. Token de curta duração / JWT com endpoint de troca é o próximo passo natural quando existir mais de um chamador ou um cenário real de comprometimento a conter — não implementado agora por ser complexidade desproporcional ao problema atual.

Gerar uma chave nova:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Limites e proteções

- **Rate limit**: 120 requisições/minuto por processo (janela fixa, em memória — reinicia com o processo, não coordena entre múltiplas instâncias). Excedido → `429` com header `Retry-After`.
- **Log de auditoria**: toda chamada autenticada grava uma linha em `agent_audit_log` (endpoint, método, operação, resultado, quantidade de registros, run_id quando aplicável, status HTTP, erro). Nunca grava a API key, senha, ou corpo da requisição. Chamadas rejeitadas por autenticação ou rate limit **não** geram linha no `agent_audit_log` (acontecem antes desse middleware) — ficam registradas no log geral de requisições do servidor (stdout, formato JSON estruturado), que cobre 100% do tráfego HTTP.
- **Validação de entrada**: todo POST/PATCH valida formato de DOI, PMID, datas e enums antes de tocar o banco.
- **SQL injection**: todas as queries usam parâmetros posicionados (`$1, $2, ...`) via `pg` — nunca concatenação de string vinda de input do usuário.

## READ — leitura

### `GET /api/agent/articles`
Query params: `category` (slug), `topic` (alias de category), `date_from`, `date_to` (YYYY-MM-DD), `status`, `study_type`, `page`, `page_size` (máx. 100).
Retorna: `{ total, page, pageSize, articles: [{ id, title, title_pt, authors, doi, pmid, journal, published_at, study_type, status, category_name, category_slug, tags }] }`.

### `GET /api/agent/categories`
Retorna: `{ categories: [{ id, name, slug, article_count }] }`.

### `GET /api/agent/search-statistics`
Query params: `period` (`7d`|`30d`|`90d`|`12m`, padrão `30d`) ou `from`+`to` (YYYY-MM-DD). `limit` (padrão 100, máx 500).
Retorna, por termo (agrupado por `lower(query)` — **não** é agrupamento semântico, ver seção abaixo): `count` no período, `first_seen_in_period`/`last_seen_in_period`, e `first_seen_ever`/`last_seen_ever` (todo o histórico).

### `GET /api/agent/search-trends`
Query params: `topic` (nome ou slug de categoria; omitido = todas), `period`.
Compara o período pedido com o período imediatamente anterior de mesma duração. `variation_pct = (atual - anterior) / anterior * 100`. Quando o período anterior tem zero ocorrências, `variation_pct` é `null` e `trend` é `"insufficient_data"` — **nunca** inventamos uma tendência a partir de uma divisão por zero.

### `GET /api/agent/article-statistics`
Query params opcionais: `category`, `topic`, `from`, `to`.
Retorna total, por categoria, por ano, por tipo de estudo, contagem publicada nos últimos 10 anos (usa `minimumPublicationDate()`, nunca um ano fixo), top 5 mais e 5 menos visualizados.

### `GET /api/agent/content-gaps`
Query params: `period`.
Cruza demanda (buscas) × cobertura (artigos) × interesse (visualizações) por categoria.
**Fórmula (fixa, documentada aqui — mudança de fórmula exige atualizar este arquivo)**:
```
gap_score = searches / (articles + 1)
prioridade: gap_score >= 5 → "alta" | >= 1 → "media" | < 1 → "baixa"
```
O "+1" evita divisão por zero para categorias sem nenhum artigo.

### Sobre agrupamento de temas (item 9)
Nada nesta fase faz agrupamento semântico ("hipertrofia" = "muscle growth" = "crescimento muscular"). O único mecanismo disponível é correspondência por substring (`ILIKE '%nome da categoria%'`) entre o texto da busca e o nome de uma categoria — documentado em cada endpoint que o usa (`matching_method` no corpo da resposta). Agrupamento semântico real é trabalho do próprio agente, usando os dados brutos que esses endpoints expõem.

## curation_runs

### `POST /api/agent/curation-runs`
Body: `{ topics: string[], search_terms?: string[], sources?: string[] }`.
Cria uma execução com `status: "running"`.

### `GET /api/agent/curation-runs` / `GET /api/agent/curation-runs/:id`
Lista (filtro `status`, paginação) ou detalha uma execução, incluindo `candidates_by_status`.

### `PATCH /api/agent/curation-runs/:id`
Body: qualquer subconjunto de `status, finished_at, found_count, validated_count, accepted_count, rejected_count, duplicate_count, candidate_count, published_count, log, error_log`.

## curation_candidates

### Fluxo de status
```
discovered → validating → validated → pending_review → [HUMANO] → approved → published
                                                       ↘ rejected / duplicate / invalid (a qualquer momento pré-revisão)
```
O agente pode escrever qualquer um destes: `discovered, validating, validated, pending_review, rejected, duplicate, invalid`.
O agente **nunca** pode escrever `approved` ou `published` — bloqueado em dois pontos independentes:
1. `PATCH /candidates/:id/status` rejeita com `403` se o `status` pedido não estiver na lista de valores permitidos ao agente (a checagem acontece **antes** de qualquer leitura ao banco).
2. Mesmo para um status permitido, se o candidato **já** estiver em `approved`/`published` (um humano já mexeu nele), qualquer tentativa do agente de alterá-lo retorna `403` — o agente não pode "desfazer" uma decisão humana.

### `POST /api/agent/candidates`
Body mínimo: `{ run_id, title }`. Campos opcionais: `title_pt, authors, journal, doi, pmid, published_at, abstract, summary_pt, study_type, methodology, population, main_results, conclusion, practical_application, limitations, source, topic, tags, payload_json`.

Ordem de validação:
1. Campos obrigatórios e formato (DOI, PMID, data, `study_type`) → `400` se inválido.
2. **Duplicidade** (nesta ordem: DOI → PMID → título+ano), contra `articles` **e** contra `curation_candidates` existentes. Se encontrado: responde `200 { created: false, duplicate: true, matched_in, matched_by, matched }` — **não** cria linha nova.
3. **Regra dos 10 anos**: se `published_at` estiver fora da janela (`minimumPublicationDate(10)`, recalculada a cada chamada — nunca um ano fixo como 2016), o candidato **é criado**, mas já como `status: "rejected"` com `rejection_reason` explicando o motivo — preserva o registro para auditoria em vez de simplesmente recusar a requisição.
4. Caso contrário: cria com `status: "discovered"`.

### `GET /api/agent/candidates` / `GET /api/agent/candidates/:id`
Lista (filtros `status`, `run_id`, `topic`, paginação) ou detalha um candidato.

### `PATCH /api/agent/candidates/:id/status`
Body: `{ status, rejection_reason? }`. Ver regras acima.

## agent_state

Key/value simples e persistente para as tarefas agendadas (A/B/C/D) trocarem informação entre execuções independentes, sem depender de memória de sessão.

- `PUT /api/agent/state/:key` — body `{ value: <qualquer JSON> }`. Upsert.
- `GET /api/agent/state/:key` — `404` se a chave nunca foi escrita.
- `GET /api/agent/state` — lista todas as chaves existentes (só chave + `updated_at`, não o valor).

## Como as tarefas A/B/C devem usar isto

- **Tarefa A (Análise e planejamento)**: `GET /article-statistics`, `GET /content-gaps`, `GET /search-trends` → calcular prioridades → `PUT /state/priorities`.
- **Tarefa B (Pesquisa e preparação)**: `GET /state/priorities` → `POST /curation-runs` → para cada estudo encontrado (fora desta API — busca em fontes externas é responsabilidade do próprio agente, não desta integração) → `POST /candidates` → avançar cada um até `pending_review` via `PATCH /candidates/:id/status`.
- **Tarefa C (Monitoramento)**: `GET /article-statistics`, `GET /search-statistics` → `PUT /state/diagnostic` com o resultado.
- **Tarefa D (Publicação)**: **nenhum endpoint desta API permite publicação.** Nesta fase, Tarefa D não tem nada a chamar aqui — candidatos ficam em `pending_review` até um humano agir por outro caminho (ainda não construído — ver Limitações).

## Exemplos

```bash
# Listar artigos de uma categoria
curl -H "Authorization: Bearer $KINEDU_AGENT_API_KEY" \
  "https://<host>/api/agent/articles?category=hipertrofia-muscular"

# Criar uma execução
curl -X POST -H "Authorization: Bearer $KINEDU_AGENT_API_KEY" -H "Content-Type: application/json" \
  -d '{"topics":["Hipertrofia Muscular"],"search_terms":["hypertrophy resistance training"],"sources":["crossref"]}' \
  "https://<host>/api/agent/curation-runs"

# Criar um candidato
curl -X POST -H "Authorization: Bearer $KINEDU_AGENT_API_KEY" -H "Content-Type: application/json" \
  -d '{"run_id":"<uuid>","title":"...","authors":"...","doi":"10.xxxx/yyyy","published_at":"2023-01-01"}' \
  "https://<host>/api/agent/candidates"
```

## Erros

| Status | Situação |
|---|---|
| 400 `validation_error` | Campo obrigatório ausente ou formato inválido (DOI, PMID, data, enum) |
| 401 `unauthorized` | `Authorization` ausente ou chave incorreta |
| 403 `forbidden_transition` | Tentativa de definir `approved`/`published`, ou de alterar um candidato já revisado por humano |
| 404 `not_found` | Recurso (run, candidato, chave de estado) não existe |
| 429 `rate_limited` | Mais de 120 chamadas/minuto |
| 500 `internal_error` | Erro inesperado — checar `agent_audit_log` e o log geral do servidor |

## Limitações desta fase (não escondidas)

- Sem endpoint de publicação — nem deveria existir ainda; a promoção de `pending_review` para `approved`/`published` não tem nenhuma interface construída (nem admin, nem CLI). O candidato fica visível via `GET /candidates?status=pending_review`, mas a ação humana de aprovar precisa ser feita hoje via acesso direto ao banco.
- Rate limiter é em memória, por processo — não sobrevive a um restart nem coordena múltiplas instâncias.
- Testes automatizados (`backend/test/agent.test.js`) rodam contra o banco de desenvolvimento real, não um banco de teste isolado — cada teste limpa o que cria, mas não há isolamento de transação entre eles.
- Agrupamento de "tema" é um heurístico simples (substring contra nome de categoria) em todos os endpoints que o usam — não é semântico.
