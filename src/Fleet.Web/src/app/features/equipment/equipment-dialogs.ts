import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { ApiService } from '../../core/api.service';
import { fmtNumber, todayIso } from '../../core/format';
import { EQUIPMENT_STATUS, RATE_TYPE, meterUnit, options } from '../../core/labels';
import { AuthService } from '../../core/auth.service';
import { EquipmentStatus, MeterType, RentalContractDto, RentalRateType } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { DateField, FileUpload } from '../../shared/fields';
import { applyServerErrors, clean, err } from '../../shared/forms';

/* ===================== Status change ===================== */
@Component({
  selector: 'app-status-dialog',
  imports: [MatDialogModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, DateField],
  template: `
    <div class="dialog-head"><span class="material-symbols-outlined">flag</span><h2>تغيير حالة المعدة</h2></div>
    <form [formGroup]="form" (ngSubmit)="save()">
      <div class="dialog-body stack" style="gap:8px">
        <mat-form-field>
          <mat-label>الحالة الجديدة</mat-label>
          <mat-select formControlName="status">
            @for (o of statusOptions; track o.value) { <mat-option [value]="o.value" [disabled]="o.value === d.current">{{ o.label }}</mat-option> }
          </mat-select>
          <mat-error>{{ e('status') }}</mat-error>
        </mat-form-field>
        <app-date-field label="اعتباراً من" formControlName="date" required [error]="e('date')" />
        <mat-form-field><mat-label>السبب</mat-label><textarea matInput rows="2" formControlName="reason"></textarea></mat-form-field>
      </div>
      <div class="dialog-foot">
        <button class="btn" type="button" mat-dialog-close>إلغاء</button>
        <button class="btn primary" type="submit" [disabled]="busy()">حفظ</button>
      </div>
    </form>
  `,
})
export class StatusDialog {
  d = inject<{ equipmentId: number; current: EquipmentStatus }>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<StatusDialog>);
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  statusOptions = options(EQUIPMENT_STATUS);
  busy = signal(false);
  form = inject(FormBuilder).group({
    status: [null as EquipmentStatus | null, Validators.required],
    date: [todayIso() as string | null, Validators.required],
    reason: [''],
  });
  e = (k: string) => err(this.form.get(k));

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    try {
      await this.api.post(`equipment/${this.d.equipmentId}/status`, clean(this.form.getRawValue()));
      this.notify.success('تم تغيير الحالة');
      this.ref.close(true);
    } catch (ex) {
      if (!applyServerErrors(this.form, ex)) this.notify.error(ex);
    } finally { this.busy.set(false); }
  }
}

/* ===================== Manual meter reading ===================== */
@Component({
  selector: 'app-meter-dialog',
  imports: [MatDialogModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatCheckboxModule, DateField],
  template: `
    <div class="dialog-head"><span class="material-symbols-outlined">speed</span><h2>تسجيل قراءة عداد</h2></div>
    <form [formGroup]="form" (ngSubmit)="save()">
      <div class="dialog-body stack" style="gap:8px">
        <div class="notice">آخر قراءة: <strong class="num">{{ current }}</strong> {{ unit }}</div>
        <div class="form-grid">
          <app-date-field label="التاريخ" formControlName="readingDate" required [error]="e('readingDate')" />
          <mat-form-field>
            <mat-label>القراءة ({{ unit }})</mat-label>
            <input matInput type="number" formControlName="value" required />
            <mat-error>{{ e('value') }}</mat-error>
          </mat-form-field>
        </div>
        @if (auth.isAdmin()) {
          <mat-checkbox formControlName="isCorrection">تصحيح (يسمح بقراءة أقل من السابقة — يتطلب سبباً)</mat-checkbox>
          @if (form.value.isCorrection) {
            <mat-form-field>
              <mat-label>سبب التصحيح</mat-label>
              <input matInput formControlName="correctionReason" required />
              <mat-error>{{ e('correctionReason') }}</mat-error>
            </mat-form-field>
          }
        }
      </div>
      <div class="dialog-foot">
        <button class="btn" type="button" mat-dialog-close>إلغاء</button>
        <button class="btn primary" type="submit" [disabled]="busy()">حفظ</button>
      </div>
    </form>
  `,
})
export class MeterDialog {
  d = inject<{ equipmentId: number; meterType: MeterType; currentMeter: number }>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<MeterDialog>);
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  auth = inject(AuthService);
  unit = meterUnit(this.d.meterType);
  current = fmtNumber(this.d.currentMeter);
  busy = signal(false);
  form = inject(FormBuilder).group({
    readingDate: [todayIso() as string | null, Validators.required],
    value: [null as number | null, [Validators.required, Validators.min(0)]],
    isCorrection: [false],
    correctionReason: [''],
  });
  e = (k: string) => err(this.form.get(k));

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    try {
      await this.api.post(`equipment/${this.d.equipmentId}/meter-readings`, clean(this.form.getRawValue()));
      this.notify.success('تم تسجيل القراءة');
      this.ref.close(true);
    } catch (ex) {
      if (!applyServerErrors(this.form, ex)) this.notify.error(ex);
    } finally { this.busy.set(false); }
  }
}

