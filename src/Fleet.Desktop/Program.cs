namespace Fleet.Desktop;

internal static class Program
{
    private const string MutexName = @"Local\El7arka.Desktop";
    private const string ShowEventName = @"Local\El7arka.Desktop.Show";

    [STAThread]
    private static int Main(string[] args)
    {
        using var mutex = new Mutex(true, MutexName, out var isFirstInstance);
        if (!isFirstInstance)
        {
            try
            {
                using var existing = EventWaitHandle.OpenExisting(ShowEventName);
                existing.Set();
            }
            catch (WaitHandleCannotBeOpenedException) { }
            return 0;
        }

        using var showEvent = new EventWaitHandle(false, EventResetMode.AutoReset, ShowEventName);
        ApplicationConfiguration.Initialize();

        var context = new DesktopContext(args, showEvent);
        System.Windows.Forms.Application.Run(context);
        context.Shutdown();
        return 0;
    }
}
