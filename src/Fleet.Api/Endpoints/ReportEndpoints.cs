using Fleet.Application.Reports;

namespace Fleet.Api.Endpoints;

public static class ReportEndpoints
{
    public static void MapReports(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/reports").WithTags("Reports");
        g.MapGet("/", () => ReportService.Catalog);
        g.MapGet("/{key}", (string key, [AsParameters] ReportFilter f, ReportService s, CancellationToken ct) => s.BuildAsync(key, f, ct));
        g.MapGet("/{key}/pdf", (string key, bool? inline, [AsParameters] ReportFilter f, ReportService s, HttpContext http, CancellationToken ct) =>
            Export(key, f, ReportFormat.Pdf, inline == true, s, http, ct));
        g.MapGet("/{key}/xlsx", (string key, [AsParameters] ReportFilter f, ReportService s, HttpContext http, CancellationToken ct) =>
            Export(key, f, ReportFormat.Excel, false, s, http, ct));
    }

    private static async Task<IResult> Export(string key, ReportFilter f, ReportFormat format, bool inline, ReportService s, HttpContext http, CancellationToken ct)
    {
        var file = await s.ExportAsync(key, f, format, ct);
        if (!inline) return Results.File(file.Content, file.ContentType, file.FileName);
        http.Response.Headers.ContentDisposition = new System.Net.Mime.ContentDisposition { Inline = true, FileName = Uri.EscapeDataString(file.FileName) }.ToString();
        return Results.File(file.Content, file.ContentType);
    }
}
