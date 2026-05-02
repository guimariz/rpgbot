import { Entity, EntitySessionState, EntityType } from './entity.model';

export type CampaignSystem = 'custom' | 'dnd5.5';
export type CampaignPhase = 'planning' | 'session' | 'combat' | 'paused';
export type LobbyRevealMode = 'imageAndName' | 'imageOnly';

export interface DamageTypeConfig {
  id: string;
  name: string;
  color?: string;
  icon?: string;
}

export interface EncounterConfig {
  id: string;
  name: string;
  notes: string;
  entityIds?: string[];
  roundCounters?: RoundCounterConfig[];
  board?: {
    width: number;
    height: number;
    visibility: 'gmOnly' | 'public';
    positions: Record<string, { x: number; y: number }>;
  };
}

export interface RoundCounterConfig {
  id: string;
  name: string;
  rounds: number;
  visibility: 'gmOnly' | 'public';
}

export interface SessionConfig {
  id: string;
  name: string;
  notes: string;
  entityIds?: string[];
  loreNodeIds?: string[];
  lobbyPasswordConfigured?: boolean;
  lastLobbySummary?: string;
  lastLobbyRunId?: string;
  encounters: EncounterConfig[];
}

export type TemplateFieldType = 'text' | 'select' | 'table';

export interface TemplateFieldConfig {
  id: string;
  name: string;
  type: TemplateFieldType;
  options: string[];
}

export interface TemplateConfig {
  id: string;
  name: string;
  entityType: EntityType;
  fields: TemplateFieldConfig[];
}

export interface LoreNodeConfig {
  id: string;
  title: string;
  text: string;
  imageUrl: string;
  publishedToLobby?: boolean;
  isPublishedToLobby?: boolean;
  visibleToParticipantIds?: string[];
  x: number;
  y: number;
}

export interface LoreLinkConfig {
  id: string;
  fromId: string;
  toId: string;
}

export interface LobbySettings {
  campaignId: string;
  hasPassword: boolean;
  maxParticipants: number;
  isEnabled: boolean;
  updatedAt: string;
}

export interface LobbyParticipant {
  id: string;
  campaignId: string;
  nick: string;
  isGuest: boolean;
  createdAt: string;
  lastSeenAt: string;
}

export interface LobbyEntity extends Omit<Entity, 'baseState' | 'sessionState'> {
  canEditSession: boolean;
  baseState: Partial<Entity['baseState']> & {
    name?: string;
    maxHp?: number;
    imageUrl?: string;
  };
  sessionState: EntitySessionState | null;
}

