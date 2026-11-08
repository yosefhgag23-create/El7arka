import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, Query } from '../../core/api.service';
import { fmtDate, fmtInt, fmtMoney, fmtNumber, todayIso } from '../../core/format';
import { APPROVAL_STATUS, EQUIPMENT_STATUS, OWNERSHIP, options } from '../../core/labels';
import { LookupsService } from '../../core/lookups.service';
import { NotifyService } from '../../core/notify.service';
import { EntitySelect } from '../../shared/fields';
import { EmptyState, PageHeader } from '../../shared/ui';

type ColumnKind = 'Text' | 'Integer' | 'Number' | 'Money' | 'Date' | 'Percent';
interface ReportInfo { key: string; title: string; group: string; description: string; filters: string[]; }
interface ReportColumn { title: string; kind: ColumnKind; total: boolean; width: number; }
interface ReportTable { title: string | null; columns: ReportColumn[]; rows: unknown[][]; }
interface ReportDoc {
  key: string; title: string; group: string; note: string | null; landscape: boolean;
  filters: { label: string; value: string }[];
  summary: { label: string; value: unknown; kind: ColumnKind }[];
  tables: ReportTable[];
}

const PREVIEW_ROWS = 500;

function monthStartIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

@Component({
  selector: 'app-reports-page',
  imports: [PageHeader, EmptyState, EntitySelect, ReactiveFormsModule],
  template: `
    <div class="page">
      <app-page-header title="التقارير" subtitle="معاينة التقارير وتصديرها إلى PDF و Excel بنفس أرقام الشاشات ولوحة التحكم" [crumbs]="[{ label: 'التقارير' }]" />
      <div class="layout">
        <aside class="card catalog">
          @for (g of groups(); track g.name) {
            <div class="group">{{ g.name }}</div>
            @for (r of g.items; track r.key) {
              <button class="item" [class.active]="r.key === selected()?.key" (click)="select(r.key)">
                <span class="t">{{ r.title }}</span>
                <span class="d">{{ r.description }}</span>
              </button>
            }
          }
          @if (!catalog().length) { <div class="skeleton" style="height:320px"></div> }
        </aside>

        <section class="main">
          @if (selected(); as r) {
            <div class="card">
              <div class="card-head">
                <div>
                  <h3>{{ r.title }}</h3>
                  <p class="muted small">{{ r.description }}</p>
                </div>
                <span class="spacer"></span>
                <button class="btn ghost" [disabled]="busy()" (click)="openPdf()" title="عرض ملف PDF للطباعة"><span class="material-symbols-outlined">print</span>طباعة</button>
                <button class="btn" [disabled]="busy()" (click)="download('pdf')"><span class="material-symbols-outlined">picture_as_pdf</span>PDF</button>
                <button class="btn" [disabled]="busy()" (click)="download('xlsx')"><span class="material-symbols-outlined">table_view</span>Excel</button>
              </div>
              <form class="filters-grid" [formGroup]="form" (ngSubmit)="preview()">
                @if (has('period')) {
                  <label class="f"><span>من تاريخ</span><input type="date" formControlName="from" /></label>
                  <label class="f"><span>إلى تاريخ</span><input type="date" formControlName="to" /></label>
                }
                @if (has('asOf')) {
                  <label class="f"><span>القيمة حتى تاريخ</span><input type="date" formControlName="asOf" /></label>
                }
                @if (has('project')) { <app-entity-select kind="projects" label="المشروع" formControlName="projectId" /> }
                @if (has('equipment')) { <app-entity-select kind="equipment" label="المعدة" formControlName="equipmentId" /> }
                @if (has('driver')) { <app-entity-select kind="drivers" label="السائق" formControlName="driverId" /> }
                @if (has('category')) {
                  <label class="f"><span>نوع المعدة</span>
                    <select formControlName="categoryId"><option [ngValue]="null">الكل</option>
                      @for (o of categories; track o.value) { <option [ngValue]="o.value">{{ o.label }}</option> }
                    </select></label>
                }
                @if (has('expenseCategory')) {
                  <label class="f"><span>بند المصروف</span>
                    <select formControlName="expenseCategoryId"><option [ngValue]="null">الكل</option>
                      @for (o of expenseCategories; track o.value) { <option [ngValue]="o.value">{{ o.label }}</option> }
                    </select></label>
                }
                @if (has('ownership')) {
                  <label class="f"><span>الملكية</span>
                    <select formControlName="ownership"><option [ngValue]="null">الكل</option>
                      @for (o of ownership; track o.value) { <option [ngValue]="o.value">{{ o.label }}</option> }
                    </select></label>
                }
                @if (has('status')) {
                  <label class="f"><span>الحالة</span>
                    <select formControlName="status"><option [ngValue]="null">الكل</option>
                      @for (o of statuses; track o.value) { <option [ngValue]="o.value">{{ o.label }}</option> }
                    </select></label>
                }
                @if (has('approval')) {
                  <label class="f"><span>حالة الاعتماد</span>
                    <select formControlName="approvalStatus"><option [ngValue]="null">الكل</option>
                      @for (o of approvals; track o.value) { <option [ngValue]="o.value">{{ o.label }}</option> }
                    </select></label>
                }
                <div class="f actions">
                  <button class="btn primary" type="submit" [disabled]="loading()"><span class="material-symbols-outlined">visibility</span>عرض التقرير</button>
                  <button class="btn ghost" type="button" (click)="reset()">إعادة ضبط</button>
                </div>
              </form>
            </div>

            @if (loading()) {
              <div class="card"><div class="skeleton" style="height:48px;margin-bottom:12px"></div><div class="skeleton" style="height:260px"></div></div>
            } @else if (doc(); as d) {
              @if (d.summary.length) {
                <div class="summary">
                  @for (s of d.summary; track s.label) {
                    <div class="tile"><span class="muted small">{{ s.label }}</span><b class="num">{{ fmt(s.value, s.kind, true) }}</b></div>
                  }
                </div>
              }
              @for (t of d.tables; track $index) {
                <div class="card table-card">
                  @if (t.title) { <div class="card-head"><h3>{{ t.title }}</h3><span class="spacer"></span><span class="muted small">{{ t.rows.length }} سجل</span></div> }
                  @if (!t.rows.length) {
                    <app-empty icon="description" title="لا توجد بيانات" message="لا توجد سجلات مطابقة للفلاتر المحددة." />
                  } @else {
                    <div class="table-wrap">
                      <table class="data">
                        <thead><tr>@for (c of t.columns; track $index) { <th [class.end]="numeric(c.kind)">{{ c.title }}</th> }</tr></thead>
                        <tbody>
                          @for (row of t.rows.slice(0, previewRows); track $index) {
                            <tr>@for (c of t.columns; track $index; let i = $index) { <td [class.end]="numeric(c.kind)" [class.num]="c.kind !== 'Text'">{{ fmt(row[i], c.kind) }}</td> }</tr>
                          }
                        </tbody>
                        @if (hasTotals(t)) {
                          <tfoot><tr>
                            @for (c of t.columns; track $index; let i = $index) {
                              <td [class.end]="numeric(c.kind)" class="num">{{ c.total ? fmt(total(t, i), c.kind) : (i === firstLabelIndex(t) ? 'الإجمالي' : '') }}</td>
                            }
                          </tr></tfoot>
                        }
                      </table>
                    </div>
                    @if (t.rows.length > previewRows) {
                      <div class="notice info" style="margin:12px">تعرض المعاينة أول {{ previewRows }} سجل من {{ t.rows.length }} — الإجماليات محسوبة على كل السجلات، والتصدير يشمل الكل.</div>
                    }
                  }
                </div>
              }
              @if (d.note) { <div class="notice info">{{ d.note }}</div> }
            }
          } @else {
            <div class="card"><app-empty icon="summarize" title="اختر تقريراً" message="اختر تقريراً من القائمة لعرض الفلاتر والمعاينة والتصدير." /></div>
          }
        </section>
      </div>
    </div>
  `,
  styles: `
    .layout { display: grid; grid-template-columns: 300px 1fr; gap: 16px; align-items: start; }
    @media (max-width: 1100px) { .layout { grid-template-columns: 1fr; } }
    .catalog { padding: 8px; position: sticky; top: 72px; max-height: calc(100vh - 96px); overflow: auto; }
    .group { font-size: 11px; color: var(--faint); font-weight: 600; padding: 12px 10px 6px; letter-spacing: .02em; }
    .item { display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: start; border: 0; background: none; padding: 8px 10px;
      border-radius: 6px; cursor: pointer; font: inherit; color: var(--text); }
    .item:hover { background: var(--subtle); }
    .item.active { background: var(--text); color: var(--surface); }
    .item .t { font-weight: 500; font-size: 13px; }
    .item .d { font-size: 11px; color: var(--muted); }
    .item.active .d { color: rgba(255,255,255,.7); }
    .main { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
    .card-head h3 { font-size: 15px; font-weight: 600; margin: 0; }
    .card-head p { margin: 2px 0 0; }
    .filters-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; align-items: end; }
    .f { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
    .f input, .f select { height: 40px; border: 1px solid var(--border-strong); border-radius: 6px; padding: 0 10px; font: inherit; color: var(--text); background: var(--surface); }
    .f.actions { flex-direction: row; gap: 8px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
    .tile { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; }
    .tile b { font-size: 18px; font-weight: 600; }
    .table-card { padding: 0; overflow: hidden; }
    .table-card .card-head { padding: 14px 16px 0; }
    .table-wrap { overflow: auto; max-height: 70vh; }
    table.data tfoot td { font-weight: 700; border-top: 2px solid var(--text); position: sticky; bottom: 0; }
    table.data thead th { position: sticky; top: 0; z-index: 1; }
    table.data td { white-space: nowrap; }
  `,
})
export class ReportsPage {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private router = inject(Router);
  private lookups = inject(LookupsService);

