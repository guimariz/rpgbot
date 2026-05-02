# Guia de Implementacao e Manutencao

Use este documento como referencia para continuar o projeto sem depender de
prompts antigos.

## Antes de Alterar

1. Leia os modelos em `frontend/src/app/models/`.
2. Confira se a mudanca toca estado local, backend ou ambos.
3. Preserve a separacao entre `baseState` e `sessionState`.
4. Para lobby, pense primeiro no que pode ser revelado ao jogador.
5. Evite refatorar o `AppComponent` inteiro junto com uma feature pequena.

## Padroes do Frontend

- Angular standalone.
- `CommonModule` importado diretamente no componente raiz.
- Estado reativo com `signal` e `computed`.
- Store de entidades em `EntityStoreService`, usando Zustand vanilla.
- Chamadas HTTP centralizadas por `apiRequest`.
- API base atual: `http://localhost:3001/api`.
- Token salvo em `localStorage` ou `sessionStorage` com chave `rpgbot.auth`.

Ao adicionar uma entidade ou campo:

1. Atualize `entity.model.ts` ou `campaign.model.ts`.
2. Atualize normalizacao no backend, quando persistido.
3. Atualize formulario no `app.component.html`.
4. Atualize criacao/edicao no `app.component.ts`.
5. Garanta sanitizacao no lobby se o campo for privado.

## Padroes do Backend

- Backend sem framework, usando `node:http`.
- Todas as respostas JSON passam por `sendJson`.
- CORS permite `localhost:4200`, `127.0.0.1:4200` e IPs privados em
  desenvolvimento.
- Rotas protegidas usam `Authorization: Bearer <token>`.
- Rotas de lobby usam `X-Lobby-Token`.
- Dados complexos ficam em JSON no SQLite.

Ao adicionar uma rota:

1. Normalize entrada antes de persistir.
2. Valide posse da campanha ou permissao de GM.
3. Use `campaignCanBeManagedByUser` para areas do GM.
4. Use sanitizacao propria para lobby.
5. Chame `broadcastLobby(campaignId)` quando a alteracao afetar jogadores.

## Rotas da API

Publicas:

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/discord` retorna `501` atualmente.

Lobby:

- `POST /api/lobby/campaigns/:campaignId/join`
- `GET /api/lobby/participants/:participantId/state`
- `GET /api/lobby/participants/:participantId/events`
- `PATCH /api/lobby/participants/:participantId/entities/:entityId/session`
- `POST /api/lobby/participants/:participantId/initiative`

GM autenticado:

- `GET /api/me`
- `GET /api/campaigns`
- `POST /api/campaigns`
- `PATCH /api/campaigns/:id`
- `DELETE /api/campaigns/:id`
- `GET /api/campaigns/:id/session-runs`
- `POST /api/campaigns/:id/session-runs/start`
- `POST /api/campaigns/:id/session-runs/end`
- `PATCH /api/session-runs/:id`
- `GET /api/campaigns/:id/lobby/settings`
- `PATCH /api/campaigns/:id/lobby/settings`
- `GET /api/campaigns/:id/lobby/participants`
- `PATCH /api/campaigns/:id/entities/:entityId/visibility`
- `PATCH /api/campaigns/:id/entities/:entityId/assignments`
- `GET /api/campaigns/:id/entities`
- `POST /api/campaigns/:id/entities`
- `PATCH /api/entities/:id`
- `DELETE /api/entities/:id`
- `GET /api/campaigns/:id/combats`
- `POST /api/campaigns/:id/combats`
- `PATCH /api/combats/:id`
- `POST /api/combats/:id/turn-order`
- `GET /api/campaigns/:id/combat-logs`
- `POST /api/campaigns/:id/combat-logs`
- `GET /api/campaigns/:id/combat/initiatives`
- `DELETE /api/campaigns/:id/combat/initiatives`

## Variaveis de Ambiente

- `PORT`: porta da API. Padrao: `3001`.
- `RPGBOT_TOKEN_SECRET`: segredo para tokens locais.
- `RPGBOT_ALLOWED_ORIGIN`: origens CORS separadas por virgula. Padrao:
  `http://localhost:4200,http://127.0.0.1:4200`.

## Checklist de Validacao

```bash
npm run check:backend
npm run typecheck
npm run build
```

Teste manual recomendado:

1. Cadastro/login.
2. Criar campanha.
3. Criar entidade.
4. Aplicar dano e cura.
5. Iniciar sessao.
6. Entrar no lobby.
7. Atribuir ficha ao participante.
8. Enviar iniciativa.
9. Criar combate e gerar ordem de turno.
10. Publicar lore e conferir no lobby.
