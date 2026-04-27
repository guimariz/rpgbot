# Modelagem de Dados: Entidades e Estados

## Interface: Entity (Ficha)
```typescript
export interface Entity {
  id: string;
  type: 'PC' | 'NPC' | 'Enemy';
  baseState: {
    name: string;
    maxHp: number;
    resistances: string[]; // ex: ['fogo', 'cortante']
    weaknesses: string[];  // ex: ['gelo']
    imageUrl: string;
  };
  sessionState: {
    currentHp: number;
    conditions: Condition[];
    isVisibleToPlayers: boolean;
  };
}

export interface Condition {
  name: string;
  durationTurns: number;
}