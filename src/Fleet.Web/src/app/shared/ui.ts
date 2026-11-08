import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EnumMeta, Tone } from '../core/labels';

export interface Crumb { label: string; link?: string | unknown[]; }

@Component({
  selector: 'app-page-header',
  imports: [RouterLink],
  template: `
    @if (crumbs().length) {
      <nav class="crumbs">
        <a routerLink="/">الرئيسية</a>
        @for (c of crumbs(); track $index) {
          <span class="material-symbols-outlined sep">chevron_left</span>
          @if (c.link) { <a [routerLink]="c.link">{{ c.label }}</a> } @else { <span>{{ c.label }}</span> }
        }
      </nav>
    }
    <div class="head">
      <div class="titles">
        <h1>{{ title() }}</h1>
        @if (subtitle()) { <p class="muted">{{ subtitle() }}</p> }
      </div>
      <div class="actions"><ng-content /></div>
    </div>
  `,
  styles: `
    :host { display: block; margin-bottom: 20px; }
    .crumbs { display: flex; align-items: center; gap: 2px; font-size: 12px; color: var(--muted); margin-bottom: 8px; flex-wrap: wrap; }
    .crumbs a:hover { color: var(--text); }
    .sep { font-size: 16px; color: var(--faint); }
    .head { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
    .titles { flex: 1; min-width: 240px; }
    h1 { font-size: 22px; font-weight: 600; }
    p { margin: 4px 0 0; font-size: 13px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  `,
})
export class PageHeader {
  title = input.required<string>();
  subtitle = input<string>();
  crumbs = input<Crumb[]>([]);
}

@Component({
  selector: 'app-stat',
  template: `
    <div class="top">
      <span class="label">{{ label() }}</span>
      @if (icon()) { <span class="material-symbols-outlined ic">{{ icon() }}</span> }
    </div>
    @if (loading()) { <div class="skeleton" style="height:28px;width:60%;margin-top:6px"></div> }
    @else { <div class="value num" [class]="tone()">{{ value() }}</div> }
    @if (hint()) { <div class="hint">{{ hint() }}</div> }
  `,
  styles: `
    :host { display: block; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 18px; min-height: 104px; }
    .top { display: flex; align-items: center; gap: 8px; }
    .label { color: var(--muted); font-size: 12px; flex: 1; }
    .ic { color: var(--faint); font-size: 20px; }
    .value { font-size: 24px; font-weight: 600; margin-top: 6px; letter-spacing: -0.02em; }
    .value.success { color: var(--success); } .value.warning { color: var(--warning); } .value.danger { color: var(--danger); }
    .hint { color: var(--muted); font-size: 12px; margin-top: 4px; }
  `,
})
export class StatCard {
  label = input.required<string>();
  value = input<string | number | null>('—');
  icon = input<string>();
  hint = input<string>();
  tone = input<Tone>('');
  loading = input(false);
}

@Component({
  selector: 'app-badge',
  template: `<span class="badge" [class]="cls()" [style.color]="color()" [style.border-color]="color()"><span class="dot"></span>{{ text() }}</span>`,
})
export class Badge {
  meta = input<EnumMeta | undefined>();
  label = input<string>();
  tone = input<Tone>();
  color = input<string | null>(null);
  text = computed(() => this.label() ?? this.meta()?.label ?? '');
  cls = computed(() => this.tone() ?? this.meta()?.tone ?? '');
}

@Component({
  selector: 'app-empty',
  template: `
    <span class="material-symbols-outlined">{{ icon() }}</span>
    <h4>{{ title() }}</h4>
    @if (message()) { <p>{{ message() }}</p> }
    <ng-content />
  `,
  styles: `
    :host { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 48px 16px; color: var(--muted); gap: 6px; }
    .material-symbols-outlined { font-size: 40px; color: var(--faint); font-variation-settings: 'wght' 300; }
    h4 { color: var(--text); font-size: 15px; font-weight: 600; margin-top: 4px; }
    p { margin: 0 0 8px; font-size: 13px; max-width: 420px; }
  `,
})
export class EmptyState {
  icon = input('inbox');
  title = input('لا توجد بيانات');
  message = input<string>();
}
