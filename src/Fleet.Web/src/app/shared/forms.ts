import { AbstractControl, FormGroup } from '@angular/forms';
import { problemOf } from '../core/notify.service';

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
