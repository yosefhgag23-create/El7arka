import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { ApiService } from '../../core/api.service';
import { DatePipe, todayIso } from '../../core/format';
import { EMPLOYMENT_STATUS, options } from '../../core/labels';
import { LookupsService } from '../../core/lookups.service';
import { DriverListItem, EmploymentStatus, PagedResult } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { CellDef, Column, DataTable, ListState } from '../../shared/data-table';
import { FilterSelect, SearchBox } from '../../shared/fields';
import { Badge, PageHeader } from '../../shared/ui';

@Component({
  selector: 'app-driver-list',
  imports: [PageHeader, DataTable, CellDef, SearchBox, FilterSelect, Badge, RouterLink, MatCheckboxModule, DatePipe],
  template: `
    <div class="page">
      <app-page-header title="السائقون" subtitle="بيانات السائقين والرخص والمعدات المعيّنة" [crumbs]="[{ label: 'السائقون' }]">
        <a class="btn primary" routerLink="/drivers/new"><span class="material-symbols-outlined">add</span>سائق جديد</a>
      </app-page-header>
      <div class="card">
        <div class="filters">
          <app-search placeholder="بحث بالاسم أو الهاتف أو الرقم القومي" (search)="list.patch({ search: $event })" />
          <app-filter-select placeholder="كل الحالات" [options]="statusOptions" [value]="list.query().employmentStatus" (valueChange)="list.patch({ employmentStatus: $event })" />
          <mat-checkbox [checked]="!!list.query().licenseExpiring" (change)="list.patch({ licenseExpiring: $event.checked || null })">رخص منتهية أو قاربت</mat-checkbox>
          <mat-checkbox [checked]="!!list.query().includeInactive" (change)="list.patch({ includeInactive: $event.checked || null })">إظهار غير النشطين</mat-checkbox>
        </div>
        <app-data-table [columns]="cols" [rows]="list.rows()" [total]="list.total()" [loading]="list.loading()"
          [page]="list.query().page" [pageSize]="list.query().pageSize" [sort]="list.query().sort" [clickable]="true"
          emptyIcon="badge" emptyTitle="لا يوجد سائقون"
          (pageChange)="list.setPage($event)" (pageSizeChange)="list.setPageSize($event)" (sortChange)="list.setSort($event)" (rowClick)="open($event)">
          <ng-template appCell="fullName" let-r>
            <div class="row" style="gap:10px">
              @if (r.photoId) { <img class="thumb" style="border-radius:50%" [src]="img(r.photoId)" alt="" loading="lazy" /> }
              @else { <span class="thumb" style="border-radius:50%"><span class="material-symbols-outlined">person</span></span> }
              <div><div class="cell-title">{{ r.fullName }}</div><div class="cell-sub num">{{ r.phone }}</div></div>
              @if (!r.isActive) { <app-badge label="غير نشط" /> }
            </div>
          </ng-template>
          <ng-template appCell="license" let-r>
            <div class="num">{{ r.licenseNumber || '—' }}</div><div class="cell-sub">{{ r.licenseTypeName }}</div>
          </ng-template>
          <ng-template appCell="licenseExpiryDate" let-r>
            @if (r.licenseExpiryDate) {
              <span class="num" [class.text-danger]="r.licenseExpiryDate < today">{{ r.licenseExpiryDate | d }}</span>
              @if (r.licenseExpiryDate < today) { <app-badge label="منتهية" tone="danger" /> }
            } @else { <span class="muted">—</span> }
          </ng-template>
          <ng-template appCell="currentEquipment" let-r>
            @if (r.activeAssignments) { <span>{{ r.currentEquipment }}</span> @if (r.activeAssignments > 1) { <span class="muted small"> +{{ r.activeAssignments - 1 }}</span> } }
            @else { <span class="muted">—</span> }
          </ng-template>
          <ng-template appCell="employmentStatus" let-r><app-badge [meta]="$any(statusMeta)[r.employmentStatus]" /></ng-template>
        </app-data-table>
      </div>
    </div>
  `,
})
export class DriverList implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private notify = inject(NotifyService);
  statusMeta = EMPLOYMENT_STATUS;
  statusOptions = options(EMPLOYMENT_STATUS);
  today = todayIso();
  img = (id: number) => ApiService.attachmentUrl(id);

  cols: Column<DriverListItem>[] = [
    { key: 'fullName', label: 'السائق', sort: 'fullName' },
    { key: 'nationalId', label: 'الرقم القومي' },
    { key: 'license', label: 'الرخصة' },
    { key: 'licenseExpiryDate', label: 'انتهاء الرخصة', sort: 'licenseExpiryDate' },
    { key: 'currentEquipment', label: 'المعدة الحالية' },
    { key: 'employmentStatus', label: 'الحالة', sort: 'employmentStatus' },
  ];

  list = new ListState<DriverListItem, { employmentStatus?: EmploymentStatus | null; licenseExpiring?: boolean | null; includeInactive?: boolean | null }>(
    q => this.api.get<PagedResult<DriverListItem>>('drivers', q), e => this.notify.error(e), { sort: 'fullName' } as any);

  ngOnInit(): void { this.list.load(); }
  open(r: DriverListItem): void { this.router.navigate(['/drivers', r.id]); }
}
