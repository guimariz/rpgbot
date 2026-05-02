import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EnemySlot } from '../../../dashboard/dashboard.models';

@Component({
  selector: 'app-m-enemy-hp-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './m-enemy-hp-panel.component.html',
})
export class MEnemyHpPanelComponent {
  @Input() enemies: EnemySlot[] = [];

  aliveCount(): number {
    return this.enemies.filter(e => e.isAlive).length;
  }

  hpPct(current: number, max: number): number {
    return max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;
  }

  hpBarClass(current: number, max: number): string {
    const pct = max > 0 ? current / max : 0;
    if (pct > 0.66) return 'bg-rose-700';
    if (pct > 0.33) return 'bg-rose-500';
    if (pct > 0)    return 'bg-rose-400';
    return 'bg-zinc-700';
  }
}
