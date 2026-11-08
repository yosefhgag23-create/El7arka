import { Component, OnInit, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ApiService } from '../../core/api.service';
import { CategoryTotal } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { Chart, donutChart } from '../../shared/charts';
import { Period, PeriodFilter } from '../../shared/fields';
import { PageHeader } from '../../shared/ui';
import { CellDef, Column, DataTable } from '../../shared/data-table';
import { openDialog } from '../assignments/dialogs';
import { ExpenseDialog } from './expense-dialog';
import { ExpenseRecords } from './expense-records';
import { MoneyPipe } from '../../core/format';

@Component({
  selector: 'app-expenses-page',
  imports: [PageHeader, ExpenseRecords, Chart, PeriodFilter, DataTable, MoneyPipe],
  template: `
    <div class="page">
      <app-page-header title="مصروفات التشغيل" subtitle="دفتر المصروفات الموحد: يدوي + القيود التلقائية من الوقود والصيانة والإيجار والإضافي" [crumbs]="[{ label: 'مصروفات التشغيل' }]" />
      <div class="tabs" style="margin-bottom:16px">
        <button [class.active]="tab() === 'records'" (click)="tab.set('records')">القيود</button>
        <button [class.active]="tab() === 'summary'" (click)="showSummary()">ملخص حسب البند</button>
      </div>
      @if (tab() === 'records') {
        <app-expense-records />
      } @else {
        <div class="stack">
          <div class="row"><app-period [from]="period().from" [to]="period().to" (change)="setPeriod($event)" /></div>
          <div class="grid grid-2">
            <div class="card">
              <div class="card-header"><h3>التوزيع حسب البند</h3></div>
              <div class="card-body"><app-chart [options]="chart()" [empty]="!cats().length" [loading]="loading()" /></div>
            </div>
            <div class="card">
              <div class="card-header"><h3>الإجماليات</h3><span class="spacer"></span><strong class="num">{{ total() | money }}</strong></div>
              <app-data-table [columns]="cols" [rows]="cats()" [paged]="false" [loading]="loading()" [trackBy]="track" emptyTitle="لا توجد مصروفات" />
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class ExpensesPage {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  new = input<string>();
  tab = signal<'records' | 'summary'>('records');
  cats = signal<CategoryTotal[]>([]);
  loading = signal(false);
  period = signal<Period>({ from: null, to: null });
  records = viewChild(ExpenseRecords);
  track = (c: CategoryTotal) => c.categoryId;
  total = computed(() => this.cats().reduce((s, c) => s + c.amount, 0));
  chart = computed(() => donutChart(this.cats().map(c => ({ name: c.categoryName, value: c.amount }))));
  cols: Column<CategoryTotal>[] = [
    { key: 'categoryName', label: 'البند' }, { key: 'count', label: 'عدد القيود', type: 'int' }, { key: 'amount', label: 'المبلغ', type: 'money' },
  ];

  constructor() {
    effect(() => { if (this.new()) untracked(() => this.quickAdd()); });
  }

  private async quickAdd(): Promise<void> {
    this.router.navigate([], { queryParams: {}, replaceUrl: true });
    this.tab.set('records');
    if (await openDialog(this.dialog, ExpenseDialog, {}, '680px')) this.records()?.list.load();
  }

  showSummary(): void { this.tab.set('summary'); this.load(); }
  setPeriod(p: Period): void { this.period.set(p); this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    try { this.cats.set(await this.api.get<CategoryTotal[]>('costs/by-category', this.period())); }
    catch (e) { this.notify.error(e); } finally { this.loading.set(false); }
  }
}
