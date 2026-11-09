import { Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../core/auth.service';
import { problemOf } from '../core/notify.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule],
  template: `
    <div class="wrap">
      <form class="card" [formGroup]="form" (ngSubmit)="submit()">
        <img class="logo" src="brand/logo.png" alt="Tameer Facility Management" />
        <h1>تسجيل الدخول</h1>
        <p class="muted">نظام إدارة حركة المعدات والمشروعات والسائقين</p>
        <mat-form-field>
          <mat-label>اسم المستخدم</mat-label>
          <input matInput formControlName="username" autocomplete="username" autofocus />
        </mat-form-field>
        <mat-form-field>
          <mat-label>كلمة المرور</mat-label>
          <input matInput formControlName="password" [type]="show() ? 'text' : 'password'" autocomplete="current-password" />
          <button matSuffix type="button" class="btn ghost icon sm" (click)="show.set(!show())">
            <span class="material-symbols-outlined">{{ show() ? 'visibility_off' : 'visibility' }}</span>
          </button>
        </mat-form-field>
        @if (error()) { <div class="error">{{ error() }}</div> }
        <button class="btn primary full" type="submit" [disabled]="busy() || form.invalid">{{ busy() ? 'جارٍ الدخول...' : 'دخول' }}</button>
      </form>
    </div>
  `,
  styles: `
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: var(--bg); }
    .card { width: 380px; max-width: 100%; padding: 32px; display: flex; flex-direction: column; gap: 12px; border-top: 3px solid var(--brand); }
    .logo { width: 170px; height: 170px; object-fit: contain; align-self: center; margin: -8px 0 4px; }
    h1 { font-size: 20px; margin-top: 8px; border-top: 1px solid var(--border); padding-top: 16px; }
    p { margin: 0 0 12px; font-size: 13px; }
    .error { background: var(--danger-bg); color: var(--danger); padding: 10px 12px; border-radius: 6px; font-size: 13px; }
    .full { width: 100%; height: 40px; justify-content: center; margin-top: 4px; }
  `,
})
export class Login {
  private auth = inject(AuthService);
  private router = inject(Router);
  returnUrl = input<string>();
  show = signal(false);
  busy = signal(false);
  error = signal<string | null>(null);
  form = inject(FormBuilder).nonNullable.group({ username: ['', Validators.required], password: ['', Validators.required] });

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const { username, password } = this.form.getRawValue();
      const user = await this.auth.login(username, password);
      this.router.navigateByUrl(user.mustChangePassword ? '/change-password' : this.returnUrl() || '/');
    } catch (e) {
      this.error.set(problemOf(e).title ?? 'تعذر تسجيل الدخول');
    } finally { this.busy.set(false); }
  }
}
