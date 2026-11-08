namespace Fleet.Domain.Calculations;

public sealed record RateEntry(int? DriverId, decimal HourlyRate, DateOnly EffectiveFrom, DateOnly? EffectiveTo);

public static class OvertimeCalculator
{
    public static decimal Amount(decimal overtimeHours, decimal hourlyRate) => Money.Round(overtimeHours * hourlyRate);

    /// <summary>Driver-specific rate effective on the date wins over the company default rate.</summary>
    public static decimal? ResolveRate(int driverId, DateOnly date, IEnumerable<RateEntry> rates)
    {
        var effective = rates
            .Where(r => r.EffectiveFrom <= date && (r.EffectiveTo is null || r.EffectiveTo >= date))
            .ToList();
        return effective.Where(r => r.DriverId == driverId).OrderByDescending(r => r.EffectiveFrom).FirstOrDefault()?.HourlyRate
            ?? effective.Where(r => r.DriverId is null).OrderByDescending(r => r.EffectiveFrom).FirstOrDefault()?.HourlyRate;
    }
}
