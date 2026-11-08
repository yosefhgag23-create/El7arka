import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { todayIso } from '../../core/format';
import { OvertimeRateDto } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { CellDef, Column, DataTable } from '../../shared/data-table';
import { DateField, EntitySelect } from '../../shared/fields';
import { applyServerErrors, clean, err } from '../../shared/forms';
import { Badge, PageHeader } from '../../shared/ui';
import { openDialog } from '../assignments/dialogs';
import { OvertimeRecords } from './overtime-records';

@Component({
  selector: 'app-overtime-page',
  imports: [PageHeader, OvertimeRecords, DataTable, CellDef, Badge, RouterLink, MatTooltipModule],
  template: `
    <div class="page">
      <app-page-header title="الوقت الإضافي" subtitle="ساعات العمل الإضافية للسائقين — تدخل التكاليف بعد الاعتماد فقط" [crumbs]="[{ label: 'الوقت الإضافي' }]" />
      <div class="tabs" style="margin-bottom:16px">
        <button [class.active]="tab() === 'records'" (click)="tab.set('records')">السجلات</button>
        <button [class.active]="tab() === 'rates'" (click)="showRates()">أسعار الساعة</button>
      </div>
      @if (tab() === 'records') {
        <app-overtime-records />
      } @else {
        <div class="card">
          <div class="filters">
            <span class="muted small">السعر الافتراضي يُطبق على كل السائقين ما لم يوجد سعر خاص بالسائق ساري في نفس التاريخ.</span>
            <span class="spacer"></span>
            @if (auth.isAdmin()) { <button class="btn primary" (click)="edit()"><span class="material-symbols-outlined">add</span>سعر جديد</button> }
          </div>
          <app-data-table [columns]="cols" [rows]="rates()" [paged]="false" [loading]="loading()" emptyIcon="price_change" emptyTitle="لم يتم تحديد أسعار للوقت الإضافي">
            <ng-template appCell="driver" let-r>
              @if (r.driverId) { <a class="link" [routerLink]="['/drivers', r.driverId]">{{ r.driverName }}</a> } @else { <app-badge label="السعر الافتراضي" tone="dark" /> }
            </ng-template>
            <ng-template appCell="actions" let-r>
              @if (auth.isAdmin()) {
                <div class="actions-cell">
                  <button class="btn ghost icon sm" matTooltip="تعديل" (click)="edit(r)"><span class="material-symbols-outlined">edit</span></button>
                  <button class="btn ghost icon sm" matTooltip="حذف" (click)="remove(r)"><span class="material-symbols-outlined">delete</span></button>
                </div>
              }
            </ng-template>
          </app-data-table>
        </div>
      }
    </div>
  `,
})
export class OvertimePage {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);
  auth = inject(AuthService);
  tab = signal<'records' | 'rates'>('records');
  rates = signal<OvertimeRateDto[]>([]);
  loading = signal(false);
  cols: Column<OvertimeRateDto>[] = [
    { key: 'driver', label: 'السائق' }, { key: 'hourlyRate', label: 'سعر الساعة', type: 'money' },
    { key: 'effectiveFrom', label: 'ساري من', type: 'date' }, { key: 'effectiveTo', label: 'حتى', type: 'date' },
    { key: 'notes', label: 'ملاحظات' }, { key: 'actions', label: '' },
  ];

  showRates(): void { this.tab.set('rates'); this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    try { this.rates.set(await this.api.get<OvertimeRateDto[]>('overtime/rates')); }
    catch (e) { this.notify.error(e); } finally { this.loading.set(false); }
  }

  async edit(rate?: OvertimeRateDto): Promise<void> { if (await openDialog(this.dialog, RateDialog, { rate }, '520px')) this.load(); }

  async remove(r: OvertimeRateDto): Promise<void> {
    if (!(await this.notify.confirm({ title: 'حذف السعر؟', message: 'السجلات المسجلة سابقاً تحتفظ بالسعر الذي حُسبت به.', danger: true, confirmText: 'حذف' }))) return;
    try { await this.api.delete(`overtime/rates/${r.id}`); this.notify.success('تم الحذف'); this.load(); }
    catch (e) { this.notify.error(e); }
  }
}

@Component({
  selector: 'app-rate-dialog',
  imports: [MatDialogModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, DateField, EntitySelect],
  template: `
    <div class="dialog-head"><span class="material-symbols-outlined">price_change</span><h2>{{ d.rate ? 'تعديل سعر' : 'سعر ساعة إضافية' }}</h2></div>
    <form [formGroup]="form" (ngSubmit)="save()">
      <div class="dialog-body stack" style="gap:8px">
        <app-entity-select kind="drivers" label="السائق (اتركه فارغاً للسعر الافتراضي)" formControlName="driverId" />
        <mat-form-field>
          <mat-label>سعر الساعة</mat-label>
          <input matInput type="number" formControlName="hourlyRate" required />
          <mat-error>{{ e('hourlyRate') }}</mat-error>
        </mat-form-field>
        <div class="form-grid">
          <app-date-field label="ساري من" formControlName="effectiveFrom" required [error]="e('effectiveFrom')" />
          <app-date-field label="حتى (اختياري)" formControlName="effectiveTo" [error]="e('effectiveTo')" />
        </div>
        <mat-form-field><mat-label>ملاحظات</mat-label><input matInput formControlName="notes" /></mat-form-field>
      </div>
      <div class="dialog-foot">
        <button class="btn" type="button" mat-dialog-close>إلغاء</button>
        <button class="btn primary" type="submit" [disabled]="busy()">حفظ</button>
      </div>
    </form>
  `,
})
export class RateDialog {
  d = inject<{ rate?: OvertimeRateDto }>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<RateDialog>);
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  busy = signal(false);
  private r = this.d.rate;
  form = inject(FormBuilder).group({
    driverId: [this.r?.driverId ?? null as number | null],
    hourlyRate: [this.r?.hourlyRate ?? null as number | null, [Validators.required, Validators.min(0)]],
    effectiveFrom: [this.r?.effectiveFrom ?? todayIso() as string | null, Validators.required],
    effectiveTo: [this.r?.effectiveTo ?? null as string | null],
    notes: [this.r?.notes ?? ''],
  });
  e = (k: string) => err(this.form.get(k));

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    try {
      const body = clean(this.form.getRawValue());
      if (this.r) await this.api.put(`overtime/rates/${this.r.id}`, body);
      else await this.api.post('overtime/rates', body);
      this.notify.success('تم حفظ السعر');
      this.ref.close(true);
    } catch (ex) {
      if (!applyServerErrors(this.form, ex)) this.notify.error(ex);
    } finally { this.busy.set(false); }
  }
}
