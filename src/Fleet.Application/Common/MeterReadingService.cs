using Fleet.Application.Abstractions;
using Fleet.Domain.Calculations;
using Fleet.Domain.Common;
using Fleet.Domain.Entities;
using Fleet.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Fleet.Application.Common;

public record MeterReadingDto(int Id, DateOnly ReadingDate, decimal Value, MeterReadingSource Source, int? SourceId, bool IsCorrection, string? CorrectionReason, string? CreatedBy);

public record ManualMeterReadingInput(DateOnly ReadingDate, decimal Value, bool IsCorrection, string? CorrectionReason);

/// <summary>Single source of truth for odometer / engine-hour readings.</summary>
public class MeterReadingService(IAppDbContext db, ICurrentUser user)
{
    /// <summary>The initial reading is dated at the minimum date so it is a lower bound for every later entry.</summary>
    public static readonly DateOnly InitialDate = new(2000, 1, 1);

    public async Task ValidateAsync(int equipmentId, DateOnly date, decimal value, MeterReadingSource? source, int? sourceId, CancellationToken ct = default)
    {
        var points = await db.MeterReadings
            .Where(r => r.EquipmentId == equipmentId && !(source != null && r.Source == source && r.SourceId == sourceId))
            .Select(r => new MeterPoint(r.ReadingDate, r.Value, r.IsCorrection))
            .ToListAsync(ct);

        var result = MeterReadingValidator.Validate(points, date, value);
        if (result.IsValid) return;

        var msg = result.MaxAllowed is null
            ? $"قراءة العداد ({value:N0}) أقل من آخر قراءة مسجلة ({result.MinAllowed:N0}). استخدم تصحيح العداد إذا كانت القراءة صحيحة."
            : $"قراءة العداد يجب أن تكون بين {result.MinAllowed ?? 0:N0} و {result.MaxAllowed:N0} لهذا التاريخ.";
        throw new DomainException(msg, "meterReading");
    }

    /// <summary>Validates and upserts the reading linked to a source record. Caller saves changes.</summary>
    public async Task RecordAsync(int equipmentId, DateOnly date, decimal? value, MeterReadingSource source, int sourceId, CancellationToken ct = default)
    {
        var existing = await db.MeterReadings.FirstOrDefaultAsync(r => r.Source == source && r.SourceId == sourceId, ct);
        if (value is null)
        {
            if (existing is not null) db.MeterReadings.Remove(existing);
            return;
        }

        await ValidateAsync(equipmentId, date, value.Value, source, sourceId, ct);
        if (existing is null)
        {
            db.MeterReadings.Add(new MeterReading { EquipmentId = equipmentId, ReadingDate = date, Value = value.Value, Source = source, SourceId = sourceId });
        }
        else
        {
            existing.EquipmentId = equipmentId;
            existing.ReadingDate = date;
            existing.Value = value.Value;
        }
    }

    public async Task RemoveForSourceAsync(MeterReadingSource source, int sourceId, CancellationToken ct = default)
    {
        var existing = await db.MeterReadings.Where(r => r.Source == source && r.SourceId == sourceId).ToListAsync(ct);
        db.MeterReadings.RemoveRange(existing);
    }

    public async Task<MeterReadingDto> AddManualAsync(int equipmentId, ManualMeterReadingInput input, CancellationToken ct = default)
    {
        var equipment = await db.Equipment.FindAsync([equipmentId], ct) ?? throw new NotFoundException("المعدة", equipmentId);
        if (input.Value < 0) throw new DomainException("قراءة العداد لا يمكن أن تكون سالبة", "value");

        if (input.IsCorrection)
        {
            user.RequireAdmin();
            if (string.IsNullOrWhiteSpace(input.CorrectionReason))
                throw new DomainException("سبب التصحيح مطلوب", "correctionReason");
        }
        else
        {
            await ValidateAsync(equipmentId, input.ReadingDate, input.Value, null, null, ct);
        }

        var reading = new MeterReading
        {
            EquipmentId = equipment.Id,
            ReadingDate = input.ReadingDate,
            Value = input.Value,
            Source = input.IsCorrection ? MeterReadingSource.Correction : MeterReadingSource.Manual,
            IsCorrection = input.IsCorrection,
            CorrectionReason = Text.Clean(input.CorrectionReason)
        };
        db.MeterReadings.Add(reading);
        await db.SaveChangesAsync(ct);
        await RefreshCurrentAsync(equipmentId, ct);
        return new MeterReadingDto(reading.Id, reading.ReadingDate, reading.Value, reading.Source, null, reading.IsCorrection, reading.CorrectionReason, reading.CreatedBy);
    }

    /// <summary>Recomputes Equipment.CurrentMeterReading from persisted readings and saves.</summary>
    public async Task RefreshCurrentAsync(int equipmentId, CancellationToken ct = default)
    {
        var equipment = await db.Equipment.FirstAsync(e => e.Id == equipmentId, ct);
        var latest = await db.MeterReadings
            .Where(r => r.EquipmentId == equipmentId)
            .OrderByDescending(r => r.ReadingDate).ThenByDescending(r => r.Id)
            .Select(r => (decimal?)r.Value)
            .FirstOrDefaultAsync(ct);
        equipment.CurrentMeterReading = latest ?? equipment.InitialMeterReading;
        await db.SaveChangesAsync(ct);
    }

    public Task<List<MeterReadingDto>> ListAsync(int equipmentId, CancellationToken ct = default) =>
        db.MeterReadings.Where(r => r.EquipmentId == equipmentId)
            .OrderByDescending(r => r.ReadingDate).ThenByDescending(r => r.Id)
            .Select(r => new MeterReadingDto(r.Id, r.ReadingDate, r.Value, r.Source, r.SourceId, r.IsCorrection, r.CorrectionReason, r.CreatedBy))
            .ToListAsync(ct);

    /// <summary>Meter usage within an inclusive range: last reading on/before end minus last reading before start.</summary>
    public static decimal? UsageInRange(IReadOnlyList<MeterPoint> ordered, DateOnly from, DateOnly to)
    {
        var endPoint = ordered.LastOrDefault(p => p.Date <= to);
        var startPoint = ordered.LastOrDefault(p => p.Date < from) ?? ordered.FirstOrDefault(p => p.Date >= from && p.Date <= to);
        if (endPoint is null || startPoint is null || ReferenceEquals(endPoint, startPoint)) return null;
        if (ordered.Any(p => p.IsCorrection && p.Date > startPoint.Date && p.Date <= endPoint.Date)) return null;
        var usage = endPoint.Value - startPoint.Value;
        return usage >= 0 ? usage : null;
    }
}
