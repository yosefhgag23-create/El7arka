import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { fmtMoney } from '../../core/format';
import { EQUIPMENT_STATUS } from '../../core/labels';
import { LookupsService } from '../../core/lookups.service';
import { CompanySettings, StatusLabelDto } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { applyServerErrors, clean, err } from '../../shared/forms';
import { PageHeader } from '../../shared/ui';
import { BackupTab } from './backup-tab';
import { LookupsTab } from './lookups-tab';
import { UsersTab } from './users-tab';

type Tab = 'company' | 'general' | 'lookups' | 'statuses' | 'users' | 'backup';

@Component({
  selector: 'app-settings-page',
  imports: [PageHeader, ReactiveFormsModule, FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule, LookupsTab, UsersTab, BackupTab],
  template: `
    <div class="page">
      <app-page-header title="الإعدادات" subtitle="بيانات الشركة والقوائم والمستخدمين والنسخ الاحتياطي" [crumbs]="[{ label: 'الإعدادات' }]" />
      <div class="tabs" style="margin-bottom:16px">
        @for (t of tabs; track t.key) {
          <button [class.active]="active() === t.key" (click)="go(t.key)">{{ t.label }}</button>
        }
      </div>

      @switch (active()) {
        @case ('company') {
          <div class="grid settings-grid">
            <form class="card" [formGroup]="form" (ngSubmit)="save()">
              <h3 class="section">بيانات الشركة</h3>
              <p class="muted small">تظهر في رأس التقارير المصدّرة وفي القائمة الجانبية.</p>
              <div class="form-grid">
                <mat-form-field class="full"><mat-label>اسم الشركة</mat-label><input matInput formControlName="companyName" required /><mat-error>{{ e('companyName') }}</mat-error></mat-form-field>
                <mat-form-field class="full"><mat-label>العنوان</mat-label><input matInput formControlName="address" /></mat-form-field>
                <mat-form-field><mat-label>الهاتف</mat-label><input matInput formControlName="phone" dir="ltr" /></mat-form-field>
                <mat-form-field><mat-label>البريد الإلكتروني</mat-label><input matInput formControlName="email" dir="ltr" /><mat-error>{{ e('email') }}</mat-error></mat-form-field>
                <mat-form-field><mat-label>الرقم الضريبي</mat-label><input matInput formControlName="taxNumber" /></mat-form-field>
              </div>
              <div class="foot"><button class="btn primary" type="submit" [disabled]="busy()">حفظ</button></div>
            </form>
            <div class="card logo-card">
              <h3 class="section">الشعار</h3>
              <div class="logo-box">
                @if (logoUrl(); as url) { <img [src]="url" alt="الشعار" /> } @else { <span class="material-symbols-outlined">image</span><span class="muted small">لا يوجد شعار</span> }
              </div>
              <button class="btn" type="button" [disabled]="uploading()" (click)="file.click()">
                <span class="material-symbols-outlined">upload</span>{{ uploading() ? 'جارٍ الرفع...' : 'رفع شعار' }}
              </button>
              <input #file type="file" hidden accept="image/png,image/jpeg,image/webp" (change)="uploadLogo(file)" />
              <p class="muted small">PNG أو JPG بخلفية شفافة أو بيضاء.</p>
            </div>
          </div>
        }

        @case ('general') {
          <form class="card" [formGroup]="form" (ngSubmit)="save()">
            <h3 class="section">العملة والتنسيق</h3>
            <div class="form-grid cols-3">
              <mat-form-field><mat-label>رمز العملة (ISO)</mat-label><input matInput formControlName="currency" dir="ltr" /><mat-error>{{ e('currency') }}</mat-error></mat-form-field>
              <mat-form-field><mat-label>رمز العرض</mat-label><input matInput formControlName="currencySymbol" /><mat-error>{{ e('currencySymbol') }}</mat-error></mat-form-field>
              <mat-form-field><mat-label>صيغة التاريخ</mat-label>
                <mat-select formControlName="dateFormat">
                  <mat-option value="dd/MM/yyyy">dd/MM/yyyy</mat-option>
                  <mat-option value="yyyy-MM-dd">yyyy-MM-dd</mat-option>
                  <mat-option value="MM/dd/yyyy">MM/dd/yyyy</mat-option>
                </mat-select>
              </mat-form-field>
            </div>

            <h3 class="section">التشغيل والتنبيهات</h3>
            <div class="form-grid cols-3">
              <mat-form-field><mat-label>ساعات العمل اليومية الافتراضية</mat-label><input matInput type="number" formControlName="defaultWorkingHours" /><mat-error>{{ e('defaultWorkingHours') }}</mat-error></mat-form-field>
              <mat-form-field><mat-label>حد انحراف استهلاك الوقود %</mat-label><input matInput type="number" formControlName="fuelAnomalyThresholdPercent" />
                <mat-hint>تنبيه عند ابتعاد الاستهلاك عن متوسط المعدة بهذه النسبة</mat-hint><mat-error>{{ e('fuelAnomalyThresholdPercent') }}</mat-error></mat-form-field>
              <mat-form-field><mat-label>تنبيه انتهاء الرخص (أيام)</mat-label><input matInput type="number" formControlName="licenseExpiryWarningDays" /><mat-error>{{ e('licenseExpiryWarningDays') }}</mat-error></mat-form-field>
              <mat-form-field><mat-label>الصيانة قريبة خلال (أيام)</mat-label><input matInput type="number" formControlName="maintenanceDueSoonDays" /><mat-error>{{ e('maintenanceDueSoonDays') }}</mat-error></mat-form-field>
              <mat-form-field><mat-label>الصيانة قريبة خلال (كم)</mat-label><input matInput type="number" formControlName="maintenanceDueSoonKm" /><mat-error>{{ e('maintenanceDueSoonKm') }}</mat-error></mat-form-field>
              <mat-form-field><mat-label>الصيانة قريبة خلال (ساعة تشغيل)</mat-label><input matInput type="number" formControlName="maintenanceDueSoonHours" /><mat-error>{{ e('maintenanceDueSoonHours') }}</mat-error></mat-form-field>
            </div>
            <div class="stack" style="gap:6px;margin-top:8px">
              <mat-checkbox formControlName="autoAssignSetsOperating">عند تخصيص معدة لمشروع تتحول حالتها تلقائياً إلى "تعمل"</mat-checkbox>
              <mat-checkbox formControlName="rentalAccrueCurrentMonth">احتساب إيجار الشهر الحالي حتى اليوم (وليس فقط الشهور المكتملة)</mat-checkbox>
            </div>
            <div class="foot">
              <button class="btn" type="button" [disabled]="accruing()" (click)="runAccruals()">
                <span class="material-symbols-outlined">autorenew</span>{{ accruing() ? 'جارٍ الاحتساب...' : 'احتساب قيود الإيجار الآن' }}
              </button>
              <span class="spacer"></span>
              <button class="btn primary" type="submit" [disabled]="busy()">حفظ</button>
            </div>
          </form>
        }

        @case ('lookups') { <app-lookups-tab /> }

        @case ('statuses') {
          <div class="card">
            <h3 class="section">مسميات وألوان حالات المعدات</h3>
            <p class="muted small">الحالات نفسها ثابتة لأنها تدخل في حساب التشغيل والتوقف، ويمكن تعديل الاسم المعروض واللون.</p>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>الحالة</th><th>الاسم بالعربية</th><th>الاسم بالإنجليزية</th><th>اللون</th><th>معاينة</th><th></th></tr></thead>
                <tbody>
                  @for (s of statuses(); track s.status) {
                    <tr>
                      <td class="muted">{{ statusMeta[s.status].label }}</td>
                      <td><input class="cell-input" [(ngModel)]="s.nameAr" /></td>
                      <td><input class="cell-input" dir="ltr" [(ngModel)]="s.nameEn" /></td>
                      <td><input type="color" [(ngModel)]="s.color" /></td>
                      <td><span class="badge" [style.color]="s.color" [style.border-color]="s.color"><span class="dot"></span>{{ s.nameAr }}</span></td>
                      <td class="end"><button class="btn sm" (click)="saveStatus(s)">حفظ</button></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }

        @case ('users') { <app-users-tab /> }
        @case ('backup') { <app-backup-tab /> }
      }
    </div>
  `,
  styles: `
    .settings-grid { grid-template-columns: 1fr 300px; align-items: start; }
    @media (max-width: 1000px) { .settings-grid { grid-template-columns: 1fr; } }
    .section { font-size: 15px; font-weight: 600; margin: 4px 0 4px; }
    .section + p { margin: 0 0 14px; }
    form .section:not(:first-child) { margin-top: 20px; margin-bottom: 12px; }
    .foot { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; border-top: 1px solid var(--border); padding-top: 14px; }
    .logo-card { display: flex; flex-direction: column; gap: 12px; align-items: stretch; }
    .logo-box { height: 140px; border: 1px dashed var(--border-strong); border-radius: 8px; display: flex; flex-direction: column; gap: 4px;
      align-items: center; justify-content: center; background: var(--subtle); color: var(--faint); }
    .logo-box img { max-height: 120px; max-width: 90%; object-fit: contain; }
    .cell-input { height: 32px; border: 1px solid var(--border-strong); border-radius: 6px; padding: 0 8px; font: inherit; width: 100%; min-width: 120px; }
    input[type=color] { width: 44px; height: 30px; border: 1px solid var(--border-strong); border-radius: 6px; padding: 2px; background: var(--surface); }
  `,
})
export class SettingsPage {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private lookups = inject(LookupsService);
  private router = inject(Router);

