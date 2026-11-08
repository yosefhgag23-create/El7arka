using System.Linq.Expressions;
using Fleet.Application.Abstractions;
using Fleet.Application.Common;
using Fleet.Domain.Common;
using Fleet.Domain.Entities;
using Fleet.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Fleet.Application.Projects;

public record ProjectQuery : PageQuery
{
    public ProjectStatus? Status { get; init; }
    public bool? IncludeArchived { get; init; }
}

public record ProjectListItem(int Id, string Code, string Name, string? Location, DateOnly StartDate, DateOnly? EndDate,
    ProjectStatus Status, int ActiveEquipmentCount);

public record ProjectDto(int Id, string Code, string Name, string? Location, string? Description, DateOnly StartDate,
    DateOnly? EndDate, ProjectStatus Status, string? Notes, int ActiveEquipmentCount, int TotalAssignments, DateTime CreatedAt);

public record ProjectInput(string Code, string Name, string? Location, string? Description, DateOnly StartDate,
    DateOnly? EndDate, ProjectStatus Status, string? Notes);

public class ProjectInputValidator : AbstractValidator<ProjectInput>
{
    public ProjectInputValidator()
    {
        RuleFor(x => x.Code).RequiredText(50);
        RuleFor(x => x.Name).RequiredText(200);
        RuleFor(x => x.Location).OptionalText(300);
        RuleFor(x => x.Description).OptionalText(2000);
        RuleFor(x => x.Notes).OptionalText(2000);
        RuleFor(x => x.EndDate).GreaterThanOrEqualTo(x => x.StartDate).When(x => x.EndDate.HasValue)
            .WithMessage("تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء");
        RuleFor(x => x.Status).IsInEnum();
    }
}

public class ProjectService(IAppDbContext db, IValidator<ProjectInput> validator)
{
    private static readonly Dictionary<string, Expression<Func<Project, object?>>> Sorts = new(StringComparer.OrdinalIgnoreCase)
    {
        ["code"] = p => p.Code,
        ["name"] = p => p.Name,
        ["location"] = p => p.Location,
        ["startDate"] = p => p.StartDate,
        ["endDate"] = p => p.EndDate,
        ["status"] = p => p.Status,
    };

    public Task<PagedResult<ProjectListItem>> ListAsync(ProjectQuery q, CancellationToken ct = default)
    {
        var search = Text.Clean(q.Search);
        var query = db.Projects.AsNoTracking()
            .WhereIf(q.Status.HasValue, p => p.Status == q.Status)
            .WhereIf(!q.Status.HasValue && q.IncludeArchived != true, p => p.Status != ProjectStatus.Archived)
            .WhereIf(search != null, p => p.Name.Contains(search!) || p.Code.Contains(search!) || (p.Location != null && p.Location.Contains(search!)))
            .ApplySort(q, Sorts, p => p.StartDate, defaultDesc: true);

        return query.ToPagedAsync(q, p => new ProjectListItem(p.Id, p.Code, p.Name, p.Location, p.StartDate, p.EndDate, p.Status,
            p.Assignments.Count(a => a.EndDate == null)), ct);
    }

    public async Task<ProjectDto> GetAsync(int id, CancellationToken ct = default) =>
        await db.Projects.AsNoTracking().Where(p => p.Id == id)
            .Select(p => new ProjectDto(p.Id, p.Code, p.Name, p.Location, p.Description, p.StartDate, p.EndDate, p.Status, p.Notes,
                p.Assignments.Count(a => a.EndDate == null), p.Assignments.Count, p.CreatedAt))
            .FirstOrDefaultAsync(ct)
        ?? throw new NotFoundException("المشروع", id);

    public async Task<int> CreateAsync(ProjectInput input, CancellationToken ct = default)
    {
        await validator.EnsureValidAsync(input, ct);
        var code = Text.NormalizeKey(input.Code)!;
        await EnsureUniqueCodeAsync(code, null, ct);
        if (input.Status == ProjectStatus.Archived) throw new DomainException("لا يمكن إنشاء مشروع مؤرشف", "status");
        var p = new Project();
        Apply(p, input, code);
        db.Projects.Add(p);
        await db.SaveChangesAsync(ct);
        return p.Id;
    }

    public async Task UpdateAsync(int id, ProjectInput input, CancellationToken ct = default)
    {
        await validator.EnsureValidAsync(input, ct);
        var p = await db.Projects.FindAsync([id], ct) ?? throw new NotFoundException("المشروع", id);
        var code = Text.NormalizeKey(input.Code)!;
        await EnsureUniqueCodeAsync(code, id, ct);
        if (input.Status != p.Status) await EnsureStatusChangeAllowedAsync(id, input.Status, ct);
        Apply(p, input, code);
        await db.SaveChangesAsync(ct);
    }

    public async Task SetStatusAsync(int id, ProjectStatus status, CancellationToken ct = default)
    {
        var p = await db.Projects.FindAsync([id], ct) ?? throw new NotFoundException("المشروع", id);
        await EnsureStatusChangeAllowedAsync(id, status, ct);
        p.Status = status;
        await db.SaveChangesAsync(ct);
    }

    private async Task EnsureStatusChangeAllowedAsync(int id, ProjectStatus status, CancellationToken ct)
    {
        if (status is ProjectStatus.Archived or ProjectStatus.Completed &&
            await db.ProjectAssignments.AnyAsync(a => a.ProjectId == id && a.EndDate == null, ct))
            throw new DomainException("يوجد معدات مخصصة حالياً لهذا المشروع. قم بنقلها أو إلغاء تخصيصها أولاً.", "status");
    }

    private async Task EnsureUniqueCodeAsync(string code, int? exceptId, CancellationToken ct)
    {
        if (await db.Projects.AnyAsync(p => p.Code == code && p.Id != exceptId, ct))
            throw new DomainException("كود المشروع مستخدم من قبل", "code");
    }

    private static void Apply(Project p, ProjectInput i, string code)
    {
        p.Code = code;
        p.Name = i.Name.Trim();
        p.Location = Text.Clean(i.Location);
        p.Description = Text.Clean(i.Description);
        p.StartDate = i.StartDate;
        p.EndDate = i.EndDate;
        p.Status = i.Status;
        p.Notes = Text.Clean(i.Notes);
    }
}
