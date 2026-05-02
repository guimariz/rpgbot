import { Component } from '@angular/core';
import { MInitiativePanelComponent } from './panels/m-initiative-panel/m-initiative-panel.component';
import { MPlayerHpPanelComponent } from './panels/m-player-hp-panel/m-player-hp-panel.component';
import { MEnemyHpPanelComponent } from './panels/m-enemy-hp-panel/m-enemy-hp-panel.component';
import { MNotesPanelComponent } from './panels/m-notes-panel/m-notes-panel.component';
import { MDicePanelComponent } from './panels/m-dice-panel/m-dice-panel.component';
import type { EnemySlot, InitiativeEntry, PlayerSlot } from '../dashboard/dashboard.models';

@Component({
  selector: 'app-dashboard-modern',
  standalone: true,
  imports: [
    MInitiativePanelComponent,
    MPlayerHpPanelComponent,
    MEnemyHpPanelComponent,
    MNotesPanelComponent,
    MDicePanelComponent,
  ],
  templateUrl: './dashboard-modern.component.html',
})
export class DashboardModernComponent {
  readonly players: PlayerSlot[] = [
    { id: 'p1', name: 'Aragorn',  currentHp: 45, maxHp: 60,  ac: 17, isActive: true },
    { id: 'p2', name: 'Gandalf',  currentHp: 28, maxHp: 50,  ac: 13 },
    { id: 'p3', name: 'Legolas',  currentHp: 52, maxHp: 52,  ac: 16 },
    { id: 'p4', name: 'Gimli',    currentHp: 12, maxHp: 55,  ac: 18, conditions: ['Inconsciente'] },
  ];

  readonly enemies: EnemySlot[] = [
    { id: 'e1', name: 'Orc Capitão',      currentHp: 30, maxHp: 45,  isAlive: true },
    { id: 'e2', name: 'Orc Guerreiro',    currentHp: 0,  maxHp: 22,  isAlive: false },
    { id: 'e3', name: 'Orc Guerreiro',    currentHp: 18, maxHp: 22,  isAlive: true },
    { id: 'e4', name: 'Troll das Pedras', currentHp: 84, maxHp: 138, isAlive: true, conditions: ['Atordoado'] },
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

  readonly round = 2;
}
