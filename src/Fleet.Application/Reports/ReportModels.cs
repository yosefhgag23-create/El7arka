using Fleet.Domain.Enums;

namespace Fleet.Application.Reports;

public enum ColumnKind { Text, Integer, Number, Money, Date, Percent }

public record ReportColumn(string Title, ColumnKind Kind = ColumnKind.Text, bool Total = false, float Width = 1);

public record ReportTable(string? Title, List<ReportColumn> Columns, List<object?[]> Rows);

public record ReportSummaryItem(string Label, object? Value, ColumnKind Kind = ColumnKind.Money);

public record ReportFilterValue(string Label, string Value);

/// <summary>Renderer-independent report: the same document feeds the on-screen preview, PDF and Excel.</summary>
public record ReportDocument(string Key, string Title, string Group, List<ReportFilterValue> Filters, List<ReportSummaryItem> Summary,
    List<ReportTable> Tables, string? Note, bool Landscape);

public record ReportInfo(string Key, string Title, string Group, string Description, string[] Filters);

public record ReportFilter
{
    public DateOnly? From { get; init; }
    public DateOnly? To { get; init; }
    public DateOnly? AsOf { get; init; }
    public int? ProjectId { get; init; }
    public int? EquipmentId { get; init; }
    public int? DriverId { get; init; }
    public int? CategoryId { get; init; }
    public int? ExpenseCategoryId { get; init; }
    public OwnershipType? Ownership { get; init; }
    public EquipmentStatus? Status { get; init; }
    public ApprovalStatus? ApprovalStatus { get; init; }
}

public record ReportFile(byte[] Content, string ContentType, string FileName);

public record ReportBranding(string CompanyName, string? Address, string? Phone, string? Email, string? TaxNumber, byte[]? Logo,
    string CurrencySymbol, string DateFormat, string GeneratedBy, DateTime GeneratedAt);

public enum ReportFormat { Pdf, Excel }

public interface IReportRenderer
{
    byte[] RenderPdf(ReportDocument doc, ReportBranding brand);
    byte[] RenderExcel(ReportDocument doc, ReportBranding brand);
}
