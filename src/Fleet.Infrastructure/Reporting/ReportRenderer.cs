using System.Globalization;
using ClosedXML.Excel;
using Fleet.Application.Reports;
using QuestPDF.Drawing;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Fleet.Infrastructure.Reporting;

public class ReportRenderer : IReportRenderer
{
    private const string Font = "IBM Plex Sans Arabic";
    private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;
    private static readonly object InitLock = new();
    private static bool _initialized;

    private static void EnsureFonts()
    {
        if (_initialized) return;
        lock (InitLock)
        {
            if (_initialized) return;
            QuestPDF.Settings.License = LicenseType.Community;
            var asm = typeof(ReportRenderer).Assembly;
            foreach (var name in asm.GetManifestResourceNames().Where(n => n.StartsWith("Fonts.", StringComparison.Ordinal)))
            {
                using var s = asm.GetManifestResourceStream(name)!;
                FontManager.RegisterFontFromStream(s);
            }
            _initialized = true;
        }
    }

    // ---------------------------------------------------------------- formatting

    public static string Format(object? v, ColumnKind kind, string dateFormat) => v switch
    {
        null => "",
        DateOnly d => d.ToString(dateFormat, Inv),
        DateTime dt => dt.ToString(dateFormat + " HH:mm", Inv),
        string s => s,
        bool b => b ? "نعم" : "لا",
        _ when ToNumber(v) is { } n => kind switch
        {
            ColumnKind.Integer => n.ToString("#,##0", Inv),
            ColumnKind.Money => n.ToString("#,##0.00", Inv),
            ColumnKind.Percent => n.ToString("0.#", Inv) + "%",
            _ => n.ToString("#,##0.##", Inv),
        },
        _ => v.ToString() ?? "",
    };

    private static decimal? ToNumber(object? v) => v switch
    {
        decimal m => m,
        int i => i,
        long l => l,
        double d => (decimal)d,
        float f => (decimal)f,
        _ => null,
    };

    private static bool IsNumeric(ColumnKind k) => k is ColumnKind.Integer or ColumnKind.Number or ColumnKind.Money or ColumnKind.Percent;

    private static decimal ColumnTotal(ReportTable t, int col) => t.Rows.Sum(r => col < r.Length ? ToNumber(r[col]) ?? 0 : 0);

    // ---------------------------------------------------------------- PDF

    public byte[] RenderPdf(ReportDocument doc, ReportBranding brand)
    {
        EnsureFonts();
        return Document.Create(c => c.Page(p =>
        {
            p.Size(doc.Landscape ? PageSizes.A4.Landscape() : PageSizes.A4);
            p.Margin(24);
            p.ContentFromRightToLeft();
            p.DefaultTextStyle(x => x.FontFamily(Font).FontSize(8.5f).FontColor(Colors.Black));
            // Small horizontal inset: Arabic glyphs at the leading (right) edge otherwise touch the margin and can be clipped.
            p.Header().PaddingHorizontal(2).Element(h => PdfHeader(h, doc, brand));
            p.Content().PaddingVertical(8).PaddingHorizontal(2).Element(body => PdfBody(body, doc, brand));
            p.Footer().PaddingHorizontal(2).BorderTop(0.5f).BorderColor(Colors.Grey.Lighten1).PaddingTop(4).Row(r =>
            {
                r.RelativeItem().Text($"{brand.CompanyName} — {doc.Title}").FontSize(7).FontColor(Colors.Grey.Darken1);
                r.RelativeItem().AlignLeft().Text(t =>
                {
                    t.DefaultTextStyle(x => x.FontSize(7).FontColor(Colors.Grey.Darken1));
                    t.Span("صفحة ");
                    t.CurrentPageNumber();
                    t.Span(" من ");
                    t.TotalPages();
                });
            });
        })).GeneratePdf();
    }

