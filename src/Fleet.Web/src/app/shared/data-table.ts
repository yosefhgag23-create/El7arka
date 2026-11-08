import { NgTemplateOutlet } from '@angular/common';
import { Component, Directive, TemplateRef, computed, contentChildren, inject, input, output, signal } from '@angular/core';
import { PagedResult, IsoDate } from '../core/models';
import { fmtDate, fmtMoney, fmtNumber } from '../core/format';
import { LookupsService } from '../core/lookups.service';
import { EmptyState } from './ui';

export interface Column<T = any> {
  key: string;
  label: string;
  /** Server sort field; omit to disable sorting. */
  sort?: string;
  type?: 'text' | 'money' | 'num' | 'date' | 'int';
  align?: 'end';
  value?: (row: T) => unknown;
  width?: string;
}

@Directive({ selector: 'ng-template[appCell]' })
export class CellDef {
  key = input.required<string>({ alias: 'appCell' });
  template = inject(TemplateRef);
}

@Directive({ selector: 'ng-template[appFooter]' })
export class FooterDef {
  template = inject(TemplateRef);
}

@Component({
  selector: 'app-data-table',
  imports: [NgTemplateOutlet, EmptyState],
  template: `
    <div class="table-wrap" [style.max-height]="maxHeight()">
      <table class="data">
        <thead>
          <tr>
            @for (c of columns(); track c.key) {
              <th [class.sortable]="!!c.sort" [class.end]="c.align === 'end' || isNumeric(c)" [style.width]="c.width" (click)="toggleSort(c)">
                {{ c.label }}
                @if (c.sort && sortField() === c.sort) {
                  <span class="material-symbols-outlined sort-ic">{{ sortDesc() ? 'arrow_downward' : 'arrow_upward' }}</span>
                }
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @if (loading() && !rows().length) {
            @for (i of skeletonRows; track i) {
              <tr>@for (c of columns(); track c.key) { <td><div class="skeleton" style="height:14px"></div></td> }</tr>
            }
          }
          @for (row of rows(); track trackBy()(row)) {
            <tr [class.clickable]="clickable()" (click)="clickable() && rowClick.emit(row)">
              @for (c of columns(); track c.key) {
                <td [class.end]="c.align === 'end' || isNumeric(c)">
                  @if (cellTemplate(c.key); as tpl) {
                    <ng-container [ngTemplateOutlet]="tpl" [ngTemplateOutletContext]="{ $implicit: row }" />
                  } @else {
                    <span [class.num]="isNumeric(c) || c.type === 'date'">{{ display(c, row) }}</span>
                  }
                </td>
              }
            </tr>
          }
        </tbody>
        @if (footer(); as f) {
          @if (rows().length) { <tfoot><ng-container [ngTemplateOutlet]="f.template" /></tfoot> }
        }
      </table>
      @if (!loading() && !rows().length) {
        <app-empty [icon]="emptyIcon()" [title]="emptyTitle()" [message]="emptyMessage()" />
      }
    </div>
    @if (paged() && total() > 0) {
      <div class="pager">
        <span class="muted small">عرض {{ from() }}–{{ to() }} من {{ total() }}</span>
        <span class="spacer"></span>
        <select class="size" [value]="pageSize()" (change)="pageSizeChange.emit(+$any($event.target).value)">
          @for (s of [10, 25, 50, 100]; track s) { <option [value]="s">{{ s }} / صفحة</option> }
        </select>
        <button class="btn icon sm" [disabled]="page() <= 1" (click)="pageChange.emit(page() - 1)"><span class="material-symbols-outlined">chevron_right</span></button>
        <span class="num small">{{ page() }} / {{ pages() }}</span>
        <button class="btn icon sm" [disabled]="page() >= pages()" (click)="pageChange.emit(page() + 1)"><span class="material-symbols-outlined">chevron_left</span></button>
      </div>
    }
  `,
  styles: `
    :host { display: block; }
    .sort-ic { font-size: 14px; vertical-align: middle; }
    .pager { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--border); }
    .size { height: 28px; border: 1px solid var(--border-strong); border-radius: 6px; background: var(--surface); font: inherit; font-size: 12px; padding: 0 6px; }
  `,
})
export class DataTable<T = any> {
  private lookups = inject(LookupsService);

