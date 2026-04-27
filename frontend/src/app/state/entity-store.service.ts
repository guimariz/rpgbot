import { Injectable, computed, effect, signal } from '@angular/core';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { CombatLogEntry, CombatPhase, DamageProfile, Entity, HpPreview } from '../models/entity.model';

interface EntityState {
  campaignName: string;
  phase: CombatPhase;
  activeCombatName: string;
  selectedEntityId: string;
  damageProfiles: DamageProfile[];
  entities: Entity[];
  combatLog: CombatLogEntry[];
}

interface EntityActions {
  selectEntity: (entityId: string) => void;
  setPhase: (phase: CombatPhase) => void;
  setCampaignContext: (campaignName: string, phase: CombatPhase, activeCombatName: string) => void;
  replaceEntities: (entities: Entity[]) => void;
  replaceCombatLog: (combatLog: CombatLogEntry[]) => void;
  resetLocalData: () => void;
  createEntity: (entity: Entity) => void;
  replaceEntity: (entity: Entity) => void;
  updateEntityBase: (entityId: string, patch: Partial<Entity['baseState']>) => void;
  deleteEntity: (entityId: string) => void;
  updateHp: (entityId: string, amount: number, damageType: string, note?: string) => CombatLogEntry | null;
  setPublicVisibility: (entityId: string, isVisible: boolean) => void;
  togglePreparedPublicInfo: (entityId: string) => void;
}

type EntityStore = EntityState & EntityActions;

const damageProfiles: DamageProfile[] = [
  { type: 'cortante', resistanceMultiplier: 0.5, weaknessMultiplier: 2 },
  { type: 'perfurante', resistanceMultiplier: 0.5, weaknessMultiplier: 2 },
  { type: 'impacto', resistanceMultiplier: 0.5, weaknessMultiplier: 2 },
  { type: 'fogo', resistanceMultiplier: 0.5, weaknessMultiplier: 2 },
  { type: 'gelo', resistanceMultiplier: 0.5, weaknessMultiplier: 2 },
  { type: 'eletrico', resistanceMultiplier: 0.5, weaknessMultiplier: 2 },
  { type: 'veneno', resistanceMultiplier: 0.5, weaknessMultiplier: 2 },
  { type: 'cura', resistanceMultiplier: 1, weaknessMultiplier: 1 }
];

export function getHpPreview(entity: Entity, amount: number, damageType: string): HpPreview {
  if (amount >= 0 || damageType === 'cura') {
    return { finalAmount: Math.abs(amount), multiplier: 1, reason: 'heal' };
  }

  const rawDamage = Math.abs(amount);
  if (entity.baseState.resistances.includes(damageType)) {
    return { finalAmount: Math.ceil(rawDamage * 0.5), multiplier: 0.5, reason: 'resistance' };
  }

  if (entity.baseState.weaknesses.includes(damageType)) {
    return { finalAmount: rawDamage * 2, multiplier: 2, reason: 'weakness' };
  }

  return { finalAmount: rawDamage, multiplier: 1, reason: 'neutral' };
}

