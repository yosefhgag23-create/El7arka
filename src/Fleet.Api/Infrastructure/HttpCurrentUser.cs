using System.Security.Claims;
using Fleet.Application.Abstractions;
using Fleet.Domain.Enums;

namespace Fleet.Api.Infrastructure;

public class HttpCurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private ClaimsPrincipal? Principal => accessor.HttpContext?.User;

    public int? UserId => int.TryParse(Principal?.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    public string? UserName => Principal?.Identity?.IsAuthenticated == true
        ? Principal.FindFirstValue(ClaimTypes.Name)
        : accessor.HttpContext is null ? "system" : null;

    public UserRole? Role => Enum.TryParse<UserRole>(Principal?.FindFirstValue(ClaimTypes.Role), out var r)
        ? r
        : accessor.HttpContext is null ? UserRole.Admin : null;
}
