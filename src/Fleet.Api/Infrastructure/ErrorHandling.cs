using Fleet.Application.Common;
using Fleet.Domain.Common;
using FluentValidation;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Fleet.Api.Infrastructure;

/// <summary>Maps domain/validation exceptions to RFC 7807 problem details with Arabic, field-level messages.</summary>
public class AppExceptionHandler(ILogger<AppExceptionHandler> logger, IProblemDetailsService problems) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext http, Exception ex, CancellationToken ct)
    {
        var (status, title, errors) = ex switch
        {
            ValidationException v => (400, "بيانات غير صالحة", v.Errors
                .GroupBy(e => Camel(e.PropertyName))
                .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).Distinct().ToArray())),
            DomainException d => (400, d.Message, d.Field is null ? null : new Dictionary<string, string[]> { [d.Field] = [d.Message] }),
            NotFoundException n => (404, n.Message, null),
            ForbiddenException f => (403, f.Message, null),
            DbUpdateException { InnerException: Microsoft.Data.Sqlite.SqliteException { SqliteErrorCode: 19 } } =>
                (409, "تعارض في البيانات: السجل مرتبط ببيانات أخرى أو مكرر", null),
            _ => (500, "حدث خطأ غير متوقع. تم تسجيل الخطأ.", (Dictionary<string, string[]>?)null)
        };

        if (status == 500) logger.LogError(ex, "Unhandled error on {Path}", http.Request.Path);
        else logger.LogInformation("{Status} on {Path}: {Message}", status, http.Request.Path, ex.Message);

        http.Response.StatusCode = status;
        var pd = new ProblemDetails { Status = status, Title = title };
        if (errors is { Count: > 0 }) pd.Extensions["errors"] = errors;
        return await problems.TryWriteAsync(new ProblemDetailsContext { HttpContext = http, ProblemDetails = pd, Exception = ex });
    }

    private static string Camel(string name)
    {
        if (string.IsNullOrEmpty(name)) return "";
        var last = name.Split('.').Last();
        return char.ToLowerInvariant(last[0]) + last[1..];
    }
}
