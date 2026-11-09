import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { ApiService } from '../../core/api.service';
import { fmtMoney, todayIso } from '../../core/format';
import { METER_TYPE, OWNERSHIP, options } from '../../core/labels';
import { LookupsService } from '../../core/lookups.service';
import { EquipmentDto, MeterType, OwnershipType } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { DateField } from '../../shared/fields';
import { applyServerErrors, err } from '../../shared/forms';
import { PageHeader } from '../../shared/ui';

@Component({
  selector: 'app-equipment-form',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule, DateField, PageHeader, RouterLink],
  template: `
    <div class="page form-page">
      <app-page-header [title]="id() ? 'تعديل معدة' : 'معدة جديدة'"
        [crumbs]="[{ label: 'المعدات', link: '/equipment' }, { label: id() ? 'تعديل' : 'جديدة' }]" />
      <form class="card" [formGroup]="form" (ngSubmit)="save()">
        <div class="card-body">
          <div class="form-grid cols-3">
            <div class="form-section-title">البيانات الأساسية</div>
            <mat-form-field>
              <mat-label>كود المعدة</mat-label>
              <input matInput formControlName="code" required />
              <mat-error>{{ e('code') }}</mat-error>
            </mat-form-field>
            <mat-form-field class="span-2">
              <mat-label>اسم المعدة</mat-label>
              <input matInput formControlName="name" required placeholder="مثال: لودر كاتربيلر 950" />
              <mat-error>{{ e('name') }}</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>رقم اللوحة</mat-label>
              <input matInput formControlName="plateNumber" />
              <mat-hint>أو رقم الشاسيه للمعدات بدون لوحة</mat-hint>
              <mat-error>{{ e('plateNumber') }}</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>رقم الشاسيه / التعريف</mat-label>
              <input matInput formControlName="chassisNumber" />
              <mat-error>{{ e('chassisNumber') }}</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>نوع المعدة</mat-label>
              <mat-select formControlName="categoryId" required (selectionChange)="categoryChanged()">
                @for (c of categories; track c.id) { <mat-option [value]="c.id">{{ c.nameAr }}</mat-option> }
              </mat-select>
              <mat-error>{{ e('categoryId') }}</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>الشركة المصنعة</mat-label>
              <input matInput formControlName="manufacturer" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>الموديل</mat-label>
              <input matInput formControlName="model" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>سنة الصنع</mat-label>
              <input matInput type="number" formControlName="manufactureYear" />
              <mat-error>{{ e('manufactureYear') }}</mat-error>
            </mat-form-field>

            <div class="form-section-title">التشغيل</div>
            <mat-form-field>
              <mat-label>نوع الوقود</mat-label>
              <mat-select formControlName="fuelTypeId" required>
                @for (f of fuelTypes; track f.id) { <mat-option [value]="f.id">{{ f.nameAr }}</mat-option> }
              </mat-select>
              <mat-error>{{ e('fuelTypeId') }}</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>نوع العداد</mat-label>
              <mat-select formControlName="meterType">
                @for (o of meterOptions; track o.value) { <mat-option [value]="o.value">{{ o.label }}</mat-option> }
              </mat-select>
              <mat-error>{{ e('meterType') }}</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>القراءة الابتدائية للعداد</mat-label>
              <input matInput type="number" formControlName="initialMeterReading" min="0" />
              <mat-error>{{ e('initialMeterReading') }}</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>نوع الملكية</mat-label>
              <mat-select formControlName="ownership">
                @for (o of ownershipOptions; track o.value) { <mat-option [value]="o.value">{{ o.label }}</mat-option> }
              </mat-select>
              <mat-hint>{{ ownership() === 'Rented' ? 'أضف عقد الإيجار من صفحة المعدة بعد الحفظ' : '' }}</mat-hint>
              <mat-error>{{ e('ownership') }}</mat-error>
            </mat-form-field>
            <mat-form-field class="span-2">
              <mat-label>ملاحظات</mat-label>
              <input matInput formControlName="notes" />
            </mat-form-field>

            @if (ownership() === 'Owned') {
              <div class="form-section-title">
                <mat-checkbox [checked]="hasDep()" (change)="toggleDep($event.checked)">بيانات الشراء والإهلاك (القسط الثابت)</mat-checkbox>
              </div>
              @if (hasDep()) {
                <ng-container formGroupName="depreciation">
                  <app-date-field label="تاريخ الشراء" formControlName="purchaseDate" required [error]="e('depreciation.purchaseDate')" />
                  <mat-form-field>
                    <mat-label>سعر الشراء</mat-label>
                    <input matInput type="number" formControlName="purchasePrice" required />
                    <mat-error>{{ e('depreciation.purchasePrice') }}</mat-error>
                  </mat-form-field>
                  <mat-form-field>
                    <mat-label>القيمة التخريدية</mat-label>
                    <input matInput type="number" formControlName="residualValue" />
                    <mat-error>{{ e('depreciation.residualValue') }}</mat-error>
                  </mat-form-field>
                  <mat-form-field>
                    <mat-label>العمر الإنتاجي (شهر)</mat-label>
                    <input matInput type="number" formControlName="usefulLifeMonths" required />
                    <mat-hint>{{ lifeHint() }}</mat-hint>
                    <mat-error>{{ e('depreciation.usefulLifeMonths') }}</mat-error>
                  </mat-form-field>
                  <app-date-field label="بداية الإهلاك" formControlName="depreciationStartDate" required [error]="e('depreciation.depreciationStartDate')" />
                  <app-date-field label="تاريخ الاستبعاد (اختياري)" formControlName="disposalDate" [error]="e('depreciation.disposalDate')" />
                  <div class="full notice">الإهلاك الشهري التقديري: <strong class="num">{{ monthly() }}</strong> — يُحسب يومياً ولا يدخل ضمن المصروفات النقدية.</div>
                </ng-container>
              }
            }
          </div>
          <div class="form-actions">
            <a class="btn" [routerLink]="id() ? ['/equipment', id()] : '/equipment'">إلغاء</a>
            <button class="btn primary" type="submit" [disabled]="busy()">حفظ</button>
          </div>
        </div>
      </form>
    </div>
  `,
})
export class EquipmentForm implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private router = inject(Router);
  private lookups = inject(LookupsService);
  private fb = inject(FormBuilder);
  id = input<string>();
  busy = signal(false);
  hasDep = signal(false);
  categories = this.lookups.active('EquipmentCategories');
  fuelTypes = this.lookups.active('FuelTypes');
  meterOptions = options(METER_TYPE);
  ownershipOptions = options(OWNERSHIP);

  dep = this.fb.group({
    purchaseDate: [todayIso() as string | null, Validators.required],
    purchasePrice: [null as number | null, [Validators.required, Validators.min(0.01)]],
    residualValue: [0 as number | null, Validators.min(0)],
    usefulLifeMonths: [60 as number | null, [Validators.required, Validators.min(1), Validators.max(600)]],
    method: ['StraightLine'],
    depreciationStartDate: [todayIso() as string | null, Validators.required],
    disposalDate: [null as string | null],
  });

  form = this.fb.group({
    code: ['', Validators.required],
    name: ['', Validators.required],
    plateNumber: [''],
    chassisNumber: [''],
    categoryId: [null as number | null, Validators.required],
    manufacturer: [''],
    model: [''],
    manufactureYear: [null as number | null],
    fuelTypeId: [null as number | null, Validators.required],
    ownership: ['Owned' as OwnershipType],
    meterType: ['Kilometers' as MeterType],
    initialMeterReading: [0 as number | null, [Validators.required, Validators.min(0)]],
    notes: [''],
    depreciation: this.dep,
  });

  ownership = toSignal(this.form.controls.ownership.valueChanges, { initialValue: 'Owned' as OwnershipType });
  private depValue = toSignal(this.dep.valueChanges, { initialValue: this.dep.value });
  monthly = computed(() => {
    const v = this.depValue();
    const months = Number(v.usefulLifeMonths) || 0;
    return months > 0 ? fmtMoney(((Number(v.purchasePrice) || 0) - (Number(v.residualValue) || 0)) / months) : '—';
  });
  lifeHint = computed(() => { const m = Number(this.depValue().usefulLifeMonths) || 0; return m ? `${(m / 12).toFixed(1)} سنة` : ''; });

  e = (k: string) => err(this.form.get(k));

  constructor() { this.dep.disable(); }

  async ngOnInit(): Promise<void> {
    if (!this.id()) {
      if (this.fuelTypes.length === 1) this.form.controls.fuelTypeId.setValue(this.fuelTypes[0].id);
      return;
    }
    const x = await this.api.get<EquipmentDto>(`equipment/${this.id()}`);
    this.form.patchValue({
      code: x.code, name: x.name, plateNumber: x.plateNumber ?? '', chassisNumber: x.chassisNumber ?? '', categoryId: x.categoryId,
      manufacturer: x.manufacturer ?? '', model: x.model ?? '', manufactureYear: x.manufactureYear ?? null, fuelTypeId: x.fuelTypeId,
      ownership: x.ownership, meterType: x.meterType, initialMeterReading: x.initialMeterReading, notes: x.notes ?? '',
    });
    if (x.depreciation) {
      this.toggleDep(true);
      this.dep.patchValue({ ...x.depreciation, disposalDate: x.depreciation.disposalDate ?? null });
    }
  }

  toggleDep(on: boolean): void {
    this.hasDep.set(on);
    if (on) { this.dep.enable(); this.categoryChanged(true); } else this.dep.disable();
  }

  /** Pre-fills useful life / residual % from the category defaults (only for untouched fields). */
  categoryChanged(onlyIfPristine = false): void {
    const c = this.categories.find(x => x.id === this.form.controls.categoryId.value);
    if (!c || !this.hasDep()) return;
    if (c.defaultUsefulLifeYears && (!onlyIfPristine || this.dep.controls.usefulLifeMonths.pristine))
      this.dep.controls.usefulLifeMonths.setValue(c.defaultUsefulLifeYears * 12);
    const price = Number(this.dep.controls.purchasePrice.value) || 0;
    if (c.defaultResidualPercent && price && (!onlyIfPristine || this.dep.controls.residualValue.pristine))
      this.dep.controls.residualValue.setValue(Math.round(price * c.defaultResidualPercent / 100));
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    const v = this.form.getRawValue();
    const body = {
      ...v,
      plateNumber: v.plateNumber || null, chassisNumber: v.chassisNumber || null, manufacturer: v.manufacturer || null, model: v.model || null,
      notes: v.notes || null,
      depreciation: v.ownership === 'Owned' && this.hasDep() ? { ...v.depreciation, residualValue: v.depreciation.residualValue ?? 0 } : null,
    };
    try {
      let id = Number(this.id());
      if (id) await this.api.put(`equipment/${id}`, body);
      else id = (await this.api.post<{ id: number }>('equipment', body)).id;
      this.notify.success('تم حفظ المعدة');
      this.router.navigate(['/equipment', id]);
    } catch (ex) {
      if (!applyServerErrors(this.form, ex)) this.notify.error(ex);
    } finally { this.busy.set(false); }
  }
}
