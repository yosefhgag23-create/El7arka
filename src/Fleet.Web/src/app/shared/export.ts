import { Component, inject, input, signal } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../core/api.service';
import { NotifyService } from '../core/notify.service';

/** PDF / Excel export of a server report (`/api/reports/{key}`) with the given filter values. */
@Component({
  selector: 'app-export',
  imports: [MatTooltipModule],
  template: `
    <div class="exp">
      <button class="btn sm" type="button" [disabled]="busy()" (click)="download('pdf')" matTooltip="تصدير PDF للطباعة">
        <span class="material-symbols-outlined">picture_as_pdf</span>PDF
      </button>
      <button class="btn sm" type="button" [disabled]="busy()" (click)="download('xlsx')" matTooltip="تصدير Excel">
        <span class="material-symbols-outlined">table_view</span>Excel
      </button>
    </div>
  `,
  styles: `
    .exp { display: inline-flex; gap: 6px; }
    .exp .material-symbols-outlined { color: var(--brand); }
  `,
})
export class ExportButtons {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  report = input.required<string>();
  query = input<object>({});
  busy = signal(false);

  async download(format: 'pdf' | 'xlsx'): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.download(`reports/${this.report()}/${format}`, this.query());
      this.notify.success(format === 'pdf' ? 'تم تصدير ملف PDF' : 'تم تصدير ملف Excel');
    } catch (e) { this.notify.error(e); }
    finally { this.busy.set(false); }
  }
}
