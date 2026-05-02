import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EnemySlot } from '../../dashboard.models';

@Component({
  selector: 'app-enemy-hp-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './enemy-hp-panel.component.html',
})
export class EnemyHpPanelComponent {
  @Input() enemies: EnemySlot[] = [];

  aliveCount(): number {
    return this.enemies.filter(e => e.isAlive).length;
  }

  hpPct(current: number, max: number): number {
    return max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;
  }

  hpBarClass(current: number, max: number): string {
    const pct = max > 0 ? current / max : 0;
    if (pct > 0.75) return 'bg-hp-full';
    if (pct > 0.5)  return 'bg-hp-high';
    if (pct > 0.25) return 'bg-hp-mid';
    if (pct > 0)    return 'bg-hp-low';
    return 'bg-hp-dead';
  }
}
