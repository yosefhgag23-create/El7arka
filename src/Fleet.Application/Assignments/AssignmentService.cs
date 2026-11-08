using Fleet.Application.Abstractions;
using Fleet.Application.Common;
using Fleet.Application.Equipments;
using Fleet.Application.Settings;
using Fleet.Domain.Common;
using Fleet.Domain.Entities;
using Fleet.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Fleet.Application.Assignments;

public record TransferInput(int? ToProjectId, DateOnly Date, decimal? MeterReading, string? Notes);

public record BulkAssignInput(List<int> EquipmentIds, DateOnly Date, string? Notes);

public record AssignmentHistoryItem(int Id, int EquipmentId, string EquipmentCode, string EquipmentName, int ProjectId, string ProjectCode,
    string ProjectName, DateOnly StartDate, DateOnly? EndDate, decimal? StartMeter, decimal? EndMeter, int Days, string? Notes);

public record TransferListItem(int Id, int EquipmentId, string EquipmentCode, string EquipmentName, int? FromProjectId, string? FromProjectName,
    int? ToProjectId, string? ToProjectName, DateOnly TransferDate, decimal? MeterReading, string? Notes, string? CreatedBy, DateTime CreatedAt);

public record TransferQuery : PageQuery
{
    public int? EquipmentId { get; init; }
    public int? ProjectId { get; init; }
    public DateOnly? From { get; init; }
    public DateOnly? To { get; init; }
}

public record DriverAssignInput(int DriverId, int EquipmentId, DateOnly StartDate, DateOnly? EndDate, bool IsPrimary, string? Notes);

public record DriverReplaceInput(int NewDriverId, DateOnly Date, string? Notes);

public record EndAssignmentInput(DateOnly EndDate, string? Notes);

public record DriverAssignmentItem(int Id, int DriverId, string DriverName, string? DriverPhone, int EquipmentId, string EquipmentCode,
    string EquipmentName, DateOnly StartDate, DateOnly? EndDate, bool IsPrimary, bool IsActive, string? Notes);

public record DriverAssignmentQuery : PageQuery
{
    public int? DriverId { get; init; }
    public int? EquipmentId { get; init; }
    public bool? ActiveOnly { get; init; }
}

public class AssignmentService(IAppDbContext db, IClock clock, MeterReadingService meters, EquipmentService equipment, SettingsService settings)
{
    // ---------------- Project assignments ----------------

    /// <summary>
    /// Assigns, transfers or releases (ToProjectId = null) equipment in a single transaction:
    /// closes the active assignment the day before, opens the new one, records the transfer and meter reading.
    /// </summary>
    public async Task<int> TransferAsync(int equipmentId, TransferInput input, CancellationToken ct = default)
    {
        var own = db.Database.CurrentTransaction is null;
        await using var tx = own ? await db.Database.BeginTransactionAsync(ct) : null;
        var id = await TransferCoreAsync(equipmentId, input, ct);
        if (tx is not null) await tx.CommitAsync(ct);
        return id;
    }

    public async Task<int> AssignManyAsync(int projectId, BulkAssignInput input, CancellationToken ct = default)
    {
        if (input.EquipmentIds is not { Count: > 0 }) throw new DomainException("اختر معدة واحدة على الأقل", "equipmentIds");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        foreach (var id in input.EquipmentIds.Distinct())
            await TransferCoreAsync(id, new TransferInput(projectId, input.Date, null, input.Notes), ct);
        await tx.CommitAsync(ct);
        return input.EquipmentIds.Count;
    }

