# RPGBot

RPGBot e uma ferramenta local para mestres de RPG gerenciarem campanhas,
fichas, sessoes, combates e um lobby de jogadores.

O projeto esta dividido em:

- `frontend/`: aplicacao Angular standalone.
- `backend/`: API HTTP em Node.js com SQLite nativo.
- `data/`: banco local `rpgbot.sqlite`, criado em runtime.

## Stack

- Angular `20.3.0`
- TypeScript `~5.9.2`
- Zustand vanilla para estado local de entidades
- Node.js `>=24.0.0`
- SQLite via `node:sqlite`
- Server-Sent Events para atualizacao do lobby

## Rodar

Instale as dependencias do frontend, se necessario:

```bash
npm --prefix frontend install
```

Suba o backend:

```bash
npm run dev:backend
```

Suba o frontend:

```bash
npm start
```

URLs principais:

- Frontend GM: `http://localhost:4200`
- Backend API: `http://localhost:3001/api`
- Lobby de jogador: link gerado pela campanha com query `?lobby=<campaignId>`
- Lobby visto pelo GM: link gerado com query `?gmLobby=<campaignId>`

## Scripts

Na raiz:

- `npm start`: inicia o frontend.
- `npm run start:frontend`: inicia o frontend.
- `npm run dev:backend`: inicia o backend em modo local.
- `npm run start:backend`: inicia o backend.
- `npm run build`: gera build do frontend.
- `npm run typecheck`: valida o frontend via build de desenvolvimento.
- `npm run check:backend`: valida sintaxe dos arquivos do backend.

## Funcionalidades Atuais

- Cadastro, login e restauracao de sessao.
- Criacao e selecao de campanhas.
- Configuracao de sistema `custom` ou preset `dnd5.5`.
- Biblioteca de entidades: `PC`, `NPC`, `Enemy`, `Object` e `Ability`.
- Fichas com HP, imagem, notas publicas, notas do GM, resistencias, fraquezas e campos customizados.
- Controle de dano/cura com preview de resistencia e fraqueza.
- Log de combate persistido por campanha e por sessao.
- Sessoes de jogo com inicio, pausa, combate e encerramento.
- Configuracao de encontros, incluindo board simples com posicoes.
- Combates com participantes, coleta de iniciativa, ordem de turno e turno atual.
- Lobby de jogadores com senha opcional, limite de participantes e SSE.
- Atribuicao de fichas a participantes do lobby.
- Controle de visibilidade por entidade e por participante.
- Edicao limitada de estado de sessao pelo jogador quando permitido.
- Mapa de lore com nos, links, imagens, zoom, drag e publicacao seletiva.

## Validacao

Comandos recomendados antes de fechar uma mudanca:

```bash
npm run check:backend
npm run typecheck
npm run build
```
