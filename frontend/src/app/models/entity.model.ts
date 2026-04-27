export type EntityType = 'PC' | 'NPC' | 'Enemy' | 'Object';

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
    resistances: string[];
    weaknesses: string[];
    imageUrl: string;
    publicNotes: string;
    gmNotes: string;
    customFields: CustomField[];
  };
  sessionState: {
    currentHp: number;
    status: EntityStatus;
    conditions: Condition[];
    isVisibleToPlayers: boolean;
  };
}

export interface CombatLogEntry {
  id: string;
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
