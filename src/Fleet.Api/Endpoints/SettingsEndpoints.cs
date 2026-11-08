using Fleet.Application.Attachments;
using Fleet.Application.Equipments;
using Fleet.Application.Settings;
using Fleet.Domain.Enums;

namespace Fleet.Api.Endpoints;

public static class SettingsEndpoints
{
    public static void MapSettings(this IEndpointRouteBuilder app)
    {
        var l = app.MapGroup("/api/lookups").WithTags("Lookups");
        l.MapGet("/{kind}", (LookupKind kind, bool? activeOnly, LookupService s, CancellationToken ct) => s.ListAsync(kind, activeOnly ?? false, ct));
        l.MapPost("/{kind}", async (LookupKind kind, LookupInput input, LookupService s, CancellationToken ct) =>
            Results.Ok(new { id = await s.CreateAsync(kind, input, ct) }));
        l.MapPut("/{kind}/{id:int}", async (LookupKind kind, int id, LookupInput input, LookupService s, CancellationToken ct) =>
        {
            await s.UpdateAsync(kind, id, input, ct);
            return Results.NoContent();
        });

        var g = app.MapGroup("/api/settings").WithTags("Settings");
        g.MapGet("/", (SettingsService s, CancellationToken ct) => s.GetAsync(ct));
        g.MapPut("/", async (CompanySettingsDto dto, SettingsService s, CancellationToken ct) =>
        {
            await s.UpdateAsync(dto, ct);
            return Results.NoContent();
        });
        g.MapPost("/logo", async (IFormFile file, SettingsService s, CancellationToken ct) =>
        {
            await using var stream = file.OpenReadStream();
            return Results.Ok(new { id = await s.SetLogoAsync(stream, file.FileName, file.ContentType, ct) });
        }).DisableAntiforgery();
        g.MapGet("/status-labels", (SettingsService s, CancellationToken ct) => s.StatusLabelsAsync(ct));
        g.MapPut("/status-labels", async (StatusLabelDto dto, SettingsService s, CancellationToken ct) =>
        {
            await s.UpdateStatusLabelAsync(dto, ct);
            return Results.NoContent();
        });
        g.MapPost("/rental-accruals/run", (RentalAccrualService s, CancellationToken ct) => s.RunAllAsync(ct));

        var a = app.MapGroup("/api/attachments").WithTags("Attachments");
        a.MapPost("/", async (IFormFile file, AttachmentOwnerType? ownerType, AttachmentService s, CancellationToken ct) =>
        {
            await using var stream = file.OpenReadStream();
            return Results.Ok(await s.UploadAsync(stream, file.FileName, file.ContentType, ownerType ?? AttachmentOwnerType.None, ct));
        }).DisableAntiforgery();
        a.MapGet("/{id:int}", async (int id, bool? download, AttachmentService s, CancellationToken ct) =>
        {
            var (stream, meta) = await s.OpenAsync(id, ct);
            return Results.File(stream, meta.ContentType, download == true ? meta.OriginalName : null, enableRangeProcessing: true);
        });
    }
}