    private static void PdfHeader(IContainer h, ReportDocument doc, ReportBranding brand)
    {
        h.Column(col =>
        {
            col.Item().Row(r =>
            {
                if (brand.Logo is { Length: > 0 })
                    r.ConstantItem(70).Height(48).AlignMiddle().Image(brand.Logo).FitArea();
                r.RelativeItem().PaddingHorizontal(8).Column(c =>
                {
                    c.Item().Text(brand.CompanyName).FontSize(14).Bold();
                    var contact = string.Join("  •  ", new[] { brand.Address, brand.Phone, brand.Email }.Where(x => !string.IsNullOrWhiteSpace(x)));
                    if (contact.Length > 0) c.Item().Text(contact).FontSize(7.5f).FontColor(Colors.Grey.Darken2);
                    if (!string.IsNullOrWhiteSpace(brand.TaxNumber)) c.Item().Text($"الرقم الضريبي: {brand.TaxNumber}").FontSize(7.5f).FontColor(Colors.Grey.Darken2);
                });
                r.ConstantItem(150).AlignLeft().Column(c =>
                {
                    c.Item().AlignLeft().Text(doc.Title).FontSize(13).SemiBold();
                    c.Item().AlignLeft().Text(doc.Group).FontSize(7.5f).FontColor(Colors.Grey.Darken1);
                    c.Item().AlignLeft().Text($"{brand.GeneratedAt.ToString(brand.DateFormat + " HH:mm", Inv)}").FontSize(7.5f).FontColor(Colors.Grey.Darken1);
                    if (!string.IsNullOrWhiteSpace(brand.GeneratedBy))
                        c.Item().AlignLeft().Text($"بواسطة: {brand.GeneratedBy}").FontSize(7.5f).FontColor(Colors.Grey.Darken1);
                });
            });
            col.Item().PaddingTop(6).LineHorizontal(1.2f).LineColor(Colors.Black);
            if (doc.Filters.Count > 0)
                col.Item().PaddingTop(4).Text(t =>
                {
                    t.DefaultTextStyle(x => x.FontSize(7.5f));
                    for (var i = 0; i < doc.Filters.Count; i++)
                    {
                        if (i > 0) t.Span("   |   ").FontColor(Colors.Grey.Medium);
                        t.Span(doc.Filters[i].Label + ": ").FontColor(Colors.Grey.Darken1);
                        t.Span(doc.Filters[i].Value).SemiBold();
                    }
                });
        });
    }

    private static void PdfBody(IContainer body, ReportDocument doc, ReportBranding brand)
    {
        body.Column(col =>
        {
            col.Spacing(10);
            if (doc.Summary.Count > 0)
                col.Item().Inlined(i =>
                {
                    i.Spacing(6);
                    foreach (var s in doc.Summary)
                        i.Item().Width(doc.Landscape ? 150 : 128).Border(0.6f).BorderColor(Colors.Grey.Lighten1).Padding(6).Column(c =>
                        {
                            c.Item().Text(s.Label).FontSize(7.5f).FontColor(Colors.Grey.Darken1);
                            var value = Format(s.Value, s.Kind, brand.DateFormat);
                            if (s.Kind == ColumnKind.Money && value.Length > 0) value += " " + brand.CurrencySymbol;
                            c.Item().Text(value.Length > 0 ? value : "—").FontSize(11).Bold();
                        });
                });

            foreach (var table in doc.Tables)
                col.Item().Element(e => PdfTable(e, table, brand));

            if (!string.IsNullOrWhiteSpace(doc.Note))
                col.Item().Background(Colors.Grey.Lighten4).Padding(6).Text(doc.Note).FontSize(7.5f).FontColor(Colors.Grey.Darken2);
        });
    }

