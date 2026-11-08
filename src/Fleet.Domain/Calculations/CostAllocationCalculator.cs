using Fleet.Domain.Common;

namespace Fleet.Domain.Calculations;

public sealed record AssignmentSpan(int ProjectId, DateOnly Start, DateOnly? End);

public sealed record ProjectSlice(int? ProjectId, DateOnly Start, DateOnly End)
{
    public int Days => End.DayNumber - Start.DayNumber + 1;
}

/// <summary>Splits a closed period into contiguous slices by project assignment. Unassigned days get ProjectId = null.</summary>
public static class CostAllocationCalculator
{
    public static IReadOnlyList<ProjectSlice> SplitByProject(DateOnly from, DateOnly to, IEnumerable<AssignmentSpan> spans)
    {
        var result = new List<ProjectSlice>();
        if (to < from) return result;

        var period = new DateRange(from, to);
        var pieces = spans
            .Select(s => (s.ProjectId, Range: new DateRange(s.Start, s.End).Intersect(period)))
            .Where(p => p.Range is not null)
            .Select(p => (p.ProjectId, Start: p.Range!.Value.Start, End: p.Range.Value.End!.Value))
            .OrderBy(p => p.Start)
            .ToList();

        var cursor = from;
        foreach (var (projectId, start, end) in pieces)
        {
            if (end < cursor) continue;
            var s = start < cursor ? cursor : start;
            if (s > cursor) result.Add(new ProjectSlice(null, cursor, s.AddDays(-1)));
            result.Add(new ProjectSlice(projectId, s, end));
            cursor = end.AddDays(1);
            if (cursor > to) break;
        }
        if (cursor <= to) result.Add(new ProjectSlice(null, cursor, to));
        return result;
    }

    /// <summary>Allocates an amount across slices proportionally to days; rounding remainder goes to the last slice.</summary>
    public static IReadOnlyList<(ProjectSlice Slice, decimal Amount)> Allocate(decimal amount, IReadOnlyList<ProjectSlice> slices)
    {
        var totalDays = slices.Sum(s => s.Days);
        if (totalDays == 0) return [];
        var lines = new List<(ProjectSlice, decimal)>();
        decimal allocated = 0;
        for (var i = 0; i < slices.Count; i++)
        {
            var share = i == slices.Count - 1
                ? amount - allocated
                : Money.Round(amount * slices[i].Days / totalDays);
            allocated += share;
            lines.Add((slices[i], share));
        }
        return lines;
    }
}
