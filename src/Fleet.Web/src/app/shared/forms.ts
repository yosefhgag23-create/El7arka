import { DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormGroup } from '@angular/forms';
import { merge } from 'rxjs';
import { ApiService } from '../core/api.service';
import { problemOf } from '../core/notify.service';

interface EntryDefaults { projectId?: number | null; driverId?: number | null; lastFuelPrice?: number | null; }

/**
 * Pre-fills fields from the equipment's situation on the entry date (project, driver, last fuel price)
 * whenever the equipment or date changes. Only empty fields, or values it filled itself, are replaced —
 * anything the user typed or picked is kept. Must be called from an injection context.
 */
export function autoFillFromEquipment(
  form: FormGroup,
  opts: { equipment: string; date: string; fill: Partial<Record<keyof EntryDefaults, string>>; runNow?: boolean },
): void {
  const api = inject(ApiService);
  const destroy = inject(DestroyRef);
  const filled: Record<string, unknown> = {};
  let seq = 0;

  const run = async () => {
    const equipmentId = form.get(opts.equipment)?.value;
    const date = form.get(opts.date)?.value;
    if (!equipmentId || !date) return;
    const mine = ++seq;
    let d: EntryDefaults;
    try { d = await api.get<EntryDefaults>(`equipment/${equipmentId}/entry-defaults`, { date }); } catch { return; }
    if (mine !== seq) return;
    for (const [source, target] of Object.entries(opts.fill) as [keyof EntryDefaults, string][]) {
      const ctrl = form.get(target);
      const value = d[source] ?? null;
      if (!ctrl || (source === 'lastFuelPrice' && value === null)) continue;
      const untouchedByUser = ctrl.value === null || ctrl.value === '' || ctrl.value === filled[target];
      if (untouchedByUser && ctrl.value !== value) ctrl.setValue(value);
      if (untouchedByUser) filled[target] = value;
    }
  };

  merge(form.get(opts.equipment)!.valueChanges, form.get(opts.date)!.valueChanges)
    .pipe(takeUntilDestroyed(destroy))
    .subscribe(() => void run());
  if (opts.runNow) void run();
}

/**
 * Keeps total = quantity × unit price filled in as the user types:
 * editing quantity or price recalculates the total, editing the total recalculates the price.
 * Must be called from an injection context (e.g. a component field initializer).
 */
export function linkAmounts(form: FormGroup, keys: { quantity: string; price: string; total: string }): void {
  const destroy = inject(DestroyRef);
  const ctrl = (k: string) => form.get(k)!;
  const num = (k: string): number | null => {
    const v = ctrl(k).value;
    return v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v);
  };
  const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;
  let syncing = false;
  const set = (k: string, v: number) => { ctrl(k).setValue(v); ctrl(k).markAsDirty(); ctrl(k).setErrors(null); };
  const watch = (k: string, fn: (q: number) => void) =>
    ctrl(k).valueChanges.pipe(takeUntilDestroyed(destroy)).subscribe(() => {
      const q = num(keys.quantity);
      if (syncing || q === null || q <= 0) return;
      syncing = true;
      try { fn(q); } finally { syncing = false; }
    });

  const fromPrice = (q: number) => { const p = num(keys.price); if (p !== null) set(keys.total, round(q * p, 2)); };
  const fromTotal = (q: number) => { const t = num(keys.total); if (t !== null) set(keys.price, round(t / q, 4)); };
  watch(keys.quantity, q => (num(keys.price) !== null ? fromPrice(q) : fromTotal(q)));
  watch(keys.price, fromPrice);
  watch(keys.total, fromTotal);
}

/** Maps server field errors (camelCase keys) onto form controls. Returns true if any field error was applied. */
export function applyServerErrors(form: FormGroup, err: unknown): boolean {
  const p = problemOf(err);
  let applied = false;
  for (const [key, messages] of Object.entries(p.errors ?? {})) {
    const ctrl = form.get(key) ?? findNested(form, key);
    if (ctrl) {
      ctrl.setErrors({ ...(ctrl.errors ?? {}), server: messages[0] });
      ctrl.markAsTouched();
      applied = true;
    }
  }
  return applied;
}

function findNested(group: FormGroup, key: string): AbstractControl | null {
  for (const child of Object.values(group.controls)) {
    if (child instanceof FormGroup) {
      const found = child.get(key) ?? findNested(child, key);
      if (found) return found;
    }
  }
  return null;
}

const messages: Record<string, (e: any) => string> = {
  required: () => 'هذا الحقل مطلوب',
  min: e => `الحد الأدنى ${e.min}`,
  max: e => `الحد الأقصى ${e.max}`,
  maxlength: e => `الحد الأقصى ${e.requiredLength} حرف`,
  minlength: e => `الحد الأدنى ${e.requiredLength} أحرف`,
  pattern: () => 'صيغة غير صحيحة',
  email: () => 'بريد إلكتروني غير صالح',
  server: e => e,
};

/** First human-readable error of a control (only after touch). */
export function err(ctrl: AbstractControl | null): string | null {
  if (!ctrl || !ctrl.errors || !(ctrl.touched || ctrl.dirty)) return null;
  const [k, v] = Object.entries(ctrl.errors)[0];
  return messages[k]?.(v) ?? 'قيمة غير صالحة';
}

/** Converts empty strings to null so the API receives proper optional values. */
export function clean<T extends Record<string, unknown>>(v: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) out[k] = val === '' ? null : val;
  return out as T;
}