    private static void PdfTable(IContainer container, ReportTable table, ReportBranding brand)
    {
        container.Column(col =>
        {
            if (!string.IsNullOrWhiteSpace(table.Title))
                col.Item().PaddingBottom(4).Text(table.Title).FontSize(10).SemiBold();

            if (table.Rows.Count == 0)
            {
                col.Item().Border(0.5f).BorderColor(Colors.Grey.Lighten1).Padding(10).AlignCenter()
                    .Text("لا توجد بيانات مطابقة للفلاتر المحددة").FontColor(Colors.Grey.Darken1);
                return;
            }

            col.Item().Table(t =>
            {
                t.ColumnsDefinition(cd =>
                {
                    foreach (var c in table.Columns) cd.RelativeColumn(c.Width);
                });
                t.Header(h =>
                {
                    foreach (var c in table.Columns)
                        h.Cell().Background(Colors.Black).PaddingVertical(4).PaddingHorizontal(3)
                            .Element(e => IsNumeric(c.Kind) ? e.AlignCenter() : e)
                            .Text(c.Title).FontColor(Colors.White).SemiBold().FontSize(7.5f);
                });

                for (var r = 0; r < table.Rows.Count; r++)
                {
                    var row = table.Rows[r];
                    var bg = r % 2 == 1 ? Colors.Grey.Lighten5 : Colors.White;
                    for (var i = 0; i < table.Columns.Count; i++)
                    {
                        var c = table.Columns[i];
                        var v = i < row.Length ? row[i] : null;
                        t.Cell().Background(bg).BorderBottom(0.4f).BorderColor(Colors.Grey.Lighten2).PaddingVertical(3).PaddingHorizontal(3)
                            .Element(e => IsNumeric(c.Kind) || c.Kind == ColumnKind.Date ? e.AlignCenter() : e)
                            .Text(Format(v, c.Kind, brand.DateFormat));
                    }
                }

                if (table.Columns.Any(c => c.Total))
                {
                    var labelPlaced = false;
                    for (var i = 0; i < table.Columns.Count; i++)
                    {
                        var c = table.Columns[i];
                        var cell = t.Cell().Background(Colors.Grey.Lighten3).BorderTop(1).BorderColor(Colors.Black).PaddingVertical(4).PaddingHorizontal(3);
                        if (c.Total)
                            cell.AlignCenter().Text(Format(ColumnTotal(table, i), c.Kind, brand.DateFormat)).Bold();
                        else if (!labelPlaced)
                        {
                            cell.Text("الإجمالي").Bold();
                            labelPlaced = true;
                        }
                        else cell.Text("");
                    }
                }
            });
            col.Item().PaddingTop(2).Text($"عدد السجلات: {table.Rows.Count.ToString("#,##0", Inv)}").FontSize(7).FontColor(Colors.Grey.Darken1);
        });
    }

    // ---------------------------------------------------------------- Excel

    public byte[] RenderExcel(ReportDocument doc, ReportBranding brand)
    {
        using var wb = new XLWorkbook();
        wb.Style.Font.FontName = "Arial";
        wb.Style.Font.FontSize = 10;
        wb.RightToLeft = true;

        var tables = doc.Tables.Count > 0 ? doc.Tables : [new ReportTable(null, [], [])];
        var used = new HashSet<string>();
        for (var ti = 0; ti < tables.Count; ti++)
        {
            var table = tables[ti];
            var ws = wb.Worksheets.Add(SheetName(table.Title ?? doc.Title, used));
            ws.RightToLeft = true;
            var cols = Math.Max(table.Columns.Count, 4);
            var row = 1;

            ws.Cell(row, 1).Value = brand.CompanyName;
            ws.Range(row, 1, row, cols).Merge().Style.Font.SetBold().Font.SetFontSize(14);
            row++;
            ws.Cell(row, 1).Value = table.Title is { Length: > 0 } && table.Title != doc.Title ? $"{doc.Title} — {table.Title}" : doc.Title;
            ws.Range(row, 1, row, cols).Merge().Style.Font.SetBold().Font.SetFontSize(12);
            row++;
            ws.Cell(row, 1).Value = $"تاريخ الإصدار: {brand.GeneratedAt.ToString(brand.DateFormat + " HH:mm", Inv)}" +
                                    (string.IsNullOrWhiteSpace(brand.GeneratedBy) ? "" : $"   —   بواسطة: {brand.GeneratedBy}");
            ws.Range(row, 1, row, cols).Merge().Style.Font.SetFontColor(XLColor.Gray);
            row++;
            foreach (var f in doc.Filters)
            {
                ws.Cell(row, 1).Value = f.Label;
                ws.Cell(row, 1).Style.Font.SetFontColor(XLColor.Gray);
                ws.Cell(row, 2).Value = f.Value;
                ws.Range(row, 2, row, cols).Merge().Style.Font.SetBold();
                row++;
            }

            if (ti == 0 && doc.Summary.Count > 0)
            {
                row++;
                foreach (var s in doc.Summary)
                {
                    ws.Cell(row, 1).Value = s.Label;
                    ws.Cell(row, 1).Style.Font.SetFontColor(XLColor.Gray);
                    var vc = ws.Cell(row, 2);
                    vc.Value = ToXl(s.Value);
                    vc.Style.Font.SetBold();
                    ApplyFormat(vc, s.Kind, brand);
                    if (s.Kind == ColumnKind.Money) ws.Cell(row, 3).Value = brand.CurrencySymbol;
                    row++;
                }
            }

            row++;
            if (table.Columns.Count == 0 || table.Rows.Count == 0)
            {
                ws.Cell(row, 1).Value = "لا توجد بيانات مطابقة للفلاتر المحددة";
                ws.Cell(row, 1).Style.Font.SetItalic();
            }
            else
            {
                var headerRow = row;
                for (var i = 0; i < table.Columns.Count; i++)
                    ws.Cell(row, i + 1).Value = table.Columns[i].Title;
                var header = ws.Range(row, 1, row, table.Columns.Count);
                header.Style.Font.SetBold().Font.SetFontColor(XLColor.White).Fill.SetBackgroundColor(XLColor.Black)
                    .Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center).Alignment.SetVertical(XLAlignmentVerticalValues.Center)
                    .Alignment.SetWrapText();
                ws.Row(row).Height = 22;
                row++;

                var first = row;
                foreach (var r in table.Rows)
                {
                    for (var i = 0; i < table.Columns.Count; i++)
                    {
                        var cell = ws.Cell(row, i + 1);
                        cell.Value = ToXl(i < r.Length ? r[i] : null);
                        ApplyFormat(cell, table.Columns[i].Kind, brand);
                    }
                    row++;
                }
                var last = row - 1;
                var data = ws.Range(headerRow, 1, last, table.Columns.Count);
                data.Style.Border.SetOutsideBorder(XLBorderStyleValues.Thin).Border.SetInsideBorder(XLBorderStyleValues.Hair)
                    .Border.SetOutsideBorderColor(XLColor.Black).Border.SetInsideBorderColor(XLColor.LightGray);
                data.SetAutoFilter();

                if (table.Columns.Any(c => c.Total))
                {
                    var labelPlaced = false;
                    for (var i = 0; i < table.Columns.Count; i++)
                    {
                        var c = table.Columns[i];
                        var cell = ws.Cell(row, i + 1);
                        if (c.Total)
                        {
                            var letter = ws.Column(i + 1).ColumnLetter();
                            cell.FormulaA1 = $"SUM({letter}{first}:{letter}{last})";
                            ApplyFormat(cell, c.Kind, brand);
                        }
                        else if (!labelPlaced)
                        {
                            cell.Value = "الإجمالي";
                            labelPlaced = true;
                        }
                    }
                    var totals = ws.Range(row, 1, row, table.Columns.Count);
                    totals.Style.Font.SetBold().Fill.SetBackgroundColor(XLColor.FromHtml("#EDEDED"))
                        .Border.SetTopBorder(XLBorderStyleValues.Medium).Border.SetOutsideBorder(XLBorderStyleValues.Thin);
                    row++;
                }

                ws.SheetView.FreezeRows(headerRow);
                ws.Columns(1, table.Columns.Count).AdjustToContents(headerRow, last + 1);
                for (var i = 1; i <= table.Columns.Count; i++)
                {
                    var col = ws.Column(i);
                    col.Width = Math.Clamp(col.Width + 2, 10, 48);
                }
            }

            if (!string.IsNullOrWhiteSpace(doc.Note) && ti == tables.Count - 1)
            {
                row += 1;
                ws.Cell(row, 1).Value = doc.Note;
                ws.Range(row, 1, row, cols).Merge().Style.Alignment.SetWrapText().Font.SetFontColor(XLColor.Gray);
                ws.Row(row).Height = 30;
            }

            ws.PageSetup.PageOrientation = doc.Landscape ? XLPageOrientation.Landscape : XLPageOrientation.Portrait;
            ws.PageSetup.PaperSize = XLPaperSize.A4Paper;
            ws.PageSetup.FitToPages(1, 0);
        }

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    private static void ApplyFormat(IXLCell cell, ColumnKind kind, ReportBranding brand)
    {
        switch (kind)
        {
            case ColumnKind.Integer: cell.Style.NumberFormat.Format = "#,##0"; break;
            case ColumnKind.Money: cell.Style.NumberFormat.Format = "#,##0.00"; break;
            case ColumnKind.Number: cell.Style.NumberFormat.Format = "#,##0.##"; break;
            case ColumnKind.Percent: cell.Style.NumberFormat.Format = "0.0\"%\""; break;
            case ColumnKind.Date: cell.Style.DateFormat.Format = brand.DateFormat; break;
        }
        if (kind != ColumnKind.Text) cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
    }

    private static XLCellValue ToXl(object? v) => v switch
    {
        null => Blank.Value,
        string s => s,
        DateOnly d => d.ToDateTime(TimeOnly.MinValue),
        DateTime dt => dt,
        bool b => b ? "نعم" : "لا",
        _ when ToNumber(v) is { } n => (double)n,
        _ => v.ToString() ?? "",
    };

    private static string SheetName(string title, HashSet<string> used)
    {
        var clean = new string(title.Where(ch => "[]:*?/\\".IndexOf(ch) < 0).ToArray()).Trim();
        if (clean.Length == 0) clean = "Sheet";
        if (clean.Length > 28) clean = clean[..28];
        var name = clean;
        for (var i = 2; !used.Add(name); i++) name = $"{clean} {i}";
        return name;
    }
}
