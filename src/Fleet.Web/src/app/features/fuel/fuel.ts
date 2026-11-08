import { Component, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ApiService } from '../../core/api.service';
import { fmtNumber } from '../../core/format';
import { FuelConsumptionDto } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { CellDef, Column, DataTable } from '../../shared/data-table';
import { Period, PeriodFilter } from '../../shared/fields';
import { Badge, PageHeader } from '../../shared/ui';
import { openDialog } from '../assignments/dialogs';
import { FuelDialog } from './fuel-dialog';
import { FuelRecords } from './fuel-records';

@Component({
  selector: 'app-fuel-page',
  imports: [PageHeader, FuelRecords, DataTable, CellDef, PeriodFilter, Badge],
  template: `
    <div class="page">
      <app-page-header title="الوقود" subtitle="عمليات التموين ومعدلات الاستهلاك (من تفويل كامل إلى تفويل كامل)" [crumbs]="[{ label: 'الوقود' }]" />
      <div class="tabs" style="margin-bottom:16px">
        <button [class.active]="tab() === 'records'" (click)="tab.set('records')">عمليات التموين</button>
        <button [class.active]="tab() === 'consumption'" (click)="showConsumption()">معدلات الاستهلاك</button>
      </div>
      @if (tab() === 'records') {
        <app-fuel-records />
      } @else {
        <div class="card">
          <div class="filters">
            <app-period [from]="period().from" [to]="period().to" (change)="setPeriod($event)" />
            <span class="spacer"></span>
            <span class="muted small">القراءات غير الطبيعية: انحراف أكبر من الحد المحدد في الإعدادات عن متوسط المعدة</span>
          </div>
          <app-data-table [columns]="cols" [rows]="rows()" [paged]="false" [loading]="loading()" [clickable]="true" [trackBy]="track"
            emptyIcon="local_gas_station" emptyTitle="لا توجد بيانات استهلاك" (rowClick)="open($event)">
            <ng-template appCell="equipment" let-r><span class="cell-title">{{ r.equipmentName }}</span></ng-template>
            <ng-template appCell="avg" let-r><span class="num">{{ avg(r) }}</span></ng-template>
            <ng-template appCell="anomalyCount" let-r>
              @if (r.anomalyCount) { <app-badge [label]="r.anomalyCount + ' غير طبيعية'" tone="danger" /> } @else { <span class="muted">—</span> }
            </ng-template>
          </app-data-table>
        </div>
      }
    </div>
  `,
})
export class FuelPage {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  new = input<string>();
  tab = signal<'records' | 'consumption'>('records');
  rows = signal<FuelConsumptionDto[]>([]);
  loading = signal(false);
  period = signal<Period>({ from: null, to: null });
  track = (r: FuelConsumptionDto) => r.equipmentId;
  records = viewChild(FuelRecords);

  cols: Column<FuelConsumptionDto>[] = [
    { key: 'equipment', label: 'المعدة' },
    { key: 'totalFuel', label: 'إجمالي الوقود', type: 'num' },
    { key: 'totalAmount', label: 'التكلفة', type: 'money' },
    { key: 'validDistance', label: 'المسافة/الساعات المحسوبة', type: 'num' },
    { key: 'validSegments', label: 'فترات صالحة', type: 'int' },
    { key: 'avg', label: 'متوسط الاستهلاك' },
    { key: 'anomalyCount', label: 'تنبيهات' },
  ];

  constructor() {
    effect(() => { if (this.new()) untracked(() => this.quickAdd()); });
  }

  private async quickAdd(): Promise<void> {
    this.router.navigate([], { queryParams: {}, replaceUrl: true });
    this.tab.set('records');
    if (await openDialog(this.dialog, FuelDialog, {}, '720px')) this.records()?.list.load();
  }

  avg(r: FuelConsumptionDto): string {
    if (r.meterType === 'EngineHours') return r.averageUnitsPerMeter ? `${fmtNumber(r.averageUnitsPerMeter, 2)} ${r.unit}/ساعة` : '—';
    return r.averageMeterPerUnit ? `${fmtNumber(r.averageMeterPerUnit, 2)} كم/${r.unit} • ${fmtNumber(r.averageUnitsPer100, 1)} ${r.unit}/100كم` : '—';
  }

  showConsumption(): void { this.tab.set('consumption'); this.load(); }
  setPeriod(p: Period): void { this.period.set(p); this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    try { this.rows.set(await this.api.get<FuelConsumptionDto[]>('fuel/consumption', this.period())); }
    catch (e) { this.notify.error(e); } finally { this.loading.set(false); }
  }

  open(r: FuelConsumptionDto): void { this.router.navigate(['/equipment', r.equipmentId]); }
}
