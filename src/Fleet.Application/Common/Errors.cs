using Fleet.Application.Abstractions;

namespace Fleet.Application.Common;

public class ForbiddenException(string message = "هذا الإجراء متاح لمدير النظام فقط") : Exception(message);

public static class CurrentUserExtensions
{
    public static void RequireAdmin(this ICurrentUser user)
    {
        if (!user.IsAdmin) throw new ForbiddenException();
    }
}
