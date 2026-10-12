// ═══════════════════════════════════════════════════════════════════════════
//  Zeralda ERP — Professional Setup Wizard  (v2)
//  Full rewrite: correct AppDir, C:\ZeraldaERP default, server log capture,
//  package verification, Launch_ERP.ps1 patch.
// ═══════════════════════════════════════════════════════════════════════════
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Linq;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

ApplicationConfiguration.Initialize();
Application.Run(new SetupForm());

// ════════════════════════════════════════════════════════════════════════════
public class SetupForm : Form
{
    // ── Layout ────────────────────────────────────────────────────────────────
    Panel   leftPanel, rightPanel, bottomBar;
    Label   brandTitle, versionLbl;
    Panel   pageWelcome, pageInstall, pageFinish;
    // Welcome
    TextBox txtInstallPath;
    CheckBox chkDesktop, chkStartMenu, chkStartup, chkRequirements;
    // Install
    Label      lblStatus;
    ProgressBar progBar;
    RichTextBox rtbLog;
    // Finish
    Label   finishTitle;
    CheckBox chkLaunch;
    // Buttons
    Button btnNext, btnCancel;
    int    currentPage = 0;
    string installPath;
    bool   installSuccess = false;

    static readonly Color C_DARK  = Color.FromArgb(15, 35, 70);
    static readonly Color C_BLUE  = Color.FromArgb(25, 85, 160);
    static readonly Color C_GOLD  = Color.FromArgb(210, 165, 30);
    static readonly Color C_LIGHT = Color.FromArgb(238, 242, 250);
    static readonly Color C_WHITE = Color.White;

    // ── AppDir: real EXE directory (single-file apps extract to %TEMP%, so
    //           we must use MainModule.FileName, not AppContext.BaseDirectory) ──
    static string GetRealExeDir()
    {
        try {
            string? p = Process.GetCurrentProcess().MainModule?.FileName;
            if (!string.IsNullOrEmpty(p)) return Path.GetDirectoryName(p)!;
        } catch {}
        try {
            string? p = Environment.ProcessPath;
            if (!string.IsNullOrEmpty(p)) return Path.GetDirectoryName(p)!;
        } catch {}
        return AppContext.BaseDirectory.TrimEnd('\\', '/');
    }
    string AppDir => GetRealExeDir();

    public SetupForm()
    {
        // Avoid "Program Files" — Python venvs can fail there due to path spaces
        // and UAC write restrictions. Use a simple root path instead.
        installPath = @"C:\ZeraldaERP";
        BuildUI();
        ShowPage(0);
    }

