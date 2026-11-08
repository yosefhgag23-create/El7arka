export type Id = number;
export type IsoDate = string; // yyyy-MM-dd

export interface PagedResult<T> { items: T[]; total: number; page: number; pageSize: number; }

export type OwnershipType = 'Owned' | 'Rented';
export type MeterType = 'Kilometers' | 'EngineHours';
export type EquipmentStatus = 'Available' | 'Operating' | 'UnderMaintenance' | 'OutOfService' | 'Inactive';
export type ProjectStatus = 'Planned' | 'Active' | 'OnHold' | 'Completed' | 'Archived';
export type EmploymentStatus = 'Active' | 'OnLeave' | 'Suspended' | 'Terminated';
export type ExpenseSourceType = 'Manual' | 'Fuel' | 'Maintenance' | 'Overtime' | 'Rental';
export type ExpenseSystemKind = 'None' | 'Fuel' | 'Maintenance' | 'SpareParts' | 'Rental' | 'Overtime' | 'Tolls' | 'Tires' | 'Oil';
export type MeterReadingSource = 'Initial' | 'Fuel' | 'Maintenance' | 'Transfer' | 'Expense' | 'Manual' | 'Correction';
export type ApprovalStatus = 'Pending' | 'Approved' | 'Rejected';
export type RentalRateType = 'Monthly' | 'Daily' | 'Hourly' | 'PerKm';
export type UserRole = 'Admin' | 'DataEntry';
export type MaintenanceDueStatus = 'Ok' | 'DueSoon' | 'Overdue';
export type FuelSegmentStatus = 'Valid' | 'NoPreviousFullTank' | 'MissingMeter' | 'NonPositiveDistance' | 'CorrectionInSegment' | 'NotFullTank';
export type LookupKind = 'EquipmentCategories' | 'FuelTypes' | 'ExpenseCategories' | 'MaintenanceTypes' | 'LicenseTypes';
export type AttachmentOwnerType = 'None' | 'EquipmentImage' | 'Driver' | 'Expense' | 'Fuel' | 'Maintenance' | 'RentalContract' | 'CompanyLogo';

export interface UserDto { id: Id; username: string; displayName: string; role: UserRole; isActive: boolean; mustChangePassword: boolean; lastLoginAt?: string; }

export interface LookupDto {
  id: Id; nameAr: string; nameEn?: string; sortOrder: number; isActive: boolean; isSystem: boolean;
  icon?: string; defaultUsefulLifeYears?: number; defaultResidualPercent?: number;
  unit?: string; expenseCategoryId?: Id; systemKind?: ExpenseSystemKind;
  defaultIntervalKm?: number; defaultIntervalHours?: number; defaultIntervalDays?: number;
  manualEntryAllowed: boolean;
}

export interface StatusLabelDto { status: EquipmentStatus; nameAr: string; nameEn?: string; color: string; }

export interface CompanySettings {
  companyName: string; address?: string; phone?: string; email?: string; taxNumber?: string; logoAttachmentId?: Id;
  currency: string; currencySymbol: string; dateFormat: string; defaultWorkingHours: number;
  fuelAnomalyThresholdPercent: number; maintenanceDueSoonDays: number; maintenanceDueSoonKm: number; maintenanceDueSoonHours: number;
  licenseExpiryWarningDays: number; autoAssignSetsOperating: boolean; autoBackupEnabled: boolean; autoBackupRetention: number;
  backupFolder?: string; rentalAccrueCurrentMonth: boolean;
}

export interface ProjectListItem { id: Id; code: string; name: string; location?: string; startDate: IsoDate; endDate?: IsoDate; status: ProjectStatus; activeEquipmentCount: number; }
export interface ProjectDto extends ProjectListItem { description?: string; notes?: string; totalAssignments: number; createdAt: string; }

