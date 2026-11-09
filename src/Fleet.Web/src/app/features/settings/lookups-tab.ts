import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ApiService } from '../../core/api.service';
import { fmtNumber } from '../../core/format';
import { LookupsService } from '../../core/lookups.service';
import { ExpenseSystemKind, LookupDto, LookupKind } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { applyServerErrors, clean, err } from '../../shared/forms';
import { Badge, EmptyState } from '../../shared/ui';
import { openDialog } from '../assignments/dialogs';

const KINDS: { kind: LookupKind; label: string; singular: string; hint: string }[] = [
  { kind: 'EquipmentCategories', label: 'أنواع المعدات', singular: 'نوع معدة', hint: 'العمر الإنتاجي والقيمة التخريدية الافتراضية تُقترح عند إضافة معدة مملوكة.' },
  { kind: 'FuelTypes', label: 'أنواع الوقود', singular: 'نوع وقود', hint: 'كل نوع وقود مرتبط ببند مصروف من نوع وقود لترحيل التكلفة.' },
  { kind: 'ExpenseCategories', label: 'بنود المصروفات', singular: 'بند مصروف', hint: 'البنود المقفلة يُرحّلها النظام تلقائياً (وقود، صيانة، إيجار، إضافي) ولا تُدخل يدوياً.' },
  { kind: 'MaintenanceTypes', label: 'أنواع الصيانة', singular: 'نوع صيانة', hint: 'الفترات الافتراضية تُقترح عند تسجيل الصيانة وإنشاء خطط الصيانة الدورية.' },
  { kind: 'LicenseTypes', label: 'أنواع رخص القيادة', singular: 'نوع رخصة', hint: 'تُستخدم في بيانات السائقين.' },
];

export const SYSTEM_KIND: Record<ExpenseSystemKind, string> = {
  None: 'عام', Fuel: 'وقود', Maintenance: 'صيانة', SpareParts: 'قطع غيار', Rental: 'إيجار', Overtime: 'وقت إضافي', Tolls: 'رسوم طرق', Tires: 'إطارات', Oil: 'زيوت',
};

@Component({
  selector: 'app-lookups-tab',
  imports: [Badge, EmptyState],
  template: `
    <div class="layout">
      <div class="card kinds">
        @for (k of kinds; track k.kind) {
          <button [class.active]="k.kind === kind()" (click)="select(k.kind)">{{ k.label }}</button>
        }
      </div>
      <div class="card" style="padding:0">
        <div class="head">
          <div>
            <h3>{{ meta().label }}</h3>
            <p class="muted small">{{ meta().hint }}</p>
          </div>
          <span class="spacer"></span>
          <button class="btn primary" (click)="edit()"><span class="material-symbols-outlined">add</span>إضافة {{ meta().singular }}</button>
        </div>
        @if (loading()) {
          <div style="padding:16px"><div class="skeleton" style="height:200px"></div></div>
        } @else if (!items().length) {
          <app-empty icon="list" title="لا توجد عناصر" />
        } @else {
          <div class="table-wrap">
            <table class="data">
              <thead><tr>
                <th>الاسم</th><th>الاسم بالإنجليزية</th>
                @switch (kind()) {
                  @case ('EquipmentCategories') { <th class="end">العمر الافتراضي (سنة)</th><th class="end">التخريدية %</th> }
                  @case ('FuelTypes') { <th>الوحدة</th><th>بند المصروف</th> }
                  @case ('ExpenseCategories') { <th>النوع</th><th>إدخال يدوي</th> }
                  @case ('MaintenanceTypes') { <th class="end">كل (كم)</th><th class="end">كل (ساعة)</th><th class="end">كل (يوم)</th> }
                }
                <th class="end">الترتيب</th><th>الحالة</th><th></th>
              </tr></thead>
              <tbody>
                @for (i of items(); track i.id) {
                  <tr>
                    <td><span class="cell-title">{{ i.nameAr }}</span> @if (i.isSystem) { <span class="material-symbols-outlined lock" title="عنصر أساسي">lock</span> }</td>
                    <td class="muted" dir="ltr" style="text-align:start">{{ i.nameEn || '—' }}</td>
                    @switch (kind()) {
                      @case ('EquipmentCategories') { <td class="end num">{{ n(i.defaultUsefulLifeYears) }}</td><td class="end num">{{ n(i.defaultResidualPercent) }}</td> }
                      @case ('FuelTypes') { <td>{{ i.unit || '—' }}</td><td>{{ categoryName(i.expenseCategoryId) }}</td> }
                      @case ('ExpenseCategories') {
                        <td>{{ systemKind[i.systemKind ?? 'None'] }}</td>
                        <td>@if (i.manualEntryAllowed) { <app-badge label="مسموح" tone="success" /> } @else { <app-badge label="تلقائي فقط" /> }</td>
                      }
                      @case ('MaintenanceTypes') { <td class="end num">{{ n(i.defaultIntervalKm) }}</td><td class="end num">{{ n(i.defaultIntervalHours) }}</td><td class="end num">{{ n(i.defaultIntervalDays) }}</td> }
                    }
                    <td class="end num">{{ i.sortOrder }}</td>
                    <td>@if (i.isActive) { <app-badge label="نشط" tone="success" /> } @else { <app-badge label="موقوف" /> }</td>
                    <td class="end"><button class="btn ghost sm" (click)="edit(i)"><span class="material-symbols-outlined">edit</span>تعديل</button></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .layout { display: grid; grid-template-columns: 220px 1fr; gap: 16px; align-items: start; }
    @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
    .kinds { padding: 8px; display: flex; flex-direction: column; gap: 2px; }
    .kinds button { text-align: start; border: 0; background: none; padding: 9px 12px; border-radius: 6px; font: inherit; cursor: pointer; color: var(--muted); }
    .kinds button:hover { background: var(--subtle); color: var(--text); }
    .kinds button.active { background: var(--brand-soft); color: var(--brand-strong); font-weight: 500; }
    .head { display: flex; align-items: center; gap: 12px; padding: 16px; border-bottom: 1px solid var(--border); }
    .head h3 { margin: 0; font-size: 15px; font-weight: 600; }
    .head p { margin: 2px 0 0; }
    .lock { font-size: 14px; color: var(--faint); vertical-align: middle; }
  `,
})
export class LookupsTab implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);
  private lookups = inject(LookupsService);

  kinds = KINDS;
  systemKind = SYSTEM_KIND;
  kind = signal<LookupKind>('EquipmentCategories');
  items = signal<LookupDto[]>([]);
  loading = signal(false);
  meta = () => KINDS.find(k => k.kind === this.kind())!;
  n = (v?: number | null) => (v === null || v === undefined ? '—' : fmtNumber(v));
  categoryName = (id?: number) => this.lookups.name('ExpenseCategories', id) || '—';

  ngOnInit(): void { this.load(); }
  select(k: LookupKind): void { this.kind.set(k); this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    try { this.items.set(await this.api.get<LookupDto[]>(`lookups/${this.kind()}`)); }
    catch (e) { this.notify.error(e); } finally { this.loading.set(false); }
  }

  async edit(item?: LookupDto): Promise<void> {
    const saved = await openDialog(this.dialog, LookupDialog, { kind: this.kind(), item, title: this.meta().singular,
      nextSort: Math.max(0, ...this.items().map(i => i.sortOrder)) + 1 }, '560px');
    if (saved) { await this.lookups.refresh(); this.load(); }
  }
}