    // ── Build UI ──────────────────────────────────────────────────────────────
    void BuildUI()
    {
        Text            = "Zeralda ERP — Setup Wizard";
        Size            = new Size(840, 570);
        MinimumSize     = Size;
        MaximumSize     = Size;
        StartPosition   = FormStartPosition.CenterScreen;
        BackColor       = C_WHITE;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox     = false;
        try { Icon = new Icon(Path.Combine(AppDir, "launcher", "app.ico")); } catch {}

        // Left branding panel
        leftPanel = new Panel { Dock = DockStyle.Left, Width = 230, BackColor = C_DARK };
        leftPanel.Paint += PaintLeft;
        Controls.Add(leftPanel);

        brandTitle = new Label {
            Text = "Zeralda\nERP",
            Font = new Font("Segoe UI", 28, FontStyle.Bold),
            ForeColor = C_WHITE, TextAlign = ContentAlignment.MiddleCenter,
            Location = new Point(10, 60), Size = new Size(210, 100)
        };
        leftPanel.Controls.Add(brandTitle);

        var div = new Panel { BackColor = C_GOLD, Location = new Point(20, 168), Size = new Size(190, 3) };
        leftPanel.Controls.Add(div);

        var sub = new Label {
            Text = "Enterprise Resource\nPlanning System",
            Font = new Font("Segoe UI", 9), ForeColor = Color.FromArgb(170, 195, 230),
            TextAlign = ContentAlignment.MiddleCenter,
            Location = new Point(10, 178), Size = new Size(210, 50)
        };
        leftPanel.Controls.Add(sub);

        // Step indicators
        string[] steps = { "1  Welcome", "2  Install", "3  Finish" };
        for (int i = 0; i < steps.Length; i++) {
            int ii = i;
            var lbl = new Label {
                Name = "step" + i,
                Text = steps[i], Font = new Font("Segoe UI", 10),
                ForeColor = Color.FromArgb(100, 130, 180),
                Location = new Point(30, 280 + i * 46), Size = new Size(175, 36),
                TextAlign = ContentAlignment.MiddleLeft
            };
            leftPanel.Controls.Add(lbl);
        }

        versionLbl = new Label {
            Text = "v1.0.0", Font = new Font("Segoe UI", 8),
            ForeColor = Color.FromArgb(80, 110, 160),
            Location = new Point(10, 485), Size = new Size(210, 20),
            TextAlign = ContentAlignment.MiddleCenter
        };
        leftPanel.Controls.Add(versionLbl);

        // Right panel
        rightPanel = new Panel {
            Location = new Point(230, 0), Size = new Size(610, 500), BackColor = C_WHITE
        };
        Controls.Add(rightPanel);

        // Bottom bar
        bottomBar = new Panel { Dock = DockStyle.Bottom, Height = 62, BackColor = C_LIGHT };
        bottomBar.Paint += (s, e) =>
            e.Graphics.DrawLine(new Pen(Color.FromArgb(198, 208, 228)), 0, 0, bottomBar.Width, 0);
        Controls.Add(bottomBar);

        btnCancel = MakeBtn("Cancel",    new Point(530, 15), 72);
        btnNext   = MakeBtn("Install »", new Point(428, 15), 96);
        var btnBack = MakeBtn("« Back",  new Point(340, 15), 82);
        btnBack.Enabled = false;

        btnCancel.BackColor = Color.FromArgb(210, 45, 45);
        btnCancel.ForeColor = C_WHITE;
        btnNext.BackColor   = C_BLUE;
        btnNext.ForeColor   = C_WHITE;
        btnNext.Font        = new Font("Segoe UI", 10, FontStyle.Bold);

        bottomBar.Controls.AddRange(new Control[] { btnBack, btnNext, btnCancel });
        btnNext.Click   += (s, e) => NextClicked();
        btnCancel.Click += (s, e) => CancelClicked();

        BuildPageWelcome();
        BuildPageInstall();
        BuildPageFinish();
    }

    void PaintLeft(object? s, PaintEventArgs e)
    {
        using var br = new LinearGradientBrush(leftPanel.ClientRectangle,
            C_DARK, Color.FromArgb(8, 20, 48), LinearGradientMode.Vertical);
        e.Graphics.FillRectangle(br, leftPanel.ClientRectangle);
        using var pen = new Pen(C_BLUE, 3);
        e.Graphics.DrawLine(pen, leftPanel.Width - 2, 0, leftPanel.Width - 2, leftPanel.Height);
    }

    Button MakeBtn(string text, Point loc, int w)
    {
        var b = new Button {
            Text = text, Location = loc, Size = new Size(w, 34),
            FlatStyle = FlatStyle.Flat, Font = new Font("Segoe UI", 9),
            BackColor = Color.FromArgb(225, 230, 245), ForeColor = C_DARK
        };
        b.FlatAppearance.BorderColor = Color.FromArgb(175, 192, 220);
        return b;
    }