export interface EquipmentListItem {
  id: Id; code: string; name: string; plateNumber?: string; chassisNumber?: string; categoryId: Id; categoryName: string;
  manufacturer?: string; model?: string; manufactureYear?: number; ownership: OwnershipType; status: EquipmentStatus; meterType: MeterType;
  currentMeterReading: number; currentProjectId?: Id; currentProjectName?: string; mainImageId?: Id; fuelTypeName?: string; isActive: boolean;
}
export interface DepreciationProfileDto { purchaseDate: IsoDate; purchasePrice: number; residualValue: number; usefulLifeMonths: number; method: 'StraightLine'; depreciationStartDate: IsoDate; disposalDate?: IsoDate; }
export interface RentalContractDto {
  id: Id; contractNo?: string; lessor: string; lessorPhone?: string; startDate: IsoDate; endDate?: IsoDate; rateType: RentalRateType; rate: number;
  includesDriver: boolean; includesFuel: boolean; includesMaintenance: boolean; attachmentId?: Id; notes?: string;
}
export interface CurrentDriverDto { assignmentId: Id; driverId: Id; fullName: string; phone?: string; startDate: IsoDate; isPrimary: boolean; }
export interface EquipmentDto {
  id: Id; code: string; name: string; plateNumber?: string; chassisNumber?: string; categoryId: Id; categoryName: string;
  manufacturer?: string; model?: string; manufactureYear?: number; fuelTypeId: Id; fuelTypeName: string; fuelUnit: string;
  ownership: OwnershipType; meterType: MeterType; status: EquipmentStatus; initialMeterReading: number; currentMeterReading: number;
  mainImageId?: Id; imageIds: Id[]; notes?: string; isActive: boolean; currentProjectId?: Id; currentProjectName?: string; currentProjectSince?: IsoDate;
  depreciation?: DepreciationProfileDto; rentalContracts: RentalContractDto[]; currentDrivers: CurrentDriverDto[]; createdAt: string;
}
export interface StatusHistoryDto { id: Id; status: EquipmentStatus; fromDate: IsoDate; toDate?: IsoDate; reason?: string; createdBy?: string; }
export interface MeterReadingDto { id: Id; readingDate: IsoDate; value: number; source: MeterReadingSource; sourceId?: Id; isCorrection: boolean; correctionReason?: string; createdBy?: string; }

export interface AssignmentHistoryItem {
  id: Id; equipmentId: Id; equipmentCode: string; equipmentName: string; projectId: Id; projectCode: string; projectName: string;
  startDate: IsoDate; endDate?: IsoDate; startMeter?: number; endMeter?: number; days: number; notes?: string;
}
export interface TransferListItem {
  id: Id; equipmentId: Id; equipmentCode: string; equipmentName: string; fromProjectId?: Id; fromProjectName?: string;
  toProjectId?: Id; toProjectName?: string; transferDate: IsoDate; meterReading?: number; notes?: string; createdBy?: string; createdAt: string;
}
export interface DriverAssignmentItem {
  id: Id; driverId: Id; driverName: string; driverPhone?: string; equipmentId: Id; equipmentCode: string; equipmentName: string;
  startDate: IsoDate; endDate?: IsoDate; isPrimary: boolean; isActive: boolean; notes?: string;
}

export interface DriverListItem {
  id: Id; fullName: string; phone?: string; nationalId?: string; employmentStatus: EmploymentStatus; licenseNumber?: string; licenseTypeName?: string;
  licenseExpiryDate?: IsoDate; photoId?: Id; activeAssignments: number; currentEquipment?: string; isActive: boolean;
}
export interface DriverDto {
  id: Id; fullName: string; nationalId?: string; phone?: string; address?: string; employmentStatus: EmploymentStatus; hireDate?: IsoDate;
  licenseNumber?: string; licenseTypeId?: Id; licenseTypeName?: string; licenseExpiryDate?: IsoDate; photoId?: Id; notes?: string; isActive: boolean; createdAt: string;
}

export interface FuelListItem {
  id: Id; fuelDate: IsoDate; equipmentId: Id; equipmentCode: string; equipmentName: string; projectId?: Id; projectName?: string;
  driverId?: Id; driverName?: string; fuelTypeId: Id; fuelTypeName: string; unit: string; quantity: number; pricePerUnit: number; totalAmount: number;
  meterReading?: number; isFullTank: boolean; station?: string; attachmentId?: Id; notes?: string;
}
export interface FuelSegmentDto { fillId: Id; date: IsoDate; startMeter?: number; endMeter?: number; distance: number; fuel: number; status: FuelSegmentStatus; meterPerUnit?: number; unitsPer100?: number; unitsPerMeter?: number; isAnomaly: boolean; }
export interface FuelConsumptionDto {
  equipmentId: Id; equipmentName: string; meterType: MeterType; unit: string; totalFuel: number; totalAmount: number; validDistance: number; validFuel: number;
  validSegments: number; averageMeterPerUnit?: number; averageUnitsPer100?: number; averageUnitsPerMeter?: number; anomalyCount: number; segments: FuelSegmentDto[];
}

export interface MaintenanceListItem {
  id: Id; maintenanceDate: IsoDate; equipmentId: Id; equipmentCode: string; equipmentName: string; projectId?: Id; projectName?: string;
  maintenanceTypeId: Id; maintenanceTypeName: string; meterReading?: number; description?: string; workshop?: string; partsCost: number; laborCost: number;
  otherCost: number; totalCost: number; downtimeDays?: number; nextDueDate?: IsoDate; nextDueMeter?: number; attachmentId?: Id; notes?: string;
}
export interface MaintenancePlanDto { id: Id; equipmentId: Id; equipmentName: string; maintenanceTypeId: Id; maintenanceTypeName: string; intervalKm?: number; intervalHours?: number; intervalDays?: number; lastDoneDate?: IsoDate; lastDoneMeter?: number; isActive: boolean; notes?: string; }
export interface MaintenanceReminder {
  equipmentId: Id; equipmentCode: string; equipmentName: string; meterType: MeterType; currentMeter: number; maintenanceTypeId: Id; maintenanceTypeName: string;
  lastDoneDate?: IsoDate; lastDoneMeter?: number; nextDueDate?: IsoDate; nextDueMeter?: number; daysRemaining?: number; meterRemaining?: number; status: MaintenanceDueStatus; planId?: Id;
}

