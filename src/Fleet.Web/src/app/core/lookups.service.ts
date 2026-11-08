import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { CompanySettings, EquipmentStatus, LookupDto, LookupKind, StatusLabelDto } from './models';

/** Cached reference data (dropdowns, labels, company settings). Call refresh() after editing settings. */
@Injectable({ providedIn: 'root' })
export class LookupsService {
  private api = inject(ApiService);

  readonly settings = signal<CompanySettings | null>(null);
  readonly statusLabels = signal<StatusLabelDto[]>([]);
  private readonly cache = signal<Partial<Record<LookupKind, LookupDto[]>>>({});

  readonly currency = computed(() => this.settings()?.currencySymbol ?? 'ج.م');
  readonly dateFormat = computed(() => this.settings()?.dateFormat ?? 'dd/MM/yyyy');

  private loading?: Promise<void>;

  load(): Promise<void> {
    this.loading ??= this.refresh();
    return this.loading;
  }

  async refresh(): Promise<void> {
    const kinds: LookupKind[] = ['EquipmentCategories', 'FuelTypes', 'ExpenseCategories', 'MaintenanceTypes', 'LicenseTypes'];
    const [settings, labels, ...lists] = await Promise.all([
      this.api.get<CompanySettings>('settings'),
      this.api.get<StatusLabelDto[]>('settings/status-labels'),
      ...kinds.map(k => this.api.get<LookupDto[]>(`lookups/${k}`)),
    ]);
    this.settings.set(settings);
    this.statusLabels.set(labels);
    const map: Partial<Record<LookupKind, LookupDto[]>> = {};
    kinds.forEach((k, i) => (map[k] = lists[i]));
    this.cache.set(map);
  }

  all(kind: LookupKind): LookupDto[] { return this.cache()[kind] ?? []; }
  active(kind: LookupKind): LookupDto[] { return this.all(kind).filter(x => x.isActive); }
  name(kind: LookupKind, id?: number | null): string { return this.all(kind).find(x => x.id === id)?.nameAr ?? ''; }

  statusLabel(s: EquipmentStatus): StatusLabelDto | undefined { return this.statusLabels().find(x => x.status === s); }
}
