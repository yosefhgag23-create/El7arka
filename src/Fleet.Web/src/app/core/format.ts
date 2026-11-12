import { Pipe, PipeTransform, inject } from '@angular/core';
import { LookupsService } from './lookups.service';

const numFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const moneyFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export const fmtNumber = (v: number | null | undefined, digits?: number) =>
  v === null || v === undefined ? '—' : digits === undefined ? numFmt.format(v)
    : new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
export const fmtMoney = (v: number | null | undefined) => (v === null || v === undefined ? '—' : moneyFmt.format(v));
export const fmtInt = (v: number | null | undefined) => (v === null || v === undefined ? '—' : intFmt.format(v));

export function fmtDate(iso: string | null | undefined, format = 'dd/MM/yyyy'): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return format.replace('yyyy', y).replace('MM', m).replace('dd', d);
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Local date → yyyy-MM-dd (no timezone shift). */
export function toIso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fromIso(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayIso = () => toIso(new Date())!;
export function addDaysIso(iso: string, days: number): string {
  const d = fromIso(iso)!;
  d.setDate(d.getDate() + days);
  return toIso(d)!;
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  private lookups = inject(LookupsService);
  transform(v: number | null | undefined, withCurrency = true): string {
    const s = fmtMoney(v);
    return withCurrency && v !== null && v !== undefined ? `${s} ${this.lookups.currency()}` : s;
  }
}

@Pipe({ name: 'num' })
export class NumPipe implements PipeTransform {
  transform(v: number | null | undefined, digits?: number): string { return fmtNumber(v, digits); }
}

@Pipe({ name: 'd' })
export class DatePipe implements PipeTransform {
  private lookups = inject(LookupsService);
  transform(v: string | null | undefined): string { return fmtDate(v, this.lookups.dateFormat()); }
}

@Pipe({ name: 'dt' })
export class DateTimePipe implements PipeTransform {
  transform(v: string | null | undefined): string { return fmtDateTime(v); }
}
