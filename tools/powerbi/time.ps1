# The refresh time of the Power BI report at the size of the real reports (plan of the speed build §5.3, D283), on
# invented data only (tools/powerbi/scaled.ts). For each size it builds the test connector with the probes
# (tools/powerbi/probes.ts), runs each probe as its own PQTest call (as Power BI evaluates each table on its own), with a
# time cap, and subtracts the time of the empty probe. Then the counts at that size are compared with src/core
# (tools/powerbi/parity.ts --real-size). It writes a Markdown table to the job summary and the log.
#   T1: the sum of the tables (Time.<Table>) at the largest size. With -Gate the script fails when T1 is over -Budget
#   seconds, a table over -TableBudget seconds, a probe over its cap or failed, or the counts differ from src/core.
#   pwsh tools/powerbi/time.ps1 -Sizes 42,85,170 -Stages -Cap 240
#   pwsh tools/powerbi/time.ps1 -Sizes 170 -Cap 90 -Gate
#   -Only <regular expression>: only the probes whose name matches (by hand, to time a few stages quickly).
param(
  [string]$Sizes = "170",
  [int]$History = 0,
  [switch]$Stages,
  [int]$Cap = 240,
  [switch]$Gate,
  [int]$Budget = 120,
  [int]$TableBudget = 60,
  [string]$Only = "",
  [string]$PQTest = ".build/pqsdk/tools/PQTest.exe"
)
$ErrorActionPreference = "Stop"
$sizeList = @($Sizes -split "[,; ]+" | Where-Object { $_ -ne "" } | ForEach-Object { [int]$_ } | Sort-Object)
$problems = New-Object System.Collections.Generic.List[string]
$times = @{}      # "<probe>|<size>" -> net seconds, or -1 over the cap, or -2 failed
$rowsOf = @{}     # "<probe>|<size>" -> "rows / cells"
$kinds = [ordered]@{}

function Write-Both([string]$text) {
  Write-Output $text
  if ($env:GITHUB_STEP_SUMMARY) { Add-Content -Path $env:GITHUB_STEP_SUMMARY -Value $text -Encoding utf8 }
}

# One PQTest run-test, stopped after $Cap seconds. Returns [seconds, status, output file].
function Invoke-Probe([string]$mez, [string]$query, [string]$out) {
  $watch = [System.Diagnostics.Stopwatch]::StartNew()
  $process = Start-Process -FilePath $PQTest -ArgumentList @("run-test", "-e", $mez, "-q", $query, "-p") -RedirectStandardOutput $out -NoNewWindow -PassThru
  $null = $process.Handle
  if (-not $process.WaitForExit($Cap * 1000)) {
    try { $process.Kill($true) } catch { }
    return @($watch.Elapsed.TotalSeconds, "cap", $out)
  }
  $process.WaitForExit()
  $seconds = $watch.Elapsed.TotalSeconds
  $status = if (Select-String -Path $out -Pattern '"Status": *"Passed"' -Quiet) { "passed" } else { "failed" }
  return @($seconds, $status, $out)
}

function Set-Credential([string]$mez, [string]$query) {
  & $PQTest credential-template -e $mez -q $query -p -ak Anonymous | & $PQTest set-credential -e $mez -q $query -p | Out-Null
}

