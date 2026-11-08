import { Component, OnInit, booleanAttribute, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../core/api.service';
import { NumPipe } from '../../core/format';
import { LookupsService } from '../../core/lookups.service';
import { FuelListItem, PagedResult } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { CellDef, Column, DataTable, ListState } from '../../shared/data-table';
import { FilterSelect, Period, PeriodFilter, SearchBox } from '../../shared/fields';
import { Badge } from '../../shared/ui';
import { openDialog } from '../assignments/dialogs';
import { FuelDialog } from './fuel-dialog';

@Component({
  selector: 'app-fuel-records',
  imports: [DataTable, CellDef, SearchBox, FilterSelect, PeriodFilter, Badge, RouterLink, MatTooltipModule, NumPipe],
  template: `
    <div class="card">
      <div class="filters">
        <app-search placeholder="بحث بالمعدة أو المحطة" (search)="list.patch({ search: $event })" />
        <app-filter-select placeholder="كل أنواع الوقود" numeric [options]="fuelTypes" [value]="list.query().fuelTypeId" (valueChange)="list.patch({ fuelTypeId: $event })" />
        <app-period [from]="list.query().from" [to]="list.query().to" (change)="setPeriod($event)" />
        <span class="spacer"></span>
        <button class="btn primary" (click)="add()"><span class="material-symbols-outlined">add</span>تسجيل تموين</button>
      </div>
      <app-data-table [columns]="cols" [rows]="list.rows()" [total]="list.total()" [loading]="list.loading()"
        [page]="list.query().page" [pageSize]="list.query().pageSize" [sort]="list.query().sort"
        emptyIcon="local_gas_station" emptyTitle="لا توجد عمليات تموين"
        (pageChange)="list.setPage($event)" (pageSizeChange)="list.setPageSize($event)" (sortChange)="list.setSort($event)">
        <ng-template appCell="equipment" let-r>
          <a class="link" [routerLink]="['/equipment', r.equipmentId]">{{ r.equipmentCode }}</a>
          <div class="cell-sub">{{ r.equipmentName }}</div>
        </ng-template>
        <ng-template appCell="quantity" let-r><span class="num">{{ r.quantity | num }}</span> <span class="muted small">{{ r.unit }}</span></ng-template>
        <ng-template appCell="isFullTank" let-r>
          @if (r.isFullTank) { <app-badge label="كامل" tone="dark" /> } @else { <app-badge label="جزئي" /> }
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
export class FuelRecords implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);
  private lookups = inject(LookupsService);
  fixed = input<Record<string, number>>({});
  hideEquipment = input(false, { transform: booleanAttribute });
  fuelTypes = this.lookups.all('FuelTypes').map(f => ({ value: f.id, label: f.nameAr }));
  att = (id: number) => ApiService.attachmentUrl(id);
  cols: Column<FuelListItem>[] = [];

  list = new ListState<FuelListItem, { fuelTypeId?: number | null; from?: string | null; to?: string | null }>(
    q => this.api.get<PagedResult<FuelListItem>>('fuel', { ...q, ...this.fixed() }), e => this.notify.error(e));

  ngOnInit(): void {
    this.cols = [
      { key: 'fuelDate', label: 'التاريخ', sort: 'fuelDate', type: 'date' },
      ...(this.hideEquipment() ? [] : [{ key: 'equipment', label: 'المعدة', sort: 'equipment' }]),
      { key: 'projectName', label: 'المشروع' },
      { key: 'driverName', label: 'السائق' },
      { key: 'fuelTypeName', label: 'الوقود' },
      { key: 'quantity', label: 'الكمية', sort: 'quantity', align: 'end' },
      { key: 'pricePerUnit', label: 'السعر', type: 'money' },
      { key: 'totalAmount', label: 'الإجمالي', sort: 'totalAmount', type: 'money' },
      { key: 'meterReading', label: 'العداد', sort: 'meterReading', type: 'num' },
      { key: 'isFullTank', label: 'التفويل' },
      { key: 'actions', label: '' },
    ];
    this.list.load();
  }

  setPeriod(p: Period): void { this.list.patch({ from: p.from, to: p.to }); }
  async add(): Promise<void> { if (await openDialog(this.dialog, FuelDialog, { equipmentId: this.fixed()['equipmentId'] }, '720px')) this.list.load(); }
  async edit(r: FuelListItem): Promise<void> { if (await openDialog(this.dialog, FuelDialog, { item: r }, '720px')) this.list.load(); }
  async remove(r: FuelListItem): Promise<void> {
    const reason = await this.notify.confirmWithReason({ title: 'حذف عملية التموين', message: 'سيتم حذف العملية وقيدها المالي وقراءة العداد المرتبطة بها.', danger: true, confirmText: 'حذف' });
    if (reason === null) return;
    try { await this.api.delete(`fuel/${r.id}`, { reason }); this.notify.success('تم الحذف'); this.list.load(); }
    catch (e) { this.notify.error(e); }
  }
}