interface LookupDialogData { kind: LookupKind; item?: LookupDto; title: string; nextSort: number; }

@Component({
  selector: 'app-lookup-dialog',
  imports: [MatDialogModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule],
  template: `
    <div class="dialog-head"><span class="material-symbols-outlined">list</span><h2>{{ d.item ? 'تعديل' : 'إضافة' }} {{ d.title }}</h2></div>
    <form [formGroup]="form" (ngSubmit)="save()">
      <div class="dialog-body">
        @if (d.item?.isSystem) { <div class="notice info" style="margin-bottom:12px">عنصر أساسي يستخدمه النظام في الحسابات — يمكن تعديل الاسم فقط ولا يمكن إيقافه.</div> }
        <div class="form-grid">
          <mat-form-field><mat-label>الاسم بالعربية</mat-label><input matInput formControlName="nameAr" required /><mat-error>{{ e('nameAr') }}</mat-error></mat-form-field>
          <mat-form-field><mat-label>الاسم بالإنجليزية</mat-label><input matInput formControlName="nameEn" dir="ltr" /><mat-error>{{ e('nameEn') }}</mat-error></mat-form-field>

          @switch (d.kind) {
            @case ('EquipmentCategories') {
              <mat-form-field><mat-label>العمر الإنتاجي الافتراضي (سنة)</mat-label><input matInput type="number" formControlName="defaultUsefulLifeYears" /><mat-error>{{ e('defaultUsefulLifeYears') }}</mat-error></mat-form-field>
              <mat-form-field><mat-label>القيمة التخريدية الافتراضية %</mat-label><input matInput type="number" formControlName="defaultResidualPercent" /><mat-error>{{ e('defaultResidualPercent') }}</mat-error></mat-form-field>
            }
            @case ('FuelTypes') {
              <mat-form-field><mat-label>الوحدة</mat-label><input matInput formControlName="unit" placeholder="لتر" /></mat-form-field>
              <mat-form-field><mat-label>بند المصروف (وقود)</mat-label>
                <mat-select formControlName="expenseCategoryId" required>
                  @for (c of fuelCategories; track c.id) { <mat-option [value]="c.id">{{ c.nameAr }}</mat-option> }
                </mat-select>
                <mat-error>{{ e('expenseCategoryId') }}</mat-error>
              </mat-form-field>
            }
            @case ('ExpenseCategories') {
              <mat-form-field class="full"><mat-label>نوع البند</mat-label>
                <mat-select formControlName="systemKind">
                  @for (k of kindOptions; track k) { <mat-option [value]="k">{{ systemKind[k] }}</mat-option> }
                </mat-select>
                <mat-hint>يحدد مكان ظهور البند في ملخصات التكلفة. بنود الوقود تُربط بأنواع الوقود.</mat-hint>
                <mat-error>{{ e('systemKind') }}</mat-error>
              </mat-form-field>
            }
            @case ('MaintenanceTypes') {
              <mat-form-field><mat-label>كل (كم)</mat-label><input matInput type="number" formControlName="defaultIntervalKm" /><mat-error>{{ e('defaultIntervalKm') }}</mat-error></mat-form-field>
              <mat-form-field><mat-label>كل (ساعة تشغيل)</mat-label><input matInput type="number" formControlName="defaultIntervalHours" /><mat-error>{{ e('defaultIntervalHours') }}</mat-error></mat-form-field>
              <mat-form-field><mat-label>كل (يوم)</mat-label><input matInput type="number" formControlName="defaultIntervalDays" /><mat-error>{{ e('defaultIntervalDays') }}</mat-error></mat-form-field>
            }
          }
          <mat-form-field><mat-label>الترتيب</mat-label><input matInput type="number" formControlName="sortOrder" /></mat-form-field>
          <div class="full"><mat-checkbox formControlName="isActive">نشط (يظهر في القوائم)</mat-checkbox>
            @if (e('isActive'); as m) { <div class="text-danger small">{{ m }}</div> }</div>
        </div>
      </div>
      <div class="dialog-foot">
        <button class="btn" type="button" mat-dialog-close>إلغاء</button>
        <button class="btn primary" type="submit" [disabled]="busy()">حفظ</button>
      </div>
    </form>
  `,
})
export class LookupDialog {
  d = inject<LookupDialogData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<LookupDialog>);
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  busy = signal(false);
  systemKind = SYSTEM_KIND;
  kindOptions: ExpenseSystemKind[] = this.d.item?.isSystem ? [this.d.item.systemKind ?? 'None'] : ['None', 'Fuel', 'SpareParts', 'Tolls', 'Tires', 'Oil'];
  fuelCategories = inject(LookupsService).all('ExpenseCategories').filter(c => c.systemKind === 'Fuel');

  private i = this.d.item;
  form = inject(FormBuilder).group({
    nameAr: [this.i?.nameAr ?? '', [Validators.required, Validators.maxLength(100)]],
    nameEn: [this.i?.nameEn ?? '', Validators.maxLength(100)],
    sortOrder: [this.i?.sortOrder ?? this.d.nextSort],
    isActive: [{ value: this.i?.isActive ?? true, disabled: !!this.i?.isSystem }],
    icon: [this.i?.icon ?? null as string | null],
    defaultUsefulLifeYears: [this.i?.defaultUsefulLifeYears ?? null as number | null, [Validators.min(1), Validators.max(50)]],
    defaultResidualPercent: [this.i?.defaultResidualPercent ?? null as number | null, [Validators.min(0), Validators.max(100)]],
    unit: [this.i?.unit ?? (this.d.kind === 'FuelTypes' ? 'لتر' : null) as string | null],
    expenseCategoryId: [this.i?.expenseCategoryId ?? (this.d.kind === 'FuelTypes' ? this.fuelCategories[0]?.id ?? null : null) as number | null,
      this.d.kind === 'FuelTypes' ? Validators.required : []],
    systemKind: [{ value: this.i?.systemKind ?? 'None' as ExpenseSystemKind, disabled: !!this.i?.isSystem }],
    defaultIntervalKm: [this.i?.defaultIntervalKm ?? null as number | null, Validators.min(1)],
    defaultIntervalHours: [this.i?.defaultIntervalHours ?? null as number | null, Validators.min(1)],
    defaultIntervalDays: [this.i?.defaultIntervalDays ?? null as number | null, Validators.min(1)],
  });
  e = (k: string) => err(this.form.get(k));

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    try {
      const body = clean(this.form.getRawValue());
      if (this.i) await this.api.put(`lookups/${this.d.kind}/${this.i.id}`, body);
      else await this.api.post(`lookups/${this.d.kind}`, body);
      this.notify.success('تم الحفظ');
      this.ref.close(true);
    } catch (ex) {
      if (!applyServerErrors(this.form, ex)) this.notify.error(ex);
    } finally { this.busy.set(false); }
  }
}
