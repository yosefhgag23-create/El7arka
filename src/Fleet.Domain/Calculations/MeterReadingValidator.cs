namespace Fleet.Domain.Calculations;

public sealed record MeterPoint(DateOnly Date, decimal Value, bool IsCorrection = false);

public sealed record MeterValidationResult(bool IsValid, decimal? MinAllowed, decimal? MaxAllowed);

/// <summary>
/// A reading on date d must be ≥ every reading on or before d and ≤ every reading after d.
/// A correction resets the sequence: readings before the latest correction on/before d are ignored,
/// and readings from the next correction after d onward are ignored.
/// </summary>
public static class MeterReadingValidator
{
    public static MeterValidationResult Validate(IEnumerable<MeterPoint> existing, DateOnly date, decimal value)
    {
        if (value < 0) return new(false, 0, null);

        var points = existing.OrderBy(p => p.Date).ToList();
        var lastCorrection = points.Where(p => p.IsCorrection && p.Date <= date).Select(p => (DateOnly?)p.Date).LastOrDefault();
        var nextCorrection = points.Where(p => p.IsCorrection && p.Date > date).Select(p => (DateOnly?)p.Date).FirstOrDefault();

        var window = points.Where(p =>
            (lastCorrection is null || p.Date >= lastCorrection) &&
            (nextCorrection is null || p.Date < nextCorrection)).ToList();

        decimal? min = window.Where(p => p.Date <= date).Select(p => (decimal?)p.Value).Max();
        decimal? max = window.Where(p => p.Date > date).Select(p => (decimal?)p.Value).Min();

        var ok = (min is null || value >= min) && (max is null || value <= max);
        return new(ok, min, max);
    }
}
