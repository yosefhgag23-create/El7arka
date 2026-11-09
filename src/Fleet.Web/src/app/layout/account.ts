import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { USER_ROLE } from '../core/labels';
import { PageHeader } from '../shared/ui';
import { PasswordForm } from './password-form';

@Component({
  selector: 'app-account',
  imports: [PageHeader, PasswordForm],
  template: `
    <div class="page form-page narrow">
      <app-page-header title="تغيير كلمة المرور" [crumbs]="[{ label: 'الحساب' }]" />
      <div class="card">
        <div class="who">
          <span class="avatar">{{ initial() }}</span>
          <div>
            <strong>{{ auth.user()?.displayName }}</strong>
            <div class="muted small">{{ auth.user()?.username }} · {{ role() }}</div>
          </div>
        </div>
        <div class="card-body">
          <app-password-form (saved)="router.navigateByUrl('/')" />
        </div>
      </div>
    </div>
  `,
  styles: `
    .who { display: flex; align-items: center; gap: 12px; padding: 16px 18px; border-bottom: 1px solid var(--border); }
    .avatar { width: 40px; height: 40px; border-radius: 50%; background: var(--brand-soft); color: var(--brand-strong);
      border: 1px solid var(--brand-border); display: grid; place-items: center; font-weight: 600; font-size: 16px; }
  `,
})
export class Account {
  auth = inject(AuthService);
  router = inject(Router);
  initial = computed(() => (this.auth.user()?.displayName ?? '?').trim().charAt(0));
  role = computed(() => { const r = this.auth.user()?.role; return r ? USER_ROLE[r].label : ''; });
}
