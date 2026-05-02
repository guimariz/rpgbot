import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InitiativeEntry } from '../../../dashboard/dashboard.models';

@Component({
  selector: 'app-m-initiative-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './m-initiative-panel.component.html',
})
export class MInitiativePanelComponent {
  @Input() entries: InitiativeEntry[] = [];
  @Input() round = 1;

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
}
