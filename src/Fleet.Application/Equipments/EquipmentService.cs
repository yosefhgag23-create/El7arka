using System.Linq.Expressions;
using Fleet.Application.Abstractions;
using Fleet.Application.Common;
using Fleet.Application.Settings;
using Fleet.Domain.Common;
using Fleet.Domain.Entities;
using Fleet.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using EquipmentEntity = Fleet.Domain.Entities.Equipment;

namespace Fleet.Application.Equipments;

public record EquipmentQuery : PageQuery
{
    public int? CategoryId { get; init; }
    public EquipmentStatus? Status { get; init; }
    public OwnershipType? Ownership { get; init; }
    public int? ProjectId { get; init; }
    public int? FuelTypeId { get; init; }
    public bool? Unassigned { get; init; }
    public bool? IncludeInactive { get; init; }
}

public record EquipmentListItem(int Id, string Code, string Name, string? PlateNumber, string? ChassisNumber, int CategoryId, string CategoryName,
    string? Manufacturer, string? Model, int? ManufactureYear, OwnershipType Ownership, EquipmentStatus Status, MeterType MeterType,
    decimal CurrentMeterReading, int? CurrentProjectId, string? CurrentProjectName, int? MainImageId, string? FuelTypeName, bool IsActive);

public record DepreciationProfileDto(DateOnly PurchaseDate, decimal PurchasePrice, decimal ResidualValue, int UsefulLifeMonths,
    DepreciationMethod Method, DateOnly DepreciationStartDate, DateOnly? DisposalDate);

public record RentalContractDto(int Id, string? ContractNo, string Lessor, string? LessorPhone, DateOnly StartDate, DateOnly? EndDate,
    RentalRateType RateType, decimal Rate, bool IncludesDriver, bool IncludesFuel, bool IncludesMaintenance, int? AttachmentId, string? Notes);

public record CurrentDriverDto(int AssignmentId, int DriverId, string FullName, string? Phone, DateOnly StartDate, bool IsPrimary);

public record EquipmentDto(int Id, string Code, string Name, string? PlateNumber, string? ChassisNumber, int CategoryId, string CategoryName,
    string? Manufacturer, string? Model, int? ManufactureYear, int FuelTypeId, string FuelTypeName, string FuelUnit, OwnershipType Ownership,
    MeterType MeterType, EquipmentStatus Status, decimal InitialMeterReading, decimal CurrentMeterReading, int? MainImageId,
    List<int> ImageIds, string? Notes, bool IsActive, int? CurrentProjectId, string? CurrentProjectName, DateOnly? CurrentProjectSince,
    DepreciationProfileDto? Depreciation, List<RentalContractDto> RentalContracts, List<CurrentDriverDto> CurrentDrivers, DateTime CreatedAt);

public record EquipmentInput(string Code, string Name, string? PlateNumber, string? ChassisNumber, int CategoryId, string? Manufacturer,
    string? Model, int? ManufactureYear, int FuelTypeId, OwnershipType Ownership, MeterType MeterType, decimal InitialMeterReading,
    string? Notes, DepreciationProfileDto? Depreciation);

public record StatusChangeInput(EquipmentStatus Status, DateOnly Date, string? Reason);

public record StatusHistoryDto(int Id, EquipmentStatus Status, DateOnly FromDate, DateOnly? ToDate, string? Reason, string? CreatedBy);

