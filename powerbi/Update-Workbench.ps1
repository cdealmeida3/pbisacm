<#
  Update-Workbench.ps1 - carries your own settings from the previous SACM Workbench folder into this one
  (build R1, decision D339). Double-click Update-Workbench.cmd beside it, or run:
      powershell -NoProfile -ExecutionPolicy Bypass -File Update-Workbench.ps1 [-From <previous folder>]
        [-Report <file.pbix>] [-Yes]

  It copies only what is yours:
    1. the values of the five parameters (SourceMode, StateMode, SharePointSite, ReportsFolder, ServiceNowAddress)
       from the old SACM-Workbench.SemanticModel/definition/expressions.tmdl into the new one;
    2. the Power Apps and Power Automate visuals of the old pages into the same pages of this version, at the
       places this version keeps for them (update.json, from APP_SLOTS and FLOW_SLOTS).
       They come from the report you downloaded from the service, a .pbix (build L1, D376). Give it with -Report.
       Without it, the script takes the newest *.pbix in this folder, in the folder that holds it, or in the folder
       that holds the previous one, and asks you first. On a page where the .pbix has no app, they come from the
       previous folder. Of the .pbix it reads only the report part (Report/definition), never the data model. It
       writes nothing next to the .pbix. The parameters always come from the previous folder.
    3. (build A1, D382) In each Power Apps visual of the new folder: the empty filter card of a field this version
       turned into text (update.json, nowText) becomes the card of a text (Categorical); a card with a condition stays,
       with a line. Then one line per page with an app: are its fields the ones this version wants, in order, is its
       filter there, is its app link there. It renames no field and adds none: what is missing you add by hand.
  It copies nothing else, deletes nothing, never changes the old folder, and prints what it did.
  It works in Windows PowerShell 5.1 and in PowerShell 7. Keep this file in plain ASCII: Windows PowerShell
  reads a file without a byte order mark in the code page of the computer.