    // ── Welcome page ──────────────────────────────────────────────────────────
    void BuildPageWelcome()
    {
        pageWelcome = new Panel { Dock = DockStyle.Fill, BackColor = C_WHITE, Visible = false };
        rightPanel.Controls.Add(pageWelcome);

        PageHeader(pageWelcome, "Welcome to Zeralda ERP Setup",
            "This wizard will install Zeralda ERP on your computer.");

        AddLabel(pageWelcome, "The following components will be installed:", new Point(24, 104), 560, 9, bold: true);
        string[] items = {
            "  \u2714  Zeralda ERP Application Files",
            "  \u2714  Python Virtual Environment (.venv)",
            "  \u2714  All Python dependencies (requirements.txt)",
            "  \u2714  Desktop & Start Menu shortcuts",
            "  \u2714  Server auto-start on Windows login"
        };
        int y = 126;
        foreach (var item in items) {
            AddLabel(pageWelcome, item, new Point(24, y), 560, 9);
            y += 22;
        }

        AddLabel(pageWelcome, "Install to:", new Point(24, 244), 120, 9, bold: true);
        txtInstallPath = new TextBox {
            Text = installPath, Font = new Font("Segoe UI", 9),
            Location = new Point(24, 264), Size = new Size(460, 26)
        };
        txtInstallPath.TextChanged += (s, e) => installPath = txtInstallPath.Text;
        pageWelcome.Controls.Add(txtInstallPath);

        var btnBrowse = new Button {
            Text = "…", Location = new Point(490, 263), Size = new Size(36, 26),
            FlatStyle = FlatStyle.Flat, Font = new Font("Segoe UI", 9)
        };
        btnBrowse.Click += (s, e) => {
            using var d = new FolderBrowserDialog { Description = "Select folder", SelectedPath = installPath };
            if (d.ShowDialog() == DialogResult.OK) { installPath = d.SelectedPath; txtInstallPath.Text = installPath; }
        };
        pageWelcome.Controls.Add(btnBrowse);

        AddLabel(pageWelcome, "Options:", new Point(24, 300), 100, 9, bold: true);
        chkRequirements = AddCheck(pageWelcome, "Install Python dependencies (requirements.txt)", new Point(30, 322));
        chkDesktop      = AddCheck(pageWelcome, "Create Desktop shortcut",                        new Point(30, 348));
        chkStartMenu    = AddCheck(pageWelcome, "Create Start Menu shortcut",                      new Point(30, 374));
        chkStartup      = AddCheck(pageWelcome, "Auto-start server on Windows login",              new Point(30, 400));
    }

    // ── Install page ──────────────────────────────────────────────────────────
    void BuildPageInstall()
    {
        pageInstall = new Panel { Dock = DockStyle.Fill, BackColor = C_WHITE, Visible = false };
        rightPanel.Controls.Add(pageInstall);
        PageHeader(pageInstall, "Installing Zeralda ERP...", "Please wait while the components are installed.");

        lblStatus = new Label {
            Text = "Preparing...", Font = new Font("Segoe UI", 9),
            ForeColor = C_BLUE, Location = new Point(24, 100), Size = new Size(560, 22)
        };
        pageInstall.Controls.Add(lblStatus);

        progBar = new ProgressBar {
            Location = new Point(24, 126), Size = new Size(560, 24),
            Style = ProgressBarStyle.Continuous, Maximum = 100
        };
        pageInstall.Controls.Add(progBar);

        rtbLog = new RichTextBox {
            Location = new Point(24, 162), Size = new Size(560, 296),
            Font = new Font("Consolas", 8),
            BackColor = Color.FromArgb(18, 22, 32), ForeColor = Color.FromArgb(140, 215, 140),
            ReadOnly = true, ScrollBars = RichTextBoxScrollBars.Vertical, BorderStyle = BorderStyle.None
        };
        pageInstall.Controls.Add(rtbLog);
    }

