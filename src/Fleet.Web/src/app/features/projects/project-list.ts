import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { PROJECT_STATUS, options } from '../../core/labels';
import { PagedResult, ProjectListItem, ProjectStatus } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { CellDef, Column, DataTable, ListState } from '../../shared/data-table';
import { FilterSelect, SearchBox } from '../../shared/fields';
import { Badge, PageHeader } from '../../shared/ui';

@Component({
  selector: 'app-project-list',
  imports: [PageHeader, DataTable, CellDef, SearchBox, FilterSelect, Badge, RouterLink],
  template: `
    <div class="page">
      <app-page-header title="المشروعات" subtitle="مواقع العمل والمعدات المخصصة لكل مشروع" [crumbs]="[{ label: 'المشروعات' }]">
        <a class="btn primary" routerLink="/projects/new"><span class="material-symbols-outlined">add</span>مشروع جديد</a>
      </app-page-header>
      <div class="card">
        <div class="filters">
          <app-search placeholder="بحث بالاسم أو الكود أو الموقع" (search)="list.patch({ search: $event })" />
          <app-filter-select placeholder="كل الحالات (عدا المؤرشفة)" [options]="statusOptions" [value]="list.query().status" (valueChange)="list.patch({ status: $event })" />
        </div>
        <app-data-table [columns]="cols" [rows]="list.rows()" [total]="list.total()" [loading]="list.loading()"
          [page]="list.query().page" [pageSize]="list.query().pageSize" [sort]="list.query().sort" [clickable]="true"
          emptyIcon="domain" emptyTitle="لا توجد مشروعات" emptyMessage="ابدأ بإضافة أول مشروع لتتمكن من تخصيص المعدات له."
          (pageChange)="list.setPage($event)" (pageSizeChange)="list.setPageSize($event)" (sortChange)="list.setSort($event)"
          (rowClick)="open($event)">
          <ng-template appCell="name" let-r>
            <div class="cell-title">{{ r.name }}</div><div class="cell-sub num">{{ r.code }}</div>
          </ng-template>
          <ng-template appCell="status" let-r><app-badge [meta]="$any(statusMeta)[r.status]" /></ng-template>
        </app-data-table>
      </div>
    </div>
  `,
})
export class ProjectList implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private notify = inject(NotifyService);
  statusMeta = PROJECT_STATUS;
  statusOptions = options(PROJECT_STATUS);

  cols: Column<ProjectListItem>[] = [
    { key: 'name', label: 'المشروع', sort: 'name' },
    { key: 'location', label: 'الموقع', sort: 'location' },
    { key: 'startDate', label: 'تاريخ البدء', sort: 'startDate', type: 'date' },
    { key: 'endDate', label: 'تاريخ الانتهاء', sort: 'endDate', type: 'date' },
    { key: 'activeEquipmentCount', label: 'المعدات الحالية', type: 'int' },
    { key: 'status', label: 'الحالة', sort: 'status' },
  ];

  list = new ListState<ProjectListItem, { status?: ProjectStatus | null }>(
    q => this.api.get<PagedResult<ProjectListItem>>('projects', q), e => this.notify.error(e));

  ngOnInit(): void { this.list.load(); }
  open(r: ProjectListItem): void { this.router.navigate(['/projects', r.id]); }
}
