import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { ApiService } from '../../core/api.service';
import { fmtNumber, todayIso } from '../../core/format';
import { meterUnit } from '../../core/labels';
import { LookupsService } from '../../core/lookups.service';
import { EquipmentDto, FuelListItem } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { DateField, EntitySelect, FileUpload } from '../../shared/fields';
import { applyServerErrors, autoFillFromEquipment, clean, err, linkAmounts } from '../../shared/forms';

export interface FuelDialogData { item?: FuelListItem; equipmentId?: number; }

@Component({
  selector: 'app-fuel-dialog',
  imports: [MatDialogModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule, DateField, EntitySelect, FileUpload],
  template: `
    <div class="dialog-head"><span class="material-symbols-outlined">local_gas_station</span><h2>{{ d.item ? 'تعديل عملية تموين' : 'تسجيل تموين' }}</h2></div>
    <form [formGroup]="form" (ngSubmit)="save()">
      <div class="dialog-body">
        <div class="form-grid">
          <app-entity-select class="full" kind="equipment" label="المعدة" formControlName="equipmentId" required [error]="e('equipmentId')" (selected)="equipmentPicked($event)" />
          <app-date-field label="التاريخ" formControlName="fuelDate" required [error]="e('fuelDate')" />
          <mat-form-field>
            <mat-label>نوع الوقود</mat-label>
            <mat-select formControlName="fuelTypeId">
              <mat-option [value]="null">حسب المعدة</mat-option>
              @for (f of fuelTypes; track f.id) { <mat-option [value]="f.id">{{ f.nameAr }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>الكمية ({{ unitName() }})</mat-label>
            <input matInput type="number" formControlName="quantity" required />
            <mat-error>{{ e('quantity') }}</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>سعر الوحدة</mat-label>
            <input matInput type="number" formControlName="pricePerUnit" />
            <mat-hint>آخر سعر مسجل — أو أدخل الإجمالي</mat-hint>
            <mat-error>{{ e('pricePerUnit') }}</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>الإجمالي</mat-label>
            <input matInput type="number" formControlName="totalAmount" />
            <mat-hint>يُحسب تلقائياً من الكمية × السعر</mat-hint>
            <mat-error>{{ e('totalAmount') }}</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>قراءة العداد ({{ unit() }})</mat-label>
            <input matInput type="number" formControlName="meterReading" />
            @if (lastMeter() !== null) { <mat-hint>آخر قراءة: {{ lastMeter() }}</mat-hint> }
            <mat-error>{{ e('meterReading') }}</mat-error>
          </mat-form-field>
          <div class="full"><mat-checkbox formControlName="isFullTank">تفويل كامل (تانك فل) — يُستخدم لحساب معدل الاستهلاك</mat-checkbox></div>
          <app-entity-select kind="drivers" label="السائق (اختياري)" formControlName="driverId" [error]="e('driverId')" />
          <app-entity-select kind="projects" label="المشروع" formControlName="projectId" hint="يُملأ تلقائياً من تخصيص المعدة في التاريخ" />
          <mat-form-field><mat-label>المحطة</mat-label><input matInput formControlName="station" /></mat-form-field>
          <mat-form-field><mat-label>ملاحظات</mat-label><input matInput formControlName="notes" /></mat-form-field>
          <div class="full" style="margin-top:8px">
            <app-file-upload ownerType="Fuel" [current]="form.value.attachmentId" (uploaded)="form.controls.attachmentId.setValue($event)" />
          </div>
        </div>
      </div>
      <div class="dialog-foot">
        <button class="btn" type="button" (click)="ref.close(saved)">{{ saved ? 'إغلاق' : 'إلغاء' }}</button>
        @if (!d.item) { <button class="btn" type="button" [disabled]="busy()" (click)="save(true)">حفظ وإضافة آخر</button> }
        <button class="btn primary" type="submit" [disabled]="busy()">حفظ</button>
      </div>
    </form>
  `,
})
export class FuelDialog implements OnInit {
  d = inject<FuelDialogData>(MAT_DIALOG_DATA);
  ref = inject(MatDialogRef<FuelDialog>);
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private lookups = inject(LookupsService);
  fuelTypes = this.lookups.active('FuelTypes');
  busy = signal(false);
  saved = false;
  meterType = signal<'Kilometers' | 'EngineHours'>('Kilometers');
  lastMeter = signal<string | null>(null);
  equipmentFuelUnit = signal('لتر');
  unit = computed(() => meterUnit(this.meterType()));

  private i = this.d.item;
  form = inject(FormBuilder).group({
    equipmentId: [this.i?.equipmentId ?? this.d.equipmentId ?? null as number | null, Validators.required],
    fuelDate: [this.i?.fuelDate ?? todayIso() as string | null, Validators.required],
    fuelTypeId: [this.i?.fuelTypeId ?? null as number | null],
    quantity: [this.i?.quantity ?? null as number | null, [Validators.required, Validators.min(0.001)]],
    pricePerUnit: [this.i?.pricePerUnit ?? null as number | null, Validators.min(0)],
    totalAmount: [this.i?.totalAmount ?? null as number | null, Validators.min(0)],
    meterReading: [this.i?.meterReading ?? null as number | null, Validators.min(0)],
    isFullTank: [this.i?.isFullTank ?? true],
    driverId: [this.i?.driverId ?? null as number | null],
    projectId: [this.i?.projectId ?? null as number | null],
    station: [this.i?.station ?? ''],
    notes: [this.i?.notes ?? ''],
    attachmentId: [this.i?.attachmentId ?? null as number | null],
  });
  private v = toSignal(this.form.valueChanges, { initialValue: this.form.value });
  unitName = computed(() => this.fuelTypes.find(f => f.id === this.v().fuelTypeId)?.unit ?? this.equipmentFuelUnit());
  private linked = linkAmounts(this.form, { quantity: 'quantity', price: 'pricePerUnit', total: 'totalAmount' });
  private defaults = autoFillFromEquipment(this.form, {
    equipment: 'equipmentId', date: 'fuelDate', runNow: !this.i,
    fill: { projectId: 'projectId', driverId: 'driverId', lastFuelPrice: 'pricePerUnit' },
  });
  e = (k: string) => err(this.form.get(k));

  async ngOnInit(): Promise<void> {
    const id = this.form.value.equipmentId;
    if (id) this.loadEquipment(id);
  }

  equipmentPicked(e: { id: number } | null): void {
    if (e) this.loadEquipment(e.id);
    else this.lastMeter.set(null);
  }

  private async loadEquipment(id: number): Promise<void> {
    const e = await this.api.get<EquipmentDto>(`equipment/${id}`);
    this.meterType.set(e.meterType);
    this.lastMeter.set(fmtNumber(e.currentMeterReading));
    this.equipmentFuelUnit.set(e.fuelUnit);
  }

  async save(another = false): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    try {
      const body = clean(this.form.getRawValue());
      if (this.i) await this.api.put(`fuel/${this.i.id}`, body);
      else await this.api.post('fuel', body);
      this.notify.success('تم حفظ عملية التموين');
      if (another) {
        this.saved = true;
        this.ref.disableClose = true;
        this.form.patchValue({ quantity: null, totalAmount: null, meterReading: null, notes: '', attachmentId: null, equipmentId: null, driverId: null, projectId: null });
        this.form.markAsUntouched();
      } else this.ref.close(true);
    } catch (ex) {
      if (!applyServerErrors(this.form, ex)) this.notify.error(ex);
    } finally { this.busy.set(false); }
  }
}
