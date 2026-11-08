using System.IO.Compression;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Fleet.Api.IntegrationTests;

[Collection("api")]
public class BackupTests(ApiFixture fx)
{
    private readonly HttpClient _c = fx.Client;
    private static string U() => Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();
    private static string Today => DateTime.Now.ToString("yyyy-MM-dd");

    [Fact]
    public async Task Backup_and_restore_round_trip_including_attachments()
    {
        var keptCode = "BK-" + U();
        var kept = await _c.PostId("/api/projects", new { code = keptCode, name = "قبل النسخة", startDate = Today, status = "Active" });

        using var content = new MultipartFormDataContent();
        var bytes = "%PDF-1.4 test invoice"u8.ToArray();
        content.Add(new ByteArrayContent(bytes) { Headers = { ContentType = new("application/pdf") } }, "file", "invoice.pdf");
        var upload = await _c.PostAsync("/api/attachments?ownerType=Expense", content);
        await HttpExtensions.EnsureOk(upload);
        var attachmentId = (await upload.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        var backup = await _c.PostOk("/api/backups", new { note = "اختبار" });
        var fileName = backup.GetProperty("fileName").GetString()!;
        Assert.True(backup.GetProperty("valid").GetBoolean());
        Assert.True(backup.GetProperty("attachmentCount").GetInt32() >= 1);

        var lost = await _c.PostId("/api/projects", new { code = "BK-" + U(), name = "بعد النسخة", startDate = Today, status = "Active" });

        var list = await _c.Get("/api/backups");
        Assert.Contains(list.EnumerateArray(), b => b.GetProperty("fileName").GetString() == fileName);

        var download = await _c.GetAsync($"/api/backups/{fileName}");
        await HttpExtensions.EnsureOk(download);
        using (var zip = new ZipArchive(await download.Content.ReadAsStreamAsync()))
        {
            Assert.NotNull(zip.GetEntry("manifest.json"));
            Assert.NotNull(zip.GetEntry("fleet.db"));
        }

        await _c.PostOk($"/api/backups/{fileName}/restore", new { });
        Assert.Equal(HttpStatusCode.Unauthorized, (await _c.GetAsync("/api/projects")).StatusCode);
        (await _c.PostAsJsonAsync("/api/auth/login", new { username = "admin", password = "admin123" }, ApiFixture.Json)).EnsureSuccessStatusCode();

        Assert.Equal(keptCode, (await _c.Get($"/api/projects/{kept}")).GetProperty("code").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await _c.GetAsync($"/api/projects/{lost}")).StatusCode);
        var att = await _c.GetAsync($"/api/attachments/{attachmentId}");
        await HttpExtensions.EnsureOk(att);
        Assert.Equal(bytes, await att.Content.ReadAsByteArrayAsync());

        var after = await _c.Get("/api/backups");
        Assert.Contains(after.EnumerateArray(), b => b.GetProperty("kind").GetString() == "pre-restore");
    }

    [Fact]
    public async Task Import_rejects_files_that_are_not_backups()
    {
        using var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
        {
            await using var w = new StreamWriter(zip.CreateEntry("manifest.json").Open());
            await w.WriteAsync("{\"app\":\"Other\"}");
        }
        using var content = new MultipartFormDataContent();
        content.Add(new ByteArrayContent(ms.ToArray()), "file", "fake.zip");
        var res = await _c.PostAsync("/api/backups/import", content);
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Backup_endpoints_require_admin()
    {
        var username = "de" + U().ToLowerInvariant();
        await _c.PostId("/api/users", new { username, displayName = "مدخل بيانات", role = "DataEntry", isActive = true, password = "Pass@1234" });
        var de = fx.CreateAnonymousClient();
        (await de.PostAsJsonAsync("/api/auth/login", new { username, password = "Pass@1234" }, ApiFixture.Json)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Forbidden, (await de.GetAsync("/api/backups")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await de.PostAsJsonAsync("/api/lookups/FuelTypes", new { nameAr = "x", sortOrder = 1, isActive = true })).StatusCode);
    }
}
