using System.Linq.Expressions;
using Fleet.Application.Abstractions;
using Fleet.Application.Common;
using Fleet.Domain.Common;
using Fleet.Domain.Entities;
using Fleet.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Fleet.Application.Drivers;

public record DriverQuery : PageQuery
{
    public EmploymentStatus? EmploymentStatus { get; init; }
    public bool? LicenseExpiring { get; init; }
    public bool? IncludeInactive { get; init; }
}

public record DriverListItem(int Id, string FullName, string? Phone, string? NationalId, EmploymentStatus EmploymentStatus, string? LicenseNumber,
    string? LicenseTypeName, DateOnly? LicenseExpiryDate, int? PhotoId, int ActiveAssignments, string? CurrentEquipment, bool IsActive);

public record DriverDto(int Id, string FullName, string? NationalId, string? Phone, string? Address, EmploymentStatus EmploymentStatus,
    DateOnly? HireDate, string? LicenseNumber, int? LicenseTypeId, string? LicenseTypeName, DateOnly? LicenseExpiryDate, int? PhotoId,
    string? Notes, bool IsActive, DateTime CreatedAt);

public record DriverInput(string FullName, string? NationalId, string? Phone, string? Address, EmploymentStatus EmploymentStatus,
    DateOnly? HireDate, string? LicenseNumber, int? LicenseTypeId, DateOnly? LicenseExpiryDate, string? Notes);

public class DriverInputValidator : AbstractValidator<DriverInput>
{
    public DriverInputValidator()
    {
        RuleFor(x => x.FullName).RequiredText(200);
        RuleFor(x => x.NationalId).Matches("^[0-9]{14}$").When(x => !string.IsNullOrWhiteSpace(x.NationalId))
            .WithMessage("الرقم القومي يجب أن يتكون من 14 رقماً");
        RuleFor(x => x.Phone).Matches(@"^[0-9+\-\s]{7,20}$").When(x => !string.IsNullOrWhiteSpace(x.Phone)).WithMessage("رقم هاتف غير صالح");
        RuleFor(x => x.Address).OptionalText(500);
        RuleFor(x => x.LicenseNumber).OptionalText(50);
        RuleFor(x => x.Notes).OptionalText(2000);
        RuleFor(x => x.EmploymentStatus).IsInEnum();
    }
}

public class DriverService(IAppDbContext db, IValidator<DriverInput> validator, IClock clock, IFileStorage files)
{
    private static readonly Dictionary<string, Expression<Func<Driver, object?>>> Sorts = new(StringComparer.OrdinalIgnoreCase)
    {
        ["fullName"] = d => d.FullName,
        ["employmentStatus"] = d => d.EmploymentStatus,
        ["licenseExpiryDate"] = d => d.LicenseExpiryDate,
        ["hireDate"] = d => d.HireDate,
    };

    public Task<PagedResult<DriverListItem>> ListAsync(DriverQuery q, int licenseWarningDays = 30, CancellationToken ct = default)
    {
        var today = clock.Today;
        var warn = today.AddDays(licenseWarningDays);
        var search = Text.Clean(q.Search);
        return db.Drivers.AsNoTracking()
            .WhereIf(q.IncludeInactive != true, d => d.IsActive)
            .WhereIf(q.EmploymentStatus.HasValue, d => d.EmploymentStatus == q.EmploymentStatus)
            .WhereIf(q.LicenseExpiring == true, d => d.LicenseExpiryDate != null && d.LicenseExpiryDate <= warn)
            .WhereIf(search != null, d => d.FullName.Contains(search!) || (d.Phone != null && d.Phone.Contains(search!))
                || (d.NationalId != null && d.NationalId.Contains(search!)) || (d.LicenseNumber != null && d.LicenseNumber.Contains(search!)))
            .ApplySort(q, Sorts, d => d.FullName)
            .ToPagedAsync(q, d => new DriverListItem(d.Id, d.FullName, d.Phone, d.NationalId, d.EmploymentStatus, d.LicenseNumber,
                d.LicenseType!.NameAr, d.LicenseExpiryDate, d.PhotoId,
                d.Assignments.Count(a => a.StartDate <= today && (a.EndDate == null || a.EndDate >= today)),
                d.Assignments.Where(a => a.StartDate <= today && (a.EndDate == null || a.EndDate >= today))
                    .OrderByDescending(a => a.IsPrimary).Select(a => a.Equipment!.Name).FirstOrDefault(),
                d.IsActive), ct);
    }