#>
param(
  [string]$From = '',
  [string]$Report = '',
  [switch]$Yes
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 1

$here = $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding $false

function Read-Text([string]$path) { return [System.IO.File]::ReadAllText($path) }
function Write-Text([string]$path, [string]$text) { [System.IO.File]::WriteAllText($path, $text, $utf8) }
function Stop-Update([string]$why) {
  Write-Host ''
  Write-Host "Nothing was changed. $why" -ForegroundColor Red
  exit 1
}
function Get-Property($object, [string]$name) {
  if ($null -eq $object) { return $null }
  $property = $object.PSObject.Properties[$name]
  if ($null -eq $property) { return $null }
  return $property.Value
}
function Test-Project([string]$folder) {
  return (Test-Path -LiteralPath (Join-Path $folder 'SACM-Workbench.SemanticModel/definition/expressions.tmdl')) -and
    (Test-Path -LiteralPath (Join-Path $folder 'SACM-Workbench.Report/definition/pages'))
}
function Get-FolderVersion([string]$name) {
  if ($name -match '^SACM-Workbench-(\d+)\.(\d+)\.(\d+)$') { return New-Object System.Version -ArgumentList @([int]$matches[1], [int]$matches[2], [int]$matches[3]) }
  return $null
}

# --- What this version is ------------------------------------------------------------------------------------------
$planFile = Join-Path $here 'update.json'
if (-not (Test-Path -LiteralPath $planFile)) { Stop-Update 'This folder has no update.json: use the folder of the zip (SACM-Workbench-<version>), not a copy of the repository.' }
$plan = (Read-Text $planFile) | ConvertFrom-Json
if (-not (Test-Project $here)) { Stop-Update "This folder ($here) is not a SACM Workbench project." }
$ownVersion = New-Object System.Version $plan.version
Write-Host "SACM Workbench $($plan.version): carry your settings from the previous version."

# --- Find the previous folder --------------------------------------------------------------------------------------
$hereFull = [System.IO.Path]::GetFullPath($here).TrimEnd('\', '/')
# The newest older SACM-Workbench-<version> in a folder, else its folder powerbi (versions before 0.53.0 unzipped there).
function Find-Previous([string]$parent) {
  if ($null -eq $parent -or $parent -eq '' -or -not (Test-Path -LiteralPath $parent)) { return $null }
  $best = $null
  $bestVersion = $null
  foreach ($folder in Get-ChildItem -LiteralPath $parent -Directory) {
    if ($folder.FullName.TrimEnd('\', '/') -eq $hereFull) { continue }
    $version = Get-FolderVersion $folder.Name
    if ($null -eq $version -or $version -ge $ownVersion) { continue }
    if (-not (Test-Project $folder.FullName)) { continue }
    if ($null -eq $bestVersion -or $version -gt $bestVersion) { $best = $folder.FullName; $bestVersion = $version }
  }
  if ($null -eq $best) {
    $old = Join-Path $parent 'powerbi'
    if ((Test-Path -LiteralPath $old) -and (Test-Project $old)) { $best = $old }
  }
  return $best
}
if ($From -eq '') {
  $parent = Split-Path -Parent $hereFull
  $best = Find-Previous $parent
  # Windows' Extract All puts the zip's folder into a new folder named after the zip: look one folder higher too.
  if ($null -eq $best) { $best = Find-Previous (Split-Path -Parent $parent) }
  if ($null -eq $best) {
    if ($Yes) { Stop-Update "No previous folder found next to this one ($parent). Give it with -From." }
    Write-Host 'No previous version was found next to this folder.'
    $best = Read-Host 'Paste the path of your previous folder (the one with SACM-Workbench.pbip), then press Enter'
    $best = $best.Trim().Trim('"')
  }
  $From = $best
}
if (-not (Test-Path -LiteralPath $From)) { Stop-Update "The folder $From does not exist." }
$From = [System.IO.Path]::GetFullPath($From).TrimEnd('\', '/')
if ($From -eq $hereFull) { Stop-Update 'The previous folder is this folder.' }
if (-not (Test-Project $From)) {
  if (Test-Path -LiteralPath (Join-Path $From 'SACM-Workbench.Report/report.json')) { Stop-Update "The report in $From is saved in the older format (report.json, not definition/pages). In Power BI Desktop turn on the option of README section 1 (Store reports using enhanced metadata format, PBIR), open it, save it, and run this again." }
  Stop-Update "The folder $From is not a SACM Workbench project (it has no SACM-Workbench.SemanticModel or SACM-Workbench.Report)."
}

Write-Host ''
Write-Host "Previous folder: $From"
Write-Host "New folder:      $hereFull"
if (-not $Yes) {
  $answer = Read-Host 'Carry your settings and apps from the previous folder into the new one? (Y/N)'
  if ($answer -notmatch '^\s*[Yy]') { Stop-Update 'You answered No.' }
}

# --- The report you downloaded from the service (a .pbix), if any ------------------------------------------------
# Given with -Report; else the newest *.pbix in the new folder, the folder that holds it or the folder that holds the
# previous folder (where you unzipped the new version), and you say whether to take it.
if ($Report -ne '') {
  if (-not (Test-Path -LiteralPath $Report -PathType Leaf)) { Stop-Update "The file $Report does not exist." }
  $Report = (Resolve-Path -LiteralPath $Report).ProviderPath
} else {
  $seen = @{}
  $found = @()
  foreach ($folder in @($hereFull, (Split-Path -Parent $hereFull), (Split-Path -Parent $From))) {
    if ($null -eq $folder -or $folder -eq '' -or $seen.ContainsKey($folder) -or -not (Test-Path -LiteralPath $folder)) { continue }
    $seen[$folder] = $true
    $found += @(Get-ChildItem -LiteralPath $folder -File -Filter '*.pbix')
  }
  $newest = $found | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($null -ne $newest) {
    $when = $newest.LastWriteTime.ToString('yyyy-MM-dd HH:mm', [System.Globalization.CultureInfo]::InvariantCulture)
    $take = $true
    if (-not $Yes) {
      $answer = Read-Host "Take the apps and buttons from $($newest.Name) ($when)? (Y/N)"
      $take = $answer -match '^\s*[Yy]'
    }
    if ($take) { $Report = $newest.FullName }
  }
}
if ($Report -ne '') { Write-Host "Report file:     $Report" }

# --- 1. The parameters ---------------------------------------------------------------------------------------------
$oldModelFile = Join-Path $From 'SACM-Workbench.SemanticModel/definition/expressions.tmdl'
$newModelFile = Join-Path $here 'SACM-Workbench.SemanticModel/definition/expressions.tmdl'
$oldModel = Read-Text $oldModelFile
$newModel = Read-Text $newModelFile
$newModelBefore = $newModel
function Get-ParameterPattern([string]$name) {
  return '(?m)^(?<head>[ \t]*expression[ \t]+''?' + [regex]::Escape($name) + '''?[ \t]*=[ \t]*)(?<value>[^\r\n]*?)(?<tail>[ \t]+meta[ \t]*\[)'
}
foreach ($name in $plan.parameters) {
  if (-not [regex]::IsMatch($newModel, (Get-ParameterPattern $name))) { Stop-Update "The new version has no parameter $name in expressions.tmdl: this script does not fit this version." }
}
$parameterLines = @()
foreach ($name in $plan.parameters) {
  $pattern = Get-ParameterPattern $name
  $old = [regex]::Match($oldModel, $pattern)
  $new = [regex]::Match($newModel, $pattern)
  $value = $new.Groups['value']
  if (-not $old.Success) { $parameterLines += "  $name : not in the previous folder, keeps $($value.Value)"; continue }
  $oldValue = $old.Groups['value'].Value
  if ($oldValue -ceq $value.Value) { $parameterLines += "  $name : $oldValue (the same)"; continue }
  $newModel = $newModel.Substring(0, $value.Index) + $oldValue + $newModel.Substring($value.Index + $value.Length)
  $parameterLines += "  $name : $oldValue (was $($value.Value))"
}

# --- 2. The Power Apps and Power Automate visuals ------------------------------------------------------------------
$native = @{}
foreach ($type in $plan.native) { $native[$type] = $true }
$oldPages = Join-Path $From 'SACM-Workbench.Report/definition/pages'
$newPages = Join-Path $here 'SACM-Workbench.Report/definition/pages'

function Get-Visual([string]$file) {
  $json = (Read-Text $file) | ConvertFrom-Json
  return [pscustomobject]@{ Name = (Get-Property $json 'name'); Type = (Get-Property (Get-Property $json 'visual') 'visualType') }
}
function Test-AppVisual($visual) { return ($null -ne $visual.Type) -and ($visual.Type -ne '') -and (-not $native.ContainsKey($visual.Type)) }
function Get-AppVisuals([string]$pageFolder) {
  $found = @()
  $visualsFolder = Join-Path $pageFolder 'visuals'
  if (-not (Test-Path -LiteralPath $visualsFolder)) { return $found }
  foreach ($folder in Get-ChildItem -LiteralPath $visualsFolder -Directory | Sort-Object Name) {
    $file = Join-Path $folder.FullName 'visual.json'
    if (-not (Test-Path -LiteralPath $file)) { continue }
    $visual = Get-Visual $file
    if (Test-AppVisual $visual) { $found += [pscustomobject]@{ Folder = $folder.FullName; Name = $folder.Name; Type = $visual.Type } }
  }
  return $found
}
function Get-PageName([string]$pageFolder) {
  $file = Join-Path $pageFolder 'page.json'
  if (-not (Test-Path -LiteralPath $file)) { return $null }
  return Get-Property ((Read-Text $file) | ConvertFrom-Json) 'displayName'
}
# A number in JSON as the place of a visual: whole numbers stay whole.
function Format-Number($value) { return ([double]$value).ToString([System.Globalization.CultureInfo]::InvariantCulture) }
function Set-Position([string]$text, $slot) {
  $box = [regex]::Match($text, '"position"\s*:\s*\{[^{}]*\}')
  if (-not $box.Success) { return $text }
  $inner = $box.Value
  foreach ($key in @('x', 'y', 'width', 'height')) {
    $inner = [regex]::Replace($inner, '("' + $key + '"\s*:\s*)-?[0-9.]+(?:[eE][-+]?[0-9]+)?', ('${1}' + (Format-Number (Get-Property $slot $key))))
  }
  return $text.Substring(0, $box.Index) + $inner + $text.Substring($box.Index + $box.Length)
}

# The new pages by folder name and by the name you see, so a page Desktop saved under another folder name is found.
$newByName = @{}
$newByDisplay = @{}
foreach ($folder in Get-ChildItem -LiteralPath $newPages -Directory) {
  $newByName[$folder.Name] = $folder.FullName
  $display = Get-PageName $folder.FullName
  if ($null -ne $display) { $newByDisplay[$display] = $folder.FullName }
}

# --- The visuals of the downloaded report (.pbix), read from its report part only --------------------------------
# A .pbix is a zip. Only the entries under Report/definition/ are read: report.json, each page.json and the files of
# each visual. The data model (DataModel) and every other part are never opened.
$reportVisuals = @()
$reportPages = @{}
$reportPublic = @()
$reportNote = ''
function Read-EntryBytes($entry) {
  $stream = $entry.Open()
  try {
    $memory = New-Object System.IO.MemoryStream
    $stream.CopyTo($memory)
    return ,$memory.ToArray()
  } finally { $stream.Dispose() }
}
function Get-EntryText([byte[]]$bytes) {
  $reader = New-Object System.IO.StreamReader -ArgumentList @((New-Object System.IO.MemoryStream -ArgumentList @(,$bytes)), $utf8, $true)
  try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
}
# A name of a folder inside the report: no empty part, no . or .., no characters a folder cannot have.
function Test-SafeName([string]$name) { return ($name -ne '') -and ($name -ne '.') -and ($name -ne '..') -and ($name.IndexOfAny([System.IO.Path]::GetInvalidFileNameChars()) -lt 0) }
if ($Report -ne '') {
  try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($Report)
  } catch { Stop-Update "The file $Report cannot be read as a Power BI report (.pbix): $($_.Exception.Message)" }
  try {
    $names = @($zip.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
    if (-not ($names | Where-Object { $_.StartsWith('Report/definition/') })) {
      if ($names -contains 'Report/Layout') { $reportNote = "  $([System.IO.Path]::GetFileName($Report)) is in the old format (Report/Layout): its apps are not read. Do step 13 of README section 6.4 instead (Save as a Power BI project), then run this again." }
      else { $reportNote = "  $([System.IO.Path]::GetFileName($Report)) has no report part (Report/definition): its apps are not read." }
    } else {
      $byKey = @{}
      foreach ($entry in $zip.Entries) {
        $name = $entry.FullName.Replace('\', '/')
        if ($name -eq 'Report/definition/report.json') {
          $reportPublic = @(Get-Property ((Get-EntryText (Read-EntryBytes $entry)) | ConvertFrom-Json) 'publicCustomVisuals' | Where-Object { $null -ne $_ })
          continue
        }
        $pageMatch = [regex]::Match($name, '^Report/definition/pages/([^/]+)/page\.json$')
        if ($pageMatch.Success -and (Test-SafeName $pageMatch.Groups[1].Value)) {
          $reportPages[$pageMatch.Groups[1].Value] = Get-Property ((Get-EntryText (Read-EntryBytes $entry)) | ConvertFrom-Json) 'displayName'
          continue
        }
        $visualMatch = [regex]::Match($name, '^Report/definition/pages/([^/]+)/visuals/([^/]+)/(.+)$')
        if (-not $visualMatch.Success -or $name.EndsWith('/')) { continue }
        $pageKey = $visualMatch.Groups[1].Value
        $visualName = $visualMatch.Groups[2].Value
        $relative = $visualMatch.Groups[3].Value
        if (-not (Test-SafeName $pageKey) -or -not (Test-SafeName $visualName) -or @($relative.Split('/') | Where-Object { -not (Test-SafeName $_) }).Count -gt 0) { continue }
        if (-not $reportPages.ContainsKey($pageKey)) { $reportPages[$pageKey] = $null }
        $key = "$pageKey/$visualName"
        if (-not $byKey.ContainsKey($key)) { $byKey[$key] = [pscustomobject]@{ Page = $pageKey; Name = $visualName; Files = @() } }
        $byKey[$key].Files += [pscustomobject]@{ Path = $relative; Bytes = (Read-EntryBytes $entry) }
      }
      foreach ($key in ($byKey.Keys | Sort-Object)) {
        $item = $byKey[$key]
        $main = $item.Files | Where-Object { $_.Path -eq 'visual.json' } | Select-Object -First 1
        if ($null -eq $main) { continue }
        $json = (Get-EntryText $main.Bytes) | ConvertFrom-Json
        $type = Get-Property (Get-Property $json 'visual') 'visualType'
        if (-not (Test-AppVisual ([pscustomobject]@{ Type = $type }))) { continue }
        $reportVisuals += [pscustomobject]@{ Page = $item.Page; Name = $item.Name; Type = $type; Files = $item.Files }
      }
    }
  } catch {
    Stop-Update "The file $Report has a part that cannot be read: $($_.Exception.Message)"
  } finally { $zip.Dispose() }
}

# The new page a visual of the old page goes to: the same folder name, else the same name you see.
function Find-Target([string]$pageKey, $display) {
  $target = $newByName[$pageKey]
  if ($null -eq $target -and $null -ne $display) { $target = $newByDisplay[$display] }
  return $target
}

# Every visual to carry: those of the .pbix first, then those of the previous folder. A page that gets its app or
# button from the .pbix takes none from the folder; on the other pages the folder's stay (a .pbix saved from Desktop
# before the apps were added never takes them away).
$sources = @()
foreach ($visual in $reportVisuals) {
  $display = $reportPages[$visual.Page]
  $sources += [pscustomobject]@{ Page = $visual.Page; Display = $display; Name = $visual.Name; Type = $visual.Type; Folder = $null; Files = $visual.Files; Target = (Find-Target $visual.Page $display) }
}
foreach ($oldPage in Get-ChildItem -LiteralPath $oldPages -Directory | Sort-Object Name) {
  $display = Get-PageName $oldPage.FullName
  $target = Find-Target $oldPage.Name $display
  foreach ($app in Get-AppVisuals $oldPage.FullName) {
    $sources += [pscustomobject]@{ Page = $oldPage.Name; Display = $display; Name = $app.Name; Type = $app.Type; Folder = $app.Folder; Files = $null; Target = $target }
  }
}

$copies = @()
$visualLines = @()
$fromReport = @{}
if ($reportNote -ne '') { $visualLines += $reportNote }
foreach ($app in $sources) {
  $label = if ($null -ne $app.Display) { $app.Display } else { $app.Page }
  $target = $app.Target
  $isReport = $null -eq $app.Folder
  if (-not $isReport -and $null -ne $target -and $fromReport.ContainsKey($target)) { continue }
  if ($null -eq $target) { $visualLines += "  $label : the visual $($app.Name) ($($app.Type)) is not copied: this version has no such page."; continue }
  $pageKey = Split-Path -Leaf $target
  $slot = Get-Property $plan.slots $pageKey
  if ($null -eq $slot) { $visualLines += "  $label : the visual $($app.Name) ($($app.Type)) is not copied: this version keeps no place for an app on this page. Add it again by hand if you still need it (README section 6)."; continue }
  $destination = Join-Path (Join-Path $target 'visuals') $app.Name
  if (Test-Path -LiteralPath $destination) {
    $alreadyFile = Join-Path $destination 'visual.json'
    if ((Test-Path -LiteralPath $alreadyFile) -and (Get-Visual $alreadyFile).Type -eq $app.Type) {
      if ($isReport) { $fromReport[$target] = $true }
      $visualLines += "  $label : $($slot.name) is already here."; continue
    }
    $visualLines += "  $label : the visual $($app.Name) is not copied: this version has a visual of that name."; continue
  }
  $present = @(Get-AppVisuals $target) + @($copies | Where-Object { $_.Target -eq $target })
  if ($present.Count -gt 0) { $visualLines += "  $label : the visual $($app.Name) ($($app.Type)) is not copied: this page already has its app."; continue }
  if ($isReport) { $fromReport[$target] = $true }
  $copies += [pscustomobject]@{ Source = $app.Folder; Files = $app.Files; Target = $target; Destination = $destination; Type = $app.Type; Slot = $slot; Label = $label }
}

# --- 3. The visual types of the apps, for report.json --------------------------------------------------------------
$oldReport = (Read-Text (Join-Path $From 'SACM-Workbench.Report/definition/report.json')) | ConvertFrom-Json
$newReportFile = Join-Path $here 'SACM-Workbench.Report/definition/report.json'
$newReportText = Read-Text $newReportFile
$newReport = $newReportText | ConvertFrom-Json
$oldPublic = @(Get-Property $oldReport 'publicCustomVisuals') + @($reportPublic)
$newPublic = @(Get-Property $newReport 'publicCustomVisuals' | Where-Object { $null -ne $_ })
$public = @($newPublic)
foreach ($copy in $copies) {
  if (($oldPublic -contains $copy.Type) -and -not ($public -contains $copy.Type)) { $public += $copy.Type }
}
$reportChanged = $public.Count -ne $newPublic.Count
if ($reportChanged) {
  $list = '"publicCustomVisuals": [' + (($public | ForEach-Object { '"' + ($_ -replace '\\', '\\' -replace '"', '\"') + '"' }) -join ', ') + ']'
  $existing = [regex]::Match($newReportText, '"publicCustomVisuals"\s*:\s*\[[^\]]*\]')
  if ($existing.Success) {
    $newReportText = $newReportText.Substring(0, $existing.Index) + $list + $newReportText.Substring($existing.Index + $existing.Length)
  } else {
    $at = $newReportText.IndexOf('{')
    $rest = $newReportText.Substring($at + 1)
    $comma = if ($rest.Trim().StartsWith('}')) { '' } else { ',' }
    $newReportText = $newReportText.Substring(0, $at + 1) + "`n  " + $list + $comma + $rest
  }
}

# --- Write ---------------------------------------------------------------------------------------------------------
foreach ($copy in $copies) {
  $visuals = Join-Path $copy.Target 'visuals'
  if (-not (Test-Path -LiteralPath $visuals)) { New-Item -ItemType Directory -Path $visuals | Out-Null }
  if ($null -ne $copy.Source) {
    Copy-Item -LiteralPath $copy.Source -Destination $copy.Destination -Recurse
  } else {
    foreach ($part in $copy.Files) {
      $path = Join-Path $copy.Destination ($part.Path.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
      $parent = Split-Path -Parent $path
      if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
      if ($part.Path -eq 'visual.json') { Write-Text $path (Get-EntryText $part.Bytes) } else { [System.IO.File]::WriteAllBytes($path, $part.Bytes) }
    }
  }
  $file = Join-Path $copy.Destination 'visual.json'
  Write-Text $file (Set-Position (Read-Text $file) $copy.Slot)
  $visualLines += "  $($copy.Label) : $($copy.Slot.name) copied, at X $($copy.Slot.x), Y $($copy.Slot.y), $($copy.Slot.width) x $($copy.Slot.height)."
}
if ($reportChanged) { Write-Text $newReportFile $newReportText }
if ($newModel -cne $newModelBefore) { Write-Text $newModelFile $newModel }

# --- 4. The fields of the apps (build A1, D382) ----------------------------------------------------------------------
# Every field of a Power Apps visual is text from build A1 (D377). A field that was a number keeps, in a visual made
# before, the empty filter card of a number (Advanced); it becomes the card of a text (Categorical), as Power BI gives a
# text field. Then each app visual is compared with the fields this version wants (update.json, fields).
$nowText = @{}
foreach ($field in @(Get-Property $plan 'nowText')) { if ($null -ne $field) { $nowText["$($field.entity)|$($field.property)"] = $true } }
$planFields = Get-Property $plan 'fields'

# The objects of the JSON array that opens at $open in $text: the index and length of each, texts skipped.
function Get-ArrayItems([string]$text, [int]$open) {
  $items = @()
  $depth = 0
  $inText = $false
  $escape = $false
  $itemStart = -1
  for ($i = $open; $i -lt $text.Length; $i++) {
    $c = $text[$i]
    if ($inText) {
      if ($escape) { $escape = $false } elseif ($c -eq [char]92) { $escape = $true } elseif ($c -eq [char]34) { $inText = $false }
      continue
    }
    if ($c -eq [char]34) { $inText = $true; continue }
    if ($c -eq [char]'[' -or $c -eq [char]'{') {
      $depth++
      if ($depth -eq 2 -and $c -eq [char]'{') { $itemStart = $i }
      continue
    }
    if ($c -eq [char]']' -or $c -eq [char]'}') {
      if ($depth -eq 2 -and $c -eq [char]'}' -and $itemStart -ge 0) { $items += [pscustomobject]@{ Index = $itemStart; Length = $i - $itemStart + 1 }; $itemStart = -1 }
      $depth--
      if ($depth -le 0) { break }
    }
  }
  return ,$items
}
# The table and the column or measure a field of a visual names ("CaseLines|Key"); a summarized column too.
function Get-FieldKey($field) {
  if ($null -eq $field) { return $null }
  $aggregation = Get-Property $field 'Aggregation'
  if ($null -ne $aggregation) { $field = Get-Property $aggregation 'Expression' }
  foreach ($kind in @('Column', 'Measure')) {
    $item = Get-Property $field $kind
    if ($null -ne $item) {
      $entity = Get-Property (Get-Property (Get-Property $item 'Expression') 'SourceRef') 'Entity'
      return "$entity|$(Get-Property $item 'Property')"
    }
  }
  return $null
}
# The text of a visual with the empty filter cards of the fields now text turned Categorical, and the lines to print.
function Update-FilterCards([string]$text, [string]$label) {
  $notes = @()
  $changed = 0
  $head = [regex]::Match($text, '"filters"\s*:\s*\[')
  if (-not $head.Success) { return [pscustomobject]@{ Text = $text; Changed = 0; Notes = $notes } }
  $items = Get-ArrayItems $text ($head.Index + $head.Length - 1)
  for ($k = $items.Count - 1; $k -ge 0; $k--) {
    $item = $items[$k]
    $body = $text.Substring($item.Index, $item.Length)
    $card = $body | ConvertFrom-Json
    $key = Get-FieldKey (Get-Property $card 'field')
    if ($null -eq $key -or -not $nowText.ContainsKey($key)) { continue }
    $name = $key.Substring($key.IndexOf('|') + 1)
    if ($null -ne (Get-Property $card 'filter')) { $notes += "  $label : the filter on $name has a condition. $name is text from this version: check the condition in the visual's filters."; continue }
    if ((Get-Property $card 'type') -cne 'Advanced') { continue }
    $types = [regex]::Matches($body, '"type"\s*:\s*"Advanced"')
    if ($types.Count -ne 1) { continue }
    $body = $body.Substring(0, $types[0].Index) + '"type": "Categorical"' + $body.Substring($types[0].Index + $types[0].Length)
    $text = $text.Substring(0, $item.Index) + $body + $text.Substring($item.Index + $item.Length)
    $changed++
  }
  return [pscustomobject]@{ Text = $text; Changed = $changed; Notes = $notes }
}
# One line on an app visual: its fields against the ones this version wants, its filter, its app link.
function Get-AppCheck([string]$text, $slot, [string]$label) {
  $json = $text | ConvertFrom-Json
  $visual = Get-Property $json 'visual'
  $got = @()
  $state = Get-Property (Get-Property $visual 'query') 'queryState'
  if ($null -ne $state) {
    foreach ($role in $state.PSObject.Properties) {
      foreach ($projection in @(Get-Property $role.Value 'projections')) {
        if ($null -eq $projection) { continue }
        $key = Get-FieldKey (Get-Property $projection 'field')
        if ($null -ne $key) { $got += $key }
      }
    }
  }
  $want = @()
  foreach ($field in @(Get-Property $planFields $slot.name)) { if ($null -ne $field) { $want += "$($field.entity)|$($field.property)" } }
  $missing = @($want | Where-Object { $got -notcontains $_ })
  $extra = @($got | Where-Object { $want -notcontains $_ })
  $parts = @()
  if ($missing.Count -eq 0 -and $extra.Count -eq 0 -and (($got -join ',') -ceq ($want -join ','))) {
    $parts += "$($want.Count) fields as this version wants"
  } else {
    $short = { param($list) ($list | ForEach-Object { $_.Replace('|', '.') }) -join ', ' }
    if ($missing.Count -gt 0) { $parts += "missing $(& $short $missing)" }
    if ($extra.Count -gt 0) { $parts += "not used $(& $short $extra)" }
    if ($missing.Count -eq 0 -and $extra.Count -eq 0) { $parts += 'the fields are in another order' }
    $parts += 'fix the fields in Power Apps data of the visual (README section 6.4), then ... > Edit'
  }
  $filter = Get-Property $slot 'filter'
  if ($null -ne $filter) {
    $kept = $false
    $config = Get-Property $json 'filterConfig'
    foreach ($card in @(Get-Property $config 'filters')) {
      if ($null -eq $card -or $null -eq (Get-Property $card 'filter')) { continue }
      if ((Get-FieldKey (Get-Property $card 'field')) -ceq "$($filter.entity)|$($filter.property)") { $kept = $true }
    }
    if ($kept) { $parts += 'filter kept' } else { $parts += "no filter $($filter.words): add it in Filters on this visual" }
  }
  $appId = $null
  foreach ($entry in @(Get-Property (Get-Property $visual 'objects') 'general')) { if ($null -ne $entry) { $found = Get-Property (Get-Property $entry 'properties') 'appId'; if ($null -ne $found) { $appId = $found } } }
  if ($null -ne $appId) { $parts += 'app link kept' } else { $parts += 'no app link: choose the app again (Choose app in the visual)' }
  return "  $label : $($slot.name), $($parts -join ', ')."
}

$fieldLines = @()
foreach ($page in Get-ChildItem -LiteralPath $newPages -Directory | Sort-Object Name) {
  $slot = Get-Property $plan.slots $page.Name
  if ($null -eq $slot -or $slot.kind -ne 'app') { continue }
  $display = Get-PageName $page.FullName
  $label = if ($null -ne $display) { $display } else { $page.Name }
  foreach ($app in Get-AppVisuals $page.FullName) {
    $file = Join-Path $app.Folder 'visual.json'
    $text = Read-Text $file
    $result = Update-FilterCards $text $label
    if ($result.Changed -gt 0) {
      Write-Text $file $result.Text
      $fieldLines += "  $label : $($result.Changed) filter card(s) of fields now text made Categorical."
    }
    $fieldLines += $result.Notes
    $fieldLines += Get-AppCheck $result.Text $slot $label
  }
}

Write-Host ''
Write-Host 'Parameters:'
foreach ($line in $parameterLines) { Write-Host $line }
Write-Host ''
Write-Host 'Power Apps and Refresh now:'
if ($visualLines.Count -eq 0) { Write-Host '  none in the previous folder or the report file. Add them in the service (README section 6), then download the report next time (README section 6.4 step 13).' }
foreach ($line in $visualLines) { Write-Host $line }
Write-Host ''
Write-Host 'The fields of the apps (every field is text from build A1):'
if ($fieldLines.Count -eq 0) { Write-Host '  no app in this folder yet.' }
foreach ($line in $fieldLines) { Write-Host $line }
Write-Host ''
Write-Host 'Nothing else was copied and nothing was deleted. The previous folder is unchanged.'
Write-Host "Now open SACM-Workbench.pbip in $hereFull and press Refresh."
exit 0