/* ===================== Rental contract ===================== */
@Component({
  selector: 'app-rental-dialog',
  imports: [MatDialogModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule, DateField, FileUpload],
  template: `
    <div class="dialog-head"><span class="material-symbols-outlined">key</span><h2>{{ d.contract ? 'تعديل عقد إيجار' : 'عقد إيجار جديد' }}</h2></div>
    <form [formGroup]="form" (ngSubmit)="save()">
      <div class="dialog-body">
        <div class="form-grid">
          <mat-form-field>
            <mat-label>المؤجر</mat-label>
            <input matInput formControlName="lessor" required />
            <mat-error>{{ e('lessor') }}</mat-error>
          </mat-form-field>
          <mat-form-field><mat-label>هاتف المؤجر</mat-label><input matInput formControlName="lessorPhone" /></mat-form-field>
          <mat-form-field><mat-label>رقم العقد</mat-label><input matInput formControlName="contractNo" /></mat-form-field>
          <div></div>
          <app-date-field label="بداية العقد" formControlName="startDate" required [error]="e('startDate')" />
          <app-date-field label="نهاية العقد (اختياري)" formControlName="endDate" [error]="e('endDate')" />
          <mat-form-field>
            <mat-label>طريقة الاحتساب</mat-label>
            <mat-select formControlName="rateType">
              @for (o of rateOptions; track o.value) { <mat-option [value]="o.value">{{ o.label }}</mat-option> }
            </mat-select>
            @if (form.value.rateType === 'Hourly' || form.value.rateType === 'PerKm') {
              <mat-hint>يُحسب من قراءات العداد الفعلية لكل شهر</mat-hint>
            } @else {
              <mat-hint>يُسجَّل تلقائياً كمصروف شهري موزع على الأيام</mat-hint>
            }
          </mat-form-field>
          <mat-form-field>
            <mat-label>القيمة</mat-label>
            <input matInput type="number" formControlName="rate" required />
            <mat-error>{{ e('rate') }}</mat-error>
          </mat-form-field>
          <div class="full row wrap">
            <mat-checkbox formControlName="includesDriver">شامل السائق</mat-checkbox>
            <mat-checkbox formControlName="includesFuel">شامل الوقود</mat-checkbox>
            <mat-checkbox formControlName="includesMaintenance">شامل الصيانة</mat-checkbox>
          </div>
          <div class="full" style="margin:8px 0">
            <app-file-upload label="صورة العقد (اختياري)" ownerType="RentalContract" [current]="form.value.attachmentId" (uploaded)="form.controls.attachmentId.setValue($event)" />
          </div>
          <mat-form-field class="full"><mat-label>ملاحظات</mat-label><textarea matInput rows="2" formControlName="notes"></textarea></mat-form-field>
        </div>
      </div>
      <div class="dialog-foot">
        <button class="btn" type="button" mat-dialog-close>إلغاء</button>
        <button class="btn primary" type="submit" [disabled]="busy()">حفظ</button>
      </div>
    </form>
  `,
})
export class RentalDialog {
  d = inject<{ equipmentId: number; contract?: RentalContractDto }>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<RentalDialog>);
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  rateOptions = options(RATE_TYPE);
  busy = signal(false);
  form = inject(FormBuilder).group({
    contractNo: [this.d.contract?.contractNo ?? ''],
    lessor: [this.d.contract?.lessor ?? '', Validators.required],
    lessorPhone: [this.d.contract?.lessorPhone ?? ''],
    startDate: [this.d.contract?.startDate ?? todayIso() as string | null, Validators.required],
    endDate: [this.d.contract?.endDate ?? null as string | null],
    rateType: [this.d.contract?.rateType ?? 'Monthly' as RentalRateType],
    rate: [this.d.contract?.rate ?? null as number | null, [Validators.required, Validators.min(0.01)]],
    includesDriver: [this.d.contract?.includesDriver ?? false],
    includesFuel: [this.d.contract?.includesFuel ?? false],
    includesMaintenance: [this.d.contract?.includesMaintenance ?? false],
    attachmentId: [this.d.contract?.attachmentId ?? null as number | null],
    notes: [this.d.contract?.notes ?? ''],
  });
  e = (k: string) => err(this.form.get(k));

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    try {
      const body = clean(this.form.getRawValue());
      if (this.d.contract) await this.api.put(`equipment/rental-contracts/${this.d.contract.id}`, body);
      else await this.api.post(`equipment/${this.d.equipmentId}/rental-contracts`, body);
      this.notify.success('تم حفظ العقد وتحديث مصروفات الإيجار');
      this.ref.close(true);
    } catch (ex) {
      if (!applyServerErrors(this.form, ex)) this.notify.error(ex);
    } finally { this.busy.set(false); }
  }
}
