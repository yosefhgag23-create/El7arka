import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { DatePipe, MoneyPipe, NumPipe, fmtNumber, toIso } from '../../core/format';
import { DUE_STATUS, EQUIPMENT_STATUS } from '../../core/labels';
import { LookupsService } from '../../core/lookups.service';
import { DashboardDto } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { Chart, PALETTE, allZero, barChart, donutChart, lineChart, monthLabel } from '../../shared/charts';
import { Badge, EmptyState, PageHeader, StatCard } from '../../shared/ui';

type Preset = 'today' | 'week' | 'month' | 'year' | 'custom';

@Component({
  selector: 'app-dashboard',
  imports: [PageHeader, StatCard, Chart, Badge, EmptyState, RouterLink, MoneyPipe, NumPipe, DatePipe],
  template: `
    <div class="page">
      <app-page-header title="لوحة التحكم" [subtitle]="subtitle()">
        <div class="presets">
          @for (p of presets; track p.id) { <button [class.active]="preset() === p.id" (click)="setPreset(p.id)">{{ p.label }}</button> }
        </div>
        @if (preset() === 'custom') {
          <input type="date" class="date" [value]="from()" (change)="custom($any($event.target).value, to())" />
          <input type="date" class="date" [value]="to()" (change)="custom(from(), $any($event.target).value)" />
        }
      </app-page-header>

      <div class="grid grid-4">
        <app-stat label="إجمالي المصروفات النقدية" icon="payments" [value]="d()?.totals?.totalCash ?? 0 | money" [loading]="loading()" hint="لا يشمل الإهلاك" />
        <app-stat label="الوقود" icon="local_gas_station" [value]="d()?.totals?.fuel ?? 0 | money" [loading]="loading()" />
        <app-stat label="الصيانة" icon="build" [value]="(d()?.totals?.maintenance ?? 0) | money" [loading]="loading()" [hint]="'قطع غيار ضمنها: ' + (d()?.totals?.spareParts ?? 0 | money)" />
        <app-stat label="الإيجار + الإضافي" icon="key" [value]="(d()?.totals?.rental ?? 0) + (d()?.totals?.overtime ?? 0) | money" [loading]="loading()"
          [hint]="'إيجار ' + (d()?.totals?.rental ?? 0 | money) + ' • إضافي ' + (d()?.totals?.overtime ?? 0 | money)" />
        <app-stat label="الإهلاك (غير نقدي)" icon="trending_down" [value]="d()?.totals?.depreciation ?? 0 | money" [loading]="loading()" />
        <app-stat label="التكلفة الإجمالية للملكية" icon="functions" [value]="d()?.totals?.totalCostOfOwnership ?? 0 | money" [loading]="loading()" hint="النقدي + الإهلاك" />
        <app-stat label="معدل التشغيل" icon="speed" [value]="d()?.fleetUtilization !== null && d()?.fleetUtilization !== undefined ? (d()!.fleetUtilization | num: 1) + '%' : '—'" [loading]="loading()" hint="أيام التشغيل ÷ الأيام المتاحة" />
        <app-stat label="مصروفات أخرى" icon="receipt_long" [value]="d()?.totals?.other ?? 0 | money" [loading]="loading()" />
      </div>

      <div class="grid grid-4" style="margin-top:16px">
        <a routerLink="/equipment" class="mini"><span class="material-symbols-outlined">local_shipping</span><div><strong class="num">{{ c()?.totalEquipment ?? '—' }}</strong><span>معدة نشطة • {{ c()?.owned ?? 0 }} تمليك / {{ c()?.rented ?? 0 }} إيجار</span></div></a>
        <a routerLink="/projects" class="mini"><span class="material-symbols-outlined">domain</span><div><strong class="num">{{ c()?.activeProjects ?? '—' }}</strong><span>مشروع جارٍ من {{ c()?.totalProjects ?? 0 }}</span></div></a>
        <a routerLink="/drivers" class="mini"><span class="material-symbols-outlined">badge</span><div><strong class="num">{{ c()?.activeDrivers ?? '—' }}</strong><span>سائق على رأس العمل</span></div></a>
        <a routerLink="/maintenance" class="mini" [class.alert]="(c()?.maintenanceOverdue ?? 0) > 0"><span class="material-symbols-outlined">build_circle</span>
          <div><strong class="num">{{ c()?.maintenanceOverdue ?? 0 }} متأخرة</strong><span>{{ c()?.maintenanceDueSoon ?? 0 }} صيانة مستحقة قريباً</span></div></a>
      </div>

      <div class="grid grid-3" style="margin-top:16px">
        <div class="card span-2">
          <div class="card-header"><h3>المصروفات الشهرية</h3><span class="sub">حسب نوع التكلفة</span></div>
          <div class="card-body"><app-chart [options]="monthly()" [empty]="monthlyEmpty()" [loading]="loading()" /></div>
        </div>
        <div class="card">
          <div class="card-header"><h3>توزيع المصروفات حسب البند</h3></div>
          <div class="card-body"><app-chart [options]="byCategory()" [empty]="!d()?.byCategory?.length" [loading]="loading()" /></div>
        </div>

        <div class="card">
          <div class="card-header"><h3>حالة المعدات</h3><span class="sub">الآن</span></div>
          <div class="card-body"><app-chart [options]="status()" [empty]="!c()?.totalEquipment" [loading]="loading()" /></div>
        </div>
        <div class="card span-2">
          <div class="card-header"><h3>تكاليف المشروعات</h3><span class="sub">أعلى 10 — شامل الإهلاك الموزع</span></div>
          <div class="card-body"><app-chart [options]="projects()" [empty]="!d()?.topProjects?.length" [loading]="loading()" /></div>
        </div>

        <div class="card span-2">
          <div class="card-header"><h3>أعلى المعدات تكلفة</h3><span class="sub">النقدي + الإهلاك</span></div>
          <div class="card-body"><app-chart [options]="equipment()" [empty]="!d()?.topEquipment?.length" [loading]="loading()" height="340px" /></div>
        </div>
        <div class="card">
          <div class="card-header"><h3>التمليك مقابل الإيجار</h3></div>
          <div class="card-body"><app-chart [options]="ownership()" [empty]="ownershipEmpty()" [loading]="loading()" height="340px" /></div>
        </div>

        <div class="card">
          <div class="card-header"><h3>استهلاك الوقود</h3><span class="sub">الكمية الشهرية</span></div>
          <div class="card-body"><app-chart [options]="fuel()" [empty]="!d()?.fuelByMonth?.length" [loading]="loading()" /></div>
        </div>
        <div class="card">
          <div class="card-header"><h3>تكلفة الصيانة الشهرية</h3></div>
          <div class="card-body"><app-chart [options]="maintenanceTrend()" [empty]="maintEmpty()" [loading]="loading()" /></div>
        </div>
        <div class="card">
          <div class="card-header"><h3>معدل تشغيل المعدات</h3><span class="sub">% من الأيام المتاحة</span></div>
          <div class="card-body"><app-chart [options]="utilization()" [empty]="!d()?.utilization?.length" [loading]="loading()" /></div>
        </div>

        <div class="card span-2">
          <div class="card-header"><h3>الصيانة المستحقة والمتأخرة</h3><span class="spacer"></span><a class="btn ghost sm" routerLink="/maintenance">عرض الكل</a></div>
          <div class="card-body flush">
            @for (r of d()?.maintenance ?? []; track r.equipmentId + '-' + r.maintenanceTypeId) {
              <a class="item" [routerLink]="['/equipment', r.equipmentId]">
                <app-badge [meta]="dueMeta[r.status]" />
                <div class="grow"><strong>{{ r.maintenanceTypeName }}</strong> — {{ r.equipmentCode }} {{ r.equipmentName }}</div>
                <span class="muted small num">
                  @if (r.nextDueDate) { {{ r.nextDueDate | d }} }
                  @if (r.meterRemaining !== null && r.meterRemaining !== undefined) { • متبقي {{ r.meterRemaining | num }} }
                </span>
              </a>
            } @empty { <app-empty icon="event_available" title="لا توجد صيانات مستحقة" /> }
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3>رخص منتهية أو قاربت</h3></div>
          <div class="card-body flush">
            @for (l of d()?.licenses ?? []; track l.driverId) {
              <a class="item" [routerLink]="['/drivers', l.driverId]">
                <span class="material-symbols-outlined" [class.text-danger]="l.daysRemaining < 0" [class.text-warning]="l.daysRemaining >= 0">badge</span>
                <div class="grow">{{ l.fullName }}</div>
                <span class="small num" [class.text-danger]="l.daysRemaining < 0">{{ l.daysRemaining < 0 ? 'منتهية منذ ' + (-l.daysRemaining) + ' يوم' : 'باقي ' + l.daysRemaining + ' يوم' }}</span>
              </a>
            } @empty { <app-empty icon="verified" title="كل الرخص سارية" /> }
          </div>
        </div>

        <div class="card span-all">
          <div class="card-header"><h3>آخر حركات النقل</h3><span class="spacer"></span><a class="btn ghost sm" routerLink="/assignments">عرض الكل</a></div>
          <div class="card-body flush">
            @for (t of d()?.recentTransfers ?? []; track t.id) {
              <a class="item" [routerLink]="['/equipment', t.equipmentId]">
                <span class="material-symbols-outlined muted">swap_horiz</span>
                <div class="grow"><strong>{{ t.equipmentCode }}</strong> {{ t.equipmentName }}: {{ t.fromProjectName || 'بدون مشروع' }} ← {{ t.toProjectName || 'إلغاء تخصيص' }}</div>
                <span class="muted small num">{{ t.transferDate | d }}</span>
              </a>
            } @empty { <app-empty icon="history" title="لا توجد حركات نقل بعد" /> }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: `
    .presets { display: inline-flex; border: 1px solid var(--border-strong); border-radius: 8px; overflow: hidden; background: var(--surface); }
    .presets button { border: 0; background: none; padding: 0 14px; height: 34px; font: inherit; font-size: 13px; cursor: pointer; color: var(--muted); }
    .presets button + button { border-inline-start: 1px solid var(--border); }
    .presets button.active { background: var(--text); color: #fff; }
    .date { height: 36px; border: 1px solid var(--border-strong); border-radius: 6px; padding: 0 8px; font: inherit; }
    .mini { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
    .mini:hover { border-color: var(--border-strong); }
    .mini > .material-symbols-outlined { font-size: 26px; color: var(--muted); }
    .mini div { display: flex; flex-direction: column; }
    .mini strong { font-size: 18px; }
    .mini span { color: var(--muted); font-size: 12px; }
    .mini.alert { border-color: #fecaca; background: var(--danger-bg); }
    .mini.alert strong, .mini.alert > .material-symbols-outlined { color: var(--danger); }
    .item { display: flex; align-items: center; gap: 10px; padding: 10px 18px; border-bottom: 1px solid var(--border); font-size: 13px; }
    .item:last-child { border-bottom: 0; }
    .item:hover { background: var(--subtle); }
    .grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `,
})
export class Dashboard implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private lookups = inject(LookupsService);
  d = signal<DashboardDto | null>(null);
  c = computed(() => this.d()?.counts);
  loading = signal(true);
  preset = signal<Preset>((localStorage.getItem('dash-preset') as Preset) || 'month');
  from = signal('');
  to = signal('');
  dueMeta = DUE_STATUS;
  presets: { id: Preset; label: string }[] = [
    { id: 'today', label: 'اليوم' }, { id: 'week', label: 'الأسبوع' }, { id: 'month', label: 'الشهر' }, { id: 'year', label: 'السنة' }, { id: 'custom', label: 'مخصص' },
  ];

  subtitle = computed(() => {
    const d = this.d();
    const f = (iso: string) => iso.split('-').reverse().join('/');
    return d ? `الفترة من ${f(d.from)} إلى ${f(d.to)}` : '';
  });

  monthly = computed(() => {
    const m = this.d()?.byMonth ?? [];
    return barChart(m.map(x => monthLabel(x.year, x.month)), [
      { name: 'وقود', data: m.map(x => x.fuel) }, { name: 'صيانة', data: m.map(x => x.maintenance) },
      { name: 'إيجار', data: m.map(x => x.rental) }, { name: 'إضافي', data: m.map(x => x.overtime) }, { name: 'أخرى', data: m.map(x => x.other) },
    ], { stacked: true });
  });
  monthlyEmpty = computed(() => allZero((this.d()?.byMonth ?? []).map(x => x.totalCash)));
  byCategory = computed(() => donutChart((this.d()?.byCategory ?? []).map(c => ({ name: c.categoryName, value: c.amount }))));
  status = computed(() => {
    const c = this.c();
    if (!c) return null;
    const labels = (s: keyof typeof EQUIPMENT_STATUS) => this.lookups.statusLabel(s)?.nameAr ?? EQUIPMENT_STATUS[s].label;
    const color = (s: keyof typeof EQUIPMENT_STATUS, fb: string) => this.lookups.statusLabel(s)?.color || fb;
    const opt = donutChart([
      { name: labels('Operating'), value: c.operating, itemStyle: { color: color('Operating', '#18181b') } },
      { name: labels('Available'), value: c.available, itemStyle: { color: color('Available', '#15803d') } },
      { name: labels('UnderMaintenance'), value: c.underMaintenance, itemStyle: { color: color('UnderMaintenance', '#b45309') } },
      { name: labels('OutOfService'), value: c.outOfService, itemStyle: { color: color('OutOfService', '#b91c1c') } },
    ].filter(x => x.value > 0) as any, { money: false });
    return opt;
  });
  projects = computed(() => {
    const p = this.d()?.topProjects ?? [];
    return barChart(p.map(x => x.name), [
      { name: 'نقدي', data: p.map(x => x.totalCash), color: PALETTE[0] }, { name: 'إهلاك', data: p.map(x => x.depreciation), color: PALETTE[2] },
    ], { stacked: true });
  });
  equipment = computed(() => {
    const e = this.d()?.topEquipment ?? [];
    return barChart(e.map(x => x.name), [
      { name: 'نقدي', data: e.map(x => x.totalCash), color: PALETTE[0] }, { name: 'إهلاك', data: e.map(x => x.depreciation), color: PALETTE[2] },
    ], { stacked: true, horizontal: true });
  });
  ownership = computed(() => {
    const o = this.d()?.byOwnership ?? [];
    const owned = o.find(x => x.ownership === 'Owned'), rented = o.find(x => x.ownership === 'Rented');
    return barChart(['تمليك', 'إيجار'], [
      { name: 'نقدي', data: [owned?.totalCash ?? 0, rented?.totalCash ?? 0], color: PALETTE[0] },
      { name: 'إهلاك', data: [owned?.depreciation ?? 0, 0], color: PALETTE[2] },
    ], { stacked: true });
  });
  ownershipEmpty = computed(() => allZero((this.d()?.byOwnership ?? []).map(x => x.totalCash + x.depreciation)));
  fuel = computed(() => {
    const f = this.d()?.fuelByMonth ?? [];
    return lineChart(f.map(x => monthLabel(x.year, x.month)), [{ name: 'الكمية (لتر)', data: f.map(x => x.quantity), color: '#18181b' }], { money: false, area: true });
  });
  maintenanceTrend = computed(() => {
    const m = this.d()?.byMonth ?? [];
    return lineChart(m.map(x => monthLabel(x.year, x.month)), [{ name: 'الصيانة', data: m.map(x => x.maintenance), color: '#b45309' }], { area: true });
  });
  maintEmpty = computed(() => allZero((this.d()?.byMonth ?? []).map(x => x.maintenance)));
  utilization = computed(() => {
    const u = this.d()?.utilization ?? [];
    const opt: any = barChart(u.map(x => x.code), [{ name: 'معدل التشغيل %', data: u.map(x => x.utilizationPercent ?? 0), color: '#18181b' }], { money: false, horizontal: true });
    opt.xAxis = { ...opt.xAxis, max: 100, axisLabel: { formatter: (v: number) => `${fmtNumber(v)}%`, color: '#71717a' } };
    return opt;
  });

  ngOnInit(): void { this.setPreset(this.preset()); }

  setPreset(p: Preset): void {
    this.preset.set(p);
    localStorage.setItem('dash-preset', p);
    const t = new Date();
    let f = new Date(t);
    if (p === 'week') f.setDate(t.getDate() - ((t.getDay() + 1) % 7)); // week starts Saturday
    if (p === 'month') f = new Date(t.getFullYear(), t.getMonth(), 1);
    if (p === 'year') f = new Date(t.getFullYear(), 0, 1);
    if (p === 'custom' && this.from() && this.to()) { this.load(); return; }
    if (p === 'custom') f = new Date(t.getFullYear(), t.getMonth(), 1);
    this.from.set(toIso(f)!);
    this.to.set(toIso(t)!);
    this.load();
  }

  custom(from: string, to: string): void {
    if (!from || !to) return;
    this.from.set(from);
    this.to.set(to);
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try { this.d.set(await this.api.get<DashboardDto>('dashboard', { from: this.from(), to: this.to() })); }
    catch (e) { this.notify.error(e); } finally { this.loading.set(false); }
  }
}
