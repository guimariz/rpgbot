# RPGBot Backend

Backend local em Node.js com SQLite nativo.

## Rodar

```bash
cd backend
npm start
```

A API sobe em:

```text
http://localhost:3001
```

O banco local fica em `data/rpgbot.sqlite`.

## Rotas

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/me`
- `GET /api/campaigns`
- `POST /api/campaigns`
- `PATCH /api/campaigns/:id`
- `DELETE /api/campaigns/:id`
- `GET /api/campaigns/:id/entities`
- `POST /api/campaigns/:id/entities`
- `PATCH /api/entities/:id`
- `DELETE /api/entities/:id`

Rotas protegidas usam:

```text
Authorization: Bearer <token>
```

## Variaveis

- `PORT`: porta da API. Padrao: `3001`.
- `RPGBOT_TOKEN_SECRET`: segredo usado para assinar tokens.
- `RPGBOT_ALLOWED_ORIGIN`: origem liberada no CORS. Padrao: `http://localhost:4200`.
