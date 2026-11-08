using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Fleet.Api.IntegrationTests;

public sealed class ApiFixture : IAsyncLifetime
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };

    private readonly string _dataRoot = Path.Combine(Path.GetTempPath(), "el7arka-tests", Guid.NewGuid().ToString("N"));
    private WebApplicationFactory<Program> _factory = null!;
    public HttpClient Client { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        Environment.SetEnvironmentVariable("Fleet__DataRoot", _dataRoot);
        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b => b.UseEnvironment("Testing"));
        Client = _factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        var login = await Client.PostAsJsonAsync("/api/auth/login", new { username = "admin", password = "admin123" }, Json);
        login.EnsureSuccessStatusCode();
    }

    public HttpClient CreateAnonymousClient() => _factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });

    public async Task DisposeAsync()
    {
        Client.Dispose();
        await _factory.DisposeAsync();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        try { Directory.Delete(_dataRoot, true); } catch { /* best effort */ }
    }
}

[CollectionDefinition("api")]
public class ApiCollection : ICollectionFixture<ApiFixture>;

public static class HttpExtensions
{
    public static async Task<T> GetJson<T>(this HttpClient c, string url)
    {
        var res = await c.GetAsync(url);
        await EnsureOk(res);
        return (await res.Content.ReadFromJsonAsync<T>(ApiFixture.Json))!;
    }

    public static async Task<JsonElement> Get(this HttpClient c, string url) => await c.GetJson<JsonElement>(url);

    public static async Task<int> PostId(this HttpClient c, string url, object body)
    {
        var res = await c.PostAsJsonAsync(url, body, ApiFixture.Json);
        await EnsureOk(res);
        return (await res.Content.ReadFromJsonAsync<JsonElement>(ApiFixture.Json)).GetProperty("id").GetInt32();
    }

    public static async Task<JsonElement> PostOk(this HttpClient c, string url, object body)
    {
        var res = await c.PostAsJsonAsync(url, body, ApiFixture.Json);
        await EnsureOk(res);
        return res.StatusCode == HttpStatusCode.NoContent ? default : await res.Content.ReadFromJsonAsync<JsonElement>(ApiFixture.Json);
    }

    public static async Task PutOk(this HttpClient c, string url, object body) => await EnsureOk(await c.PutAsJsonAsync(url, body, ApiFixture.Json));

    public static async Task<JsonElement> PostExpectError(this HttpClient c, string url, object body, HttpStatusCode expected = HttpStatusCode.BadRequest)
    {
        var res = await c.PostAsJsonAsync(url, body, ApiFixture.Json);
        var content = await res.Content.ReadAsStringAsync();
        Assert.True(res.StatusCode == expected, $"Expected {expected} but got {res.StatusCode}: {content}");
        return JsonDocument.Parse(content).RootElement;
    }

    public static async Task EnsureOk(HttpResponseMessage res)
    {
        if (!res.IsSuccessStatusCode)
            throw new Xunit.Sdk.XunitException($"{(int)res.StatusCode} {res.RequestMessage?.Method} {res.RequestMessage?.RequestUri}: {await res.Content.ReadAsStringAsync()}");
    }

    public static decimal Dec(this JsonElement e, string prop) => e.GetProperty(prop).GetDecimal();
}