public class EquipmentInputValidator : AbstractValidator<EquipmentInput>
{
    public EquipmentInputValidator()
    {
        RuleFor(x => x.Code).RequiredText(50);
        RuleFor(x => x.Name).RequiredText(200);
        RuleFor(x => x.PlateNumber).OptionalText(50);
        RuleFor(x => x.ChassisNumber).OptionalText(100);
        RuleFor(x => x).Must(x => !string.IsNullOrWhiteSpace(x.PlateNumber) || !string.IsNullOrWhiteSpace(x.ChassisNumber))
            .WithName("plateNumber").WithMessage("يجب إدخال رقم اللوحة أو رقم الشاسيه/التعريف");
        RuleFor(x => x.CategoryId).GreaterThan(0).WithMessage("نوع المعدة مطلوب");
        RuleFor(x => x.FuelTypeId).GreaterThan(0).WithMessage("نوع الوقود مطلوب");
        RuleFor(x => x.Ownership).IsInEnum();
        RuleFor(x => x.MeterType).IsInEnum();
        RuleFor(x => x.ManufactureYear).InclusiveBetween(1950, DateTime.Today.Year + 1).When(x => x.ManufactureYear.HasValue)
            .WithMessage("سنة صنع غير صالحة");
        RuleFor(x => x.InitialMeterReading).GreaterThanOrEqualTo(0).WithMessage("قراءة العداد لا يمكن أن تكون سالبة");
        RuleFor(x => x.Notes).OptionalText(2000);
        RuleFor(x => x.Depreciation).Null().When(x => x.Ownership == OwnershipType.Rented)
            .WithMessage("المعدات المؤجرة لا يتم إهلاكها");
        RuleFor(x => x.Depreciation!).SetValidator(new DepreciationProfileValidator()).When(x => x.Depreciation != null);
    }
}

public class DepreciationProfileValidator : AbstractValidator<DepreciationProfileDto>
{
    public DepreciationProfileValidator()
    {
        RuleFor(x => x.PurchasePrice).GreaterThan(0).WithMessage("سعر الشراء يجب أن يكون أكبر من صفر");
        RuleFor(x => x.ResidualValue).GreaterThanOrEqualTo(0).WithMessage("القيمة التخريدية لا يمكن أن تكون سالبة")
            .LessThan(x => x.PurchasePrice).WithMessage("القيمة التخريدية يجب أن تكون أقل من سعر الشراء");
        RuleFor(x => x.UsefulLifeMonths).InclusiveBetween(1, 600).WithMessage("العمر الإنتاجي بين 1 و 600 شهر");
        RuleFor(x => x.Method).IsInEnum();
        RuleFor(x => x.DepreciationStartDate).GreaterThanOrEqualTo(x => x.PurchaseDate).WithMessage("بداية الإهلاك لا تسبق تاريخ الشراء");
        RuleFor(x => x.DisposalDate).GreaterThanOrEqualTo(x => x.DepreciationStartDate).When(x => x.DisposalDate.HasValue)
            .WithMessage("تاريخ الاستبعاد يجب أن يكون بعد بداية الإهلاك");
    }
}

public class EquipmentService(IAppDbContext db, IValidator<EquipmentInput> validator, IClock clock, IFileStorage files, MeterReadingService meters)
{
    private static readonly Dictionary<string, Expression<Func<EquipmentEntity, object?>>> Sorts = new(StringComparer.OrdinalIgnoreCase)
    {
        ["code"] = e => e.Code,
        ["name"] = e => e.Name,
        ["plateNumber"] = e => e.PlateNumber,
        ["category"] = e => e.Category!.NameAr,
        ["status"] = e => e.Status,
        ["ownership"] = e => e.Ownership,
        ["currentMeterReading"] = e => e.CurrentMeterReading,
        ["manufactureYear"] = e => e.ManufactureYear,
    };

