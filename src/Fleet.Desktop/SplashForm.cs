namespace Fleet.Desktop;

internal sealed class SplashForm : Form
{
    private readonly Label status;

    public SplashForm()
    {
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        ShowInTaskbar = true;
        Size = new Size(460, 380);
        BackColor = Color.White;
        RightToLeft = RightToLeft.Yes;
        RightToLeftLayout = true;
        Text = AppIcon.Title;
        Icon = AppIcon.Load();
        Padding = new Padding(28);

        var title = new Label
        {
            Text = AppIcon.Title,
            Font = new Font("Segoe UI", 22f, FontStyle.Bold),
            ForeColor = Color.Black,
            AutoSize = false,
            Dock = DockStyle.Top,
            Height = 52,
            TextAlign = ContentAlignment.MiddleCenter,
        };
        var subtitle = new Label
        {
            Text = AppIcon.Subtitle,
            Font = new Font("Segoe UI", 10.5f),
            ForeColor = Color.FromArgb(90, 90, 90),
            Dock = DockStyle.Top,
            Height = 30,
            TextAlign = ContentAlignment.MiddleCenter,
        };
        var progress = new ProgressBar
        {
            Style = ProgressBarStyle.Marquee,
            MarqueeAnimationSpeed = 25,
            Dock = DockStyle.Bottom,
            Height = 6,
        };
        status = new Label
        {
            Text = "جاري تشغيل النظام…",
            Font = new Font("Segoe UI", 9.5f),
            ForeColor = Color.FromArgb(60, 60, 60),
            Dock = DockStyle.Bottom,
            Height = 30,
            TextAlign = ContentAlignment.MiddleRight,
        };

        Controls.Add(status);
        Controls.Add(progress);
        Controls.Add(subtitle);
        Controls.Add(title);
        if (AppIcon.LoadLogo() is { } logo)
            Controls.Add(new PictureBox { Image = logo, SizeMode = PictureBoxSizeMode.Zoom, Dock = DockStyle.Top, Height = 160 });
    }

    public void SetStatus(string text) => status.Text = text;

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        using var pen = new Pen(Color.Black, 2);
        e.Graphics.DrawRectangle(pen, 1, 1, Width - 2, Height - 2);
    }
}
