# Projeto: RPGBot

## Visao

RPGBot e um assistente de mesa para o GM, nao um VTT visual completo.
O foco e reduzir carga mental durante preparacao, sessao e combate:
organizar fichas, controlar estado mutavel, revelar informacao com seguranca
e dar ao lobby somente o que os jogadores podem ver.

## Principios

1. O GM e a fonte de verdade.
2. Ficha permanente e estado de sessao ficam separados.
3. O lobby nunca recebe dados privados por acidente.
4. Combate deve ser rapido: dano, cura, iniciativa, ordem de turno e historico.
5. Preparacao deve reaproveitar campanha, sessoes, encontros, templates e lore.

## Stack Atual

- Frontend: Angular `20.3.0`, standalone, sem `AppModule`.
- Estado local: Angular signals + Zustand vanilla em `EntityStoreService`.
- Backend: Node.js CommonJS usando `http` nativo.
- Banco: SQLite nativo via `node:sqlite`, arquivo em `data/rpgbot.sqlite`.
- Auth: senha com `scrypt`, token assinado localmente.
- Sincronizacao de lobby: Server-Sent Events.

## Modulos do Produto

- Autenticacao: cadastro, login, restauracao de token e logout.
- Campanhas: criacao, selecao, configuracao e exclusao.
- Configuracao: sistema custom ou `dnd5.5`, tipos de dano, regras, sessoes,
  encontros, templates e lore.
- Biblioteca: cadastro e edicao de entidades.
- HP Manager: dano/cura com resistencia, fraqueza, status e log.
- Sessao: inicio, pausa, combate e encerramento.
- Combate: criacao de combates, iniciativa, ordem de turno e board.
- Lobby: entrada por nick/senha, estado publico, fichas atribuidas e SSE.
- Lore: mapa de nos e links com publicacao seletiva.

## Regra de Ouro dos Dados

Cada entidade separa:

- `baseState`: dados de ficha, como nome, HP maximo, imagem, notas,
  resistencias, fraquezas, habilidade e campos customizados.
- `sessionState`: dados mutaveis da sessao, como HP atual, status, condicoes,
  mana, recursos, modificadores e visibilidade.

Combate altera principalmente `sessionState`. Edicoes estruturais de ficha
alteram `baseState`.

## Regras de Visibilidade

O backend aplica sanitizacao antes de responder ao lobby. O jogador recebe uma
versao parcial da entidade conforme:

- visibilidade global da entidade;
- regra especifica por participante;
- atribuicao da ficha ao participante;
- permissao `can_edit_session`;
- lore publicada para lobby ou participante.

Dados como notas do GM e campos privados nao devem ir para o lobby.
