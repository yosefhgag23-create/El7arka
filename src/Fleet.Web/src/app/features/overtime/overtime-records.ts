import { Component, OnInit, booleanAttribute, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { NumPipe } from '../../core/format';
import { APPROVAL_STATUS, options } from '../../core/labels';
import { ApprovalStatus, OvertimeListItem, PagedResult } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { CellDef, Column, DataTable, ListState } from '../../shared/data-table';
import { FilterSelect, Period, PeriodFilter, SearchBox } from '../../shared/fields';
import { Badge } from '../../shared/ui';
import { openDialog } from '../assignments/dialogs';
import { OvertimeDialog } from './overtime-dialog';

@Component({
  selector: 'app-overtime-records',
  imports: [DataTable, CellDef, SearchBox, FilterSelect, PeriodFilter, Badge, RouterLink, MatTooltipModule, NumPipe],
  template: `
    <div class="card">
      <div class="filters">
        <app-search placeholder="بحث بالسائق أو البيان" (search)="list.patch({ search: $event })" />
        <app-filter-select placeholder="كل الحالات" [options]="statuses" [value]="list.query().approvalStatus" (valueChange)="list.patch({ approvalStatus: $event })" />
        <app-period [from]="list.query().from" [to]="list.query().to" (change)="setPeriod($event)" />
        <span class="spacer"></span>
        <button class="btn primary" (click)="add()"><span class="material-symbols-outlined">add</span>تسجيل وقت إضافي</button>
      </div>
      <app-data-table [columns]="cols" [rows]="list.rows()" [total]="list.total()" [loading]="list.loading()"
        [page]="list.query().page" [pageSize]="list.query().pageSize" [sort]="list.query().sort"
        emptyIcon="more_time" emptyTitle="لا توجد سجلات وقت إضافي"
        (pageChange)="list.setPage($event)" (pageSizeChange)="list.setPageSize($event)" (sortChange)="list.setSort($event)">
        <ng-template appCell="driver" let-r><a class="link" [routerLink]="['/drivers', r.driverId]">{{ r.driverName }}</a></ng-template>
        <ng-template appCell="overtimeHours" let-r><span class="num">{{ r.overtimeHours | num }}</span> <span class="muted small">ساعة</span></ng-template>
        <ng-template appCell="approvalStatus" let-r>
          <app-badge [meta]="$any(statusMeta)[r.approvalStatus]" />
          @if (r.approvedBy) { <div class="cell-sub">{{ r.approvedBy }}</div> }
        </ng-template>
        <ng-template appCell="actions" let-r>
          <div class="actions-cell">
            @if (auth.isAdmin()) {
              @if (r.approvalStatus !== 'Approved') {
                <button class="btn ghost icon sm" matTooltip="اعتماد" (click)="approve(r, 'Approved')"><span class="material-symbols-outlined text-success">check_circle</span></button>
              }
              @if (r.approvalStatus !== 'Rejected') {
                <button class="btn ghost icon sm" matTooltip="رفض" (click)="approve(r, 'Rejected')"><span class="material-symbols-outlined text-danger">cancel</span></button>
              }
            }
            @if (r.approvalStatus !== 'Approved' || auth.isAdmin()) {
              <button class="btn ghost icon sm" matTooltip="تعديل" (click)="edit(r)"><span class="material-symbols-outlined">edit</span></button>
              <button class="btn ghost icon sm" matTooltip="حذف" (click)="remove(r)"><span class="material-symbols-outlined">delete</span></button>
            }
          </div>
        </ng-template>
      </app-data-table>
    </div>
  `,
})
export class OvertimeRecords implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);
  auth = inject(AuthService);
  fixed = input<Record<string, number>>({});
  hideDriver = input(false, { transform: booleanAttribute });
  statuses = options(APPROVAL_STATUS);
  statusMeta = APPROVAL_STATUS;
  cols: Column<OvertimeListItem>[] = [];

  list = new ListState<OvertimeListItem, { approvalStatus?: ApprovalStatus | null; from?: string | null; to?: string | null }>(
    q => this.api.get<PagedResult<OvertimeListItem>>('overtime', { ...q, ...this.fixed() }), e => this.notify.error(e));

  ngOnInit(): void {
    this.cols = [
      { key: 'workDate', label: 'التاريخ', sort: 'workDate', type: 'date' },
      ...(this.hideDriver() ? [] : [{ key: 'driver', label: 'السائق', sort: 'driver' }]),
      { key: 'equipmentName', label: 'المعدة' },
      { key: 'projectName', label: 'المشروع' },
      { key: 'overtimeHours', label: 'الساعات', sort: 'overtimeHours', align: 'end' },
      { key: 'hourlyRate', label: 'سعر الساعة', type: 'money' },
      { key: 'amount', label: 'القيمة', sort: 'amount', type: 'money' },
      { key: 'approvalStatus', label: 'الحالة', sort: 'approvalStatus' },
      { key: 'actions', label: '' },
    ];
    this.list.load();
  }

  setPeriod(p: Period): void { this.list.patch({ from: p.from, to: p.to }); }
  async add(): Promise<void> { if (await openDialog(this.dialog, OvertimeDialog, { driverId: this.fixed()['driverId'] }, '680px')) this.list.load(); }
  async edit(r: OvertimeListItem): Promise<void> { if (await openDialog(this.dialog, OvertimeDialog, { item: r }, '680px')) this.list.load(); }

  async approve(r: OvertimeListItem, status: ApprovalStatus): Promise<void> {
    try {
      await this.api.put(`overtime/${r.id}/approval`, { status });
      this.notify.success(status === 'Approved' ? 'تم الاعتماد وإضافته للتكاليف' : 'تم الرفض');
      this.list.load();
    } catch (e) { this.notify.error(e); }
  }

  async remove(r: OvertimeListItem): Promise<void> {
    const reason = await this.notify.confirmWithReason({ title: 'حذف سجل الوقت الإضافي', danger: true, confirmText: 'حذف' });
    if (reason === null) return;
    try { await this.api.delete(`overtime/${r.id}`, { reason }); this.notify.success('تم الحذف'); this.list.load(); }
    catch (e) { this.notify.error(e); }
  }
}
