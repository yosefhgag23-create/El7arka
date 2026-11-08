import { Component, OnInit, booleanAttribute, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ApiService } from '../../core/api.service';
import { NumPipe } from '../../core/format';
import { DUE_STATUS, meterUnit } from '../../core/labels';
import { MaintenanceReminder } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { CellDef, Column, DataTable } from '../../shared/data-table';
import { Badge } from '../../shared/ui';
import { openDialog } from '../assignments/dialogs';
import { MaintenanceDialog } from './maintenance-dialog';

@Component({
  selector: 'app-reminders-table',
  imports: [DataTable, CellDef, Badge, RouterLink, NumPipe],
  template: `
    <app-data-table [columns]="cols" [rows]="rows()" [paged]="false" [loading]="loading()" [trackBy]="track"
      emptyIcon="event_available" emptyTitle="لا توجد صيانات مستحقة" emptyMessage="تظهر هنا مواعيد الصيانة الدورية حسب التاريخ والعداد.">
      <ng-template appCell="equipment" let-r>
        <a class="link" [routerLink]="['/equipment', r.equipmentId]">{{ r.equipmentCode }}</a>
        <div class="cell-sub">{{ r.equipmentName }}</div>
      </ng-template>
      <ng-template appCell="remaining" let-r>
        @if (r.daysRemaining !== null && r.daysRemaining !== undefined) {
          <div class="num" [class.text-danger]="r.daysRemaining < 0">{{ r.daysRemaining < 0 ? 'متأخر ' + (-r.daysRemaining) : r.daysRemaining }} يوم</div>
        }
        @if (r.meterRemaining !== null && r.meterRemaining !== undefined) {
          <div class="num cell-sub" [class.text-danger]="r.meterRemaining < 0">{{ r.meterRemaining | num }} {{ unit(r.meterType) }}</div>
        }
      </ng-template>
      <ng-template appCell="status" let-r><app-badge [meta]="$any(dueMeta)[r.status]" /></ng-template>
      <ng-template appCell="actions" let-r>
        <div class="actions-cell"><button class="btn sm" (click)="record(r)">تسجيل التنفيذ</button></div>
      </ng-template>
    </app-data-table>
  `,
})
export class RemindersTable implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);
  equipmentId = input<number>();
  dueOnly = input(false, { transform: booleanAttribute });
  hideEquipment = input(false, { transform: booleanAttribute });
  rows = signal<MaintenanceReminder[]>([]);
  loading = signal(false);
  dueMeta = DUE_STATUS;
  unit = meterUnit;
  track = (r: MaintenanceReminder) => `${r.equipmentId}-${r.maintenanceTypeId}`;
  cols: Column<MaintenanceReminder>[] = [];

  ngOnInit(): void {
    this.cols = [
      ...(this.hideEquipment() ? [] : [{ key: 'equipment', label: 'المعدة' }]),
      { key: 'maintenanceTypeName', label: 'نوع الصيانة' },
      { key: 'lastDoneDate', label: 'آخر تنفيذ', type: 'date' },
      { key: 'nextDueDate', label: 'الموعد (تاريخ)', type: 'date' },
      { key: 'nextDueMeter', label: 'الموعد (عداد)', type: 'num' },
      { key: 'currentMeter', label: 'العداد الحالي', type: 'num' },
      { key: 'remaining', label: 'المتبقي' },
      { key: 'status', label: 'الحالة' },
      { key: 'actions', label: '' },
    ];
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const id = this.equipmentId();
      this.rows.set(id
        ? await this.api.get<MaintenanceReminder[]>(`equipment/${id}/maintenance-reminders`)
        : await this.api.get<MaintenanceReminder[]>('maintenance/reminders', { dueOnly: this.dueOnly() || null }));
    } catch (e) { this.notify.error(e); } finally { this.loading.set(false); }
  }

  async record(r: MaintenanceReminder): Promise<void> {
    if (await openDialog(this.dialog, MaintenanceDialog, { equipmentId: r.equipmentId, maintenanceTypeId: r.maintenanceTypeId }, '760px')) this.load();
  }
}
