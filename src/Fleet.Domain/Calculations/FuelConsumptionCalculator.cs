using Fleet.Domain.Enums;

namespace Fleet.Domain.Calculations;

public sealed record FuelFill(int Id, DateOnly Date, decimal Quantity, decimal? Meter, bool IsFullTank);

/// <summary>
/// One row per fill. For a valid full-to-full segment, <see cref="Distance"/> is the meter delta since the
/// previous full fill and <see cref="Fuel"/> is the sum of every fill after it up to and including this one.
/// </summary>
public sealed record FuelSegment(
    int FillId,
    DateOnly Date,
    int? AnchorFillId,
    decimal? StartMeter,
    decimal? EndMeter,
    decimal Distance,
    decimal Fuel,
    FuelSegmentStatus Status)
{
    public bool IsValid => Status == FuelSegmentStatus.Valid;

    /// <summary>km per liter (or engine hours per liter).</summary>
    public decimal? MeterPerUnit => IsValid ? Distance / Fuel : null;

    /// <summary>Liters per km (or liters per engine hour).</summary>
    public decimal? UnitsPerMeter => IsValid ? Fuel / Distance : null;

    public decimal? UnitsPer100 => UnitsPerMeter * 100;
}

public sealed record FuelConsumptionSummary(
    decimal TotalFuel,
    decimal ValidDistance,
    decimal ValidFuel,
    int ValidSegments,
    IReadOnlyList<FuelSegment> Segments)
{
    public decimal? AverageMeterPerUnit => ValidFuel > 0 ? ValidDistance / ValidFuel : null;
    public decimal? AverageUnitsPerMeter => ValidDistance > 0 ? ValidFuel / ValidDistance : null;
    public decimal? AverageUnitsPer100 => AverageUnitsPerMeter * 100;
}

/// <summary>Full-tank-to-full-tank consumption method.</summary>
public static class FuelConsumptionCalculator
{
    /// <param name="fills">All fills of a single equipment unit.</param>
    /// <param name="correctionDates">Dates of meter corrections; any segment spanning one is invalid.</param>
    public static FuelConsumptionSummary Calculate(IEnumerable<FuelFill> fills, IEnumerable<DateOnly>? correctionDates = null)
    {
        var ordered = fills
            .OrderBy(f => f.Date)
            .ThenBy(f => f.Meter ?? decimal.MaxValue)
            .ThenBy(f => f.Id)
            .ToList();
        var corrections = (correctionDates ?? []).ToList();

        var segments = new List<FuelSegment>(ordered.Count);
        FuelFill? anchor = null;
        decimal fuelSinceAnchor = 0;

        foreach (var fill in ordered)
        {
            fuelSinceAnchor += fill.Quantity;

            if (!fill.IsFullTank)
            {
                segments.Add(new(fill.Id, fill.Date, anchor?.Id, anchor?.Meter, fill.Meter, 0, fill.Quantity, FuelSegmentStatus.NotFullTank));
                continue;
            }

            if (fill.Meter is null)
            {
                segments.Add(new(fill.Id, fill.Date, anchor?.Id, anchor?.Meter, null, 0, fuelSinceAnchor, FuelSegmentStatus.MissingMeter));
                anchor = null;
                fuelSinceAnchor = 0;
                continue;
            }

            if (anchor is null)
            {
                segments.Add(new(fill.Id, fill.Date, null, null, fill.Meter, 0, fill.Quantity, FuelSegmentStatus.NoPreviousFullTank));
            }
            else
            {
                var distance = fill.Meter.Value - anchor.Meter!.Value;
                var anchorDate = anchor.Date;
                var status = corrections.Any(d => d > anchorDate && d <= fill.Date)
                    ? FuelSegmentStatus.CorrectionInSegment
                    : distance <= 0 || fuelSinceAnchor <= 0
                        ? FuelSegmentStatus.NonPositiveDistance
                        : FuelSegmentStatus.Valid;
                segments.Add(new(fill.Id, fill.Date, anchor.Id, anchor.Meter, fill.Meter, distance, fuelSinceAnchor, status));
            }

            anchor = fill;
            fuelSinceAnchor = 0;
        }

        var valid = segments.Where(s => s.IsValid).ToList();
        return new FuelConsumptionSummary(
            ordered.Sum(f => f.Quantity),
            valid.Sum(s => s.Distance),
            valid.Sum(s => s.Fuel),
            valid.Count,
            segments);
    }

    /// <summary>True when the segment uses more fuel per unit than the reference average by more than the threshold.</summary>
    public static bool IsAnomalous(FuelSegment segment, decimal? referenceUnitsPerMeter, decimal thresholdPercent) =>
        segment.IsValid
        && referenceUnitsPerMeter is > 0
        && segment.UnitsPerMeter > referenceUnitsPerMeter * (1 + thresholdPercent / 100m);
}
