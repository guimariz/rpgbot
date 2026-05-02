import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlayerSlot } from '../../../dashboard/dashboard.models';

@Component({
  selector: 'app-m-player-hp-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './m-player-hp-panel.component.html',
})
export class MPlayerHpPanelComponent {
  @Input() players: PlayerSlot[] = [];

  hpPct(current: number, max: number): number {
    return max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;
  }

  hpBarClass(current: number, max: number): string {
    const pct = max > 0 ? current / max : 0;
    if (pct > 0.66) return 'bg-emerald-500';
    if (pct > 0.33) return 'bg-amber-500';
    if (pct > 0)    return 'bg-rose-500';
    return 'bg-zinc-700';
  }

  hpNumClass(current: number, max: number): string {
    const pct = max > 0 ? current / max : 0;
    if (pct > 0.66) return 'text-emerald-400';
    if (pct > 0.33) return 'text-amber-400';
    if (pct > 0)    return 'text-rose-400';
    return 'text-zinc-600';
  }

  isCritical(current: number, max: number): boolean {
    return max > 0 && current / max <= 0.25;
  }
}
