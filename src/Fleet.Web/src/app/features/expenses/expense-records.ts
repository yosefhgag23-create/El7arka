import { Component, OnInit, booleanAttribute, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../core/api.service';
import { SOURCE_TYPE, options } from '../../core/labels';
import { LookupsService } from '../../core/lookups.service';
import { ExpenseListItem, ExpenseSourceType, PagedResult } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { CellDef, Column, DataTable, ListState } from '../../shared/data-table';
import { FilterSelect, Period, PeriodFilter, SearchBox } from '../../shared/fields';
import { Badge } from '../../shared/ui';
import { openDialog } from '../assignments/dialogs';
import { ExpenseDialog } from './expense-dialog';

@Component({
  selector: 'app-expense-records',
  imports: [DataTable, CellDef, SearchBox, FilterSelect, PeriodFilter, Badge, RouterLink, MatTooltipModule],
  template: `
    <div class="card">
      <div class="filters">
        <app-search placeholder="بحث بالبيان أو المعدة" (search)="list.patch({ search: $event })" />
        <app-filter-select placeholder="كل البنود" numeric [options]="categories" [value]="list.query().categoryId" (valueChange)="list.patch({ categoryId: $event })" />
        <app-filter-select placeholder="كل المصادر" [options]="sources" [value]="list.query().sourceType" (valueChange)="list.patch({ sourceType: $event })" />
        <app-period [from]="list.query().from" [to]="list.query().to" (change)="setPeriod($event)" />
        <span class="spacer"></span>
        <button class="btn primary" (click)="add()"><span class="material-symbols-outlined">add</span>تسجيل مصروف</button>
      </div>
      <app-data-table [columns]="cols" [rows]="list.rows()" [total]="list.total()" [loading]="list.loading()"
        [page]="list.query().page" [pageSize]="list.query().pageSize" [sort]="list.query().sort"
        emptyIcon="receipt_long" emptyTitle="لا توجد مصروفات"
        (pageChange)="list.setPage($event)" (pageSizeChange)="list.setPageSize($event)" (sortChange)="list.setSort($event)">
        <ng-template appCell="equipment" let-r>
          @if (r.equipmentId) {
            <a class="link" [routerLink]="['/equipment', r.equipmentId]">{{ r.equipmentCode }}</a>
            <div class="cell-sub">{{ r.equipmentName }}</div>
          } @else { <span class="muted">—</span> }
        </ng-template>
        <ng-template appCell="category" let-r>
          <div class="cell-title">{{ r.categoryName }}</div>
          @if (r.description) { <div class="cell-sub">{{ r.description }}</div> }
        </ng-template>
        <ng-template appCell="sourceType" let-r><app-badge [meta]="$any(sourceMeta)[r.sourceType]" /></ng-template>
        <ng-template appCell="actions" let-r>
          <div class="actions-cell">
            @if (r.attachmentId) { <a class="btn ghost icon sm" [href]="att(r.attachmentId)" target="_blank" matTooltip="المرفق"><span class="material-symbols-outlined">attach_file</span></a> }
            @if (!r.isReadOnly) {
              <button class="btn ghost icon sm" matTooltip="تعديل" (click)="edit(r)"><span class="material-symbols-outlined">edit</span></button>
              <button class="btn ghost icon sm" matTooltip="حذف" (click)="remove(r)"><span class="material-symbols-outlined">delete</span></button>
            } @else {
              <span class="material-symbols-outlined muted" style="font-size:18px;padding:5px" matTooltip="قيد تلقائي — يُعدَّل من شاشته الأصلية">lock</span>
            }
          </div>
        </ng-template>
      </app-data-table>
    </div>
  `,
})
export class ExpenseRecords implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);
  private lookups = inject(LookupsService);
  fixed = input<Record<string, number>>({});
  hideEquipment = input(false, { transform: booleanAttribute });
  categories = this.lookups.all('ExpenseCategories').map(f => ({ value: f.id, label: f.nameAr }));
  sources = options(SOURCE_TYPE);
  sourceMeta = SOURCE_TYPE;
  att = (id: number) => ApiService.attachmentUrl(id);
  cols: Column<ExpenseListItem>[] = [];

  list = new ListState<ExpenseListItem, { categoryId?: number | null; sourceType?: ExpenseSourceType | null; from?: string | null; to?: string | null }>(
    q => this.api.get<PagedResult<ExpenseListItem>>('expenses', { ...q, ...this.fixed() }), e => this.notify.error(e));

  ngOnInit(): void {
    this.cols = [
      { key: 'expenseDate', label: 'التاريخ', sort: 'expenseDate', type: 'date' },
      ...(this.hideEquipment() ? [] : [{ key: 'equipment', label: 'المعدة', sort: 'equipment' }]),
      { key: 'projectName', label: 'المشروع', sort: 'project' },
      { key: 'category', label: 'البند', sort: 'category' },
      { key: 'sourceType', label: 'المصدر' },
      { key: 'amount', label: 'المبلغ', sort: 'amount', type: 'money' },
      { key: 'actions', label: '' },
    ];
    this.list.load();
  }

  setPeriod(p: Period): void { this.list.patch({ from: p.from, to: p.to }); }
  async add(): Promise<void> {
    if (await openDialog(this.dialog, ExpenseDialog, { equipmentId: this.fixed()['equipmentId'], projectId: this.fixed()['projectId'] }, '680px')) this.list.load();
  }
  async edit(r: ExpenseListItem): Promise<void> { if (await openDialog(this.dialog, ExpenseDialog, { item: r }, '680px')) this.list.load(); }
  async remove(r: ExpenseListItem): Promise<void> {
    const reason = await this.notify.confirmWithReason({ title: 'حذف المصروف', danger: true, confirmText: 'حذف' });
    if (reason === null) return;
    try { await this.api.delete(`expenses/${r.id}`, { reason }); this.notify.success('تم الحذف'); this.list.load(); }
    catch (e) { this.notify.error(e); }
  }
}
