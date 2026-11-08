using Fleet.Application.Abstractions;
using Fleet.Application.Common;
using Fleet.Domain.Common;
using Fleet.Domain.Entities;
using Fleet.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Fleet.Application.Equipments;

public record RentalContractInput(string? ContractNo, string Lessor, string? LessorPhone, DateOnly StartDate, DateOnly? EndDate,
    RentalRateType RateType, decimal Rate, bool IncludesDriver, bool IncludesFuel, bool IncludesMaintenance, int? AttachmentId, string? Notes);

public class RentalContractValidator : AbstractValidator<RentalContractInput>
{
    public RentalContractValidator()
    {
        RuleFor(x => x.Lessor).RequiredText(200);
        RuleFor(x => x.ContractNo).OptionalText(100);
        RuleFor(x => x.RateType).IsInEnum();
        RuleFor(x => x.Rate).GreaterThan(0).WithMessage("قيمة الإيجار يجب أن تكون أكبر من صفر");
        RuleFor(x => x.EndDate).GreaterThanOrEqualTo(x => x.StartDate).When(x => x.EndDate.HasValue)
            .WithMessage("تاريخ نهاية العقد يجب أن يكون بعد تاريخ البداية");
        RuleFor(x => x.Notes).OptionalText(2000);
    }
}

public class RentalContractService(IAppDbContext db, IValidator<RentalContractInput> validator, ICurrentUser user, RentalAccrualService accruals)
{
    public async Task<int> CreateAsync(int equipmentId, RentalContractInput input, CancellationToken ct = default)
    {
        await validator.EnsureValidAsync(input, ct);
        var e = await db.Equipment.FindAsync([equipmentId], ct) ?? throw new NotFoundException("المعدة", equipmentId);
        if (e.Ownership != OwnershipType.Rented) throw new DomainException("عقود الإيجار متاحة للمعدات المؤجرة فقط");
        await EnsureNoOverlapAsync(equipmentId, input, null, ct);

        var c = new RentalContract { EquipmentId = equipmentId };
        Apply(c, input);
        db.RentalContracts.Add(c);
        await db.SaveChangesAsync(ct);
        await accruals.RunForContractAsync(c.Id, ct);
        return c.Id;
    }

    public async Task UpdateAsync(int id, RentalContractInput input, CancellationToken ct = default)
    {
        await validator.EnsureValidAsync(input, ct);
        var c = await db.RentalContracts.FindAsync([id], ct) ?? throw new NotFoundException("عقد الإيجار", id);
        await EnsureNoOverlapAsync(c.EquipmentId, input, id, ct);
        Apply(c, input);
        await db.SaveChangesAsync(ct);
        await accruals.RunForContractAsync(c.Id, ct);
    }

    public async Task DeleteAsync(int id, string? reason, CancellationToken ct = default)
    {
        user.RequireAdmin();
        var c = await db.RentalContracts.FindAsync([id], ct) ?? throw new NotFoundException("عقد الإيجار", id);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        c.IsDeleted = true;
        c.DeletedAt = DateTime.UtcNow;
        c.DeleteReason = Text.Clean(reason);
        var rows = await db.Expenses.Where(x => x.SourceType == ExpenseSourceType.Rental && x.SourceId == id).ToListAsync(ct);
        foreach (var r in rows) { r.IsDeleted = true; r.DeletedAt = DateTime.UtcNow; r.DeleteReason = "حذف عقد الإيجار"; }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    private async Task EnsureNoOverlapAsync(int equipmentId, RentalContractInput i, int? exceptId, CancellationToken ct)
    {
        var range = new DateRange(i.StartDate, i.EndDate);
        var others = await db.RentalContracts.Where(r => r.EquipmentId == equipmentId && r.Id != exceptId)
            .Select(r => new { r.StartDate, r.EndDate }).ToListAsync(ct);
        if (others.Any(o => new DateRange(o.StartDate, o.EndDate).Overlaps(range)))
            throw new DomainException("فترة العقد تتداخل مع عقد إيجار آخر لنفس المعدة", "startDate");
    }

    private static void Apply(RentalContract c, RentalContractInput i)
    {
        c.ContractNo = Text.Clean(i.ContractNo);
        c.Lessor = i.Lessor.Trim();
        c.LessorPhone = Text.Clean(i.LessorPhone);
        c.StartDate = i.StartDate;
        c.EndDate = i.EndDate;
        c.RateType = i.RateType;
        c.Rate = i.Rate;
        c.IncludesDriver = i.IncludesDriver;
        c.IncludesFuel = i.IncludesFuel;
        c.IncludesMaintenance = i.IncludesMaintenance;
        c.AttachmentId = i.AttachmentId;
        c.Notes = Text.Clean(i.Notes);
    }
}
