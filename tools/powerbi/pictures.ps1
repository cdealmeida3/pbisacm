# The picture step of the Desktop check (D318, design pass §8.2). Power BI Desktop still has the report open after
# desktop-check/ ran every visual; this script presses Refresh, opens each page in the order of pages.json, waits until the
# page has stopped drawing, takes a picture, and reads the words the page shows (Desktop's canvas is a web page, and
# Windows UI Automation reads its text). It writes pictures.json for the judge (tools/powerbi/desktop.ts):
#   page, picture file, seconds to draw, and the words that mean a visual is broken ("Can't display the visual",
#   "Select or drag fields", "(Blank)", ...). A page with tabs (D323) gets one more picture per tab after its first: the
#   tab is pressed with Ctrl (Desktop edits the report, and Ctrl+click is how a button acts there). Invented samples only.
#   Since build D6 (D328) each picture also gives the page alone (<name>-page.png, cut where the navy rail shows the page
#   is) and its look: where the page is on the screen and every text of the page with its box, the colour behind it, the
#   text colour and their contrast, measured on the picture. The judge applies LOOK rules 8 and 2 to them.
#   ./tools/powerbi/pictures.ps1 -Pages .build/desktop/pages.json -Out .build/desktop/pictures
param([Parameter(Mandatory)][string]$Pages, [string]$Out = ".build/desktop/pictures")
$ErrorActionPreference = "Continue"
New-Item -ItemType Directory -Force $Out | Out-Null
Add-Type -AssemblyName System.Windows.Forms, System.Drawing, UIAutomationClient, UIAutomationTypes, WindowsBase
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class PictureWin {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(int f, int x, int y, int d, int e);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, int f, int e);
}
"@
# The look of the canvas (build D6, D328): where the page is on the screen, and the contrast of a text as drawn.
# PowerShell 7 compiles against .NET: Bitmap is in System.Drawing.Common and Color in System.Drawing.Primitives (taken
# from the types loaded above), and a list of references replaces the default one, so the collections and the runtime
# are named too.
$lookReferences = @([System.Drawing.Bitmap].Assembly.Location, [System.Drawing.Color].Assembly.Location, "System.Collections", "System.Runtime")
Add-Type -ReferencedAssemblies $lookReferences -TypeDefinition @"
using System; using System.Collections.Generic; using System.Drawing; using System.Drawing.Imaging;
public static class PictureLook {
  // The navy of the rail (docs/LOOK.md, accent #0c1c49), a little either way for the drawing of the screen.
  static bool Navy(Color c) { return Math.Abs(c.R - 12) <= 6 && Math.Abs(c.G - 28) <= 6 && Math.Abs(c.B - 73) <= 6; }
  // The page on the screen: the rail is a navy band at its left, 188 of its 1280 points wide and as tall as the page.
  // Gives x, y, width, height in screen pixels, or an empty array when no rail is seen.
  public static int[] Canvas(Bitmap b, double pageWidth, double railWidth) {
    for (int y = b.Height / 3; y < b.Height * 2 / 3; y += 7) {
      int run = 0, start = -1;
      for (int x = 0; x < b.Width; x++) {
        if (Navy(b.GetPixel(x, y))) { if (run == 0) start = x; run++; }
        else { if (run >= 120) break; run = 0; }
      }
      if (run < 120) continue;
      int column = start + 3, top = y, bottom = y;
      while (top > 0 && Navy(b.GetPixel(column, top - 1))) top--;
      while (bottom < b.Height - 1 && Navy(b.GetPixel(column, bottom + 1))) bottom++;
      double scale = run / railWidth;
      // The rail is as tall as the page (720 of 1280): a navy run that is not (a label, another band) is not the rail.
      double height = bottom - top + 1, expected = pageWidth * scale * 720.0 / 1280.0;
      if (Math.Abs(height - expected) > expected * 0.05) continue;
      return new int[] { start, top, (int)Math.Round(pageWidth * scale), (int)height };
    }
    return new int[0];
  }
  static double Channel(int v) { double c = v / 255.0; return c <= 0.03928 ? c / 12.92 : Math.Pow((c + 0.055) / 1.055, 2.4); }
  static double Luminance(Color c) { return 0.2126 * Channel(c.R) + 0.7152 * Channel(c.G) + 0.0722 * Channel(c.B); }
  static double Ratio(Color a, Color b) { double x = Luminance(a), y = Luminance(b); return (Math.Max(x, y) + 0.05) / (Math.Min(x, y) + 0.05); }
  static string Hex(Color c) { return "#" + c.R.ToString("x2") + c.G.ToString("x2") + c.B.ToString("x2"); }
  // The contrast of the text in a box: the background is the colour most of the box has. The pixels are taken from the
  // one that stands out most from it; the text colour is the one where three pixels are reached (one or two odd pixels
  // are the edge of an icon or a line). The edges of letters are mixed with the background, so the text colour is its
  // darkest (or lightest) pixels: the measure errs towards passing a text, never towards failing a good one.
  // Gives "background text ratio", or "" for a box with one colour only.
  public static string Contrast(Bitmap b, int x, int y, int w, int h) {
    x = Math.Max(0, x); y = Math.Max(0, y); w = Math.Min(w, b.Width - x); h = Math.Min(h, b.Height - y);
    if (w < 2 || h < 2) return "";
    var counts = new Dictionary<int, int>();
    for (int j = y; j < y + h; j++) for (int i = x; i < x + w; i++) {
      int key = b.GetPixel(i, j).ToArgb(); int n; counts.TryGetValue(key, out n); counts[key] = n + 1;
    }
    int background = 0, most = -1;
    foreach (var pair in counts) if (pair.Value > most) { most = pair.Value; background = pair.Key; }
    Color bg = Color.FromArgb(background);
    var ratios = new List<KeyValuePair<double, int>>();
    foreach (var pair in counts) if (pair.Key != background) ratios.Add(new KeyValuePair<double, int>(Ratio(Color.FromArgb(pair.Key), bg), pair.Key));
    if (ratios.Count == 0) return "";
    ratios.Sort((p, q) => q.Key.CompareTo(p.Key));
    int seen = 0;
    foreach (var pair in ratios) {
      seen += counts[pair.Value];
      if (seen >= 3) return Hex(bg) + " " + Hex(Color.FromArgb(pair.Value)) + " " + pair.Key.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture);
    }
    return "";
  }
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
# The pointer off the page, so a picture never shows a tooltip or the hover of a visual (its header "Filters and
# slicers affecting this visual"): on the status bar of Desktop, at the left of its foot (where "Page 1 of 19" is),
# not on the taskbar of Windows.
function Pointer-Away {
  $process = Get-Process PBIDesktop -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if (-not $process) { return }
  $r = $UIA::FromHandle($process.MainWindowHandle).Current.BoundingRectangle
  [PictureWin]::SetCursorPos([int]($r.X + 300), [int]($r.Y + $r.Height - 10)) | Out-Null
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
# A picture of the screen, and of the page alone (<name>-page.png, cut where the rail shows the page is: the team guide
# and the review use it). Gives the file and what the look check reads on the canvas (Look-Texts). PowerShell names
# do not care about case: the look is $seen, as $look would be the switch -Look itself.
function Save-Picture([string]$name, [switch]$Look, [string[]]$Words = @()) {
  $bitmap = Screen-Bitmap
  $file = Join-Path $Out "$name.png"
  $bitmap.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $seen = $null
  if ($Look) {
    $canvas = [PictureLook]::Canvas($bitmap, 1280, 188)
    if ($canvas.Length -eq 4) {
      $rect = New-Object System.Drawing.Rectangle($canvas[0], $canvas[1], [math]::Min($canvas[2], $bitmap.Width - $canvas[0]), [math]::Min($canvas[3], $bitmap.Height - $canvas[1]))
      $page = $bitmap.Clone($rect, $bitmap.PixelFormat)
      $page.Save((Join-Path $Out "$name-page.png"), [System.Drawing.Imaging.ImageFormat]::Png)
      $page.Dispose()
      $seen = [ordered]@{ canvas = $canvas; texts = @(Look-Texts (Window) $bitmap $canvas $Words) }
    } else { $seen = [ordered]@{ canvas = @(); texts = @() } }
  }
  $bitmap.Dispose()
  return @($file, $seen)
}
# Every text of the canvas as drawn (LOOK rules 2 and 8, build D6, D328): its words, its box in points of the page
# (1280 × 720), and the background, the text colour and their contrast measured on the picture. Only the words the
# page writes itself (pages.json: titles, buttons, headers, tabs, text boxes): Desktop also names the texts of its own
# panes, hidden behind the canvas, and the data of the samples is not sure to be drawn where its box says.
function Look-Texts($root, $bitmap, $canvas, [string[]]$words) {
  $scale = $canvas[2] / 1280.0
  $out = @()
  $seen = New-Object System.Collections.Generic.HashSet[string]
  $wanted = New-Object System.Collections.Generic.HashSet[string]
  foreach ($word in $words) { [void]$wanted.Add($word) }
  foreach ($element in $root.FindAll($Scope::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) {
    $name = $element.Current.Name
    if (-not $name -or -not $wanted.Contains($name.Trim())) { continue }
    $r = $element.Current.BoundingRectangle
    if ($r.IsEmpty -or $element.Current.IsOffscreen) { continue }
    if ($r.X -lt $canvas[0] -or $r.Y -lt $canvas[1] -or ($r.X + $r.Width) -gt ($canvas[0] + $canvas[2]) -or ($r.Y + $r.Height) -gt ($canvas[1] + $canvas[3])) { continue }
    if ($r.Height -lt 6 -or $r.Height -gt (60 * $scale) -or $r.Width -lt 4) { continue }
    $key = "$name|$([int]$r.X)|$([int]$r.Y)"
    if (-not $seen.Add($key)) { continue }
    $measured = [PictureLook]::Contrast($bitmap, [int][math]::Floor($r.X), [int][math]::Floor($r.Y), [int][math]::Ceiling($r.Width), [int][math]::Ceiling($r.Height))
    $parts = if ($measured) { $measured.Split(' ') } else { @($null, $null, $null) }
    $out += [ordered]@{
      text = $name.Trim()
      x = [math]::Round(($r.X - $canvas[0]) / $scale); y = [math]::Round(($r.Y - $canvas[1]) / $scale)
      width = [math]::Round($r.Width / $scale); height = [math]::Round($r.Height / $scale)
      background = $parts[0]; colour = $parts[1]; ratio = if ($parts[2]) { [double]$parts[2] } else { $null }
    }
  }
  return $out
}
# The page tab of a page: the element with its name at the foot of the window (the tabs sit at the bottom), leftmost. A hidden page's tab
# carries the same name with an icon; Desktop may add words, so a name that starts with the page name counts too.
function Find-Tab($root, [string]$name) {
  $window = $root.Current.BoundingRectangle
  $best = $null
  $bestExact = $false
  foreach ($element in $root.FindAll($Scope::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) {
    $text = $element.Current.Name
    if (-not $text -or ($text -ne $name -and -not $text.StartsWith("$name,") -and -not $text.StartsWith("$name "))) { continue }
    $r = $element.Current.BoundingRectangle
    if ($r.IsEmpty -or $r.Height -gt 60 -or $r.Width -lt 10 -or $r.Y -lt ($window.Y + $window.Height - 140)) { continue }
    # The tab's own name first: a text of the page that starts with the same words ("Not followed up" in a table of
    # Audit export, build R5) must not win over the tab "Not followed".
    # Then the leftmost: the page tabs start at the left, and a button of a pane at the right can carry the same name
    # at the same height (build R6: a button "History" at the foot of the panes took the click of the tab History).
    $exact = $text -eq $name
    if (-not $best -or ($exact -and -not $bestExact) -or ($exact -eq $bestExact -and $r.X -lt $best.Current.BoundingRectangle.X)) { $best = $element; $bestExact = $exact }
  }
  return $best
}
# Open a tab: a tab out of sight (the strip scrolls) is scrolled into view first, then clicked in its middle; a tab that
# stays out of sight is selected as UI Automation offers.
function Open-Tab($tab) {
  try {
    if ($tab.Current.IsOffscreen) { $tab.GetCurrentPattern([System.Windows.Automation.ScrollItemPattern]::Pattern).ScrollIntoView() }
  } catch { }
  # The tab strip slides when it scrolls: wait until the tab stays at one place, so the click does not land on the
  # tab beside it or on "New page" (a click there adds a page to the report).
  $last = $null
  for ($i = 0; $i -lt 10; $i++) {
    Start-Sleep -Milliseconds 200
    $r = $tab.Current.BoundingRectangle
    if ($last -and $r.X -eq $last.X -and $r.Y -eq $last.Y) { break }
    $last = $r
  }
  if (-not $tab.Current.IsOffscreen) {
    $at = Center $tab
    $under = $null
    try { $under = [System.Windows.Automation.AutomationElement]::FromPoint((New-Object System.Windows.Point($at[0], $at[1]))) } catch { }
    if ($under -and $under.Current.Name -eq $tab.Current.Name) { Click $at[0] $at[1]; return }
  }
  try { $tab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select(); return } catch { }
  try { $tab.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); return } catch { }
}
# A button of the canvas by its words (a tab of a bookmark navigator): above the tab strip, the size of a button.
function Find-Button($root, [string]$name) {
  $window = $root.Current.BoundingRectangle
  $condition = New-Object System.Windows.Automation.PropertyCondition($NameProperty, $name)
  foreach ($element in $root.FindAll($Scope::Descendants, $condition)) {
    $r = $element.Current.BoundingRectangle
    if ($r.IsEmpty -or $r.Height -gt 60 -or $r.Width -lt 10 -or $r.Y -gt ($window.Y + $window.Height - 140)) { continue }
    return $element
  }
  return $null
}
# Waits until two fingerprints of the screen in a row are equal (at most 60 s on the clock given), and gives the seconds
# the page took to draw: the last change was a second (two equal steps) before.
function Wait-Drawn($clock) {
  $before = Fingerprint
  $stable = 0
  while ($clock.Elapsed.TotalSeconds -lt 60) {
    Start-Sleep -Milliseconds 500
    $now = Fingerprint
    if ($now -eq $before) { $stable++ } else { $stable = 0 }
    $before = $now
    if ($stable -ge 2) { break }
  }
  return [math]::Round([math]::Max(0, $clock.Elapsed.TotalSeconds - 1.0), 1)
}
# The words of a broken visual the window shows. A word is often part of a longer name ("Replies to read (Blank)"), so
# each name is searched.
function Broken-Words($words) {
  return @($BROKEN | Where-Object { $word = $_; @($words | Where-Object { $_.Contains($word) }).Count -gt 0 })
}
# The names at the foot of the window (the tab strip), for the log when a tab is not found.
function Tab-Names($root) {
  $window = $root.Current.BoundingRectangle
  $names = @()
  foreach ($element in $root.FindAll($Scope::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) {
    $r = $element.Current.BoundingRectangle
    if ($element.Current.Name -and -not $r.IsEmpty -and $r.Y -ge ($window.Y + $window.Height - 140)) { $names += "'$($element.Current.Name)'" }
  }
  return ($names | Select-Object -Unique) -join ", "
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
  $file = (Save-Picture "00-not-open")[0]
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
    Say "No tab for $($page.displayName); the foot of the window shows: $(Tab-Names $root)"
    $results += [ordered]@{ page = $page.name; displayName = $page.displayName; found = $false; seconds = $null; file = $null; broken = @() }
    continue
  }
  $clock = [System.Diagnostics.Stopwatch]::StartNew()
  Open-Tab $tab
  Pointer-Away
  Start-Sleep -Milliseconds 300
  # A click can be lost (build R6: the tooltip of the tab before still showed, and History stayed on Contract
  # changes). The status bar says which page is open: when it is not this one, find the tab again and click again.
  $want = "Page $($n - 1) of $(@($list).Count)"
  for ($try = 1; $try -le 2; $try++) {
    $open = @((Words (Window)) | Where-Object { $_ -match '^Page \d+ of \d+$' }) | Select-Object -First 1
    if (-not $open -or $open -eq $want) { break }
    # Escape closes what may be over the tab strip; then click the middle of the tab, whatever UI Automation says
    # is under it, and say where, so a next failure can be read in the log.
    [System.Windows.Forms.SendKeys]::SendWait("{ESC}")
    Start-Sleep -Milliseconds 800
    $again = Find-Tab (Window) $page.displayName
    if ($again) {
      $at = Center $again
      $under = $null
      try { $under = [System.Windows.Automation.AutomationElement]::FromPoint((New-Object System.Windows.Point($at[0], $at[1]))) } catch { }
      Say "$($page.displayName): the status bar says $open, not $want; clicking the tab again at $([int]$at[0]),$([int]$at[1]) ($($again.Current.ControlType.ProgrammaticName), under it: '$(if ($under) { $under.Current.Name })')"
      $clock.Restart()
      Click $at[0] $at[1]
    } else { Say "$($page.displayName): the status bar says $open, not $want; no tab found again" }
    Pointer-Away
    Start-Sleep -Milliseconds 300
  }
  $seconds = Wait-Drawn $clock
  $saved = Save-Picture $slug -Look -Words @($page.words)
  $file = $saved[0]
  $words = Words (Window)
  $broken = @(Broken-Words $words)
  # The status bar says which page is open ("Page 14 of 17"): the judge compares it with the place of the page.
  $status = @($words | Where-Object { $_ -match '^Page \d+ of \d+$' }) | Select-Object -First 1
  Say "$($page.displayName): drawn in $seconds s, $file, $status$(if ($broken.Count) { ', shows: ' + ($broken -join '; ') })"
  # The other tabs of the page: Ctrl+click each, wait until it has drawn, a picture, and the broken words it shows.
  $tabs = @()
  $t = 1
  foreach ($label in @($page.tabs)) {
    if (-not $label) { continue }
    $tabSlug = "$slug-tab$t"
    $t++
    $button = Find-Button (Window) $label
    if (-not $button) { Say "$($page.displayName): no tab '$label' on the canvas"; $tabs += [ordered]@{ tab = $label; found = $false; seconds = $null; file = $null; broken = @() }; continue }
    $at = Center $button
    $tabClock = [System.Diagnostics.Stopwatch]::StartNew()
    [PictureWin]::keybd_event(0x11, 0, 0, 0)
    Click $at[0] $at[1]
    [PictureWin]::keybd_event(0x11, 0, 2, 0)
    Pointer-Away
    Start-Sleep -Milliseconds 300
    $tabSeconds = Wait-Drawn $tabClock
    $tabSaved = Save-Picture $tabSlug -Look -Words @($page.words)
    $tabFile = $tabSaved[0]
    $tabBroken = @(Broken-Words (Words (Window)))
    Say "$($page.displayName), tab ${label}: drawn in $tabSeconds s, $tabFile$(if ($tabBroken.Count) { ', shows: ' + ($tabBroken -join '; ') })"
    $tabs += [ordered]@{ tab = $label; found = $true; seconds = $tabSeconds; file = (Split-Path $tabFile -Leaf); broken = $tabBroken; look = $tabSaved[1] }
  }
  $results += [ordered]@{ page = $page.name; displayName = $page.displayName; found = $true; seconds = $seconds; file = (Split-Path $file -Leaf); broken = $broken; status = $status; tabs = $tabs; look = $saved[1] }
}
[ordered]@{ taken = $true; minutes = [math]::Round(((Get-Date) - $started).TotalMinutes, 1); pages = $results } | ConvertTo-Json -Depth 8 |
  Out-File -Encoding utf8NoBOM (Join-Path $Out "pictures.json")
Say "$($results.Count) pages, pictures in $Out"
