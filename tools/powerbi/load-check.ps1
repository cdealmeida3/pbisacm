# When Power Query refuses the whole test connector ("The name 'SacmEval.Contents' wasn't recognized" for every query),
# the M parses but does not compile, and PQTest does not say which query. This finds the first member that stops it: it
# builds the connector with only the first k members kept (connector.ts --live k, in an order where a member comes
# after every member it names; the others null) and looks for the smallest k that fails, in about eight PQTest calls.
# Invented samples only.
#   pwsh tools/powerbi/load-check.ps1
param([string]$PQTest = ".build/pqsdk/tools/PQTest.exe", [string]$Folder = ".build/powerbi-load")

function Test-Loads([int]$live, [string[]]$cut = @()) {
  & node tools/powerbi/connector.ts $Folder --live $live @cut | Out-Null
  Compress-Archive -Path "$Folder/SacmEval/SacmEval.pq" -DestinationPath "$Folder/SacmEval.zip" -Force
  Move-Item "$Folder/SacmEval.zip" "$Folder/SacmEval.mez" -Force
  $query = "$Folder/queries/About.pq"
  $template = & $PQTest credential-template -e "$Folder/SacmEval.mez" -q $query -p -ak Anonymous 2>&1 | Out-String
  return -not ($template -match "Unable to determine data source")
}

& node tools/powerbi/connector.ts $Folder | Out-Null
$members = @(Get-Content "$Folder/members.txt")
if (Test-Loads $members.Count) { Write-Output "The test connector loads."; exit 0 }
if (-not (Test-Loads 0)) { Write-Output "The test connector does not load even with no member kept: the frame of connector.ts is wrong."; exit 1 }
$low = 0                 # loads with the first $low members
$high = $members.Count   # fails with the first $high members
while ($high - $low -gt 1) {
  $middle = [Math]::Floor(($low + $high) / 2)
  if (Test-Loads $middle) { $low = $middle } else { $high = $middle }
}
$name = $members[$high - 1]
Write-Output "The test connector does not load because of the member $name (number $high of $($members.Count))."
# When it is a let: the first step that stops it (the steps after it null).
& node tools/powerbi/connector.ts $Folder --live $high --cut $name 0 | Out-Null
$steps = @(Get-Content "$Folder/steps.txt" | Where-Object { $_ -ne "" })
if ($steps.Count -gt 0) {
  $low = 0; $top = $steps.Count
  if (-not (Test-Loads $high @("--cut", $name, "0"))) { Write-Output "With every step null it still fails: the result of the let (after in) stops it." }
  else {
    while ($top - $low -gt 1) {
      $middle = [Math]::Floor(($low + $top) / 2)
      if (Test-Loads $high @("--cut", $name, "$middle")) { $low = $middle } else { $top = $middle }
    }
    Write-Output "In $name, the step $($steps[$top - 1]) stops it."
  }
}
Write-Output "Its M:"
& node tools/powerbi/connector.ts $Folder | Out-Null
$full = Get-Content "$Folder/SacmEval/SacmEval.pq" -Raw
$start = $full.IndexOf("`n$name =`n")
if ($start -lt 0) { $start = $full.IndexOf("`n#`"$name`" =`n") }
if ($start -ge 0) { ($full.Substring($start, [Math]::Min(6000, $full.Length - $start)) -split "`n" | Select-Object -First 80) | Write-Output }
exit 1