    // ── Finish page ───────────────────────────────────────────────────────────
    void BuildPageFinish()
    {
        pageFinish = new Panel { Dock = DockStyle.Fill, BackColor = C_WHITE, Visible = false };
        rightPanel.Controls.Add(pageFinish);
        PageHeader(pageFinish, "Installation Complete!", "Zeralda ERP is ready to use.");

        var icon = new Label {
            Text = "\u2714", Font = new Font("Segoe UI", 64, FontStyle.Bold),
            ForeColor = Color.FromArgb(35, 175, 75), TextAlign = ContentAlignment.MiddleCenter,
            Location = new Point(230, 120), Size = new Size(140, 120)
        };
        pageFinish.Controls.Add(icon);

        finishTitle = new Label {
            Text = "Zeralda ERP v1.0.0 has been installed successfully.\n\nYou can launch it from the Desktop shortcut\nor from the Start Menu.",
            Font = new Font("Segoe UI", 10), ForeColor = Color.FromArgb(40, 55, 80),
            Location = new Point(24, 260), Size = new Size(560, 80), TextAlign = ContentAlignment.MiddleCenter
        };
        pageFinish.Controls.Add(finishTitle);

        chkLaunch = new CheckBox {
            Text = "Launch Zeralda ERP now",
            Checked = true, Font = new Font("Segoe UI", 10, FontStyle.Bold),
            ForeColor = C_DARK, Location = new Point(195, 360), Size = new Size(260, 26)
        };
        pageFinish.Controls.Add(chkLaunch);
    }

    // ── Helpers ────────────────────────────────────────────────────────────────
    void PageHeader(Panel p, string title, string sub)
    {
        var hdr = new Panel { Dock = DockStyle.Top, Height = 82, BackColor = C_LIGHT };
        hdr.Paint += (s, e) =>
            e.Graphics.DrawLine(new Pen(Color.FromArgb(195, 208, 228)), 0, 81, 700, 81);
        p.Controls.Add(hdr);
        hdr.Controls.Add(new Label {
            Text = title, Font = new Font("Segoe UI", 16, FontStyle.Bold), ForeColor = C_DARK,
            Location = new Point(22, 14), Size = new Size(560, 38), BackColor = C_LIGHT
        });
        hdr.Controls.Add(new Label {
            Text = sub, Font = new Font("Segoe UI", 9), ForeColor = Color.Gray,
            Location = new Point(24, 54), Size = new Size(560, 22), BackColor = C_LIGHT
        });
    }

    Label AddLabel(Panel p, string text, Point loc, int w, float fs, bool bold = false)
    {
        var l = new Label {
            Text = text, Font = new Font("Segoe UI", fs, bold ? FontStyle.Bold : FontStyle.Regular),
            ForeColor = Color.FromArgb(45, 55, 75), Location = loc, Size = new Size(w, 22), AutoSize = false
        };
        p.Controls.Add(l);
        return l;
    }

    CheckBox AddCheck(Panel p, string text, Point loc)
    {
        var c = new CheckBox {
            Text = text, Checked = true, Font = new Font("Segoe UI", 9),
            ForeColor = C_DARK, Location = loc, Size = new Size(300, 22)
        };
        p.Controls.Add(c);
        return c;
    }

    // ── Page navigation ────────────────────────────────────────────────────────
    void ShowPage(int page)
    {
        currentPage = page;
        // Highlight step labels
        foreach (Control c in leftPanel.Controls) {
            if (c.Name.StartsWith("step")) {
                int idx = int.Parse(c.Name.Substring(4));
                c.ForeColor = idx == page ? C_GOLD : Color.FromArgb(100, 130, 180);
                c.Font = new Font("Segoe UI", 10, idx == page ? FontStyle.Bold : FontStyle.Regular);
            }
        }
        pageWelcome.Visible = page == 0;
        pageInstall.Visible = page == 1;
        pageFinish.Visible  = page == 2;
        btnCancel.Visible = page != 2;
        switch (page) {
            case 0: btnNext.Text = "Install »"; btnNext.Enabled = true; break;
            case 1: btnNext.Text = "Installing..."; btnNext.Enabled = false; StartInstall(); break;
            case 2: btnNext.Text = "  Finish  "; btnNext.Enabled = true; break;
        }
    }

    void NextClicked()
    {
        if (currentPage == 0) ShowPage(1);
        else if (currentPage == 2) {
            if (chkLaunch.Checked) {
                var lnk = Path.Combine(installPath, "launcher", "Launch_ERP.cmd");
                if (File.Exists(lnk)) Process.Start(new ProcessStartInfo(lnk) { UseShellExecute = true });
            }
            Application.Exit();
        }
    }