foreach ($size in $sizeList) {
  $folder = ".build/powerbi-time-$size"
  $arguments = @("tools/powerbi/connector.ts", $folder, "--real-size", "--copies", "$size", "--history", "$History")
  if ($Stages) { $arguments += "--stages" }
  & node @arguments
  if ($LASTEXITCODE -ne 0) { throw "connector.ts failed" }
  Compress-Archive -Path "$folder/SacmEval/SacmEval.pq" -DestinationPath "$folder/SacmEval.zip" -Force
  Move-Item "$folder/SacmEval.zip" "$folder/SacmEval.mez" -Force
  $mez = "$folder/SacmEval.mez"
  New-Item -ItemType Directory -Force "$folder/results" | Out-Null
  $probes = Get-Content "$folder/probes.json" -Raw | ConvertFrom-Json
  foreach ($probe in $probes) { $kinds[$probe.name] = $probe.kind }
  # The name of the query is not part of the data source path (connector.ts), so one credential serves every probe.
  Set-Credential $mez "$folder/queries/Time.Empty.pq"

  $empty = [double]::MaxValue
  foreach ($attempt in 1..2) {
    $result = Invoke-Probe $mez "$folder/queries/Time.Empty.pq" "$folder/results/Time.Empty.json"
    if ($result[1] -eq "passed") { $empty = [Math]::Min($empty, $result[0]) }
  }
  if ($empty -eq [double]::MaxValue) {
    Get-Content "$folder/results/Time.Empty.json" -TotalCount 40 | Write-Output
    if (Select-String -Path "$folder/results/Time.Empty.json" -Pattern "SacmEval.Contents' wasn't recognized" -Quiet) { ./tools/powerbi/load-check.ps1 -PQTest $PQTest }
    throw "The empty probe failed at $size copies"
  }
  Write-Output ("{0} copies: the empty probe (start of PQTest) takes {1:N1} s" -f $size, $empty)

  foreach ($probe in $probes) {
    if ($probe.kind -eq "empty") { continue }
    if ($Only -ne "" -and $probe.name -notmatch $Only) { continue }
    $query = "$folder/queries/$($probe.name).pq"
    $out = "$folder/results/$($probe.name).json"
    $result = Invoke-Probe $mez $query $out
    # A credential that the store did not keep for this query: set it for the query and run it again.
    if ($result[1] -eq "failed" -and (Select-String -Path $out -Pattern 'redential' -Quiet)) { Set-Credential $mez $query; $result = Invoke-Probe $mez $query $out }
    $key = "$($probe.name)|$size"
    if ($result[1] -eq "cap") {
      $times[$key] = -1
      $problems.Add("$($probe.name) at $size copies: over the cap of $Cap s")
    } elseif ($result[1] -eq "failed") {
      $times[$key] = -2
      $problems.Add("$($probe.name) at $size copies: the query failed")
      Get-Content $out -TotalCount 40 | Write-Output
    } else {
      $times[$key] = [Math]::Max(0, $result[0] - $empty)
      if ($probe.kind -ne "summary") {
        $json = Get-Content $out -Raw | ConvertFrom-Json
        $run = if ($json -is [array]) { $json[0] } else { $json }
        $line = @($run.Output)[0]
        $rowsOf[$key] = "$($line.Rows) / $($line.Cells)"
      }
    }
    $shown = if ($times[$key] -eq -1) { "> $Cap s" } elseif ($times[$key] -eq -2) { "FAILED" } else { "{0:N1} s" -f $times[$key] }
    Write-Output ("{0} copies: {1}: {2} ({3})" -f $size, $probe.name, $shown, $rowsOf[$key])
  }

  # The counts at this size against src/core.
  if ($times["RealSize.Summary|$size"] -ge 0) {
    & node tools/powerbi/parity.ts --real-size "$folder/results" --copies "$size" --history "$History"
    if ($LASTEXITCODE -ne 0) { $problems.Add("At $size copies the counts differ from src/core (parity.ts --real-size)") }
  }
}

# The summary: one row per probe, one column per size, the growth per doubling of the data.
$largest = $sizeList[-1]
$show = {
  param($value)
  if ($null -eq $value) { "" } elseif ($value -eq -1) { "> $Cap" } elseif ($value -eq -2) { "failed" } else { "{0:N1}" -f $value }
}
Write-Both ""
Write-Both "### Refresh time at real size (invented data: $(($sizeList | ForEach-Object { "$_ copies" }) -join ', '); history $History)"
Write-Both ""
$header = "| Probe | Kind | " + (($sizeList | ForEach-Object { "$_ copies (s)" }) -join " | ") + " | Rows / cells at $largest | Growth per doubling |"
Write-Both $header
Write-Both ("|---|---|" + ("---|" * $sizeList.Count) + "---|---|")
$total = 0.0
$fast = $true
foreach ($name in $kinds.Keys) {
  if ($kinds[$name] -eq "empty") { continue }
  $cells = @($sizeList | ForEach-Object { & $show $times["$name|$_"] })
  $growth = ""
  if ($sizeList.Count -ge 2) {
    $a = $times["$name|$($sizeList[-2])"]
    $b = $times["$name|$largest"]
    if ($null -ne $a -and $null -ne $b -and $a -gt 0.5 -and $b -gt 2) {
      $factor = [Math]::Pow($b / $a, [Math]::Log(2) / [Math]::Log($largest / $sizeList[-2]))
      $growth = "{0:N2}" -f $factor
      if ($factor -gt 2.5) { $growth += " (grows faster than the data)"; if ($kinds[$name] -eq "table") { $fast = $false } }
    }
  }
  Write-Both ("| {0} | {1} | {2} | {3} | {4} |" -f $name, $kinds[$name], ($cells -join " | "), $rowsOf["$name|$largest"], $growth)
  $value = $times["$name|$largest"]
  if ($kinds[$name] -eq "table" -and $null -ne $value) {
    if ($value -lt 0) { $total = [double]::PositiveInfinity } else { $total += $value }
    # A failed or stopped probe already has its own line (above); here only a table that took too long.
    if ($value -gt $TableBudget) { $problems.Add("$name at $largest copies: over the budget of $TableBudget s for one table") }
  }
}
Write-Both ""
$t1 = if ([double]::IsInfinity($total)) { "over the cap" } else { "{0:N1} s" -f $total }
Write-Both "**T1 (the sum of the tables at $largest copies): $t1.** Budget $Budget s, aim 60 s, no table over $TableBudget s."
if (-not $fast) { Write-Both "A table grows faster than the data." }
if ($total -gt $Budget) { $problems.Add("T1 is $t1, over the budget of $Budget s") }
foreach ($problem in $problems) { Write-Both "- $problem" }
if ($Gate -and $problems.Count -gt 0) { Write-Output "The refresh budget is not met."; exit 1 }
exit 0
