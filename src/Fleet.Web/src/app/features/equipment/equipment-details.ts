import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { DatePipe, MoneyPipe, NumPipe, todayIso } from '../../core/format';
import { EQUIPMENT_STATUS, METER_SOURCE, METER_TYPE, OWNERSHIP, RATE_TYPE, meterUnit } from '../../core/labels';
import {
  AssignmentHistoryItem, CostReport, CurrentDriverDto, DepreciationScheduleRow, DepreciationSummary, DriverAssignmentItem, EquipmentDto, MeterReadingDto,
  PagedResult, RentalContractDto, StatusHistoryDto,
} from '../../core/models';
import { LookupsService } from '../../core/lookups.service';
import { NotifyService } from '../../core/notify.service';
import { CostCharts, CostSummary } from '../../shared/cost-summary';
import { CellDef, Column, DataTable } from '../../shared/data-table';
import { ExportButtons } from '../../shared/export';
import { Period, PeriodFilter } from '../../shared/fields';
import { Badge, EmptyState, PageHeader } from '../../shared/ui';
import { DriverAssignDialog, DriverEndDialog, TransferDialog, openDialog } from '../assignments/dialogs';
import { ExpenseDialog } from '../expenses/expense-dialog';
import { ExpenseRecords } from '../expenses/expense-records';
import { FuelConsumption } from '../fuel/fuel-consumption';
import { FuelDialog } from '../fuel/fuel-dialog';
import { FuelRecords } from '../fuel/fuel-records';
import { MaintenanceDialog } from '../maintenance/maintenance-dialog';
import { MaintenanceRecords } from '../maintenance/maintenance-records';
import { RemindersTable } from '../maintenance/reminders-table';
import { MeterDialog, RentalDialog, StatusDialog } from './equipment-dialogs';

type Tab = 'overview' | 'fuel' | 'maintenance' | 'expenses' | 'assignments' | 'drivers' | 'meter' | 'status' | 'rental' | 'depreciation' | 'costs';

