# Painel de Revisão Humana (KinEdu Admin)

Interface e API para um administrador humano aprovar ou rejeitar os candidatos a artigo que o agente científico deixou em `pending_review`. É o único lugar do sistema onde `approved`/`published` podem ser definidos — o agente nunca tem acesso a essas ações (ver `docs/agent-api.md`).

```
AGENTE → curation_candidates → PENDING_REVIEW → ADMINISTRADOR (este painel) → APPROVED → [publicação futura]
```

`approved` nesta fase significa apenas **"um administrador revisou e aceitou este candidato"** — nada é escrito em `articles`, e não existe (ainda) nenhum mecanismo de publicação automática ou manual a partir daqui.

## Acesso

1. Login normal em `#auth` (mesmo formulário de sempre, `POST /api/auth/login`), com uma conta que tenha `is_admin = true` no banco.
2. **Promoção a admin não é self-service.** Não existe endpoint nem opção de UI para virar administrador — é uma alteração direta no banco:
   ```sql
   UPDATE users SET is_admin = true WHERE email = 'seu-email@exemplo.com';
   ```
3. Após o login, a conta admin vê um link "🛡️ Painel de curadoria científica" na página de perfil (`#profile`), e pode acessar diretamente por `#admin-curation`.

## Autenticação

Login emite um token de sessão assinado (JWT, HS256, 12h de validade) — `POST /api/auth/login` agora retorna `{ id, email, is_admin, token }`. O frontend guarda isso em `localStorage` (`kinedu_session_v1`) só por conveniência de UI (mostrar/esconder o link, evitar uma chamada extra); a autorização real é sempre reconferida no servidor a cada chamada a `/api/admin/*`.

`SESSION_SECRET` (variável de ambiente) assina os tokens. Se não definida, um segredo aleatório é gerado a cada início do processo — login continua funcionando, mas todas as sessões expiram no próximo restart (aviso no log). Defina um valor real em qualquer ambiente de longa duração.

**Isolamento do agente**: o token de sessão do admin e a `KINEDU_AGENT_API_KEY` do agente são formatos de credencial completamente diferentes, verificados por middlewares diferentes (`backend/src/admin/auth.js` vs `backend/src/agent/auth.js`). Nenhum dos dois é aceito pelo outro lado — testado explicitamente (`backend/test/admin.test.js`).

## Endpoints

Todos exigem `Authorization: Bearer <token>` de uma conta `is_admin = true`.

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/admin/me` | Confirma a sessão e retorna `{ id, email, is_admin }` |
| GET | `/api/admin/candidates` | Lista candidatos. Filtros: `status`, `topic`, `category` (substring), `study_type`, `year`, `discovered_from`, `discovered_to`, `page`, `page_size` |
| GET | `/api/admin/candidates/:id` | Detalhe de um candidato |
| POST | `/api/admin/candidates/:id/approve` | `pending_review → approved`. 409 se o candidato não estiver em `pending_review` |
| POST | `/api/admin/candidates/:id/reject` | `pending_review → rejected`. Body `{ reason }` obrigatório. 409 se não estiver em `pending_review` |

Aprovar/rejeitar grava `reviewed_by`/`reviewed_at` no próprio candidato **e** uma linha em `candidate_review_log` (candidato, admin, ação, motivo quando houver, timestamp) — o histórico completo sobrevive mesmo que o candidato seja revisado mais de uma vez ao longo do tempo (o que hoje não deveria acontecer, já que só se pode agir sobre `pending_review`, mas o log preserva a trilha de auditoria de qualquer forma).

## Interface (`#admin-curation`)

- **Filtros**: status, tema/categoria, tipo de estudo, ano, (a API também aceita janela de data de descoberta via `discovered_from`/`discovered_to`, não exposta na UI nesta primeira versão).
- **Card do candidato**: título, título em português, autores, periódico, ano, DOI, PMID, tipo de estudo, tema, tags, fonte — e, em seções expansíveis, resumo, resumo em português, metodologia, população, principais resultados, conclusão, aplicação prática e limitações.
- **Checklist de validação visual** (nunca esconde uma informação não verificada):
  - ✓ DOI verificado / ⚠ DOI ausente ou em formato não reconhecido
  - ✓ PMID verificado / ⚠ PMID ausente ou em formato não reconhecido
  - ✓ Data dentro dos últimos 10 anos / ⚠ fora da janela / ⚠ data não informada
  - ✓ Não duplicado (todo candidato listado já passou pela checagem de duplicidade no momento em que foi criado — ver `docs/agent-api.md`) / ⚠ se o próprio agente marcou como `duplicate`
  - ✓ Fonte identificada (nome da fonte) / ⚠ fonte não identificada
- **Ações** (só em candidatos `pending_review`): Aprovar (confirmação), Rejeitar (motivo obrigatório via prompt), Ver artigo original (link para `doi.org/<DOI>` quando há DOI).
- Candidatos já revisados mostram data da revisão e, se rejeitados, o motivo — sem botões de ação.

Todo texto vindo do candidato (título, autores, resumo etc.) é escapado antes de entrar no DOM (`adminEscapeHtml`) — esses dados se originam do agente/fontes externas e nunca são tratados como HTML confiável.

## Segurança

- `is_admin` só é setável via acesso direto ao banco — nenhum caminho de API (signup, admin, agente) consegue promover uma conta.
- Aprovar/rejeitar exigem que o candidato esteja exatamente em `pending_review` — protege contra duplo-clique (segunda tentativa dá 409) e contra reverter uma decisão anterior pela mesma rota.
- O agente não pode chamar `/api/admin/*` (autenticação incompatível) nem mover um candidato para `approved`/`published` via `/api/agent/*` (bloqueado independentemente, ver `docs/agent-api.md`) — duas barreiras redundantes, testadas separadamente.
- Nenhum caminho desta funcionalidade escreve em `articles`.

## Como testar

```bash
cd backend && npm test   # inclui backend/test/admin.test.js (12 testes)
```

Manualmente: promover uma conta a admin via SQL (acima), logar em `#auth`, acessar `#admin-curation`.

## Limitações desta fase (não escondidas)

- Sem publicação a partir daqui — `approved` é terminal nesta fase; o próximo incremento é decidir como `approved` vira de fato um artigo publicado em `articles`.
- Sessão expira em 12h sem renovação automática (sem refresh token) — o admin precisa logar de novo depois disso.
- Filtro por data de descoberta existe na API mas não tem campo próprio na UI ainda.
- Promoção a admin exige acesso direto ao banco — não há UI para um super-admin promover outra conta.
