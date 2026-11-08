namespace Fleet.Desktop;

internal static class AppIcon
{
    public const string Title = "الحركة";
    public const string Subtitle = "إدارة المعدات والمشروعات والسائقين";

    public static Icon Load()
    {
        using var stream = typeof(AppIcon).Assembly.GetManifestResourceStream("app.ico");
        return stream is null ? SystemIcons.Application : new Icon(stream);
    }
}
