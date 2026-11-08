import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { ApiService } from '../../core/api.service';
import { fileSize, fmtDateTime } from '../../core/format';
import { LookupsService } from '../../core/lookups.service';
import { NotifyService } from '../../core/notify.service';
import { Badge, EmptyState, StatCard } from '../../shared/ui';
import { Tone } from '../../core/labels';

interface BackupInfo { fileName: string; createdAt: string; sizeBytes: number; kind: string; createdBy?: string; attachmentCount: number; appVersion?: string; note?: string; valid: boolean; }
interface BackupStatus { folder: string; isDefaultFolder: boolean; autoEnabled: boolean; retention: number; lastBackupAt?: string; lastAutoBackupAt?: string; count: number; totalBytes: number; dataFolder: string; }

const KIND: Record<string, { label: string; tone: Tone }> = {
  manual: { label: 'يدوية', tone: 'dark' },
  auto: { label: 'تلقائية', tone: 'info' },
  'pre-restore': { label: 'قبل الاسترجاع', tone: 'warning' },
  imported: { label: 'مستوردة', tone: '' },
  unknown: { label: 'غير صالحة', tone: 'danger' },
};

@Component({
  selector: 'app-backup-tab',
  imports: [FormsModule, MatCheckboxModule, StatCard, Badge, EmptyState],
  template: `
    <div class="stack">
      <div class="grid grid-4">
        <app-stat label="آخر نسخة احتياطية" icon="history" [value]="status()?.lastBackupAt ? dt(status()!.lastBackupAt!) : 'لا توجد'" [loading]="!status()"
          [tone]="stale() ? 'warning' : ''" [hint]="stale() ? 'مر أكثر من يومين على آخر نسخة' : ''" />
        <app-stat label="النسخ المحفوظة" icon="inventory_2" [value]="status()?.count ?? 0" [loading]="!status()" [hint]="size(status()?.totalBytes ?? 0)" />
        <app-stat label="النسخ التلقائي" icon="schedule" [value]="status()?.autoEnabled ? 'مفعّل يومياً' : 'متوقف'" [loading]="!status()"
          [tone]="status()?.autoEnabled ? 'success' : 'warning'" [hint]="'يحتفظ بآخر ' + (status()?.retention ?? 0) + ' نسخة تلقائية'" />
        <app-stat label="مجلد البيانات" icon="folder" [value]="'محلي'" [loading]="!status()" [hint]="status()?.dataFolder ?? ''" />
      </div>

      <div class="card">
        <h3 class="section">إنشاء نسخة احتياطية</h3>
        <p class="muted small">تشمل النسخة قاعدة البيانات كاملة وكل المرفقات (الصور والفواتير والشعار) في ملف واحد. يمكن إنشاؤها أثناء العمل.</p>
        <div class="row wrap">
          <input class="text" [(ngModel)]="note" placeholder="ملاحظة (اختياري) — مثال: قبل إقفال الشهر" />
          <button class="btn primary" [disabled]="creating()" (click)="create()">
            <span class="material-symbols-outlined">backup</span>{{ creating() ? 'جارٍ الإنشاء...' : 'إنشاء نسخة الآن' }}
          </button>
          <span class="spacer"></span>
          <button class="btn" [disabled]="importing()" (click)="file.click()">
            <span class="material-symbols-outlined">upload_file</span>{{ importing() ? 'جارٍ الرفع...' : 'استيراد ملف نسخة' }}
          </button>
          <input #file type="file" hidden accept=".zip,application/zip" (change)="importFile(file)" />
        </div>
      </div>

      <div class="card" style="padding:0">
        <div class="head"><h3>النسخ المحفوظة</h3><span class="spacer"></span><span class="muted small" dir="ltr">{{ status()?.folder }}</span></div>
        @if (loading()) {
          <div style="padding:16px"><div class="skeleton" style="height:160px"></div></div>
        } @else if (!backups().length) {
          <app-empty icon="cloud_off" title="لا توجد نسخ احتياطية" message="أنشئ أول نسخة الآن واحتفظ بنسخة منها على فلاشة أو قرص خارجي." />
        } @else {
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>التاريخ</th><th>النوع</th><th>بواسطة</th><th class="end">المرفقات</th><th class="end">الحجم</th><th>ملاحظة</th><th></th></tr></thead>
              <tbody>
                @for (b of backups(); track b.fileName) {
                  <tr>
                    <td><div class="cell-title num">{{ dt(b.createdAt) }}</div><div class="cell-sub" dir="ltr" style="text-align:start">{{ b.fileName }}</div></td>
                    <td><app-badge [label]="kind(b).label" [tone]="kind(b).tone" /></td>
                    <td>{{ b.createdBy || '—' }}</td>
                    <td class="end num">{{ b.attachmentCount }}</td>
                    <td class="end num">{{ size(b.sizeBytes) }}</td>
                    <td class="muted">{{ b.note || '—' }}</td>
                    <td class="end actions-cell">
                      <button class="btn ghost sm" (click)="download(b)" title="تنزيل"><span class="material-symbols-outlined">download</span></button>
                      <button class="btn ghost sm" [disabled]="!b.valid || restoring()" (click)="restore(b)" title="استرجاع"><span class="material-symbols-outlined">settings_backup_restore</span>استرجاع</button>
                      <button class="btn ghost sm" (click)="remove(b)" title="حذف"><span class="material-symbols-outlined">delete</span></button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>

      <div class="card">
        <h3 class="section">إعدادات النسخ التلقائي</h3>
        <div class="stack" style="gap:12px">
          <mat-checkbox [(ngModel)]="autoEnabled">إنشاء نسخة احتياطية تلقائياً كل يوم أثناء تشغيل البرنامج</mat-checkbox>
          <label class="f">عدد النسخ التلقائية المحفوظة
            <input class="text num-input" type="number" min="1" max="365" [(ngModel)]="retention" /></label>
          <label class="f">مجلد النسخ الاحتياطي (اتركه فارغاً للمجلد الافتراضي — يُفضّل قرص آخر أو مجلد متزامن)
            <input class="text" dir="ltr" [(ngModel)]="folder" placeholder="D:\\Backups\\El7arka" /></label>
          <div><button class="btn primary" [disabled]="saving()" (click)="saveSettings()">حفظ الإعدادات</button></div>
        </div>
      </div>
    </div>
  `,
  styles: `
    .section { font-size: 15px; font-weight: 600; margin: 0 0 4px; }
    .section + p { margin: 0 0 14px; }
    .head { display: flex; align-items: center; gap: 12px; padding: 16px; border-bottom: 1px solid var(--border); }
    .head h3 { margin: 0; font-size: 15px; font-weight: 600; }
    .text { height: 38px; border: 1px solid var(--border-strong); border-radius: 6px; padding: 0 10px; font: inherit; min-width: 320px; background: var(--surface); color: var(--text); }
    .num-input { min-width: 0; width: 120px; }
    .f { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--muted); max-width: 560px; }
    .actions-cell { white-space: nowrap; }
  `,
})
export class BackupTab implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private lookups = inject(LookupsService);

  status = signal<BackupStatus | null>(null);
  backups = signal<BackupInfo[]>([]);
  loading = signal(false);
  creating = signal(false);
  importing = signal(false);
  restoring = signal(false);
  saving = signal(false);
  note = '';
  autoEnabled = this.lookups.settings()?.autoBackupEnabled ?? true;
  retention = this.lookups.settings()?.autoBackupRetention ?? 14;
  folder = this.lookups.settings()?.backupFolder ?? '';

  dt = fmtDateTime;
  size = fileSize;
  kind = (b: BackupInfo) => KIND[b.valid ? b.kind : 'unknown'] ?? KIND['unknown'];
  stale = () => {
    const last = this.status()?.lastBackupAt;
    return !!this.status() && (!last || Date.now() - new Date(last).getTime() > 2 * 24 * 3600 * 1000);
  };

  ngOnInit(): void { this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [status, list] = await Promise.all([this.api.get<BackupStatus>('backups/status'), this.api.get<BackupInfo[]>('backups')]);
      this.status.set(status);
      this.backups.set(list);
    } catch (e) { this.notify.error(e); } finally { this.loading.set(false); }
  }

  async create(): Promise<void> {
    this.creating.set(true);
    try {
      const b = await this.api.post<BackupInfo>('backups', { note: this.note || null });
      this.note = '';
      this.notify.success(`تم إنشاء النسخة (${fileSize(b.sizeBytes)})`);
      this.load();
    } catch (e) { this.notify.error(e); } finally { this.creating.set(false); }
  }

  async importFile(input: HTMLInputElement): Promise<void> {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    this.importing.set(true);
    try {
      await this.api.upload<BackupInfo>('backups/import', f);
      this.notify.success('تم استيراد ملف النسخة — يمكنك الآن استرجاعه من القائمة');
      this.load();
    } catch (e) { this.notify.error(e); } finally { this.importing.set(false); }
  }

  async download(b: BackupInfo): Promise<void> {
    try { await this.api.download(`backups/${encodeURIComponent(b.fileName)}`); }
    catch (e) { this.notify.error(e); }
  }

  async restore(b: BackupInfo): Promise<void> {
    const ok = await this.notify.confirm({
      title: 'استرجاع النسخة الاحتياطية؟',
      message: `سيتم استبدال كل البيانات الحالية ببيانات النسخة المؤرخة ${fmtDateTime(b.createdAt)}. سيُحفظ تلقائياً نسخة من الوضع الحالي قبل الاسترجاع، وسيتم تسجيل خروجك بعد الانتهاء.`,
      confirmText: 'استرجاع', danger: true,
    });
    if (!ok) return;
    this.restoring.set(true);
    try {
      await this.api.post(`backups/${encodeURIComponent(b.fileName)}/restore`);
      this.notify.success('تم الاسترجاع بنجاح — سجّل الدخول مرة أخرى');
      setTimeout(() => window.location.assign('/login'), 1200);
    } catch (e) { this.notify.error(e); this.restoring.set(false); }
  }

  async remove(b: BackupInfo): Promise<void> {
    const ok = await this.notify.confirm({ title: 'حذف النسخة؟', message: `سيتم حذف الملف ${b.fileName} نهائياً.`, confirmText: 'حذف', danger: true });
    if (!ok) return;
    try { await this.api.delete(`backups/${encodeURIComponent(b.fileName)}`); this.notify.success('تم حذف النسخة'); this.load(); }
    catch (e) { this.notify.error(e); }
  }

  async saveSettings(): Promise<void> {
    const current = this.lookups.settings();
    if (!current) return;
    this.saving.set(true);
    try {
      await this.api.put('settings', { ...current, autoBackupEnabled: this.autoEnabled, autoBackupRetention: Number(this.retention), backupFolder: this.folder.trim() || null });
      await this.lookups.refresh();
      this.notify.success('تم حفظ إعدادات النسخ الاحتياطي');
      this.load();
    } catch (e) { this.notify.error(e); } finally { this.saving.set(false); }
  }
}
