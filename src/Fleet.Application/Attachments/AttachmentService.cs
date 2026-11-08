using Fleet.Application.Abstractions;
using Fleet.Domain.Common;
using Fleet.Domain.Entities;
using Fleet.Domain.Enums;

namespace Fleet.Application.Attachments;

public record AttachmentDto(int Id, string OriginalName, string ContentType, long SizeBytes, DateTime UploadedAt);

public class AttachmentService(IAppDbContext db, IFileStorage files)
{
    /// <summary>Uploads an invoice/receipt before the owning record is saved; the record then references the returned id.</summary>
    public async Task<AttachmentDto> UploadAsync(Stream content, string fileName, string contentType, AttachmentOwnerType ownerType, CancellationToken ct = default)
    {
        var a = await files.SaveAsync(content, fileName, contentType, ownerType, null, ct);
        db.Attachments.Add(a);
        await db.SaveChangesAsync(ct);
        return new AttachmentDto(a.Id, a.OriginalName, a.ContentType, a.SizeBytes, a.UploadedAt);
    }

    public async Task<(Stream Stream, Attachment Meta)> OpenAsync(int id, CancellationToken ct = default)
    {
        var a = await db.Attachments.FindAsync([id], ct) ?? throw new NotFoundException("الملف", id);
        if (!File.Exists(files.GetFullPath(a))) throw new NotFoundException("الملف", id);
        return (files.OpenRead(a), a);
    }
}
