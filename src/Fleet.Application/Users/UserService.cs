using Fleet.Application.Abstractions;
using Fleet.Application.Common;
using Fleet.Domain.Common;
using Fleet.Domain.Entities;
using Fleet.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Fleet.Application.Users;

public record LoginInput(string Username, string Password);

public record UserDto(int Id, string Username, string DisplayName, UserRole Role, bool IsActive, bool MustChangePassword, DateTime? LastLoginAt);

public record UserInput(string Username, string DisplayName, UserRole Role, bool IsActive, string? Password);

public record ChangePasswordInput(string CurrentPassword, string NewPassword);

public class UserService(IAppDbContext db, IPasswordHasher hasher, ICurrentUser current, IClock clock)
{
    public const int MinPasswordLength = 6;

    public async Task<UserDto> LoginAsync(LoginInput input, CancellationToken ct = default)
    {
        var username = input.Username?.Trim().ToLowerInvariant() ?? "";
        var user = await db.Users.FirstOrDefaultAsync(u => u.Username == username, ct);
        if (user is null || !user.IsActive || !hasher.Verify(input.Password ?? "", user.PasswordHash))
            throw new DomainException("اسم المستخدم أو كلمة المرور غير صحيحة");
        user.LastLoginAt = clock.UtcNow;
        await db.SaveChangesAsync(ct);
        return ToDto(user);
    }

    public async Task<UserDto> GetAsync(int id, CancellationToken ct = default) =>
        ToDto(await db.Users.FindAsync([id], ct) ?? throw new NotFoundException("المستخدم", id));

    public async Task<List<UserDto>> ListAsync(CancellationToken ct = default)
    {
        current.RequireAdmin();
        return (await db.Users.AsNoTracking().OrderBy(u => u.Username).ToListAsync(ct)).Select(ToDto).ToList();
    }

    public async Task<int> SaveAsync(int? id, UserInput input, CancellationToken ct = default)
    {
        current.RequireAdmin();
        var username = input.Username?.Trim().ToLowerInvariant() ?? "";
        if (!System.Text.RegularExpressions.Regex.IsMatch(username, "^[a-z0-9._-]{3,50}$"))
            throw new DomainException("اسم المستخدم من 3 إلى 50 حرفاً إنجليزياً أو أرقام", "username");
        if (string.IsNullOrWhiteSpace(input.DisplayName)) throw new DomainException("الاسم مطلوب", "displayName");
        if (await db.Users.AnyAsync(u => u.Username == username && u.Id != id, ct))
            throw new DomainException("اسم المستخدم مستخدم من قبل", "username");

        AppUser user;
        if (id is null)
        {
            if (string.IsNullOrEmpty(input.Password)) throw new DomainException("كلمة المرور مطلوبة", "password");
            user = new AppUser { MustChangePassword = true };
            db.Users.Add(user);
        }
        else
        {
            user = await db.Users.FindAsync([id.Value], ct) ?? throw new NotFoundException("المستخدم", id);
            if (user.Role == UserRole.Admin && (input.Role != UserRole.Admin || !input.IsActive)
                && !await db.Users.AnyAsync(u => u.Id != user.Id && u.Role == UserRole.Admin && u.IsActive, ct))
                throw new DomainException("يجب أن يبقى مدير نظام واحد نشط على الأقل", "role");
        }

        if (!string.IsNullOrEmpty(input.Password))
        {
            ValidatePassword(input.Password);
            user.PasswordHash = hasher.Hash(input.Password);
            user.MustChangePassword = true;
        }
        user.Username = username;
        user.DisplayName = input.DisplayName.Trim();
        user.Role = input.Role;
        user.IsActive = input.IsActive;
        await db.SaveChangesAsync(ct);
        return user.Id;
    }

    public async Task ChangePasswordAsync(ChangePasswordInput input, CancellationToken ct = default)
    {
        var user = await db.Users.FindAsync([current.UserId ?? 0], ct) ?? throw new ForbiddenException("يجب تسجيل الدخول");
        if (!hasher.Verify(input.CurrentPassword ?? "", user.PasswordHash))
            throw new DomainException("كلمة المرور الحالية غير صحيحة", "currentPassword");
        ValidatePassword(input.NewPassword);
        if (input.CurrentPassword == input.NewPassword) throw new DomainException("كلمة المرور الجديدة يجب أن تختلف عن الحالية", "newPassword");
        user.PasswordHash = hasher.Hash(input.NewPassword);
        user.MustChangePassword = false;
        await db.SaveChangesAsync(ct);
    }

    private static void ValidatePassword(string? password)
    {
        if (string.IsNullOrEmpty(password) || password.Length < MinPasswordLength)
            throw new DomainException($"كلمة المرور يجب ألا تقل عن {MinPasswordLength} أحرف", "newPassword");
    }

    private static UserDto ToDto(AppUser u) => new(u.Id, u.Username, u.DisplayName, u.Role, u.IsActive, u.MustChangePassword, u.LastLoginAt);
}
