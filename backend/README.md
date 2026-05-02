# RPGBot Backend

Backend local em Node.js com SQLite nativo.

## Rodar

```bash
npm start
```

Ou pela raiz:

```bash
npm run dev:backend
```

A API sobe em:

```text
http://localhost:3001/api
```

O banco local fica em:

```text
data/rpgbot.sqlite
```

## Requisitos

- Node.js `>=24.0.0`
- Sem framework HTTP externo
- SQLite via `node:sqlite`

## Scripts

- `npm start`: executa `node server.js`.
- `npm run dev`: executa `node server.js`.
- `npm run check`: valida sintaxe de `server.js`, `db.js` e `auth.js`.

## Auth

Rotas protegidas usam:

```text
Authorization: Bearer <token>
```

Rotas do lobby usam:

```text
X-Lobby-Token: <token>
```

Senhas sao armazenadas com `scrypt`. Tokens de usuario sao assinados com
`RPGBOT_TOKEN_SECRET`. Tokens de lobby sao armazenados como hash SHA-256.

## Rotas

Publicas:

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/discord`

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

## Tabelas

- `users`
- `campaigns`
- `entities`
- `session_runs`
- `combat_logs`
- `combat_sessions`
- `combat_initiatives`
- `campaign_lobby_settings`
- `lobby_participants`
- `entity_visibility_rules`
- `entity_assignments`
- `campaign_gm_members`

## Variaveis

- `PORT`: porta da API. Padrao: `3001`.
- `RPGBOT_TOKEN_SECRET`: segredo usado para assinar tokens.
- `RPGBOT_ALLOWED_ORIGIN`: origens liberadas no CORS separadas por virgula.
