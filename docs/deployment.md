# Deploy do KinEdu em produção

Este documento prepara o projeto para deploy. **Nenhum deploy foi feito** — isso é uma ação deliberada do operador do projeto na plataforma de hosting, não algo que acontece "por padrão" a partir deste repositório.

```
GitHub → Render (Node/Express) → PostgreSQL (Render) → HTTPS público → /mcp → Claude/Cowork
```

## 1. O que já foi auditado (fatos confirmados no código, não suposições)

- **Entrypoint**: `backend/src/server.js` (via `main: "src/server.js"` em `backend/package.json`).
- **Comando de start**: `npm start` → `node src/server.js`.
- **Comando de migrations**: `npm run migrate` → `node src/db/migrate.js` (idempotente — aplica só o que ainda não foi aplicado, rastreado em `schema_migrations`; cada migration roda dentro de uma transação).
- **Node**: testado com v22.22.2 neste ambiente; `backend/package.json` agora declara `"engines": { "node": ">=20.0.0" }`.
- **Frontend e backend no mesmo processo?** Antes desta etapa, não — o frontend rodava separado (`python -m http.server 8080`) do backend (`:3001`). Agora o próprio Express serve os 4 arquivos do frontend (`index.html`, `styles.css`, `script.js`, `api.js`) além de toda a API — um único processo, uma única origem. O setup local separado continua funcionando (nada foi removido), é só mais uma forma de servir, não uma substituição.
- **CORS**: já existia (`CORS_ORIGIN`, `backend/src/app.js`).
- **PORT**: já existia (`env.port`, padrão 3001) — em produção, a plataforma de hosting injeta o valor real.
- **Host**: antes desta etapa, `app.listen(env.port, callback)` sem host explícito. Corrigido para `app.listen(env.port, '0.0.0.0', callback)` — necessário para plataformas como Render/Railway/Fly.io rotearem tráfego externo corretamente.
- **Arquivos de produção existentes antes desta etapa**: nenhum (`render.yaml`, `railway.json`, `fly.toml`, `Procfile`, `Dockerfile` — nenhum existia).
- **Supabase**: nunca foi configurado neste projeto — só uma menção textual em `docs/mcp.md` explicando por que não serve para hospedar o processo Express. Nenhum código ou variável de ambiente relacionada existe.

## 2. Variáveis de ambiente

| Variável | Obrigatória? | O que é |
|---|---|---|
| `DATABASE_URL` | sim | String de conexão do PostgreSQL de produção. **Deve ser um banco dedicado de produção, nunca o banco de desenvolvimento/testes.** |
| `SESSION_SECRET` | recomendada | Assina os tokens de sessão do painel admin (`/api/admin/*`). Sem ela, um segredo aleatório é gerado a cada boot — login continua funcionando, mas toda sessão expira a cada restart do processo. |
| `KINEDU_AGENT_API_KEY` | recomendada | Credencial da Agent API (`/api/agent/*`). Sem ela, essas rotas respondem 503 (não derruba o servidor). |
| `MCP_AUTH_SECRET` | recomendada | Credencial do MCP (`/mcp`), **diferente** de `KINEDU_AGENT_API_KEY` — vazar uma não expõe a outra. Sem ela, `/mcp` responde 503. |
| `PORT` | normalmente automática | A maioria das plataformas (Render, Railway, Fly.io) injeta isso sozinha — não sobrescrever manualmente lá. |
| `NODE_ENV` | recomendada | `production`. |
| `CORS_ORIGIN` | recomendada | URL pública real do serviço, depois do primeiro deploy. |
| `BCRYPT_ROUNDS` | opcional | Padrão 12, adequado para produção. |

Nenhum valor real de nenhuma dessas variáveis está neste repositório, em `render.yaml`, ou em qualquer arquivo commitado — só em `backend/.env.example`, com campos vazios. Os valores usados neste ambiente de desenvolvimento (sandbox) **não devem ser reaproveitados em produção** — gere valores novos:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 3. Banco de dados

