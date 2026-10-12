using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("Zeralda ERP Setup")]
[assembly: AssemblyProduct("Zeralda ERP")]
[assembly: AssemblyVersion("1.0.0.0")]

namespace ZeraldaSetup
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupForm());
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Main Setup Form
    // ══════════════════════════════════════════════════════════════════════════
    public class SetupForm : Form
    {
        // Layout panels
        private Panel   leftPanel;
        private Panel   rightPanel;
        private Panel   bottomBar;

        // Left branding
        private Label   brandTitle;
        private Label   brandSub;
        private Label   versionLabel;

        // Pages
        private Panel   pageWelcome;
        private Panel   pageInstall;
        private Panel   pageFinish;

        // Welcome page controls
        private Label   welcomeTitle;
        private Label   welcomeInfo;
        private CheckBox chkDesktop;
        private CheckBox chkStartup;
        private CheckBox chkStartMenu;
        private Label   lblInstallTo;
        private TextBox txtInstallPath;
        private Button  btnBrowse;

        // Install page controls
        private Label      lblStatus;
        private ProgressBar progBar;
        private RichTextBox rtbLog;

        // Finish page controls
        private Label   finishTitle;
        private Label   finishInfo;
        private CheckBox chkLaunch;

        // Bottom buttons
        private Button  btnBack;
        private Button  btnNext;
        private Button  btnCancel;

        private int     currentPage = 0;   // 0=welcome 1=install 2=finish
        private string  installPath = "";
        private bool    installSuccess = false;

        private static readonly Color C_DARK  = Color.FromArgb(18, 42, 76);
        private static readonly Color C_BLUE  = Color.FromArgb(30, 90, 160);
        private static readonly Color C_GOLD  = Color.FromArgb(200, 160, 40);
        private static readonly Color C_WHITE = Color.White;
        private static readonly Color C_LIGHT = Color.FromArgb(240, 243, 248);

        public SetupForm()
        {
            installPath = @"C:\ZeraldaERP";

            BuildUI();
            ShowPage(0);
        }

        // ── UI Construction ───────────────────────────────────────────────────
        void BuildUI()
        {
            this.Text            = "Zeralda ERP — Setup Wizard";
            this.Size            = new Size(820, 560);
            this.MinimumSize     = this.Size;
            this.MaximumSize     = this.Size;
            this.StartPosition   = FormStartPosition.CenterScreen;
            this.BackColor       = C_WHITE;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox     = false;

            try {
                string iconPath = Path.Combine(AppDir(), "launcher", "app.ico");
                if (File.Exists(iconPath)) this.Icon = new Icon(iconPath);
            } catch {}

            // ── Left panel (branding) ────────────────────────────────────────
            leftPanel = new Panel {
                Dock = DockStyle.Left, Width = 220,
                BackColor = C_DARK
            };
            leftPanel.Paint += (s, e) => {
                var g = e.Graphics;
                using (var br = new LinearGradientBrush(leftPanel.ClientRectangle,
                    C_DARK, Color.FromArgb(10, 25, 55), 90f))
                    g.FillRectangle(br, leftPanel.ClientRectangle);
                using (var pen = new Pen(C_BLUE, 3))
                    g.DrawLine(pen, leftPanel.Width - 2, 0, leftPanel.Width - 2, leftPanel.Height);
            };
            this.Controls.Add(leftPanel);

            brandTitle = new Label {
                Text = "Zeralda\nERP",
                Font = new Font("Segoe UI", 26, FontStyle.Bold),
                ForeColor = C_WHITE,
                Location = new Point(20, 60), Size = new Size(180, 90),
                TextAlign = ContentAlignment.MiddleCenter
            };
            leftPanel.Controls.Add(brandTitle);

            var divider = new Panel {
                BackColor = C_GOLD, Location = new Point(20, 155), Size = new Size(180, 3)
            };
            leftPanel.Controls.Add(divider);

            brandSub = new Label {
                Text = "Enterprise Resource\nPlanning System",
                Font = new Font("Segoe UI", 9),
                ForeColor = Color.FromArgb(180, 200, 230),
                Location = new Point(20, 165), Size = new Size(180, 50),
                TextAlign = ContentAlignment.MiddleCenter
            };
            leftPanel.Controls.Add(brandSub);

            versionLabel = new Label {
                Text = "Version 1.0.0",
                Font = new Font("Segoe UI", 8),
                ForeColor = Color.FromArgb(120, 150, 190),
                Location = new Point(20, 460), Size = new Size(180, 24),
                TextAlign = ContentAlignment.MiddleCenter
            };
            leftPanel.Controls.Add(versionLabel);

            // ── Right panel (pages) ──────────────────────────────────────────
            rightPanel = new Panel {
                Location = new Point(220, 0),
                Size = new Size(600, 490),
                BackColor = C_WHITE
            };
            this.Controls.Add(rightPanel);

            // ── Bottom bar ───────────────────────────────────────────────────
            bottomBar = new Panel {
                Dock = DockStyle.Bottom, Height = 60,
                BackColor = C_LIGHT
            };
            bottomBar.Paint += (s, e) => {
                e.Graphics.DrawLine(new Pen(Color.FromArgb(200, 210, 225)),
                    0, 0, bottomBar.Width, 0);
            };
            this.Controls.Add(bottomBar);

            btnCancel = MakeButton("Cancel",   new Point(510, 15), 80, DialogResult.Cancel);
            btnNext   = MakeButton("Install »", new Point(415, 15), 90, DialogResult.None);
            btnBack   = MakeButton("« Back",   new Point(325, 15), 85, DialogResult.None);
            btnBack.Enabled = false;
            btnCancel.BackColor = Color.FromArgb(220, 50, 50);
            btnCancel.ForeColor = C_WHITE;
            btnNext.BackColor   = C_BLUE;
            btnNext.ForeColor   = C_WHITE;
            btnNext.Font        = new Font("Segoe UI", 10, FontStyle.Bold);
            bottomBar.Controls.AddRange(new Control[] { btnBack, btnNext, btnCancel });

            btnNext.Click   += BtnNext_Click;
            btnBack.Click   += BtnBack_Click;
            btnCancel.Click += BtnCancel_Click;

            BuildPageWelcome();
            BuildPageInstall();
            BuildPageFinish();
        }

        Button MakeButton(string text, Point loc, int w, DialogResult dr)
        {
            var b = new Button {
                Text = text, Location = loc, Size = new Size(w, 32),
                FlatStyle = FlatStyle.Flat, Font = new Font("Segoe UI", 9),
                BackColor = Color.FromArgb(230, 235, 245), ForeColor = C_DARK,
                DialogResult = dr
            };
            b.FlatAppearance.BorderColor = Color.FromArgb(180, 195, 220);
            return b;
        }

        // ── Welcome page ─────────────────────────────────────────────────────
        void BuildPageWelcome()
        {
            pageWelcome = new Panel { Dock = DockStyle.Fill, BackColor = C_WHITE, Visible = false };
            rightPanel.Controls.Add(pageWelcome);

            var hdr = new Panel { Dock = DockStyle.Top, Height = 80, BackColor = C_LIGHT };
            hdr.Paint += (s, e) => e.Graphics.DrawLine(new Pen(Color.FromArgb(200,210,225)), 0, 79, 600, 79);
            pageWelcome.Controls.Add(hdr);

            welcomeTitle = new Label {
                Text = "Welcome to Zeralda ERP Setup",
                Font = new Font("Segoe UI", 16, FontStyle.Bold),
                ForeColor = C_DARK, Location = new Point(24, 16),
                Size = new Size(540, 36), BackColor = C_LIGHT
            };
            hdr.Controls.Add(welcomeTitle);

            var subLbl = new Label {
                Text = "This wizard will install Zeralda ERP on your computer.",
                Font = new Font("Segoe UI", 9), ForeColor = Color.Gray,
                Location = new Point(26, 52), Size = new Size(540, 20), BackColor = C_LIGHT
            };
            hdr.Controls.Add(subLbl);

            welcomeInfo = new Label {
                Text = "The following components will be installed:\r\n\r\n" +
                       "  ✔  Zeralda ERP Application Files\r\n" +
                       "  ✔  Python Virtual Environment (.venv)\r\n" +
                       "  ✔  All Python dependencies (from requirements.txt)\r\n" +
                       "  ✔  Desktop and Start Menu shortcuts\r\n" +
                       "  ✔  Server auto-start on Windows login\r\n",
                Font = new Font("Segoe UI", 9), ForeColor = Color.FromArgb(50,50,70),
                Location = new Point(24, 100), Size = new Size(550, 130)
            };
            pageWelcome.Controls.Add(welcomeInfo);

            lblInstallTo = new Label {
                Text = "Install location:", Font = new Font("Segoe UI", 9, FontStyle.Bold),
                ForeColor = C_DARK, Location = new Point(24, 230), Size = new Size(120, 22)
            };
            pageWelcome.Controls.Add(lblInstallTo);

            txtInstallPath = new TextBox {
                Text = installPath, Font = new Font("Segoe UI", 9),
                Location = new Point(24, 254), Size = new Size(430, 26)
            };
            txtInstallPath.TextChanged += (s, e) => installPath = txtInstallPath.Text;
            pageWelcome.Controls.Add(txtInstallPath);

            btnBrowse = new Button {
                Text = "...", Location = new Point(462, 253), Size = new Size(40, 26),
                FlatStyle = FlatStyle.Flat, Font = new Font("Segoe UI", 9)
            };
            btnBrowse.Click += (s, e) => {
                using (var d = new FolderBrowserDialog()) {
                    d.Description = "Select installation folder";
                    d.SelectedPath = installPath;
                    if (d.ShowDialog() == DialogResult.OK) {
                        installPath = d.SelectedPath;
                        txtInstallPath.Text = installPath;
                    }
                }
            };
            pageWelcome.Controls.Add(btnBrowse);

            var optLabel = new Label {
                Text = "Options:", Font = new Font("Segoe UI", 9, FontStyle.Bold),
                ForeColor = C_DARK, Location = new Point(24, 296), Size = new Size(100, 22)
            };
            pageWelcome.Controls.Add(optLabel);

            chkDesktop = new CheckBox {
                Text = "Create Desktop shortcut", Checked = true,
                Font = new Font("Segoe UI", 9), ForeColor = C_DARK,
                Location = new Point(30, 320), Size = new Size(260, 22)
            };
            chkStartMenu = new CheckBox {
                Text = "Create Start Menu shortcut", Checked = true,
                Font = new Font("Segoe UI", 9), ForeColor = C_DARK,
                Location = new Point(30, 346), Size = new Size(260, 22)
            };
            chkStartup = new CheckBox {
                Text = "Auto-start server on Windows login", Checked = true,
                Font = new Font("Segoe UI", 9), ForeColor = C_DARK,
                Location = new Point(30, 372), Size = new Size(280, 22)
            };
            pageWelcome.Controls.AddRange(new Control[] { chkDesktop, chkStartMenu, chkStartup, optLabel });
        }

        // ── Install page ─────────────────────────────────────────────────────
        void BuildPageInstall()
        {
            pageInstall = new Panel { Dock = DockStyle.Fill, BackColor = C_WHITE, Visible = false };
            rightPanel.Controls.Add(pageInstall);

            var hdr = new Panel { Dock = DockStyle.Top, Height = 80, BackColor = C_LIGHT };
            hdr.Paint += (s, e) => e.Graphics.DrawLine(new Pen(Color.FromArgb(200,210,225)), 0, 79, 600, 79);
            pageInstall.Controls.Add(hdr);

            var t = new Label {
                Text = "Installing Zeralda ERP...",
                Font = new Font("Segoe UI", 16, FontStyle.Bold), ForeColor = C_DARK,
                Location = new Point(24, 16), Size = new Size(540, 36), BackColor = C_LIGHT
            };
            hdr.Controls.Add(t);

            lblStatus = new Label {
                Text = "Preparing...", Font = new Font("Segoe UI", 9),
                ForeColor = C_BLUE, Location = new Point(24, 96), Size = new Size(540, 22)
            };
            pageInstall.Controls.Add(lblStatus);

            progBar = new ProgressBar {
                Location = new Point(24, 122), Size = new Size(540, 22),
                Style = ProgressBarStyle.Continuous, Maximum = 100, Value = 0
            };
            pageInstall.Controls.Add(progBar);

            rtbLog = new RichTextBox {
                Location = new Point(24, 156), Size = new Size(540, 300),
                Font = new Font("Consolas", 8), BackColor = Color.FromArgb(20, 25, 35),
                ForeColor = Color.FromArgb(160, 220, 160), ReadOnly = true,
                ScrollBars = RichTextBoxScrollBars.Vertical, BorderStyle = BorderStyle.None
            };
            pageInstall.Controls.Add(rtbLog);
        }

        // ── Finish page ───────────────────────────────────────────────────────
        void BuildPageFinish()
        {
            pageFinish = new Panel { Dock = DockStyle.Fill, BackColor = C_WHITE, Visible = false };
            rightPanel.Controls.Add(pageFinish);

            var hdr = new Panel { Dock = DockStyle.Top, Height = 80, BackColor = C_LIGHT };
            hdr.Paint += (s, e) => e.Graphics.DrawLine(new Pen(Color.FromArgb(200,210,225)), 0, 79, 600, 79);
            pageFinish.Controls.Add(hdr);

            finishTitle = new Label {
                Text = "Installation Complete",
                Font = new Font("Segoe UI", 16, FontStyle.Bold), ForeColor = C_DARK,
                Location = new Point(24, 16), Size = new Size(540, 36), BackColor = C_LIGHT
            };
            hdr.Controls.Add(finishTitle);

            finishInfo = new Label {
                Text = "Zeralda ERP has been installed successfully.\r\n\r\n" +
                       "You can now launch the application from the Desktop shortcut\r\n" +
                       "or from the Start Menu.",
                Font = new Font("Segoe UI", 10), ForeColor = Color.FromArgb(40,60,80),
                Location = new Point(24, 110), Size = new Size(540, 100)
            };
            pageFinish.Controls.Add(finishInfo);

            var checkIcon = new Label {
                Text = "✔", Font = new Font("Segoe UI", 60, FontStyle.Bold),
                ForeColor = Color.FromArgb(40, 180, 80),
                Location = new Point(220, 200), Size = new Size(120, 100),
                TextAlign = ContentAlignment.MiddleCenter
            };
            pageFinish.Controls.Add(checkIcon);

            chkLaunch = new CheckBox {
                Text = "Launch Zeralda ERP now",
                Checked = true, Font = new Font("Segoe UI", 10, FontStyle.Bold),
                ForeColor = C_DARK, Location = new Point(180, 330), Size = new Size(240, 24)
            };
            pageFinish.Controls.Add(chkLaunch);
        }

        // ── Page navigation ───────────────────────────────────────────────────
        void ShowPage(int page)
        {
            currentPage = page;
            pageWelcome.Visible = (page == 0);
            pageInstall.Visible = (page == 1);
            pageFinish.Visible  = (page == 2);

            btnBack.Enabled  = false;
            btnCancel.Visible = (page != 2);

            switch (page) {
                case 0:
                    btnNext.Text = "Install »";
                    btnNext.Enabled = true;
                    break;
                case 1:
                    btnNext.Text    = "Installing...";
                    btnNext.Enabled = false;
                    StartInstall();
                    break;
                case 2:
                    btnNext.Text    = "Finish";
                    btnNext.Enabled = true;
                    if (!installSuccess) {
                        finishTitle.Text = "Installation Failed";
                        finishTitle.ForeColor = Color.DarkRed;
                        var c = pageFinish.Controls[2] as Label; // checkmark
                        if (c != null) { c.Text = "✘"; c.ForeColor = Color.DarkRed; }
                        chkLaunch.Checked = false; chkLaunch.Enabled = false;
                        finishInfo.Text = "Installation encountered errors.\r\nPlease check the log above for details.";
                    }
                    break;
            }
        }

        void BtnNext_Click(object s, EventArgs e)
        {
            if (currentPage == 0) ShowPage(1);
            else if (currentPage == 2) {
                if (chkLaunch.Checked) {
                    string launchCmd = Path.Combine(installPath, "launcher", "Launch_ERP.cmd");
                    if (File.Exists(launchCmd))
                        Process.Start(new ProcessStartInfo(launchCmd) { UseShellExecute = true });
                }
                Application.Exit();
            }
        }

        void BtnBack_Click(object s, EventArgs e) { ShowPage(currentPage - 1); }

        void BtnCancel_Click(object s, EventArgs e)
        {
            if (currentPage == 1) return; // don't cancel during install
            if (MessageBox.Show("Cancel installation?", "Zeralda ERP Setup",
                MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
                Application.Exit();
        }

        // ── Installation logic ────────────────────────────────────────────────
        string AppDir() => Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);

        void AppendLog(string msg, Color? color = null)
        {
            if (rtbLog.InvokeRequired) {
                rtbLog.Invoke(new Action(() => AppendLog(msg, color)));
                return;
            }
            rtbLog.SelectionStart  = rtbLog.TextLength;
            rtbLog.SelectionLength = 0;
            rtbLog.SelectionColor  = color ?? Color.FromArgb(160, 220, 160);
            rtbLog.AppendText(msg + "\n");
            rtbLog.ScrollToCaret();
        }

        void SetStatus(string msg, int progress = -1)
        {
            if (lblStatus.InvokeRequired) {
                lblStatus.Invoke(new Action(() => SetStatus(msg, progress)));
                return;
            }
            lblStatus.Text = msg;
            if (progress >= 0) progBar.Value = Math.Min(progress, 100);
        }

        void StartInstall()
        {
            string src = AppDir();
            new Thread(() => RunInstall(src)) { IsBackground = true }.Start();
        }

        bool RunStep(string label, int progress, Func<bool> action)
        {
            SetStatus(label, progress);
            AppendLog($"[>>] {label}", Color.FromArgb(100, 180, 255));
            try {
                bool ok = action();
                if (ok) AppendLog($"[OK] {label}", Color.FromArgb(80, 210, 100));
                else    AppendLog($"[!!] {label} - skipped (optional)", Color.FromArgb(255, 200, 60));
                return ok;
            } catch (Exception ex) {
                AppendLog($"[XX] {label}: {ex.Message}", Color.FromArgb(255, 90, 90));
                return false;
            }
        }

        bool RunPS(string code)
        {
            var psi = new ProcessStartInfo("powershell.exe",
                $"-NoProfile -ExecutionPolicy Bypass -Command \"{code.Replace("\"","\\\"").Replace("\n"," ")}\"") {
                UseShellExecute = false, RedirectStandardOutput = true,
                RedirectStandardError = true, CreateNoWindow = true,
                WorkingDirectory = installPath
            };
            using (var p = Process.Start(psi)) {
                string o = p.StandardOutput.ReadToEnd();
                string e2 = p.StandardError.ReadToEnd();
                p.WaitForExit();
                if (!string.IsNullOrWhiteSpace(o)) AppendLog(o.Trim());
                if (!string.IsNullOrWhiteSpace(e2)) AppendLog(e2.Trim(), Color.FromArgb(255, 200, 60));
                return p.ExitCode == 0;
            }
        }

        void RunInstall(string src)
        {
            try {
                AppendLog("Zeralda ERP Setup Log", Color.FromArgb(200, 160, 40));
                AppendLog(new string('═', 50), Color.FromArgb(60, 80, 120));

                // STEP 1 — Copy files
                RunStep("Copying application files...", 5, () => {
                    CopyAppFiles(src, installPath);
                    return true;
                });

                // STEP 2 — Python check
                string pyExe = null;
                RunStep("Checking Python installation...", 15, () => {
                    foreach (var py in new[] { "py", "python", "python3" }) {
                        try {
                            var r = RunCmd(py, "--version");
                            if (r.Contains("Python 3")) { pyExe = py; return true; }
                        } catch {}
                    }
                    string venvPy = Path.Combine(installPath, ".venv", "Scripts", "python.exe");
                    if (File.Exists(venvPy)) { pyExe = venvPy; return true; }
                    AppendLog("Python 3 not found! Install from https://www.python.org", Color.OrangeRed);
                    return false;
                });

                // STEP 3 — Virtual environment
                string venvPath = Path.Combine(installPath, ".venv");
                string venvPyPath = Path.Combine(venvPath, "Scripts", "python.exe");
                RunStep("Creating Python virtual environment...", 25, () => {
                    if (File.Exists(venvPyPath)) { AppendLog("      .venv already exists, skipping."); return true; }
                    if (pyExe == null) return false;
                    RunCmd(pyExe, $"-m venv \"{venvPath}\"");
                    return File.Exists(venvPyPath);
                });

                // STEP 4 — Install packages
                string pipExe = Path.Combine(venvPath, "Scripts", "pip.exe");
                RunStep("Upgrading pip...", 30, () => {
                    if (!File.Exists(pipExe)) return false;
                    RunCmd(pipExe, "install --upgrade pip --quiet");
                    return true;
                });

                string reqFile = Path.Combine(installPath, "requirements.txt");
                if (File.Exists(reqFile) && File.Exists(pipExe)) {
                    var pkgs = File.ReadAllLines(reqFile);
                    int pkgIdx = 0;
                    foreach (var pkg in pkgs) {
                        if (string.IsNullOrWhiteSpace(pkg) || pkg.TrimStart().StartsWith("#")) continue;
                        pkgIdx++;
                        string pkgName = pkg.Split(new[]{'>',' ','<','=','!','~'},2)[0];
                        int pct = 30 + (pkgIdx * 40 / Math.Max(pkgs.Length, 1));
                        RunStep($"Installing {pkgName}...", pct, () => {
                            RunCmd(pipExe, $"install {pkg} --quiet");
                            return true;
                        });
                    }
                }

                // STEP 5 — Fix VBScript
                RunStep("Configuring server auto-start...", 75, () => {
                    if (!File.Exists(venvPyPath) || !File.Exists(Path.Combine(installPath, "server.py"))) {
                        AppendLog("Skipping auto-start: venv/server.py not ready.", Color.FromArgb(255, 200, 60));
                        return false;
                    }
                    string vbs = "Set WShell = CreateObject(\"WScript.Shell\")\r\n" +
                                 $"WShell.CurrentDirectory = \"{installPath}\"\r\n" +
                                 $"WShell.Run \"\"\"{venvPyPath}\"\" server.py\", 0, False\r\n";
                    File.WriteAllText(Path.Combine(installPath, "launcher", "Start_Server_Silent.vbs"), vbs);
                    return true;
                });

                // STEP 6 — Shortcuts
                RunStep("Creating shortcuts...", 85, () => {
                    string launchCmd = Path.Combine(installPath, "launcher", "Launch_ERP.cmd");
                    string iconPath2 = Path.Combine(installPath, "launcher", "app.ico");
                    if (chkDesktop.InvokeRequired) {
                        chkDesktop.Invoke(new Action(() => {
                            if (chkDesktop.Checked) CreateShortcut(
                                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Desktop),
                                "Zeralda ERP.lnk"), launchCmd, installPath, iconPath2);
                            if (chkStartMenu.Checked) {
                                string smDir = Path.Combine(
                                    Environment.GetFolderPath(Environment.SpecialFolder.Programs),
                                    "Zeralda ERP");
                                Directory.CreateDirectory(smDir);
                                CreateShortcut(Path.Combine(smDir, "Zeralda ERP.lnk"),
                                    launchCmd, installPath, iconPath2);
                            }
                        }));
                    }
                    return true;
                });

                // STEP 7 — Registry auto-start
                RunStep("Configuring Windows startup...", 92, () => {
                    bool doIt = true;
                    if (chkStartup.InvokeRequired)
                        chkStartup.Invoke(new Action(() => { doIt = chkStartup.Checked; }));
                    if (!doIt) return true;
                    string vbsPath = Path.Combine(installPath, "launcher", "Start_Server_Silent.vbs");
                    if (!File.Exists(vbsPath)) return false;
                    using (var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(
                        @"SOFTWARE\Microsoft\Windows\CurrentVersion\Run", true))
                        key.SetValue("ZeraldaERPServer", $"wscript.exe \"{vbsPath}\"");
                    return true;
                });

                SetStatus("Installation complete!", 100);
                AppendLog(new string('═', 50), Color.FromArgb(60, 80, 120));
                AppendLog("[OK] Zeralda ERP installed successfully!", Color.FromArgb(80, 210, 100));
                installSuccess = true;
            }
            catch (Exception ex) {
                AppendLog($"\n[FATAL] {ex.Message}", Color.FromArgb(255, 60, 60));
                installSuccess = false;
            }
            finally {
                if (btnNext.InvokeRequired)
                    btnNext.Invoke(new Action(() => { btnNext.Enabled = true; ShowPage(2); }));
                else { btnNext.Enabled = true; ShowPage(2); }
            }
        }

        // ── Helpers ────────────────────────────────────────────────────────────
        string RunCmd(string exe, string args)
        {
            var psi = new ProcessStartInfo(exe, args) {
                UseShellExecute = false, RedirectStandardOutput = true,
                RedirectStandardError = true, CreateNoWindow = true,
                WorkingDirectory = installPath
            };
            using (var p = Process.Start(psi)) {
                string o = p.StandardOutput.ReadToEnd();
                p.WaitForExit();
                return o;
            }
        }

        void CopyDirectory(string srcDir, string dstDir)
        {
            Directory.CreateDirectory(dstDir);
            var skipFolders = new[] { ".git", ".venv", "__pycache__", "dist", "node_modules", ".vscode", ".webview2_cache" };
            foreach (var file in Directory.GetFiles(srcDir)) {
                string name = Path.GetFileName(file);
                if (name.StartsWith(".") && name != ".env") continue;
                File.Copy(file, Path.Combine(dstDir, name), true);
            }
            foreach (var dir in Directory.GetDirectories(srcDir)) {
                string name = Path.GetFileName(dir);
                if (Array.Exists(skipFolders, x => x.Equals(name, StringComparison.OrdinalIgnoreCase))) continue;
                CopyDirectory(dir, Path.Combine(dstDir, name));
            }
        }

        void CopyDirFull(string src, string dst)
        {
            Directory.CreateDirectory(dst);
            var skipDirs = new[] { "__pycache__", ".git", "node_modules", ".venv", ".vscode", "dist", "dist_setup", ".webview2_cache" };
            foreach (var f in Directory.GetFiles(src))
                File.Copy(f, Path.Combine(dst, Path.GetFileName(f)), true);
            foreach (var d in Directory.GetDirectories(src)) {
                var n = Path.GetFileName(d);
                if (Array.Exists(skipDirs, x => x.Equals(n, StringComparison.OrdinalIgnoreCase))) continue;
                CopyDirFull(d, Path.Combine(dst, n));
            }
        }

        void CopyAppFiles(string src, string dst)
        {
            Directory.CreateDirectory(dst);
            var rootFiles = new[] {
                "server.py", "requirements.txt", "favicon.ico", "logo.png",
                "index.html", "login.html", "login_secure.html",
                "login_with_key.html", "zeralda_erp_dashboard.html",
                "settings.html", "LICENSE.txt", "reset_admin_password.py"
            };
            foreach (var f in rootFiles) {
                var s = Path.Combine(src, f);
                if (File.Exists(s)) File.Copy(s, Path.Combine(dst, f), true);
            }

            var envSrc = Path.Combine(src, ".env");
            var envDst = Path.Combine(dst, ".env");
            if (File.Exists(envSrc) && !File.Exists(envDst)) File.Copy(envSrc, envDst);

            var fullDirs = new[] { "backend", "database", "modules", "shared", "styles", "cert", "tools" };
            foreach (var d in fullDirs) {
                var s = Path.Combine(src, d);
                if (Directory.Exists(s)) CopyDirFull(s, Path.Combine(dst, d));
            }

            var launcherSrc = Path.Combine(src, "launcher");
            var launcherDst = Path.Combine(dst, "launcher");
            if (Directory.Exists(launcherSrc)) {
                Directory.CreateDirectory(launcherDst);
                foreach (var f in Directory.GetFiles(launcherSrc)) {
                    var n = Path.GetFileName(f);
                    if (n.EndsWith(".pid", StringComparison.OrdinalIgnoreCase)) continue;
                    File.Copy(f, Path.Combine(launcherDst, n), true);
                }
            }

            var dataDst = Path.Combine(dst, "data");
            Directory.CreateDirectory(dataDst);
            Directory.CreateDirectory(Path.Combine(dataDst, "logs"));
            var dataSrc = Path.Combine(src, "data");
            var dataFiles = new[] { "users.json", "keys.json" };
            if (Directory.Exists(dataSrc)) {
                foreach (var f in dataFiles) {
                    var s = Path.Combine(dataSrc, f);
                    var d = Path.Combine(dataDst, f);
                    if (File.Exists(s) && !File.Exists(d)) File.Copy(s, d);
                }
            }

            Directory.CreateDirectory(Path.Combine(dst, "logs"));
            Directory.CreateDirectory(Path.Combine(dst, ".webview2_cache"));
        }

        void CreateShortcut(string lnkPath, string target, string workDir, string iconPath2)
        {
            Type wshType = Type.GetTypeFromProgID("WScript.Shell");
            dynamic wsh  = Activator.CreateInstance(wshType);
            dynamic sc   = wsh.CreateShortcut(lnkPath);
            sc.TargetPath       = target;
            sc.WorkingDirectory = workDir;
            if (File.Exists(iconPath2)) sc.IconLocation = iconPath2;
            sc.Description      = "Zeralda ERP System";
            sc.Save();
        }
    }

    // Helper for gradient brush (System.Drawing)
    class LinearGradientBrush : System.Drawing.Drawing2D.LinearGradientBrush
    {
        public LinearGradientBrush(Rectangle r, Color c1, Color c2, float angle)
            : base(r, c1, c2, angle) {}
    }
}
