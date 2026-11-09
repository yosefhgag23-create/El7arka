import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { ApiService, Query } from '../../core/api.service';
import { fmtDate, fmtInt, fmtMoney, fmtNumber, toIso, todayIso } from '../../core/format';
import { APPROVAL_STATUS, EQUIPMENT_STATUS, OWNERSHIP, options } from '../../core/labels';
import { LookupsService } from '../../core/lookups.service';
import { NotifyService } from '../../core/notify.service';
import { DateField, EntitySelect } from '../../shared/fields';
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

type PresetId = 'month' | 'lastMonth' | 'quarter' | 'year' | 'all';

function presetRange(id: PresetId): { from: string | null; to: string | null } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  switch (id) {
    case 'month': return { from: monthStartIso(), to: todayIso() };
    case 'lastMonth': return { from: toIso(new Date(y, m - 1, 1)), to: toIso(new Date(y, m, 0)) };
    case 'quarter': return { from: toIso(new Date(y, m - 2, 1)), to: todayIso() };
    case 'year': return { from: `${y}-01-01`, to: todayIso() };
    case 'all': return { from: null, to: null };
  }
}

const REPORT_ICONS: Record<string, string> = {
  'equipment-inventory': 'inventory_2', 'equipment-by-project': 'domain', 'assignment-history': 'swap_horiz',
  'operating-expenses': 'receipt_long', 'fuel': 'local_gas_station', 'maintenance': 'build', 'spare-parts': 'settings',
  'rental': 'key', 'overtime': 'more_time', 'depreciation': 'trending_down', 'equipment-depreciation-schedule': 'calendar_month',
  'cost-by-equipment': 'local_shipping', 'cost-by-project': 'account_balance', 'fuel-consumption': 'speed',
  'meter-readings': 'timer', 'utilization': 'monitoring', 'maintenance-schedule': 'event_upcoming',
  'driver-assignments': 'badge', 'license-expiry': 'id_card',
};

