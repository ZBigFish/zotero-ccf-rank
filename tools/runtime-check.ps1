# Runtime verification of the built plugin inside a real Zotero.
#
# Zotero 9 does not scan the profile `extensions` folder for new sideloads, so
# the plugins are registered the way Zotero itself does it: a throwaway profile
# is created that already contains the built XPI *and* a small harness extension
# (tests/zotero-harness/harness.js), plus a matching `extensions.json`.
#
# The harness waits for the main window and for the plugin to start, evaluates
# tests/zotero-harness/check.js in it, writes the report and quits Zotero. The
# plugin XPI stays byte-identical to the released build.
#
# Nothing here touches the installed Zotero, the real profile or the real XPI.
param(
  [string]$ZoteroRoot = "D:\Zotero",
  [string]$WorkDir = "$env:TEMP\ccfrank-runtime-check",
  [switch]$SkipBuild,
  [switch]$Keep,
  [int]$TimeoutSeconds = 420,
  # A brand-new profile needs one startup to create its database before Zotero
  # starts the extensions, so the check runs twice by default.
  [int]$Runs = 2,
  # Directory of vendor XPIs to install next to the probe. Used to check that the
  # plugin still works when other plugins are present.
  [string]$ExtraExtensions = "",
  # Skip the preference-pane checks (that step wedges the probe).
  [switch]$SkipPane
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$zoteroExe = Join-Path $ZoteroRoot "zotero.exe"
if (-not (Test-Path -LiteralPath $zoteroExe)) {
  throw "Zotero executable not found: $zoteroExe"
}

if (-not $SkipBuild) {
  Write-Host "==> building the plugin" -ForegroundColor Cyan
  Push-Location $root
  try {
    & corepack pnpm run build
    if ($LASTEXITCODE -ne 0) { throw "build failed" }
  } finally {
    Pop-Location
  }
}

. (Join-Path $PSScriptRoot "runtime-artifacts.ps1")

Write-Host "==> preparing $WorkDir" -ForegroundColor Cyan
$profile = Join-Path $WorkDir "profile"
$data = Join-Path $WorkDir "data"
$report = Join-Path $WorkDir "report.txt"
$extensionsDir = Join-Path $profile "extensions"
if (Test-Path -LiteralPath $WorkDir) { Remove-Item -LiteralPath $WorkDir -Recurse -Force }
New-Item -ItemType Directory -Path $data, $extensionsDir -Force | Out-Null

$artifacts = New-RuntimeCheckArtifacts -Root $root -Out (Join-Path $WorkDir "artifacts")

# Only the probe is installed: it carries the plugin files itself and starts
# them, so the artifact under test is exactly build/addon.
# The probe carries the plugin's own manifest (it is built from build/addon), so
# it registers under the plugin's id; Zotero deletes an XPI whose manifest id
# does not match its database entry.
$probeId = "ccfrank@timetrapzz.site"
$probePath = Join-Path $extensionsDir "$probeId.xpi"
Copy-Item -LiteralPath $artifacts.ProbeXpi -Destination $probePath -Force

$db = [ordered]@{
  schemaVersion = 37
  addons        = @(
    (New-AddonEntry -Id $probeId -Version "1.0.0" -Name "CCF Rank runtime probe" `
      -Description "runtime check probe" -XpiPath $probePath)
  )
}

if ($ExtraExtensions) {
  if (-not (Test-Path -LiteralPath $ExtraExtensions)) {
    throw "extra extensions directory not found: $ExtraExtensions"
  }
  foreach ($xpi in Get-ChildItem -LiteralPath $ExtraExtensions -File -Filter "*.xpi") {
    $manifest = Get-XpiManifest -XpiPath $xpi.FullName
    $app = $manifest.applications.zotero
    if (-not $app -or -not $app.id) {
      Write-Host "==> skipping $($xpi.Name): not a Zotero plugin" -ForegroundColor Yellow
      continue
    }
    $target = Join-Path $extensionsDir "$($app.id).xpi"
    Copy-Item -LiteralPath $xpi.FullName -Destination $target -Force
    $db.addons += (New-AddonEntry -Id $app.id -Version $manifest.version `
      -Name $manifest.name -Description $manifest.description -XpiPath $target `
      -MinVersion $(if ($app.strict_min_version) { $app.strict_min_version } else { "6.999" }) `
      -MaxVersion $(if ($app.strict_max_version) { $app.strict_max_version } else { "10.*" }))
    Write-Host "==> installing vendor plugin $($app.id) $($manifest.version)" -ForegroundColor Cyan
  }
}

$db | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $profile "extensions.json") -Encoding utf8

