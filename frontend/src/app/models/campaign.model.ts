import { Entity, EntityType } from './entity.model';

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

export interface LobbyState {
  participant: LobbyParticipant;
  campaign: {
    id: string;
    name: string;
    phase: CampaignPhase;
    activeCombatName: string;
  };
  entities: Entity[];
  lore: {
    loreNodes: LoreNodeConfig[];
    loreLinks: LoreLinkConfig[];
  };
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
        }
      ]
    };
  }

  return base;
}
