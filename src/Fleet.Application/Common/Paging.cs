using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;

namespace Fleet.Application.Common;

public record PageQuery
{
    public int? Page { get; init; }
    public int? PageSize { get; init; }

    /// <summary>"field" or "field:desc".</summary>
    public string? Sort { get; init; }
    public string? Search { get; init; }

    public int SafePage => Page is null or < 1 ? 1 : Page.Value;
    public int SafePageSize => PageSize is null or < 1 or > 500 ? 25 : PageSize.Value;

    public (string? Field, bool Desc) ParsedSort()
    {
        if (string.IsNullOrWhiteSpace(Sort)) return (null, false);
        var parts = Sort.Split(':', 2);
        return (parts[0].Trim(), parts.Length > 1 && parts[1].Equals("desc", StringComparison.OrdinalIgnoreCase));
    }
}

public record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize);

public static class QueryableExtensions
{
    /// <summary>Applies a whitelisted sort. Unknown fields fall back to the default sort.</summary>
    public static IQueryable<T> ApplySort<T>(
        this IQueryable<T> query,
        PageQuery page,
        IReadOnlyDictionary<string, Expression<Func<T, object?>>> sortMap,
        Expression<Func<T, object?>> defaultSort,
        bool defaultDesc = false)
    {
        var (field, desc) = page.ParsedSort();
        if (field is not null && sortMap.TryGetValue(field, out var key))
            return desc ? query.OrderByDescending(key) : query.OrderBy(key);
        return defaultDesc ? query.OrderByDescending(defaultSort) : query.OrderBy(defaultSort);
    }

    public static async Task<PagedResult<TOut>> ToPagedAsync<T, TOut>(
        this IQueryable<T> query, PageQuery page, Expression<Func<T, TOut>> selector, CancellationToken ct = default)
    {
        var total = await query.CountAsync(ct);
        var items = await query
            .Skip((page.SafePage - 1) * page.SafePageSize)
            .Take(page.SafePageSize)
            .Select(selector)
            .ToListAsync(ct);
        return new PagedResult<TOut>(items, total, page.SafePage, page.SafePageSize);
    }

    public static IQueryable<T> WhereIf<T>(this IQueryable<T> query, bool condition, Expression<Func<T, bool>> predicate) =>
        condition ? query.Where(predicate) : query;
}
