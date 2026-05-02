# Especificacao Atual: Interface do GM e Lobby

O app deixou de ser apenas um controlador de HP. Hoje o `AppComponent`
concentra o fluxo principal do produto e usa services/modelos locais para
organizar estado.

## Arquivos Principais

- `frontend/src/app/app.component.ts`: orquestra autenticacao, campanhas,
  configuracao, fichas, HP, lobby, sessoes, combates, board e lore.
- `frontend/src/app/app.component.html`: template standalone com blocos de
  login, dashboard, biblioteca, lore, lobby e combate.
- `frontend/src/app/app.component.css`: visual da aplicacao.
- `frontend/src/app/state/entity-store.service.ts`: store Zustand vanilla
  integrada a Angular signals.
- `frontend/src/app/models/entity.model.ts`: tipos de entidade e combate.
- `frontend/src/app/models/campaign.model.ts`: tipos de campanha, lobby, lore,
  sessao e combate.

## Fluxo GM

1. GM faz login ou cadastro.
2. GM cria ou seleciona campanha.
3. Se necessario, configura sistema, dano, sessoes, encontros, templates e lore.
4. GM entra no workspace.
5. GM cria entidades na biblioteca.
6. GM inicia uma sessao, abre lobby e compartilha link.
7. GM cria ou inicia combate.
8. GM coleta iniciativas, gera ordem de turno e controla HP/estado.
9. GM encerra sessao e mantem historico.

## HP Manager

Entrada:

- entidade selecionada;
- acao `damage` ou `heal`;
- quantidade;
- tipo de dano;
- nota opcional.

Comportamento:

- Cura usa tipo interno `cura`.
- Dano verifica `resistances` e `weaknesses`.
- Resistencia aplica multiplicador `0.5` com arredondamento para cima.
- Fraqueza aplica multiplicador `2`.
- Cura nao passa de `baseState.maxHp`.
- Dano pode levar HP abaixo de zero.
- Status vira `Desmaiado` para criaturas/personagens e `Destruido` para objetos.
- Cada alteracao gera `CombatLogEntry` local e tambem pode ser persistida no
  backend via rota de logs.

## Biblioteca de Fichas

Campos suportados:

- tipo de entidade;
- nome;
- HP maximo;
- imagem;
- notas publicas;
- notas do GM;
- resistencias;
- fraquezas;
- dados de habilidade;
- campos customizados vindos de templates.

Filtros:

- todos;
- `PC`;
- `NPC`;
- `Enemy`;
- `Object`;
- `Ability`.

## Lobby

O lobby permite:

- entrada por nick;
- senha opcional;
- limite de participantes;
- atualizacao por SSE;
- visualizacao de estado publico;
- envio de iniciativa;
- edicao de HP, mana, status, condicoes e modificadores quando a ficha foi
  atribuida com permissao.

## Combate

Recursos:

- criar combate com entidades selecionadas;
- iniciar combate a partir de encontro;
- coletar iniciativa de jogadores;
- limpar iniciativas;
- gerar ordem de turno;
- avancar ou voltar turno;
- manter combate ativo na campanha.

## Lore

Recursos:

- criar nos com titulo, texto e imagem;
- conectar nos por links;
- arrastar nos no mapa;
- aplicar zoom;
- publicar ou esconder nos do lobby;
- abrir detalhe de um no.

## Diretrizes de UI

- A primeira tela util e login/lobby, nao landing page.
- Interface do GM prioriza densidade, controle e leitura rapida.
- A separacao entre informacao publica e privada precisa estar clara.
- O lobby deve mostrar somente o estado filtrado pelo backend.
