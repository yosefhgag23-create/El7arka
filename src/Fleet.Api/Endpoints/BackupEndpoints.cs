using Fleet.Infrastructure.Backup;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;

namespace Fleet.Api.Endpoints;

public record CreateBackupInput(string? Note);

public static class BackupEndpoints
{
    public static void MapBackups(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/backups").WithTags("Backup").RequireAuthorization(p => p.RequireRole("Admin"));
        g.MapGet("/", (BackupService s, CancellationToken ct) => s.ListAsync(ct));
        g.MapGet("/status", (BackupService s, CancellationToken ct) => s.StatusAsync(ct));
        g.MapPost("/", (CreateBackupInput? input, BackupService s, CancellationToken ct) => s.CreateAsync(BackupKind.Manual, input?.Note, ct));
        g.MapGet("/{fileName}", async (string fileName, BackupService s, CancellationToken ct) =>
            Results.File(await s.ResolveAsync(fileName, ct), "application/zip", fileName));
        g.MapDelete("/{fileName}", async (string fileName, BackupService s, CancellationToken ct) =>
        {
            await s.DeleteAsync(fileName, ct);
            return Results.NoContent();
        });
        g.MapPost("/import", async (IFormFile file, BackupService s, CancellationToken ct) =>
        {
            await using var stream = file.OpenReadStream();
            return Results.Ok(await s.ImportAsync(stream, file.FileName, ct));
        }).DisableAntiforgery();
        g.MapPost("/{fileName}/restore", async (string fileName, BackupService s, HttpContext http, CancellationToken ct) =>
        {
            var manifest = await s.RestoreAsync(fileName, ct);
            await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.Ok(manifest);
        });
    }
}
