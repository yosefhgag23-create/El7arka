import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ApiService } from '../../core/api.service';
import { fmtMoney, todayIso } from '../../core/format';
import { LookupsService } from '../../core/lookups.service';
import { OvertimeListItem } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { DateField, EntitySelect } from '../../shared/fields';
import { applyServerErrors, autoFillFromEquipment, clean, err } from '../../shared/forms';

@Component({
  selector: 'app-overtime-dialog',
  imports: [MatDialogModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, DateField, EntitySelect],
  template: `
    <div class="dialog-head"><span class="material-symbols-outlined">more_time</span><h2>{{ d.item ? 'تعديل وقت إضافي' : 'تسجيل وقت إضافي' }}</h2></div>
    <form [formGroup]="form" (ngSubmit)="save()">
      <div class="dialog-body">
        <div class="form-grid">
          <app-entity-select kind="drivers" label="السائق" formControlName="driverId" required [error]="e('driverId')" (selected)="resolveRate()" />
          <app-date-field label="تاريخ العمل" formControlName="workDate" required [error]="e('workDate')" />
          <app-entity-select kind="equipment" label="المعدة (اختياري)" formControlName="equipmentId" />
          <app-entity-select kind="projects" label="المشروع (اختياري)" formControlName="projectId" hint="يُملأ تلقائياً من تخصيص المعدة في التاريخ" />
          <mat-form-field>
            <mat-label>ساعات العمل العادية</mat-label>
            <input matInput type="number" formControlName="normalHours" />
            <mat-error>{{ e('normalHours') }}</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>ساعات إضافية</mat-label>
            <input matInput type="number" formControlName="overtimeHours" required />
            <mat-error>{{ e('overtimeHours') }}</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>سعر الساعة</mat-label>
            <input matInput type="number" formControlName="hourlyRate" />
            <mat-hint>{{ rateHint() }}</mat-hint>
            <mat-error>{{ e('hourlyRate') }}</mat-error>
          </mat-form-field>
          <div class="notice" style="align-self:center">القيمة: <strong class="num">{{ amount() }}</strong></div>
          <mat-form-field class="full"><mat-label>البيان</mat-label><input matInput formControlName="description" /></mat-form-field>
        </div>
        <p class="muted small" style="margin:8px 0 0">لا يُحتسب الوقت الإضافي ضمن التكاليف إلا بعد اعتماده.</p>
      </div>
      <div class="dialog-foot">
        <button class="btn" type="button" mat-dialog-close>إلغاء</button>
        <button class="btn primary" type="submit" [disabled]="busy()">حفظ</button>
      </div>
    </form>
  `,
})
export class OvertimeDialog implements OnInit {
  d = inject<{ item?: OvertimeListItem; driverId?: number }>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<OvertimeDialog>);
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private lookups = inject(LookupsService);
  busy = signal(false);
  resolved = signal<number | null>(null);
  private i = this.d.item;
  form = inject(FormBuilder).group({
    driverId: [this.i?.driverId ?? this.d.driverId ?? null as number | null, Validators.required],
    workDate: [this.i?.workDate ?? todayIso() as string | null, Validators.required],
    equipmentId: [this.i?.equipmentId ?? null as number | null],
    projectId: [this.i?.projectId ?? null as number | null],
    normalHours: [this.i?.normalHours ?? this.lookups.settings()?.defaultWorkingHours ?? null as number | null, Validators.min(0)],
    overtimeHours: [this.i?.overtimeHours ?? null as number | null, [Validators.required, Validators.min(0.01), Validators.max(24)]],
    hourlyRate: [this.i?.hourlyRate ?? null as number | null, Validators.min(0)],
    description: [this.i?.description ?? ''],
  });
  private v = toSignal(this.form.valueChanges, { initialValue: this.form.value });
  amount = computed(() => {
    const rate = this.v().hourlyRate ?? this.resolved();
    const h = Number(this.v().overtimeHours) || 0;
    return rate !== null && rate !== undefined ? fmtMoney(h * Number(rate)) : '—';
  });
  rateHint = computed(() => this.resolved() !== null ? `السعر المعتمد للسائق في التاريخ: ${fmtMoney(this.resolved())}` : 'لم يُحدد سعر للسائق في هذا التاريخ');
  e = (k: string) => err(this.form.get(k));
  private defaults = autoFillFromEquipment(this.form, {
    equipment: 'equipmentId', date: 'workDate', fill: { projectId: 'projectId' }, runNow: !this.i,
  });
  /** Rate last filled in automatically; the field is only replaced while it still holds that value. */
  private filledRate: number | null = null;

  ngOnInit(): void {
    this.resolveRate();
    this.form.controls.workDate.valueChanges.subscribe(() => this.resolveRate());
  }

  async resolveRate(): Promise<void> {
    setTimeout(async () => {
      const { driverId, workDate } = this.form.getRawValue();
      if (!driverId || !workDate) { this.resolved.set(null); return; }
      try { this.resolved.set((await this.api.get<{ rate: number | null }>('overtime/resolve-rate', { driverId, date: workDate })).rate); }
      catch { this.resolved.set(null); }
      const rate = this.form.controls.hourlyRate;
      if (this.resolved() !== null && (rate.value === null || `${rate.value}` === '' || rate.value === this.filledRate)) {
        rate.setValue(this.resolved());
        this.filledRate = this.resolved();
      }
    });
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    try {
      const body = clean(this.form.getRawValue());
      if (this.i) await this.api.put(`overtime/${this.i.id}`, body);
      else await this.api.post('overtime', body);
      this.notify.success('تم حفظ الوقت الإضافي');
      this.ref.close(true);
    } catch (ex) {
      if (!applyServerErrors(this.form, ex)) this.notify.error(ex);
    } finally { this.busy.set(false); }
  }
}
