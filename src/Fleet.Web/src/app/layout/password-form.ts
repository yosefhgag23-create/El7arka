import { Component, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { NotifyService } from '../core/notify.service';
import { applyServerErrors, err } from '../shared/forms';

type Field = 'currentPassword' | 'newPassword' | 'confirm';

/** Change-password form shared by the forced first-login screen and the account page. */
@Component({
  selector: 'app-password-form',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="save()" class="pw">
      @for (f of fields; track f.key) {
        <mat-form-field>
          <mat-label>{{ f.label }}</mat-label>
          <input matInput [type]="shown()[f.key] ? 'text' : 'password'" [formControlName]="f.key" [autocomplete]="f.auto" />
          <button matSuffix type="button" class="btn ghost icon sm" tabindex="-1" (click)="toggle(f.key)"
                  [attr.aria-label]="shown()[f.key] ? 'إخفاء' : 'إظهار'">
            <span class="material-symbols-outlined">{{ shown()[f.key] ? 'visibility_off' : 'visibility' }}</span>
          </button>
          <mat-error>{{ e(f.key) }}</mat-error>
        </mat-form-field>
      }

      <ul class="rules">
        @for (r of rules(); track r.text) {
          <li [class.ok]="r.ok">
            <span class="material-symbols-outlined">{{ r.ok ? 'check_circle' : 'radio_button_unchecked' }}</span>
            {{ r.text }}
          </li>
        }
      </ul>

      <button class="btn primary submit" type="submit" [disabled]="busy() || !ready()">
        {{ busy() ? 'جارٍ الحفظ...' : submitLabel() }}
      </button>
    </form>
  `,
  styles: `
    .pw { display: flex; flex-direction: column; gap: 10px; }
    .rules { list-style: none; margin: 2px 0 16px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px;
      background: var(--subtle); border-radius: var(--radius); font-size: 12.5px; color: var(--muted); }
    .rules li { display: flex; align-items: center; gap: 8px; transition: color .15s; }
    .rules .material-symbols-outlined { font-size: 17px; color: var(--faint); }
    .rules li.ok { color: var(--text-2); }
    .rules li.ok .material-symbols-outlined { color: var(--success); font-variation-settings: 'FILL' 1; }
    .submit { width: 100%; height: 42px; font-size: 14px; }
  `,
})
export class PasswordForm {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private notify = inject(NotifyService);

  submitLabel = input('حفظ كلمة المرور');
  saved = output<void>();

  readonly fields: { key: Field; label: string; auto: string }[] = [
    { key: 'currentPassword', label: 'كلمة المرور الحالية', auto: 'current-password' },
    { key: 'newPassword', label: 'كلمة المرور الجديدة', auto: 'new-password' },
    { key: 'confirm', label: 'تأكيد كلمة المرور الجديدة', auto: 'new-password' },
  ];

  busy = signal(false);
  shown = signal<Partial<Record<Field, boolean>>>({});
  form = inject(FormBuilder).nonNullable.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirm: ['', Validators.required],
  });
  private value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  rules = computed(() => {
    const v = this.value();
    const next = v.newPassword ?? '';
    return [
      { text: '6 أحرف على الأقل', ok: next.length >= 6 },
      { text: 'مختلفة عن كلمة المرور الحالية', ok: !!next && next !== v.currentPassword },
      { text: 'مطابقة لحقل التأكيد', ok: !!next && next === v.confirm },
    ];
  });
  ready = computed(() => !!this.value().currentPassword && this.rules().every(r => r.ok));

  e = (k: string) => err(this.form.get(k));
  toggle(k: Field): void { this.shown.update(s => ({ ...s, [k]: !s[k] })); }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (!this.ready()) return;
    const v = this.form.getRawValue();
    this.busy.set(true);
    try {
      await this.api.post('auth/change-password', { currentPassword: v.currentPassword, newPassword: v.newPassword });
      const u = this.auth.user();
      if (u) this.auth.user.set({ ...u, mustChangePassword: false });
      this.notify.success('تم تغيير كلمة المرور');
      this.saved.emit();
    } catch (ex) {
      if (!applyServerErrors(this.form, ex)) this.notify.error(ex);
    } finally { this.busy.set(false); }
  }
}
