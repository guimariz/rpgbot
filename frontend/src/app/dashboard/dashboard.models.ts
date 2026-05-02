export interface PlayerSlot {
  id: string;
  name: string;
  currentHp: number;
  maxHp: number;
  ac?: number;
  conditions?: string[];
  isActive?: boolean;
}

export interface EnemySlot {
  id: string;
  name: string;
  currentHp: number;
  maxHp: number;
  isAlive: boolean;
  conditions?: string[];
}

export interface InitiativeEntry {
  id: string;
  name: string;
  initiative: number;
  isPlayer: boolean;
  isCurrentTurn: boolean;
  hpCurrent?: number;
  hpMax?: number;
}

export interface BoardToken {
  id: string;
  label: string;
  row: number;
  col: number;
  isPlayer: boolean;
  color?: string;
}
