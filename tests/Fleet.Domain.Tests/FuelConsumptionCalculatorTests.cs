using Fleet.Domain.Calculations;
using Fleet.Domain.Enums;

namespace Fleet.Domain.Tests;

public class FuelConsumptionCalculatorTests
{
    private static DateOnly D(int day) => new(2026, 1, day);

    [Fact]
    public void Requirement_example_500km_100L_gives_5kmpl_and_20L_per_100km()
    {
        var result = FuelConsumptionCalculator.Calculate([
            new FuelFill(1, D(1), 80, 10_000, true),
            new FuelFill(2, D(5), 100, 10_500, true),
        ]);

        var seg = result.Segments.Single(s => s.FillId == 2);
        Assert.Equal(FuelSegmentStatus.Valid, seg.Status);
        Assert.Equal(500, seg.Distance);
        Assert.Equal(100, seg.Fuel);
        Assert.Equal(5m, seg.MeterPerUnit);
        Assert.Equal(20m, seg.UnitsPer100);
        Assert.Equal(5m, result.AverageMeterPerUnit);
        Assert.Equal(180, result.TotalFuel);
    }

    [Fact]
    public void First_fill_has_no_previous_full_tank_and_is_excluded()
    {
        var result = FuelConsumptionCalculator.Calculate([new FuelFill(1, D(1), 50, 1000, true)]);
        Assert.Equal(FuelSegmentStatus.NoPreviousFullTank, result.Segments[0].Status);
        Assert.Null(result.AverageMeterPerUnit);
    }

    [Fact]
    public void Partial_fills_are_added_to_the_next_full_segment()
    {
        var result = FuelConsumptionCalculator.Calculate([
            new FuelFill(1, D(1), 60, 1000, true),
            new FuelFill(2, D(3), 30, 1200, false),
            new FuelFill(3, D(6), 70, 1500, true),
        ]);

        Assert.Equal(FuelSegmentStatus.NotFullTank, result.Segments[1].Status);
        var seg = result.Segments[2];
        Assert.True(seg.IsValid);
        Assert.Equal(500, seg.Distance);
        Assert.Equal(100, seg.Fuel);
    }

    [Fact]
    public void Partial_fill_without_meter_still_counts_fuel()
    {
        var result = FuelConsumptionCalculator.Calculate([
            new FuelFill(1, D(1), 60, 1000, true),
            new FuelFill(2, D(3), 20, null, false),
            new FuelFill(3, D(6), 80, 1500, true),
        ]);
        Assert.Equal(100, result.Segments[2].Fuel);
        Assert.True(result.Segments[2].IsValid);
    }

    [Fact]
    public void Full_fill_without_meter_breaks_the_chain()
    {
        var result = FuelConsumptionCalculator.Calculate([
            new FuelFill(1, D(1), 60, 1000, true),
            new FuelFill(2, D(3), 50, null, true),
            new FuelFill(3, D(6), 80, 1500, true),
        ]);
        Assert.Equal(FuelSegmentStatus.MissingMeter, result.Segments[1].Status);
        Assert.Equal(FuelSegmentStatus.NoPreviousFullTank, result.Segments[2].Status);
        Assert.Equal(0, result.ValidSegments);
    }

    [Fact]
    public void Non_increasing_meter_is_invalid()
    {
        var result = FuelConsumptionCalculator.Calculate([
            new FuelFill(1, D(1), 60, 1000, true),
            new FuelFill(2, D(3), 50, 1000, true),
        ]);
        Assert.Equal(FuelSegmentStatus.NonPositiveDistance, result.Segments[1].Status);
    }

    [Fact]
    public void Correction_inside_segment_invalidates_it()
    {
        var result = FuelConsumptionCalculator.Calculate(
            [new FuelFill(1, D(1), 60, 1000, true), new FuelFill(2, D(10), 50, 400, true)],
            [D(5)]);
        Assert.Equal(FuelSegmentStatus.CorrectionInSegment, result.Segments[1].Status);
    }

    [Fact]
    public void Average_is_weighted_by_distance_not_mean_of_ratios()
    {
        var result = FuelConsumptionCalculator.Calculate([
            new FuelFill(1, D(1), 50, 0, true),
            new FuelFill(2, D(2), 100, 1000, true), // 10 km/L
            new FuelFill(3, D(3), 100, 1200, true), // 2 km/L
        ]);
        Assert.Equal(1200m / 200m, result.AverageMeterPerUnit);
    }

    [Fact]
    public void Out_of_order_input_is_sorted_by_date()
    {
        var result = FuelConsumptionCalculator.Calculate([
            new FuelFill(2, D(5), 100, 10_500, true),
            new FuelFill(1, D(1), 80, 10_000, true),
        ]);
        Assert.Equal(1, result.ValidSegments);
    }

    [Fact]
    public void Anomaly_detects_consumption_above_threshold()
    {
        var seg = new FuelSegment(1, D(1), 0, 0, 100, 100, 40, FuelSegmentStatus.Valid); // 0.4 L/km
        Assert.True(FuelConsumptionCalculator.IsAnomalous(seg, 0.3m, 25));
        Assert.False(FuelConsumptionCalculator.IsAnomalous(seg, 0.35m, 25));
    }
}
