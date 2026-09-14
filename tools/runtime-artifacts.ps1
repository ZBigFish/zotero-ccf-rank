# Helpers for tools/runtime-check.ps1.
#
# Builds the probe XPI used by the runtime check plus the `extensions.json`
# entries that make Zotero start it.
#
# The probe XPI is assembled from `build/addon` — the real XPI contents — with
# only `bootstrap.js` replaced by tests/zotero-harness/probe/bootstrap.template.js
# and the probe controller added as `chrome/content/probe.js`. The chrome
# `content` package keeps mapping to `chrome/content/`, so the plugin code under
# test is byte-identical to the shipped artifact.

function Assert-File {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)][string]$Path, [string]$What = "file")
  if ([string]::IsNullOrWhiteSpace($Path)) { throw "$What path is empty" }
  if (-not (Test-Path -LiteralPath $Path)) { throw "$What not found: $Path" }
}

function New-RuntimeCheckArtifacts {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Out
  )

  $buildDir = Join-Path $Root "build\addon"
  Assert-File -Path (Join-Path $buildDir "bootstrap.js") -What "built bootstrap"
  Assert-File -Path (Join-Path $buildDir "chrome\content\preferences.xhtml") -What "pane markup"
  Assert-File -Path (Join-Path $buildDir "chrome\content\prefs-pane.js") -What "pane controller"
  Assert-File -Path (Join-Path $buildDir "chrome\content\scripts\ccfrank.js") -What "bundle"

  if (Test-Path -LiteralPath $Out) { Remove-Item -LiteralPath $Out -Recurse -Force }
  New-Item -ItemType Directory -Path $Out -Force | Out-Null

  $pluginXpi = Join-Path $Root "build\zotero-ccf-rank.xpi"
  Assert-File -Path $pluginXpi -What "plugin XPI"
  Copy-Item -LiteralPath $pluginXpi -Destination (Join-Path $Out "plugin.xpi") -Force

  $probeDir = Join-Path $Out "probe-build"
  New-Item -ItemType Directory -Path $probeDir -Force | Out-Null
  Copy-Item -Path (Join-Path $buildDir "*") -Destination $probeDir -Recurse -Force

  $probeController = Join-Path $Root "tests\zotero-harness\probe\bootstrap.js"
  Assert-File -Path $probeController -What "probe controller"
  Copy-Item -LiteralPath $probeController `
    -Destination (Join-Path $probeDir "chrome\content\probe.js") -Force

  $bootstrapTemplate = Join-Path $Root "tests\zotero-harness\probe\bootstrap.template.js"
  Assert-File -Path $bootstrapTemplate -What "probe bootstrap template"
  Copy-Item -LiteralPath $bootstrapTemplate `
    -Destination (Join-Path $probeDir "bootstrap.js") -Force

  $probeXpi = Join-Path $Out "probe.xpi"
  if (Test-Path -LiteralPath $probeXpi) { Remove-Item -LiteralPath $probeXpi -Force }
  Compress-Archive -Path (Join-Path $probeDir "*") -DestinationPath $probeXpi -Force
  Assert-File -Path $probeXpi -What "probe XPI"

  [pscustomobject]@{
    PluginXpi = Join-Path $Out "plugin.xpi"
    ProbeXpi  = $probeXpi
  }
}

# Reads a plugin XPI's manifest.json without unpacking the whole archive, so a
# vendor entry in `extensions.json` can carry the real id/version/name.
function Get-XpiManifest {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)][string]$XpiPath)

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($XpiPath)
  try {
    $entry = $zip.Entries | Where-Object { $_.FullName -eq "manifest.json" } | Select-Object -First 1
    if (-not $entry) { throw "no manifest.json in $XpiPath" }
    $reader = New-Object System.IO.StreamReader($entry.Open())
    try {
      return ($reader.ReadToEnd() | ConvertFrom-Json)
    } finally {
      $reader.Dispose()
    }
  } finally {
    $zip.Dispose()
  }
}

function New-AddonEntry {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$Id,
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$XpiPath,
    [string]$Description = "",
    [string[]]$Icons = @(),
    [string]$MinVersion = "6.999",
    [string]$MaxVersion = "10.*"
  )

  $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  return [ordered]@{
    id                          = $Id
    syncGUID                    = "{$([guid]::NewGuid())}"
    version                     = $Version
    type                        = "extension"
    loader                      = $null
    updateURL                   = $null
    installOrigins              = $null
    manifestVersion             = 2
    optionsURL                  = $null
    optionsType                 = $null
    optionsBrowserStyle         = $true
    aboutURL                    = $null
    defaultLocale               = [ordered]@{
      name         = $Name
      description  = $Description
      creator      = "local test"
      homepageURL  = $null
      developers   = $null
      translators  = $null
      contributors = $null
    }
    visible                     = $true
    active                      = $true
    userDisabled                = $false
    appDisabled                 = $false
    embedderDisabled            = $false
    installDate                 = $now
    updateDate                  = $now
    applyBackgroundUpdates      = 1
    path                        = $XpiPath
    skinnable                   = $false
    sourceURI                   = $null
    releaseNotesURI             = $null
    softDisabled                = $false
    foreignInstall              = $false
    strictCompatibility         = $true
    locales                     = @()
    targetApplications          = @(
      [ordered]@{
        id         = "zotero@zotero.org"
        minVersion = $MinVersion
        maxVersion = $MaxVersion
      }
    )
    targetPlatforms             = @()
    signedState                 = 0
    signedTypes                 = @()
    signedDate                  = $null
    seen                        = $true
    dependencies                = @()
    incognito                   = "spanning"
    userPermissions             = [ordered]@{ permissions = @(); origins = @(); data_collection = @() }
    optionalPermissions         = [ordered]@{ permissions = @(); origins = @(); data_collection = @() }
    requestedPermissions        = [ordered]@{ permissions = @(); origins = @(); data_collection = @() }
    icons                       = $Icons
    iconURL                     = $null
    blocklistAttentionDismissed = $false
    blocklistState              = 0
    blocklistURL                = $null
    startupData                 = $null
    hidden                      = $false
    installTelemetryInfo        = $null
    recommendationState         = $null
    rootURI                     = ("jar:file:///" + ($XpiPath -replace '\\', '/') + "!/")
    location                    = "app-profile"
  }
}