export interface OvertimeListItem {
  id: Id; workDate: IsoDate; driverId: Id; driverName: string; equipmentId?: Id; equipmentName?: string; projectId?: Id; projectName?: string;
  normalHours: number; overtimeHours: number; hourlyRate: number; amount: number; description?: string; approvalStatus: ApprovalStatus; approvedAt?: string; approvedBy?: string;
}
export interface OvertimeRateDto { id: Id; driverId?: Id; driverName?: string; hourlyRate: number; effectiveFrom: IsoDate; effectiveTo?: IsoDate; notes?: string; }

export interface ExpenseListItem {
  id: Id; expenseDate: IsoDate; equipmentId?: Id; equipmentCode?: string; equipmentName?: string; projectId?: Id; projectName?: string;
  categoryId: Id; categoryName: string; categoryKind: ExpenseSystemKind; amount: number; quantity?: number; unitPrice?: number; meterReading?: number;
  description?: string; sourceType: ExpenseSourceType; sourceId?: Id; attachmentId?: Id; notes?: string; isReadOnly: boolean;
}

export interface DepreciationItem {
  equipmentId: Id; equipmentCode: string; equipmentName: string; categoryName: string; purchaseDate: IsoDate; purchasePrice: number; residualValue: number;
  usefulLifeMonths: number; startDate: IsoDate; endDate: IsoDate; disposalDate?: IsoDate; monthlyDepreciation: number; annualDepreciation: number;
  periodDepreciation: number; accumulatedDepreciation: number; bookValue: number; fullyDepreciated: boolean;
}
export interface DepreciationSummary { asOf: IsoDate; from?: IsoDate; to?: IsoDate; totalPurchasePrice: number; totalAccumulated: number; totalBookValue: number; totalPeriodDepreciation: number; totalMonthly: number; items: DepreciationItem[]; }
export interface DepreciationScheduleRow { periodStart: IsoDate; periodEnd: IsoDate; depreciation: number; accumulated: number; bookValue: number; }

export interface CostTotals { totalCash: number; fuel: number; maintenance: number; spareParts: number; rental: number; overtime: number; other: number; depreciation: number; totalCostOfOwnership: number; }
export interface CostBreakdownRow { id?: Id; name: string; totalCash: number; fuel: number; maintenance: number; rental: number; overtime: number; other: number; depreciation: number; totalCostOfOwnership: number; }
export interface CategoryTotal { categoryId: Id; categoryName: string; kind: ExpenseSystemKind; amount: number; count: number; }
export interface MonthlyTotal { year: number; month: number; totalCash: number; fuel: number; maintenance: number; rental: number; overtime: number; other: number; }
export interface CostReport { totals: CostTotals; byCategory: CategoryTotal[]; byEquipment?: CostBreakdownRow[]; byProject?: CostBreakdownRow[]; byMonth: MonthlyTotal[]; }

export interface DashboardCounts {
  totalEquipment: number; owned: number; rented: number; available: number; operating: number; underMaintenance: number; outOfService: number;
  inactive: number; unassigned: number; activeProjects: number; totalProjects: number; activeDrivers: number; maintenanceOverdue: number;
  maintenanceDueSoon: number; licensesExpiring: number;
}
export interface FuelMonth { year: number; month: number; quantity: number; amount: number; }
export interface UtilizationRow { equipmentId: Id; code: string; name: string; utilizationPercent?: number; operatingDays: number; downtimeDays: number; }
export interface LicenseAlert { driverId: Id; fullName: string; phone?: string; expiryDate: IsoDate; daysRemaining: number; }
export interface OwnershipCost { ownership: OwnershipType; totalCash: number; depreciation: number; }
export interface DashboardDto {
  from: IsoDate; to: IsoDate; counts: DashboardCounts; totals: CostTotals; byMonth: MonthlyTotal[]; byCategory: CategoryTotal[];
  topProjects: CostBreakdownRow[]; topEquipment: CostBreakdownRow[]; fuelByMonth: FuelMonth[]; fleetUtilization?: number;
  utilization: UtilizationRow[]; byOwnership: OwnershipCost[]; maintenance: MaintenanceReminder[]; licenses: LicenseAlert[]; recentTransfers: TransferListItem[];
}

export interface AttachmentDto { id: Id; originalName: string; contentType: string; sizeBytes: number; uploadedAt: string; }