    public Task<PagedResult<EquipmentListItem>> ListAsync(EquipmentQuery q, CancellationToken ct = default)
    {
        var search = Text.Clean(q.Search);
        var query = db.Equipment.AsNoTracking()
            .WhereIf(q.IncludeInactive != true && q.Status != EquipmentStatus.Inactive, e => e.IsActive)
            .WhereIf(q.CategoryId.HasValue, e => e.CategoryId == q.CategoryId)
            .WhereIf(q.Status.HasValue, e => e.Status == q.Status)
            .WhereIf(q.Ownership.HasValue, e => e.Ownership == q.Ownership)
            .WhereIf(q.FuelTypeId.HasValue, e => e.FuelTypeId == q.FuelTypeId)
            .WhereIf(q.ProjectId.HasValue, e => e.ProjectAssignments.Any(a => a.EndDate == null && a.ProjectId == q.ProjectId))
            .WhereIf(q.Unassigned == true, e => !e.ProjectAssignments.Any(a => a.EndDate == null))
            .WhereIf(search != null, e => e.Name.Contains(search!) || e.Code.Contains(search!)
                || (e.PlateNumber != null && e.PlateNumber.Contains(search!)) || (e.ChassisNumber != null && e.ChassisNumber.Contains(search!))
                || (e.Model != null && e.Model.Contains(search!)) || (e.Manufacturer != null && e.Manufacturer.Contains(search!)))
            .ApplySort(q, Sorts, e => e.Code);

        return query.ToPagedAsync(q, e => new EquipmentListItem(e.Id, e.Code, e.Name, e.PlateNumber, e.ChassisNumber, e.CategoryId,
            e.Category!.NameAr, e.Manufacturer, e.Model, e.ManufactureYear, e.Ownership, e.Status, e.MeterType, e.CurrentMeterReading,
            e.ProjectAssignments.Where(a => a.EndDate == null).Select(a => (int?)a.ProjectId).FirstOrDefault(),
            e.ProjectAssignments.Where(a => a.EndDate == null).Select(a => a.Project!.Name).FirstOrDefault(),
            e.MainImageId, e.FuelType!.NameAr, e.IsActive), ct);
    }

    public async Task<EquipmentDto> GetAsync(int id, CancellationToken ct = default)
    {
        var e = await db.Equipment.AsNoTracking()
            .Include(x => x.Category).Include(x => x.FuelType).Include(x => x.DepreciationProfile)
            .Include(x => x.RentalContracts).Include(x => x.Images)
            .FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("المعدة", id);

        var current = await db.ProjectAssignments.AsNoTracking().Where(a => a.EquipmentId == id && a.EndDate == null)
            .Select(a => new { a.ProjectId, a.Project!.Name, a.StartDate }).FirstOrDefaultAsync(ct);
        var today = clock.Today;
        var drivers = await db.DriverAssignments.AsNoTracking()
            .Where(a => a.EquipmentId == id && a.StartDate <= today && (a.EndDate == null || a.EndDate >= today))
            .OrderByDescending(a => a.IsPrimary).ThenBy(a => a.StartDate)
            .Select(a => new CurrentDriverDto(a.Id, a.DriverId, a.Driver!.FullName, a.Driver.Phone, a.StartDate, a.IsPrimary))
            .ToListAsync(ct);

        var dp = e.DepreciationProfile;
        return new EquipmentDto(e.Id, e.Code, e.Name, e.PlateNumber, e.ChassisNumber, e.CategoryId, e.Category!.NameAr, e.Manufacturer,
            e.Model, e.ManufactureYear, e.FuelTypeId, e.FuelType!.NameAr, e.FuelType.Unit, e.Ownership, e.MeterType, e.Status,
            e.InitialMeterReading, e.CurrentMeterReading, e.MainImageId,
            e.Images.OrderBy(i => i.SortOrder).Select(i => i.AttachmentId).ToList(), e.Notes, e.IsActive,
            current?.ProjectId, current?.Name, current?.StartDate,
            dp is null ? null : new DepreciationProfileDto(dp.PurchaseDate, dp.PurchasePrice, dp.ResidualValue, dp.UsefulLifeMonths, dp.Method,
                dp.DepreciationStartDate, dp.DisposalDate),
            e.RentalContracts.Where(r => !r.IsDeleted).OrderByDescending(r => r.StartDate).Select(ToDto).ToList(),
            drivers, e.CreatedAt);
    }

    internal static RentalContractDto ToDto(RentalContract r) => new(r.Id, r.ContractNo, r.Lessor, r.LessorPhone, r.StartDate, r.EndDate,
        r.RateType, r.Rate, r.IncludesDriver, r.IncludesFuel, r.IncludesMaintenance, r.AttachmentId, r.Notes);

