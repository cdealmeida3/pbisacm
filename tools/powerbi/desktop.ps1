# The Desktop check (build B8, D309), on GitHub's Windows runner: install Power BI Desktop, open the project, wait for its
# engine, then run every visual (tools/powerbi/desktop-check/) and judge what Desktop would show (tools/powerbi/desktop.ts).
# The job "powerbi-desktop" runs it. Invented samples only (Sample mode); nothing is written to the repository.
#   ./tools/powerbi/desktop.ps1 [-Out .build/desktop]
param([string]$Out = ".build/desktop")
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $Out | Out-Null
$Out = (Resolve-Path $Out).Path

# A picture of the screen, small, written to the log as base64 (the log is the one thing a reviewer can always read).
function Show-Screen([string]$Why) {
  try {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $full = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
    [System.Drawing.Graphics]::FromImage($full).CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    $small = New-Object System.Drawing.Bitmap $full, ([int]($bounds.Width / 2)), ([int]($bounds.Height / 2))
    $file = Join-Path $Out "screen-$([DateTime]::UtcNow.ToString('HHmmss')).png"
    $small.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output "SCREEN ($Why): $file"
    Write-Output ("SCREEN-BASE64 " + [Convert]::ToBase64String([IO.File]::ReadAllBytes($file)))
  } catch { Write-Output "No picture of the screen: $($_.Exception.Message)" }
}

# 1. Power BI Desktop: Microsoft's installer, silent, with its licence accepted (the developer's own check, D309).
$desktop = "C:\Program Files\Microsoft Power BI Desktop\bin\PBIDesktop.exe"
if (-not (Test-Path $desktop)) {
  $setup = Join-Path $env:RUNNER_TEMP "PBIDesktopSetup_x64.exe"
  $ProgressPreference = "SilentlyContinue"
  Write-Output "$(Get-Date -Format HH:mm:ss) Downloading the installer"
  Invoke-WebRequest -Uri "https://download.microsoft.com/download/8/8/0/880BCA75-79DD-466A-927D-1ABF1F5454B0/PBIDesktopSetup_x64.exe" -OutFile $setup
  Write-Output "$(Get-Date -Format HH:mm:ss) Installer: $([math]::Round((Get-Item $setup).Length / 1MB)) MB, $((Get-Item $setup).VersionInfo.ProductVersion)"
  $log = Join-Path $Out "install.log"
  $install = Start-Process -FilePath $setup -ArgumentList "-q", "-norestart", "ACCEPT_EULA=1", "-log", "`"$log`"" -PassThru
  if (-not $install.WaitForExit(15 * 60 * 1000)) {
    Show-Screen "the installer still runs after 15 minutes"
    if (Test-Path $log) { Get-Content $log -Tail 40 }
    throw "The installer of Power BI Desktop did not end in 15 minutes"
  }
  Write-Output "$(Get-Date -Format HH:mm:ss) Installer: exit $($install.ExitCode)"
  if ($install.ExitCode -ne 0 -and (Test-Path $log)) { Get-Content $log -Tail 40 }
}
if (-not (Test-Path $desktop)) { throw "Power BI Desktop is not installed" }
Write-Output "Power BI Desktop $((Get-Item $desktop).VersionInfo.ProductVersion)"

# 2. Open the project, as a double click on the .pbip does; wait for the port of its engine.
$project = (Resolve-Path "powerbi/SACM-Workbench.pbip").Path
Write-Output "$(Get-Date -Format HH:mm:ss) Opening $project"
Start-Process -FilePath $desktop -ArgumentList "`"$project`""
$workspaces = Join-Path $env:LOCALAPPDATA "Microsoft\Power BI Desktop\AnalysisServicesWorkspaces"
$port = $null
$deadline = (Get-Date).AddMinutes(8)
$shown = $false
while ((Get-Date) -lt $deadline -and -not $port) {
  Start-Sleep -Seconds 10
  if (-not $shown -and (Get-Date) -gt $deadline.AddMinutes(-5)) { Show-Screen "no engine after 3 minutes"; $shown = $true }
  $file = Get-ChildItem $workspaces -Recurse -Filter msmdsrv.port.txt -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($file) { $port = (Get-Content $file.FullName -Encoding Unicode -Raw).Trim() }
}
if (-not $port) {
  Show-Screen "no engine after 8 minutes"
  '{"opened": false, "openError": "Desktop started no engine in 8 minutes (see the picture of the screen in the log)", "modelErrors": [], "results": []}' | Out-File -Encoding utf8NoBOM (Join-Path $Out "results.json")
  exit 0
}
Write-Output "Engine of Desktop on port $port"

# 3. Refresh, every visual, the results (the judge runs in the next step).
dotnet run --project tools/powerbi/desktop-check -c Release -- $port . $Out
$code = $LASTEXITCODE
Show-Screen "after the check"
# The errors Desktop wrote to its own traces (Power Query gives its reasons there).
$traces = Join-Path $env:LOCALAPPDATA "Microsoft\Power BI Desktop\Traces"
Get-ChildItem $traces -Recurse -Filter *.log -ErrorAction SilentlyContinue |
  Select-String -Pattern "Exception|Error" -ErrorAction SilentlyContinue | Select-Object -Last 60 |
  ForEach-Object { "TRACE " + $_.Line.Substring(0, [Math]::Min(500, $_.Line.Length)) }
Get-Process PBIDesktop -ErrorAction SilentlyContinue | Stop-Process -Force
exit $code
