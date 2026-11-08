import { Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { NotifyService } from '../core/notify.service';
import { PageHeader } from '../shared/ui';
import { applyServerErrors, err } from '../shared/forms';

@Component({
  selector: 'app-account',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, PageHeader],
  template: `
    <div class="page">
      <app-page-header title="تغيير كلمة المرور" [crumbs]="[{ label: 'الحساب' }]" />
      @if (force()) {
        <div class="notice">لأمان النظام يجب تغيير كلمة المرور الافتراضية قبل المتابعة.</div>
      }
      <form class="card" style="max-width:520px" [formGroup]="form" (ngSubmit)="save()">
        <div class="card-body stack" style="gap:4px">
          <mat-form-field>
            <mat-label>كلمة المرور الحالية</mat-label>
            <input matInput type="password" formControlName="currentPassword" autocomplete="current-password" />
            <mat-error>{{ e('currentPassword') }}</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>كلمة المرور الجديدة</mat-label>
            <input matInput type="password" formControlName="newPassword" autocomplete="new-password" />
            <mat-hint>6 أحرف على الأقل</mat-hint>
            <mat-error>{{ e('newPassword') }}</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>تأكيد كلمة المرور</mat-label>
            <input matInput type="password" formControlName="confirm" autocomplete="new-password" />
            <mat-error>{{ e('confirm') }}</mat-error>
          </mat-form-field>
          <div class="form-actions">
            <button class="btn primary" type="submit" [disabled]="busy()">حفظ</button>
          </div>
        </div>
      </form>
    </div>
  `,
  styles: `.notice { background: var(--warning-bg); color: var(--warning); border: 1px solid #fde68a; padding: 12px 14px; border-radius: 8px; margin-bottom: 16px; max-width: 520px; }`,
})
export class Account {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private notify = inject(NotifyService);
  private router = inject(Router);
  force = input<string>();
  busy = signal(false);
  form = inject(FormBuilder).nonNullable.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirm: ['', Validators.required],
  });
  e = (k: string) => err(this.form.get(k));

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    const v = this.form.getRawValue();
    if (v.newPassword !== v.confirm) this.form.controls.confirm.setErrors({ server: 'كلمتا المرور غير متطابقتين' });
    if (this.form.invalid) return;
    this.busy.set(true);
    try {
      await this.api.post('auth/change-password', { currentPassword: v.currentPassword, newPassword: v.newPassword });
      const u = this.auth.user();
      if (u) this.auth.user.set({ ...u, mustChangePassword: false });
      this.notify.success('تم تغيير كلمة المرور');
      this.router.navigateByUrl('/');
    } catch (ex) {
      if (!applyServerErrors(this.form, ex)) this.notify.error(ex);
    } finally { this.busy.set(false); }
  }
}
