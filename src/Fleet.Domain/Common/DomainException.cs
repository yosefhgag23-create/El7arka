namespace Fleet.Domain.Common;

/// <summary>Business-rule violation. Message is user-facing (Arabic).</summary>
public class DomainException(string message, string? field = null) : Exception(message)
{
    public string? Field { get; } = field;
}

public class NotFoundException(string entity, object key)
    : Exception($"{entity} ({key}) غير موجود")
{
    public string Entity { get; } = entity;
}