  /** Selected report key from the `?r=` query param. */
  r = input<string>();

  catalog = signal<ReportInfo[]>([]);
  doc = signal<ReportDoc | null>(null);
  loading = signal(false);
  busy = signal(false);
  previewRows = PREVIEW_ROWS;

  selected = computed(() => this.catalog().find(x => x.key === this.r()) ?? null);
  groups = computed(() => {
    const map = new Map<string, ReportInfo[]>();
    for (const r of this.catalog()) map.set(r.group, [...(map.get(r.group) ?? []), r]);
    return [...map].map(([name, items]) => ({ name, items }));
  });

  categories = this.lookups.all('EquipmentCategories').map(c => ({ value: c.id, label: c.nameAr }));
  expenseCategories = this.lookups.all('ExpenseCategories').map(c => ({ value: c.id, label: c.nameAr }));
  ownership = options(OWNERSHIP);
  statuses = options(EQUIPMENT_STATUS).map(o => ({ ...o, label: this.lookups.statusLabel(o.value)?.nameAr || o.label }));
  approvals = options(APPROVAL_STATUS);

  form = new FormGroup({
    from: new FormControl<string | null>(monthStartIso()),
    to: new FormControl<string | null>(todayIso()),
    asOf: new FormControl<string | null>(todayIso()),
    projectId: new FormControl<number | null>(null),
    equipmentId: new FormControl<number | null>(null),
    driverId: new FormControl<number | null>(null),
    categoryId: new FormControl<number | null>(null),
    expenseCategoryId: new FormControl<number | null>(null),
    ownership: new FormControl<string | null>(null),
    status: new FormControl<string | null>(null),
    approvalStatus: new FormControl<string | null>(null),
  });

