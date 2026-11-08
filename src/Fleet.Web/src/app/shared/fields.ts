import { Component, ElementRef, booleanAttribute, effect, forwardRef, inject, input, output, signal, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ApiService } from '../core/api.service';
import { fileSize, fromIso, toIso } from '../core/format';
import { AttachmentDto, AttachmentOwnerType, PagedResult } from '../core/models';
import { NotifyService } from '../core/notify.service';

/* ---------------- Search box (debounced) ---------------- */
@Component({
  selector: 'app-search',
  template: `
    <span class="material-symbols-outlined">search</span>
    <input #box [placeholder]="placeholder()" [value]="value()" (input)="onInput(box.value)" />
    @if (value()) { <button class="clear" (click)="box.value=''; onInput('')"><span class="material-symbols-outlined">close</span></button> }
  `,
  styles: `
    :host { display: flex; align-items: center; gap: 6px; height: 36px; padding: 0 10px; min-width: 240px; flex: 1; max-width: 360px;
      border: 1px solid var(--border-strong); border-radius: 6px; background: var(--surface); }
    :host:focus-within { border-color: var(--text); }
    input { border: 0; outline: 0; flex: 1; font: inherit; background: transparent; min-width: 0; }
    .material-symbols-outlined { color: var(--faint); font-size: 18px; }
    .clear { border: 0; background: none; cursor: pointer; padding: 0; display: flex; }
  `,
})
export class SearchBox {
  placeholder = input('بحث...');
  value = input('');
  search = output<string>();
  private timer?: ReturnType<typeof setTimeout>;
  onInput(v: string): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.search.emit(v.trim()), 300);
  }
}

/* ---------------- Native compact select used in filter bars ---------------- */
@Component({
  selector: 'app-filter-select',
  template: `
    <select [value]="value() ?? ''" (change)="changed($any($event.target).value)" [class.has]="value() !== null && value() !== undefined && value() !== ''">
      <option value="">{{ placeholder() }}</option>
      @for (o of options(); track o.value) { <option [value]="o.value">{{ o.label }}</option> }
    </select>
  `,
  styles: `
    select { height: 36px; border: 1px solid var(--border-strong); border-radius: 6px; background: var(--surface); font: inherit; padding: 0 10px; min-width: 140px; color: var(--muted); }
    select.has { color: var(--text); border-color: var(--text); }
  `,
})
export class FilterSelect {
  placeholder = input('الكل');
  options = input<{ value: string | number; label: string }[]>([]);
  value = input<string | number | null | undefined>(null);
  numeric = input(false, { transform: booleanAttribute });
  valueChange = output<any>();
  changed(v: string): void { this.valueChange.emit(v === '' ? null : this.numeric() ? Number(v) : v); }
}

/* ---------------- Period filter (from / to) ---------------- */
export interface Period { from: string | null; to: string | null; }

@Component({
  selector: 'app-period',
  template: `
    <label>من <input type="date" [value]="from() ?? ''" (change)="emit($any($event.target).value, to())" /></label>
    <label>إلى <input type="date" [value]="to() ?? ''" (change)="emit(from(), $any($event.target).value)" /></label>
  `,
  styles: `
    :host { display: inline-flex; gap: 8px; }
    label { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }
    input { height: 36px; border: 1px solid var(--border-strong); border-radius: 6px; background: var(--surface); font: inherit; padding: 0 8px; color: var(--text); }
  `,
})
export class PeriodFilter {
  from = input<string | null | undefined>(null);
  to = input<string | null | undefined>(null);
  change = output<Period>();
  emit(from: string | null | undefined, to: string | null | undefined): void { this.change.emit({ from: from || null, to: to || null }); }
}

