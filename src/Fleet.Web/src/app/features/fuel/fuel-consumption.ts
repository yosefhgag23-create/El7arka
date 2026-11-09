import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { fmtMoney, fmtNumber } from '../../core/format';
import { SEGMENT_STATUS, meterUnit } from '../../core/labels';
import { FuelConsumptionDto, FuelSegmentDto } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { BRAND, Chart, lineChart } from '../../shared/charts';
import { CellDef, Column, DataTable } from '../../shared/data-table';
import { Period, PeriodFilter } from '../../shared/fields';
import { Badge, StatCard } from '../../shared/ui';
import { fmtDate } from '../../core/format';

/** Full-tank to full-tank consumption analysis for one equipment. */
@Component({
  selector: 'app-fuel-consumption',
  imports: [StatCard, DataTable, CellDef, Badge, PeriodFilter, Chart],
  template: `
    <div class="stack">
      <div class="row"><app-period [from]="period().from" [to]="period().to" (change)="setPeriod($event)" /></div>
      <div class="grid grid-4">
        <app-stat label="إجمالي الوقود" icon="local_gas_station" [value]="qty(c()?.totalFuel)" [loading]="loading()" />
        <app-stat label="تكلفة الوقود" icon="payments" [value]="money(c()?.totalAmount)" [loading]="loading()" />
        @if (km()) {
          <app-stat label="متوسط الاستهلاك" icon="speed" [value]="avg1()" [loading]="loading()" [hint]="avg2()" />
        } @else {
          <app-stat label="متوسط الاستهلاك" icon="speed" [value]="avg1()" [loading]="loading()" />
        }
        <app-stat label="قراءات غير طبيعية" icon="warning" [value]="c()?.anomalyCount ?? 0" [tone]="(c()?.anomalyCount ?? 0) > 0 ? 'danger' : ''" [loading]="loading()"
          [hint]="(c()?.validSegments ?? 0) + ' فترة صالحة للحساب'" />
      </div>
      <div class="card">
        <div class="card-header"><h3>معدل الاستهلاك عبر الزمن</h3><span class="sub">يُحسب فقط بين تفويلين كاملين بقراءتي عداد صحيحتين</span></div>
        <div class="card-body"><app-chart [options]="chart()" [empty]="!validSegments().length" [loading]="loading()" height="260px" /></div>
      </div>
      <div class="card">
        <div class="card-header"><h3>فترات الاستهلاك</h3></div>
        <app-data-table [columns]="cols()" [rows]="segments()" [paged]="false" [loading]="loading()" [trackBy]="trackSeg" emptyTitle="لا توجد عمليات تموين في الفترة">
          <ng-template appCell="status" let-r>
            <app-badge [meta]="$any(segMeta)[r.status]" />
            @if (r.isAnomaly) { <app-badge label="غير طبيعي" tone="danger" /> }
          </ng-template>
        </app-data-table>
      </div>
    </div>
  `,
})
export class FuelConsumption implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  equipmentId = input.required<number>();
  c = signal<FuelConsumptionDto | null>(null);
  loading = signal(false);
  period = signal<Period>({ from: null, to: null });
  segMeta = SEGMENT_STATUS;
  trackSeg = (s: FuelSegmentDto) => s.fillId;

  km = computed(() => this.c()?.meterType !== 'EngineHours');
  segments = computed(() => [...(this.c()?.segments ?? [])].reverse());
  validSegments = computed(() => (this.c()?.segments ?? []).filter(s => s.status === 'Valid'));
  avg1 = computed(() => {
    const c = this.c();
    if (!c) return '—';
    if (this.km()) return c.averageMeterPerUnit ? `${fmtNumber(c.averageMeterPerUnit, 2)} كم/${c.unit}` : '—';
    return c.averageUnitsPerMeter ? `${fmtNumber(c.averageUnitsPerMeter, 2)} ${c.unit}/ساعة` : '—';
  });
  avg2 = computed(() => { const c = this.c(); return c?.averageUnitsPer100 ? `${fmtNumber(c.averageUnitsPer100, 2)} ${c.unit} لكل 100 كم` : ''; });

  cols = computed<Column<FuelSegmentDto>[]>(() => {
    const u = meterUnit(this.c()?.meterType);
    const unit = this.c()?.unit ?? 'لتر';
    return [
      { key: 'date', label: 'تاريخ التفويل', type: 'date' },
      { key: 'startMeter', label: 'عداد البداية', type: 'num' },
      { key: 'endMeter', label: 'عداد النهاية', type: 'num' },
      { key: 'distance', label: this.km() ? 'المسافة (كم)' : 'ساعات التشغيل', type: 'num' },
      { key: 'fuel', label: `الوقود (${unit})`, type: 'num' },
      this.km()
        ? { key: 'meterPerUnit', label: `كم/${unit}`, type: 'num' }
        : { key: 'unitsPerMeter', label: `${unit}/${u}`, type: 'num' },
      ...(this.km() ? [{ key: 'unitsPer100', label: `${unit}/100 كم`, type: 'num' as const }] : []),
      { key: 'status', label: 'الحالة' },
    ];
  });

  chart = computed(() => {
    const segs = this.validSegments();
    const val = (s: FuelSegmentDto) => (this.km() ? s.meterPerUnit : s.unitsPerMeter) ?? 0;
    return lineChart(segs.map(s => fmtDate(s.date)), [{ name: this.km() ? 'كم/لتر' : 'لتر/ساعة', data: segs.map(val), color: BRAND }], { money: false, area: true });
  });

  qty = (v?: number) => (v === undefined ? '—' : `${fmtNumber(v)} ${this.c()?.unit ?? ''}`);
  money = (v?: number) => (v === undefined ? '—' : fmtMoney(v));

  ngOnInit(): void { this.load(); }
  setPeriod(p: Period): void { this.period.set(p); this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    try { this.c.set(await this.api.get<FuelConsumptionDto>(`equipment/${this.equipmentId()}/fuel-consumption`, this.period())); }
    catch (e) { this.notify.error(e); } finally { this.loading.set(false); }
  }
}
