# THROWAWAY (design review thread, never merged): click through every page of the open report in Power BI Desktop and
# save a full-size picture of each. Called by desktop.ps1 after the check, while Desktop is still open.
param([string]$Out = ".build/desktop/shots")
$ErrorActionPreference = "Continue"
New-Item -ItemType Directory -Force $Out | Out-Null
Add-Type -AssemblyName System.Windows.Forms, System.Drawing, UIAutomationClient, UIAutomationTypes
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class W {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(int f, int x, int y, int d, int e);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
}
"@
$UIA = [System.Windows.Automation.AutomationElement]
$Scope = [System.Windows.Automation.TreeScope]

function Shot([string]$name) {
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  [System.Drawing.Graphics]::FromImage($bmp).CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
  $file = Join-Path $Out "$name.png"
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Output "$(Get-Date -Format HH:mm:ss) SHOT $file ($($b.Width)x$($b.Height))"
}
function Click([int]$x, [int]$y) {
  [W]::SetCursorPos($x, $y) | Out-Null; Start-Sleep -Milliseconds 150
  [W]::mouse_event(2, 0, 0, 0, 0); [W]::mouse_event(4, 0, 0, 0, 0)
}
function Wheel([int]$x, [int]$y, [int]$notches) {
  [W]::SetCursorPos($x, $y) | Out-Null
  for ($i = 0; $i -lt $notches; $i++) { [W]::mouse_event(0x0800, 0, 0, -120, 0); Start-Sleep -Milliseconds 80 }
}
function Window {
  $p = Get-Process PBIDesktop -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if (-not $p) { return $null }
  [W]::ShowWindow($p.MainWindowHandle, 3) | Out-Null
  [W]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
  return $UIA::FromHandle($p.MainWindowHandle)
}
# The lowest element with this name (the page tabs sit at the bottom of the window).
function Find-Tab($root, [string]$name) {
  $cond = New-Object System.Windows.Automation.PropertyCondition($UIA::NameProperty, $name)
  $all = $root.FindAll($Scope::Descendants, $cond)
  $best = $null
  foreach ($e in $all) {
    $r = $e.Current.BoundingRectangle
    if ($r.IsEmpty -or $r.Height -gt 60 -or $r.Width -lt 10) { continue }
    if (-not $best -or $r.Y -gt $best.Current.BoundingRectangle.Y) { $best = $e }
  }
  return $best
}

$root = Window
if (-not $root) { Write-Output "No Desktop window"; exit 0 }
[System.Windows.Forms.SendKeys]::SendWait("{ESC}"); Start-Sleep 1; [System.Windows.Forms.SendKeys]::SendWait("{ESC}")
Start-Sleep 3
Shot "00-after-check"

# Refresh as Carlos does (Home, Refresh), so the visuals of the window show the data.
$refresh = $null
$cond = New-Object System.Windows.Automation.PropertyCondition($UIA::NameProperty, "Refresh")
foreach ($e in $root.FindAll($Scope::Descendants, $cond)) {
  $r = $e.Current.BoundingRectangle
  if (-not $r.IsEmpty -and $r.Y -lt 200) { $refresh = $e; break }
}
if ($refresh) {
  $r = $refresh.Current.BoundingRectangle
  Write-Output "Refresh button at $($r.X),$($r.Y)"
  Click ([int]($r.X + $r.Width / 2)) ([int]($r.Y + $r.Height / 2))
  Start-Sleep 20; Shot "01-refreshing"
  $deadline = (Get-Date).AddMinutes(6)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep 10
    $busy = Get-Process PBIDesktop -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq "Refresh" }
    $dlg = $root.FindFirst($Scope::Descendants, (New-Object System.Windows.Automation.PropertyCondition($UIA::NameProperty, "Cancel")))
    if (-not $dlg -and -not $busy) { break }
  }
  Start-Sleep 10
} else { Write-Output "No Refresh button found" }
$root = Window
Shot "02-after-refresh"

$pages = @("My day", "All cards", "Card", "Case", "Person", "My work", "Messages", "Mapping backlog", "Contract changes", "Activity", "History", "Audit", "Reports", "Self-check")
$tall = @{ "Card" = 1; "Case" = 2; "Person" = 2; "Audit" = 5; "Self-check" = 1 }
$n = 10
foreach ($page in $pages) {
  $root = Window
  $tab = Find-Tab $root $page
  $slug = ($page.ToLower() -replace "[^a-z]+", "-")
  if (-not $tab) { Write-Output "No tab for $page"; continue }
  $r = $tab.Current.BoundingRectangle
  Click ([int]($r.X + $r.Width / 2)) ([int]($r.Y + $r.Height / 2))
  Start-Sleep 12
  Shot "$n-$slug"
  if ($tall.ContainsKey($page)) {
    $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    for ($k = 1; $k -le $tall[$page]; $k++) {
      Wheel ([int]($b.Width * 0.4)) ([int]($b.Height * 0.55)) 8
      Start-Sleep 5
      Shot "$n-$slug-$k"
    }
  }
  $n++
}
# The Cards page: open the drill through of one row (right click the first card line), as a user does.
$root = Window
$tab = Find-Tab $root "All cards"
if ($tab) {
  $r = $tab.Current.BoundingRectangle
  Click ([int]($r.X + $r.Width / 2)) ([int]($r.Y + $r.Height / 2)); Start-Sleep 8
  $desc = $root.FindFirst($Scope::Descendants, (New-Object System.Windows.Automation.PropertyCondition($UIA::NameProperty, "Description")))
  if ($desc) {
    $d = $desc.Current.BoundingRectangle
    [W]::SetCursorPos([int]($d.X + 10), [int]($d.Y + $d.Height / 2)) | Out-Null
    [W]::mouse_event(8, 0, 0, 0, 0); [W]::mouse_event(16, 0, 0, 0, 0); Start-Sleep 3
    Shot "90-right-click"
    $drill = Find-Tab $root "Drill through"
    if ($drill) {
      $q = $drill.Current.BoundingRectangle; Click ([int]($q.X + $q.Width / 2)) ([int]($q.Y + $q.Height / 2)); Start-Sleep 3
      Shot "91-drill-menu"
      $cardItem = $root.FindAll($Scope::Descendants, (New-Object System.Windows.Automation.PropertyCondition($UIA::NameProperty, "Card")))
      foreach ($c in $cardItem) { $cr = $c.Current.BoundingRectangle; if ($cr.X -gt $q.X) { Click ([int]($cr.X + $cr.Width / 2)) ([int]($cr.Y + $cr.Height / 2)); break } }
      Start-Sleep 12; Shot "92-card-drilled"
      $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
      Wheel ([int]($b.Width * 0.4)) ([int]($b.Height * 0.55)) 8; Start-Sleep 5; Shot "92-card-drilled-1"
    }
  } else { Write-Output "No Description line found" }
}
