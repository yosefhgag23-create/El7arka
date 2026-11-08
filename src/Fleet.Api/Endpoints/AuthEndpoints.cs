using System.Security.Claims;
using Fleet.Application.Abstractions;
using Fleet.Application.Users;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;

namespace Fleet.Api.Endpoints;

public static class AuthEndpoints
{
    public static void MapAuth(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/auth").WithTags("Auth");

        g.MapPost("/login", async (LoginInput input, UserService users, HttpContext http, CancellationToken ct) =>
        {
            var user = await users.LoginAsync(input, ct);
            var identity = new ClaimsIdentity(
            [
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Name, user.Username),
                new Claim("display_name", user.DisplayName),
                new Claim(ClaimTypes.Role, user.Role.ToString()),
            ], CookieAuthenticationDefaults.AuthenticationScheme);
            await http.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity),
                new AuthenticationProperties { IsPersistent = true, ExpiresUtc = DateTimeOffset.UtcNow.AddDays(7) });
            return Results.Ok(user);
        }).AllowAnonymous();

        g.MapPost("/logout", async (HttpContext http) =>
        {
            await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.NoContent();
        }).AllowAnonymous();

        g.MapGet("/me", async (ICurrentUser current, UserService users, CancellationToken ct) =>
            current.UserId is { } id ? Results.Ok(await users.GetAsync(id, ct)) : Results.Unauthorized());

        g.MapPost("/change-password", async (ChangePasswordInput input, UserService users, CancellationToken ct) =>
        {
            await users.ChangePasswordAsync(input, ct);
            return Results.NoContent();
        });

        var u = app.MapGroup("/api/users").WithTags("Users");
        u.MapGet("/", (UserService s, CancellationToken ct) => s.ListAsync(ct));
        u.MapPost("/", async (UserInput input, UserService s, CancellationToken ct) => Results.Ok(new { id = await s.SaveAsync(null, input, ct) }));
        u.MapPut("/{id:int}", async (int id, UserInput input, UserService s, CancellationToken ct) =>
        {
            await s.SaveAsync(id, input, ct);
            return Results.NoContent();
        });
    }
}
