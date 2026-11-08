using FluentValidation;

namespace Fleet.Application.Common;

public static class ValidationExtensions
{
    public static async Task EnsureValidAsync<T>(this IValidator<T> validator, T instance, CancellationToken ct = default)
    {
        var result = await validator.ValidateAsync(instance, ct);
        if (!result.IsValid) throw new ValidationException(result.Errors);
    }

    public static IRuleBuilderOptions<T, decimal> NonNegativeMoney<T>(this IRuleBuilder<T, decimal> rule) =>
        rule.GreaterThanOrEqualTo(0).WithMessage("لا يمكن أن تكون القيمة سالبة")
            .LessThan(1_000_000_000_000m).WithMessage("القيمة كبيرة جداً");

    public static IRuleBuilderOptions<T, decimal?> NonNegative<T>(this IRuleBuilder<T, decimal?> rule) =>
        rule.GreaterThanOrEqualTo(0).When(_ => true).WithMessage("لا يمكن أن تكون القيمة سالبة");

    public static IRuleBuilderOptions<T, string> RequiredText<T>(this IRuleBuilder<T, string> rule, int max = 200) =>
        rule.NotEmpty().WithMessage("هذا الحقل مطلوب").MaximumLength(max).WithMessage($"الحد الأقصى {max} حرف");

    public static IRuleBuilderOptions<T, string?> OptionalText<T>(this IRuleBuilder<T, string?> rule, int max = 1000) =>
        rule.MaximumLength(max).WithMessage($"الحد الأقصى {max} حرف");
}

public static class Text
{
    /// <summary>Normalizes identifiers (plates, codes) for uniqueness checks: trims, collapses spaces, upper-cases Latin.</summary>
    public static string? NormalizeKey(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        return string.Join(' ', value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)).ToUpperInvariant();
    }

    public static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