  tab = input<Tab>();
  active = signal<Tab>('company');
  tabs: { key: Tab; label: string }[] = [
    { key: 'company', label: 'بيانات الشركة' },
    { key: 'general', label: 'إعدادات عامة' },
    { key: 'lookups', label: 'القوائم' },
    { key: 'statuses', label: 'حالات المعدات' },
    { key: 'users', label: 'المستخدمون' },
    { key: 'backup', label: 'النسخ الاحتياطي' },
  ];
  statusMeta = EQUIPMENT_STATUS;

  busy = signal(false);
  uploading = signal(false);
  accruing = signal(false);
  logoUrl = signal<string | null>(null);
  statuses = signal<StatusLabelDto[]>([]);

  form = inject(FormBuilder).nonNullable.group({
    companyName: ['', [Validators.required, Validators.maxLength(200)]],
    address: [''], phone: [''], email: ['', Validators.email], taxNumber: [''],
    currency: ['EGP', Validators.required], currencySymbol: ['ج.م', Validators.required], dateFormat: ['dd/MM/yyyy'],
    defaultWorkingHours: [8, [Validators.required, Validators.min(1), Validators.max(24)]],
    fuelAnomalyThresholdPercent: [25, [Validators.required, Validators.min(1), Validators.max(500)]],
    maintenanceDueSoonDays: [7, [Validators.required, Validators.min(0), Validators.max(365)]],
    maintenanceDueSoonKm: [500, [Validators.required, Validators.min(0)]],
    maintenanceDueSoonHours: [25, [Validators.required, Validators.min(0)]],
    licenseExpiryWarningDays: [30, [Validators.required, Validators.min(0), Validators.max(365)]],
    autoAssignSetsOperating: [true], rentalAccrueCurrentMonth: [true],
  });
  e = (k: string) => err(this.form.get(k));