    private async Task<int> TransferCoreAsync(int equipmentId, TransferInput input, CancellationToken ct)
    {
        var e = await db.Equipment.FindAsync([equipmentId], ct) ?? throw new NotFoundException("المعدة", equipmentId);
        if (input.Date > clock.Today) throw new DomainException("لا يمكن تسجيل نقل بتاريخ مستقبلي", "date");

        Project? target = null;
        if (input.ToProjectId is { } toId)
        {
            target = await db.Projects.FindAsync([toId], ct) ?? throw new NotFoundException("المشروع", toId);
            if (target.Status is ProjectStatus.Archived or ProjectStatus.Completed)
                throw new DomainException($"المشروع \"{target.Name}\" منتهي أو مؤرشف", "toProjectId");
            if (!e.IsActive || e.Status is EquipmentStatus.OutOfService or EquipmentStatus.Inactive)
                throw new DomainException($"المعدة \"{e.Name}\" خارج الخدمة أو غير نشطة ولا يمكن تخصيصها", "equipmentId");
            if (input.Date < target.StartDate)
                throw new DomainException("تاريخ التخصيص يسبق تاريخ بدء المشروع", "date");
        }

        var current = await db.ProjectAssignments.FirstOrDefaultAsync(a => a.EquipmentId == equipmentId && a.EndDate == null, ct);
        if (current is null && target is null) throw new DomainException("المعدة غير مخصصة لأي مشروع حالياً", "toProjectId");
        if (current is not null && current.ProjectId == input.ToProjectId)
            throw new DomainException("المعدة مخصصة بالفعل لهذا المشروع", "toProjectId");

        if (current is not null)
        {
            if (input.Date <= current.StartDate)
                throw new DomainException($"تاريخ النقل يجب أن يكون بعد بداية التخصيص الحالي ({current.StartDate:dd/MM/yyyy})", "date");
        }
        else
        {
            var lastEnd = await db.ProjectAssignments.Where(a => a.EquipmentId == equipmentId)
                .Select(a => a.EndDate).MaxAsync(d => (DateOnly?)d, ct);
            if (lastEnd is not null && input.Date <= lastEnd)
                throw new DomainException($"تاريخ التخصيص يتداخل مع تخصيص سابق انتهى في {lastEnd:dd/MM/yyyy}", "date");
        }

        var transfer = new EquipmentTransfer
        {
            EquipmentId = equipmentId,
            FromProjectId = current?.ProjectId,
            ToProjectId = input.ToProjectId,
            TransferDate = input.Date,
            MeterReading = input.MeterReading,
            Notes = Text.Clean(input.Notes)
        };
        db.EquipmentTransfers.Add(transfer);
        await db.SaveChangesAsync(ct);

        if (input.MeterReading is not null)
            await meters.RecordAsync(equipmentId, input.Date, input.MeterReading, MeterReadingSource.Transfer, transfer.Id, ct);

        if (current is not null)
        {
            current.EndDate = input.Date.AddDays(-1);
            current.EndMeter = input.MeterReading;
            await db.SaveChangesAsync(ct); // release the filtered unique index before inserting the new active row
        }

        if (target is not null)
        {
            db.ProjectAssignments.Add(new ProjectAssignment
            {
                EquipmentId = equipmentId, ProjectId = target.Id, StartDate = input.Date, StartMeter = input.MeterReading,
                TransferId = transfer.Id, Notes = Text.Clean(input.Notes)
            });
        }

        var s = await settings.GetEntityAsync(ct);
        if (s.AutoAssignSetsOperating)
        {
            if (target is not null && e.Status == EquipmentStatus.Available)
                await equipment.ApplyStatusAsync(e, EquipmentStatus.Operating, input.Date, $"تخصيص لمشروع {target.Name}", ct);
            else if (target is null && e.Status == EquipmentStatus.Operating)
                await equipment.ApplyStatusAsync(e, EquipmentStatus.Available, input.Date, "إلغاء التخصيص", ct);
        }

        await db.SaveChangesAsync(ct);
        if (input.MeterReading is not null) await meters.RefreshCurrentAsync(equipmentId, ct);
        return transfer.Id;
    }

