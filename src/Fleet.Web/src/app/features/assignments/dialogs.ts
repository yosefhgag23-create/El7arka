import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { fmtNumber, todayIso } from '../../core/format';
import { meterUnit } from '../../core/labels';
import { EquipmentListItem, MeterType, PagedResult } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { DateField, EntitySelect } from '../../shared/fields';
import { applyServerErrors, clean, err } from '../../shared/forms';
import { EmptyState } from '../../shared/ui';

const DIALOG = { width: '560px', direction: 'rtl' as const, autoFocus: false, maxHeight: '92vh' };

/** Opens a dialog and resolves true when it saved. */
export async function openDialog<T>(dialog: MatDialog, component: any, data: T, width?: string): Promise<boolean> {
  const ref = dialog.open(component, { ...DIALOG, ...(width ? { width } : {}), data });
  return (await firstValueFrom(ref.afterClosed())) === true;
}

/* ===================== Transfer equipment ===================== */
export interface TransferData { equipmentId: number; equipmentName: string; currentProjectId?: number | null; currentProjectName?: string | null; meterType: MeterType; currentMeter: number; }

@Component({
  selector: 'app-transfer-dialog',
  imports: [MatDialogModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatCheckboxModule, DateField, EntitySelect],
  template: `
    <div class="dialog-head"><span class="material-symbols-outlined">swap_horiz</span><h2>نقل معدة — {{ d.equipmentName }}</h2></div>
    <form [formGroup]="form" (ngSubmit)="save()">
      <div class="dialog-body stack" style="gap:8px">
        <div class="notice">المشروع الحالي: <strong>{{ d.currentProjectName || 'غير مخصصة' }}</strong></div>
        <mat-checkbox [checked]="unassign()" (change)="setUnassign($event.checked)" [disabled]="!d.currentProjectId">إلغاء التخصيص (إرجاع المعدة بدون مشروع)</mat-checkbox>
        @if (!unassign()) {
          <app-entity-select kind="projects" label="المشروع الجديد" formControlName="toProjectId" required [error]="e('toProjectId')" [filter]="{ status: 'Active' }" />
        }
        <div class="form-grid">
          <app-date-field label="تاريخ النقل" formControlName="date" required [error]="e('date')" />
          <mat-form-field>
            <mat-label>قراءة العداد ({{ unit }})</mat-label>
            <input matInput type="number" formControlName="meterReading" />
            <mat-hint>آخر قراءة: {{ current }}</mat-hint>
            <mat-error>{{ e('meterReading') }}</mat-error>
          </mat-form-field>
        </div>
        <mat-form-field><mat-label>ملاحظات</mat-label><textarea matInput rows="2" formControlName="notes"></textarea></mat-form-field>
      </div>
      <div class="dialog-foot">
        <button class="btn" type="button" mat-dialog-close>إلغاء</button>
        <button class="btn primary" type="submit" [disabled]="busy()">تنفيذ النقل</button>
      </div>
    </form>
  `,
})
export class TransferDialog {
  d = inject<TransferData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<TransferDialog>);
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  unit = meterUnit(this.d.meterType);
  current = fmtNumber(this.d.currentMeter);
  busy = signal(false);
  unassign = signal(false);
  form = inject(FormBuilder).group({
    toProjectId: [null as number | null, Validators.required],
    date: [todayIso() as string | null, Validators.required],
    meterReading: [null as number | null],
    notes: [''],
  });
  e = (k: string) => err(this.form.get(k));

  setUnassign(v: boolean): void {
    this.unassign.set(v);
    const c = this.form.controls.toProjectId;
    c.setValidators(v ? null : Validators.required);
    if (v) c.setValue(null);
    c.updateValueAndValidity();
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    try {
      await this.api.post(`equipment/${this.d.equipmentId}/transfer`, clean(this.form.getRawValue()));
      this.notify.success(this.unassign() ? 'تم إلغاء تخصيص المعدة' : 'تم نقل المعدة');
      this.ref.close(true);
    } catch (ex) {
      if (!applyServerErrors(this.form, ex)) this.notify.error(ex);
    } finally { this.busy.set(false); }
  }
}