- **Produção precisa de um banco separado do de desenvolvimento.** O `render.yaml` deste repositório provisiona um banco Postgres novo e dedicado (`kinedu-db`) — em nenhum momento aponta para o banco usado neste sandbox.
- **Migrations existentes, na ordem em que devem ser aplicadas**: `001_init.sql` → `002_agent_integration.sql` → `003_admin_review.sql`. Todas usam `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — nenhuma dropa tabela, nenhuma reescreve dados existentes destrutivamente. `npm run migrate` aplica as três em ordem automaticamente (a ordem é dada pelo nome do arquivo) e é seguro rodar múltiplas vezes (migrations já aplicadas são puladas).
- **Não apagar dados**: nenhuma migration deste projeto contém `DROP TABLE`, `DROP COLUMN` ou `TRUNCATE`. Isso já era verdade antes desta etapa — só confirmando que continua.

## 4. Segurança de produção — o que já existe vs. o que foi adicionado agora

Auditado item por item (pedido explícito desta etapa):

| Item | Status |
|---|---|
| HTTPS | Não é responsabilidade do código Node — provido automaticamente pela plataforma de hosting (Render/Railway/Fly.io emitem TLS para o subdomínio deles sem configuração). |
| CORS | Já existia, configurável via `CORS_ORIGIN`. |
| Rate limiting | Já existia em `/api/agent/*`, `/api/admin/*` (nesta etapa) e `/mcp`. **Gap real encontrado e corrigido nesta etapa**: `/api/auth/*` (login/signup) e `/api/admin/*` não tinham rate limit nenhum — login era brute-forceable sem limite. Adicionado: 20 req/min em `/api/auth/*` (mais restritivo, é a superfície pública sem autenticação), 120 req/min em `/api/admin/*` (mesmo padrão dos outros surfaces, limita o raio de um token vazado). |
| Headers de segurança | Não configurados explicitamente (sem `helmet` ou equivalente). Não é um bloqueador para este deploy, mas é uma lacuna real — listada em "Riscos e limitações" abaixo, não escondida. |
| Autenticação | Sem mudanças — Agent API (chave estática), Admin (sessão JWT), MCP (chave estática separada) continuam exatamente como estavam. |
| Cookies/sessões | Sessão é um JWT enviado no corpo/header, não em cookie — sem `Set-Cookie`, sem CSRF a considerar por essa via. |
| Logs | JSON estruturado para stdout (`backend/src/utils/logger.js`) — é assim que Render/Railway/Fly.io capturam logs automaticamente, sem configuração extra. Nenhuma chamada de log em todo o projeto grava `agentApiKey`, `sessionSecret`, `mcpAuthSecret`, `password_hash` ou `DATABASE_URL` (verificado via busca no código, não suposição). |
| Tratamento de erros / stack traces | `backend/src/middleware/errorHandler.js` já só retorna mensagens genéricas ("Erro interno.") para status 500 — o stack trace vai só para o log do servidor, nunca para a resposta HTTP. Sem mudanças necessárias aqui. |
| Endpoints administrativos sem autenticação | Não existem — `/api/admin/*` sempre exige `requireAdminAuth`; `/api/agent/*` sempre exige a chave do agente; `/mcp` sempre exige `MCP_AUTH_SECRET`. Nenhuma permissão foi alterada nesta etapa, conforme pedido. |

## 5. Plataforma recomendada: **Render**

Comparado com Railway e Fly.io nos critérios pedidos:

| Critério | Render | Railway | Fly.io |
|---|---|---|---|
| Node/Express | Suportado nativamente | Suportado nativamente | Suportado nativamente |
| Deploy via GitHub | Dashboard, sem CLI necessária | Dashboard, sem CLI necessária | Fluxo principal é via CLI (`flyctl`); GitHub Actions exige workflow próprio |
| PostgreSQL | Provisionado no mesmo dashboard/conta | Provisionado no mesmo dashboard/conta | Postgres é um app separado que você opera manualmente |
| HTTPS | Automático | Automático | Automático |
| Facilidade | Maior — Blueprint (`render.yaml`) declara web service + banco juntos | Também simples, dashboard-first | Mais operacional — pensado para quem já quer controle fino sobre infraestrutura |
| Custo | Camada gratuita existe (com sleep por inatividade); pago a partir de ~$7/mês para always-on. Confirme os termos atuais no dashboard, mudam com frequência | Sem tier gratuito perpétuo — cobrança por uso desde o início | Camada gratuita pequena, mas Postgres com volume tende a ficar mais caro/complexo |
| Manutenção | Baixa — um `render.yaml` descreve tudo | Baixa | Mais alta — configuração de máquinas/volumes é manual |

**Motivo da escolha**: para um projeto pequeno com quem está começando em deploy, Render é a opção com menor fricção em cada etapa que importa aqui — conectar o GitHub, configurar variáveis, provisionar o Postgres, tudo pela mesma interface web, sem precisar instalar ou aprender uma CLI. O arquivo `render.yaml` já commitado neste repositório descreve o web service e o banco juntos, então a maior parte da "configuração de produção" pedida já está pronta para ser aplicada com um clique, uma vez que você conecte o repositório.

## 6. Arquivo de configuração criado

`render.yaml` (raiz do repositório) — Render Blueprint com:
- `services.kinedu-backend`: `rootDir: backend`, `buildCommand: npm install`, `startCommand: npm start`, `preDeployCommand: npm run migrate` (roda as migrations automaticamente antes de cada deploy), `healthCheckPath: /api/health`.
- `databases.kinedu-db`: Postgres gerenciado, conectado automaticamente via `DATABASE_URL`.
- `SESSION_SECRET`: gerado automaticamente pelo Render (`generateValue: true`).
- `KINEDU_AGENT_API_KEY`, `MCP_AUTH_SECRET`, `CORS_ORIGIN`: marcados `sync: false` — você define manualmente no dashboard depois do primeiro deploy (os dois primeiros porque são segredos reais que nunca devem estar neste arquivo; o terceiro porque a URL pública só existe depois do primeiro deploy).

Não foram criados arquivos para Railway ou Fly.io — só a plataforma escolhida, conforme pedido.

## 7. Passo a passo completo (os 15 itens pedidos)

1. **Criar o serviço**: em render.com, "New" → "Blueprint", conectar sua conta GitHub se ainda não conectada.
2. **Conectar ao GitHub**: escolher o repositório `brunoescudero20-collab/kinedu-site`. Render detecta o `render.yaml` automaticamente.
3. **Configurar branch**: o `render.yaml` aponta para `claude/static-site-preview-8csdsv` — ajuste para a branch que você realmente quer publicar (ex.: `main`, depois de fazer o merge do PR) antes de aplicar o Blueprint, ou ajuste na tela de configuração do serviço no dashboard.
4. **Build command**: já definido no `render.yaml` como `npm install` (não precisa preencher manualmente, mas confirme que aparece assim na revisão do Blueprint).
5. **Start command**: já definido como `npm start`.
6. **DATABASE_URL**: preenchido automaticamente pelo Render a partir do banco `kinedu-db` que o mesmo Blueprint cria — não precisa digitar nada.
7. **SESSION_SECRET**: gerado automaticamente pelo Render — não precisa digitar nada.
8. **KINEDU_AGENT_API_KEY**: gere um valor novo (comando acima) e cole no dashboard do Render, na aba Environment do serviço `kinedu-backend`.
9. **MCP_AUTH_SECRET**: gere outro valor novo e diferente do anterior, cole na mesma aba.
10. **NODE_ENV**: já definido como `production` no `render.yaml`.
11. **Executar migrations**: automático via `preDeployCommand: npm run migrate` a cada deploy. Se preferir rodar manualmente na primeira vez, use o Shell do Render (aba "Shell" do serviço) e rode `npm run migrate`.
12. **Verificar health check**: `curl https://<sua-url>.onrender.com/api/health` → esperado `{"ok":true,"env":"production"}`.
13. **Verificar /mcp**: `curl https://<sua-url>.onrender.com/mcp/health` → esperado `{"ok":true,"database_connected":true,"mcp_configured":true,...}`.
14. **Testar Agent API**: `curl https://<sua-url>.onrender.com/api/agent/categories -H "Authorization: Bearer <KINEDU_AGENT_API_KEY real>"` → deve retornar as categorias reais.
15. **Testar Admin API**: fazer login em `https://<sua-url>.onrender.com/` (o próprio frontend, agora servido pelo mesmo backend) com uma conta promovida a admin (`UPDATE users SET is_admin = true WHERE email = '...'` direto no banco de produção), depois acessar `#admin-curation` e/ou chamar `GET /api/admin/me` com o token retornado pelo login.

**Depois do primeiro deploy**, volte e defina `CORS_ORIGIN` com a URL real que o Render atribuiu (ex.: `https://kinedu-backend.onrender.com`).

## 8. Domínio próprio (mais tarde, opcional)

Não é necessário agora — o Render já entrega uma URL HTTPS pública (`https://kinedu-backend.onrender.com` ou o nome que você escolher) funcional sem nenhum domínio próprio. Quando quiser usar algo como `api.seudominio.com`:
1. No dashboard do serviço, aba "Settings" → "Custom Domain".
2. Adicionar `api.seudominio.com`.
3. Criar o registro DNS que o Render indicar (CNAME, geralmente) no seu provedor de DNS.
4. O Render emite o certificado HTTPS automaticamente para o domínio próprio também.
5. Depois disso, atualizar `CORS_ORIGIN` e a URL usada no conector do Claude/Cowork para o novo domínio.

## 9. Teste de produção esperado (depois que você fizer o deploy)

Nesta ordem, exatamente como pedido — nada de criar candidato ainda, só confirmar a cadeia Claude → MCP → Backend → PostgreSQL:

1. `GET https://<url>/api/health`
2. `GET https://<url>/mcp/health`
3. Handshake MCP (conectar um cliente/conector com `Authorization: Bearer <MCP_AUTH_SECRET>`)
4. `kinEdu_get_articles` (ferramenta somente leitura)
5. `kinEdu_get_search_statistics` (ferramenta somente leitura)

## 10. Riscos e limitações desta preparação

- **Nenhum deploy foi feito.** Tudo aqui é preparação — código e configuração testados localmente, nunca contra a infraestrutura real do Render.
- **Sem headers de segurança explícitos** (tipo `helmet`) — não bloqueia o deploy, mas é uma lacuna real para revisão futura.
- **Cold start no plano gratuito do Render**: se você usar o plano `free` (o que o `render.yaml` usa por padrão), o serviço "dorme" após inatividade e a primeira requisição depois disso demora mais para responder. Um conector MCP do Claude/Cowork pode não tolerar bem essa espera na primeira chamada — se isso for um problema na prática, mude `plan: free` para `plan: starter` (pago, sempre ativo) no `render.yaml` ou diretamente no dashboard.
- **Rate limiting em memória, por processo** — não sobrevive a restart nem coordena múltiplas instâncias (mencionado em `docs/agent-api.md` e `docs/mcp.md`, vale para os limitadores novos também).
- **`CORS_ORIGIN` e os dois secrets de agente/MCP exigem uma ação manual sua** no dashboard depois do primeiro deploy — não há como o `render.yaml` sozinho completar isso sem expor um segredo real no repositório.
- **Conectar ao Claude/Cowork continua fora do escopo desta etapa**, por instrução explícita — só depois que você confirmar o deploy real e me passar (ou eu confirmar) a URL pública verdadeira.