    public async Task<List<AssignmentHistoryItem>> HistoryAsync(int? equipmentId, int? projectId, bool activeOnly, CancellationToken ct = default)
    {
        var today = clock.Today;
        var rows = await db.ProjectAssignments.AsNoTracking()
            .WhereIf(equipmentId.HasValue, a => a.EquipmentId == equipmentId)
            .WhereIf(projectId.HasValue, a => a.ProjectId == projectId)
            .WhereIf(activeOnly, a => a.EndDate == null)
            .OrderByDescending(a => a.StartDate)
            .Select(a => new
            {
                a.Id, a.EquipmentId, a.Equipment!.Code, EqName = a.Equipment.Name, a.ProjectId, PCode = a.Project!.Code, PName = a.Project.Name,
                a.StartDate, a.EndDate, a.StartMeter, a.EndMeter, a.Notes
            }).ToListAsync(ct);
        return rows.Select(a => new AssignmentHistoryItem(a.Id, a.EquipmentId, a.Code, a.EqName, a.ProjectId, a.PCode, a.PName, a.StartDate,
            a.EndDate, a.StartMeter, a.EndMeter, (a.EndDate ?? today).DayNumber - a.StartDate.DayNumber + 1, a.Notes)).ToList();
    }

    public Task<PagedResult<TransferListItem>> TransfersAsync(TransferQuery q, CancellationToken ct = default)
    {
        var search = Text.Clean(q.Search);
        return db.EquipmentTransfers.AsNoTracking()
            .WhereIf(q.EquipmentId.HasValue, t => t.EquipmentId == q.EquipmentId)
            .WhereIf(q.ProjectId.HasValue, t => t.FromProjectId == q.ProjectId || t.ToProjectId == q.ProjectId)
            .WhereIf(q.From.HasValue, t => t.TransferDate >= q.From)
            .WhereIf(q.To.HasValue, t => t.TransferDate <= q.To)
            .WhereIf(search != null, t => t.Equipment!.Name.Contains(search!) || t.Equipment.Code.Contains(search!))
            .OrderByDescending(t => t.TransferDate).ThenByDescending(t => t.Id)
            .ToPagedAsync(q, t => new TransferListItem(t.Id, t.EquipmentId, t.Equipment!.Code, t.Equipment.Name, t.FromProjectId,
                t.FromProject!.Name, t.ToProjectId, t.ToProject!.Name, t.TransferDate, t.MeterReading, t.Notes, t.CreatedBy, t.CreatedAt), ct);
    }

    // ---------------- Driver assignments ----------------

    public async Task<int> AssignDriverAsync(DriverAssignInput input, CancellationToken ct = default)
    {
        var driver = await db.Drivers.FindAsync([input.DriverId], ct) ?? throw new NotFoundException("السائق", input.DriverId);
        var e = await db.Equipment.FindAsync([input.EquipmentId], ct) ?? throw new NotFoundException("المعدة", input.EquipmentId);
        if (!driver.IsActive || driver.EmploymentStatus is EmploymentStatus.Terminated or EmploymentStatus.Suspended)
            throw new DomainException($"السائق \"{driver.FullName}\" غير نشط أو موقوف", "driverId");
        if (!e.IsActive) throw new DomainException("المعدة غير نشطة", "equipmentId");
        if (input.EndDate is not null && input.EndDate < input.StartDate)
            throw new DomainException("تاريخ النهاية يجب أن يكون بعد تاريخ البداية", "endDate");
        if (driver.HireDate is not null && input.StartDate < driver.HireDate)
            throw new DomainException("تاريخ التخصيص يسبق تاريخ تعيين السائق", "startDate");

        var range = new DateRange(input.StartDate, input.EndDate);
        var samePair = await db.DriverAssignments.Where(a => a.DriverId == input.DriverId && a.EquipmentId == input.EquipmentId)
            .Select(a => new { a.StartDate, a.EndDate }).ToListAsync(ct);
        if (samePair.Any(a => new DateRange(a.StartDate, a.EndDate).Overlaps(range)))
            throw new DomainException("السائق مخصص لهذه المعدة بالفعل في نفس الفترة", "startDate");

        if (input.IsPrimary)
        {
            var otherPrimaries = await db.DriverAssignments
                .Where(a => a.EquipmentId == input.EquipmentId && a.IsPrimary && (a.EndDate == null || a.EndDate >= input.StartDate))
                .ToListAsync(ct);
            foreach (var p in otherPrimaries) p.IsPrimary = false;
        }

        var assignment = new DriverAssignment
        {
            DriverId = input.DriverId, EquipmentId = input.EquipmentId, StartDate = input.StartDate, EndDate = input.EndDate,
            IsPrimary = input.IsPrimary, Notes = Text.Clean(input.Notes)
        };
        db.DriverAssignments.Add(assignment);
        await db.SaveChangesAsync(ct);
        return assignment.Id;
    }

