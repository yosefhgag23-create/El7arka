import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ApiService } from '../../core/api.service';
import { todayIso } from '../../core/format';
import { LookupsService } from '../../core/lookups.service';
import { ExpenseListItem } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { DateField, EntitySelect, FileUpload } from '../../shared/fields';
import { applyServerErrors, autoFillFromEquipment, clean, err, linkAmounts } from '../../shared/forms';

export interface ExpenseDialogData { item?: ExpenseListItem; equipmentId?: number; projectId?: number; }

@Component({
  selector: 'app-expense-dialog',
  imports: [MatDialogModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, DateField, EntitySelect, FileUpload],
  template: `
    <div class="dialog-head"><span class="material-symbols-outlined">receipt_long</span><h2>{{ d.item ? 'تعديل مصروف' : 'تسجيل مصروف تشغيل' }}</h2></div>
    <form [formGroup]="form" (ngSubmit)="save()">
      <div class="dialog-body">
        <div class="form-grid">
          <mat-form-field>
            <mat-label>بند المصروف</mat-label>
            <mat-select formControlName="categoryId" required>
              @for (c of categories; track c.id) { <mat-option [value]="c.id">{{ c.nameAr }}</mat-option> }
            </mat-select>
            <mat-hint>الوقود والصيانة والإيجار والإضافي تُسجَّل من شاشاتها</mat-hint>
            <mat-error>{{ e('categoryId') }}</mat-error>
          </mat-form-field>
          <app-date-field label="التاريخ" formControlName="expenseDate" required [error]="e('expenseDate')" />
          <app-entity-select kind="equipment" label="المعدة" formControlName="equipmentId" [error]="e('equipmentId')" hint="حدد المعدة أو المشروع أو كليهما" />
          <app-entity-select kind="projects" label="المشروع" formControlName="projectId" [error]="e('projectId')" hint="يُملأ تلقائياً من تخصيص المعدة في التاريخ" />
          <mat-form-field>
            <mat-label>الكمية (اختياري)</mat-label>
            <input matInput type="number" formControlName="quantity" />
            <mat-error>{{ e('quantity') }}</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>سعر الوحدة (اختياري)</mat-label>
            <input matInput type="number" formControlName="unitPrice" />
            <mat-error>{{ e('unitPrice') }}</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>المبلغ</mat-label>
            <input matInput type="number" formControlName="amount" />
            <mat-hint>يُحسب تلقائياً من الكمية × السعر</mat-hint>
            <mat-error>{{ e('amount') }}</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>قراءة العداد (اختياري)</mat-label>
            <input matInput type="number" formControlName="meterReading" />
            <mat-error>{{ e('meterReading') }}</mat-error>
          </mat-form-field>
          <mat-form-field class="full"><mat-label>البيان</mat-label><input matInput formControlName="description" /></mat-form-field>
          <mat-form-field class="full"><mat-label>ملاحظات</mat-label><input matInput formControlName="notes" /></mat-form-field>
          <div class="full"><app-file-upload ownerType="Expense" [current]="form.value.attachmentId" (uploaded)="form.controls.attachmentId.setValue($event)" /></div>
        </div>
      </div>
      <div class="dialog-foot">
        <button class="btn" type="button" mat-dialog-close>إلغاء</button>
        <button class="btn primary" type="submit" [disabled]="busy()">حفظ</button>
      </div>
    </form>
  `,
})
export class ExpenseDialog {
  d = inject<ExpenseDialogData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<ExpenseDialog>);
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private lookups = inject(LookupsService);
  categories = this.lookups.active('ExpenseCategories').filter(c => c.manualEntryAllowed || c.id === this.d.item?.categoryId);
  busy = signal(false);
  private i = this.d.item;
  form = inject(FormBuilder).group({
    categoryId: [this.i?.categoryId ?? null as number | null, Validators.required],
    expenseDate: [this.i?.expenseDate ?? todayIso() as string | null, Validators.required],
    equipmentId: [this.i?.equipmentId ?? this.d.equipmentId ?? null as number | null],
    projectId: [this.i?.projectId ?? this.d.projectId ?? null as number | null],
    amount: [this.i?.amount ?? null as number | null],
    quantity: [this.i?.quantity ?? null as number | null],
    unitPrice: [this.i?.unitPrice ?? null as number | null],
    meterReading: [this.i?.meterReading ?? null as number | null],
    description: [this.i?.description ?? ''],
    attachmentId: [this.i?.attachmentId ?? null as number | null],
    notes: [this.i?.notes ?? ''],
  });
  private linked = linkAmounts(this.form, { quantity: 'quantity', price: 'unitPrice', total: 'amount' });
  private defaults = autoFillFromEquipment(this.form, {
    equipment: 'equipmentId', date: 'expenseDate', fill: { projectId: 'projectId' }, runNow: !this.i && !this.d.projectId,
  });
  e = (k: string) => err(this.form.get(k));

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    try {
      const body = clean(this.form.getRawValue());
      if (this.i) await this.api.put(`expenses/${this.i.id}`, body);
      else await this.api.post('expenses', body);
      this.notify.success('تم حفظ المصروف');
      this.ref.close(true);
    } catch (ex) {
      if (!applyServerErrors(this.form, ex)) this.notify.error(ex);
    } finally { this.busy.set(false); }
  }
}