@Component({
  selector: 'app-reports-page',
  imports: [PageHeader, EmptyState, EntitySelect, DateField, ReactiveFormsModule, MatFormFieldModule, MatSelectModule],
  template: `
    <div class="page">
      <app-page-header title="التقارير" subtitle="معاينة التقارير وتصديرها إلى PDF و Excel بنفس أرقام الشاشات ولوحة التحكم" [crumbs]="[{ label: 'التقارير' }]" />
      <div class="layout">
        <aside class="card catalog">
          <div class="cat-search">
            <span class="material-symbols-outlined">search</span>
            <input placeholder="بحث عن تقرير" [value]="term()" (input)="term.set($any($event.target).value)" />
          </div>
          <div class="cat-list">
            @for (g of groups(); track g.name) {
              <div class="group"><span class="material-symbols-outlined">{{ groupIcon(g.name) }}</span>{{ g.name }}<span class="count">{{ g.items.length }}</span></div>
              @for (r of g.items; track r.key) {
                <button class="item" [class.active]="r.key === selected()?.key" (click)="select(r.key)" [title]="r.description">
                  <span class="ic material-symbols-outlined">{{ icon(r.key) }}</span>
                  <span class="t">{{ r.title }}</span>
                </button>
              }
            } @empty {
              @if (catalog().length) { <div class="muted small" style="padding:16px">لا توجد تقارير مطابقة</div> }
              @else { <div class="skeleton" style="height:320px;margin:8px"></div> }
            }
          </div>
        </aside>

        <section class="main">
          @if (selected(); as r) {
            <div class="card head-card">
              <div class="rhead">
                <div class="mark"><span class="material-symbols-outlined">{{ icon(r.key) }}</span></div>
                <div class="rtitle">
                  <span class="grp">{{ r.group }}</span>
                  <h2>{{ r.title }}</h2>
                  <p>{{ r.description }}</p>
                </div>
                <div class="exports">
                  <button class="btn" [disabled]="busy()" (click)="openPdf()"><span class="material-symbols-outlined">print</span>طباعة</button>
                  <button class="btn" [disabled]="busy()" (click)="download('pdf')"><span class="material-symbols-outlined">picture_as_pdf</span>PDF</button>
                  <button class="btn" [disabled]="busy()" (click)="download('xlsx')"><span class="material-symbols-outlined">table_view</span>Excel</button>
                </div>
              </div>

              <form class="rfilters" [formGroup]="form" (ngSubmit)="preview()">
                @if (has('period')) {
                  <div class="presets">
                    <span class="muted small">الفترة:</span>
                    @for (p of presets; track p.id) {
                      <button type="button" class="chip" [class.on]="activePreset() === p.id" (click)="applyPreset(p.id)">{{ p.label }}</button>
                    }
                  </div>
                }
                <div class="rfields">
                  @if (has('period')) {
                    <app-date-field label="من تاريخ" formControlName="from" />
                    <app-date-field label="إلى تاريخ" formControlName="to" />
                  }
                  @if (has('asOf')) { <app-date-field label="القيمة حتى تاريخ" formControlName="asOf" /> }
                  @if (has('project')) { <app-entity-select kind="projects" label="المشروع" formControlName="projectId" /> }
                  @if (has('equipment')) { <app-entity-select kind="equipment" label="المعدة" formControlName="equipmentId" /> }
                  @if (has('driver')) { <app-entity-select kind="drivers" label="السائق" formControlName="driverId" /> }
                  @if (has('category')) {
                    <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>نوع المعدة</mat-label>
                      <mat-select formControlName="categoryId"><mat-option [value]="null">الكل</mat-option>
                        @for (o of categories; track o.value) { <mat-option [value]="o.value">{{ o.label }}</mat-option> }
                      </mat-select></mat-form-field>
                  }
                  @if (has('expenseCategory')) {
                    <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>بند المصروف</mat-label>
                      <mat-select formControlName="expenseCategoryId"><mat-option [value]="null">الكل</mat-option>
                        @for (o of expenseCategories; track o.value) { <mat-option [value]="o.value">{{ o.label }}</mat-option> }
                      </mat-select></mat-form-field>
                  }
                  @if (has('ownership')) {
                    <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>الملكية</mat-label>
                      <mat-select formControlName="ownership"><mat-option [value]="null">الكل</mat-option>
                        @for (o of ownership; track o.value) { <mat-option [value]="o.value">{{ o.label }}</mat-option> }
                      </mat-select></mat-form-field>
                  }
                  @if (has('status')) {
                    <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>الحالة</mat-label>
                      <mat-select formControlName="status"><mat-option [value]="null">الكل</mat-option>
                        @for (o of statuses; track o.value) { <mat-option [value]="o.value">{{ o.label }}</mat-option> }
                      </mat-select></mat-form-field>
                  }
                  @if (has('approval')) {
                    <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>حالة الاعتماد</mat-label>
                      <mat-select formControlName="approvalStatus"><mat-option [value]="null">الكل</mat-option>
                        @for (o of approvals; track o.value) { <mat-option [value]="o.value">{{ o.label }}</mat-option> }
                      </mat-select></mat-form-field>
                  }
                </div>
                <div class="form-actions">
                  <button class="btn ghost" type="button" (click)="reset()"><span class="material-symbols-outlined">restart_alt</span>إعادة ضبط</button>
                  <button class="btn primary" type="submit" [disabled]="loading()"><span class="material-symbols-outlined">visibility</span>عرض التقرير</button>
                </div>
              </form>
            </div>

            @if (loading()) {
              <div class="card"><div class="skeleton" style="height:48px;margin-bottom:12px"></div><div class="skeleton" style="height:260px"></div></div>
            } @else if (doc(); as d) {
              <div class="result-meta">
                @for (f of d.filters; track f.label) { <span class="tag"><b>{{ f.label }}:</b> {{ f.value }}</span> }
                <span class="spacer"></span>
                <span class="muted small">{{ rowCount(d) }} سجل</span>
              </div>
              @if (d.summary.length) {
                <div class="card summary">
                  @for (s of d.summary; track s.label; let first = $first) {
                    <div class="kpi" [class.lead]="first"><span>{{ s.label }}</span><b class="num">{{ fmt(s.value, s.kind, true) }}</b></div>
                  }
                </div>
              }
              @for (t of d.tables; track $index) {
                <div class="card table-card">
                  <div class="t-head"><h3>{{ t.title || 'التفاصيل' }}</h3><span class="spacer"></span><span class="badge">{{ t.rows.length }} سجل</span></div>
                  @if (!t.rows.length) {
                    <app-empty icon="description" title="لا توجد بيانات" message="لا توجد سجلات مطابقة للفلاتر المحددة." />
                  } @else {
                    <div class="table-wrap">
                      <table class="data">
                        <thead><tr>@for (c of t.columns; track $index) { <th [class.end]="numeric(c.kind)">{{ c.title }}</th> }</tr></thead>
                        <tbody>
                          @for (row of t.rows.slice(0, previewRows); track $index) {
                            <tr>@for (c of t.columns; track $index; let i = $index) {
                              <td [class.end]="numeric(c.kind)">@if (c.kind === 'Text') { {{ fmt(row[i], c.kind) }} } @else { <span class="num">{{ fmt(row[i], c.kind) }}</span> }</td>
                            }</tr>
                          }
                        </tbody>
                        @if (hasTotals(t)) {
                          <tfoot><tr>
                            @for (c of t.columns; track $index; let i = $index) {
                              <td [class.end]="numeric(c.kind)">@if (c.total) { <span class="num">{{ fmt(total(t, i), c.kind) }}</span> } @else if (i === firstLabelIndex(t)) { الإجمالي }</td>
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
              @if (d.note) { <div class="note"><span class="material-symbols-outlined">info</span>{{ d.note }}</div> }
            }
          } @else {
            <div class="card welcome">
              <div class="mark"><span class="material-symbols-outlined">summarize</span></div>
              <h2>اختر تقريراً</h2>
              <p class="muted">اختر تقريراً من القائمة لعرض الفلاتر والمعاينة، ثم صدّره PDF للطباعة أو Excel.</p>
              <div class="quick">
                @for (k of quickKeys; track k) {
                  @if (info(k); as q) {
                    <button class="q" (click)="select(q.key)"><span class="material-symbols-outlined">{{ icon(q.key) }}</span><b>{{ q.title }}</b><small>{{ q.description }}</small></button>
                  }
                }
              </div>
            </div>
          }
        </section>
      </div>
    </div>
  `,
  styles: `
    .layout { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 20px; align-items: start; }
    @media (max-width: 1000px) { .layout { grid-template-columns: 1fr; } .catalog { position: static; max-height: 320px; } }

    /* catalog */
    .catalog { padding: 0; position: sticky; top: 72px; max-height: calc(100vh - 96px); display: flex; flex-direction: column; overflow: hidden; }
    .cat-search { display: flex; align-items: center; gap: 6px; margin: 10px; padding: 0 10px; height: 36px; border: 1px solid var(--border-strong);
      border-radius: 8px; background: var(--surface); }
    .cat-search:focus-within { border-color: var(--brand); }
    .cat-search input { border: 0; outline: 0; flex: 1; font: inherit; background: transparent; min-width: 0; }
    .cat-search .material-symbols-outlined { color: var(--faint); font-size: 18px; }
    .cat-list { overflow: auto; padding: 0 8px 10px; }
    .group { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--muted); font-weight: 600; padding: 14px 8px 6px; }
    .group .material-symbols-outlined { font-size: 16px; color: var(--brand); }
    .group .count { margin-inline-start: auto; font-size: 10.5px; color: var(--faint); background: var(--subtle); border-radius: 10px; padding: 0 7px; }
    .item { display: flex; align-items: center; gap: 10px; width: 100%; text-align: start; border: 0; background: none; padding: 7px 8px;
      border-radius: 8px; cursor: pointer; font: inherit; color: var(--text); }
    .item .ic { font-size: 18px; color: var(--faint); width: 28px; height: 28px; display: grid; place-items: center; border-radius: 7px; background: var(--subtle); flex: none; }
    .item .t { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .item:hover { background: var(--subtle); }
    .item:hover .ic { background: var(--surface); }
    .item.active { background: var(--brand-soft); color: var(--brand-strong); font-weight: 600; }
    .item.active .ic { background: var(--brand); color: #fff; }

    .main { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

    /* report header + filters */
    .head-card { padding: 0; overflow: hidden; }
    .rhead { display: flex; align-items: center; gap: 14px; padding: 18px 20px; border-top: 3px solid var(--brand); }
    .mark { width: 44px; height: 44px; border-radius: 10px; background: var(--brand-soft); color: var(--brand); display: grid; place-items: center; flex: none; }
    .mark .material-symbols-outlined { font-size: 24px; }
    .rtitle { flex: 1; min-width: 0; }
    .rtitle .grp { font-size: 11px; color: var(--brand-strong); font-weight: 600; }
    .rtitle h2 { margin: 1px 0 2px; font-size: 18px; font-weight: 700; }
    .rtitle p { margin: 0; font-size: 12.5px; color: var(--muted); }
    .exports { display: flex; gap: 6px; flex-wrap: wrap; }
    .exports .material-symbols-outlined { color: var(--brand); }
    .rfilters { border-top: 1px solid var(--border); background: var(--subtle); padding: 14px 20px 16px; display: flex; flex-direction: column; align-items: stretch; gap: 12px; }
    .presets { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .chip { border: 1px solid var(--border-strong); background: var(--surface); border-radius: 999px; padding: 3px 12px; font: inherit; font-size: 12px;
      cursor: pointer; color: var(--text); }
    .chip:hover { border-color: var(--brand); }
    .chip.on { background: var(--brand-soft); border-color: var(--brand); color: var(--brand-strong); font-weight: 600; }
    .rfields { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
    .rfields > * { width: 100%; min-width: 0; }
    .rfields mat-form-field { width: 100%; }
    .form-actions { display: flex; gap: 8px; justify-content: flex-end; }

    /* results */
    .result-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .tag { font-size: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 999px; padding: 3px 10px; color: var(--muted); }
    .tag b { color: var(--text); font-weight: 600; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); padding: 0; overflow: hidden; }
    .kpi { padding: 14px 18px; display: flex; flex-direction: column; gap: 6px; border-inline-start: 1px solid var(--border); }
    .kpi:first-child { border-inline-start: 0; }
    .kpi span { font-size: 12px; color: var(--muted); }
    .kpi b { font-size: 19px; font-weight: 700; }
    .kpi.lead { background: var(--brand-soft); }
    .kpi.lead b { color: var(--brand-strong); }
    .table-card { padding: 0; overflow: hidden; }
    .t-head { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--border); }
    .t-head h3 { margin: 0; font-size: 14px; font-weight: 600; }
    .note { display: flex; gap: 8px; align-items: flex-start; font-size: 12.5px; color: var(--muted); padding: 10px 14px; border-radius: 8px;
      background: var(--surface); border: 1px dashed var(--border-strong); }
    .note .material-symbols-outlined { font-size: 18px; color: var(--brand); }

    /* nothing selected */
    .welcome { text-align: center; padding: 36px 24px; }
    .welcome .mark { margin: 0 auto 10px; width: 56px; height: 56px; }
    .welcome h2 { margin: 0 0 4px; font-size: 18px; }
    .quick { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin-top: 22px; text-align: start; }
    .q { display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--border); background: var(--surface); border-radius: 10px; padding: 14px;
      cursor: pointer; font: inherit; color: var(--text); text-align: start; }
    .q:hover { border-color: var(--brand); background: var(--brand-soft); }
    .q .material-symbols-outlined { color: var(--brand); }
    .q small { color: var(--muted); font-size: 11.5px; }
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

  term = signal('');
  selected = computed(() => this.catalog().find(x => x.key === this.r()) ?? null);
  groups = computed(() => {
    const t = this.term().trim();
    const map = new Map<string, ReportInfo[]>();
    for (const r of this.catalog()) {
      if (t && !r.title.includes(t) && !r.description.includes(t)) continue;
      map.set(r.group, [...(map.get(r.group) ?? []), r]);
    }
    return [...map].map(([name, items]) => ({ name, items }));
  });

  quickKeys = ['cost-by-project', 'cost-by-equipment', 'operating-expenses', 'fuel', 'maintenance', 'depreciation'];
  info = (key: string) => this.catalog().find(x => x.key === key);
  icon = (key: string) => REPORT_ICONS[key] ?? 'description';
  groupIcon = (group: string) => (group.includes('المعدات') ? 'local_shipping' : group.includes('المالية') ? 'payments' : 'insights');

  presets: { id: PresetId; label: string }[] = [
    { id: 'month', label: 'هذا الشهر' }, { id: 'lastMonth', label: 'الشهر الماضي' }, { id: 'quarter', label: 'آخر 3 شهور' },
    { id: 'year', label: 'هذه السنة' }, { id: 'all', label: 'الكل' },
  ];
  private period = signal<{ from: string | null; to: string | null }>({ from: monthStartIso(), to: todayIso() });
  activePreset = computed(() => this.presets.find(p => {
    const r = presetRange(p.id), v = this.period();
    return r.from === v.from && r.to === v.to;
  })?.id ?? null);

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
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(v => this.period.set({ from: v.from ?? null, to: v.to ?? null }));
    effect(() => {
      const r = this.selected();
      untracked(() => { this.doc.set(null); if (r) this.preview(); });
    });
  }

  has(token: string): boolean { return this.selected()?.filters.includes(token) ?? false; }

  select(key: string): void { this.router.navigate([], { queryParams: { r: key } }); }

  applyPreset(id: PresetId): void {
    this.form.patchValue(presetRange(id));
    this.preview();
  }

  rowCount(d: ReportDoc): number { return d.tables.length ? d.tables[d.tables.length - 1].rows.length : 0; }

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
