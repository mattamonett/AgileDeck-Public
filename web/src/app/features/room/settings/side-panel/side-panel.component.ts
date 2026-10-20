import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-side-panel',
  imports: [],
  templateUrl: './side-panel.component.html',
  styleUrl: './side-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidePanelComponent {
  isOpen = input(false);
  panelTitle = input('');
  closePanel = output<void>();
}