  columns = input.required<Column<T>[]>();
  rows = input<T[]>([]);
  total = input(0);
  page = input(1);
  pageSize = input(25);
  sort = input<string | null | undefined>(null);
  loading = input(false);
  paged = input(true);
  clickable = input(false);
  maxHeight = input<string | null>(null);
  trackBy = input<(row: T) => unknown>((row: any) => row?.id ?? row);
  emptyIcon = input('inbox');
  emptyTitle = input('لا توجد بيانات');
  emptyMessage = input<string>();

  pageChange = output<number>();
  pageSizeChange = output<number>();
  sortChange = output<string | null>();
  rowClick = output<T>();

  private cells = contentChildren(CellDef);
  footer = computed(() => this.footers()[0]);
  private footers = contentChildren(FooterDef);

  skeletonRows = [1, 2, 3, 4, 5, 6];
  pages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  from = computed(() => (this.page() - 1) * this.pageSize() + 1);
  to = computed(() => Math.min(this.total(), this.page() * this.pageSize()));
  sortField = computed(() => this.sort()?.split(':')[0] ?? null);
  sortDesc = computed(() => this.sort()?.endsWith(':desc') ?? false);

  cellTemplate(key: string): TemplateRef<unknown> | null {
    return this.cells().find(c => c.key() === key)?.template ?? null;
  }

  isNumeric(c: Column<T>): boolean { return c.type === 'money' || c.type === 'num' || c.type === 'int'; }

  display(c: Column<T>, row: T): string {
    const v = c.value ? c.value(row) : (row as Record<string, unknown>)[c.key];
    if (v === null || v === undefined || v === '') return '—';
    switch (c.type) {
      case 'money': return fmtMoney(v as number);
      case 'num': return fmtNumber(v as number);
      case 'int': return fmtNumber(v as number, 0);
      case 'date': return fmtDate(v as IsoDate, this.lookups.dateFormat());
      default: return String(v);
    }
  }

  toggleSort(c: Column<T>): void {
    if (!c.sort) return;
    const next = this.sortField() !== c.sort ? `${c.sort}:asc` : this.sortDesc() ? null : `${c.sort}:desc`;
    this.sortChange.emit(next);
  }
}

/** Holds list query state and reloads through a loader. */
export class ListState<T, Q extends Record<string, unknown> = Record<string, unknown>> {
  readonly query = signal<Q & { page: number; pageSize: number; sort?: string | null; search?: string }>({ page: 1, pageSize: 25 } as any);
  readonly result = signal<PagedResult<T> | null>(null);
  readonly loading = signal(false);
  readonly rows = computed(() => this.result()?.items ?? []);
  readonly total = computed(() => this.result()?.total ?? 0);
  private seq = 0;

  constructor(private loader: (q: Record<string, any>) => Promise<PagedResult<T>>, private onError?: (e: unknown) => void, initial?: Partial<Q>) {
    if (initial) this.query.update(q => ({ ...q, ...initial }));
  }

  async load(): Promise<void> {
    const seq = ++this.seq;
    this.loading.set(true);
    try {
      const r = await this.loader(this.query());
      if (seq === this.seq) this.result.set(r);
    } catch (e) {
      this.onError?.(e);
    } finally {
      if (seq === this.seq) this.loading.set(false);
    }
  }

  patch(p: Partial<Q> & { search?: string }): void {
    this.query.update(q => ({ ...q, ...p, page: 1 }));
    this.load();
  }

  setPage(page: number): void { this.query.update(q => ({ ...q, page })); this.load(); }
  setPageSize(pageSize: number): void { this.query.update(q => ({ ...q, pageSize, page: 1 })); this.load(); }
  setSort(sort: string | null): void { this.query.update(q => ({ ...q, sort, page: 1 })); this.load(); }
}
