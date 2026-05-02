# Modelagem de Dados

Este documento resume os modelos atuais do frontend e as tabelas persistidas
pelo backend.

## Entidade

Arquivo principal: `frontend/src/app/models/entity.model.ts`

Tipos de entidade:

- `PC`
- `NPC`
- `Enemy`
- `Object`
- `Ability`

Modos de visibilidade:

- `private`
- `public`
- `prepared`
- `imageOnly`
- `nameAndImage`
- `publicSheet`

Status padrao:

- `Ativo`
- `Desmaiado`
- `Destruido`

Estrutura de alto nivel:

```ts
interface Entity {
  id: string;
  type: EntityType;
  visibility: VisibilityMode;
  playerCanEdit: boolean;
  baseState: {
    name: string;
    maxHp: number;
    imageUrl: string;
    publicNotes: string;
    gmNotes: string;
    resistances: string[];
    weaknesses: string[];
    customFields: CustomField[];
  };
  canEditSession?: boolean;
  sessionState: EntitySessionState;
}
```

`baseState` guarda dados estaveis:

- `name`
- `maxHp`
- `imageUrl`
- `publicNotes`
- `gmNotes`
- `resistances`
- `weaknesses`
- `customFields`
- campos de habilidade: timing, dano, tipo de dano e duracao

`sessionState` guarda dados mutaveis:

- `currentHp`
- `status`
- `conditions`
- `mana`
- `maxMana`
- `resources`
- `modifiers`
- `isVisibleToPlayers`

## Campanha

Arquivo principal: `frontend/src/app/models/campaign.model.ts`

Sistemas suportados:

- `custom`
- `dnd5.5`

Fases:

- `planning`
- `session`
- `combat`
- `paused`

Uma campanha contem:

- `id`
- `name`
- `systemKey`
- `phase`
- `activeCombatId`
- `activeCombatName`
- `settings`

`settings` concentra:

- tipos de dano;
- multiplicadores de resistencia, fraqueza e imunidade;
- regra padrao de visibilidade do lobby;
- encontros;
- sessoes preparadas;
- templates de ficha;
- nos e links de lore.

## Encontros e Board

`EncounterConfig` define:

- `id`, `name`, `notes`;
- `entityIds` participantes;
- `board` opcional com largura, altura, visibilidade e posicoes por entidade.

O board e uma grade simples usada pelo GM e, quando publico, tambem pelo lobby.

## Sessoes e Combates

`SessionRun` representa uma sessao real iniciada pelo GM:

- `active` ou `ended`;
- horarios de inicio/fim;
- usado para agrupar logs de combate.

`CombatSession` representa um combate:

- status `collectingInitiative`, `active` ou `ended`;
- entidades participantes;
- ordem de turno;
- indice do turno atual;
- vinculo com a sessao ativa.

`CombatInitiative` registra iniciativa enviada pelo lobby ou administrada pelo GM.

## Lobby

`LobbySettings`:

- campanha;
- senha configurada ou nao;
- limite de participantes;
- lobby habilitado;
- data de atualizacao.

`LobbyParticipant`:

- nick;
- indicador de convidado;
- token de sessao salvo no backend como hash;
- datas de criacao e ultimo acesso.

`LobbyState` e a resposta sanitizada para jogadores. Ela inclui:

- campanha publica;
- combate ativo;
- entidades filtradas;
- lore publica;
- board publico;
- iniciativas;
- horario do servidor.

## Banco SQLite

Arquivo: `data/rpgbot.sqlite`

Tabelas atuais:

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

O backend tambem possui migracoes simples em runtime para colunas adicionadas,
como `settings_json`, `active_combat_id`, `session_run_id` e
`turn_order_entity_ids_json`.
