import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ApiService } from '../../core/api.service';
import { EMPLOYMENT_STATUS, options } from '../../core/labels';
import { LookupsService } from '../../core/lookups.service';
import { DriverDto, EmploymentStatus } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { DateField } from '../../shared/fields';
import { applyServerErrors, clean, err } from '../../shared/forms';
import { PageHeader } from '../../shared/ui';

@Component({
  selector: 'app-driver-form',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, DateField, PageHeader, RouterLink],
  template: `
    <div class="page form-page">
      <app-page-header [title]="id() ? 'تعديل بيانات سائق' : 'سائق جديد'"
        [crumbs]="[{ label: 'السائقون', link: '/drivers' }, { label: id() ? 'تعديل' : 'جديد' }]" />
      <form class="card" [formGroup]="form" (ngSubmit)="save()">
        <div class="card-body">
          <div class="form-grid">
            <div class="form-section-title">البيانات الشخصية</div>
            <mat-form-field class="full">
              <mat-label>الاسم بالكامل</mat-label>
              <input matInput formControlName="fullName" required />
              <mat-error>{{ e('fullName') }}</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>الرقم القومي</mat-label>
              <input matInput formControlName="nationalId" maxlength="14" />
              <mat-error>{{ e('nationalId') }}</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>الهاتف</mat-label>
              <input matInput formControlName="phone" />
              <mat-error>{{ e('phone') }}</mat-error>
            </mat-form-field>
            <mat-form-field class="full"><mat-label>العنوان</mat-label><input matInput formControlName="address" /></mat-form-field>

            <div class="form-section-title">العمل والرخصة</div>
            <mat-form-field>
              <mat-label>حالة العمل</mat-label>
              <mat-select formControlName="employmentStatus">
                @for (o of statusOptions; track o.value) { <mat-option [value]="o.value">{{ o.label }}</mat-option> }
              </mat-select>
            </mat-form-field>
            <app-date-field label="تاريخ التعيين" formControlName="hireDate" [error]="e('hireDate')" />
            <mat-form-field>
              <mat-label>رقم الرخصة</mat-label>
              <input matInput formControlName="licenseNumber" />
              <mat-error>{{ e('licenseNumber') }}</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>نوع الرخصة</mat-label>
              <mat-select formControlName="licenseTypeId">
                <mat-option [value]="null">—</mat-option>
                @for (l of licenseTypes; track l.id) { <mat-option [value]="l.id">{{ l.nameAr }}</mat-option> }
              </mat-select>
            </mat-form-field>
            <app-date-field label="تاريخ انتهاء الرخصة" formControlName="licenseExpiryDate" [error]="e('licenseExpiryDate')" />
            <div></div>
            <mat-form-field class="full"><mat-label>ملاحظات</mat-label><textarea matInput rows="2" formControlName="notes"></textarea></mat-form-field>
          </div>
          <div class="form-actions">
            <a class="btn" [routerLink]="id() ? ['/drivers', id()] : '/drivers'">إلغاء</a>
            <button class="btn primary" type="submit" [disabled]="busy()">حفظ</button>
          </div>
        </div>
      </form>
    </div>
  `,
})
export class DriverForm implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private router = inject(Router);
  private lookups = inject(LookupsService);
  id = input<string>();
  busy = signal(false);
  statusOptions = options(EMPLOYMENT_STATUS);
  licenseTypes = this.lookups.active('LicenseTypes');

  form = inject(FormBuilder).group({
    fullName: ['', [Validators.required, Validators.maxLength(200)]],
    nationalId: [''],
    phone: [''],
    address: [''],
    employmentStatus: ['Active' as EmploymentStatus],
    hireDate: [null as string | null],
    licenseNumber: [''],
    licenseTypeId: [null as number | null],
    licenseExpiryDate: [null as string | null],
    notes: [''],
  });
  e = (k: string) => err(this.form.get(k));

  async ngOnInit(): Promise<void> {
    if (!this.id()) return;
    const d = await this.api.get<DriverDto>(`drivers/${this.id()}`);
    this.form.patchValue({
      fullName: d.fullName, nationalId: d.nationalId ?? '', phone: d.phone ?? '', address: d.address ?? '', employmentStatus: d.employmentStatus,
      hireDate: d.hireDate ?? null, licenseNumber: d.licenseNumber ?? '', licenseTypeId: d.licenseTypeId ?? null,
      licenseExpiryDate: d.licenseExpiryDate ?? null, notes: d.notes ?? '',
    });
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    try {
      const body = clean(this.form.getRawValue());
      let id = Number(this.id());
      if (id) await this.api.put(`drivers/${id}`, body);
      else id = (await this.api.post<{ id: number }>('drivers', body)).id;
      this.notify.success('تم حفظ بيانات السائق');
      this.router.navigate(['/drivers', id]);
    } catch (ex) {
      if (!applyServerErrors(this.form, ex)) this.notify.error(ex);
    } finally { this.busy.set(false); }
  }
}
