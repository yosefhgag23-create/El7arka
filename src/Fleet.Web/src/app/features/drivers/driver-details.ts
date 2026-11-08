import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../core/api.service';
import { DatePipe, todayIso } from '../../core/format';
import { EMPLOYMENT_STATUS } from '../../core/labels';
import { DriverAssignmentItem, DriverDto, PagedResult } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { CellDef, Column, DataTable } from '../../shared/data-table';
import { Badge, PageHeader } from '../../shared/ui';
import { DriverAssignDialog, DriverEndDialog, openDialog } from '../assignments/dialogs';
import { FuelRecords } from '../fuel/fuel-records';
import { OvertimeRecords } from '../overtime/overtime-records';

type Tab = 'overview' | 'history' | 'overtime' | 'fuel';

@Component({
  selector: 'app-driver-details',
  imports: [PageHeader, Badge, RouterLink, DataTable, CellDef, MatTooltipModule, DatePipe, OvertimeRecords, FuelRecords],
  template: `
    <div class="page">
      @if (d(); as d) {
        <app-page-header [title]="d.fullName" [subtitle]="d.phone || ''" [crumbs]="[{ label: 'السائقون', link: '/drivers' }, { label: d.fullName }]">
          <app-badge [meta]="statusMeta[d.employmentStatus]" />
          @if (!d.isActive) { <app-badge label="غير نشط" /> }
          <button class="btn" (click)="toggleActive()">{{ d.isActive ? 'إيقاف التفعيل' : 'إعادة التفعيل' }}</button>
          <a class="btn" [routerLink]="['/drivers', d.id, 'edit']"><span class="material-symbols-outlined">edit</span>تعديل</a>
          @if (d.isActive) { <button class="btn primary" (click)="assign()"><span class="material-symbols-outlined">add_link</span>تعيين على معدة</button> }
        </app-page-header>

        <div class="tabs" style="margin-bottom:16px">
          @for (t of tabs; track t.id) { <button [class.active]="tab() === t.id" (click)="setTab(t.id)">{{ t.label }}</button> }
        </div>

        @switch (tab()) {
          @case ('overview') {
            <div class="grid grid-3">
              <div class="card">
                <div class="card-body" style="display:flex;flex-direction:column;align-items:center;gap:12px">
                  @if (d.photoId) { <img class="photo" [src]="url(d.photoId)" alt="" /> }
                  @else { <div class="photo empty"><span class="material-symbols-outlined">person</span></div> }
                  <button class="btn sm" (click)="photo.click()" [disabled]="uploading()">{{ uploading() ? 'جارٍ الرفع...' : 'تغيير الصورة' }}</button>
                  <input #photo type="file" accept="image/*" hidden (change)="uploadPhoto(photo)" />
                </div>
              </div>
              <div class="card span-2">
                <div class="card-header"><h3>البيانات</h3></div>
                <div class="card-body kv">
                  <div><div class="k">الرقم القومي</div><div class="v num">{{ d.nationalId || '—' }}</div></div>
                  <div><div class="k">الهاتف</div><div class="v num">{{ d.phone || '—' }}</div></div>
                  <div><div class="k">تاريخ التعيين</div><div class="v">{{ d.hireDate | d }}</div></div>
                  <div><div class="k">رقم الرخصة</div><div class="v num">{{ d.licenseNumber || '—' }}</div></div>
                  <div><div class="k">نوع الرخصة</div><div class="v">{{ d.licenseTypeName || '—' }}</div></div>
                  <div><div class="k">انتهاء الرخصة</div>
                    <div class="v" [class.text-danger]="expired()">{{ d.licenseExpiryDate | d }} @if (expired()) { <app-badge label="منتهية" tone="danger" /> }</div></div>
                  @if (d.address) { <div style="grid-column:1/-1"><div class="k">العنوان</div><div class="v">{{ d.address }}</div></div> }
                  @if (d.notes) { <div style="grid-column:1/-1"><div class="k">ملاحظات</div><div class="v">{{ d.notes }}</div></div> }
                </div>
              </div>
              <div class="card span-all">
                <div class="card-header"><h3>المعدات الحالية</h3></div>
                <app-data-table [columns]="activeCols" [rows]="active()" [paged]="false" [loading]="loading()" emptyIcon="local_shipping" emptyTitle="غير معيّن على أي معدة حالياً">
                  <ng-template appCell="equipment" let-r><a class="link" [routerLink]="['/equipment', r.equipmentId]">{{ r.equipmentCode }} — {{ r.equipmentName }}</a></ng-template>
                  <ng-template appCell="isPrimary" let-r>@if (r.isPrimary) { <app-badge label="أساسي" tone="dark" /> }</ng-template>
                  <ng-template appCell="actions" let-r>
                    <div class="actions-cell">
                      <button class="btn ghost icon sm" matTooltip="استبدال بسائق آخر" (click)="end(r, 'replace')"><span class="material-symbols-outlined">sync_alt</span></button>
                      <button class="btn ghost icon sm" matTooltip="إنهاء التعيين" (click)="end(r, 'end')"><span class="material-symbols-outlined">link_off</span></button>
                    </div>
                  </ng-template>
                </app-data-table>
              </div>
            </div>
          }
          @case ('history') {
            <div class="card">
              <app-data-table [columns]="historyCols" [rows]="history()" [paged]="false" [loading]="loading()" emptyTitle="لا يوجد سجل تعيينات">
                <ng-template appCell="equipment" let-r><a class="link" [routerLink]="['/equipment', r.equipmentId]">{{ r.equipmentCode }} — {{ r.equipmentName }}</a></ng-template>
                <ng-template appCell="isPrimary" let-r>@if (r.isPrimary) { <app-badge label="أساسي" tone="dark" /> }</ng-template>
                <ng-template appCell="endDate" let-r>
                  @if (r.endDate) { <span class="num">{{ r.endDate | d }}</span> } @else { <app-badge label="حالي" tone="success" /> }
                </ng-template>
              </app-data-table>
            </div>
          }
          @case ('overtime') { <app-overtime-records [fixed]="{ driverId: d.id }" hideDriver /> }
          @case ('fuel') { <app-fuel-records [fixed]="{ driverId: d.id }" /> }
        }
      } @else {
        <div class="skeleton" style="height:60px;margin-bottom:16px"></div>
        <div class="skeleton" style="height:240px"></div>
      }
    </div>
  `,
  styles: `
    .photo { width: 140px; height: 140px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border); }
    .photo.empty { display: grid; place-items: center; background: var(--subtle); color: var(--faint); }
    .photo.empty .material-symbols-outlined { font-size: 56px; }
  `,
})
export class DriverDetails implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  id = input.required<string>();
  d = signal<DriverDto | null>(null);
  tab = signal<Tab>('overview');
  loading = signal(false);
  uploading = signal(false);
  history = signal<DriverAssignmentItem[]>([]);
  active = computed(() => this.history().filter(h => h.isActive));
  expired = computed(() => !!this.d()?.licenseExpiryDate && this.d()!.licenseExpiryDate! < todayIso());
  statusMeta = EMPLOYMENT_STATUS;
  url = (id: number) => ApiService.attachmentUrl(id);
  tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'نظرة عامة' }, { id: 'history', label: 'سجل المعدات' }, { id: 'overtime', label: 'الوقت الإضافي' }, { id: 'fuel', label: 'التموين' },
  ];

  activeCols: Column<DriverAssignmentItem>[] = [
    { key: 'equipment', label: 'المعدة' }, { key: 'isPrimary', label: '' }, { key: 'startDate', label: 'منذ', type: 'date' },
    { key: 'notes', label: 'ملاحظات' }, { key: 'actions', label: '' },
  ];
  historyCols: Column<DriverAssignmentItem>[] = [
    { key: 'equipment', label: 'المعدة' }, { key: 'isPrimary', label: '' }, { key: 'startDate', label: 'من', type: 'date' },
    { key: 'endDate', label: 'إلى' }, { key: 'notes', label: 'ملاحظات' },
  ];

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    try {
      this.d.set(await this.api.get<DriverDto>(`drivers/${this.id()}`));
      await this.loadHistory();
    } catch (e) { this.notify.error(e); this.router.navigateByUrl('/drivers'); }
  }

  private async loadHistory(): Promise<void> {
    this.loading.set(true);
    try { this.history.set((await this.api.get<PagedResult<DriverAssignmentItem>>('assignments/drivers', { driverId: this.id(), pageSize: 500 })).items); }
    finally { this.loading.set(false); }
  }

  setTab(t: Tab): void { this.tab.set(t); }

  async assign(): Promise<void> {
    if (await openDialog(this.dialog, DriverAssignDialog, { driverId: this.d()!.id })) this.loadHistory();
  }

  async end(r: DriverAssignmentItem, mode: 'end' | 'replace'): Promise<void> {
    if (await openDialog(this.dialog, DriverEndDialog, { id: r.id, driverName: r.driverName, equipmentName: r.equipmentName, startDate: r.startDate, mode })) this.loadHistory();
  }

  async toggleActive(): Promise<void> {
    const d = this.d()!;
    const ok = await this.notify.confirm({
      title: d.isActive ? 'إيقاف تفعيل السائق' : 'إعادة تفعيل السائق',
      message: d.isActive ? 'لن يظهر السائق في قوائم الاختيار. يجب إنهاء تعييناته الحالية أولاً.' : undefined,
      danger: d.isActive,
    });
    if (!ok) return;
    try { await this.api.put(`drivers/${d.id}/active`, { isActive: !d.isActive }); this.notify.success('تم التحديث'); this.reload(); }
    catch (e) { this.notify.error(e); }
  }

  async uploadPhoto(input: HTMLInputElement): Promise<void> {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    this.uploading.set(true);
    try { await this.api.upload(`drivers/${this.id()}/photo`, f); await this.reload(); }
    catch (e) { this.notify.error(e); } finally { this.uploading.set(false); }
  }
}
