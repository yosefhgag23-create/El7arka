import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../core/api.service';
import { AssignmentHistoryItem, DriverAssignmentItem, EquipmentDto, PagedResult, TransferListItem } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { CellDef, Column, DataTable, ListState } from '../../shared/data-table';
import { Period, PeriodFilter, SearchBox } from '../../shared/fields';
import { Badge, PageHeader } from '../../shared/ui';
import { DriverAssignDialog, DriverEndDialog, TransferDialog, openDialog } from './dialogs';

type Tab = 'active' | 'transfers' | 'drivers';

@Component({
  selector: 'app-assignments',
  imports: [PageHeader, DataTable, CellDef, SearchBox, PeriodFilter, Badge, RouterLink, MatCheckboxModule, MatTooltipModule],
  template: `
    <div class="page">
      <app-page-header title="توزيع المعدات" subtitle="تخصيص المعدات للمشروعات وحركات النقل وتعيين السائقين" [crumbs]="[{ label: 'توزيع المعدات' }]">
        <button class="btn" (click)="assignDriver()"><span class="material-symbols-outlined">person_add</span>تعيين سائق</button>
      </app-page-header>

      <div class="tabs" style="margin-bottom:16px">
        <button [class.active]="tab() === 'active'" (click)="setTab('active')">التخصيص الحالي</button>
        <button [class.active]="tab() === 'transfers'" (click)="setTab('transfers')">سجل النقل</button>
        <button [class.active]="tab() === 'drivers'" (click)="setTab('drivers')">تعيينات السائقين</button>
      </div>

      @switch (tab()) {
        @case ('active') {
          <div class="card">
            <div class="filters">
              <app-search placeholder="بحث بالمعدة أو المشروع" (search)="term.set($event)" />
              <span class="spacer"></span>
              <span class="muted small">{{ filteredActive().length }} معدة مخصصة</span>
            </div>
            <app-data-table [columns]="activeCols" [rows]="filteredActive()" [paged]="false" [loading]="loading()" emptyIcon="swap_horiz"
              emptyTitle="لا توجد معدات مخصصة" emptyMessage="خصص المعدات من صفحة المشروع أو انقلها من صفحة المعدة.">
              <ng-template appCell="equipment" let-r><a class="link" [routerLink]="['/equipment', r.equipmentId]">{{ r.equipmentCode }}</a><div class="cell-sub">{{ r.equipmentName }}</div></ng-template>
              <ng-template appCell="project" let-r><a class="link" [routerLink]="['/projects', r.projectId]">{{ r.projectName }}</a><div class="cell-sub num">{{ r.projectCode }}</div></ng-template>
              <ng-template appCell="actions" let-r><div class="actions-cell"><button class="btn sm" (click)="transfer(r.equipmentId)">نقل</button></div></ng-template>
            </app-data-table>
          </div>
        }
        @case ('transfers') {
          <div class="card">
            <div class="filters">
              <app-search placeholder="بحث بالمعدة" (search)="transfers.patch({ search: $event })" />
              <app-period [from]="transfers.query().from" [to]="transfers.query().to" (change)="setPeriod($event)" />
            </div>
            <app-data-table [columns]="transferCols" [rows]="transfers.rows()" [total]="transfers.total()" [loading]="transfers.loading()"
              [page]="transfers.query().page" [pageSize]="transfers.query().pageSize" emptyIcon="history" emptyTitle="لا توجد حركات نقل"
              (pageChange)="transfers.setPage($event)" (pageSizeChange)="transfers.setPageSize($event)">
              <ng-template appCell="equipment" let-r><a class="link" [routerLink]="['/equipment', r.equipmentId]">{{ r.equipmentCode }}</a><div class="cell-sub">{{ r.equipmentName }}</div></ng-template>
              <ng-template appCell="move" let-r>
                <span>{{ r.fromProjectName || 'بدون مشروع' }}</span>
                <span class="material-symbols-outlined muted" style="font-size:16px;vertical-align:middle;margin:0 6px">arrow_back</span>
                <strong>{{ r.toProjectName || 'إلغاء تخصيص' }}</strong>
              </ng-template>
            </app-data-table>
          </div>
        }
        @case ('drivers') {
          <div class="card">
            <div class="filters">
              <app-search placeholder="بحث بالسائق أو المعدة" (search)="drivers.patch({ search: $event })" />
              <mat-checkbox [checked]="drivers.query().activeOnly !== false" (change)="drivers.patch({ activeOnly: $event.checked })">الحالية فقط</mat-checkbox>
            </div>
            <app-data-table [columns]="driverCols" [rows]="drivers.rows()" [total]="drivers.total()" [loading]="drivers.loading()"
              [page]="drivers.query().page" [pageSize]="drivers.query().pageSize" emptyIcon="badge" emptyTitle="لا توجد تعيينات"
              (pageChange)="drivers.setPage($event)" (pageSizeChange)="drivers.setPageSize($event)">
              <ng-template appCell="driver" let-r><a class="link" [routerLink]="['/drivers', r.driverId]">{{ r.driverName }}</a><div class="cell-sub num">{{ r.driverPhone }}</div></ng-template>
              <ng-template appCell="equipment" let-r><a class="link" [routerLink]="['/equipment', r.equipmentId]">{{ r.equipmentCode }}</a><div class="cell-sub">{{ r.equipmentName }}</div></ng-template>
              <ng-template appCell="isPrimary" let-r>@if (r.isPrimary) { <app-badge label="أساسي" tone="dark" /> }</ng-template>
              <ng-template appCell="state" let-r>
                @if (r.isActive) { <app-badge label="حالي" tone="success" /> } @else { <span class="num muted">{{ r.endDate }}</span> }
              </ng-template>
              <ng-template appCell="actions" let-r>
                @if (r.isActive) {
                  <div class="actions-cell">
                    <button class="btn ghost icon sm" matTooltip="استبدال" (click)="endDriver(r, 'replace')"><span class="material-symbols-outlined">sync_alt</span></button>
                    <button class="btn ghost icon sm" matTooltip="إنهاء" (click)="endDriver(r, 'end')"><span class="material-symbols-outlined">link_off</span></button>
                  </div>
                }
              </ng-template>
            </app-data-table>
          </div>
        }
      }
    </div>
  `,
})
export class Assignments implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);
  tab = signal<Tab>('active');
  loading = signal(false);
  active = signal<AssignmentHistoryItem[]>([]);
  term = signal('');
  filteredActive = computed(() => {
    const t = this.term().toLowerCase();
    return t ? this.active().filter(a => `${a.equipmentCode} ${a.equipmentName} ${a.projectName} ${a.projectCode}`.toLowerCase().includes(t)) : this.active();
  });

  transfers = new ListState<TransferListItem, { from?: string | null; to?: string | null }>(q => this.api.get('assignments/transfers', q), e => this.notify.error(e));
  drivers = new ListState<DriverAssignmentItem, { activeOnly?: boolean }>(q => this.api.get('assignments/drivers', q), e => this.notify.error(e), { activeOnly: true });

  activeCols: Column<AssignmentHistoryItem>[] = [
    { key: 'equipment', label: 'المعدة' }, { key: 'project', label: 'المشروع' }, { key: 'startDate', label: 'منذ', type: 'date' },
    { key: 'days', label: 'الأيام', type: 'int' }, { key: 'startMeter', label: 'عداد البداية', type: 'num' }, { key: 'actions', label: '' },
  ];
  transferCols: Column<TransferListItem>[] = [
    { key: 'transferDate', label: 'التاريخ', type: 'date' }, { key: 'equipment', label: 'المعدة' }, { key: 'move', label: 'الحركة' },
    { key: 'meterReading', label: 'العداد', type: 'num' }, { key: 'notes', label: 'ملاحظات' }, { key: 'createdBy', label: 'بواسطة' },
  ];
  driverCols: Column<DriverAssignmentItem>[] = [
    { key: 'driver', label: 'السائق' }, { key: 'equipment', label: 'المعدة' }, { key: 'isPrimary', label: '' },
    { key: 'startDate', label: 'من', type: 'date' }, { key: 'state', label: 'إلى' }, { key: 'actions', label: '' },
  ];

  ngOnInit(): void { this.loadActive(); }

  setTab(t: Tab): void {
    this.tab.set(t);
    if (t === 'active') this.loadActive();
    if (t === 'transfers') this.transfers.load();
    if (t === 'drivers') this.drivers.load();
  }

  async loadActive(): Promise<void> {
    this.loading.set(true);
    try { this.active.set(await this.api.get<AssignmentHistoryItem[]>('assignments/active')); }
    catch (e) { this.notify.error(e); } finally { this.loading.set(false); }
  }

  setPeriod(p: Period): void { this.transfers.patch({ from: p.from, to: p.to }); }

  async transfer(equipmentId: number): Promise<void> {
    const e = await this.api.get<EquipmentDto>(`equipment/${equipmentId}`);
    const ok = await openDialog(this.dialog, TransferDialog, {
      equipmentId: e.id, equipmentName: `${e.code} — ${e.name}`, currentProjectId: e.currentProjectId, currentProjectName: e.currentProjectName,
      meterType: e.meterType, currentMeter: e.currentMeterReading,
    });
    if (ok) this.loadActive();
  }

  async assignDriver(): Promise<void> {
    if (await openDialog(this.dialog, DriverAssignDialog, {})) { this.tab.set('drivers'); this.drivers.load(); }
  }

  async endDriver(r: DriverAssignmentItem, mode: 'end' | 'replace'): Promise<void> {
    if (await openDialog(this.dialog, DriverEndDialog, { id: r.id, driverName: r.driverName, equipmentName: r.equipmentName, startDate: r.startDate, mode })) this.drivers.load();
  }
}