/* ---------------- Date field storing ISO yyyy-MM-dd ---------------- */
@Component({
  selector: 'app-date-field',
  imports: [MatFormFieldModule, MatInputModule, MatDatepickerModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateField), multi: true }],
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic">
      <mat-label>{{ label() }}</mat-label>
      <input matInput [matDatepicker]="picker" [value]="date()" (dateChange)="onChange($event.value)" [disabled]="disabled()" [required]="required()" (blur)="touched()" />
      <mat-datepicker-toggle matIconSuffix [for]="picker" />
      <mat-datepicker #picker />
      @if (error()) { <mat-error>{{ error() }}</mat-error> }
      @if (hint()) { <mat-hint>{{ hint() }}</mat-hint> }
    </mat-form-field>
  `,
  styles: `:host { display: block; } mat-error { display: block; }`,
})
export class DateField implements ControlValueAccessor {
  label = input('');
  required = input(false, { transform: booleanAttribute });
  error = input<string | null>(null);
  hint = input<string>();
  date = signal<Date | null>(null);
  disabled = signal(false);
  private fn: (v: string | null) => void = () => {};
  touched: () => void = () => {};
  writeValue(v: string | null): void { this.date.set(fromIso(v)); }
  registerOnChange(fn: (v: string | null) => void): void { this.fn = fn; }
  registerOnTouched(fn: () => void): void { this.touched = fn; }
  setDisabledState(d: boolean): void { this.disabled.set(d); }
  onChange(d: Date | null): void { this.date.set(d); this.fn(toIso(d)); }
}

/* ---------------- Entity picker with server-side search ---------------- */
export type EntityKind = 'equipment' | 'projects' | 'drivers';
interface Option { id: number; label: string; sub?: string; }

@Component({
  selector: 'app-entity-select',
  imports: [MatFormFieldModule, MatInputModule, MatAutocompleteModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => EntitySelect), multi: true }],
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic">
      <mat-label>{{ label() }}</mat-label>
      <input #inp matInput [matAutocomplete]="auto" [value]="text()" (input)="onType(inp.value)" (focus)="onFocus()" (blur)="onBlur()"
        [disabled]="disabled()" [required]="required()" />
      @if (selectedId() && !disabled() && !required()) {
        <button matSuffix class="btn ghost icon sm" type="button" (click)="clear($event)"><span class="material-symbols-outlined">close</span></button>
      }
      <mat-autocomplete #auto (optionSelected)="pick($event)">
        @for (o of options(); track o.id) {
          <mat-option [value]="o.id"><span>{{ o.label }}</span> @if (o.sub) { <span class="muted small"> — {{ o.sub }}</span> }</mat-option>
        }
        @if (!options().length) { <mat-option disabled>لا توجد نتائج</mat-option> }
      </mat-autocomplete>
      @if (error()) { <mat-error>{{ error() }}</mat-error> }
      @if (hint()) { <mat-hint>{{ hint() }}</mat-hint> }
    </mat-form-field>
  `,
  styles: `:host { display: block; }`,
})
export class EntitySelect implements ControlValueAccessor {
  private api = inject(ApiService);
  kind = input.required<EntityKind>();
  label = input('');
  required = input(false, { transform: booleanAttribute });
  error = input<string | null>(null);
  hint = input<string>();
  /** Extra list filters, e.g. { unassigned: true } */
  filter = input<Record<string, string | number | boolean>>({});
  selected = output<any>();

  options = signal<Option[]>([]);
  text = signal('');
  selectedId = signal<number | null>(null);
  disabled = signal(false);
  private raw = new Map<number, any>();
  private fn: (v: number | null) => void = () => {};
  private touchedFn: () => void = () => {};
  private timer?: ReturnType<typeof setTimeout>;

  async writeValue(id: number | null): Promise<void> {
    this.selectedId.set(id ?? null);
    if (!id) { this.text.set(''); return; }
    try {
      const item = await this.api.get<any>(`${this.kind()}/${id}`);
      this.text.set(this.toOption(item).label);
    } catch { this.text.set(`#${id}`); }
  }
  registerOnChange(fn: (v: number | null) => void): void { this.fn = fn; }
  registerOnTouched(fn: () => void): void { this.touchedFn = fn; }
  setDisabledState(d: boolean): void { this.disabled.set(d); }

