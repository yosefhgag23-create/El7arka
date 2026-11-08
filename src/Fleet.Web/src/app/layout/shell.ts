import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../core/auth.service';
import { LookupsService } from '../core/lookups.service';
import { USER_ROLE } from '../core/labels';
import { ApiService } from '../core/api.service';

interface NavItem { path: string; label: string; icon: string; exact?: boolean; adminOnly?: boolean; }
interface NavGroup { title?: string; items: NavItem[]; }

const NAV: NavGroup[] = [
  { items: [{ path: '/', label: 'لوحة التحكم', icon: 'space_dashboard', exact: true }] },
  {
    title: 'الأصول والتشغيل',
    items: [
      { path: '/projects', label: 'المشروعات', icon: 'domain' },
      { path: '/equipment', label: 'المعدات', icon: 'local_shipping' },
      { path: '/drivers', label: 'السائقون', icon: 'badge' },
      { path: '/assignments', label: 'توزيع المعدات', icon: 'swap_horiz' },
    ],
  },
  {
    title: 'التكاليف',
    items: [
      { path: '/fuel', label: 'الوقود', icon: 'local_gas_station' },
      { path: '/maintenance', label: 'الصيانة', icon: 'build' },
      { path: '/expenses', label: 'مصروفات التشغيل', icon: 'receipt_long' },
      { path: '/overtime', label: 'الوقت الإضافي', icon: 'more_time' },
      { path: '/depreciation', label: 'الإهلاك', icon: 'trending_down' },
    ],
  },
  {
    title: 'التحليل والإدارة',
    items: [
      { path: '/reports', label: 'التقارير', icon: 'summarize' },
      { path: '/settings', label: 'الإعدادات', icon: 'settings', adminOnly: true },
    ],
  },
];

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatMenuModule, MatTooltipModule],
  template: `
    <aside class="sidebar" [class.collapsed]="collapsed()">
      <div class="brand">
        @if (logoUrl(); as logo) { <img [src]="logo" alt="" class="logo" /> }
        @else { <div class="mark">ح</div> }
        @if (!collapsed()) {
          <div class="brand-text">
            <strong>{{ companyName() }}</strong>
            <span>إدارة المعدات والمشروعات</span>
          </div>
        }
      </div>
      <nav>
        @for (g of nav(); track $index) {
          @if (g.title && !collapsed()) { <div class="group">{{ g.title }}</div> }
          @if (g.title && collapsed()) { <div class="divider"></div> }
          @for (i of g.items; track i.path) {
            <a [routerLink]="i.path" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: !!i.exact }"
               [matTooltip]="collapsed() ? i.label : ''" matTooltipPosition="left">
              <span class="material-symbols-outlined">{{ i.icon }}</span>
              @if (!collapsed()) { <span>{{ i.label }}</span> }
            </a>
          }
        }
      </nav>
      <button class="collapse" (click)="toggle()" [matTooltip]="collapsed() ? 'توسيع القائمة' : ''" matTooltipPosition="left">
        <span class="material-symbols-outlined">{{ collapsed() ? 'keyboard_double_arrow_left' : 'keyboard_double_arrow_right' }}</span>
        @if (!collapsed()) { <span>طي القائمة</span> }
      </button>
    </aside>

    <div class="main">
      <header class="topbar">
        <div class="quick">
          <a class="btn sm" routerLink="/fuel" [queryParams]="{ new: 1 }"><span class="material-symbols-outlined">add</span>تموين</a>
          <a class="btn sm" routerLink="/expenses" [queryParams]="{ new: 1 }"><span class="material-symbols-outlined">add</span>مصروف</a>
          <a class="btn sm" routerLink="/maintenance" [queryParams]="{ new: 1 }"><span class="material-symbols-outlined">add</span>صيانة</a>
        </div>
        <span class="spacer"></span>
        <span class="today muted small">{{ today }}</span>
        <button class="user" [matMenuTriggerFor]="menu">
          <span class="avatar">{{ initial() }}</span>
          <span class="who">
            <strong>{{ auth.user()?.displayName }}</strong>
            <span>{{ roleLabel() }}</span>
          </span>
          <span class="material-symbols-outlined">expand_more</span>
        </button>
        <mat-menu #menu xPosition="after">
          <button mat-menu-item routerLink="/account"><span class="material-symbols-outlined">key</span> تغيير كلمة المرور</button>
          <button mat-menu-item (click)="auth.logout()"><span class="material-symbols-outlined">logout</span> تسجيل الخروج</button>
        </mat-menu>
      </header>
      <main><router-outlet /></main>
    </div>
  `,
  styles: `
    :host { display: flex; height: 100vh; overflow: hidden; }
    .sidebar { width: var(--sidebar-w); flex-shrink: 0; background: var(--surface); border-inline-start: 0; border-inline-end: 1px solid var(--border);
      display: flex; flex-direction: column; transition: width .18s ease; }
    .sidebar.collapsed { width: var(--sidebar-w-collapsed); }
    .brand { height: var(--topbar-h); display: flex; align-items: center; gap: 10px; padding: 0 16px; border-bottom: 1px solid var(--border); overflow: hidden; }
    .mark { width: 34px; height: 34px; border-radius: 8px; background: var(--text); color: #fff; display: grid; place-items: center; font-weight: 700; flex-shrink: 0; }
    .logo { width: 34px; height: 34px; object-fit: contain; flex-shrink: 0; }
    .brand-text { display: flex; flex-direction: column; min-width: 0; }
    .brand-text strong { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .brand-text span { font-size: 11px; color: var(--muted); white-space: nowrap; }
    nav { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 2px; }
    .group { font-size: 11px; color: var(--faint); padding: 14px 10px 6px; font-weight: 500; }
    .divider { height: 1px; background: var(--border); margin: 8px 6px; }
    nav a { display: flex; align-items: center; gap: 10px; height: 38px; padding: 0 10px; border-radius: 6px; color: var(--text-2, #3f3f46); font-size: 13.5px; white-space: nowrap; }
    nav a:hover { background: var(--subtle); color: var(--text); }
    nav a.active { background: var(--text); color: #fff; }
    nav a .material-symbols-outlined { font-size: 20px; }
    .collapsed nav a { justify-content: center; padding: 0; }
    .collapse { display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 20px; border: 0; border-top: 1px solid var(--border); background: none;
      cursor: pointer; color: var(--muted); font: inherit; font-size: 12px; }
    .collapsed .collapse { justify-content: center; padding: 0; }
    .collapse:hover { color: var(--text); }
    .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .topbar { height: var(--topbar-h); flex-shrink: 0; display: flex; align-items: center; gap: 12px; padding: 0 28px; background: var(--surface); border-bottom: 1px solid var(--border); }
    .quick { display: flex; gap: 6px; }
    .user { display: flex; align-items: center; gap: 10px; border: 0; background: none; cursor: pointer; font: inherit; padding: 4px 8px; border-radius: 8px; }
    .user:hover { background: var(--subtle); }
    .avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--subtle); border: 1px solid var(--border); display: grid; place-items: center; font-weight: 600; }
    .who { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.3; }
    .who strong { font-size: 13px; } .who span { font-size: 11px; color: var(--muted); }
    main { flex: 1; overflow-y: auto; }
    @media (max-width: 1100px) { .quick { display: none; } }
  `,
})
export class Shell {
  auth = inject(AuthService);
  private lookups = inject(LookupsService);
  router = inject(Router);
  nav = computed(() => NAV.map(g => ({ ...g, items: g.items.filter(i => !i.adminOnly || this.auth.isAdmin()) })));
  collapsed = signal(localStorage.getItem('sidebar-collapsed') === '1');
  today = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

  companyName = computed(() => this.lookups.settings()?.companyName ?? '');
  logoUrl = computed(() => ApiService.attachmentUrl(this.lookups.settings()?.logoAttachmentId));
  initial = computed(() => (this.auth.user()?.displayName ?? '?').trim().charAt(0));
  roleLabel = computed(() => { const r = this.auth.user()?.role; return r ? USER_ROLE[r].label : ''; });

  toggle(): void {
    this.collapsed.update(v => !v);
    localStorage.setItem('sidebar-collapsed', this.collapsed() ? '1' : '0');
  }
}
