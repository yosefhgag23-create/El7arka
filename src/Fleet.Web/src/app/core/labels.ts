import {
  ApprovalStatus, EmploymentStatus, EquipmentStatus, ExpenseSourceType, FuelSegmentStatus, MaintenanceDueStatus,
  MeterReadingSource, MeterType, OwnershipType, ProjectStatus, RentalRateType, UserRole
} from './models';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'dark' | '';

export interface EnumMeta { label: string; tone: Tone; }

const m = <T extends string>(map: Record<T, EnumMeta>) => map;

export const OWNERSHIP = m<OwnershipType>({ Owned: { label: 'تمليك', tone: 'dark' }, Rented: { label: 'إيجار', tone: '' } });

export const METER_TYPE = m<MeterType>({ Kilometers: { label: 'كيلومتر', tone: '' }, EngineHours: { label: 'ساعات تشغيل', tone: '' } });

export const EQUIPMENT_STATUS = m<EquipmentStatus>({
  Available: { label: 'متاحة', tone: 'success' },
  Operating: { label: 'تعمل', tone: 'dark' },
  UnderMaintenance: { label: 'تحت الصيانة', tone: 'warning' },
  OutOfService: { label: 'خارج الخدمة', tone: 'danger' },
  Inactive: { label: 'غير نشطة', tone: '' },
});

export const PROJECT_STATUS = m<ProjectStatus>({
  Planned: { label: 'مخطط', tone: 'info' },
  Active: { label: 'جارٍ', tone: 'success' },
  OnHold: { label: 'متوقف مؤقتاً', tone: 'warning' },
  Completed: { label: 'منتهي', tone: '' },
  Archived: { label: 'مؤرشف', tone: '' },
});

export const EMPLOYMENT_STATUS = m<EmploymentStatus>({
  Active: { label: 'على رأس العمل', tone: 'success' },
  OnLeave: { label: 'إجازة', tone: 'info' },
  Suspended: { label: 'موقوف', tone: 'warning' },
  Terminated: { label: 'انتهت خدمته', tone: '' },
});

export const APPROVAL_STATUS = m<ApprovalStatus>({
  Pending: { label: 'قيد المراجعة', tone: 'warning' },
  Approved: { label: 'معتمد', tone: 'success' },
  Rejected: { label: 'مرفوض', tone: 'danger' },
});

export const SOURCE_TYPE = m<ExpenseSourceType>({
  Manual: { label: 'يدوي', tone: '' },
  Fuel: { label: 'وقود', tone: 'info' },
  Maintenance: { label: 'صيانة', tone: 'warning' },
  Overtime: { label: 'إضافي', tone: '' },
  Rental: { label: 'إيجار', tone: 'dark' },
});

export const RATE_TYPE = m<RentalRateType>({
  Monthly: { label: 'شهري', tone: '' }, Daily: { label: 'يومي', tone: '' },
  Hourly: { label: 'بالساعة', tone: '' }, PerKm: { label: 'بالكيلومتر', tone: '' },
});

export const DUE_STATUS = m<MaintenanceDueStatus>({
  Ok: { label: 'في الموعد', tone: 'success' }, DueSoon: { label: 'قريباً', tone: 'warning' }, Overdue: { label: 'متأخرة', tone: 'danger' },
});

export const METER_SOURCE = m<MeterReadingSource>({
  Initial: { label: 'قراءة ابتدائية', tone: '' }, Fuel: { label: 'تموين', tone: 'info' }, Maintenance: { label: 'صيانة', tone: 'warning' },
  Transfer: { label: 'نقل', tone: '' }, Expense: { label: 'مصروف', tone: '' }, Manual: { label: 'يدوي', tone: '' }, Correction: { label: 'تصحيح', tone: 'danger' },
});

export const SEGMENT_STATUS = m<FuelSegmentStatus>({
  Valid: { label: 'صحيحة', tone: 'success' },
  NoPreviousFullTank: { label: 'لا يوجد تفويل كامل سابق', tone: '' },
  MissingMeter: { label: 'بدون قراءة عداد', tone: 'warning' },
  NonPositiveDistance: { label: 'مسافة غير صالحة', tone: 'danger' },
  CorrectionInSegment: { label: 'تصحيح عداد بالفترة', tone: 'warning' },
  NotFullTank: { label: 'تفويل جزئي', tone: '' },
});

export const USER_ROLE = m<UserRole>({ Admin: { label: 'مدير النظام', tone: 'dark' }, DataEntry: { label: 'إدخال بيانات', tone: '' } });

export function options<T extends string>(map: Record<T, EnumMeta>): { value: T; label: string }[] {
  return (Object.keys(map) as T[]).map(value => ({ value, label: map[value].label }));
}

export const meterUnit = (t?: MeterType) => (t === 'EngineHours' ? 'ساعة' : 'كم');
