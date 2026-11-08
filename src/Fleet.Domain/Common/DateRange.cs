namespace Fleet.Domain.Common;

/// <summary>Inclusive date range. <see cref="End"/> null means open-ended.</summary>
public readonly record struct DateRange(DateOnly Start, DateOnly? End)
{
    public bool Contains(DateOnly date) => date >= Start && (End is null || date <= End);

    public bool Overlaps(DateRange other) =>
        (End is null || other.Start <= End) && (other.End is null || Start <= other.End);

    public DateRange? Intersect(DateRange other)
    {
        var start = Start > other.Start ? Start : other.Start;
        DateOnly? end = (End, other.End) switch
        {
            (null, null) => null,
            (null, var e) => e,
            (var e, null) => e,
            var (a, b) => a < b ? a : b
        };
        if (end is not null && end < start) return null;
        return new DateRange(start, end);
    }

    /// <summary>Number of days (inclusive). Requires a closed range.</summary>
    public int Days => End is null
        ? throw new InvalidOperationException("Open range has no day count")
        : End.Value.DayNumber - Start.DayNumber + 1;

    public static DateRange Month(int year, int month) =>
        new(new DateOnly(year, month, 1), new DateOnly(year, month, DateTime.DaysInMonth(year, month)));
}