  constructor() {
    effect(() => {
      const t = this.tab();
      untracked(() => this.active.set(t && this.tabs.some(x => x.key === t) ? t : 'company'));
    });
    this.fill(this.lookups.settings());
    this.api.get<StatusLabelDto[]>('settings/status-labels').then(s => this.statuses.set(s)).catch(e => this.notify.error(e));
  }

  go(t: Tab): void { this.router.navigate([], { queryParams: { tab: t }, replaceUrl: true }); }

  private fill(s: CompanySettings | null): void {
    if (!s) return;
    this.form.reset({
      companyName: s.companyName, address: s.address ?? '', phone: s.phone ?? '', email: s.email ?? '', taxNumber: s.taxNumber ?? '',
      currency: s.currency, currencySymbol: s.currencySymbol, dateFormat: s.dateFormat, defaultWorkingHours: s.defaultWorkingHours,
      fuelAnomalyThresholdPercent: s.fuelAnomalyThresholdPercent, maintenanceDueSoonDays: s.maintenanceDueSoonDays,
      maintenanceDueSoonKm: s.maintenanceDueSoonKm, maintenanceDueSoonHours: s.maintenanceDueSoonHours,
      licenseExpiryWarningDays: s.licenseExpiryWarningDays, autoAssignSetsOperating: s.autoAssignSetsOperating,
      rentalAccrueCurrentMonth: s.rentalAccrueCurrentMonth,
    });
    this.logoUrl.set(ApiService.attachmentUrl(s.logoAttachmentId));
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) { this.notify.error('راجع الحقول المطلوبة'); return; }
    const current = this.lookups.settings();
    if (!current) return;
    this.busy.set(true);
    try {
      await this.api.put('settings', { ...current, ...clean(this.form.getRawValue()) });
      await this.lookups.refresh();
      this.fill(this.lookups.settings());
      this.notify.success('تم حفظ الإعدادات');
    } catch (ex) {
      if (!applyServerErrors(this.form, ex)) this.notify.error(ex);
    } finally { this.busy.set(false); }
  }

  async uploadLogo(input: HTMLInputElement): Promise<void> {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { this.notify.error('حجم الشعار يجب ألا يتجاوز 5 ميجابايت'); return; }
    this.uploading.set(true);
    try {
      await this.api.upload('settings/logo', f);
      await this.lookups.refresh();
      this.fill(this.lookups.settings());
      this.notify.success('تم تحديث الشعار');
    } catch (ex) { this.notify.error(ex); } finally { this.uploading.set(false); }
  }

  async runAccruals(): Promise<void> {
    this.accruing.set(true);
    try {
      const r = await this.api.post<{ contractsProcessed: number; linesPosted: number; totalAmount: number; pendingUsage: unknown[] }>('settings/rental-accruals/run');
      let msg = r.linesPosted
        ? `تم ترحيل ${r.linesPosted} قيد إيجار بإجمالي ${fmtMoney(r.totalAmount)} ${this.lookups.currency()}`
        : 'قيود الإيجار محدثة — لا توجد قيود جديدة';
      if (r.pendingUsage.length) msg += ` • ${r.pendingUsage.length} عقد بالاستخدام يحتاج إدخال الكمية يدوياً`;
      this.notify.success(msg);
    } catch (ex) { this.notify.error(ex); } finally { this.accruing.set(false); }
  }

  async saveStatus(s: StatusLabelDto): Promise<void> {
    try {
      await this.api.put('settings/status-labels', { ...s, nameEn: s.nameEn || null });
      await this.lookups.refresh();
      this.notify.success('تم حفظ الحالة');
    } catch (ex) { this.notify.error(ex); }
  }
}