    public async Task<DriverDto> GetAsync(int id, CancellationToken ct = default) =>
        await db.Drivers.AsNoTracking().Where(d => d.Id == id)
            .Select(d => new DriverDto(d.Id, d.FullName, d.NationalId, d.Phone, d.Address, d.EmploymentStatus, d.HireDate, d.LicenseNumber,
                d.LicenseTypeId, d.LicenseType!.NameAr, d.LicenseExpiryDate, d.PhotoId, d.Notes, d.IsActive, d.CreatedAt))
            .FirstOrDefaultAsync(ct)
        ?? throw new NotFoundException("السائق", id);

    public async Task<int> CreateAsync(DriverInput input, CancellationToken ct = default)
    {
        await validator.EnsureValidAsync(input, ct);
        await EnsureValidRefsAsync(input, null, ct);
        var d = new Driver();
        Apply(d, input);
        db.Drivers.Add(d);
        await db.SaveChangesAsync(ct);
        return d.Id;
    }

    public async Task UpdateAsync(int id, DriverInput input, CancellationToken ct = default)
    {
        await validator.EnsureValidAsync(input, ct);
        var d = await db.Drivers.FindAsync([id], ct) ?? throw new NotFoundException("السائق", id);
        await EnsureValidRefsAsync(input, id, ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        Apply(d, input);
        if (input.EmploymentStatus == EmploymentStatus.Terminated)
        {
            var today = clock.Today;
            var open = await db.DriverAssignments.Where(a => a.DriverId == id && (a.EndDate == null || a.EndDate > today)).ToListAsync(ct);
            foreach (var a in open) a.EndDate = a.StartDate > today ? a.StartDate : today;
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    public async Task SetActiveAsync(int id, bool active, CancellationToken ct = default)
    {
        var d = await db.Drivers.FindAsync([id], ct) ?? throw new NotFoundException("السائق", id);
        var today = clock.Today;
        if (!active && await db.DriverAssignments.AnyAsync(a => a.DriverId == id && (a.EndDate == null || a.EndDate >= today), ct))
            throw new DomainException("أنهِ تخصيصات السائق الحالية قبل إيقافه");
        d.IsActive = active;
        await db.SaveChangesAsync(ct);
    }

    public async Task<int> SetPhotoAsync(int id, Stream content, string fileName, string contentType, CancellationToken ct = default)
    {
        var d = await db.Drivers.FindAsync([id], ct) ?? throw new NotFoundException("السائق", id);
        if (!contentType.StartsWith("image/")) throw new DomainException("يجب أن يكون الملف صورة", "file");
        var a = await files.SaveAsync(content, fileName, contentType, AttachmentOwnerType.Driver, id, ct);
        db.Attachments.Add(a);
        await db.SaveChangesAsync(ct);
        d.PhotoId = a.Id;
        await db.SaveChangesAsync(ct);
        return a.Id;
    }

    private async Task EnsureValidRefsAsync(DriverInput i, int? exceptId, CancellationToken ct)
    {
        var nid = Text.Clean(i.NationalId);
        if (nid is not null && await db.Drivers.AnyAsync(d => d.NationalId == nid && d.Id != exceptId, ct))
            throw new DomainException("الرقم القومي مسجل لسائق آخر", "nationalId");
        if (i.LicenseTypeId is { } lt && !await db.LicenseTypes.AnyAsync(x => x.Id == lt, ct))
            throw new DomainException("نوع الرخصة غير موجود", "licenseTypeId");
    }

    private static void Apply(Driver d, DriverInput i)
    {
        d.FullName = i.FullName.Trim();
        d.NationalId = Text.Clean(i.NationalId);
        d.Phone = Text.Clean(i.Phone);
        d.Address = Text.Clean(i.Address);
        d.EmploymentStatus = i.EmploymentStatus;
        d.HireDate = i.HireDate;
        d.LicenseNumber = Text.Clean(i.LicenseNumber);
        d.LicenseTypeId = i.LicenseTypeId;
        d.LicenseExpiryDate = i.LicenseExpiryDate;
        d.Notes = Text.Clean(i.Notes);
    }
}