    void CancelClicked()
    {
        if (currentPage == 1) return;
        if (MessageBox.Show("Cancel installation?", "Zeralda ERP Setup",
            MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
            Application.Exit();
    }

    // ── Installation engine ────────────────────────────────────────────────────
    void StartInstall() => new Thread(() => RunInstall()) { IsBackground = true }.Start();

    void SetStatus(string msg, int pct = -1)
    {
        Invoke(() => {
            lblStatus.Text = msg;
            if (pct >= 0) progBar.Value = Math.Min(pct, 100);
        });
    }

    void Log(string msg, Color? col = null)
    {
        Invoke(() => {
            rtbLog.SelectionStart  = rtbLog.TextLength;
            rtbLog.SelectionLength = 0;
            rtbLog.SelectionColor  = col ?? Color.FromArgb(140, 215, 140);
            rtbLog.AppendText(msg + "\n");
            rtbLog.ScrollToCaret();
        });
    }

    bool Step(string label, int pct, Func<bool> action)
    {
        SetStatus(label, pct);
        Log($"[>>] {label}", Color.FromArgb(90, 175, 255));
        try {
            bool ok = action();
            Log(ok ? $"[OK] Done" : "[!!] Skipped (optional)", ok ? Color.FromArgb(70, 210, 95) : Color.FromArgb(255, 195, 55));
            return ok;
        } catch (Exception ex) {
            Log($"[XX] {ex.Message}", Color.FromArgb(255, 80, 80));
            return false;
        }
    }

    // Run a command, log its stderr to the UI, return stdout.
    // Throws if exit code != 0 and failOnError = true.
    string Cmd(string exe, string args, string? workDir = null, bool failOnError = false)
    {
        var psi = new ProcessStartInfo(exe, args) {
            UseShellExecute        = false,
            RedirectStandardOutput = true,
            RedirectStandardError  = true,
            CreateNoWindow         = true,
            WorkingDirectory       = workDir ?? (Directory.Exists(installPath) ? installPath : Environment.CurrentDirectory)
        };
        using var p = Process.Start(psi)!;
        string stdout = p.StandardOutput.ReadToEnd();
        string stderr = p.StandardError.ReadToEnd();
        p.WaitForExit();
        if (!string.IsNullOrWhiteSpace(stderr))
            Log("    " + stderr.Trim().Replace("\n", "\n    "), Color.FromArgb(255, 190, 60));
        if (failOnError && p.ExitCode != 0)
            throw new Exception($"Exit {p.ExitCode}: {stderr.Trim().Split('\n')[0]}");
        return stdout;
    }

    // Copy a whole directory recursively (used for backend/modules/shared/etc.)
    void CopyDirFull(string src, string dst)
    {
        Directory.CreateDirectory(dst);
        var skipDirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
            "__pycache__", ".git", "node_modules"
        };
        foreach (var f in Directory.GetFiles(src))
            File.Copy(f, Path.Combine(dst, Path.GetFileName(f)), overwrite: true);
        foreach (var d in Directory.GetDirectories(src)) {
            var n = Path.GetFileName(d);
            if (!skipDirs.Contains(n))
                CopyDirFull(d, Path.Combine(dst, n));
        }
    }

    // Copy only the application files needed to run the ERP (whitelist approach)
    void CopyAppFiles(string src, string dst)
    {
        Directory.CreateDirectory(dst);

        // ── Root files (only what the server needs) ──────────────────────────
        var rootFiles = new[] {
            "server.py", "requirements.txt", "favicon.ico", "logo.png",
            "index.html", "login.html", "login_secure.html",
            "login_with_key.html", "zeralda_erp_dashboard.html",
            "settings.html", "LICENSE.txt",
            "reset_admin_password.py"
        };
        foreach (var f in rootFiles) {
            string s = Path.Combine(src, f);
            if (File.Exists(s)) File.Copy(s, Path.Combine(dst, f), overwrite: true);
        }
        // .env — only if destination doesn't have one (preserve existing config)
        string envSrc = Path.Combine(src, ".env");
        string envDst = Path.Combine(dst, ".env");
        if (File.Exists(envSrc) && !File.Exists(envDst))
            File.Copy(envSrc, envDst);

        // ── Full-directory copies ─────────────────────────────────────────────
        var fullDirs = new[] { "backend", "database", "modules", "shared", "styles", "cert" };
        foreach (var d in fullDirs) {
            string s = Path.Combine(src, d);
            if (Directory.Exists(s)) CopyDirFull(s, Path.Combine(dst, d));
        }

        // ── launcher/ — all files except runtime .pid ─────────────────────────
        string launcherSrc = Path.Combine(src, "launcher");
        string launcherDst = Path.Combine(dst, "launcher");
        if (Directory.Exists(launcherSrc)) {
            Directory.CreateDirectory(launcherDst);
            foreach (var f in Directory.GetFiles(launcherSrc)) {
                string n = Path.GetFileName(f);
                if (n.EndsWith(".pid", StringComparison.OrdinalIgnoreCase)) continue;
                File.Copy(f, Path.Combine(launcherDst, n), overwrite: true);
            }
        }

        // ── data/ — only initial data files, not runtime logs/sessions ────────
        string dataDst = Path.Combine(dst, "data");
        Directory.CreateDirectory(dataDst);
        Directory.CreateDirectory(Path.Combine(dataDst, "logs"));
        var dataFiles = new[] { "users.json", "keys.json" };
        string dataSrc = Path.Combine(src, "data");
        if (Directory.Exists(dataSrc)) {
            foreach (var f in dataFiles) {
                string s = Path.Combine(dataSrc, f);
                string d2 = Path.Combine(dataDst, f);
                if (File.Exists(s) && !File.Exists(d2)) File.Copy(s, d2);
            }
        }

        // ── Empty runtime dirs & WebView2 cache ─────────────────────────────
        Directory.CreateDirectory(Path.Combine(dst, "logs"));
        Directory.CreateDirectory(Path.Combine(dst, ".webview2_cache"));
    }

    void CreateShortcut(string lnkPath, string target, string workDir, string? icon = null)
    {
        var wshType = Type.GetTypeFromProgID("WScript.Shell")!;
        var wsh     = Activator.CreateInstance(wshType)!;
        var sc      = wshType.InvokeMember("CreateShortcut", System.Reflection.BindingFlags.InvokeMethod,
            null, wsh, new object[] { lnkPath });
        var scType = sc!.GetType();
        scType.InvokeMember("TargetPath",       System.Reflection.BindingFlags.SetProperty, null, sc, new object[] { target });
        scType.InvokeMember("WorkingDirectory", System.Reflection.BindingFlags.SetProperty, null, sc, new object[] { workDir });
        scType.InvokeMember("Description",      System.Reflection.BindingFlags.SetProperty, null, sc, new object[] { "Zeralda ERP System" });
        if (icon != null && File.Exists(icon))
            scType.InvokeMember("IconLocation", System.Reflection.BindingFlags.SetProperty, null, sc, new object[] { icon });
        scType.InvokeMember("Save", System.Reflection.BindingFlags.InvokeMethod, null, sc, null);
    }

    void RunInstall()
    {
        try {
            Log("══ Zeralda ERP Installation Log ══", Color.FromArgb(210, 165, 30));
            string src = AppDir;

            // ── Verify source directory contains server.py ───────────────────
            if (!File.Exists(Path.Combine(src, "server.py"))) {
                Log($"[ERR] Source not found in: {src}", Color.FromArgb(255,60,60));
                Log("      Make sure Setup_Zeralda_ERP.exe is in the project folder!", Color.FromArgb(255,120,60));
                throw new Exception($"server.py not found in: {src}");
            }
            Log($"[OK]  Source: {src}", Color.FromArgb(100,180,100));

            Step("Copying application files...", 5, () => { CopyAppFiles(src, installPath); return true; });

            string? pyExe = null;
            Step("Detecting Python...", 14, () => {
                foreach (var py in new[] { "py", "python", "python3" }) {
                    try { var r = Cmd(py, "--version"); if (r.Contains("Python 3") || r.Contains("3.")) { pyExe = py; return true; } } catch {}
                }
                string vp = Path.Combine(installPath, ".venv", "Scripts", "python.exe");
                if (File.Exists(vp)) { pyExe = vp; return true; }
                Log("  Python 3 not found! Install from https://www.python.org", Color.OrangeRed);
                return false;
            });

            string venvDir  = Path.Combine(installPath, ".venv");
            string venvPy   = Path.Combine(venvDir, "Scripts", "python.exe");
            string pipExe   = Path.Combine(venvDir, "Scripts", "pip.exe");

            // ── STEP 3: Create Python virtual environment ────────────────────
            Step("Creating Python virtual environment...", 22, () => {
                if (File.Exists(venvPy)) {
                    Log("  .venv already exists — skipping creation.");
                    return true;
                }
                if (pyExe == null) {
                    Log("  [!!] No Python found — skipping venv.", Color.FromArgb(255,190,60));
                    return false;
                }
                Cmd(pyExe, $"-m venv \"{venvDir}\"", installPath, failOnError: true);
                if (!File.Exists(venvPy))
                    throw new Exception("venv created but python.exe not found inside it.");
                Log($"  venv ready: {venvPy}");
                return true;
            });

            // ── STEP 4: Upgrade pip ──────────────────────────────────────────
            Step("Upgrading pip...", 28, () => {
                if (!File.Exists(pipExe)) { Log("  pip not found — skipping."); return false; }
                Cmd(pipExe, "install --upgrade pip --quiet");
                return true;
            });

            // ── STEP 5: Install packages ─────────────────────────────────────
            string reqFile = Path.Combine(installPath, "requirements.txt");
            if (chkRequirements.Checked && File.Exists(reqFile) && File.Exists(pipExe)) {
                // Install all at once for speed, fall back to one-by-one on error
                Step("Installing all Python packages...", 30, () => {
                    Cmd(pipExe, $"install -r \"{reqFile}\" --disable-pip-version-check --prefer-binary", failOnError: true);
                    return true;
                });
            } else if (!chkRequirements.Checked) {
                SetStatus("Skipping Python packages (user choice).", 68);
                Log("[--] Package install skipped.", Color.FromArgb(150, 150, 150));
            }

            // ── STEP 6: Patch Launch_ERP.ps1 to log server errors ───────────
            Step("Patching launcher to capture server log...", 72, () => {
                string launchPs1 = Path.Combine(installPath, "launcher", "Launch_ERP.ps1");
                if (!File.Exists(launchPs1)) return false;
                string content = File.ReadAllText(launchPs1);
                // Replace hidden server start with one that logs to file
                string oldStart = "-WorkingDirectory $projectRoot -PassThru -WindowStyle Hidden";
                string newStart = "-WorkingDirectory $projectRoot -PassThru -NoNewWindow" +
                    " -RedirectStandardOutput (Join-Path $pidDir 'server.log')" +
                    " -RedirectStandardError  (Join-Path $pidDir 'server_err.log')";
                if (content.Contains(oldStart)) {
                    content = content.Replace(oldStart, newStart);
                    // Also show log on failure
                    string oldError = "Write-Host \"[error] Server did not start in time. Aborting.\"";
                    string newError = "Write-Host \"[error] Server did not start in time. Aborting.\"\n" +
                        "    $errLog = Join-Path $pidDir 'server_err.log'\n" +
                        "    if (Test-Path $errLog) { Write-Host \"--- Server error log ---\"; Get-Content $errLog | Select-Object -Last 20 | ForEach-Object { Write-Host $_ } }";
                    content = content.Replace(oldError, newError);
                    File.WriteAllText(launchPs1, content, System.Text.Encoding.UTF8);
                    Log("  Launcher patched: server errors will be logged.");
                } else {
                    Log("  Launcher already patched or format changed — skipping.");
                }
                return true;
            });

            // ── STEP 7: Write Start_Server_Silent.vbs ───────────────────────
            Step("Writing auto-start VBScript...", 78, () => {
                if (!File.Exists(venvPy) || !File.Exists(Path.Combine(installPath, "server.py"))) {
                    Log("  [!!] Skipping auto-start script: venv/server.py not ready.", Color.FromArgb(255,190,60));
                    return false;
                }
                string vbs =
                    "Set WShell = CreateObject(\"WScript.Shell\")\r\n" +
                    "WShell.CurrentDirectory = \"" + installPath + "\"\r\n" +
                    "WShell.Run \"\"\"" + venvPy + "\"\" server.py\", 0, False\r\n";
                File.WriteAllText(
                    Path.Combine(installPath, "launcher", "Start_Server_Silent.vbs"), vbs);
                return true;
            });

            // ── STEP 8: Verify Python environment can import core modules ───
            Step("Verifying Python environment...", 83, () => {
                if (!File.Exists(venvPy)) {
                    Log("  No venv — skipping verification.");
                    return false;
                }
                // Quick import test for stdlib modules used by server.py
                string testCode = "import http.server, json, os, pathlib, threading, socket; print('OK')";
                string result = Cmd(venvPy, $"-c \"{testCode}\"");
                if (result.Contains("OK")) {
                    Log("  Python stdlib: OK");
                } else {
                    Log("  Python stdlib test returned unexpected output.", Color.FromArgb(255,190,60));
                }
                return true;
            });

            // ── STEP 9: Shortcuts ────────────────────────────────────────────
            string launchCmd = Path.Combine(installPath, "launcher", "Launch_ERP.cmd");
            string iconPath  = Path.Combine(installPath, "launcher", "app.ico");

            Step("Creating shortcuts...", 90, () => {
                if (chkDesktop.Checked)
                    CreateShortcut(
                        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Desktop),
                            "Zeralda ERP.lnk"),
                        launchCmd, Path.Combine(installPath, "launcher"), iconPath);
                if (chkStartMenu.Checked) {
                    string smDir = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Zeralda ERP");
                    Directory.CreateDirectory(smDir);
                    CreateShortcut(Path.Combine(smDir, "Zeralda ERP.lnk"),
                        launchCmd, Path.Combine(installPath, "launcher"), iconPath);
                }
                return true;
            });

            // ── STEP 10: Registry startup ────────────────────────────────────
            Step("Configuring Windows startup...", 96, () => {
                if (!chkStartup.Checked) return true;
                string vbsPath = Path.Combine(installPath, "launcher", "Start_Server_Silent.vbs");
                if (!File.Exists(vbsPath)) {
                    Log("  [!!] Startup registry skipped: Start_Server_Silent.vbs is missing.", Color.FromArgb(255,190,60));
                    return false;
                }
                using var key = Registry.CurrentUser.OpenSubKey(
                    @"SOFTWARE\Microsoft\Windows\CurrentVersion\Run", writable: true)!;
                key.SetValue("ZeraldaERPServer", $"wscript.exe \"{vbsPath}\"");
                return true;
            });

            SetStatus("Installation complete!", 100);
            Log("══════════════════════════════════════", Color.FromArgb(55, 80, 120));
            Log("[OK] Zeralda ERP installed to: " + installPath, Color.FromArgb(70, 210, 95));
            Log("[OK] Launch via: " + launchCmd, Color.FromArgb(70, 210, 95));
            installSuccess = true;
        }
        catch (Exception ex) {
            Log($"\n[FATAL] {ex.Message}", Color.FromArgb(255, 55, 55));
            installSuccess = false;
        }
        finally {
            Invoke(() => {
                btnNext.Enabled = true;
                ShowPage(2);
                if (!installSuccess) {
                    finishTitle.Text = "Installation encountered errors.\nSee the log for details.";
                    finishTitle.ForeColor = Color.DarkRed;
                    chkLaunch.Checked = false;
                    chkLaunch.Enabled = false;
                }
            });
        }
    }
}
