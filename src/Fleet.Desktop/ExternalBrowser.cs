using System.Diagnostics;

namespace Fleet.Desktop;

internal static class ExternalBrowser
{
    public static void Open(string target)
    {
        try { Process.Start(new ProcessStartInfo(target) { UseShellExecute = true }); }
        catch (Exception ex)
        {
            MessageBox.Show($"تعذر فتح الرابط:\n{target}\n\n{ex.Message}", AppIcon.Title, MessageBoxButtons.OK, MessageBoxIcon.Warning,
                MessageBoxDefaultButton.Button1, MessageBoxOptions.RtlReading | MessageBoxOptions.RightAlign);
        }
    }
}