export interface CombatInitiative {
  id: string;
  campaignId: string;
  combatId: string;
  participantId: string;
  entityId: string;
  participantNick: string;
  entityName: string;
  value: number;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface CombatSession {
  id: string;
  campaignId: string;
  sessionRunId: string;
  name: string;
  status: 'collectingInitiative' | 'active' | 'ended' | string;
  participantEntityIds: string[];
  turnOrderEntityIds: string[];
  currentTurnIndex: number;
  roundNumber: number;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRun {
  id: string;
  campaignId: string;
  status: 'active' | 'ended' | string;
  startedAt: string;
  endedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface LobbyState {
  participant: LobbyParticipant;
  campaign: {
    id: string;
    name: string;
    phase: CampaignPhase;
    activeCombatId: string;
    activeCombatName: string;
  };
  activeCombat: CombatSession | null;
  entities: LobbyEntity[];
  lore: {
    loreNodes: LoreNodeConfig[];
    loreLinks: LoreLinkConfig[];
  };
  publicBoard: {
    encounterId: string;
    encounterName: string;
    width: number;
    height: number;
    positions: Record<string, { x: number; y: number }>;
    roundCounters?: RoundCounterConfig[];
  } | null;
  initiatives: CombatInitiative[];
  serverTime: string;
}

export interface CampaignSettings {
  isConfigured: boolean;
  system: CampaignSystem;
  damageTypes: DamageTypeConfig[];
  damageRules: {
    resistanceMultiplier: number;
    weaknessMultiplier: number;
    immunityMultiplier: number;
  };
  lobbyVisibility: {
    defaultMode: 'private';
    revealMode: LobbyRevealMode;
    woundedThresholdPercent: number;
  };
  encounters: EncounterConfig[];
  sessions: SessionConfig[];
  templates: TemplateConfig[];
  loreNodes: LoreNodeConfig[];
  loreLinks: LoreLinkConfig[];
}

export interface Campaign {
  id: string;
  name: string;
  systemKey: CampaignSystem;
  settings: CampaignSettings;
  phase: CampaignPhase;
  activeCombatId: string;
  activeCombatName: string;
}

export function createDefaultCampaignSettings(system: CampaignSystem): CampaignSettings {
  const base: CampaignSettings = {
    isConfigured: false,
    system,
    damageTypes: [],
    damageRules: {
      resistanceMultiplier: 0.5,
      weaknessMultiplier: 2,
      immunityMultiplier: 0
    },
    lobbyVisibility: {
      defaultMode: 'private',
      revealMode: 'imageAndName',
      woundedThresholdPercent: 5
    },
    encounters: [],
    sessions: [],
    templates: [],
    loreNodes: [],
    loreLinks: []
  };

  if (system === 'dnd5.5') {
    return {
      ...base,
      damageTypes: [
        { id: 'acid', name: 'Acido', color: '#65a30d' },
        { id: 'bludgeoning', name: 'Concusao', color: '#78716c' },
        { id: 'cold', name: 'Frio', color: '#0284c7' },
        { id: 'fire', name: 'Fogo', color: '#dc2626' },
        { id: 'force', name: 'Energia', color: '#7c3aed' },
        { id: 'lightning', name: 'Eletrico', color: '#ca8a04' },
        { id: 'necrotic', name: 'Necrotico', color: '#4b5563' },
        { id: 'piercing', name: 'Perfurante', color: '#525252' },
        { id: 'poison', name: 'Veneno', color: '#16a34a' },
        { id: 'psychic', name: 'Psiquico', color: '#c026d3' },
        { id: 'radiant', name: 'Radiante', color: '#facc15' },
        { id: 'slashing', name: 'Cortante', color: '#991b1b' },
        { id: 'thunder', name: 'Trovao', color: '#2563eb' }
      ],
      templates: [
        {
          id: 'dnd-character',
          name: 'Personagem D&D 5.5',
          entityType: 'PC',
          fields: [
            { id: 'hp', name: 'HP', type: 'text', options: [] },
            { id: 'ca', name: 'CA', type: 'text', options: [] },
            { id: 'movement', name: 'Deslocamento', type: 'text', options: [] },
            { id: 'attributes', name: 'Atributos', type: 'table', options: ['Forca', 'Destreza', 'Constituicao', 'Inteligencia', 'Sabedoria', 'Carisma'] }
          ]
        },
        {
          id: 'dnd-creature',
          name: 'Criatura D&D 5.5',
          entityType: 'Enemy',
          fields: [
            { id: 'hp', name: 'HP', type: 'text', options: [] },
            { id: 'ca', name: 'CA', type: 'text', options: [] },
            { id: 'challenge', name: 'Desafio', type: 'text', options: [] },
            { id: 'actions', name: 'Acoes', type: 'table', options: ['Nome', 'Alcance', 'Dano', 'Efeito'] }
          ]
        },
        {
          id: 'dnd-ability',
          name: 'Habilidade D&D 5.5',
          entityType: 'Ability',
          fields: [
            { id: 'timing', name: 'Duracao', type: 'select', options: ['Instantanea', 'Por round'] },
            { id: 'damage', name: 'Dano', type: 'text', options: [] },
            { id: 'damageType', name: 'Tipo de dano', type: 'select', options: ['Acido', 'Concusao', 'Frio', 'Fogo', 'Energia', 'Eletrico', 'Necrotico', 'Perfurante', 'Veneno', 'Psiquico', 'Radiante', 'Cortante', 'Trovao'] },
            { id: 'rounds', name: 'Rounds ativos', type: 'text', options: [] }
          ]
        }
      ]
    };
  }

  return base;
}
