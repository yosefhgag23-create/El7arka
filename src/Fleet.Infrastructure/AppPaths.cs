namespace Fleet.Infrastructure;

/// <summary>Resolves the persistent data folders. Never points to temp folders or browser storage.</summary>
public class AppPaths
{
    public AppPaths(string? dataRoot)
    {
        Root = string.IsNullOrWhiteSpace(dataRoot)
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "El7arka")
            : Path.GetFullPath(Environment.ExpandEnvironmentVariables(dataRoot));
        foreach (var dir in new[] { Root, DataDir, AttachmentsDir, BackupsDir, LogsDir })
            Directory.CreateDirectory(dir);
    }

    public string Root { get; }
    public string DataDir => Path.Combine(Root, "data");
    public string DatabasePath => Path.Combine(DataDir, "fleet.db");
    public string AttachmentsDir => Path.Combine(Root, "attachments");
    public string BackupsDir => Path.Combine(Root, "backups");
    public string LogsDir => Path.Combine(Root, "logs");
}