  onFocus(): void { if (!this.options().length) this.search(''); }
  onBlur(): void {
    this.touchedFn();
    setTimeout(() => { // restore label if user typed without picking
      const cur = this.options().find(o => o.id === this.selectedId());
      if (this.selectedId() && cur) this.text.set(cur.label);
    }, 200);
  }
  onType(v: string): void {
    this.text.set(v);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.search(v), 250);
  }

  private async search(term: string): Promise<void> {
    const r = await this.api.get<PagedResult<any>>(this.kind(), { search: term, pageSize: 30, ...this.filter() });
    r.items.forEach(i => this.raw.set(i.id, i));
    this.options.set(r.items.map(i => this.toOption(i)));
  }

  pick(e: MatAutocompleteSelectedEvent): void {
    const id = e.option.value as number;
    const o = this.options().find(x => x.id === id);
    this.selectedId.set(id);
    this.text.set(o?.label ?? '');
    this.fn(id);
    this.selected.emit(this.raw.get(id));
  }

  clear(ev: Event): void {
    ev.stopPropagation();
    this.selectedId.set(null);
    this.text.set('');
    this.fn(null);
    this.selected.emit(null);
  }

  private toOption(i: any): Option {
    switch (this.kind()) {
      case 'equipment': return { id: i.id, label: `${i.code} — ${i.name}`, sub: i.plateNumber ?? i.chassisNumber };
      case 'projects': return { id: i.id, label: `${i.code} — ${i.name}`, sub: i.location };
      default: return { id: i.id, label: i.fullName, sub: i.phone };
    }
  }
}

/* ---------------- Attachment upload (invoice / receipt) ---------------- */
@Component({
  selector: 'app-file-upload',
  template: `
    <div class="box" [class.drag]="drag()" (dragover)="$event.preventDefault(); drag.set(true)" (dragleave)="drag.set(false)" (drop)="onDrop($event)">
      <span class="material-symbols-outlined">attach_file</span>
      @if (current()) {
        <a class="link" [href]="url(current())" target="_blank">{{ name() || 'عرض المرفق' }}</a>
        @if (size()) { <span class="muted small">{{ size() }}</span> }
        <span class="spacer"></span>
        <button class="btn ghost sm" type="button" (click)="remove()">إزالة</button>
      } @else {
        <span class="muted">{{ uploading() ? 'جارٍ الرفع...' : label() }}</span>
        <span class="spacer"></span>
        <button class="btn sm" type="button" [disabled]="uploading()" (click)="file.click()">اختيار ملف</button>
      }
      <input #file type="file" hidden [accept]="accept()" (change)="onPick(file)" />
    </div>
  `,
  styles: `
    .box { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px dashed var(--border-strong); border-radius: 8px; background: var(--surface); }
    .box.drag { border-color: var(--text); background: var(--subtle); }
    .material-symbols-outlined { color: var(--muted); }
  `,
})
export class FileUpload {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  label = input('إرفاق صورة الفاتورة أو الإيصال (اختياري)');
  accept = input('image/*,application/pdf');
  ownerType = input<AttachmentOwnerType>('None');
  current = input<number | null | undefined>(null);
  uploaded = output<number | null>();
  uploading = signal(false);
  drag = signal(false);
  name = signal('');
  size = signal('');

  url = (id: number | null | undefined) => ApiService.attachmentUrl(id);

  onPick(input: HTMLInputElement): void {
    const f = input.files?.[0];
    input.value = '';
    if (f) this.upload(f);
  }
  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.drag.set(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) this.upload(f);
  }
  async upload(f: File): Promise<void> {
    this.uploading.set(true);
    try {
      const a = await this.api.upload<AttachmentDto>('attachments', f, { ownerType: this.ownerType() });
      this.name.set(a.originalName);
      this.size.set(fileSize(a.sizeBytes));
      this.uploaded.emit(a.id);
    } catch (e) { this.notify.error(e); } finally { this.uploading.set(false); }
  }
  remove(): void { this.name.set(''); this.size.set(''); this.uploaded.emit(null); }
}
