# The picture step of the Desktop check (D318, design pass §8.2). Power BI Desktop still has the report open after
# desktop-check/ ran every visual; this script presses Refresh, opens each page in the order of pages.json, waits until the
# page has stopped drawing, takes a picture, and reads the words the page shows (Desktop's canvas is a web page, and
# Windows UI Automation reads its text). It writes pictures.json for the judge (tools/powerbi/desktop.ts):
#   page, picture file, seconds to draw, and the words that mean a visual is broken ("Can't display the visual",
#   "Select or drag fields", "(Blank)", ...). Invented samples only (Sample mode).
#   ./tools/powerbi/pictures.ps1 -Pages .build/desktop/pages.json -Out .build/desktop/pictures
param([Parameter(Mandatory)][string]$Pages, [string]$Out = ".build/desktop/pictures")
$ErrorActionPreference = "Continue"
New-Item -ItemType Directory -Force $Out | Out-Null
Add-Type -AssemblyName System.Windows.Forms, System.Drawing, UIAutomationClient, UIAutomationTypes
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class PictureWin {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(int f, int x, int y, int d, int e);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
}
"@
$UIA = [System.Windows.Automation.AutomationElement]
$Scope = [System.Windows.Automation.TreeScope]
$NameProperty = $UIA::NameProperty
$started = Get-Date
function Say([string]$text) { Write-Output "$(Get-Date -Format HH:mm:ss) $text" }

# The words that mean Desktop draws a visual broken, empty or unfinished. Each is what a colleague would see.
$BROKEN = @(
  "Can't display the visual", "Couldn't load the data for this visual", "Couldn't retrieve the data for this visual",
  "Something's wrong with one or more fields", "Select or drag fields to populate this visual", "See details",
  "This visual has exceeded the available resources", "Too many values", "(Blank)"
)

