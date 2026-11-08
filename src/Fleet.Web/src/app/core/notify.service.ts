import { HttpErrorResponse } from '@angular/common/http';
import { Component, Injectable, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';

export interface ApiProblem { title?: string; status?: number; errors?: Record<string, string[]>; }

export function problemOf(err: unknown): ApiProblem {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return { title: 'تعذر الاتصال بالخادم المحلي' };
    const body = err.error;
    if (body && typeof body === 'object') return body as ApiProblem;
    return { title: `خطأ ${err.status}` };
  }
  return { title: err instanceof Error ? err.message : 'حدث خطأ غير متوقع' };
}

@Injectable({ providedIn: 'root' })
export class NotifyService {
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  success(message: string): void {
    this.snack.open(message, 'إغلاق', { duration: 3000, panelClass: 'toast-success', direction: 'rtl', horizontalPosition: 'start' });
  }

  error(err: unknown): void {
    const p = problemOf(err);
    const detail = p.errors ? Object.values(p.errors).flat().filter(m => m !== p.title).join(' • ') : '';
    const msg = [p.title, detail].filter(Boolean).join(' — ');
    this.snack.open(msg || 'حدث خطأ', 'إغلاق', { duration: 6000, panelClass: 'toast-error', direction: 'rtl', horizontalPosition: 'start' });
  }

  async confirm(opts: ConfirmOptions): Promise<boolean> {
    const ref = this.dialog.open(ConfirmDialog, { data: opts, width: '440px', direction: 'rtl', autoFocus: false });
    return (await firstValueFrom(ref.afterClosed())) === true;
  }

  /** Confirm with a required free-text reason (used for deletions that keep history). */
  async confirmWithReason(opts: ConfirmOptions): Promise<string | null> {
    const ref = this.dialog.open(ConfirmDialog, { data: { ...opts, askReason: true }, width: '460px', direction: 'rtl', autoFocus: false });
    const r = await firstValueFrom(ref.afterClosed());
    return typeof r === 'string' ? r : null;
  }
}

export interface ConfirmOptions { title: string; message?: string; confirmText?: string; danger?: boolean; askReason?: boolean; }

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, FormsModule],
  template: `
    <div class="dialog-head">
      <span class="material-symbols-outlined" [style.color]="data.danger ? 'var(--danger)' : 'var(--text)'">{{ data.danger ? 'warning' : 'help' }}</span>
      <h2>{{ data.title }}</h2>
    </div>
    <div class="dialog-body">
      @if (data.message) { <p class="muted" style="margin:0 0 8px">{{ data.message }}</p> }
      @if (data.askReason) {
        <textarea [(ngModel)]="reason" rows="3" placeholder="السبب (مطلوب)"
          style="width:100%;font:inherit;padding:10px;border:1px solid var(--border-strong);border-radius:6px;resize:vertical"></textarea>
      }
    </div>
    <div class="dialog-foot">
      <button class="btn" (click)="ref.close(false)">إلغاء</button>
      <button class="btn" [class.primary]="!data.danger" [class.danger]="data.danger" [disabled]="data.askReason && !reason.trim()"
        (click)="ref.close(data.askReason ? reason.trim() : true)">{{ data.confirmText ?? 'تأكيد' }}</button>
    </div>
  `,
})
export class ConfirmDialog {
  data = inject<ConfirmOptions>(MAT_DIALOG_DATA);
  ref = inject(MatDialogRef<ConfirmDialog>);
  reason = '';
}