/* ===================== Bulk assign to project ===================== */
@Component({
  selector: 'app-bulk-assign-dialog',
  imports: [MatDialogModule, FormsModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatCheckboxModule, DateField, EmptyState],
  template: `
    <div class="dialog-head"><span class="material-symbols-outlined">playlist_add</span><h2>تخصيص معدات للمشروع — {{ d.projectName }}</h2></div>
    <div class="dialog-body stack" style="gap:10px">
      <p class="muted small" style="margin:0">تظهر هنا المعدات النشطة غير المخصصة لأي مشروع. لنقل معدة من مشروع آخر استخدم "نقل" من صفحة المعدة.</p>
      <input class="search" placeholder="بحث..." [(ngModel)]="term" />
      <div class="list">
        @for (e of filtered(); track e.id) {
          <label class="item">
            <mat-checkbox [checked]="selected().has(e.id)" (change)="toggle(e.id)" />
            <span class="grow"><strong>{{ e.code }}</strong> — {{ e.name }} <span class="muted small">{{ e.categoryName }}</span></span>
          </label>
        } @empty {
          <app-empty icon="local_shipping" title="لا توجد معدات متاحة للتخصيص" />
        }
      </div>
      <div class="form-grid">
        <app-date-field label="تاريخ التخصيص" [formControl]="date" required />
        <mat-form-field><mat-label>ملاحظات</mat-label><input matInput [formControl]="notes" /></mat-form-field>
      </div>
    </div>
    <div class="dialog-foot">
      <span class="muted small" style="margin-inline-end:auto">تم اختيار {{ selected().size }}</span>
      <button class="btn" mat-dialog-close>إلغاء</button>
      <button class="btn primary" [disabled]="busy() || !selected().size || !date.value" (click)="save()">تخصيص</button>
    </div>
  `,
  styles: `
    .search { height: 36px; border: 1px solid var(--border-strong); border-radius: 6px; padding: 0 10px; font: inherit; }
    .list { max-height: 320px; overflow: auto; border: 1px solid var(--border); border-radius: 8px; }
    .item { display: flex; align-items: center; gap: 4px; padding: 2px 8px; border-bottom: 1px solid var(--border); cursor: pointer; }
    .item:last-child { border-bottom: 0; }
    .grow { flex: 1; }
  `,
})
export class BulkAssignDialog implements OnInit {
  d = inject<{ projectId: number; projectName: string }>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<BulkAssignDialog>);
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private fb = inject(FormBuilder);
  items = signal<EquipmentListItem[]>([]);
  selected = signal(new Set<number>());
  term = '';
  busy = signal(false);
  date = this.fb.control<string | null>(todayIso());
  notes = this.fb.control('');
  filtered = () => {
    const t = this.term.trim().toLowerCase();
    return t ? this.items().filter(e => `${e.code} ${e.name} ${e.plateNumber ?? ''}`.toLowerCase().includes(t)) : this.items();
  };

  async ngOnInit(): Promise<void> {
    const r = await this.api.get<PagedResult<EquipmentListItem>>('equipment', { unassigned: true, pageSize: 500, sort: 'code' });
    this.items.set(r.items.filter(e => e.status !== 'OutOfService' && e.status !== 'Inactive'));
  }

  toggle(id: number): void {
    const s = new Set(this.selected());
    if (s.has(id)) s.delete(id); else s.add(id);
    this.selected.set(s);
  }

  async save(): Promise<void> {
    this.busy.set(true);
    try {
      const r = await this.api.post<{ count: number }>(`projects/${this.d.projectId}/assign`,
        { equipmentIds: [...this.selected()], date: this.date.value, notes: this.notes.value || null });
      this.notify.success(`تم تخصيص ${r.count} معدة`);
      this.ref.close(true);
    } catch (ex) { this.notify.error(ex); } finally { this.busy.set(false); }
  }
}