function Window {
  $process = Get-Process PBIDesktop -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if (-not $process) { return $null }
  [PictureWin]::ShowWindow($process.MainWindowHandle, 3) | Out-Null
  [PictureWin]::SetForegroundWindow($process.MainWindowHandle) | Out-Null
  return $UIA::FromHandle($process.MainWindowHandle)
}
function Click([double]$x, [double]$y, [switch]$Right) {
  [PictureWin]::SetCursorPos([int]$x, [int]$y) | Out-Null
  Start-Sleep -Milliseconds 150
  if ($Right) { [PictureWin]::mouse_event(8, 0, 0, 0, 0); [PictureWin]::mouse_event(16, 0, 0, 0, 0) }
  else { [PictureWin]::mouse_event(2, 0, 0, 0, 0); [PictureWin]::mouse_event(4, 0, 0, 0, 0) }
}
function Center($element) { $r = $element.Current.BoundingRectangle; return @(($r.X + $r.Width / 2), ($r.Y + $r.Height / 2)) }
function Screen-Bitmap {
  $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
  [System.Drawing.Graphics]::FromImage($bitmap).CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
  return $bitmap
}
# A small fingerprint of the screen: two equal fingerprints half a second apart mean the page stopped drawing.
function Fingerprint {
  $bitmap = Screen-Bitmap
  $small = New-Object System.Drawing.Bitmap $bitmap, 96, 54
  $stream = New-Object System.IO.MemoryStream
  $small.Save($stream, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $hash = [Convert]::ToBase64String([System.Security.Cryptography.SHA1]::Create().ComputeHash($stream.ToArray()))
  $bitmap.Dispose(); $small.Dispose(); $stream.Dispose()
  return $hash
}
function Save-Picture([string]$name) {
  $bitmap = Screen-Bitmap
  $file = Join-Path $Out "$name.png"
  $bitmap.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
  return $file
}
# The page tab of a page: the element with its name lowest in the window (the tabs sit at the bottom). A hidden page's tab
# carries the same name with an icon; Desktop may add words, so a name that starts with the page name counts too.
function Find-Tab($root, [string]$name) {
  $window = $root.Current.BoundingRectangle
  $best = $null
  foreach ($element in $root.FindAll($Scope::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) {
    $text = $element.Current.Name
    if (-not $text -or ($text -ne $name -and -not $text.StartsWith("$name,") -and -not $text.StartsWith("$name "))) { continue }
    $r = $element.Current.BoundingRectangle
    if ($r.IsEmpty -or $r.Height -gt 60 -or $r.Width -lt 10 -or $r.Y -lt ($window.Y + $window.Height - 140)) { continue }
    if (-not $best -or $r.Y -gt $best.Current.BoundingRectangle.Y) { $best = $element }
  }
  return $best
}
# Every name the window shows, once (the text of the canvas, the buttons, the tabs).
function Words($root) {
  $seen = New-Object System.Collections.Generic.HashSet[string]
  foreach ($element in $root.FindAll($Scope::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) {
    $text = $element.Current.Name
    if ($text) { [void]$seen.Add($text.Trim()) }
  }
  return $seen
}
# Close what Desktop shows over the canvas on a first start ("Optimize your report for mobile", tips).
function Close-Popups($root) {
  [System.Windows.Forms.SendKeys]::SendWait("{ESC}")
  Start-Sleep -Milliseconds 500
  foreach ($label in @("Close", "Dismiss", "Got it", "Not now")) {
    $condition = New-Object System.Windows.Automation.PropertyCondition($NameProperty, $label)
    foreach ($element in $root.FindAll($Scope::Descendants, $condition)) {
      $r = $element.Current.BoundingRectangle
      $window = $root.Current.BoundingRectangle
      # Not the close button of the window itself (top right corner).
      if ($r.IsEmpty -or ($r.Y -lt $window.Y + 40 -and $r.X -gt $window.X + $window.Width - 200)) { continue }
      $at = Center $element
      Click $at[0] $at[1]
      Say "Closed '$label' at $([int]$at[0]),$([int]$at[1])"
      Start-Sleep -Milliseconds 500
    }
  }
}

$list = Get-Content $Pages -Raw | ConvertFrom-Json
$root = Window
if (-not $root) { Say "No window of Power BI Desktop"; '{"taken": false, "why": "no window of Power BI Desktop", "pages": []}' | Out-File -Encoding utf8NoBOM (Join-Path $Out "pictures.json"); exit 0 }

# 1. The report is open when the tab of its first page exists (Desktop shows "Loading queries" for minutes first).
$first = $list[0].displayName
$deadline = (Get-Date).AddMinutes(15)
while ((Get-Date) -lt $deadline) {
  $root = Window
  if ($root -and (Find-Tab $root $first)) { Say "The report is open"; break }
  Start-Sleep 15
}
if (-not (Find-Tab $root $first)) {
  $file = Save-Picture "00-not-open"
  '{"taken": false, "why": "the tab of the first page did not appear in 15 minutes", "pages": []}' | Out-File -Encoding utf8NoBOM (Join-Path $Out "pictures.json")
  Say "The report did not open: $file"; exit 0
}
Close-Popups $root

# 2. Refresh, as a colleague does (Home, Refresh), so every visual draws the data of the samples.
$condition = New-Object System.Windows.Automation.PropertyCondition($NameProperty, "Refresh")
$refresh = $null
foreach ($element in $root.FindAll($Scope::Descendants, $condition)) {
  $r = $element.Current.BoundingRectangle
  if (-not $r.IsEmpty -and $r.Y -lt ($root.Current.BoundingRectangle.Y + 220) -and $element.Current.IsEnabled) { $refresh = $element; break }
}
if ($refresh) {
  $at = Center $refresh
  Click $at[0] $at[1]
  Say "Refresh pressed"
  Start-Sleep 15
  $deadline = (Get-Date).AddMinutes(8)
  $cancel = New-Object System.Windows.Automation.PropertyCondition($NameProperty, "Cancel")
  while ((Get-Date) -lt $deadline) {
    Start-Sleep 5
    $root = Window
    if (-not $root.FindFirst($Scope::Descendants, $cancel)) { break }
  }
  Say "Refresh ended"
  Start-Sleep 5
} else { Say "No Refresh button found: the pictures show the data Desktop loaded when it opened" }
$root = Window
Close-Popups $root

# 3. Each page: its tab, then pictures until two fingerprints in a row are equal, then the words it shows.
$results = @()
$n = 1
foreach ($page in $list) {
  $root = Window
  $tab = Find-Tab $root $page.displayName
  $slug = "{0:D2}-{1}" -f $n, $page.name
  $n++
  if (-not $tab) {
    Say "No tab for $($page.displayName)"
    $results += [ordered]@{ page = $page.name; displayName = $page.displayName; found = $false; seconds = $null; file = $null; broken = @() }
    continue
  }
  $at = Center $tab
  $clock = [System.Diagnostics.Stopwatch]::StartNew()
  Click $at[0] $at[1]
  Start-Sleep -Milliseconds 300
  $before = Fingerprint
  $stable = 0
  while ($clock.Elapsed.TotalSeconds -lt 60) {
    Start-Sleep -Milliseconds 500
    $now = Fingerprint
    if ($now -eq $before) { $stable++ } else { $stable = 0 }
    $before = $now
    if ($stable -ge 2) { break }
  }
  # The page drew when the screen stopped changing: the last change was a second (two equal steps) before.
  $seconds = [math]::Round([math]::Max(0, $clock.Elapsed.TotalSeconds - 1.0), 1)
  $file = Save-Picture $slug
  $words = Words (Window)
  $broken = @($BROKEN | Where-Object { $words.Contains($_) })
  Say "$($page.displayName): drawn in $seconds s, $file$(if ($broken.Count) { ', shows: ' + ($broken -join '; ') })"
  $results += [ordered]@{ page = $page.name; displayName = $page.displayName; found = $true; seconds = $seconds; file = (Split-Path $file -Leaf); broken = $broken }
}
[ordered]@{ taken = $true; minutes = [math]::Round(((Get-Date) - $started).TotalMinutes, 1); pages = $results } | ConvertTo-Json -Depth 5 |
  Out-File -Encoding utf8NoBOM (Join-Path $Out "pictures.json")
Say "$($results.Count) pages, pictures in $Out"
