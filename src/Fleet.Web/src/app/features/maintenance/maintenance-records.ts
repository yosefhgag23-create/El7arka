import { Component, OnInit, booleanAttribute, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../core/api.service';
import { LookupsService } from '../../core/lookups.service';
import { MaintenanceListItem, PagedResult } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { CellDef, Column, DataTable, ListState } from '../../shared/data-table';
import { FilterSelect, Period, PeriodFilter, SearchBox } from '../../shared/fields';
import { openDialog } from '../assignments/dialogs';
import { MaintenanceDialog } from './maintenance-dialog';

@Component({
  selector: 'app-maintenance-records',
  imports: [DataTable, CellDef, SearchBox, FilterSelect, PeriodFilter, RouterLink, MatTooltipModule],
  template: `
    <div class="card">
      <div class="filters">
        <app-search placeholder="بحث بالمعدة أو الورشة أو الوصف" (search)="list.patch({ search: $event })" />
        <app-filter-select placeholder="كل الأنواع" numeric [options]="types" [value]="list.query().maintenanceTypeId" (valueChange)="list.patch({ maintenanceTypeId: $event })" />
        <app-period [from]="list.query().from" [to]="list.query().to" (change)="setPeriod($event)" />
        <span class="spacer"></span>
        <button class="btn primary" (click)="add()"><span class="material-symbols-outlined">add</span>تسجيل صيانة</button>
      </div>
      <app-data-table [columns]="cols" [rows]="list.rows()" [total]="list.total()" [loading]="list.loading()"
        [page]="list.query().page" [pageSize]="list.query().pageSize" [sort]="list.query().sort"
        emptyIcon="build" emptyTitle="لا توجد عمليات صيانة"
        (pageChange)="list.setPage($event)" (pageSizeChange)="list.setPageSize($event)" (sortChange)="list.setSort($event)">
        <ng-template appCell="equipment" let-r>
          <a class="link" [routerLink]="['/equipment', r.equipmentId]">{{ r.equipmentCode }}</a>
          <div class="cell-sub">{{ r.equipmentName }}</div>
        </ng-template>
        <ng-template appCell="type" let-r>
          <div class="cell-title">{{ r.maintenanceTypeName }}</div>
          @if (r.description) { <div class="cell-sub">{{ r.description }}</div> }
        </ng-template>
        <ng-template appCell="actions" let-r>
          <div class="actions-cell">
            @if (r.attachmentId) { <a class="btn ghost icon sm" [href]="att(r.attachmentId)" target="_blank" matTooltip="المرفق"><span class="material-symbols-outlined">attach_file</span></a> }
            <button class="btn ghost icon sm" matTooltip="تعديل" (click)="edit(r)"><span class="material-symbols-outlined">edit</span></button>
            <button class="btn ghost icon sm" matTooltip="حذف" (click)="remove(r)"><span class="material-symbols-outlined">delete</span></button>
          </div>
        </ng-template>
      </app-data-table>
    </div>
  `,
})
export class MaintenanceRecords implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);
  private lookups = inject(LookupsService);
  fixed = input<Record<string, number>>({});
  hideEquipment = input(false, { transform: booleanAttribute });
  types = this.lookups.all('MaintenanceTypes').map(f => ({ value: f.id, label: f.nameAr }));
  att = (id: number) => ApiService.attachmentUrl(id);
  cols: Column<MaintenanceListItem>[] = [];

  list = new ListState<MaintenanceListItem, { maintenanceTypeId?: number | null; from?: string | null; to?: string | null }>(
    q => this.api.get<PagedResult<MaintenanceListItem>>('maintenance', { ...q, ...this.fixed() }), e => this.notify.error(e));

  ngOnInit(): void {
    this.cols = [
      { key: 'maintenanceDate', label: 'التاريخ', sort: 'maintenanceDate', type: 'date' },
      ...(this.hideEquipment() ? [] : [{ key: 'equipment', label: 'المعدة', sort: 'equipment' }]),
      { key: 'type', label: 'النوع', sort: 'type' },
      { key: 'workshop', label: 'الورشة' },
      { key: 'meterReading', label: 'العداد', type: 'num' },
      { key: 'partsCost', label: 'قطع غيار', type: 'money' },
      { key: 'laborCost', label: 'مصنعية', type: 'money' },
      { key: 'otherCost', label: 'أخرى', type: 'money' },
      { key: 'totalCost', label: 'الإجمالي', sort: 'totalCost', type: 'money' },
      { key: 'nextDueDate', label: 'القادمة', type: 'date' },
      { key: 'actions', label: '' },
    ];
    this.list.load();
  }

  setPeriod(p: Period): void { this.list.patch({ from: p.from, to: p.to }); }
  async add(): Promise<void> { if (await openDialog(this.dialog, MaintenanceDialog, { equipmentId: this.fixed()['equipmentId'] }, '760px')) this.list.load(); }
  async edit(r: MaintenanceListItem): Promise<void> { if (await openDialog(this.dialog, MaintenanceDialog, { item: r }, '760px')) this.list.load(); }
  async remove(r: MaintenanceListItem): Promise<void> {
    const reason = await this.notify.confirmWithReason({ title: 'حذف عملية الصيانة', message: 'سيتم حذف العملية وقيودها المالية.', danger: true, confirmText: 'حذف' });
    if (reason === null) return;
    try { await this.api.delete(`maintenance/${r.id}`, { reason }); this.notify.success('تم الحذف'); this.list.load(); }
    catch (e) { this.notify.error(e); }
  }
}
