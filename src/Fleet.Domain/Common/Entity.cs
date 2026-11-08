namespace Fleet.Domain.Common;

public abstract class Entity
{
    public int Id { get; set; }
}

public abstract class AuditableEntity : Entity
{
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public string? CreatedBy { get; set; }
    public string? UpdatedBy { get; set; }
}

public interface ISoftDeletable
{
    bool IsDeleted { get; set; }
    DateTime? DeletedAt { get; set; }
    string? DeleteReason { get; set; }
}

public abstract class SoftDeletableEntity : AuditableEntity, ISoftDeletable
{
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
    public string? DeleteReason { get; set; }
}

public abstract class LookupEntity : AuditableEntity
{
    public string NameAr { get; set; } = "";
    public string? NameEn { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsSystem { get; set; }
}
