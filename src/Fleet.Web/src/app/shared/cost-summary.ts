import { Component, computed, input } from '@angular/core';
import { CategoryTotal, CostTotals, MonthlyTotal } from '../core/models';
import { MoneyPipe } from '../core/format';
import { StatCard } from './ui';
import { Chart, allZero, barChart, donutChart, monthLabel } from './charts';
import { fmtMoney } from '../core/format';

/** Cash totals + depreciation (shown separately, never mixed into cash). */
@Component({
  selector: 'app-cost-summary',
  imports: [StatCard, MoneyPipe],
  template: `
    <div class="grid grid-4">
      <app-stat label="إجمالي المصروفات النقدية" icon="payments" [value]="t()?.totalCash ?? 0 | money" [loading]="loading()" />
      <app-stat label="الوقود" icon="local_gas_station" [value]="t()?.fuel ?? 0 | money" [loading]="loading()" />
      <app-stat label="الصيانة وقطع الغيار" icon="build" [value]="maint() | money" [loading]="loading()"
        [hint]="'منها قطع غيار ' + fm(t()?.spareParts)" />
      <app-stat label="الإيجار" icon="key" [value]="t()?.rental ?? 0 | money" [loading]="loading()" />
      <app-stat label="الوقت الإضافي" icon="more_time" [value]="t()?.overtime ?? 0 | money" [loading]="loading()" />
      <app-stat label="مصروفات أخرى" icon="receipt_long" [value]="t()?.other ?? 0 | money" [loading]="loading()" />
      <app-stat label="الإهلاك (غير نقدي)" icon="trending_down" [value]="t()?.depreciation ?? 0 | money" [loading]="loading()" hint="لا يدخل في المصروفات النقدية" />
      <app-stat label="التكلفة الإجمالية للملكية" icon="functions" [value]="t()?.totalCostOfOwnership ?? 0 | money" [loading]="loading()" hint="النقدي + الإهلاك" />
    </div>
  `,
})
export class CostSummary {
  t = input<CostTotals | null | undefined>(null);
  loading = input(false);
  maint = computed(() => (this.t()?.maintenance ?? 0) + (this.t()?.spareParts ?? 0));
  fm = fmtMoney;
}

@Component({
  selector: 'app-cost-charts',
  imports: [Chart],
  template: `
    <div class="grid grid-2">
      <div class="card">
        <div class="card-header"><h3>المصروفات حسب البند</h3></div>
        <div class="card-body"><app-chart [options]="byCat()" [empty]="!categories().length" [loading]="loading()" /></div>
      </div>
      <div class="card">
        <div class="card-header"><h3>المصروفات الشهرية</h3></div>
        <div class="card-body"><app-chart [options]="byMonth()" [empty]="monthsEmpty()" [loading]="loading()" /></div>
      </div>
    </div>
  `,
})
export class CostCharts {
  categories = input<CategoryTotal[]>([]);
  months = input<MonthlyTotal[]>([]);
  loading = input(false);

  byCat = computed(() => donutChart(this.categories().map(c => ({ name: c.categoryName, value: c.amount }))));
  monthsEmpty = computed(() => allZero(this.months().map(m => m.totalCash)));
  byMonth = computed(() => {
    const m = this.months();
    return barChart(m.map(x => monthLabel(x.year, x.month)), [
      { name: 'وقود', data: m.map(x => x.fuel) },
      { name: 'صيانة', data: m.map(x => x.maintenance) },
      { name: 'إيجار', data: m.map(x => x.rental) },
      { name: 'إضافي', data: m.map(x => x.overtime) },
      { name: 'أخرى', data: m.map(x => x.other) },
    ], { stacked: true });
  });
}
