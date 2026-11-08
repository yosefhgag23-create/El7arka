using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Fleet.Desktop;

internal sealed class MainForm : Form
{
    private readonly WebView2 web = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.White };
    private readonly Uri home;
    private readonly string userDataFolder;

    public MainForm(string url, string userDataFolder)
    {
        home = new Uri(url);
        this.userDataFolder = userDataFolder;

        Text = $"{AppIcon.Title} | {AppIcon.Subtitle}";
        Icon = AppIcon.Load();
        // No RightToLeftLayout: mirroring the host window would mirror the WebView2 surface; the page itself is RTL.
        RightToLeft = RightToLeft.Yes;
        BackColor = Color.White;
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(1366, 820);
        MinimumSize = new Size(1024, 640);
        WindowState = FormWindowState.Maximized;
        Controls.Add(web);
    }

    /// <summary>Creates the WebView2 environment. Returns false when the WebView2 runtime is not installed.</summary>
    public async Task<bool> InitializeAsync()
    {
        try
        {
            var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder, new CoreWebView2EnvironmentOptions { Language = "ar" });
            await web.EnsureCoreWebView2Async(env);
        }
        catch (WebView2RuntimeNotFoundException)
        {
            return false;
        }

        var core = web.CoreWebView2;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.IsZoomControlEnabled = true;
#if !DEBUG
        core.Settings.AreDevToolsEnabled = false;
#endif
        core.NewWindowRequested += OnNewWindowRequested;
        core.NavigationStarting += OnNavigationStarting;
        core.ProcessFailed += (_, e) =>
        {
            if (e.ProcessFailedKind is CoreWebView2ProcessFailedKind.RenderProcessExited or CoreWebView2ProcessFailedKind.RenderProcessUnresponsive)
                core.Reload();
        };
        core.Navigate(home.ToString());
        return true;
    }

    public void BringToForeground()
    {
        if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Maximized;
        Show();
        Activate();
    }

    private bool IsLocal(string uri) =>
        Uri.TryCreate(uri, UriKind.Absolute, out var u) && (u.Scheme == "about" || u.Scheme == "blob" || u.Scheme == "data" ||
            (u.Host == home.Host && u.Port == home.Port));

    // Same-origin popups (e.g. the print view of a PDF report) stay inside WebView2; anything external opens in the default browser.
    private void OnNewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        if (IsLocal(e.Uri)) return;
        e.Handled = true;
        ExternalBrowser.Open(e.Uri);
    }

    private void OnNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        if (IsLocal(e.Uri)) return;
        e.Cancel = true;
        ExternalBrowser.Open(e.Uri);
    }
}
