import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ApiService } from '../../core/api.service';
import { todayIso } from '../../core/format';
import { PROJECT_STATUS, options } from '../../core/labels';
import { ProjectDto, ProjectStatus } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { DateField } from '../../shared/fields';
import { applyServerErrors, clean, err } from '../../shared/forms';
import { PageHeader } from '../../shared/ui';

@Component({
  selector: 'app-project-form',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, DateField, PageHeader, RouterLink],
  template: `
    <div class="page form-page">
      <app-page-header [title]="id() ? 'تعديل مشروع' : 'مشروع جديد'"
        [crumbs]="[{ label: 'المشروعات', link: '/projects' }, { label: id() ? 'تعديل' : 'جديد' }]" />
      <form class="card" [formGroup]="form" (ngSubmit)="save()">
        <div class="card-body">
          <div class="form-grid">
            <mat-form-field>
              <mat-label>كود المشروع</mat-label>
              <input matInput formControlName="code" required />
              <mat-error>{{ e('code') }}</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>اسم المشروع</mat-label>
              <input matInput formControlName="name" required />
              <mat-error>{{ e('name') }}</mat-error>
            </mat-form-field>
            <mat-form-field class="full">
              <mat-label>الموقع</mat-label>
              <input matInput formControlName="location" />
              <mat-error>{{ e('location') }}</mat-error>
            </mat-form-field>
            <app-date-field label="تاريخ البدء" formControlName="startDate" required [error]="e('startDate')" />
            <app-date-field label="تاريخ الانتهاء (اختياري)" formControlName="endDate" [error]="e('endDate')" />
            <mat-form-field>
              <mat-label>الحالة</mat-label>
              <mat-select formControlName="status">
                @for (o of statusOptions; track o.value) { <mat-option [value]="o.value">{{ o.label }}</mat-option> }
              </mat-select>
              <mat-error>{{ e('status') }}</mat-error>
            </mat-form-field>
            <div></div>
            <mat-form-field class="full">
              <mat-label>الوصف</mat-label>
              <textarea matInput formControlName="description" rows="3"></textarea>
            </mat-form-field>
            <mat-form-field class="full">
              <mat-label>ملاحظات</mat-label>
              <textarea matInput formControlName="notes" rows="2"></textarea>
            </mat-form-field>
          </div>
          <div class="form-actions">
            <a class="btn" [routerLink]="id() ? ['/projects', id()] : '/projects'">إلغاء</a>
            <button class="btn primary" type="submit" [disabled]="busy()">حفظ</button>
          </div>
        </div>
      </form>
    </div>
  `,
})
export class ProjectForm implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private router = inject(Router);
  id = input<string>();
  busy = signal(false);
  statusOptions = options(PROJECT_STATUS).filter(o => o.value !== 'Archived');

  form = inject(FormBuilder).group({
    code: ['', [Validators.required, Validators.maxLength(50)]],
    name: ['', [Validators.required, Validators.maxLength(200)]],
    location: [''],
    startDate: [todayIso() as string | null, Validators.required],
    endDate: [null as string | null],
    status: ['Active' as ProjectStatus],
    description: [''],
    notes: [''],
  });
  e = (k: string) => err(this.form.get(k));

  async ngOnInit(): Promise<void> {
    if (!this.id()) return;
    const p = await this.api.get<ProjectDto>(`projects/${this.id()}`);
    if (p.status === 'Archived') this.statusOptions = options(PROJECT_STATUS);
    this.form.patchValue({ ...p, location: p.location ?? '', description: p.description ?? '', notes: p.notes ?? '', endDate: p.endDate ?? null });
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    try {
      const body = clean(this.form.getRawValue());
      let id = Number(this.id());
      if (id) await this.api.put(`projects/${id}`, body);
      else id = (await this.api.post<{ id: number }>('projects', body)).id;
      this.notify.success('تم حفظ المشروع');
      this.router.navigate(['/projects', id]);
    } catch (ex) {
      if (!applyServerErrors(this.form, ex)) this.notify.error(ex);
    } finally { this.busy.set(false); }
  }
}