const store: StoreApi<EntityStore> = createStore<EntityStore>((set, get) => ({
  campaignName: '',
  phase: 'planning',
  activeCombatName: '',
  selectedEntityId: '',
  damageProfiles,
  entities: [],
  combatLog: [],
  selectEntity: (entityId) => set({ selectedEntityId: entityId }),
  setPhase: (phase) => set({ phase }),
  setCampaignContext: (campaignName, phase, activeCombatName) =>
    set({ campaignName, phase, activeCombatName }),
  replaceEntities: (entities) =>
    set({
      entities,
      selectedEntityId: entities[0]?.id ?? '',
      combatLog: []
    }),
  replaceCombatLog: (combatLog) => set({ combatLog }),
  resetLocalData: () =>
    set({
      campaignName: '',
      phase: 'planning',
      activeCombatName: '',
      selectedEntityId: '',
      entities: [],
      combatLog: []
    }),
  createEntity: (entity) =>
    set((state) => ({
      entities: [entity, ...state.entities],
      selectedEntityId: entity.id
    })),
  replaceEntity: (entity) =>
    set((state) => ({
      entities: state.entities.map((item) => (item.id === entity.id ? entity : item)),
      selectedEntityId: entity.id
    })),
  updateEntityBase: (entityId, patch) =>
    set((state) => ({
      entities: state.entities.map((entity) =>
        entity.id === entityId
          ? {
              ...entity,
              baseState: {
                ...entity.baseState,
                ...patch
              },
              sessionState: {
                ...entity.sessionState,
                currentHp:
                  patch.maxHp !== undefined
                    ? Math.min(entity.sessionState.currentHp, patch.maxHp)
                    : entity.sessionState.currentHp
              }
            }
          : entity
      )
    })),
  deleteEntity: (entityId) =>
    set((state) => {
      const nextEntities = state.entities.filter((entity) => entity.id !== entityId);
      const selectedEntityId =
        state.selectedEntityId === entityId
          ? nextEntities[0]?.id ?? ''
          : state.selectedEntityId;

      return {
        entities: nextEntities,
        selectedEntityId,
        combatLog: state.combatLog.filter((entry) => entry.entityId !== entityId)
      };
    }),
  setPublicVisibility: (entityId, isVisible) =>
    set((state) => ({
      entities: state.entities.map((entity) =>
        entity.id === entityId
          ? {
              ...entity,
              sessionState: {
                ...entity.sessionState,
                isVisibleToPlayers: isVisible
              },
              visibility: isVisible ? 'public' : 'private'
            }
          : entity
      )
    })),
  togglePreparedPublicInfo: (entityId) =>
    set((state) => ({
      entities: state.entities.map((entity) =>
        entity.id === entityId
          ? {
              ...entity,
              visibility: entity.visibility === 'prepared' ? 'public' : 'prepared'
            }
          : entity
      )
    })),
  updateHp: (entityId, amount, damageType, note = '') => {
    const currentState = get();
    const entity = currentState.entities.find((item) => item.id === entityId);

    if (!entity) {
      return null;
    }

    const preview = getHpPreview(entity, amount, damageType);
    const hpBefore = entity.sessionState.currentHp;
    const isHeal = amount > 0 || damageType === 'cura';
    const hpAfter = isHeal
      ? Math.min(entity.baseState.maxHp, hpBefore + preview.finalAmount)
      : hpBefore - preview.finalAmount;

    const nextStatus = hpAfter <= 0
      ? entity.type === 'Object'
        ? 'Destruido'
        : 'Desmaiado'
      : 'Ativo';

    const logEntry: CombatLogEntry = {
      id: crypto.randomUUID(),
      entityId,
      entityName: entity.baseState.name,
      action: isHeal ? 'heal' : 'damage',
      requestedAmount: Math.abs(amount),
      finalAmount: preview.finalAmount,
      damageType,
      hpBefore,
      hpAfter,
      createdAt: new Date().toISOString(),
      note
    };

    set((state) => ({
      entities: state.entities.map((item) =>
        item.id === entityId
          ? {
              ...item,
              sessionState: {
                ...item.sessionState,
                currentHp: hpAfter,
                status: nextStatus
              }
            }
          : item
      ),
      combatLog: [logEntry, ...state.combatLog].slice(0, 12)
    }));

    return logEntry;
  }
}));

@Injectable({ providedIn: 'root' })
export class EntityStoreService {
  private readonly state = signal(store.getState());
  readonly entities = computed(() => this.state().entities);
  readonly damageProfiles = computed(() => this.state().damageProfiles);
  readonly combatLog = computed(() => this.state().combatLog);
  readonly phase = computed(() => this.state().phase);
  readonly campaignName = computed(() => this.state().campaignName);
  readonly activeCombatName = computed(() => this.state().activeCombatName);
  readonly selectedEntity = computed(() => {
    const state = this.state();
    return state.entities.find((entity) => entity.id === state.selectedEntityId) ?? state.entities[0];
  });
  readonly publicEntities = computed(() =>
    this.state().entities
      .filter((entity) =>
        entity.sessionState.isVisibleToPlayers ||
        entity.visibility === 'public' ||
        entity.visibility === 'imageOnly' ||
        entity.visibility === 'nameAndImage' ||
        entity.visibility === 'publicSheet')
      .map((entity) => ({
        id: entity.id,
        name: entity.visibility === 'imageOnly' ? 'Imagem revelada' : entity.baseState.name,
        imageUrl: entity.baseState.imageUrl,
        isGravelyWounded: entity.type === 'Enemy' && entity.sessionState.currentHp <= entity.baseState.maxHp * 0.05
      }))
  );

  constructor() {
    store.subscribe((nextState) => this.state.set(nextState));
    effect(() => {
      this.state();
    });
  }

  selectEntity(entityId: string): void {
    store.getState().selectEntity(entityId);
  }

  setPhase(phase: CombatPhase): void {
    store.getState().setPhase(phase);
  }

  setCampaignContext(campaignName: string, phase: CombatPhase, activeCombatName: string): void {
    store.getState().setCampaignContext(campaignName, phase, activeCombatName);
  }

  replaceEntities(entities: Entity[]): void {
    store.getState().replaceEntities(entities);
  }

  replaceCombatLog(combatLog: CombatLogEntry[]): void {
    store.getState().replaceCombatLog(combatLog);
  }

  updateHp(entityId: string, amount: number, damageType: string, note?: string): CombatLogEntry | null {
    return store.getState().updateHp(entityId, amount, damageType, note);
  }

  createEntity(entity: Entity): void {
    store.getState().createEntity(entity);
  }

  replaceEntity(entity: Entity): void {
    store.getState().replaceEntity(entity);
  }

  updateEntityBase(entityId: string, patch: Partial<Entity['baseState']>): void {
    store.getState().updateEntityBase(entityId, patch);
  }

  deleteEntity(entityId: string): void {
    store.getState().deleteEntity(entityId);
  }

  resetLocalData(): void {
    store.getState().resetLocalData();
  }

  setPublicVisibility(entityId: string, isVisible: boolean): void {
    store.getState().setPublicVisibility(entityId, isVisible);
  }

  togglePreparedPublicInfo(entityId: string): void {
    store.getState().togglePreparedPublicInfo(entityId);
  }
}