@Component({
  selector: 'app-equipment-details',
  imports: [
    PageHeader, Badge, EmptyState, RouterLink, MatMenuModule, MatTooltipModule, DataTable, CellDef, CostSummary, CostCharts, PeriodFilter,
    DatePipe, MoneyPipe, NumPipe, FuelRecords, FuelConsumption, MaintenanceRecords, RemindersTable, ExpenseRecords, ExportButtons,
  ],
  template: `
    <div class="page">
      @if (e(); as e) {
        <app-page-header [title]="e.name" [subtitle]="e.code + ' • ' + e.categoryName + (e.plateNumber ? ' • ' + e.plateNumber : '')"
          [crumbs]="[{ label: 'المعدات', link: '/equipment' }, { label: e.code }]">
          <app-badge [meta]="statusMeta[e.status]" />
          <app-badge [meta]="ownershipMeta[e.ownership]" />
          <button class="btn" [matMenuTriggerFor]="add"><span class="material-symbols-outlined">add</span>تسجيل</button>
          <mat-menu #add>
            <button mat-menu-item (click)="addFuel()"><span class="material-symbols-outlined">local_gas_station</span>تموين</button>
            <button mat-menu-item (click)="addMaintenance()"><span class="material-symbols-outlined">build</span>صيانة</button>
            <button mat-menu-item (click)="addExpense()"><span class="material-symbols-outlined">receipt_long</span>مصروف</button>
            <button mat-menu-item (click)="addMeter()"><span class="material-symbols-outlined">speed</span>قراءة عداد</button>
          </mat-menu>
          <button class="btn" (click)="changeStatus()"><span class="material-symbols-outlined">flag</span>الحالة</button>
          <button class="btn" (click)="transfer()"><span class="material-symbols-outlined">swap_horiz</span>نقل</button>
          <a class="btn primary" [routerLink]="['/equipment', e.id, 'edit']"><span class="material-symbols-outlined">edit</span>تعديل</a>
        </app-page-header>

        <div class="tabs" style="margin-bottom:16px">
          @for (t of tabs(); track t.id) { <button [class.active]="tab() === t.id" (click)="setTab(t.id)">{{ t.label }}</button> }
        </div>

        @switch (tab()) {
          @case ('overview') {
            @if (license(); as l) {
              @if (l.state !== 'valid') {
                <div class="notice" [class.danger]="l.state === 'expired'" [class.warning]="l.state === 'soon'" style="margin-bottom:16px">
                  <strong>تنبيه رخصة المعدة:</strong>
                  {{ l.state === 'expired' ? 'الرخصة منتهية منذ ' + (-l.days) + ' يوم' : l.days === 0 ? 'الرخصة تنتهي اليوم' : 'الرخصة تنتهي خلال ' + l.days + ' يوم' }}
                  ({{ e.licenseExpiryDate | d }}) — جدّد الرخصة ثم حدّث التاريخ من «تعديل».
                </div>
              }
            }
            <div class="grid grid-3">
              <div class="card span-2">
                <div class="card-header"><h3>بيانات المعدة</h3></div>
                <div class="card-body kv">
                  <div><div class="k">الكود</div><div class="v num">{{ e.code }}</div></div>
                  <div><div class="k">رقم اللوحة</div><div class="v num">{{ e.plateNumber || '—' }}</div></div>
                  <div><div class="k">رقم الشاسيه</div><div class="v num">{{ e.chassisNumber || '—' }}</div></div>
                  <div><div class="k">النوع</div><div class="v">{{ e.categoryName }}</div></div>
                  <div><div class="k">الشركة / الموديل</div><div class="v">{{ e.manufacturer && e.model ? e.manufacturer + ' — ' + e.model : (e.manufacturer || e.model || '—') }}</div></div>
                  <div><div class="k">سنة الصنع</div><div class="v num">{{ e.manufactureYear || '—' }}</div></div>
                  <div><div class="k">الوقود</div><div class="v">{{ e.fuelTypeName }}</div></div>
                  <div><div class="k">نوع العداد</div><div class="v">{{ meterTypeMeta[e.meterType].label }}</div></div>
                  <div><div class="k">العداد الحالي</div><div class="v"><span class="num">{{ e.currentMeterReading | num }}</span> {{ unit() }}</div></div>
                  <div><div class="k">القراءة الابتدائية</div><div class="v"><span class="num">{{ e.initialMeterReading | num }}</span> {{ unit() }}</div></div>
                  <div><div class="k">رقم الرخصة</div><div class="v num">{{ e.licenseNumber || '—' }}</div></div>
                  <div><div class="k">انتهاء الرخصة</div>
                    <div class="v">
                      @if (license(); as l) {
                        <span class="num" [class.text-danger]="l.state === 'expired'">{{ e.licenseExpiryDate | d }}</span>
                        @if (l.state === 'expired') { <app-badge label="منتهية" tone="danger" /> }
                        @else if (l.state === 'soon') { <app-badge [label]="'باقي ' + l.days + ' يوم'" tone="warning" /> }
                      } @else { <span class="muted">غير مسجلة</span> }
                    </div></div>
                  <div><div class="k">صورة الرخصة</div>
                    <div class="v">@if (e.licenseAttachmentId) { <a class="link" [href]="url(e.licenseAttachmentId)" target="_blank">عرض</a> } @else { — }</div></div>
                  @if (e.notes) { <div style="grid-column:1/-1"><div class="k">ملاحظات</div><div class="v">{{ e.notes }}</div></div> }
                </div>
              </div>
              <div class="card">
                <div class="card-header"><h3>التشغيل الحالي</h3></div>
                <div class="card-body stack" style="gap:14px">
                  <div>
                    <div class="muted small">المشروع</div>
                    @if (e.currentProjectId) {
                      <a class="link" style="font-weight:600" [routerLink]="['/projects', e.currentProjectId]">{{ e.currentProjectName }}</a>
                      <div class="muted small">منذ {{ e.currentProjectSince | d }}</div>
                    } @else { <div class="muted">غير مخصصة لمشروع</div> }
                  </div>
                  <div>
                    <div class="row" style="margin-bottom:6px"><span class="muted small">السائقون</span><span class="spacer"></span>
                      <button class="btn ghost sm" (click)="assignDriver()"><span class="material-symbols-outlined">person_add</span>تعيين</button></div>
                    @for (d of e.currentDrivers; track d.assignmentId) {
                      <div class="driver">
                        <span class="material-symbols-outlined muted">person</span>
                        <div style="flex:1">
                          <a class="link" [routerLink]="['/drivers', d.driverId]">{{ d.fullName }}</a>
                          @if (d.isPrimary) { <span class="badge dark" style="margin-inline-start:6px">أساسي</span> }
                          <div class="muted small">منذ {{ d.startDate | d }}</div>
                        </div>
                        <button class="btn ghost icon sm" matTooltip="استبدال" (click)="endDriver(d, 'replace')"><span class="material-symbols-outlined">sync_alt</span></button>
                        <button class="btn ghost icon sm" matTooltip="إنهاء" (click)="endDriver(d, 'end')"><span class="material-symbols-outlined">person_remove</span></button>
                      </div>
                    } @empty { <div class="muted small">لا يوجد سائق معيّن</div> }
                  </div>
                </div>
              </div>

              <div class="card span-2">
                <div class="card-header">
                  <h3>الصور</h3><span class="spacer"></span>
                  <button class="btn sm" (click)="imgInput.click()" [disabled]="uploading()"><span class="material-symbols-outlined">add_photo_alternate</span>{{ uploading() ? 'جارٍ الرفع...' : 'إضافة صور' }}</button>
                  <input #imgInput type="file" accept="image/*" multiple hidden (change)="uploadImages(imgInput)" />
                </div>
                <div class="card-body">
                  @if (e.imageIds.length) {
                    <div class="gallery">
                      @for (img of e.imageIds; track img) {
                        <div class="ph" [class.main]="img === e.mainImageId">
                          <a [href]="url(img)" target="_blank"><img [src]="url(img)" alt="" loading="lazy" /></a>
                          <div class="ph-actions">
                            @if (img !== e.mainImageId) { <button class="btn sm" (click)="setMain(img)">رئيسية</button> } @else { <span class="badge dark">رئيسية</span> }
                            <button class="btn sm icon" (click)="removeImage(img)"><span class="material-symbols-outlined">delete</span></button>
                          </div>
                        </div>
                      }
                    </div>
                  } @else { <app-empty icon="photo_library" title="لا توجد صور" message="أضف صوراً للمعدة لتسهيل التعرف عليها." /> }
                </div>
              </div>

              <div class="card">
                <div class="card-header"><h3>{{ e.ownership === 'Owned' ? 'القيمة الدفترية' : 'عقد الإيجار الحالي' }}</h3></div>
                <div class="card-body">
                  @if (e.ownership === 'Owned') {
                    @if (e.depreciation; as dp) {
                      <div class="kv" style="grid-template-columns:1fr 1fr">
                        <div><div class="k">سعر الشراء</div><div class="v num">{{ dp.purchasePrice | money }}</div></div>
                        <div><div class="k">تاريخ الشراء</div><div class="v">{{ dp.purchaseDate | d }}</div></div>
                        <div><div class="k">مجمع الإهلاك</div><div class="v num">{{ depNow()?.accumulated ?? 0 | money }}</div></div>
                        <div><div class="k">القيمة الدفترية</div><div class="v num">{{ depNow()?.bookValue ?? dp.purchasePrice | money }}</div></div>
                        <div><div class="k">العمر الإنتاجي</div><div class="v num">{{ dp.usefulLifeMonths }} شهر</div></div>
                        <div><div class="k">القيمة التخريدية</div><div class="v num">{{ dp.residualValue | money }}</div></div>
                      </div>
                    } @else { <div class="muted small">لم يتم إدخال بيانات الشراء والإهلاك. <a class="link" [routerLink]="['/equipment', e.id, 'edit']">إضافة</a></div> }
                  } @else {
                    @if (activeContract(); as c) {
                      <div class="kv" style="grid-template-columns:1fr 1fr">
                        <div><div class="k">المؤجر</div><div class="v">{{ c.lessor }}</div></div>
                        <div><div class="k">القيمة</div><div class="v"><span class="num">{{ c.rate | money }}</span> / {{ rateMeta[c.rateType].label }}</div></div>
                        <div><div class="k">من</div><div class="v">{{ c.startDate | d }}</div></div>
                        <div><div class="k">إلى</div><div class="v">{{ c.endDate | d }}</div></div>
                      </div>
                    } @else { <div class="muted small">لا يوجد عقد إيجار ساري. <button class="btn sm" (click)="addContract()">إضافة عقد</button></div> }
                  }
                </div>
              </div>

              <div class="card span-all">
                <div class="card-header"><h3>الصيانة الدورية</h3></div>
                <app-reminders-table [equipmentId]="e.id" hideEquipment />
              </div>
            </div>
            <div style="margin-top:16px"><app-cost-summary [t]="costs()?.totals" [loading]="costsLoading()" /></div>
          }
          @case ('fuel') {
            <div class="stack">
              <app-fuel-consumption [equipmentId]="e.id" />
              <app-fuel-records [fixed]="{ equipmentId: e.id }" hideEquipment />
            </div>
          }
          @case ('maintenance') {
            <div class="stack">
              <div class="card"><div class="card-header"><h3>المواعيد القادمة</h3></div><app-reminders-table [equipmentId]="e.id" hideEquipment /></div>
              <app-maintenance-records [fixed]="{ equipmentId: e.id }" hideEquipment />
            </div>
          }
          @case ('expenses') { <app-expense-records [fixed]="{ equipmentId: e.id }" hideEquipment /> }
          @case ('assignments') {
            <div class="card">
              <app-data-table [columns]="assignCols" [rows]="assignments()" [paged]="false" [loading]="loading()" emptyTitle="لم يتم تخصيص المعدة لأي مشروع بعد">
                <ng-template appCell="project" let-r><a class="link" [routerLink]="['/projects', r.projectId]">{{ r.projectName }}</a></ng-template>
                <ng-template appCell="endDate" let-r>
                  @if (r.endDate) { <span class="num">{{ r.endDate | d }}</span> } @else { <app-badge label="حالي" tone="success" /> }
                </ng-template>
              </app-data-table>
            </div>
          }
          @case ('drivers') {
            <div class="card">
              <app-data-table [columns]="driverCols" [rows]="drivers()" [paged]="false" [loading]="loading()" emptyTitle="لا يوجد سجل سائقين">
                <ng-template appCell="driver" let-r><a class="link" [routerLink]="['/drivers', r.driverId]">{{ r.driverName }}</a></ng-template>
                <ng-template appCell="isPrimary" let-r>@if (r.isPrimary) { <app-badge label="أساسي" tone="dark" /> }</ng-template>
                <ng-template appCell="endDate" let-r>
                  @if (r.endDate) { <span class="num">{{ r.endDate | d }}</span> } @else { <app-badge label="حالي" tone="success" /> }
                </ng-template>
              </app-data-table>
            </div>
          }
          @case ('meter') {
            <div class="card">
              <div class="card-header"><h3>سجل قراءات العداد</h3><span class="spacer"></span>
                <button class="btn sm" (click)="addMeter()"><span class="material-symbols-outlined">add</span>قراءة</button></div>
              <app-data-table [columns]="meterCols" [rows]="meters()" [paged]="false" [loading]="loading()" emptyTitle="لا توجد قراءات">
                <ng-template appCell="source" let-r>
                  <app-badge [meta]="$any(meterSourceMeta)[r.source]" />
                  @if (r.correctionReason) { <div class="cell-sub">{{ r.correctionReason }}</div> }
                </ng-template>
              </app-data-table>
            </div>
          }
          @case ('status') {
            <div class="card">
              <app-data-table [columns]="statusCols" [rows]="statusHistory()" [paged]="false" [loading]="loading()" emptyTitle="لا يوجد سجل حالات">
                <ng-template appCell="status" let-r><app-badge [meta]="$any(statusMeta)[r.status]" /></ng-template>
                <ng-template appCell="toDate" let-r>
                  @if (r.toDate) { <span class="num">{{ r.toDate | d }}</span> } @else { <app-badge label="حالية" tone="success" /> }
                </ng-template>
              </app-data-table>
            </div>
          }
          @case ('rental') {
            <div class="card">
              <div class="card-header"><h3>عقود الإيجار</h3><span class="sub">تُسجَّل مصروفات الإيجار شهرياً تلقائياً وتوزع على المشروعات حسب أيام التخصيص</span>
                <span class="spacer"></span><button class="btn sm primary" (click)="addContract()"><span class="material-symbols-outlined">add</span>عقد جديد</button></div>
              <app-data-table [columns]="rentalCols" [rows]="e.rentalContracts" [paged]="false" emptyIcon="key" emptyTitle="لا توجد عقود إيجار">
                <ng-template appCell="rate" let-r><span class="num">{{ r.rate | money }}</span> <span class="muted small">/ {{ $any(rateMeta)[r.rateType].label }}</span></ng-template>
                <ng-template appCell="includes" let-r>
                  <span class="small muted">{{ includes(r) }}</span>
                </ng-template>
                <ng-template appCell="actions" let-r>
                  <div class="actions-cell">
                    @if (r.attachmentId) { <a class="btn ghost icon sm" [href]="url(r.attachmentId)" target="_blank"><span class="material-symbols-outlined">attach_file</span></a> }
                    <button class="btn ghost icon sm" (click)="editContract(r)"><span class="material-symbols-outlined">edit</span></button>
                    @if (auth.isAdmin()) { <button class="btn ghost icon sm" (click)="deleteContract(r)"><span class="material-symbols-outlined">delete</span></button> }
                  </div>
                </ng-template>
              </app-data-table>
            </div>
          }
          @case ('depreciation') {
            <div class="card">
              <div class="card-header"><h3>جدول الإهلاك الشهري</h3><span class="sub">قسط ثابت محسوب يومياً — غير نقدي</span>
                <span class="spacer"></span><app-export report="equipment-depreciation-schedule" [query]="{ equipmentId: e.id }" /></div>
              <app-data-table [columns]="depCols" [rows]="schedule()" [paged]="false" [loading]="loading()" maxHeight="560px" [trackBy]="trackDep" emptyTitle="لا يوجد جدول إهلاك" />
            </div>
          }
          @case ('costs') {
            <div class="stack">
              <div class="row"><app-period [from]="period().from" [to]="period().to" (change)="setPeriod($event)" /></div>
              <app-cost-summary [t]="costs()?.totals" [loading]="costsLoading()" />
              <app-cost-charts [categories]="costs()?.byCategory ?? []" [months]="costs()?.byMonth ?? []" [loading]="costsLoading()" />
              <div class="card">
                <div class="card-header"><h3>التكاليف حسب المشروع</h3></div>
                <app-data-table [columns]="costCols" [rows]="costs()?.byProject ?? []" [paged]="false" [loading]="costsLoading()" emptyTitle="لا توجد تكاليف" />
              </div>
            </div>
          }
        }
      } @else {
        <div class="skeleton" style="height:60px;margin-bottom:16px"></div>
        <div class="skeleton" style="height:320px"></div>
      }
    </div>
  `,
  styles: `
    .driver { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-top: 1px solid var(--border); }
    .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
    .ph { position: relative; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; aspect-ratio: 4/3; background: var(--subtle); }
    .ph.main { border-color: var(--text); }
    .ph img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .ph-actions { position: absolute; inset-inline: 6px; bottom: 6px; display: flex; gap: 4px; justify-content: space-between; opacity: 0; transition: opacity .15s; }
    .ph:hover .ph-actions, .ph.main .ph-actions { opacity: 1; }
    .ph-actions .btn { background: rgba(255,255,255,.95); }
  `,
})
export class EquipmentDetails implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private lookups = inject(LookupsService);
  auth = inject(AuthService);
  id = input.required<string>();
  e = signal<EquipmentDto | null>(null);
  tab = signal<Tab>('overview');
  loading = signal(false);
  uploading = signal(false);
  assignments = signal<AssignmentHistoryItem[]>([]);
  drivers = signal<DriverAssignmentItem[]>([]);
  meters = signal<MeterReadingDto[]>([]);
  statusHistory = signal<StatusHistoryDto[]>([]);
  schedule = signal<DepreciationScheduleRow[]>([]);
  costs = signal<CostReport | null>(null);
  costsLoading = signal(false);
  period = signal<Period>({ from: null, to: null });

  statusMeta = EQUIPMENT_STATUS;
  ownershipMeta = OWNERSHIP;
  meterTypeMeta = METER_TYPE;
  meterSourceMeta = METER_SOURCE;
  rateMeta = RATE_TYPE;
  url = (id: number) => ApiService.attachmentUrl(id);
  trackDep = (r: DepreciationScheduleRow) => r.periodStart;
  unit = computed(() => meterUnit(this.e()?.meterType));

  tabs = computed(() => {
    const e = this.e();
    const t: { id: Tab; label: string }[] = [
      { id: 'overview', label: 'نظرة عامة' }, { id: 'fuel', label: 'الوقود' }, { id: 'maintenance', label: 'الصيانة' },
      { id: 'expenses', label: 'المصروفات' }, { id: 'assignments', label: 'المشروعات' }, { id: 'drivers', label: 'السائقون' },
      { id: 'meter', label: 'العداد' }, { id: 'status', label: 'الحالات' },
    ];
    if (e?.ownership === 'Rented' || e?.rentalContracts.length) t.push({ id: 'rental', label: 'عقود الإيجار' });
    if (e?.depreciation) t.push({ id: 'depreciation', label: 'الإهلاك' });
    t.push({ id: 'costs', label: 'التكاليف' });
    return t;
  });

  license = computed(() => {
    const d = this.e()?.licenseExpiryDate;
    if (!d) return null;
    const days = Math.round((Date.parse(d) - Date.parse(todayIso())) / 86_400_000);
    const warn = this.lookups.settings()?.licenseExpiryWarningDays ?? 30;
    return { days, state: days < 0 ? 'expired' : days <= warn ? 'soon' : 'valid' as 'expired' | 'soon' | 'valid' };
  });

  activeContract = computed(() => {
    const today = todayIso();
    return this.e()?.rentalContracts.find(c => c.startDate <= today && (!c.endDate || c.endDate >= today)) ?? null;
  });

  depNow = signal<{ accumulated: number; bookValue: number } | null>(null);

  assignCols: Column<AssignmentHistoryItem>[] = [
    { key: 'project', label: 'المشروع' }, { key: 'startDate', label: 'من', type: 'date' }, { key: 'endDate', label: 'إلى' },
    { key: 'days', label: 'الأيام', type: 'int' }, { key: 'startMeter', label: 'عداد البداية', type: 'num' }, { key: 'endMeter', label: 'عداد النهاية', type: 'num' },
    { key: 'notes', label: 'ملاحظات' },
  ];
  driverCols: Column<DriverAssignmentItem>[] = [
    { key: 'driver', label: 'السائق' }, { key: 'isPrimary', label: '' }, { key: 'startDate', label: 'من', type: 'date' },
    { key: 'endDate', label: 'إلى' }, { key: 'notes', label: 'ملاحظات' },
  ];
  meterCols: Column<MeterReadingDto>[] = [
    { key: 'readingDate', label: 'التاريخ', type: 'date' }, { key: 'value', label: 'القراءة', type: 'num' },
    { key: 'source', label: 'المصدر' }, { key: 'createdBy', label: 'بواسطة' },
  ];
  statusCols: Column<StatusHistoryDto>[] = [
    { key: 'status', label: 'الحالة' }, { key: 'fromDate', label: 'من', type: 'date' }, { key: 'toDate', label: 'إلى' },
    { key: 'reason', label: 'السبب' }, { key: 'createdBy', label: 'بواسطة' },
  ];
  rentalCols: Column<RentalContractDto>[] = [
    { key: 'lessor', label: 'المؤجر' }, { key: 'contractNo', label: 'رقم العقد' }, { key: 'startDate', label: 'من', type: 'date' },
    { key: 'endDate', label: 'إلى', type: 'date' }, { key: 'rate', label: 'القيمة' }, { key: 'includes', label: 'يشمل' }, { key: 'actions', label: '' },
  ];
  depCols: Column<DepreciationScheduleRow>[] = [
    { key: 'periodStart', label: 'من', type: 'date' }, { key: 'periodEnd', label: 'إلى', type: 'date' },
    { key: 'depreciation', label: 'إهلاك الفترة', type: 'money' }, { key: 'accumulated', label: 'مجمع الإهلاك', type: 'money' },
    { key: 'bookValue', label: 'القيمة الدفترية', type: 'money' },
  ];
  costCols: Column[] = [
    { key: 'name', label: 'المشروع', value: (r: any) => r.name || 'بدون مشروع' }, { key: 'fuel', label: 'وقود', type: 'money' },
    { key: 'maintenance', label: 'صيانة', type: 'money' }, { key: 'rental', label: 'إيجار', type: 'money' },
    { key: 'overtime', label: 'إضافي', type: 'money' }, { key: 'other', label: 'أخرى', type: 'money' },
    { key: 'totalCash', label: 'النقدي', type: 'money' }, { key: 'depreciation', label: 'الإهلاك', type: 'money' },
    { key: 'totalCostOfOwnership', label: 'الإجمالي', type: 'money' },
  ];

  async ngOnInit(): Promise<void> {
    await this.reload();
    this.loadCosts();
    if (this.e()?.depreciation) this.loadBookValue();
  }

  private async loadBookValue(): Promise<void> {
    const e = this.e()!;
    const s = await this.api.get<DepreciationSummary>('depreciation', { search: e.code });
    const item = s.items.find(i => i.equipmentId === e.id);
    this.depNow.set(item ? { accumulated: item.accumulatedDepreciation, bookValue: item.bookValue } : null);
  }

  async reload(): Promise<void> {
    try { this.e.set(await this.api.get<EquipmentDto>(`equipment/${this.id()}`)); }
    catch (err) { this.notify.error(err); this.router.navigateByUrl('/equipment'); }
  }

  /** Reload header data and whichever tab is open (after any mutation). */
  async refresh(): Promise<void> {
    await this.reload();
    this.loadTab(this.tab());
    this.loadCosts();
  }

  setTab(t: Tab): void { this.tab.set(t); this.loadTab(t); }

  private async loadTab(t: Tab): Promise<void> {
    const id = this.id();
    this.loading.set(true);
    try {
      if (t === 'assignments') this.assignments.set(await this.api.get(`equipment/${id}/assignments`));
      if (t === 'drivers') this.drivers.set((await this.api.get<PagedResult<DriverAssignmentItem>>('assignments/drivers', { equipmentId: id, pageSize: 500 })).items);
      if (t === 'meter') this.meters.set([...(await this.api.get<MeterReadingDto[]>(`equipment/${id}/meter-readings`))].reverse());
      if (t === 'status') this.statusHistory.set(await this.api.get(`equipment/${id}/status-history`));
      if (t === 'depreciation') await this.loadSchedule();
    } catch (err) { this.notify.error(err); } finally { this.loading.set(false); }
  }

  private async loadSchedule(): Promise<void> { this.schedule.set(await this.api.get(`equipment/${this.id()}/depreciation-schedule`)); }

  setPeriod(p: Period): void { this.period.set(p); this.loadCosts(); }
  async loadCosts(): Promise<void> {
    this.costsLoading.set(true);
    try { this.costs.set(await this.api.get<CostReport>(`equipment/${this.id()}/costs`, this.period())); }
    catch (err) { this.notify.error(err); } finally { this.costsLoading.set(false); }
  }

  includes(c: RentalContractDto): string {
    return [c.includesDriver && 'سائق', c.includesFuel && 'وقود', c.includesMaintenance && 'صيانة'].filter(Boolean).join('، ') || '—';
  }

  // ---------- actions ----------
  private async run(component: any, data: unknown, width?: string): Promise<void> {
    if (await openDialog(this.dialog, component, data, width)) this.refresh();
  }
  addFuel() { this.run(FuelDialog, { equipmentId: this.e()!.id }, '720px'); }
  addMaintenance() { this.run(MaintenanceDialog, { equipmentId: this.e()!.id }, '760px'); }
  addExpense() { this.run(ExpenseDialog, { equipmentId: this.e()!.id }, '680px'); }
  addMeter() { const e = this.e()!; this.run(MeterDialog, { equipmentId: e.id, meterType: e.meterType, currentMeter: e.currentMeterReading }); }
  changeStatus() { const e = this.e()!; this.run(StatusDialog, { equipmentId: e.id, current: e.status }, '480px'); }
  assignDriver() { this.run(DriverAssignDialog, { equipmentId: this.e()!.id }); }
  addContract() { this.run(RentalDialog, { equipmentId: this.e()!.id }, '720px'); }
  editContract(c: RentalContractDto) { this.run(RentalDialog, { equipmentId: this.e()!.id, contract: c }, '720px'); }
  transfer() {
    const e = this.e()!;
    this.run(TransferDialog, {
      equipmentId: e.id, equipmentName: `${e.code} — ${e.name}`, currentProjectId: e.currentProjectId, currentProjectName: e.currentProjectName,
      meterType: e.meterType, currentMeter: e.currentMeterReading,
    });
  }
  endDriver(d: CurrentDriverDto, mode: 'end' | 'replace') {
    const e = this.e()!;
    this.run(DriverEndDialog, { id: d.assignmentId, driverName: d.fullName, equipmentName: e.name, startDate: d.startDate, mode });
  }

  async deleteContract(c: RentalContractDto): Promise<void> {
    const reason = await this.notify.confirmWithReason({ title: 'حذف عقد الإيجار', message: 'سيتم حذف العقد وقيود الإيجار المرتبطة به.', danger: true, confirmText: 'حذف' });
    if (reason === null) return;
    try { await this.api.delete(`equipment/rental-contracts/${c.id}`, { reason }); this.notify.success('تم حذف العقد'); this.refresh(); }
    catch (err) { this.notify.error(err); }
  }

  async uploadImages(input: HTMLInputElement): Promise<void> {
    const files = [...(input.files ?? [])];
    input.value = '';
    if (!files.length) return;
    this.uploading.set(true);
    try {
      for (const [i, f] of files.entries())
        await this.api.upload(`equipment/${this.id()}/images`, f, { setMain: !this.e()!.mainImageId && i === 0 });
      this.notify.success('تم رفع الصور');
      await this.reload();
    } catch (err) { this.notify.error(err); } finally { this.uploading.set(false); }
  }

  async setMain(img: number): Promise<void> {
    try { await this.api.put(`equipment/${this.id()}/images/${img}/main`, {}); await this.reload(); }
    catch (err) { this.notify.error(err); }
  }

  async removeImage(img: number): Promise<void> {
    if (!(await this.notify.confirm({ title: 'حذف الصورة؟', danger: true, confirmText: 'حذف' }))) return;
    try { await this.api.delete(`equipment/${this.id()}/images/${img}`); await this.reload(); }
    catch (err) { this.notify.error(err); }
  }
}