/* ===================== Assign driver to equipment ===================== */
@Component({
  selector: 'app-driver-assign-dialog',
  imports: [MatDialogModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatCheckboxModule, DateField, EntitySelect],
  template: `
    <div class="dialog-head"><span class="material-symbols-outlined">person_add</span><h2>تعيين سائق على معدة</h2></div>
    <form [formGroup]="form" (ngSubmit)="save()">
      <div class="dialog-body stack" style="gap:8px">
        <app-entity-select kind="drivers" label="السائق" formControlName="driverId" required [error]="e('driverId')" />
        <app-entity-select kind="equipment" label="المعدة" formControlName="equipmentId" required [error]="e('equipmentId')" />
        <div class="form-grid">
          <app-date-field label="من تاريخ" formControlName="startDate" required [error]="e('startDate')" />
          <app-date-field label="إلى تاريخ (اختياري)" formControlName="endDate" [error]="e('endDate')" />
        </div>
        <mat-checkbox formControlName="isPrimary">السائق الأساسي للمعدة</mat-checkbox>
        <mat-form-field><mat-label>ملاحظات</mat-label><input matInput formControlName="notes" /></mat-form-field>
      </div>
      <div class="dialog-foot">
        <button class="btn" type="button" mat-dialog-close>إلغاء</button>
        <button class="btn primary" type="submit" [disabled]="busy()">تعيين</button>
      </div>
    </form>
  `,
})
export class DriverAssignDialog {
  d = inject<{ driverId?: number; equipmentId?: number }>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<DriverAssignDialog>);
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  busy = signal(false);
  form = inject(FormBuilder).group({
    driverId: [this.d.driverId ?? null as number | null, Validators.required],
    equipmentId: [this.d.equipmentId ?? null as number | null, Validators.required],
    startDate: [todayIso() as string | null, Validators.required],
    endDate: [null as string | null],
    isPrimary: [true],
    notes: [''],
  });
  e = (k: string) => err(this.form.get(k));

  constructor() {
    if (this.d.driverId) this.form.controls.driverId.disable();
    if (this.d.equipmentId) this.form.controls.equipmentId.disable();
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    try {
      await this.api.post('assignments/drivers', clean(this.form.getRawValue()));
      this.notify.success('تم تعيين السائق');
      this.ref.close(true);
    } catch (ex) {
      if (!applyServerErrors(this.form, ex)) this.notify.error(ex);
    } finally { this.busy.set(false); }
  }
}

/* ===================== End / replace driver assignment ===================== */
export interface DriverAssignmentRef { id: number; driverName: string; equipmentName: string; startDate: string; mode: 'end' | 'replace'; }

@Component({
  selector: 'app-driver-end-dialog',
  imports: [MatDialogModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, DateField, EntitySelect],
  template: `
    <div class="dialog-head">
      <span class="material-symbols-outlined">{{ replace() ? 'sync_alt' : 'person_remove' }}</span>
      <h2>{{ replace() ? 'استبدال السائق' : 'إنهاء تعيين السائق' }}</h2>
    </div>
    <form [formGroup]="form" (ngSubmit)="save()">
      <div class="dialog-body stack" style="gap:8px">
        <div class="notice">{{ d.driverName }} على {{ d.equipmentName }}</div>
        @if (replace()) {
          <app-entity-select kind="drivers" label="السائق الجديد" formControlName="newDriverId" required [error]="e('newDriverId')" />
        }
        <app-date-field [label]="replace() ? 'تاريخ الاستبدال' : 'تاريخ الإنهاء'" formControlName="date" required [error]="e('date')" />
        <mat-form-field><mat-label>ملاحظات</mat-label><input matInput formControlName="notes" /></mat-form-field>
      </div>
      <div class="dialog-foot">
        <button class="btn" type="button" mat-dialog-close>إلغاء</button>
        <button class="btn primary" type="submit" [disabled]="busy()">تأكيد</button>
      </div>
    </form>
  `,
})
export class DriverEndDialog {
  d = inject<DriverAssignmentRef>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<DriverEndDialog>);
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  replace = computed(() => this.d.mode === 'replace');
  busy = signal(false);
  form = inject(FormBuilder).group({
    newDriverId: [null as number | null, this.d.mode === 'replace' ? Validators.required : null],
    date: [todayIso() as string | null, Validators.required],
    notes: [''],
  });
  e = (k: string) => err(this.form.get(k));

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    const v = this.form.getRawValue();
    try {
      if (this.replace()) await this.api.post(`assignments/drivers/${this.d.id}/replace`, { newDriverId: v.newDriverId, date: v.date, notes: v.notes || null });
      else await this.api.post(`assignments/drivers/${this.d.id}/end`, { endDate: v.date, notes: v.notes || null });
      this.notify.success('تم الحفظ');
      this.ref.close(true);
    } catch (ex) {
      if (!applyServerErrors(this.form, ex)) this.notify.error(ex);
    } finally { this.busy.set(false); }
  }
}
