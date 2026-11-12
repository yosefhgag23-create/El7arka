import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { ApiService } from '../../core/api.service';
import { EQUIPMENT_STATUS, OWNERSHIP, meterUnit, options } from '../../core/labels';
import { LookupsService } from '../../core/lookups.service';
import { EquipmentListItem, EquipmentStatus, OwnershipType, PagedResult, ProjectListItem } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { DatePipe, NumPipe, addDaysIso, todayIso } from '../../core/format';
import { CellDef, Column, DataTable, ListState } from '../../shared/data-table';
import { FilterSelect, SearchBox } from '../../shared/fields';
import { Badge, PageHeader } from '../../shared/ui';

type Q = { categoryId?: number | null; status?: EquipmentStatus | null; ownership?: OwnershipType | null; projectId?: number | null; unassigned?: boolean | null; licenseExpiring?: boolean | null; includeInactive?: boolean | null };

@Component({
  selector: 'app-equipment-list',
  imports: [PageHeader, DataTable, CellDef, SearchBox, FilterSelect, Badge, RouterLink, MatCheckboxModule, NumPipe, DatePipe],
  template: `
    <div class="page">
      <app-page-header title="المعدات" subtitle="سجل المعدات المملوكة والمؤجرة وحالتها الحالية" [crumbs]="[{ label: 'المعدات' }]">
        <a class="btn primary" routerLink="/equipment/new"><span class="material-symbols-outlined">add</span>معدة جديدة</a>
      </app-page-header>
      <div class="card">
        <div class="filters">
          <app-search placeholder="بحث بالكود أو الاسم أو اللوحة أو الشاسيه" (search)="list.patch({ search: $event })" />
          <app-filter-select placeholder="كل الأنواع" numeric [options]="categoryOptions" [value]="list.query().categoryId" (valueChange)="list.patch({ categoryId: $event })" />
          <app-filter-select placeholder="كل الحالات" [options]="statusOptions" [value]="list.query().status" (valueChange)="list.patch({ status: $event })" />
          <app-filter-select placeholder="تمليك وإيجار" [options]="ownershipOptions" [value]="list.query().ownership" (valueChange)="list.patch({ ownership: $event })" />
          <app-filter-select placeholder="كل المشروعات" numeric [options]="projectOptions()" [value]="list.query().projectId" (valueChange)="list.patch({ projectId: $event })" />
          <mat-checkbox [checked]="!!list.query().unassigned" (change)="list.patch({ unassigned: $event.checked || null })">غير مخصصة فقط</mat-checkbox>
          <mat-checkbox [checked]="!!list.query().licenseExpiring" (change)="list.patch({ licenseExpiring: $event.checked || null })">رخص منتهية أو قاربت</mat-checkbox>
          <mat-checkbox [checked]="!!list.query().includeInactive" (change)="list.patch({ includeInactive: $event.checked || null })">إظهار غير النشطة</mat-checkbox>
        </div>
        <app-data-table [columns]="cols" [rows]="list.rows()" [total]="list.total()" [loading]="list.loading()"
          [page]="list.query().page" [pageSize]="list.query().pageSize" [sort]="list.query().sort" [clickable]="true"
          emptyIcon="local_shipping" emptyTitle="لا توجد معدات" emptyMessage="أضف المعدات لتتمكن من متابعة الوقود والصيانة والتكاليف."
          (pageChange)="list.setPage($event)" (pageSizeChange)="list.setPageSize($event)" (sortChange)="list.setSort($event)" (rowClick)="open($event)">
          <ng-template appCell="name" let-r>
            <div class="row" style="gap:10px">
              @if (r.mainImageId) { <img class="thumb" [src]="img(r.mainImageId)" alt="" loading="lazy" /> }
              @else { <span class="thumb"><span class="material-symbols-outlined">local_shipping</span></span> }
              <div><div class="cell-title">{{ r.name }}</div><div class="cell-sub num">{{ r.code }}</div></div>
            </div>
          </ng-template>
          <ng-template appCell="plateNumber" let-r><span class="num">{{ r.plateNumber || r.chassisNumber || '—' }}</span></ng-template>
          <ng-template appCell="project" let-r>
            @if (r.currentProjectId) { <span>{{ r.currentProjectName }}</span> } @else { <span class="muted">غير مخصصة</span> }
          </ng-template>
          <ng-template appCell="meter" let-r><span class="num">{{ r.currentMeterReading | num }}</span> <span class="muted small">{{ unit(r.meterType) }}</span></ng-template>
          <ng-template appCell="licenseExpiryDate" let-r>
            @if (r.licenseExpiryDate) {
              <span class="num" [class.text-danger]="r.licenseExpiryDate < today">{{ r.licenseExpiryDate | d }}</span>
              @if (r.licenseExpiryDate < today) { <app-badge label="منتهية" tone="danger" /> }
              @else if (r.licenseExpiryDate <= warnLimit()) { <app-badge label="قاربت" tone="warning" /> }
            } @else { <span class="muted">—</span> }
          </ng-template>
          <ng-template appCell="ownership" let-r><app-badge [meta]="$any(ownershipMeta)[r.ownership]" /></ng-template>
          <ng-template appCell="status" let-r><app-badge [meta]="$any(statusMeta)[r.status]" /></ng-template>
        </app-data-table>
      </div>
    </div>
  `,
})
export class EquipmentList implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private notify = inject(NotifyService);
  private lookups = inject(LookupsService);
  statusMeta = EQUIPMENT_STATUS;
  ownershipMeta = OWNERSHIP;
  statusOptions = options(EQUIPMENT_STATUS);
  ownershipOptions = options(OWNERSHIP);
  categoryOptions = this.lookups.all('EquipmentCategories').map(c => ({ value: c.id, label: c.nameAr }));
  projectOptions = signal<{ value: number; label: string }[]>([]);
  unit = meterUnit;
  today = todayIso();
  warnLimit = computed(() => addDaysIso(this.today, this.lookups.settings()?.licenseExpiryWarningDays ?? 30));
  img = (id: number) => ApiService.attachmentUrl(id);

  cols: Column<EquipmentListItem>[] = [
    { key: 'name', label: 'المعدة', sort: 'code' },
    { key: 'plateNumber', label: 'اللوحة / الشاسيه', sort: 'plateNumber' },
    { key: 'categoryName', label: 'النوع', sort: 'category' },
    { key: 'project', label: 'المشروع الحالي' },
    { key: 'meter', label: 'العداد', sort: 'currentMeterReading' },
    { key: 'licenseExpiryDate', label: 'انتهاء الرخصة', sort: 'licenseExpiryDate' },
    { key: 'ownership', label: 'الملكية', sort: 'ownership' },
    { key: 'status', label: 'الحالة', sort: 'status' },
  ];

  list = new ListState<EquipmentListItem, Q>(q => this.api.get<PagedResult<EquipmentListItem>>('equipment', q), e => this.notify.error(e), { sort: 'code' } as any);

  async ngOnInit(): Promise<void> {
    this.list.load();
    const p = await this.api.get<PagedResult<ProjectListItem>>('projects', { pageSize: 500, sort: 'name' });
    this.projectOptions.set(p.items.map(x => ({ value: x.id, label: x.name })));
  }

  open(r: EquipmentListItem): void { this.router.navigate(['/equipment', r.id]); }
}
