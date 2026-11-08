import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { fmtDateTime } from '../../core/format';
import { USER_ROLE, options } from '../../core/labels';
import { UserDto, UserRole } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { applyServerErrors, clean, err } from '../../shared/forms';
import { Badge } from '../../shared/ui';
import { openDialog } from '../assignments/dialogs';

@Component({
  selector: 'app-users-tab',
  imports: [Badge],
  template: `
    <div class="card" style="padding:0">
      <div class="head">
        <div>
          <h3>المستخدمون</h3>
          <p class="muted small">مدير النظام: كل الصلاحيات بما فيها الإعدادات والنسخ الاحتياطي واعتماد الإضافي. مدخل البيانات: تسجيل العمليات اليومية.</p>
        </div>
        <span class="spacer"></span>
        <button class="btn primary" (click)="edit()"><span class="material-symbols-outlined">person_add</span>مستخدم جديد</button>
      </div>
      @if (loading()) {
        <div style="padding:16px"><div class="skeleton" style="height:160px"></div></div>
      } @else {
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>الاسم</th><th>اسم المستخدم</th><th>الصلاحية</th><th>الحالة</th><th>آخر دخول</th><th></th></tr></thead>
            <tbody>
              @for (u of users(); track u.id) {
                <tr>
                  <td><span class="cell-title">{{ u.displayName }}</span> @if (u.id === me()) { <span class="muted small">(أنت)</span> }</td>
                  <td dir="ltr" style="text-align:start">{{ u.username }}</td>
                  <td><app-badge [meta]="roles[u.role]" /></td>
                  <td>
                    @if (u.isActive) { <app-badge label="نشط" tone="success" /> } @else { <app-badge label="موقوف" /> }
                    @if (u.mustChangePassword) { <app-badge label="يجب تغيير كلمة المرور" tone="warning" /> }
                  </td>
                  <td class="num">{{ u.lastLoginAt ? dt(u.lastLoginAt) : '—' }}</td>
                  <td class="end"><button class="btn ghost sm" (click)="edit(u)"><span class="material-symbols-outlined">edit</span>تعديل</button></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: `
    .head { display: flex; align-items: center; gap: 12px; padding: 16px; border-bottom: 1px solid var(--border); }
    .head h3 { margin: 0; font-size: 15px; font-weight: 600; }
    .head p { margin: 2px 0 0; max-width: 640px; }
    app-badge + app-badge { margin-inline-start: 4px; }
  `,
})
export class UsersTab implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);
  private auth = inject(AuthService);
  roles = USER_ROLE;
  users = signal<UserDto[]>([]);
  loading = signal(false);
  me = () => this.auth.user()?.id;
  dt = fmtDateTime;

  ngOnInit(): void { this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    try { this.users.set(await this.api.get<UserDto[]>('users')); }
    catch (e) { this.notify.error(e); } finally { this.loading.set(false); }
  }

  async edit(user?: UserDto): Promise<void> {
    if (await openDialog(this.dialog, UserDialog, { user }, '520px')) this.load();
  }
}

@Component({
  selector: 'app-user-dialog',
  imports: [MatDialogModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule],
  template: `
    <div class="dialog-head"><span class="material-symbols-outlined">person</span><h2>{{ u ? 'تعديل مستخدم' : 'مستخدم جديد' }}</h2></div>
    <form [formGroup]="form" (ngSubmit)="save()">
      <div class="dialog-body">
        <div class="form-grid">
          <mat-form-field class="full"><mat-label>الاسم الظاهر</mat-label><input matInput formControlName="displayName" required /><mat-error>{{ e('displayName') }}</mat-error></mat-form-field>
          <mat-form-field><mat-label>اسم المستخدم</mat-label><input matInput formControlName="username" dir="ltr" required autocomplete="off" />
            <mat-hint>حروف إنجليزية صغيرة وأرقام</mat-hint><mat-error>{{ e('username') }}</mat-error></mat-form-field>
          <mat-form-field><mat-label>الصلاحية</mat-label>
            <mat-select formControlName="role">@for (r of roleOptions; track r.value) { <mat-option [value]="r.value">{{ r.label }}</mat-option> }</mat-select>
            <mat-error>{{ e('role') }}</mat-error>
          </mat-form-field>
          <mat-form-field class="full"><mat-label>{{ u ? 'كلمة مرور جديدة (اتركها فارغة للإبقاء)' : 'كلمة المرور المؤقتة' }}</mat-label>
            <input matInput type="password" formControlName="password" dir="ltr" autocomplete="new-password" [required]="!u" />
            <mat-hint>سيُطلب من المستخدم تغييرها عند أول دخول</mat-hint><mat-error>{{ e('password') }}</mat-error></mat-form-field>
          <div class="full"><mat-checkbox formControlName="isActive">الحساب نشط</mat-checkbox></div>
        </div>
      </div>
      <div class="dialog-foot">
        <button class="btn" type="button" mat-dialog-close>إلغاء</button>
        <button class="btn primary" type="submit" [disabled]="busy()">حفظ</button>
      </div>
    </form>
  `,
})
export class UserDialog {
  u = inject<{ user?: UserDto }>(MAT_DIALOG_DATA).user;
  private ref = inject(MatDialogRef<UserDialog>);
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  busy = signal(false);
  roleOptions = options(USER_ROLE);
  form = inject(FormBuilder).nonNullable.group({
    displayName: [this.u?.displayName ?? '', Validators.required],
    username: [this.u?.username ?? '', [Validators.required, Validators.pattern(/^[a-zA-Z0-9._-]{3,50}$/)]],
    role: [this.u?.role ?? 'DataEntry' as UserRole],
    password: ['', this.u ? [Validators.minLength(6)] : [Validators.required, Validators.minLength(6)]],
    isActive: [this.u?.isActive ?? true],
  });
  e = (k: string) => err(this.form.get(k));

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    try {
      const body = clean(this.form.getRawValue());
      if (this.u) await this.api.put(`users/${this.u.id}`, body);
      else await this.api.post('users', body);
      this.notify.success('تم حفظ المستخدم');
      this.ref.close(true);
    } catch (ex) {
      if (!applyServerErrors(this.form, ex)) this.notify.error(ex);
    } finally { this.busy.set(false); }
  }
}