    public async Task<int> CreateAsync(EquipmentInput input, CancellationToken ct = default)
    {
        await validator.EnsureValidAsync(input, ct);
        var (code, plate, chassis) = Keys(input);
        await EnsureUniqueAsync(code, plate, chassis, null, ct);
        await EnsureLookupsAsync(input, ct);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var e = new EquipmentEntity { Status = EquipmentStatus.Available };
        Apply(e, input, code, plate, chassis);
        e.InitialMeterReading = input.InitialMeterReading;
        e.CurrentMeterReading = input.InitialMeterReading;
        db.Equipment.Add(e);
        await db.SaveChangesAsync(ct);

        db.MeterReadings.Add(new MeterReading
        {
            EquipmentId = e.Id, ReadingDate = MeterReadingService.InitialDate, Value = input.InitialMeterReading, Source = MeterReadingSource.Initial
        });
        db.EquipmentStatusHistory.Add(new EquipmentStatusHistory
        {
            EquipmentId = e.Id, Status = EquipmentStatus.Available, FromDate = clock.Today, Reason = "تسجيل المعدة"
        });
        if (input.Depreciation is not null) UpsertProfile(e, input.Depreciation);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return e.Id;
    }

    public async Task UpdateAsync(int id, EquipmentInput input, CancellationToken ct = default)
    {
        await validator.EnsureValidAsync(input, ct);
        var e = await db.Equipment.Include(x => x.DepreciationProfile).FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new NotFoundException("المعدة", id);
        var (code, plate, chassis) = Keys(input);
        await EnsureUniqueAsync(code, plate, chassis, id, ct);
        await EnsureLookupsAsync(input, ct);

        if (e.Ownership != input.Ownership)
        {
            if (e.Ownership == OwnershipType.Rented && await db.Expenses.AnyAsync(x => x.EquipmentId == id && x.SourceType == ExpenseSourceType.Rental, ct))
                throw new DomainException("لا يمكن تغيير نوع الملكية لوجود مصروفات إيجار مسجلة. أنهِ عقد الإيجار بدلاً من ذلك.", "ownership");
            if (e.Ownership == OwnershipType.Rented && await db.RentalContracts.AnyAsync(r => r.EquipmentId == id, ct))
                throw new DomainException("احذف عقود الإيجار أولاً قبل تغيير نوع الملكية", "ownership");
        }
        if (e.MeterType != input.MeterType && await db.MeterReadings.AnyAsync(r => r.EquipmentId == id && r.Source != MeterReadingSource.Initial, ct))
            throw new DomainException("لا يمكن تغيير نوع العداد بعد تسجيل قراءات", "meterType");

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        Apply(e, input, code, plate, chassis);

        if (e.InitialMeterReading != input.InitialMeterReading)
        {
            var initial = await db.MeterReadings.FirstOrDefaultAsync(r => r.EquipmentId == id && r.Source == MeterReadingSource.Initial, ct);
            var minOther = await db.MeterReadings.Where(r => r.EquipmentId == id && r.Source != MeterReadingSource.Initial && !r.IsCorrection)
                .Select(r => (decimal?)r.Value).MinAsync(ct);
            if (minOther is not null && input.InitialMeterReading > minOther)
                throw new DomainException($"القراءة الابتدائية لا يمكن أن تتجاوز أقل قراءة مسجلة ({minOther:N0})", "initialMeterReading");
            e.InitialMeterReading = input.InitialMeterReading;
            if (initial is not null) initial.Value = input.InitialMeterReading;
        }

        if (input.Ownership == OwnershipType.Rented && e.DepreciationProfile is not null)
            db.DepreciationProfiles.Remove(e.DepreciationProfile);
        else if (input.Depreciation is not null)
            UpsertProfile(e, input.Depreciation);

        await db.SaveChangesAsync(ct);
        await meters.RefreshCurrentAsync(id, ct);
        await tx.CommitAsync(ct);
    }

