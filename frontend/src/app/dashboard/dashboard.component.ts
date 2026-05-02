import { Component } from '@angular/core';
import { InitiativePanelComponent } from './panels/initiative-panel/initiative-panel.component';
import { PlayerHpPanelComponent } from './panels/player-hp-panel/player-hp-panel.component';
import { EnemyHpPanelComponent } from './panels/enemy-hp-panel/enemy-hp-panel.component';
import { TacticBoardPanelComponent } from './panels/tactic-board-panel/tactic-board-panel.component';
import type { BoardToken, EnemySlot, InitiativeEntry, PlayerSlot } from './dashboard.models';

@Component({
  selector: 'app-dashboard-v2',
  standalone: true,
  imports: [InitiativePanelComponent, PlayerHpPanelComponent, EnemyHpPanelComponent, TacticBoardPanelComponent],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  // Dados de exemplo para testar o layout visual
  readonly players: PlayerSlot[] = [
    { id: 'p1', name: 'Aragorn',  currentHp: 45,  maxHp: 60,  ac: 17, isActive: true },
    { id: 'p2', name: 'Gandalf',  currentHp: 28,  maxHp: 50,  ac: 13 },
    { id: 'p3', name: 'Legolas',  currentHp: 52,  maxHp: 52,  ac: 16 },
    { id: 'p4', name: 'Gimli',    currentHp: 12,  maxHp: 55,  ac: 18, conditions: ['Inconsciente'] },
  ];

  readonly enemies: EnemySlot[] = [
    { id: 'e1', name: 'Orc Capitão',       currentHp: 30,  maxHp: 45,  isAlive: true },
    { id: 'e2', name: 'Orc Guerreiro',     currentHp: 0,   maxHp: 22,  isAlive: false },
    { id: 'e3', name: 'Orc Guerreiro',     currentHp: 18,  maxHp: 22,  isAlive: true },
    { id: 'e4', name: 'Troll das Pedras',  currentHp: 84,  maxHp: 138, isAlive: true, conditions: ['Atordoado'] },
  ];

  readonly initiatives: InitiativeEntry[] = [
    { id: 'p1', name: 'Aragorn',          initiative: 22, isPlayer: true,  isCurrentTurn: false },
    { id: 'e4', name: 'Troll das Pedras', initiative: 19, isPlayer: false, isCurrentTurn: true,  hpCurrent: 84, hpMax: 138 },
    { id: 'p3', name: 'Legolas',          initiative: 18, isPlayer: true,  isCurrentTurn: false },
    { id: 'e1', name: 'Orc Capitão',      initiative: 14, isPlayer: false, isCurrentTurn: false, hpCurrent: 30, hpMax: 45 },
    { id: 'p2', name: 'Gandalf',          initiative: 12, isPlayer: true,  isCurrentTurn: false },
    { id: 'p4', name: 'Gimli',            initiative: 9,  isPlayer: true,  isCurrentTurn: false },
    { id: 'e3', name: 'Orc Guerreiro',    initiative: 7,  isPlayer: false, isCurrentTurn: false, hpCurrent: 18, hpMax: 22 },
  ];

  readonly tokens: BoardToken[] = [
    { id: 'p1', label: 'Aragorn',  row: 4, col: 5,  isPlayer: true },
    { id: 'p3', label: 'Legolas',  row: 3, col: 6,  isPlayer: true },
    { id: 'p2', label: 'Gandalf',  row: 5, col: 4,  isPlayer: true },
    { id: 'p4', label: 'Gimli',    row: 5, col: 6,  isPlayer: true },
    { id: 'e4', label: 'Troll',    row: 4, col: 9,  isPlayer: false },
    { id: 'e1', label: 'OrcCap',   row: 3, col: 10, isPlayer: false },
    { id: 'e3', label: 'Orc',      row: 5, col: 10, isPlayer: false },
  ];

  readonly round = 2;
}
