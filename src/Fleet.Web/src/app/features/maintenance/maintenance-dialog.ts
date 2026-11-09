import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { merge } from 'rxjs';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ApiService } from '../../core/api.service';
import { fmtMoney, fmtNumber, fromIso, toIso, todayIso } from '../../core/format';
import { meterUnit } from '../../core/labels';
import { LookupsService } from '../../core/lookups.service';
import { EquipmentDto, MaintenanceListItem, MeterType } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { DateField, EntitySelect, FileUpload } from '../../shared/fields';
import { applyServerErrors, autoFillFromEquipment, clean, err } from '../../shared/forms';

export interface MaintenanceDialogData { item?: MaintenanceListItem; equipmentId?: number; maintenanceTypeId?: number; }

@Component({
  selector: 'app-maintenance-dialog',
  imports: [MatDialogModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, DateField, EntitySelect, FileUpload],
  template: `
    <div class="dialog-head"><span class="material-symbols-outlined">build</span><h2>{{ d.item ? 'تعديل عملية صيانة' : 'تسجيل صيانة' }}</h2></div>
    <form [formGroup]="form" (ngSubmit)="save()">
      <div class="dialog-body">
        <div class="form-grid">
          <app-entity-select class="full" kind="equipment" label="المعدة" formControlName="equipmentId" required [error]="e('equipmentId')" (selected)="equipmentPicked($event)" />
          <mat-form-field>
            <mat-label>نوع الصيانة</mat-label>
            <mat-select formControlName="maintenanceTypeId" required>
              @for (t of types; track t.id) { <mat-option [value]="t.id">{{ t.nameAr }}</mat-option> }
            </mat-select>
            <mat-error>{{ e('maintenanceTypeId') }}</mat-error>
          </mat-form-field>
          <app-date-field label="تاريخ الصيانة" formControlName="maintenanceDate" required [error]="e('maintenanceDate')" />
          <mat-form-field>
            <mat-label>قراءة العداد ({{ unit() }})</mat-label>
            <input matInput type="number" formControlName="meterReading" />
            @if (lastMeter()) { <mat-hint>آخر قراءة: {{ lastMeter() }}</mat-hint> }
            <mat-error>{{ e('meterReading') }}</mat-error>
          </mat-form-field>
          <mat-form-field><mat-label>الورشة / مقدم الخدمة</mat-label><input matInput formControlName="workshop" /></mat-form-field>
          <mat-form-field class="full"><mat-label>وصف العمل</mat-label><textarea matInput rows="2" formControlName="description"></textarea></mat-form-field>

          <div class="form-section-title">التكلفة</div>
          <mat-form-field>
            <mat-label>قطع الغيار</mat-label>
            <input matInput type="number" formControlName="partsCost" />
            <mat-hint>تُسجَّل في بند قطع الغيار</mat-hint>
            <mat-error>{{ e('partsCost') }}</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>المصنعية</mat-label>
            <input matInput type="number" formControlName="laborCost" />
            <mat-error>{{ e('laborCost') }}</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>تكاليف أخرى</mat-label>
            <input matInput type="number" formControlName="otherCost" />
            <mat-error>{{ e('otherCost') }}</mat-error>
          </mat-form-field>
          <div class="notice" style="align-self:center">الإجمالي: <strong class="num">{{ total() }}</strong></div>

          <div class="form-section-title">الصيانة القادمة</div>
          <app-date-field label="الموعد القادم (تاريخ)" formControlName="nextDueDate" [error]="e('nextDueDate')" [hint]="nextHint()" />
          <mat-form-field>
            <mat-label>الموعد القادم (عداد {{ unit() }})</mat-label>
            <input matInput type="number" formControlName="nextDueMeter" />
            <mat-error>{{ e('nextDueMeter') }}</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>أيام التوقف</mat-label>
            <input matInput type="number" formControlName="downtimeDays" />
            <mat-error>{{ e('downtimeDays') }}</mat-error>
          </mat-form-field>
          <app-entity-select kind="projects" label="المشروع" formControlName="projectId" hint="يُملأ تلقائياً من تخصيص المعدة في التاريخ" />
          <mat-form-field class="full"><mat-label>ملاحظات</mat-label><input matInput formControlName="notes" /></mat-form-field>
          <div class="full"><app-file-upload ownerType="Maintenance" [current]="form.value.attachmentId" (uploaded)="form.controls.attachmentId.setValue($event)" /></div>
        </div>
      </div>
      <div class="dialog-foot">
        <button class="btn" type="button" mat-dialog-close>إلغاء</button>
        <button class="btn primary" type="submit" [disabled]="busy()">حفظ</button>
      </div>
    </form>
  `,
})
export class MaintenanceDialog implements OnInit {
  d = inject<MaintenanceDialogData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<MaintenanceDialog>);
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private lookups = inject(LookupsService);
  private destroy = inject(DestroyRef);
  types = this.lookups.active('MaintenanceTypes');
  busy = signal(false);
  meterType = signal<MeterType>('Kilometers');
  lastMeter = signal<string | null>(null);
  unit = computed(() => meterUnit(this.meterType()));

  private i = this.d.item;
  form = inject(FormBuilder).group({
    equipmentId: [this.i?.equipmentId ?? this.d.equipmentId ?? null as number | null, Validators.required],
    maintenanceTypeId: [this.i?.maintenanceTypeId ?? this.d.maintenanceTypeId ?? null as number | null, Validators.required],
    maintenanceDate: [this.i?.maintenanceDate ?? todayIso() as string | null, Validators.required],
    meterReading: [this.i?.meterReading ?? null as number | null, Validators.min(0)],
    description: [this.i?.description ?? ''],
    workshop: [this.i?.workshop ?? ''],
    partsCost: [this.i?.partsCost ?? 0 as number | null, Validators.min(0)],
    laborCost: [this.i?.laborCost ?? 0 as number | null, Validators.min(0)],
    otherCost: [this.i?.otherCost ?? 0 as number | null, Validators.min(0)],
    downtimeDays: [this.i?.downtimeDays ?? null as number | null, Validators.min(0)],
    nextDueDate: [this.i?.nextDueDate ?? null as string | null],
    nextDueMeter: [this.i?.nextDueMeter ?? null as number | null],
    projectId: [this.i?.projectId ?? null as number | null],
    attachmentId: [this.i?.attachmentId ?? null as number | null],
    notes: [this.i?.notes ?? ''],
  });
  private v = toSignal(this.form.valueChanges, { initialValue: this.form.value });
  total = computed(() => fmtMoney((Number(this.v().partsCost) || 0) + (Number(this.v().laborCost) || 0) + (Number(this.v().otherCost) || 0)));
  nextHint = computed(() => {
    const t = this.types.find(x => x.id === this.v().maintenanceTypeId);
    if (!t) return '';
    const parts = [
      t.defaultIntervalDays ? `${t.defaultIntervalDays} يوم` : '',
      this.meterType() === 'Kilometers' && t.defaultIntervalKm ? `${fmtNumber(t.defaultIntervalKm)} كم` : '',
      this.meterType() === 'EngineHours' && t.defaultIntervalHours ? `${fmtNumber(t.defaultIntervalHours)} ساعة` : '',
    ].filter(Boolean);
    return parts.length ? `محسوب تلقائياً: كل ${parts.join(' أو ')}` : '';
  });
  e = (k: string) => err(this.form.get(k));
  private defaults = autoFillFromEquipment(this.form, {
    equipment: 'equipmentId', date: 'maintenanceDate', fill: { projectId: 'projectId' }, runNow: !this.i,
  });
  /** Last values suggested for the next-due fields; a field still holding its suggestion may be re-suggested. */
  private suggested: { nextDueDate?: string | null; nextDueMeter?: number | null } = {};

  ngOnInit(): void {
    if (this.form.value.equipmentId) this.loadEquipment(this.form.value.equipmentId);
    const c = this.form.controls;
    merge(c.maintenanceTypeId.valueChanges, c.maintenanceDate.valueChanges, c.meterReading.valueChanges)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe(() => this.suggestNextDue());
  }

  /** Fills the next due date / meter from the maintenance type's default interval, unless the user entered them. */
  private suggestNextDue(): void {
    const v = this.form.getRawValue();
    const t = this.types.find(x => x.id === v.maintenanceTypeId);
    const interval = this.meterType() === 'Kilometers' ? t?.defaultIntervalKm : t?.defaultIntervalHours;
    const start = fromIso(v.maintenanceDate);
    if (start && t?.defaultIntervalDays) start.setDate(start.getDate() + t.defaultIntervalDays);
    const date = t?.defaultIntervalDays && start ? toIso(start) : null;
    const meter = interval && v.meterReading !== null && `${v.meterReading}` !== '' ? Number(v.meterReading) + interval : null;
    for (const [key, value] of [['nextDueDate', date], ['nextDueMeter', meter]] as const) {
      const ctrl = this.form.controls[key];
      if (ctrl.value === null || ctrl.value === '' || ctrl.value === this.suggested[key]) {
        ctrl.setValue(value as never);
        this.suggested[key] = value as never;
      }
    }
  }

  equipmentPicked(e: { id: number } | null): void { if (e) this.loadEquipment(e.id); }

  private async loadEquipment(id: number): Promise<void> {
    const e = await this.api.get<EquipmentDto>(`equipment/${id}`);
    this.meterType.set(e.meterType);
    this.lastMeter.set(fmtNumber(e.currentMeterReading));
    this.suggestNextDue();
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    try {
      const v = clean(this.form.getRawValue());
      const body = { ...v, partsCost: v.partsCost ?? 0, laborCost: v.laborCost ?? 0, otherCost: v.otherCost ?? 0 };
      if (this.i) await this.api.put(`maintenance/${this.i.id}`, body);
      else await this.api.post('maintenance', body);
      this.notify.success('تم حفظ عملية الصيانة');
      this.ref.close(true);
    } catch (ex) {
      if (!applyServerErrors(this.form, ex)) this.notify.error(ex);
    } finally { this.busy.set(false); }
  }
}