    private void UpsertProfile(EquipmentEntity e, DepreciationProfileDto d)
    {
        var p = e.DepreciationProfile;
        if (p is null)
        {
            p = new DepreciationProfile { EquipmentId = e.Id };
            db.DepreciationProfiles.Add(p);
            e.DepreciationProfile = p;
        }
        p.PurchaseDate = d.PurchaseDate;
        p.PurchasePrice = d.PurchasePrice;
        p.ResidualValue = d.ResidualValue;
        p.UsefulLifeMonths = d.UsefulLifeMonths;
        p.Method = d.Method;
        p.DepreciationStartDate = d.DepreciationStartDate;
        p.DisposalDate = d.DisposalDate;
    }

    public async Task ChangeStatusAsync(int id, StatusChangeInput input, CancellationToken ct = default)
    {
        var e = await db.Equipment.FindAsync([id], ct) ?? throw new NotFoundException("المعدة", id);
        if (!Enum.IsDefined(input.Status)) throw new DomainException("حالة غير صالحة", "status");
        if (input.Status == e.Status) return;
        if (input.Date > clock.Today) throw new DomainException("لا يمكن تسجيل حالة بتاريخ مستقبلي", "date");

        var hasActiveAssignment = await db.ProjectAssignments.AnyAsync(a => a.EquipmentId == id && a.EndDate == null, ct);
        if (input.Status == EquipmentStatus.Inactive && hasActiveAssignment)
            throw new DomainException("ألغِ تخصيص المعدة من المشروع قبل جعلها غير نشطة", "status");

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await ApplyStatusAsync(e, input.Status, input.Date, input.Reason, ct);
        e.IsActive = input.Status != EquipmentStatus.Inactive;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    /// <summary>Closes the open status span and opens a new one. Caller saves.</summary>
    public async Task ApplyStatusAsync(EquipmentEntity e, EquipmentStatus status, DateOnly date, string? reason, CancellationToken ct)
    {
        var open = await db.EquipmentStatusHistory.Where(h => h.EquipmentId == e.Id && h.ToDate == null)
            .OrderByDescending(h => h.FromDate).FirstOrDefaultAsync(ct);
        if (open is not null)
        {
            if (date < open.FromDate && !await db.EquipmentStatusHistory.AnyAsync(h => h.EquipmentId == e.Id && h.Id != open.Id, ct))
                open.FromDate = date; // first-ever span: allow entering historical data that predates registration
            if (date < open.FromDate)
                throw new DomainException($"تاريخ تغيير الحالة لا يمكن أن يسبق بداية الحالة الحالية ({open.FromDate:dd/MM/yyyy})", "date");
            if (date == open.FromDate)
            {
                open.Status = status;
                open.Reason = Text.Clean(reason) ?? open.Reason;
                e.Status = status;
                return;
            }
            open.ToDate = date.AddDays(-1);
        }
        db.EquipmentStatusHistory.Add(new EquipmentStatusHistory { EquipmentId = e.Id, Status = status, FromDate = date, Reason = Text.Clean(reason) });
        e.Status = status;
    }

    public Task<List<StatusHistoryDto>> StatusHistoryAsync(int id, CancellationToken ct = default) =>
        db.EquipmentStatusHistory.AsNoTracking().Where(h => h.EquipmentId == id).OrderByDescending(h => h.FromDate)
            .Select(h => new StatusHistoryDto(h.Id, h.Status, h.FromDate, h.ToDate, h.Reason, h.CreatedBy)).ToListAsync(ct);

    public async Task<int> AddImageAsync(int id, Stream content, string fileName, string contentType, bool setMain, CancellationToken ct = default)
    {
        var e = await db.Equipment.FindAsync([id], ct) ?? throw new NotFoundException("المعدة", id);
        if (!contentType.StartsWith("image/")) throw new DomainException("يجب أن يكون الملف صورة", "file");
        var attachment = await files.SaveAsync(content, fileName, contentType, AttachmentOwnerType.EquipmentImage, id, ct);
        db.Attachments.Add(attachment);
        await db.SaveChangesAsync(ct);
        var order = await db.EquipmentImages.Where(i => i.EquipmentId == id).Select(i => (int?)i.SortOrder).MaxAsync(ct) ?? 0;
        db.EquipmentImages.Add(new EquipmentImage { EquipmentId = id, AttachmentId = attachment.Id, SortOrder = order + 1 });
        if (setMain || e.MainImageId is null) e.MainImageId = attachment.Id;
        await db.SaveChangesAsync(ct);
        return attachment.Id;
    }

    public async Task SetMainImageAsync(int id, int attachmentId, CancellationToken ct = default)
    {
        var e = await db.Equipment.FindAsync([id], ct) ?? throw new NotFoundException("المعدة", id);
        if (!await db.EquipmentImages.AnyAsync(i => i.EquipmentId == id && i.AttachmentId == attachmentId, ct))
            throw new NotFoundException("الصورة", attachmentId);
        e.MainImageId = attachmentId;
        await db.SaveChangesAsync(ct);
    }

    public async Task RemoveImageAsync(int id, int attachmentId, CancellationToken ct = default)
    {
        var e = await db.Equipment.FindAsync([id], ct) ?? throw new NotFoundException("المعدة", id);
        var img = await db.EquipmentImages.FirstOrDefaultAsync(i => i.EquipmentId == id && i.AttachmentId == attachmentId, ct)
            ?? throw new NotFoundException("الصورة", attachmentId);
        db.EquipmentImages.Remove(img);
        if (e.MainImageId == attachmentId)
            e.MainImageId = await db.EquipmentImages.Where(i => i.EquipmentId == id && i.AttachmentId != attachmentId)
                .OrderBy(i => i.SortOrder).Select(i => (int?)i.AttachmentId).FirstOrDefaultAsync(ct);
        await db.SaveChangesAsync(ct);
    }

    private static (string Code, string? Plate, string? Chassis) Keys(EquipmentInput i) =>
        (Text.NormalizeKey(i.Code)!, Text.NormalizeKey(i.PlateNumber), Text.NormalizeKey(i.ChassisNumber));

    private async Task EnsureUniqueAsync(string code, string? plate, string? chassis, int? exceptId, CancellationToken ct)
    {
        if (await db.Equipment.AnyAsync(e => e.Code == code && e.Id != exceptId, ct))
            throw new DomainException("كود المعدة مستخدم من قبل", "code");
        if (plate is not null && await db.Equipment.AnyAsync(e => e.PlateNumber == plate && e.Id != exceptId, ct))
            throw new DomainException("رقم اللوحة مسجل لمعدة أخرى", "plateNumber");
        if (chassis is not null && await db.Equipment.AnyAsync(e => e.ChassisNumber == chassis && e.Id != exceptId, ct))
            throw new DomainException("رقم الشاسيه مسجل لمعدة أخرى", "chassisNumber");
    }

    private async Task EnsureLookupsAsync(EquipmentInput i, CancellationToken ct)
    {
        if (!await db.EquipmentCategories.AnyAsync(c => c.Id == i.CategoryId, ct)) throw new DomainException("نوع المعدة غير موجود", "categoryId");
        if (!await db.FuelTypes.AnyAsync(c => c.Id == i.FuelTypeId, ct)) throw new DomainException("نوع الوقود غير موجود", "fuelTypeId");
    }

    private static void Apply(EquipmentEntity e, EquipmentInput i, string code, string? plate, string? chassis)
    {
        e.Code = code;
        e.Name = i.Name.Trim();
        e.PlateNumber = plate;
        e.ChassisNumber = chassis;
        e.CategoryId = i.CategoryId;
        e.Manufacturer = Text.Clean(i.Manufacturer);
        e.Model = Text.Clean(i.Model);
        e.ManufactureYear = i.ManufactureYear;
        e.FuelTypeId = i.FuelTypeId;
        e.Ownership = i.Ownership;
        e.MeterType = i.MeterType;
        e.Notes = Text.Clean(i.Notes);
    }
}

