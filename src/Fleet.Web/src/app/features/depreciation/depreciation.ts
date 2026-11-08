import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { MoneyPipe, todayIso } from '../../core/format';
import { LookupsService } from '../../core/lookups.service';
import { DepreciationItem, DepreciationSummary } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { CellDef, Column, DataTable, FooterDef } from '../../shared/data-table';
import { FilterSelect, Period, PeriodFilter, SearchBox } from '../../shared/fields';
import { Badge, PageHeader, StatCard } from '../../shared/ui';

@Component({
  selector: 'app-depreciation-page',
  imports: [PageHeader, StatCard, DataTable, CellDef, FooterDef, SearchBox, FilterSelect, PeriodFilter, Badge, MoneyPipe],
  template: `
    <div class="page">
      <app-page-header title="الإهلاك" subtitle="إهلاك المعدات المملوكة بطريقة القسط الثابت محسوباً يومياً — تكلفة غير نقدية منفصلة عن المصروفات" [crumbs]="[{ label: 'الإهلاك' }]" />
      <div class="stack">
        <div class="grid grid-4">
          <app-stat label="إجمالي تكلفة الشراء" icon="shopping_cart" [value]="s()?.totalPurchasePrice ?? 0 | money" [loading]="loading()" />
          <app-stat label="مجمع الإهلاك" icon="trending_down" [value]="s()?.totalAccumulated ?? 0 | money" [loading]="loading()" [hint]="'حتى ' + (q().asOf)" />
          <app-stat label="صافي القيمة الدفترية" icon="account_balance" [value]="s()?.totalBookValue ?? 0 | money" [loading]="loading()" />
          <app-stat label="إهلاك الفترة المحددة" icon="date_range" [value]="s()?.totalPeriodDepreciation ?? 0 | money" [loading]="loading()"
            [hint]="'الإهلاك الشهري الحالي: ' + (s()?.totalMonthly ?? 0 | money)" />
        </div>
        <div class="card">
          <div class="filters">
            <app-search placeholder="بحث بالمعدة" (search)="patch({ search: $event })" />
            <app-filter-select placeholder="كل الأنواع" numeric [options]="categories" [value]="q().categoryId" (valueChange)="patch({ categoryId: $event })" />
            <label class="muted small row" style="gap:6px">حتى تاريخ
              <input type="date" class="date" [value]="q().asOf" (change)="patch({ asOf: $any($event.target).value || today })" /></label>
            <span class="muted small">إهلاك فترة:</span>
            <app-period [from]="q().from" [to]="q().to" (change)="setPeriod($event)" />
          </div>
          <app-data-table [columns]="cols" [rows]="s()?.items ?? []" [paged]="false" [loading]="loading()" [clickable]="true" [trackBy]="track"
            emptyIcon="trending_down" emptyTitle="لا توجد معدات لها بيانات إهلاك" emptyMessage="أدخل بيانات الشراء والإهلاك من شاشة تعديل المعدة المملوكة."
            (rowClick)="open($event)">
            <ng-template appCell="equipment" let-r>
              <div class="cell-title">{{ r.equipmentName }}</div><div class="cell-sub num">{{ r.equipmentCode }} • {{ r.categoryName }}</div>
            </ng-template>
            <ng-template appCell="state" let-r>
              @if (r.disposalDate) { <app-badge label="مستبعدة" /> }
              @else if (r.fullyDepreciated) { <app-badge label="مهلكة بالكامل" tone="warning" /> }
              @else { <app-badge label="قيد الإهلاك" tone="success" /> }
            </ng-template>
            <ng-template appFooter>
              <tr>
                <td>الإجمالي</td><td></td>
                <td class="end num">{{ s()?.totalPurchasePrice | money: false }}</td>
                <td></td><td></td>
                <td class="end num">{{ s()?.totalMonthly | money: false }}</td>
                <td class="end num">{{ s()?.totalPeriodDepreciation | money: false }}</td>
                <td class="end num">{{ s()?.totalAccumulated | money: false }}</td>
                <td class="end num">{{ s()?.totalBookValue | money: false }}</td>
                <td></td>
              </tr>
            </ng-template>
          </app-data-table>
        </div>
      </div>
    </div>
  `,
  styles: `.date { height: 36px; border: 1px solid var(--border-strong); border-radius: 6px; padding: 0 8px; font: inherit; color: var(--text); }`,
})
export class DepreciationPage implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private router = inject(Router);
  today = todayIso();
  categories = inject(LookupsService).all('EquipmentCategories').map(c => ({ value: c.id, label: c.nameAr }));
  q = signal<{ asOf: string; from: string | null; to: string | null; categoryId: number | null; search: string }>({ asOf: this.today, from: null, to: null, categoryId: null, search: '' });
  s = signal<DepreciationSummary | null>(null);
  loading = signal(false);
  track = (r: DepreciationItem) => r.equipmentId;

  cols: Column<DepreciationItem>[] = [
    { key: 'equipment', label: 'المعدة' },
    { key: 'purchaseDate', label: 'تاريخ الشراء', type: 'date' },
    { key: 'purchasePrice', label: 'سعر الشراء', type: 'money' },
    { key: 'residualValue', label: 'التخريدية', type: 'money' },
    { key: 'usefulLifeMonths', label: 'العمر (شهر)', type: 'int' },
    { key: 'monthlyDepreciation', label: 'الإهلاك الشهري', type: 'money' },
    { key: 'periodDepreciation', label: 'إهلاك الفترة', type: 'money' },
    { key: 'accumulatedDepreciation', label: 'مجمع الإهلاك', type: 'money' },
    { key: 'bookValue', label: 'القيمة الدفترية', type: 'money' },
    { key: 'state', label: 'الحالة' },
  ];

  ngOnInit(): void { this.load(); }
  patch(p: Partial<ReturnType<typeof this.q>>): void { this.q.update(q => ({ ...q, ...p })); this.load(); }
  setPeriod(p: Period): void { this.patch({ from: p.from, to: p.to }); }

  async load(): Promise<void> {
    this.loading.set(true);
    try { this.s.set(await this.api.get<DepreciationSummary>('depreciation', this.q())); }
    catch (e) { this.notify.error(e); } finally { this.loading.set(false); }
  }

  open(r: DepreciationItem): void { this.router.navigate(['/equipment', r.equipmentId]); }
}