  constructor() {
    this.api.get<ReportInfo[]>('reports').then(c => this.catalog.set(c)).catch(e => this.notify.error(e));
    effect(() => {
      const r = this.selected();
      untracked(() => { this.doc.set(null); if (r) this.preview(); });
    });
  }

  has(token: string): boolean { return this.selected()?.filters.includes(token) ?? false; }

  select(key: string): void { this.router.navigate([], { queryParams: { r: key } }); }

  reset(): void {
    this.form.reset({ from: monthStartIso(), to: todayIso(), asOf: todayIso() });
    this.preview();
  }

  private query(): Query {
    const v = this.form.getRawValue();
    const q: Query = {};
    if (this.has('period')) { q['from'] = v.from; q['to'] = v.to; }
    if (this.has('asOf')) q['asOf'] = v.asOf;
    if (this.has('project')) q['projectId'] = v.projectId;
    if (this.has('equipment')) q['equipmentId'] = v.equipmentId;
    if (this.has('driver')) q['driverId'] = v.driverId;
    if (this.has('category')) q['categoryId'] = v.categoryId;
    if (this.has('expenseCategory')) q['expenseCategoryId'] = v.expenseCategoryId;
    if (this.has('ownership')) q['ownership'] = v.ownership;
    if (this.has('status')) q['status'] = v.status;
    if (this.has('approval')) q['approvalStatus'] = v.approvalStatus;
    return q;
  }

