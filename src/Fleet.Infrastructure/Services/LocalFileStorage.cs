using System.Security.Cryptography;
using Fleet.Application.Abstractions;
using Fleet.Domain.Common;
using Fleet.Domain.Entities;
using Fleet.Domain.Enums;

namespace Fleet.Infrastructure.Services;

public class LocalFileStorage(AppPaths paths, IClock clock, ICurrentUser user) : IFileStorage
{
    public const long MaxBytes = 15 * 1024 * 1024;

    private static readonly Dictionary<string, string> Allowed = new(StringComparer.OrdinalIgnoreCase)
    {
        [".jpg"] = "image/jpeg", [".jpeg"] = "image/jpeg", [".png"] = "image/png",
        [".webp"] = "image/webp", [".gif"] = "image/gif", [".pdf"] = "application/pdf"
    };

    public string RootPath => paths.AttachmentsDir;

    public async Task<Attachment> SaveAsync(Stream content, string fileName, string contentType,
        AttachmentOwnerType ownerType, int? ownerId, CancellationToken ct = default)
    {
        var ext = Path.GetExtension(fileName);
        if (!Allowed.TryGetValue(ext, out var mime))
            throw new DomainException("نوع الملف غير مسموح. المسموح: صور (JPG, PNG, WEBP) أو PDF", "file");

        var now = clock.UtcNow;
        var relative = Path.Combine(now.ToString("yyyy"), now.ToString("MM"), $"{Guid.NewGuid():N}{ext.ToLowerInvariant()}");
        var full = Path.Combine(paths.AttachmentsDir, relative);
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);

        long size;
        string hash;
        await using (var fs = new FileStream(full, FileMode.CreateNew, FileAccess.Write))
        using (var sha = IncrementalHash.CreateHash(HashAlgorithmName.SHA256))
        {
            var buffer = new byte[81920];
            size = 0;
            int read;
            while ((read = await content.ReadAsync(buffer, ct)) > 0)
            {
                size += read;
                if (size > MaxBytes)
                {
                    await fs.DisposeAsync();
                    File.Delete(full);
                    throw new DomainException("حجم الملف يتجاوز 15 ميجابايت", "file");
                }
                sha.AppendData(buffer, 0, read);
                await fs.WriteAsync(buffer.AsMemory(0, read), ct);
            }
            hash = Convert.ToHexString(sha.GetHashAndReset());
        }

        return new Attachment
        {
            OriginalName = Path.GetFileName(fileName),
            StoredPath = relative.Replace('\\', '/'),
            ContentType = mime,
            SizeBytes = size,
            Sha256 = hash,
            OwnerType = ownerType,
            OwnerId = ownerId,
            UploadedAt = now,
            UploadedBy = user.UserName
        };
    }

    public string GetFullPath(Attachment attachment)
    {
        var full = Path.GetFullPath(Path.Combine(paths.AttachmentsDir, attachment.StoredPath));
        if (!full.StartsWith(Path.GetFullPath(paths.AttachmentsDir), StringComparison.OrdinalIgnoreCase))
            throw new DomainException("مسار ملف غير صالح");
        return full;
    }

    public Stream OpenRead(Attachment attachment) =>
        new FileStream(GetFullPath(attachment), FileMode.Open, FileAccess.Read, FileShare.Read);
}
