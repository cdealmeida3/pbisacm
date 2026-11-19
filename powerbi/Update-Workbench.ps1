<#
  Update-Workbench.ps1 - carries your own settings from the previous SACM Workbench folder into this one
  (build R1, decision D339). Double-click Update-Workbench.cmd beside it, or run:
      powershell -NoProfile -ExecutionPolicy Bypass -File Update-Workbench.ps1 [-From <previous folder>] [-Yes]

  It copies only what is yours:
    1. the values of the five parameters (SourceMode, StateMode, SharePointSite, ReportsFolder, ServiceNowAddress)
       from the old SACM-Workbench.SemanticModel/definition/expressions.tmdl into the new one;
    2. the Power Apps and Power Automate visuals of the old pages into the same pages of this version, at the
       places this version keeps for them (update.json, from APP_SLOTS and FLOW_SLOTS).
  It copies nothing else, deletes nothing, never changes the old folder, and prints what it did.
  It works in Windows PowerShell 5.1 and in PowerShell 7. Keep this file in plain ASCII: Windows PowerShell
  reads a file without a byte order mark in the code page of the computer.
#>
param(
  [string]$From = '',
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
if ($From -eq '') {
  $parent = Split-Path -Parent $hereFull
  $best = $null
  $bestVersion = $null
  foreach ($folder in Get-ChildItem -LiteralPath $parent -Directory) {
    if ($folder.FullName.TrimEnd('\', '/') -eq $hereFull) { continue }
    $version = Get-FolderVersion $folder.Name
    if ($null -eq $version -or $version -ge $ownVersion) { continue }
    if (-not (Test-Project $folder.FullName)) { continue }
    if ($null -eq $bestVersion -or $version -gt $bestVersion) { $best = $folder.FullName; $bestVersion = $version }
  }
  # Versions before 0.53.0 unzipped into a folder named powerbi.
  if ($null -eq $best) {
    $old = Join-Path $parent 'powerbi'
    if ((Test-Path -LiteralPath $old) -and (Test-Project $old)) { $best = $old }
  }
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
if (-not (Test-Project $From)) { Stop-Update "The folder $From is not a SACM Workbench project (it has no SACM-Workbench.SemanticModel or SACM-Workbench.Report)." }

Write-Host ''
Write-Host "Previous folder: $From"
Write-Host "New folder:      $hereFull"
if (-not $Yes) {
  $answer = Read-Host 'Carry your settings and apps from the previous folder into the new one? (Y/N)'
  if ($answer -notmatch '^\s*[Yy]') { Stop-Update 'You answered No.' }
}

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

$copies = @()
$visualLines = @()
foreach ($oldPage in Get-ChildItem -LiteralPath $oldPages -Directory | Sort-Object Name) {
  foreach ($app in Get-AppVisuals $oldPage.FullName) {
    $display = Get-PageName $oldPage.FullName
    $label = if ($null -ne $display) { $display } else { $oldPage.Name }
    $target = $newByName[$oldPage.Name]
    if ($null -eq $target -and $null -ne $display) { $target = $newByDisplay[$display] }
    if ($null -eq $target) { $visualLines += "  $label : the visual $($app.Name) ($($app.Type)) is not copied: this version has no such page."; continue }
    $pageKey = Split-Path -Leaf $target
    $slot = Get-Property $plan.slots $pageKey
    if ($null -eq $slot) { $visualLines += "  $label : the visual $($app.Name) ($($app.Type)) is not copied: this version keeps no place for an app on this page. Add it again by hand if you still need it (README section 6)."; continue }
    $destination = Join-Path (Join-Path $target 'visuals') $app.Name
    if (Test-Path -LiteralPath $destination) {
      $already = Get-Visual (Join-Path $destination 'visual.json')
      if ($already.Type -eq $app.Type) { $visualLines += "  $label : $($slot.name) is already here."; continue }
      $visualLines += "  $label : the visual $($app.Name) is not copied: this version has a visual of that name."; continue
    }
    $present = @(Get-AppVisuals $target) + @($copies | Where-Object { $_.Target -eq $target })
    if ($present.Count -gt 0) { $visualLines += "  $label : the visual $($app.Name) ($($app.Type)) is not copied: this page already has its app."; continue }
    $copies += [pscustomobject]@{ Source = $app.Folder; Target = $target; Destination = $destination; Type = $app.Type; Slot = $slot; Label = $label }
  }
}

# --- 3. The visual types of the apps, for report.json --------------------------------------------------------------
$oldReport = (Read-Text (Join-Path $From 'SACM-Workbench.Report/definition/report.json')) | ConvertFrom-Json
$newReportFile = Join-Path $here 'SACM-Workbench.Report/definition/report.json'
$newReportText = Read-Text $newReportFile
$newReport = $newReportText | ConvertFrom-Json
$oldPublic = @(Get-Property $oldReport 'publicCustomVisuals')
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
    $newReportText = $newReportText.Substring(0, $at + 1) + "`n  " + $list + ',' + $newReportText.Substring($at + 1)
  }
}

# --- Write ---------------------------------------------------------------------------------------------------------
if ($newModel -cne $newModelBefore) { Write-Text $newModelFile $newModel }
foreach ($copy in $copies) {
  $visuals = Join-Path $copy.Target 'visuals'
  if (-not (Test-Path -LiteralPath $visuals)) { New-Item -ItemType Directory -Path $visuals | Out-Null }
  Copy-Item -LiteralPath $copy.Source -Destination $copy.Destination -Recurse
  $file = Join-Path $copy.Destination 'visual.json'
  Write-Text $file (Set-Position (Read-Text $file) $copy.Slot)
  $visualLines += "  $($copy.Label) : $($copy.Slot.name) copied, at X $($copy.Slot.x), Y $($copy.Slot.y), $($copy.Slot.width) x $($copy.Slot.height)."
}
if ($reportChanged) { Write-Text $newReportFile $newReportText }

Write-Host ''
Write-Host 'Parameters:'
foreach ($line in $parameterLines) { Write-Host $line }
Write-Host ''
Write-Host 'Power Apps and Refresh now:'
if ($visualLines.Count -eq 0) { Write-Host '  none in the previous folder. Add them in the service (README section 6), then keep them as README section 6.4 step 13 says.' }
foreach ($line in $visualLines) { Write-Host $line }
Write-Host ''
Write-Host 'Nothing else was copied and nothing was deleted. The previous folder is unchanged.'
Write-Host "Now open SACM-Workbench.pbip in $hereFull and press Refresh."
exit 0
