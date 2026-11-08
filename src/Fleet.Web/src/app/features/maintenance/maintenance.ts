import { Component, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../core/api.service';
import { LookupsService } from '../../core/lookups.service';
import { MaintenancePlanDto } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { CellDef, Column, DataTable } from '../../shared/data-table';
import { DateField, EntitySelect } from '../../shared/fields';
import { applyServerErrors, clean, err } from '../../shared/forms';
import { Badge, PageHeader } from '../../shared/ui';
import { openDialog } from '../assignments/dialogs';
import { MaintenanceDialog } from './maintenance-dialog';
import { MaintenanceRecords } from './maintenance-records';
import { RemindersTable } from './reminders-table';

type Tab = 'records' | 'reminders' | 'plans';

@Component({
  selector: 'app-maintenance-page',
  imports: [PageHeader, MaintenanceRecords, RemindersTable, DataTable, CellDef, Badge, RouterLink, MatCheckboxModule, MatTooltipModule],
  template: `
    <div class="page">
      <app-page-header title="الصيانة" subtitle="سجل الصيانة والمواعيد الدورية حسب التاريخ أو العداد" [crumbs]="[{ label: 'الصيانة' }]" />
      <div class="tabs" style="margin-bottom:16px">
        <button [class.active]="tab() === 'records'" (click)="tab.set('records')">سجل الصيانة</button>
        <button [class.active]="tab() === 'reminders'" (click)="tab.set('reminders')">المواعيد والتنبيهات</button>
        <button [class.active]="tab() === 'plans'" (click)="showPlans()">خطط الصيانة الدورية</button>
      </div>
      @switch (tab()) {
        @case ('records') { <app-maintenance-records /> }
        @case ('reminders') {
          <div class="card">
            <div class="filters">
              <mat-checkbox [checked]="dueOnly()" (change)="dueOnly.set($event.checked)">المستحقة والمتأخرة فقط</mat-checkbox>
            </div>
            @if (dueOnly()) { <app-reminders-table dueOnly /> } @else { <app-reminders-table /> }
          </div>
        }
        @case ('plans') {
          <div class="card">
            <div class="filters">
              <span class="muted small">خطة مخصصة لكل معدة تتجاوز الفترات الافتراضية لنوع الصيانة.</span>
              <span class="spacer"></span>
              <button class="btn primary" (click)="editPlan()"><span class="material-symbols-outlined">add</span>خطة جديدة</button>
            </div>
            <app-data-table [columns]="planCols" [rows]="plans()" [paged]="false" [loading]="loading()" emptyIcon="event_repeat" emptyTitle="لا توجد خطط مخصصة">
              <ng-template appCell="equipment" let-r><a class="link" [routerLink]="['/equipment', r.equipmentId]">{{ r.equipmentName }}</a></ng-template>
              <ng-template appCell="isActive" let-r>@if (r.isActive) { <app-badge label="نشطة" tone="success" /> } @else { <app-badge label="متوقفة" /> }</ng-template>
              <ng-template appCell="actions" let-r>
                <div class="actions-cell">
                  <button class="btn ghost icon sm" matTooltip="تعديل" (click)="editPlan(r)"><span class="material-symbols-outlined">edit</span></button>
                  <button class="btn ghost icon sm" matTooltip="حذف" (click)="deletePlan(r)"><span class="material-symbols-outlined">delete</span></button>
                </div>
              </ng-template>
            </app-data-table>
          </div>
        }
      }
    </div>
  `,
})
export class MaintenancePage {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  new = input<string>();
  tab = signal<Tab>('records');
  dueOnly = signal(true);
  plans = signal<MaintenancePlanDto[]>([]);
  loading = signal(false);
  records = viewChild(MaintenanceRecords);

  planCols: Column<MaintenancePlanDto>[] = [
    { key: 'equipment', label: 'المعدة' }, { key: 'maintenanceTypeName', label: 'نوع الصيانة' },
    { key: 'intervalKm', label: 'كل (كم)', type: 'int' }, { key: 'intervalHours', label: 'كل (ساعة)', type: 'int' },
    { key: 'intervalDays', label: 'كل (يوم)', type: 'int' }, { key: 'lastDoneDate', label: 'آخر تنفيذ', type: 'date' },
    { key: 'lastDoneMeter', label: 'عداد آخر تنفيذ', type: 'num' }, { key: 'isActive', label: 'الحالة' }, { key: 'actions', label: '' },
  ];

  constructor() {
    effect(() => { if (this.new()) untracked(() => this.quickAdd()); });
  }

  private async quickAdd(): Promise<void> {
    this.router.navigate([], { queryParams: {}, replaceUrl: true });
    this.tab.set('records');
    if (await openDialog(this.dialog, MaintenanceDialog, {}, '760px')) this.records()?.list.load();
  }

  showPlans(): void { this.tab.set('plans'); this.loadPlans(); }

  async loadPlans(): Promise<void> {
    this.loading.set(true);
    try { this.plans.set(await this.api.get<MaintenancePlanDto[]>('maintenance/plans')); }
    catch (e) { this.notify.error(e); } finally { this.loading.set(false); }
  }

  async editPlan(plan?: MaintenancePlanDto): Promise<void> {
    if (await openDialog(this.dialog, PlanDialog, { plan })) this.loadPlans();
  }

  async deletePlan(p: MaintenancePlanDto): Promise<void> {
    if (!(await this.notify.confirm({ title: 'حذف خطة الصيانة؟', message: `${p.equipmentName} — ${p.maintenanceTypeName}`, danger: true, confirmText: 'حذف' }))) return;
    try { await this.api.delete(`maintenance/plans/${p.id}`); this.notify.success('تم الحذف'); this.loadPlans(); }
    catch (e) { this.notify.error(e); }
  }
}

@Component({
  selector: 'app-plan-dialog',
  imports: [MatDialogModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule, DateField, EntitySelect],
  template: `
    <div class="dialog-head"><span class="material-symbols-outlined">event_repeat</span><h2>{{ d.plan ? 'تعديل خطة صيانة' : 'خطة صيانة دورية' }}</h2></div>
    <form [formGroup]="form" (ngSubmit)="save()">
      <div class="dialog-body">
        <div class="form-grid">
          <app-entity-select class="full" kind="equipment" label="المعدة" formControlName="equipmentId" required [error]="e('equipmentId')" />
          <mat-form-field class="full">
            <mat-label>نوع الصيانة</mat-label>
            <mat-select formControlName="maintenanceTypeId" required (selectionChange)="typeChanged()">
              @for (t of types; track t.id) { <mat-option [value]="t.id">{{ t.nameAr }}</mat-option> }
            </mat-select>
            <mat-error>{{ e('maintenanceTypeId') }}</mat-error>
          </mat-form-field>
          <mat-form-field><mat-label>كل (كم)</mat-label><input matInput type="number" formControlName="intervalKm" /></mat-form-field>
          <mat-form-field><mat-label>كل (ساعة تشغيل)</mat-label><input matInput type="number" formControlName="intervalHours" /></mat-form-field>
          <mat-form-field>
            <mat-label>كل (يوم)</mat-label><input matInput type="number" formControlName="intervalDays" />
            <mat-error>{{ e('intervalDays') }}</mat-error>
          </mat-form-field>
          <div></div>
          <app-date-field label="آخر تنفيذ (اختياري)" formControlName="lastDoneDate" hint="يُحدَّث تلقائياً عند تسجيل صيانة من نفس النوع" />
          <mat-form-field><mat-label>عداد آخر تنفيذ</mat-label><input matInput type="number" formControlName="lastDoneMeter" /></mat-form-field>
          <div class="full"><mat-checkbox formControlName="isActive">الخطة نشطة</mat-checkbox></div>
          <mat-form-field class="full"><mat-label>ملاحظات</mat-label><input matInput formControlName="notes" /></mat-form-field>
        </div>
      </div>
      <div class="dialog-foot">
        <button class="btn" type="button" mat-dialog-close>إلغاء</button>
        <button class="btn primary" type="submit" [disabled]="busy()">حفظ</button>
      </div>
    </form>
  `,
})
export class PlanDialog {
  d = inject<{ plan?: MaintenancePlanDto }>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<PlanDialog>);
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  types = inject(LookupsService).active('MaintenanceTypes');
  busy = signal(false);
  private p = this.d.plan;
  form = inject(FormBuilder).group({
    equipmentId: [this.p?.equipmentId ?? null as number | null, Validators.required],
    maintenanceTypeId: [this.p?.maintenanceTypeId ?? null as number | null, Validators.required],
    intervalKm: [this.p?.intervalKm ?? null as number | null, Validators.min(1)],
    intervalHours: [this.p?.intervalHours ?? null as number | null, Validators.min(1)],
    intervalDays: [this.p?.intervalDays ?? null as number | null, Validators.min(1)],
    lastDoneDate: [this.p?.lastDoneDate ?? null as string | null],
    lastDoneMeter: [this.p?.lastDoneMeter ?? null as number | null],
    isActive: [this.p?.isActive ?? true],
    notes: [this.p?.notes ?? ''],
  });
  e = (k: string) => err(this.form.get(k));

  typeChanged(): void {
    const t = this.types.find(x => x.id === this.form.value.maintenanceTypeId);
    if (!t) return;
    const f = this.form.controls;
    if (f.intervalKm.pristine) f.intervalKm.setValue(t.defaultIntervalKm ?? null);
    if (f.intervalHours.pristine) f.intervalHours.setValue(t.defaultIntervalHours ?? null);
    if (f.intervalDays.pristine) f.intervalDays.setValue(t.defaultIntervalDays ?? null);
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    try {
      const body = clean(this.form.getRawValue());
      if (this.p) await this.api.put(`maintenance/plans/${this.p.id}`, body);
      else await this.api.post('maintenance/plans', body);
      this.notify.success('تم حفظ الخطة');
      this.ref.close(true);
    } catch (ex) {
      if (!applyServerErrors(this.form, ex)) this.notify.error(ex);
    } finally { this.busy.set(false); }
  }
}
