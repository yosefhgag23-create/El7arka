using Fleet.Application.Abstractions;
using Fleet.Application.Common;
using Fleet.Domain.Common;
using Fleet.Domain.Entities;
using Fleet.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Fleet.Application.Settings;

public record CompanySettingsDto(
    string CompanyName, string? Address, string? Phone, string? Email, string? TaxNumber, int? LogoAttachmentId,
    string Currency, string CurrencySymbol, string DateFormat, decimal DefaultWorkingHours,
    decimal FuelAnomalyThresholdPercent, int MaintenanceDueSoonDays, int MaintenanceDueSoonKm, int MaintenanceDueSoonHours,
    int LicenseExpiryWarningDays, bool AutoAssignSetsOperating, bool AutoBackupEnabled, int AutoBackupRetention,
    string? BackupFolder, bool RentalAccrueCurrentMonth);

public record StatusLabelDto(EquipmentStatus Status, string NameAr, string? NameEn, string Color);

public class CompanySettingsValidator : AbstractValidator<CompanySettingsDto>
{
    public CompanySettingsValidator()
    {
        RuleFor(x => x.CompanyName).RequiredText(200);
        RuleFor(x => x.Currency).RequiredText(10);
        RuleFor(x => x.CurrencySymbol).RequiredText(10);
        RuleFor(x => x.DateFormat).Must(f => f is "dd/MM/yyyy" or "yyyy-MM-dd" or "MM/dd/yyyy").WithMessage("صيغة تاريخ غير مدعومة");
        RuleFor(x => x.DefaultWorkingHours).InclusiveBetween(1, 24).WithMessage("ساعات العمل بين 1 و 24");
        RuleFor(x => x.FuelAnomalyThresholdPercent).InclusiveBetween(1, 500).WithMessage("النسبة بين 1 و 500");
        RuleFor(x => x.MaintenanceDueSoonDays).InclusiveBetween(0, 365);
        RuleFor(x => x.MaintenanceDueSoonKm).InclusiveBetween(0, 100_000);
        RuleFor(x => x.MaintenanceDueSoonHours).InclusiveBetween(0, 10_000);
        RuleFor(x => x.LicenseExpiryWarningDays).InclusiveBetween(0, 365);
        RuleFor(x => x.AutoBackupRetention).InclusiveBetween(1, 365);
    }
}

public class SettingsService(IAppDbContext db, ICurrentUser user, IFileStorage files, IValidator<CompanySettingsDto> validator)
{
    public async Task<CompanySettings> GetEntityAsync(CancellationToken ct = default) =>
        await db.CompanySettings.OrderBy(s => s.Id).FirstOrDefaultAsync(ct)
        ?? throw new DomainException("إعدادات الشركة غير مهيأة");

    public async Task<CompanySettingsDto> GetAsync(CancellationToken ct = default)
    {
        var s = await GetEntityAsync(ct);
        return new CompanySettingsDto(s.CompanyName, s.Address, s.Phone, s.Email, s.TaxNumber, s.LogoAttachmentId, s.Currency,
            s.CurrencySymbol, s.DateFormat, s.DefaultWorkingHours, s.FuelAnomalyThresholdPercent, s.MaintenanceDueSoonDays,
            s.MaintenanceDueSoonKm, s.MaintenanceDueSoonHours, s.LicenseExpiryWarningDays, s.AutoAssignSetsOperating,
            s.AutoBackupEnabled, s.AutoBackupRetention, s.BackupFolder, s.RentalAccrueCurrentMonth);
    }

    public async Task UpdateAsync(CompanySettingsDto dto, CancellationToken ct = default)
    {
        user.RequireAdmin();
        await validator.EnsureValidAsync(dto, ct);
        var s = await GetEntityAsync(ct);
        s.CompanyName = dto.CompanyName.Trim();
        s.Address = Text.Clean(dto.Address);
        s.Phone = Text.Clean(dto.Phone);
        s.Email = Text.Clean(dto.Email);
        s.TaxNumber = Text.Clean(dto.TaxNumber);
        s.Currency = dto.Currency.Trim();
        s.CurrencySymbol = dto.CurrencySymbol.Trim();
        s.DateFormat = dto.DateFormat;
        s.DefaultWorkingHours = dto.DefaultWorkingHours;
        s.FuelAnomalyThresholdPercent = dto.FuelAnomalyThresholdPercent;
        s.MaintenanceDueSoonDays = dto.MaintenanceDueSoonDays;
        s.MaintenanceDueSoonKm = dto.MaintenanceDueSoonKm;
        s.MaintenanceDueSoonHours = dto.MaintenanceDueSoonHours;
        s.LicenseExpiryWarningDays = dto.LicenseExpiryWarningDays;
        s.AutoAssignSetsOperating = dto.AutoAssignSetsOperating;
        s.AutoBackupEnabled = dto.AutoBackupEnabled;
        s.AutoBackupRetention = dto.AutoBackupRetention;
        s.BackupFolder = Text.Clean(dto.BackupFolder);
        s.RentalAccrueCurrentMonth = dto.RentalAccrueCurrentMonth;
        await db.SaveChangesAsync(ct);
    }

    public async Task<int> SetLogoAsync(Stream content, string fileName, string contentType, CancellationToken ct = default)
    {
        user.RequireAdmin();
        if (!contentType.StartsWith("image/")) throw new DomainException("يجب أن يكون الشعار صورة", "file");
        var s = await GetEntityAsync(ct);
        var attachment = await files.SaveAsync(content, fileName, contentType, AttachmentOwnerType.CompanyLogo, s.Id, ct);
        db.Attachments.Add(attachment);
        await db.SaveChangesAsync(ct);
        s.LogoAttachmentId = attachment.Id;
        await db.SaveChangesAsync(ct);
        return attachment.Id;
    }

    public Task<List<StatusLabelDto>> StatusLabelsAsync(CancellationToken ct = default) =>
        db.EquipmentStatusLabels.OrderBy(x => x.Status).Select(x => new StatusLabelDto(x.Status, x.NameAr, x.NameEn, x.Color)).ToListAsync(ct);

    public async Task UpdateStatusLabelAsync(StatusLabelDto dto, CancellationToken ct = default)
    {
        user.RequireAdmin();
        if (string.IsNullOrWhiteSpace(dto.NameAr)) throw new DomainException("الاسم مطلوب", "nameAr");
        if (!System.Text.RegularExpressions.Regex.IsMatch(dto.Color, "^#[0-9A-Fa-f]{6}$")) throw new DomainException("لون غير صالح", "color");
        var label = await db.EquipmentStatusLabels.FirstOrDefaultAsync(x => x.Status == dto.Status, ct)
            ?? throw new NotFoundException("الحالة", dto.Status);
        label.NameAr = dto.NameAr.Trim();
        label.NameEn = Text.Clean(dto.NameEn);
        label.Color = dto.Color;
        await db.SaveChangesAsync(ct);
    }
}
