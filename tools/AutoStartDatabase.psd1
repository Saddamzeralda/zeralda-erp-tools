@{
    RootModule = "AutoStartDatabase.psm1"
    ModuleVersion = "1.0"
    Author = "Zeralda ERP"
    Description = "Auto-start PostgreSQL database on system startup"
    PowerShellVersion = "5.1"
    FunctionsToExport = @("Start-ZeraldaDatabase", "Stop-ZeraldaDatabase")
}
