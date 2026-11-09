import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { PasswordForm } from './password-form';

/** First-login screen: the user must replace the default password before using the system. */
@Component({
  selector: 'app-force-password',
  imports: [PasswordForm],
  template: `
    <div class="wrap">
      <div class="card">
        <div class="mark"><span class="material-symbols-outlined">lock_reset</span></div>
        <h1>تعيين كلمة مرور جديدة</h1>
        <p class="muted">
          أهلاً {{ auth.user()?.displayName }}، هذا أول دخول لك. لحماية بيانات النظام اختر كلمة مرور جديدة بدلاً من الكلمة الافتراضية.
        </p>
        <app-password-form submitLabel="حفظ والمتابعة" (saved)="router.navigateByUrl('/')" />
        <button type="button" class="logout" (click)="auth.logout()">
          <span class="material-symbols-outlined">logout</span> تسجيل الخروج
        </button>
      </div>
    </div>
  `,
  styles: `
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: var(--bg); }
    .card { width: 420px; max-width: 100%; padding: 32px; border-top: 3px solid var(--brand); }
    .mark { width: 44px; height: 44px; border-radius: 10px; background: var(--brand-soft); color: var(--brand);
      border: 1px solid var(--brand-border); display: grid; place-items: center; }
    .mark .material-symbols-outlined { font-size: 24px; }
    h1 { font-size: 20px; margin-top: 16px; }
    p { margin: 6px 0 20px; font-size: 13px; line-height: 1.8; }
    .logout { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; margin-top: 12px;
      border: 0; background: none; color: var(--muted); font: 500 13px var(--font); cursor: pointer; padding: 6px; }
    .logout:hover { color: var(--text); }
    .logout .material-symbols-outlined { font-size: 18px; }
  `,
})
export class ForcePassword {
  auth = inject(AuthService);
  router = inject(Router);
}
