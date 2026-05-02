import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Roll { die: number; result: number; }

@Component({
  selector: 'app-m-dice-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './m-dice-panel.component.html',
})
export class MDicePanelComponent {
  readonly dice = [4, 6, 8, 10, 12, 20, 100] as const;
  readonly history = signal<Roll[]>([]);
  readonly latest  = computed(() => this.history().at(-1) ?? null);

  roll(die: number): void {
    const result = Math.floor(Math.random() * die) + 1;
    this.history.update(h => [...h.slice(-4), { die, result }]);
  }

  isCrit(roll: Roll):   boolean { return roll.result === roll.die; }
  isFumble(roll: Roll): boolean { return roll.result === 1; }

  resultClass(roll: Roll): string {
    if (this.isCrit(roll))   return 'text-neon-cyan';
    if (this.isFumble(roll)) return 'text-neon-rose';
    return 'text-zinc-100';
  }
}