  private validPeriod(): boolean {
    const { from, to } = this.form.getRawValue();
    if (this.has('period') && from && to && from > to) {
      this.notify.error('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
      return false;
    }
    return true;
  }

  async preview(): Promise<void> {
    const r = this.selected();
    if (!r || !this.validPeriod()) return;
    this.loading.set(true);
    try { this.doc.set(await this.api.get<ReportDoc>(`reports/${r.key}`, this.query())); }
    catch (e) { this.notify.error(e); } finally { this.loading.set(false); }
  }

  async download(format: 'pdf' | 'xlsx'): Promise<void> {
    const r = this.selected();
    if (!r || !this.validPeriod()) return;
    this.busy.set(true);
    try {
      await this.api.download(`reports/${r.key}/${format}`, this.query());
      this.notify.success(format === 'pdf' ? 'تم تصدير ملف PDF' : 'تم تصدير ملف Excel');
    } catch (e) { this.notify.error(e); } finally { this.busy.set(false); }
  }

  openPdf(): void {
    const r = this.selected();
    if (!r || !this.validPeriod()) return;
    const params = ApiService.params({ ...this.query(), inline: true });
    window.open(`/api/reports/${r.key}/pdf?${params.toString()}`, '_blank');
  }

  numeric(k: ColumnKind): boolean { return k === 'Integer' || k === 'Number' || k === 'Money' || k === 'Percent'; }
  hasTotals(t: ReportTable): boolean { return t.columns.some(c => c.total); }
  firstLabelIndex(t: ReportTable): number { return t.columns.findIndex(c => !c.total); }
  total(t: ReportTable, i: number): number { return t.rows.reduce<number>((s, r) => s + (typeof r[i] === 'number' ? (r[i] as number) : 0), 0); }

  fmt(v: unknown, kind: ColumnKind, withCurrency = false): string {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'نعم' : 'لا';
    if (typeof v === 'number') {
      switch (kind) {
        case 'Integer': return fmtInt(v);
        case 'Money': return withCurrency ? `${fmtMoney(v)} ${this.lookups.currency()}` : fmtMoney(v);
        case 'Percent': return `${fmtNumber(v, 1)}%`;
        default: return fmtNumber(v);
      }
    }
    const s = String(v);
    if (kind === 'Date' || /^\d{4}-\d{2}-\d{2}$/.test(s)) return fmtDate(s, this.lookups.dateFormat());
    return s;
  }
}