Set-Content -LiteralPath (Join-Path $profile "user.js") -Encoding utf8 -Value @"
user_pref("extensions.autoDisableScopes", 0);
user_pref("extensions.enabledScopes", 15);
user_pref("xpinstall.signatures.required", false);
user_pref("extensions.langpacks.signatures.required", false);
user_pref("extensions.zotero.debug.log", true);
user_pref("extensions.zotero.debug.level", 5);
"@

$dataEscaped = $data -replace '\\', '\\'
Set-Content -LiteralPath (Join-Path $profile "prefs.js") -Encoding utf8 -Value @"
// Throwaway profile for the CCF Rank runtime check.
user_pref("extensions.zotero.dataDir", "$dataEscaped");
user_pref("extensions.zotero.firstRun2", true);
user_pref("extensions.zotero.firstRunGuidanceShown", true);
user_pref("extensions.zotero.httpServer.enabled", false);
user_pref("app.update.enabled", false);
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("datareporting.policy.dataSubmissionEnabled", false);
user_pref("toolkit.telemetry.enabled", false);
user_pref("identity.fxaccounts.enabled", false);
"@

# Each run writes its own file: the probe rewrites the whole file after every
# line, so reusing one path would let a slow run look finished.
$env:CCFRANK_PROBE_NO_PANE = $(if ($SkipPane) { "1" } else { "0" })
$env:CCFRANK_PROBE_REPORT = $report


$consoleLog = Join-Path $WorkDir "console.log"
$consoleErr = Join-Path $WorkDir "console.err"

for ($run = 1; $run -le $Runs; $run++) {
  if (Test-Path -LiteralPath $report) {
    $existing = Get-Content -LiteralPath $report -Raw
    if ($existing -match "done ok") { break }
  }
  Write-Host "==> starting Zotero (run $run/$Runs)" -ForegroundColor Cyan
  $runLog = if ($run -eq 1) { $consoleLog } else { Join-Path $WorkDir "console$run.log" }
  $runErr = if ($run -eq 1) { $consoleErr } else { Join-Path $WorkDir "console$run.err" }
  $runReport = Join-Path $WorkDir "report$run.txt"
  $env:CCFRANK_PROBE_REPORT = $runReport
  $proc = Start-Process -FilePath $zoteroExe `
    -ArgumentList @(
      "-profile", "`"$profile`"",
      "-datadir", "`"$data`"",
      "-no-remote",
      "-ZoteroDebugText"
    ) `
    -RedirectStandardOutput $runLog `
    -RedirectStandardError $runErr `
    -PassThru

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path -LiteralPath $runReport) {
      $text = Get-Content -LiteralPath $runReport -Raw
      if ($text -match "done ok") { break }
    }
    if ($proc.HasExited) { break }
    Start-Sleep -Seconds 2
  }

  Get-Process -Name zotero -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
}

Write-Host ""
$candidate = Get-ChildItem $WorkDir -Filter "report*.txt" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if ($candidate) { $report = $candidate.FullName }
if (Test-Path -LiteralPath $report) {
  $text = Get-Content -LiteralPath $report -Raw
  Write-Host "===== report ($($report | Split-Path -Leaf)) =====" -ForegroundColor Green
  Write-Host $text
  $failures = ([regex]::Matches($text, "(?m)^(check )?FAIL ")).Count
  # A truncated report means the probe never reached its end, which is a failure
  # even though no assertion failed.
  $incomplete = $text -notmatch "probe\.done ok"
  if ($incomplete) {
    $last = ($text.Trim() -split "\r?\n" | Select-Object -Last 1)
    Write-Host "===== INCOMPLETE: the probe stopped after '$last' =====" -ForegroundColor Red
  }
  Write-Host "===== $failures failed assertion(s) =====" -ForegroundColor $(if ($failures -eq 0 -and -not $incomplete) { "Green" } else { "Red" })
  if ($incomplete) { exit 1 }
} else {
  Write-Host "===== no report produced =====" -ForegroundColor Red
  foreach ($file in @($consoleLog, $consoleErr)) {
    if (Test-Path -LiteralPath $file) {
      Write-Host "----- $file -----" -ForegroundColor Yellow
      Select-String -LiteralPath $file -Pattern "ccfrank|probe|harness|addon|startup" |
        Select-Object -First 30 |
        ForEach-Object { Write-Host $_.Line.Substring(0, [Math]::Min(220, $_.Line.Length)) }
    }
  }
}

if (-not $Keep) {
  Remove-Item -LiteralPath $WorkDir -Recurse -Force -ErrorAction SilentlyContinue
} else {
  Write-Host "kept $WorkDir"
}
