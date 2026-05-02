export type EntityType = 'PC' | 'NPC' | 'Enemy' | 'Object' | 'Ability';

export type VisibilityMode = 'private' | 'public' | 'prepared' | 'imageOnly' | 'nameAndImage' | 'publicSheet';

export type EntityStatus = 'Ativo' | 'Desmaiado' | 'Destruido';

export type CombatPhase = 'planning' | 'session' | 'combat' | 'paused';

export interface CustomField {
  id: string;
  label: string;
  value: string | number;
  isPublic: boolean;
}

export interface Condition {
  id: string;
  name: string;
  durationTurns: number;
  isPublic: boolean;
}

export interface SessionResource {
  id: string;
  name: string;
  current: number;
  max: number;
  isPublic: boolean;
}

export interface SessionModifier {
  id: string;
  name: string;
  value: string;
  isPublic: boolean;
}

export interface EntitySessionState {
  currentHp: number;
  status: EntityStatus | string;
  conditions: Condition[];
  isVisibleToPlayers: boolean;
  mana?: number;
  maxMana?: number;
  resources?: SessionResource[];
  modifiers?: SessionModifier[];
}

export interface DamageProfile {
  type: string;
  resistanceMultiplier: number;
  weaknessMultiplier: number;
}

export interface Entity {
  id: string;
  type: EntityType;
  visibility: VisibilityMode;
  playerCanEdit: boolean;
  baseState: {
    name: string;
    maxHp: number;
    abilityTiming?: 'instant' | 'perRound';
    abilityDamage?: number;
    abilityDamageType?: string;
    abilityDurationRounds?: number;
    resistances: string[];
    weaknesses: string[];
    imageUrl: string;
    publicNotes: string;
    gmNotes: string;
    customFields: CustomField[];
  };
  canEditSession?: boolean;
  sessionState: EntitySessionState;
}

export interface CombatLogEntry {
  id: string;
  campaignId?: string;
  sessionRunId?: string;
  entityId: string;
  entityName: string;
  action: 'damage' | 'heal';
  requestedAmount: number;
  finalAmount: number;
  damageType: string;
  hpBefore: number;
  hpAfter: number;
  createdAt: string;
  note: string;
}

export interface HpPreview {
  finalAmount: number;
  multiplier: number;
  reason: 'resistance' | 'weakness' | 'neutral' | 'heal';
}
