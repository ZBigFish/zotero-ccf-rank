# Validates the preference pane fragment: well-formedness, unique ids, and that
# every bound preference exists in addon/prefs.js.
[CmdletBinding()]
param([string]$Root = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = "Stop"
$panePath = Join-Path $Root "addon\chrome\content\preferences.xhtml"
$prefsPath = Join-Path $Root "addon\prefs.js"
if (-not (Test-Path -LiteralPath $panePath)) { throw "missing $panePath" }
if (-not (Test-Path -LiteralPath $prefsPath)) { throw "missing $prefsPath" }

$problems = 0
function Report([string]$message) {
  Write-Host "  FAIL $message" -ForegroundColor Red
  $script:problems++
}
function Ok([string]$message) { Write-Host "  ok   $message" -ForegroundColor Green }

# --- well-formedness -------------------------------------------------------
# The fragment uses the `html:` prefix, which Zotero's fragment parser supplies;
# for XML validation it has to be declared, so it is added to a wrapper element.
$fragment = Get-Content -LiteralPath $panePath -Raw
$wrapped = "<root xmlns:html='http://www.w3.org/1999/xhtml'>`n$fragment`n</root>"
try {
  $xml = New-Object System.Xml.XmlDocument
  $xml.XmlResolver = $null
  $xml.LoadXml($wrapped)
  Ok "preferences.xhtml is well-formed XML"
} catch {
  Report "preferences.xhtml is not well-formed: $($_.Exception.Message)"
}

if ($xml) {
  # --- unique ids ----------------------------------------------------------
  $ids = @($xml.SelectNodes("//*[@id]") | ForEach-Object { $_.GetAttribute("id") })
  Write-Host "  ($($ids.Count) elements with an id)"
  $duplicates = $ids | Group-Object | Where-Object { $_.Count -gt 1 }
  if ($duplicates) {
    foreach ($duplicate in $duplicates) { Report "duplicate id '$($duplicate.Name)'" }
  } else {
    Ok "no duplicate ids"
  }

  # --- preference bindings -------------------------------------------------
  $registered = @{}
  foreach ($match in [regex]::Matches((Get-Content -LiteralPath $prefsPath -Raw), 'pref\("__prefsPrefix__\.(\w+)"')) {
    $registered[$match.Groups[1].Value] = $true
  }
  Ok "$($registered.Count) preferences registered in prefs.js"

  $bound = @($xml.SelectNodes("//*[@preference]") | ForEach-Object { $_.GetAttribute("preference") })
  Write-Host "  ($($bound.Count) bound preferences)"
  foreach ($key in $bound) {
    if (-not $key.StartsWith("extensions.zotero.ccfrank.")) {
      Report "binding '$key' must be a full preference key"
      continue
    }
    $short = $key.Substring("extensions.zotero.ccfrank.".Length)
    if (-not $registered.ContainsKey($short)) {
      Report "$key is bound but not registered in prefs.js"
    }
  }
  if ($bound.Count -gt 0) { Ok "every bound preference is registered" }

  # --- localization ids ----------------------------------------------------
  $ftlZh = Get-Content -LiteralPath (Join-Path $Root "addon\locale\zh-CN\addon.ftl") -Raw
  $ftlEn = Get-Content -LiteralPath (Join-Path $Root "addon\locale\en-US\addon.ftl") -Raw
  $l10nIds = @($xml.SelectNodes("//*[@data-l10n-id]") | ForEach-Object { $_.GetAttribute("data-l10n-id") })
  Write-Host "  ($($l10nIds.Count) localized elements)"
  foreach ($id in $l10nIds) {
    if ($ftlZh -notmatch "(?m)^$([regex]::Escape($id)) = ") { Report "$id missing from zh-CN/addon.ftl" }
    if ($ftlEn -notmatch "(?m)^$([regex]::Escape($id)) = ") { Report "$id missing from en-US/addon.ftl" }
  }
  if ($l10nIds.Count -gt 0) { Ok "every data-l10n-id exists in both locales" }
}

Write-Host ""
if ($problems -eq 0) {
  Write-Host "pane check: all good" -ForegroundColor Green
  exit 0
}
Write-Host "pane check: $problems problem(s)" -ForegroundColor Red
exit 1
