import { Component, computed, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BoardToken } from '../../dashboard.models';

interface Cell {
  id: number;
  row: number;
  col: number;
  token: BoardToken | null;
}

@Component({
  selector: 'app-tactic-board-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tactic-board-panel.component.html',
})
export class TacticBoardPanelComponent {
  @Input() set rows(v: number) { this._rows.set(v); }
  @Input() set cols(v: number) { this._cols.set(v); }
  @Input() set tokens(v: BoardToken[]) { this._tokens.set(v); }

  readonly _rows   = signal(10);
  readonly _cols   = signal(15);
  readonly _tokens = signal<BoardToken[]>([]);

  readonly cells = computed<Cell[]>(() => {
    const rows = this._rows();
    const cols = this._cols();
    const tokens = this._tokens();
    return Array.from({ length: rows * cols }, (_, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      return {
        id: i,
        row,
        col,
        token: tokens.find(t => t.row === row && t.col === col) ?? null,
      };
    });
  });

  readonly colsStyle = computed(() => `repeat(${this._cols()}, minmax(0, 1fr))`);

  trackCell(_: number, cell: Cell): number { return cell.id; }
}
