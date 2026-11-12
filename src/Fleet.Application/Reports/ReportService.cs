using Fleet.Application.Abstractions;
using Fleet.Application.Common;
using Fleet.Application.Costs;
using Fleet.Application.Depreciation;
using Fleet.Application.Expenses;
using Fleet.Application.Fuel;
using Fleet.Application.Maintenance;
using Fleet.Application.Overtime;
using Fleet.Application.Settings;
using UtilizationCalculator = Fleet.Domain.Calculations.UtilizationCalculator;
using StatusSpan = Fleet.Domain.Calculations.StatusSpan;
using Amount = Fleet.Domain.Calculations.Money;
using Fleet.Domain.Common;
using Fleet.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using static Fleet.Application.Reports.ColumnKind;

namespace Fleet.Application.Reports;

/// <summary>
/// Builds every report as a renderer-independent <see cref="ReportDocument"/>. Figures come from the same services/queries
/// used by the screens and the dashboard, so exported totals always match what users see.
/// </summary>
public class ReportService(IAppDbContext db, IClock clock, CostQueryService costs, DepreciationService depreciation, FuelService fuel,
    MaintenanceService maintenance, SettingsService settings, IReportRenderer renderer, IFileStorage files, ICurrentUser user)
{
    public async Task<ReportFile> ExportAsync(string key, ReportFilter f, ReportFormat format, CancellationToken ct = default)
    {
        var doc = await BuildAsync(key, f, ct);
        var s = await settings.GetEntityAsync(ct);
        byte[]? logo = null;
        if (s.LogoAttachmentId is { } logoId && await db.Attachments.FindAsync([logoId], ct) is { } a && File.Exists(files.GetFullPath(a)))
            logo = await File.ReadAllBytesAsync(files.GetFullPath(a), ct);
        var brand = new ReportBranding(s.CompanyName, s.Address, s.Phone, s.Email, s.TaxNumber, logo, s.CurrencySymbol, s.DateFormat,
            user.UserName ?? "", DateTime.Now);
        var stamp = clock.Today.ToString("yyyy-MM-dd");
        return format == ReportFormat.Pdf
            ? new ReportFile(renderer.RenderPdf(doc, brand), "application/pdf", $"{doc.Title} {stamp}.pdf")
            : new ReportFile(renderer.RenderExcel(doc, brand), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"{doc.Title} {stamp}.xlsx");
    }

    private const string EquipmentGroup = "تقارير المعدات";
    private const string FinancialGroup = "التقارير المالية";
    private const string OperationalGroup = "التقارير التشغيلية";

    public static readonly IReadOnlyList<ReportInfo> Catalog =
    [
        new("equipment-inventory", "سجل المعدات", EquipmentGroup, "كل المعدات مع النوع والملكية والحالة والمشروع الحالي والعداد", ["category", "ownership", "status", "project"]),
        new("equipment-by-project", "المعدات حسب المشروع", EquipmentGroup, "المعدات المخصصة حالياً لكل مشروع", ["project"]),
        new("assignment-history", "سجل تخصيص المعدات", EquipmentGroup, "فترات عمل المعدات في المشروعات وحركات النقل", ["period", "project", "equipment"]),

        new("operating-expenses", "مصروفات التشغيل", FinancialGroup, "كل قيود دفتر المصروفات (يدوي وتلقائي)", ["period", "project", "equipment", "expenseCategory", "ownership"]),
        new("fuel", "تقرير الوقود", FinancialGroup, "عمليات التموين بالكميات والأسعار", ["period", "project", "equipment", "driver"]),
        new("maintenance", "تقرير الصيانة", FinancialGroup, "عمليات الصيانة وتكلفة قطع الغيار والمصنعية", ["period", "project", "equipment"]),
        new("spare-parts", "قطع الغيار", FinancialGroup, "مصروفات قطع الغيار من الصيانة والمشتريات", ["period", "project", "equipment"]),
        new("rental", "مصروفات الإيجار", FinancialGroup, "قيود الإيجار الشهرية للمعدات المؤجرة", ["period", "project", "equipment"]),
        new("overtime", "الوقت الإضافي", FinancialGroup, "ساعات وقيم الوقت الإضافي للسائقين", ["period", "project", "driver", "approval"]),
        new("depreciation", "جدول الإهلاك", FinancialGroup, "الإهلاك ومجمع الإهلاك والقيمة الدفترية (غير نقدي)", ["asOf", "period", "category", "project"]),
        new("equipment-depreciation-schedule", "جدول الإهلاك الشهري للمعدة", FinancialGroup, "قسط ثابت محسوب يومياً لكل شهر من عمر المعدة — غير نقدي", ["equipment"]),
        new("cost-by-equipment", "التكلفة الإجمالية لكل معدة", FinancialGroup, "التكاليف النقدية والإهلاك لكل معدة", ["period", "project", "ownership"]),
        new("cost-by-project", "التكلفة الإجمالية لكل مشروع", FinancialGroup, "التكاليف النقدية والإهلاك الموزع لكل مشروع", ["period", "ownership"]),

        new("fuel-consumption", "معدلات استهلاك الوقود", OperationalGroup, "متوسط الاستهلاك والقراءات غير الطبيعية لكل معدة", ["period", "project", "equipment"]),
        new("meter-readings", "قراءات العدادات", OperationalGroup, "سجل قراءات العداد ومصادرها", ["period", "equipment"]),
        new("utilization", "التشغيل والتوقف", OperationalGroup, "أيام التشغيل والتوقف ومعدل التشغيل لكل معدة", ["period", "category", "ownership"]),
        new("maintenance-schedule", "جدول الصيانة الدورية", OperationalGroup, "مواعيد الصيانة القادمة والمتأخرة", ["equipment"]),
        new("driver-assignments", "تعيينات السائقين", OperationalGroup, "فترات عمل السائقين على المعدات", ["period", "driver", "equipment"]),
        new("license-expiry", "صلاحية رخص القيادة", OperationalGroup, "تواريخ انتهاء رخص السائقين", []),
        new("equipment-license-expiry", "صلاحية رخص المعدات", OperationalGroup, "تواريخ انتهاء تراخيص المعدات والمتبقي على كل رخصة", ["category", "project"]),
    ];

    public async Task<ReportDocument> BuildAsync(string key, ReportFilter f, CancellationToken ct = default)
    {
        var info = Catalog.FirstOrDefault(r => r.Key == key) ?? throw new NotFoundException("التقرير", key);
        if (f.From > f.To) throw new DomainException("تاريخ البداية يجب أن يسبق تاريخ النهاية", "from");
        var doc = key switch
        {
            "equipment-inventory" => await InventoryAsync(f, ct),
            "equipment-by-project" => await ByProjectAsync(f, ct),
            "assignment-history" => await AssignmentHistoryAsync(f, ct),
            "operating-expenses" => await LedgerAsync(f, null, ct),
            "spare-parts" => await LedgerAsync(f, ExpenseSystemKind.SpareParts, ct),
            "rental" => await LedgerAsync(f, ExpenseSystemKind.Rental, ct),
            "fuel" => await FuelAsync(f, ct),
            "maintenance" => await MaintenanceAsync(f, ct),
            "overtime" => await OvertimeAsync(f, ct),
            "depreciation" => await DepreciationAsync(f, ct),
            "equipment-depreciation-schedule" => await DepreciationScheduleAsync(f, ct),
            "cost-by-equipment" => await CostByEquipmentAsync(f, ct),
            "cost-by-project" => await CostByProjectAsync(f, ct),
            "fuel-consumption" => await FuelConsumptionAsync(f, ct),
            "meter-readings" => await MeterReadingsAsync(f, ct),
            "utilization" => await UtilizationAsync(f, ct),
            "maintenance-schedule" => await ScheduleAsync(f, ct),
            "driver-assignments" => await DriverAssignmentsAsync(f, ct),
            "license-expiry" => await LicensesAsync(ct),
            "equipment-license-expiry" => await EquipmentLicensesAsync(f, ct),
            _ => throw new NotFoundException("التقرير", key),
        };
        return doc with { Key = info.Key, Title = info.Title, Group = info.Group, Filters = await DescribeAsync(info, f, ct) };
    }

    private static ReportDocument Doc(List<ReportTable> tables, List<ReportSummaryItem>? summary = null, string? note = null, bool landscape = true) =>
        new("", "", "", [], summary ?? [], tables, note, landscape);

    private static ReportTable Table(string? title, List<ReportColumn> cols, IEnumerable<object?[]> rows) => new(title, cols, rows.ToList());

    // ======================= Equipment =======================

    private async Task<ReportDocument> InventoryAsync(ReportFilter f, CancellationToken ct)
    {
        var today = clock.Today;
        var rows = await db.Equipment.AsNoTracking()
            .WhereIf(f.CategoryId.HasValue, e => e.CategoryId == f.CategoryId)
            .WhereIf(f.Ownership.HasValue, e => e.Ownership == f.Ownership)
            .WhereIf(f.Status.HasValue, e => e.Status == f.Status)
            .WhereIf(f.ProjectId.HasValue, e => e.ProjectAssignments.Any(a => a.EndDate == null && a.ProjectId == f.ProjectId))
            .OrderBy(e => e.Code)
            .Select(e => new
            {
                e.Code, e.Name, e.PlateNumber, e.ChassisNumber, Category = e.Category!.NameAr, e.Manufacturer, e.Model, e.ManufactureYear,
                e.Ownership, e.Status, e.MeterType, e.CurrentMeterReading, e.IsActive,
                Project = e.ProjectAssignments.Where(a => a.EndDate == null).Select(a => a.Project!.Name).FirstOrDefault(),
                Driver = e.DriverAssignments.Where(a => a.EndDate == null || a.EndDate >= today).OrderByDescending(a => a.IsPrimary).Select(a => a.Driver!.FullName).FirstOrDefault(),
            }).ToListAsync(ct);

        var cols = new List<ReportColumn>
        {
            new("الكود", Width: 0.8f), new("المعدة", Width: 1.6f), new("اللوحة / الشاسيه"), new("النوع"), new("الشركة / الموديل", Width: 1.2f),
            new("سنة الصنع", Integer, Width: 0.6f), new("الملكية", Width: 0.6f), new("الحالة", Width: 0.8f), new("المشروع الحالي", Width: 1.3f),
            new("السائق"), new("العداد", Number), new("الوحدة", Width: 0.5f),
        };
        return Doc([Table(null, cols, rows.Select(e => new object?[]
        {
            e.Code, e.Name, e.PlateNumber ?? e.ChassisNumber, e.Category, string.Join(" / ", new[] { e.Manufacturer, e.Model }.Where(x => !string.IsNullOrWhiteSpace(x))),
            e.ManufactureYear, Labels.Of(e.Ownership), e.IsActive ? Labels.Of(e.Status) : "غير نشطة", e.Project ?? "غير مخصصة", e.Driver,
            e.CurrentMeterReading, Labels.Unit(e.MeterType),
        }))],
        [
            new("عدد المعدات", rows.Count, Integer),
            new("تمليك", rows.Count(r => r.Ownership == OwnershipType.Owned), Integer),
            new("إيجار", rows.Count(r => r.Ownership == OwnershipType.Rented), Integer),
            new("غير مخصصة", rows.Count(r => r.Project == null), Integer),
        ]);
    }

    private async Task<ReportDocument> ByProjectAsync(ReportFilter f, CancellationToken ct)
    {
        var today = clock.Today;
        var rows = await db.ProjectAssignments.AsNoTracking()
            .Where(a => a.EndDate == null)
            .WhereIf(f.ProjectId.HasValue, a => a.ProjectId == f.ProjectId)
            .OrderBy(a => a.Project!.Name).ThenBy(a => a.Equipment!.Code)
            .Select(a => new { Project = a.Project!.Name, ProjectCode = a.Project.Code, a.Equipment!.Code, a.Equipment.Name, Category = a.Equipment.Category!.NameAr,
                a.Equipment.Ownership, a.Equipment.Status, a.StartDate, a.Equipment.CurrentMeterReading })
            .ToListAsync(ct);

        var cols = new List<ReportColumn> { new("الكود", Width: 0.8f), new("المعدة", Width: 1.6f), new("النوع"), new("الملكية", Width: 0.6f),
            new("الحالة", Width: 0.8f), new("منذ", Date), new("الأيام", Integer, Width: 0.6f), new("العداد الحالي", Number) };
        var tables = rows.GroupBy(r => $"{r.ProjectCode} — {r.Project}")
            .Select(g => Table($"{g.Key} ({g.Count()} معدة)", cols, g.Select(r => new object?[]
            {
                r.Code, r.Name, r.Category, Labels.Of(r.Ownership), Labels.Of(r.Status), r.StartDate, today.DayNumber - r.StartDate.DayNumber + 1, r.CurrentMeterReading,
            }))).ToList();
        if (tables.Count == 0) tables.Add(Table(null, cols, []));
        return Doc(tables, [new("المشروعات", rows.Select(r => r.Project).Distinct().Count(), Integer), new("المعدات المخصصة", rows.Count, Integer)], landscape: false);
    }

    private async Task<ReportDocument> AssignmentHistoryAsync(ReportFilter f, CancellationToken ct)
    {
        var today = clock.Today;
        var rows = await db.ProjectAssignments.AsNoTracking()
            .WhereIf(f.ProjectId.HasValue, a => a.ProjectId == f.ProjectId)
            .WhereIf(f.EquipmentId.HasValue, a => a.EquipmentId == f.EquipmentId)
            .WhereIf(f.To.HasValue, a => a.StartDate <= f.To)
            .WhereIf(f.From.HasValue, a => a.EndDate == null || a.EndDate >= f.From)
            .OrderBy(a => a.Equipment!.Code).ThenBy(a => a.StartDate)
            .Select(a => new { a.Equipment!.Code, a.Equipment.Name, Project = a.Project!.Name, a.StartDate, a.EndDate, a.StartMeter, a.EndMeter, a.Notes })
            .ToListAsync(ct);
        var cols = new List<ReportColumn> { new("الكود", Width: 0.8f), new("المعدة", Width: 1.5f), new("المشروع", Width: 1.5f), new("من", Date), new("إلى", Date),
            new("الأيام", Integer, Width: 0.6f), new("عداد البداية", Number), new("عداد النهاية", Number), new("ملاحظات", Width: 1.4f) };
        return Doc([Table(null, cols, rows.Select(r => new object?[]
        {
            r.Code, r.Name, r.Project, r.StartDate, r.EndDate ?? (object)"حالي", (r.EndDate ?? today).DayNumber - r.StartDate.DayNumber + 1, r.StartMeter, r.EndMeter, r.Notes,
        }))], [new("عدد الفترات", rows.Count, Integer)]);
    }

    // ======================= Financial =======================

    private async Task<ReportDocument> LedgerAsync(ReportFilter f, ExpenseSystemKind? kind, CancellationToken ct)
    {
        var q = ExpenseService.Filter(db.Expenses.AsNoTracking(), new ExpenseQuery
            {
                From = f.From, To = f.To, ProjectId = f.ProjectId, EquipmentId = f.EquipmentId, CategoryId = f.ExpenseCategoryId,
            })
            .WhereIf(kind.HasValue, e => e.Category!.SystemKind == kind)
            .WhereIf(f.Ownership.HasValue, e => e.Equipment != null && e.Equipment.Ownership == f.Ownership);
        var rows = await q.OrderBy(e => e.ExpenseDate).ThenBy(e => e.Id).Select(ExpenseService.ToItem).ToListAsync(ct);

        var cols = new List<ReportColumn> { new("التاريخ", Date), new("المعدة", Width: 1.4f), new("المشروع", Width: 1.3f), new("البند"),
            new("البيان", Width: 1.8f), new("المصدر", Width: 0.6f), new("الكمية", Number, Width: 0.7f), new("المبلغ", Money, Total: true) };
        var table = Table(null, cols, rows.Select(r => new object?[]
        {
            r.ExpenseDate, r.EquipmentCode is null ? null : $"{r.EquipmentCode} - {r.EquipmentName}", r.ProjectName, r.CategoryName, r.Description,
            Labels.Of(r.SourceType), r.Quantity, r.Amount,
        }));
        var byCategory = rows.GroupBy(r => r.CategoryName).OrderByDescending(g => g.Sum(r => r.Amount))
            .Select(g => new object?[] { g.Key, g.Count(), Amount.Round(g.Sum(r => r.Amount)) });
        var tables = new List<ReportTable> { table };
        if (kind is null) tables.Insert(0, Table("الإجمالي حسب البند", [new("البند", Width: 2), new("عدد القيود", Integer), new("المبلغ", Money, Total: true)], byCategory));
        return Doc(tables, [new("إجمالي المبلغ", Amount.Round(rows.Sum(r => r.Amount))), new("عدد القيود", rows.Count, Integer)],
            kind == ExpenseSystemKind.SpareParts ? "تشمل قطع الغيار المسجلة من عمليات الصيانة والمشتريات اليدوية." : "الإهلاك غير مدرج لأنه تكلفة غير نقدية.");
    }

    private async Task<ReportDocument> FuelAsync(ReportFilter f, CancellationToken ct)
    {
        var rows = await FuelService.Filter(db.FuelTransactions.AsNoTracking(),
                new FuelQuery { From = f.From, To = f.To, ProjectId = f.ProjectId, EquipmentId = f.EquipmentId, DriverId = f.DriverId })
            .OrderBy(x => x.FuelDate).ThenBy(x => x.Id).Select(FuelService.ToItem).ToListAsync(ct);
        var cols = new List<ReportColumn> { new("التاريخ", Date), new("المعدة", Width: 1.5f), new("المشروع", Width: 1.2f), new("السائق"), new("الوقود", Width: 0.7f),
            new("الكمية", Number, Total: true, Width: 0.8f), new("السعر", Money, Width: 0.7f), new("الإجمالي", Money, Total: true), new("العداد", Number),
            new("التفويل", Width: 0.6f), new("المحطة") };
        return Doc([Table(null, cols, rows.Select(r => new object?[]
        {
            r.FuelDate, $"{r.EquipmentCode} - {r.EquipmentName}", r.ProjectName, r.DriverName, r.FuelTypeName, r.Quantity, r.PricePerUnit, r.TotalAmount,
            r.MeterReading, r.IsFullTank ? "كامل" : "جزئي", r.Station,
        }))],
        [
            new("إجمالي الكمية", Amount.Round(rows.Sum(r => r.Quantity)), Number),
            new("إجمالي التكلفة", Amount.Round(rows.Sum(r => r.TotalAmount))),
            new("متوسط السعر", rows.Sum(r => r.Quantity) > 0 ? Math.Round(rows.Sum(r => r.TotalAmount) / rows.Sum(r => r.Quantity), 2) : null),
            new("عدد العمليات", rows.Count, Integer),
        ]);
    }

    private async Task<ReportDocument> MaintenanceAsync(ReportFilter f, CancellationToken ct)
    {
        var rows = await MaintenanceService.Filter(db.MaintenanceRecords.AsNoTracking(),
                new MaintenanceQuery { From = f.From, To = f.To, ProjectId = f.ProjectId, EquipmentId = f.EquipmentId })
            .OrderBy(m => m.MaintenanceDate).ThenBy(m => m.Id).Select(MaintenanceService.ToItem).ToListAsync(ct);
        var cols = new List<ReportColumn> { new("التاريخ", Date), new("المعدة", Width: 1.5f), new("النوع"), new("الوصف", Width: 1.6f), new("الورشة"),
            new("العداد", Number, Width: 0.8f), new("قطع غيار", Money, Total: true), new("مصنعية", Money, Total: true), new("أخرى", Money, Total: true),
            new("الإجمالي", Money, Total: true), new("أيام التوقف", Integer, Total: true, Width: 0.6f) };
        return Doc([Table(null, cols, rows.Select(r => new object?[]
        {
            r.MaintenanceDate, $"{r.EquipmentCode} - {r.EquipmentName}", r.MaintenanceTypeName, r.Description, r.Workshop, r.MeterReading,
            r.PartsCost, r.LaborCost, r.OtherCost, r.TotalCost, r.DowntimeDays,
        }))],
        [
            new("إجمالي الصيانة", Amount.Round(rows.Sum(r => r.TotalCost))),
            new("قطع الغيار", Amount.Round(rows.Sum(r => r.PartsCost))),
            new("المصنعية والأخرى", Amount.Round(rows.Sum(r => r.LaborCost + r.OtherCost))),
            new("عدد العمليات", rows.Count, Integer),
        ]);
    }

    private async Task<ReportDocument> OvertimeAsync(ReportFilter f, CancellationToken ct)
    {
        var rows = await OvertimeService.Filter(db.OvertimeRecords.AsNoTracking(),
                new OvertimeQuery { From = f.From, To = f.To, ProjectId = f.ProjectId, DriverId = f.DriverId, ApprovalStatus = f.ApprovalStatus })
            .OrderBy(o => o.WorkDate).ThenBy(o => o.Id).Select(OvertimeService.ToItem).ToListAsync(ct);
        var cols = new List<ReportColumn> { new("التاريخ", Date), new("السائق", Width: 1.4f), new("المعدة", Width: 1.3f), new("المشروع", Width: 1.2f),
            new("الساعات", Number, Total: true, Width: 0.7f), new("سعر الساعة", Money), new("القيمة", Money, Total: true), new("الحالة", Width: 0.8f), new("البيان", Width: 1.4f) };
        var approved = rows.Where(r => r.ApprovalStatus == ApprovalStatus.Approved).ToList();
        var byDriver = approved.GroupBy(r => r.DriverName).OrderByDescending(g => g.Sum(r => r.Amount))
            .Select(g => new object?[] { g.Key, Amount.Round(g.Sum(r => r.OvertimeHours)), Amount.Round(g.Sum(r => r.Amount)) });
        return Doc(
        [
            Table("الإجمالي المعتمد حسب السائق", [new("السائق", Width: 2), new("الساعات", Number, Total: true), new("القيمة", Money, Total: true)], byDriver),
            Table("التفاصيل", cols, rows.Select(r => new object?[]
            {
                r.WorkDate, r.DriverName, r.EquipmentName, r.ProjectName, r.OvertimeHours, r.HourlyRate, r.Amount, Labels.Of(r.ApprovalStatus), r.Description,
            })),
        ],
        [
            new("القيمة المعتمدة", Amount.Round(approved.Sum(r => r.Amount))),
            new("الساعات المعتمدة", Amount.Round(approved.Sum(r => r.OvertimeHours)), Number),
            new("قيد المراجعة", Amount.Round(rows.Where(r => r.ApprovalStatus == ApprovalStatus.Pending).Sum(r => r.Amount))),
        ], "يُحتسب الوقت الإضافي المعتمد فقط ضمن التكاليف.");
    }

    private async Task<ReportDocument> DepreciationAsync(ReportFilter f, CancellationToken ct)
    {
        var s = await depreciation.ListAsync(new DepreciationQuery { AsOf = f.AsOf, From = f.From, To = f.To, CategoryId = f.CategoryId, ProjectId = f.ProjectId }, ct);
        var hasPeriod = f.From.HasValue || f.To.HasValue;
        var cols = new List<ReportColumn> { new("الكود", Width: 0.7f), new("المعدة", Width: 1.5f), new("النوع"), new("تاريخ الشراء", Date), new("سعر الشراء", Money, Total: true),
            new("التخريدية", Money, Total: true), new("العمر (شهر)", Integer, Width: 0.6f), new("الإهلاك الشهري", Money, Total: true),
            new(hasPeriod ? "إهلاك الفترة" : "إهلاك الفترة (—)", Money, Total: true), new("مجمع الإهلاك", Money, Total: true), new("القيمة الدفترية", Money, Total: true) };
        return Doc([Table(null, cols, s.Items.Select(i => new object?[]
        {
            i.EquipmentCode, i.EquipmentName, i.CategoryName, i.PurchaseDate, i.PurchasePrice, i.ResidualValue, i.UsefulLifeMonths, i.MonthlyDepreciation,
            i.PeriodDepreciation, i.AccumulatedDepreciation, i.BookValue,
        }))],
        [
            new("إجمالي تكلفة الشراء", s.TotalPurchasePrice),
            new("مجمع الإهلاك", s.TotalAccumulated),
            new("صافي القيمة الدفترية", s.TotalBookValue),
            new("إهلاك الفترة", s.TotalPeriodDepreciation),
        ], $"القسط الثابت محسوب يومياً حتى {s.AsOf:dd/MM/yyyy}. الإهلاك تكلفة غير نقدية ولا يدخل ضمن المصروفات النقدية.");
    }

    private async Task<ReportDocument> DepreciationScheduleAsync(ReportFilter f, CancellationToken ct)
    {
        if (f.EquipmentId is not { } id) throw new DomainException("اختر المعدة لعرض جدول الإهلاك", "equipmentId");
        var p = await db.DepreciationProfiles.AsNoTracking().Where(x => x.EquipmentId == id)
            .Select(x => new { x.PurchaseDate, x.PurchasePrice, x.ResidualValue, x.UsefulLifeMonths, x.DepreciationStartDate })
            .FirstOrDefaultAsync(ct) ?? throw new DomainException("لا توجد بيانات إهلاك لهذه المعدة", "equipmentId");
        var rows = await depreciation.ScheduleAsync(id, ct);
        var today = clock.Today;
        var current = rows.LastOrDefault(r => r.PeriodStart <= today);
        var cols = new List<ReportColumn> { new("#", Integer, Width: 0.4f), new("من", Date), new("إلى", Date),
            new("إهلاك الفترة", Money, Total: true), new("مجمع الإهلاك", Money), new("القيمة الدفترية", Money) };
        return Doc([Table(null, cols, rows.Select((r, i) => new object?[]
            {
                i + 1, r.PeriodStart, r.PeriodEnd, r.Depreciation, r.Accumulated, r.BookValue,
            }))],
            [
                new("سعر الشراء", p.PurchasePrice),
                new("القيمة التخريدية", p.ResidualValue),
                new("العمر الإنتاجي (شهر)", p.UsefulLifeMonths, Integer),
                new("مجمع الإهلاك حتى اليوم", current?.Accumulated ?? 0m),
                new("القيمة الدفترية الحالية", current?.BookValue ?? p.PurchasePrice),
            ],
            $"تاريخ الشراء {p.PurchaseDate:dd/MM/yyyy} — بداية الإهلاك {p.DepreciationStartDate:dd/MM/yyyy}. قسط ثابت محسوب يومياً، والإهلاك تكلفة غير نقدية.",
            landscape: false);
    }

    private static readonly List<ReportColumn> BreakdownColumns =
    [
        new("الاسم", Width: 2f), new("وقود", Money, Total: true), new("صيانة", Money, Total: true), new("إيجار", Money, Total: true), new("إضافي", Money, Total: true),
        new("أخرى", Money, Total: true), new("الإجمالي النقدي", Money, Total: true), new("الإهلاك", Money, Total: true), new("التكلفة الكلية", Money, Total: true),
    ];

    private static object?[] BreakdownRow(CostBreakdownRow r) =>
        [r.Name, r.Fuel, r.Maintenance, r.Rental, r.Overtime, r.Other, r.TotalCash, r.Depreciation, r.TotalCostOfOwnership];

    private static List<ReportSummaryItem> TotalsSummary(CostTotals t) =>
    [
        new("إجمالي المصروفات النقدية", t.TotalCash), new("الإهلاك (غير نقدي)", t.Depreciation), new("التكلفة الإجمالية للملكية", t.TotalCostOfOwnership),
    ];

    private async Task<ReportDocument> CostByEquipmentAsync(ReportFilter f, CancellationToken ct)
    {
        var filter = new CostFilter { From = f.From, To = f.To, ProjectId = f.ProjectId, Ownership = f.Ownership };
        var rows = await costs.ByEquipmentAsync(filter, ct);
        return Doc([Table(null, BreakdownColumns, rows.Select(BreakdownRow))], TotalsSummary(await costs.TotalsAsync(filter, ct)),
            "الإهلاك معروض منفصلاً عن المصروفات النقدية. الإيجار يُسجَّل شهرياً من عقود الإيجار.");
    }

    private async Task<ReportDocument> CostByProjectAsync(ReportFilter f, CancellationToken ct)
    {
        var filter = new CostFilter { From = f.From, To = f.To, Ownership = f.Ownership };
        var rows = await costs.ByProjectAsync(filter, ct);
        return Doc([Table(null, BreakdownColumns, rows.Select(BreakdownRow))], TotalsSummary(await costs.TotalsAsync(filter, ct)),
            "الإهلاك موزع على المشروعات حسب أيام تخصيص كل معدة خلال الفترة.");
    }

    // ======================= Operational =======================

    private async Task<ReportDocument> FuelConsumptionAsync(ReportFilter f, CancellationToken ct)
    {
        var rows = await fuel.ConsumptionReportAsync(new FuelQuery { From = f.From, To = f.To, ProjectId = f.ProjectId, EquipmentId = f.EquipmentId }, ct);
        var cols = new List<ReportColumn> { new("المعدة", Width: 1.8f), new("نوع العداد", Width: 0.8f), new("إجمالي الوقود", Number, Total: true), new("التكلفة", Money, Total: true),
            new("المسافة/الساعات المحسوبة", Number), new("الوقود المحسوب", Number), new("فترات صالحة", Integer, Width: 0.6f),
            new("كم/لتر", Number, Width: 0.7f), new("لتر/100كم", Number, Width: 0.7f), new("لتر/ساعة", Number, Width: 0.7f), new("قراءات غير طبيعية", Integer, Width: 0.7f) };
        return Doc([Table(null, cols, rows.Select(r => new object?[]
        {
            r.EquipmentName, Labels.Of(r.MeterType), r.TotalFuel, r.TotalAmount, r.ValidDistance, r.ValidFuel, r.ValidSegments,
            r.AverageMeterPerUnit, r.AverageUnitsPer100, r.AverageUnitsPerMeter, r.AnomalyCount,
        }))], [new("إجمالي الوقود", Amount.Round(rows.Sum(r => r.TotalFuel)), Number), new("إجمالي التكلفة", Amount.Round(rows.Sum(r => r.TotalAmount))),
            new("قراءات غير طبيعية", rows.Sum(r => r.AnomalyCount), Integer)],
            "يُحسب الاستهلاك فقط بين تفويلين كاملين بقراءتي عداد صحيحتين، وتُضاف كميات التفويل الجزئي بينهما.");
    }

    private async Task<ReportDocument> MeterReadingsAsync(ReportFilter f, CancellationToken ct)
    {
        var rows = await db.MeterReadings.AsNoTracking()
            .WhereIf(f.EquipmentId.HasValue, m => m.EquipmentId == f.EquipmentId)
            .WhereIf(f.From.HasValue, m => m.ReadingDate >= f.From)
            .WhereIf(f.To.HasValue, m => m.ReadingDate <= f.To)
            .Join(db.Equipment, m => m.EquipmentId, e => e.Id, (m, e) => new { m.ReadingDate, m.Value, m.Source, m.IsCorrection, m.CorrectionReason, m.CreatedBy, e.Code, e.Name, e.MeterType, m.Id })
            .OrderBy(x => x.Code).ThenBy(x => x.ReadingDate).ThenBy(x => x.Id)
            .ToListAsync(ct);
        var cols = new List<ReportColumn> { new("الكود", Width: 0.7f), new("المعدة", Width: 1.5f), new("التاريخ", Date), new("القراءة", Number), new("الوحدة", Width: 0.5f),
            new("المصدر", Width: 0.8f), new("سبب التصحيح", Width: 1.4f), new("بواسطة") };
        return Doc([Table(null, cols, rows.Select(r => new object?[]
        {
            r.Code, r.Name, r.ReadingDate, r.Value, Labels.Unit(r.MeterType), Labels.Of(r.Source), r.CorrectionReason, r.CreatedBy,
        }))], [new("عدد القراءات", rows.Count, Integer), new("التصحيحات", rows.Count(r => r.IsCorrection), Integer)], landscape: false);
    }

    private async Task<ReportDocument> UtilizationAsync(ReportFilter f, CancellationToken ct)
    {
        var to = f.To ?? clock.Today;
        var from = f.From ?? new DateOnly(to.Year, to.Month, 1);
        var equipment = await db.Equipment.AsNoTracking()
            .WhereIf(f.CategoryId.HasValue, e => e.CategoryId == f.CategoryId)
            .WhereIf(f.Ownership.HasValue, e => e.Ownership == f.Ownership)
            .OrderBy(e => e.Code).Select(e => new { e.Id, e.Code, e.Name, Category = e.Category!.NameAr }).ToListAsync(ct);
        var ids = equipment.Select(e => e.Id).ToList();
        var spans = (await db.EquipmentStatusHistory.AsNoTracking()
                .Where(h => ids.Contains(h.EquipmentId) && h.FromDate <= to && (h.ToDate == null || h.ToDate >= from))
                .Select(h => new { h.EquipmentId, h.Status, h.FromDate, h.ToDate }).ToListAsync(ct))
            .ToLookup(h => h.EquipmentId);

        var rows = new List<object?[]>();
        int operating = 0, baseDays = 0, downtime = 0;
        foreach (var e in equipment)
        {
            var hist = spans[e.Id].Select(h => new StatusSpan(h.Status, h.FromDate, h.ToDate)).ToList();
            if (hist.Count == 0) continue;
            var r = UtilizationCalculator.Calculate(hist, from, to);
            operating += r.Days(EquipmentStatus.Operating);
            baseDays += r.AvailableBase;
            downtime += r.DowntimeDays;
            rows.Add([e.Code, e.Name, e.Category, r.Days(EquipmentStatus.Operating), r.Days(EquipmentStatus.Available), r.Days(EquipmentStatus.UnderMaintenance),
                r.Days(EquipmentStatus.OutOfService), r.Days(EquipmentStatus.Inactive), r.DowntimeDays, r.UtilizationPercent]);
        }
        var cols = new List<ReportColumn> { new("الكود", Width: 0.7f), new("المعدة", Width: 1.6f), new("النوع"), new("أيام التشغيل", Integer, Total: true),
            new("متاحة", Integer, Total: true), new("صيانة", Integer, Total: true), new("خارج الخدمة", Integer, Total: true), new("غير نشطة", Integer, Total: true),
            new("أيام التوقف", Integer, Total: true), new("معدل التشغيل", Percent) };
        return Doc([Table(null, cols, rows)],
        [
            new("معدل تشغيل الأسطول", baseDays > 0 ? Math.Round(100m * operating / baseDays, 1) : null, Percent),
            new("إجمالي أيام التوقف", downtime, Integer),
        ], $"الفترة من {from:dd/MM/yyyy} إلى {to:dd/MM/yyyy}. معدل التشغيل = أيام التشغيل ÷ (أيام الفترة − أيام عدم النشاط). التوقف = الصيانة + خارج الخدمة.");
    }

    private async Task<ReportDocument> ScheduleAsync(ReportFilter f, CancellationToken ct)
    {
        var rows = (await maintenance.RemindersAsync(f.EquipmentId, false, ct))
            .OrderBy(r => r.Status switch { MaintenanceDueStatus.Overdue => 0, MaintenanceDueStatus.DueSoon => 1, _ => 2 }).ThenBy(r => r.DaysRemaining ?? int.MaxValue).ToList();
        var cols = new List<ReportColumn> { new("الكود", Width: 0.7f), new("المعدة", Width: 1.5f), new("نوع الصيانة", Width: 1.2f), new("آخر تنفيذ", Date),
            new("عداد آخر تنفيذ", Number), new("الموعد (تاريخ)", Date), new("الموعد (عداد)", Number), new("العداد الحالي", Number), new("الأيام المتبقية", Integer),
            new("العداد المتبقي", Number), new("الحالة", Width: 0.7f) };
        return Doc([Table(null, cols, rows.Select(r => new object?[]
        {
            r.EquipmentCode, r.EquipmentName, r.MaintenanceTypeName, r.LastDoneDate, r.LastDoneMeter, r.NextDueDate, r.NextDueMeter, r.CurrentMeter,
            r.DaysRemaining, r.MeterRemaining, Labels.Of(r.Status),
        }))],
        [
            new("متأخرة", rows.Count(r => r.Status == MaintenanceDueStatus.Overdue), Integer),
            new("مستحقة قريباً", rows.Count(r => r.Status == MaintenanceDueStatus.DueSoon), Integer),
        ]);
    }

    private async Task<ReportDocument> DriverAssignmentsAsync(ReportFilter f, CancellationToken ct)
    {
        var today = clock.Today;
        var rows = await db.DriverAssignments.AsNoTracking()
            .WhereIf(f.DriverId.HasValue, a => a.DriverId == f.DriverId)
            .WhereIf(f.EquipmentId.HasValue, a => a.EquipmentId == f.EquipmentId)
            .WhereIf(f.To.HasValue, a => a.StartDate <= f.To)
            .WhereIf(f.From.HasValue, a => a.EndDate == null || a.EndDate >= f.From)
            .OrderBy(a => a.Driver!.FullName).ThenBy(a => a.StartDate)
            .Select(a => new { Driver = a.Driver!.FullName, a.Driver.Phone, a.Equipment!.Code, a.Equipment.Name, a.StartDate, a.EndDate, a.IsPrimary, a.Notes })
            .ToListAsync(ct);
        var cols = new List<ReportColumn> { new("السائق", Width: 1.4f), new("الهاتف"), new("المعدة", Width: 1.6f), new("أساسي", Width: 0.5f), new("من", Date),
            new("إلى", Date), new("الأيام", Integer, Width: 0.6f), new("ملاحظات", Width: 1.3f) };
        return Doc([Table(null, cols, rows.Select(r => new object?[]
        {
            r.Driver, r.Phone, $"{r.Code} - {r.Name}", r.IsPrimary ? "نعم" : "", r.StartDate, r.EndDate ?? (object)"حالي",
            (r.EndDate is { } e && e < today ? e : today).DayNumber - r.StartDate.DayNumber + 1, r.Notes,
        }))], [new("عدد التعيينات", rows.Count, Integer), new("الحالية", rows.Count(r => r.EndDate == null || r.EndDate >= today), Integer)]);
    }

    private async Task<ReportDocument> LicensesAsync(CancellationToken ct)
    {
        var today = clock.Today;
        var warn = (await settings.GetEntityAsync(ct)).LicenseExpiryWarningDays;
        var rows = await db.Drivers.AsNoTracking().Where(d => d.IsActive)
            .OrderBy(d => d.LicenseExpiryDate == null).ThenBy(d => d.LicenseExpiryDate)
            .Select(d => new { d.FullName, d.Phone, d.NationalId, d.LicenseNumber, Type = d.LicenseType!.NameAr, d.LicenseExpiryDate, d.EmploymentStatus })
            .ToListAsync(ct);
        string State(DateOnly? d) => d is null ? "غير مسجلة" : d < today ? "منتهية" : d.Value.DayNumber - today.DayNumber <= warn ? "تنتهي قريباً" : "سارية";
        var cols = new List<ReportColumn> { new("السائق", Width: 1.5f), new("الهاتف"), new("الرقم القومي"), new("رقم الرخصة"), new("نوع الرخصة"),
            new("تاريخ الانتهاء", Date), new("الأيام المتبقية", Integer), new("الحالة", Width: 0.8f), new("حالة العمل", Width: 0.8f) };
        return Doc([Table(null, cols, rows.Select(r => new object?[]
        {
            r.FullName, r.Phone, r.NationalId, r.LicenseNumber, r.Type, r.LicenseExpiryDate,
            r.LicenseExpiryDate is { } d ? d.DayNumber - today.DayNumber : null, State(r.LicenseExpiryDate), Labels.Of(r.EmploymentStatus),
        }))],
        [
            new("منتهية", rows.Count(r => r.LicenseExpiryDate < today), Integer),
            new($"تنتهي خلال {warn} يوم", rows.Count(r => r.LicenseExpiryDate >= today && r.LicenseExpiryDate.Value.DayNumber - today.DayNumber <= warn), Integer),
        ]);
    }

    private async Task<ReportDocument> EquipmentLicensesAsync(ReportFilter f, CancellationToken ct)
    {
        var today = clock.Today;
        var warn = (await settings.GetEntityAsync(ct)).LicenseExpiryWarningDays;
        var rows = await db.Equipment.AsNoTracking().Where(e => e.IsActive)
            .WhereIf(f.CategoryId.HasValue, e => e.CategoryId == f.CategoryId)
            .WhereIf(f.ProjectId.HasValue, e => e.ProjectAssignments.Any(a => a.EndDate == null && a.ProjectId == f.ProjectId))
            .OrderBy(e => e.LicenseExpiryDate == null).ThenBy(e => e.LicenseExpiryDate).ThenBy(e => e.Code)
            .Select(e => new
            {
                e.Code, e.Name, Plate = e.PlateNumber ?? e.ChassisNumber, Category = e.Category!.NameAr, e.LicenseNumber, e.LicenseExpiryDate,
                Project = e.ProjectAssignments.Where(a => a.EndDate == null).Select(a => a.Project!.Name).FirstOrDefault(),
            })
            .ToListAsync(ct);
        string State(DateOnly? d) => d is null ? "غير مسجلة" : d < today ? "منتهية" : d.Value.DayNumber - today.DayNumber <= warn ? "تنتهي قريباً" : "سارية";
        var cols = new List<ReportColumn> { new("الكود", Width: 0.7f), new("المعدة", Width: 1.5f), new("اللوحة/الشاسيه"), new("النوع"),
            new("المشروع الحالي", Width: 1.3f), new("رقم الرخصة"), new("تاريخ الانتهاء", Date), new("الأيام المتبقية", Integer), new("الحالة", Width: 0.8f) };
        return Doc([Table(null, cols, rows.Select(r => new object?[]
        {
            r.Code, r.Name, r.Plate, r.Category, r.Project, r.LicenseNumber, r.LicenseExpiryDate,
            r.LicenseExpiryDate is { } d ? d.DayNumber - today.DayNumber : null, State(r.LicenseExpiryDate),
        }))],
        [
            new("منتهية", rows.Count(r => r.LicenseExpiryDate < today), Integer),
            new($"تنتهي خلال {warn} يوم", rows.Count(r => r.LicenseExpiryDate >= today && r.LicenseExpiryDate.Value.DayNumber - today.DayNumber <= warn), Integer),
            new("غير مسجلة", rows.Count(r => r.LicenseExpiryDate == null), Integer),
        ]);
    }

    // ======================= Filter description =======================

    private async Task<List<ReportFilterValue>> DescribeAsync(ReportInfo info, ReportFilter f, CancellationToken ct)
    {
        var list = new List<ReportFilterValue>();
        if (info.Filters.Contains("period") && (f.From.HasValue || f.To.HasValue))
            list.Add(new("الفترة", $"{(f.From is { } a ? a.ToString("dd/MM/yyyy") : "البداية")} — {(f.To is { } b ? b.ToString("dd/MM/yyyy") : "اليوم")}"));
        if (info.Filters.Contains("asOf")) list.Add(new("حتى تاريخ", (f.AsOf ?? clock.Today).ToString("dd/MM/yyyy")));
        if (f.ProjectId is { } p) list.Add(new("المشروع", await db.Projects.Where(x => x.Id == p).Select(x => x.Name).FirstOrDefaultAsync(ct) ?? "?"));
        if (f.EquipmentId is { } e) list.Add(new("المعدة", await db.Equipment.Where(x => x.Id == e).Select(x => x.Code + " - " + x.Name).FirstOrDefaultAsync(ct) ?? "?"));
        if (f.DriverId is { } d) list.Add(new("السائق", await db.Drivers.Where(x => x.Id == d).Select(x => x.FullName).FirstOrDefaultAsync(ct) ?? "?"));
        if (f.CategoryId is { } c) list.Add(new("نوع المعدة", await db.EquipmentCategories.Where(x => x.Id == c).Select(x => x.NameAr).FirstOrDefaultAsync(ct) ?? "?"));
        if (f.ExpenseCategoryId is { } x2) list.Add(new("البند", await db.ExpenseCategories.Where(x => x.Id == x2).Select(x => x.NameAr).FirstOrDefaultAsync(ct) ?? "?"));
        if (f.Ownership is { } o) list.Add(new("الملكية", Labels.Of(o)));
        if (f.Status is { } s) list.Add(new("الحالة", Labels.Of(s)));
        if (f.ApprovalStatus is { } ap) list.Add(new("الاعتماد", Labels.Of(ap)));
        return list;
    }
}
