import { Injectable, signal } from '@angular/core';
import { CombatLogEntry, Entity } from '../models/entity.model';
import { CombatInitiative, CombatSession, EncounterConfig, SessionRun } from '../models/campaign.model';

@Injectable({ providedIn: 'root' })
export class CombatStateService {
  readonly activeEncounterId = signal('');
  readonly boardSelectedEntityId = signal('');
  readonly combatInitiatives = signal<CombatInitiative[]>([]);
  readonly combats = signal<CombatSession[]>([]);
  readonly sessionRuns = signal<SessionRun[]>([]);
  readonly selectedSessionRunId = signal('');
  readonly sessionRunLogs = signal<CombatLogEntry[]>([]);
  readonly draftCombatName = signal('');
  readonly draftCombatEntityIds = signal<string[]>([]);
  readonly gmInitiativeEntityId = signal('');
  readonly gmInitiativeValue = signal(10);
  readonly gmInitiativeNote = signal('');
  readonly isCombatModalOpen = signal(false);
  readonly isInitiativePopupOpen = signal(false);

  upsertCombat(combat: CombatSession): void {
    this.combats.set([combat, ...this.combats().filter((item) => item.id !== combat.id)]);
  }

  replaceCombat(combat: CombatSession): void {
    this.combats.set(this.combats().map((item) => item.id === combat.id ? combat : item));
  }

  activeCombat(activeCombatId: string): CombatSession | null {
    if (!activeCombatId) {
      return null;
    }

    return this.combats().find((combat) => combat.id === activeCombatId) ?? null;
  }

  clearSelectedSessionRunIfMissing(sessionRuns: SessionRun[]): void {
    const selected = this.selectedSessionRunId();

    if (selected && !sessionRuns.some((run) => run.id === selected)) {
      this.selectedSessionRunId.set('');
      this.sessionRunLogs.set([]);
    }
  }

  toggleDraftCombatEntity(entityId: string, checked: boolean): void {
    this.draftCombatEntityIds.update((ids) =>
      checked
        ? ids.includes(entityId) ? ids : [...ids, entityId]
        : ids.filter((id) => id !== entityId));
  }

  boardCells(encounter: EncounterConfig): Array<{ x: number; y: number; key: string }> {
    const width = encounter.board?.width ?? 8;
    const height = encounter.board?.height ?? 6;
    const cells: Array<{ x: number; y: number; key: string }> = [];

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        cells.push({ x, y, key: `${x}-${y}` });
      }
    }

    return cells;
  }

  boardEntityAt(encounter: EncounterConfig, entities: Entity[], x: number, y: number): Entity | null {
    const entityId = this.boardEntityIdAt(encounter, x, y);

    return entityId ? entities.find((entity) => entity.id === entityId) ?? null : null;
  }

  boardEntityIdAt(encounter: EncounterConfig, x: number, y: number): string {
    const positions = encounter.board?.positions ?? {};
    return Object.keys(positions).find((id) => positions[id]?.x === x && positions[id]?.y === y) ?? '';
  }

  moveEntityOnBoard(encounter: EncounterConfig, entityId: string, x: number, y: number): EncounterConfig {
    const positions = { ...(encounter.board?.positions ?? {}) };
    const occupyingEntityId = this.boardEntityIdAt(encounter, x, y);

    if (occupyingEntityId && occupyingEntityId !== entityId) {
      delete positions[occupyingEntityId];
    }

    positions[entityId] = { x, y };

    return this.withBoardPositions(encounter, positions);
  }

  removeEntityFromBoard(encounter: EncounterConfig, entityId: string): EncounterConfig {
    const positions = { ...(encounter.board?.positions ?? {}) };
    delete positions[entityId];

    return this.withBoardPositions(encounter, positions);
  }

  private withBoardPositions(encounter: EncounterConfig, positions: Record<string, { x: number; y: number }>): EncounterConfig {
    return {
      ...encounter,
      board: {
        width: encounter.board?.width ?? 8,
        height: encounter.board?.height ?? 6,
        visibility: encounter.board?.visibility ?? 'gmOnly',
        positions
      }
    };
  }
}
