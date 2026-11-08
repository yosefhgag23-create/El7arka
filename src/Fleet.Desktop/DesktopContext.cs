using System.Net;
using System.Net.Sockets;
using Fleet.Api;
using Fleet.Infrastructure;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.DependencyInjection;

namespace Fleet.Desktop;

/// <summary>
/// Hosts the local web server in-process and shows it in a WebView2 window.
/// Without the WebView2 runtime it falls back to the default browser plus a tray icon that keeps the server alive.
/// </summary>
internal sealed class DesktopContext : ApplicationContext
{
    private readonly string[] args;
    private readonly SplashForm splash = new();
    private readonly SynchronizationContext ui;
    private readonly RegisteredWaitHandle showWait;
    private WebApplication? server;
    private string? url;
    private string? logsDir;
    private MainForm? window;
    private NotifyIcon? tray;

    public DesktopContext(string[] args, EventWaitHandle showEvent)
    {
        this.args = args;
        splash.Show();
        ui = SynchronizationContext.Current ?? new WindowsFormsSynchronizationContext();
        showWait = ThreadPool.RegisterWaitForSingleObject(showEvent, (_, _) => ui.Post(_ => ShowExisting(), null), null, Timeout.Infinite, false);
        _ = StartAsync();
    }

    private async Task StartAsync()
    {
        try
        {
            server = await Task.Run(async () =>
            {
                var app = FleetApp.Build(args, $"http://127.0.0.1:{ChoosePort()}");
                logsDir = app.Services.GetRequiredService<AppPaths>().LogsDir;
                await FleetApp.InitializeAsync(app);
                await app.StartAsync();
                return app;
            });
            url = server.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.First();
            var paths = server.Services.GetRequiredService<AppPaths>();

            splash.SetStatus("جاري فتح الواجهة…");
            var form = new MainForm(url, Path.Combine(paths.Root, "webview"));
            form.Show();
            if (await form.InitializeAsync())
            {
                window = form;
                form.FormClosed += (_, _) => ExitThread();
                splash.Close();
                form.Activate();
            }
            else
            {
                form.Dispose();
                splash.Close();
                ShowTray(webViewMissing: true);
                ExternalBrowser.Open(url);
            }
        }
        catch (Exception ex)
        {
            splash.Close();
            var where = logsDir is null ? "" : $"\n\nسجل الأخطاء: {logsDir}";
            MessageBox.Show($"تعذر تشغيل النظام.\n\n{ex.GetBaseException().Message}{where}", AppIcon.Title, MessageBoxButtons.OK,
                MessageBoxIcon.Error, MessageBoxDefaultButton.Button1, MessageBoxOptions.RtlReading | MessageBoxOptions.RightAlign);
            ExitThread();
        }
    }

    /// <summary>Prefers the fixed port so browser sessions survive restarts; falls back to any free port.</summary>
    private static int ChoosePort()
    {
        try
        {
            var probe = new TcpListener(IPAddress.Loopback, FleetApp.DefaultPort);
            probe.Start();
            probe.Stop();
            return FleetApp.DefaultPort;
        }
        catch (SocketException)
        {
            return 0;
        }
    }

    private void ShowExisting()
    {
        if (window is { IsDisposed: false }) window.BringToForeground();
        else if (url is not null) ExternalBrowser.Open(url);
    }

    private void ShowTray(bool webViewMissing)
    {
        var menu = new ContextMenuStrip { RightToLeft = RightToLeft.Yes };
        menu.Items.Add("فتح النظام", null, (_, _) => ExternalBrowser.Open(url!));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("خروج", null, (_, _) => ExitThread());

        tray = new NotifyIcon
        {
            Icon = AppIcon.Load(),
            Text = AppIcon.Title,
            ContextMenuStrip = menu,
            Visible = true,
        };
        tray.DoubleClick += (_, _) => ExternalBrowser.Open(url!);
        if (webViewMissing)
        {
            tray.ShowBalloonTip(8000, AppIcon.Title,
                "يعمل النظام الآن في المتصفح. لتشغيله في نافذة مستقلة ثبّت Microsoft Edge WebView2 Runtime. للإغلاق استخدم أيقونة النظام بجوار الساعة.",
                ToolTipIcon.Info);
        }
    }

    protected override void ExitThreadCore()
    {
        if (tray is not null) tray.Visible = false;
        base.ExitThreadCore();
    }

    public void Shutdown()
    {
        showWait.Unregister(null);
        tray?.Dispose();
        if (server is null) return;
        try
        {
            server.StopAsync().Wait(TimeSpan.FromSeconds(10));
            server.DisposeAsync().AsTask().Wait(TimeSpan.FromSeconds(5));
        }
        catch { }
    }
}
