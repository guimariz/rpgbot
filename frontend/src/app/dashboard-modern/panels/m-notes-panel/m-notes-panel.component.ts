import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-m-notes-panel',
  standalone: true,
  templateUrl: './m-notes-panel.component.html',
})
export class MNotesPanelComponent {
  readonly content = signal('• Goblins armando emboscada no N4\n• Rei Gorm: aliado relutante — não revelar ainda\n• Portal instável: 1d6 de dano arcano ao passar');
}