    public async Task EndDriverAssignmentAsync(int assignmentId, EndAssignmentInput input, CancellationToken ct = default)
    {
        var a = await db.DriverAssignments.FindAsync([assignmentId], ct) ?? throw new NotFoundException("التخصيص", assignmentId);
        if (a.EndDate is not null) throw new DomainException("التخصيص منتهي بالفعل");
        if (input.EndDate < a.StartDate) throw new DomainException("تاريخ النهاية يسبق تاريخ البداية", "endDate");
        a.EndDate = input.EndDate;
        if (!string.IsNullOrWhiteSpace(input.Notes)) a.Notes = string.Join(" | ", new[] { a.Notes, input.Notes.Trim() }.Where(x => x != null));
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Ends the current assignment the day before <c>Date</c> and starts the new driver on <c>Date</c>.</summary>
    public async Task<int> ReplaceDriverAsync(int assignmentId, DriverReplaceInput input, CancellationToken ct = default)
    {
        var a = await db.DriverAssignments.FindAsync([assignmentId], ct) ?? throw new NotFoundException("التخصيص", assignmentId);
        if (a.EndDate is not null) throw new DomainException("التخصيص منتهي بالفعل");
        if (input.Date <= a.StartDate) throw new DomainException("تاريخ الاستبدال يجب أن يكون بعد بداية التخصيص الحالي", "date");
        if (input.NewDriverId == a.DriverId) throw new DomainException("اختر سائقاً مختلفاً", "newDriverId");

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        a.EndDate = input.Date.AddDays(-1);
        var wasPrimary = a.IsPrimary;
        a.IsPrimary = false;
        await db.SaveChangesAsync(ct);
        var id = await AssignDriverAsync(new DriverAssignInput(input.NewDriverId, a.EquipmentId, input.Date, null, wasPrimary, input.Notes), ct);
        await tx.CommitAsync(ct);
        return id;
    }

    public Task<PagedResult<DriverAssignmentItem>> DriverAssignmentsAsync(DriverAssignmentQuery q, CancellationToken ct = default)
    {
        var today = clock.Today;
        var search = Text.Clean(q.Search);
        return db.DriverAssignments.AsNoTracking()
            .WhereIf(q.DriverId.HasValue, a => a.DriverId == q.DriverId)
            .WhereIf(q.EquipmentId.HasValue, a => a.EquipmentId == q.EquipmentId)
            .WhereIf(q.ActiveOnly == true, a => a.StartDate <= today && (a.EndDate == null || a.EndDate >= today))
            .WhereIf(search != null, a => a.Driver!.FullName.Contains(search!) || a.Equipment!.Name.Contains(search!) || a.Equipment.Code.Contains(search!))
            .OrderByDescending(a => a.EndDate == null).ThenByDescending(a => a.StartDate)
            .ToPagedAsync(q, a => new DriverAssignmentItem(a.Id, a.DriverId, a.Driver!.FullName, a.Driver.Phone, a.EquipmentId, a.Equipment!.Code,
                a.Equipment.Name, a.StartDate, a.EndDate, a.IsPrimary, a.StartDate <= today && (a.EndDate == null || a.EndDate >= today), a.Notes), ct);
    }
}
