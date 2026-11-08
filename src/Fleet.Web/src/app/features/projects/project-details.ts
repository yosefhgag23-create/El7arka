import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { ApiService } from '../../core/api.service';
import { DatePipe } from '../../core/format';
import { PROJECT_STATUS, options } from '../../core/labels';
import { AssignmentHistoryItem, CostReport, PagedResult, ProjectDto, ProjectStatus, TransferListItem } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { CostCharts, CostSummary } from '../../shared/cost-summary';
import { CellDef, Column, DataTable } from '../../shared/data-table';
import { Period, PeriodFilter } from '../../shared/fields';
import { Badge, PageHeader } from '../../shared/ui';
import { BulkAssignDialog, TransferDialog, openDialog } from '../assignments/dialogs';

type Tab = 'overview' | 'equipment' | 'history' | 'transfers' | 'costs';

@Component({
  selector: 'app-project-details',
  imports: [PageHeader, Badge, RouterLink, MatMenuModule, DataTable, CellDef, CostSummary, CostCharts, PeriodFilter, DatePipe],
  template: `
    <div class="page">
      @if (p(); as p) {
        <app-page-header [title]="p.name" [subtitle]="p.code + (p.location ? ' • ' + p.location : '')"
          [crumbs]="[{ label: 'المشروعات', link: '/projects' }, { label: p.name }]">
          <app-badge [meta]="statusMeta[p.status]" />
          <button class="btn" [matMenuTriggerFor]="st"><span class="material-symbols-outlined">flag</span>تغيير الحالة</button>
          <mat-menu #st>
            @for (o of statusOptions; track o.value) {
              <button mat-menu-item [disabled]="o.value === p.status" (click)="setStatus(o.value)">{{ o.label }}</button>
            }
          </mat-menu>
          <a class="btn" [routerLink]="['/projects', p.id, 'edit']"><span class="material-symbols-outlined">edit</span>تعديل</a>
          @if (p.status !== 'Archived' && p.status !== 'Completed') {
            <button class="btn primary" (click)="assign()"><span class="material-symbols-outlined">playlist_add</span>تخصيص معدات</button>
          }
        </app-page-header>

        <div class="tabs" style="margin-bottom:16px">
          @for (t of tabs; track t.id) { <button [class.active]="tab() === t.id" (click)="setTab(t.id)">{{ t.label }}</button> }
        </div>

        @switch (tab()) {
          @case ('overview') {
            <div class="stack">
              <div class="card"><div class="card-body kv">
                <div><div class="k">الكود</div><div class="v num">{{ p.code }}</div></div>
                <div><div class="k">الموقع</div><div class="v">{{ p.location || '—' }}</div></div>
                <div><div class="k">تاريخ البدء</div><div class="v">{{ p.startDate | d }}</div></div>
                <div><div class="k">تاريخ الانتهاء</div><div class="v">{{ p.endDate | d }}</div></div>
                <div><div class="k">المعدات الحالية</div><div class="v num">{{ p.activeEquipmentCount }}</div></div>
                <div><div class="k">إجمالي عمليات التخصيص</div><div class="v num">{{ p.totalAssignments }}</div></div>
                @if (p.description) { <div style="grid-column:1/-1"><div class="k">الوصف</div><div class="v">{{ p.description }}</div></div> }
                @if (p.notes) { <div style="grid-column:1/-1"><div class="k">ملاحظات</div><div class="v">{{ p.notes }}</div></div> }
              </div></div>
              <app-cost-summary [t]="costs()?.totals" [loading]="costsLoading()" />
            </div>
          }
          @case ('equipment') {
            <div class="card">
              <app-data-table [columns]="activeCols" [rows]="active()" [paged]="false" [loading]="loading()" [clickable]="true"
                emptyIcon="local_shipping" emptyTitle="لا توجد معدات مخصصة حالياً" (rowClick)="openEquipment($event)">
                <ng-template appCell="equipment" let-r>
                  <div class="cell-title">{{ r.equipmentName }}</div><div class="cell-sub num">{{ r.equipmentCode }}</div>
                </ng-template>
                <ng-template appCell="actions" let-r>
                  <div class="actions-cell"><button class="btn sm" (click)="$event.stopPropagation(); transfer(r)">نقل / إلغاء</button></div>
                </ng-template>
              </app-data-table>
            </div>
          }
          @case ('history') {
            <div class="card">
              <app-data-table [columns]="historyCols" [rows]="history()" [paged]="false" [loading]="loading()" emptyTitle="لا يوجد سجل تخصيص">
                <ng-template appCell="equipment" let-r>
                  <a class="link" [routerLink]="['/equipment', r.equipmentId]">{{ r.equipmentCode }} — {{ r.equipmentName }}</a>
                </ng-template>
                <ng-template appCell="endDate" let-r>
                  @if (r.endDate) { <span class="num">{{ r.endDate | d }}</span> } @else { <app-badge label="حالي" tone="success" /> }
                </ng-template>
              </app-data-table>
            </div>
          }
          @case ('transfers') {
            <div class="card">
              <app-data-table [columns]="transferCols" [rows]="transfers()" [paged]="false" [loading]="loading()" emptyTitle="لا توجد حركات نقل">
                <ng-template appCell="equipment" let-r>
                  <a class="link" [routerLink]="['/equipment', r.equipmentId]">{{ r.equipmentCode }} — {{ r.equipmentName }}</a>
                </ng-template>
                <ng-template appCell="direction" let-r>
                  @if (r.toProjectId === p.id) { <app-badge label="وارد" tone="success" /> } @else { <app-badge label="صادر" tone="warning" /> }
                </ng-template>
              </app-data-table>
            </div>
          }
          @case ('costs') {
            <div class="stack">
              <div class="row"><app-period [from]="period().from" [to]="period().to" (change)="setPeriod($event)" /></div>
              <app-cost-summary [t]="costs()?.totals" [loading]="costsLoading()" />
              <app-cost-charts [categories]="costs()?.byCategory ?? []" [months]="costs()?.byMonth ?? []" [loading]="costsLoading()" />
              <div class="card">
                <div class="card-header"><h3>التكاليف حسب المعدة</h3><span class="sub">الإهلاك والإيجار موزعان حسب أيام التخصيص</span></div>
                <app-data-table [columns]="costCols" [rows]="costs()?.byEquipment ?? []" [paged]="false" [loading]="costsLoading()" emptyTitle="لا توجد تكاليف" />
              </div>
            </div>
          }
        }
      } @else {
        <div class="skeleton" style="height:60px;margin-bottom:16px"></div>
        <div class="skeleton" style="height:240px"></div>
      }
    </div>
  `,
})
export class ProjectDetails implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  id = input.required<string>();
  p = signal<ProjectDto | null>(null);
  tab = signal<Tab>('overview');
  loading = signal(false);
  active = signal<AssignmentHistoryItem[]>([]);
  history = signal<AssignmentHistoryItem[]>([]);
  transfers = signal<TransferListItem[]>([]);
  costs = signal<CostReport | null>(null);
  costsLoading = signal(false);
  period = signal<Period>({ from: null, to: null });
  statusMeta = PROJECT_STATUS;
  statusOptions = options(PROJECT_STATUS);

  tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'نظرة عامة' }, { id: 'equipment', label: 'المعدات الحالية' }, { id: 'history', label: 'سجل التخصيص' },
    { id: 'transfers', label: 'حركات النقل' }, { id: 'costs', label: 'التكاليف' },
  ];

  activeCols: Column<AssignmentHistoryItem>[] = [
    { key: 'equipment', label: 'المعدة' },
    { key: 'startDate', label: 'منذ', type: 'date' },
    { key: 'days', label: 'عدد الأيام', type: 'int' },
    { key: 'startMeter', label: 'عداد البداية', type: 'num' },
    { key: 'actions', label: '' },
  ];
  historyCols: Column<AssignmentHistoryItem>[] = [
    { key: 'equipment', label: 'المعدة' },
    { key: 'startDate', label: 'من', type: 'date' },
    { key: 'endDate', label: 'إلى' },
    { key: 'days', label: 'الأيام', type: 'int' },
    { key: 'startMeter', label: 'عداد البداية', type: 'num' },
    { key: 'endMeter', label: 'عداد النهاية', type: 'num' },
    { key: 'notes', label: 'ملاحظات' },
  ];
  transferCols: Column<TransferListItem>[] = [
    { key: 'transferDate', label: 'التاريخ', type: 'date' },
    { key: 'equipment', label: 'المعدة' },
    { key: 'direction', label: 'الاتجاه' },
    { key: 'fromProjectName', label: 'من مشروع', value: r => r.fromProjectName ?? 'بدون مشروع' },
    { key: 'toProjectName', label: 'إلى مشروع', value: r => r.toProjectName ?? 'إلغاء تخصيص' },
    { key: 'meterReading', label: 'العداد', type: 'num' },
    { key: 'createdBy', label: 'بواسطة' },
  ];
  costCols: Column[] = [
    { key: 'name', label: 'المعدة' },
    { key: 'fuel', label: 'وقود', type: 'money' },
    { key: 'maintenance', label: 'صيانة', type: 'money' },
    { key: 'rental', label: 'إيجار', type: 'money' },
    { key: 'overtime', label: 'إضافي', type: 'money' },
    { key: 'other', label: 'أخرى', type: 'money' },
    { key: 'totalCash', label: 'الإجمالي النقدي', type: 'money' },
    { key: 'depreciation', label: 'الإهلاك', type: 'money' },
    { key: 'totalCostOfOwnership', label: 'التكلفة الكلية', type: 'money' },
  ];

  async ngOnInit(): Promise<void> {
    await this.reload();
    this.loadCosts();
  }

  async reload(): Promise<void> {
    try {
      this.p.set(await this.api.get<ProjectDto>(`projects/${this.id()}`));
      if (this.tab() !== 'overview' && this.tab() !== 'costs') await this.loadTab(this.tab());
    } catch (e) { this.notify.error(e); this.router.navigateByUrl('/projects'); }
  }

  setTab(t: Tab): void {
    this.tab.set(t);
    this.loadTab(t);
  }

  private async loadTab(t: Tab): Promise<void> {
    this.loading.set(true);
    try {
      if (t === 'equipment') this.active.set(await this.api.get(`projects/${this.id()}/assignments`, { activeOnly: true }));
      if (t === 'history') this.history.set(await this.api.get(`projects/${this.id()}/assignments`));
      if (t === 'transfers') this.transfers.set((await this.api.get<PagedResult<TransferListItem>>('assignments/transfers', { projectId: this.id(), pageSize: 500 })).items);
    } catch (e) { this.notify.error(e); } finally { this.loading.set(false); }
  }

  setPeriod(p: Period): void { this.period.set(p); this.loadCosts(); }

  async loadCosts(): Promise<void> {
    this.costsLoading.set(true);
    try { this.costs.set(await this.api.get<CostReport>(`projects/${this.id()}/costs`, this.period())); }
    catch (e) { this.notify.error(e); } finally { this.costsLoading.set(false); }
  }

  async setStatus(status: ProjectStatus): Promise<void> {
    const ok = await this.notify.confirm({ title: 'تغيير حالة المشروع', message: `سيتم تغيير الحالة إلى "${PROJECT_STATUS[status].label}".`, danger: status === 'Archived' });
    if (!ok) return;
    try {
      await this.api.put(`projects/${this.id()}/status`, { status });
      this.notify.success('تم تغيير الحالة');
      this.reload();
    } catch (e) { this.notify.error(e); }
  }

  async assign(): Promise<void> {
    const p = this.p()!;
    if (await openDialog(this.dialog, BulkAssignDialog, { projectId: p.id, projectName: p.name }, '640px')) {
      this.tab.set('equipment');
      this.reload();
    }
  }

  async transfer(r: AssignmentHistoryItem): Promise<void> {
    const e = await this.api.get<any>(`equipment/${r.equipmentId}`);
    const ok = await openDialog(this.dialog, TransferDialog, {
      equipmentId: e.id, equipmentName: `${e.code} — ${e.name}`, currentProjectId: e.currentProjectId, currentProjectName: e.currentProjectName,
      meterType: e.meterType, currentMeter: e.currentMeterReading,
    });
    if (ok) this.reload();
  }

  openEquipment(r: AssignmentHistoryItem): void { this.router.navigate(['/equipment', r.equipmentId]); }
}
