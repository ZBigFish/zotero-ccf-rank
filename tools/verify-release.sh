#!/usr/bin/env bash
# Verify the auto-update chain the way Zotero walks it:
#   fixed manifest URL -> update.json -> update_link -> XPI -> update_hash
#
# Worth running after a release: if the manifest and the published XPI disagree,
# Zotero refuses the update and the user simply never sees it.
#
# Note on the hash encoding: the scaffold writes `sha512:<hex>`, not base64 as
# Mozilla's schema examples show. Comparing against base64 makes a correct
# release look broken — that mistake cost an hour once, hence this comment.
#
# Usage: tools/verify-release.sh <owner/repo>
set -euo pipefail

repo="${1:?usage: verify-release.sh <owner/repo>}"
owner="${repo%%/*}"
name="${repo##*/}"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

manifest_url="https://github.com/${repo}/releases/download/release/update.json"
echo "manifest: ${manifest_url}"
curl -fsSL "$manifest_url" -o "$work/update.json"

version="$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' "$work/update.json" | head -1)"
link="$(sed -n 's/.*"update_link": "\([^"]*\)".*/\1/p' "$work/update.json" | head -1)"
declared="$(sed -n 's/.*"update_hash": "sha512:\([^"]*\)".*/\1/p' "$work/update.json" | head -1)"

if [ -z "$version" ] || [ -z "$link" ]; then
  echo "BROKEN: the manifest has no version/update_link" >&2
  exit 1
fi
echo "version:  $version"
echo "link:     $link"

curl -fsSL "$link" -o "$work/plugin.xpi"
actual="$(openssl dgst -sha512 "$work/plugin.xpi" | awk '{print $NF}')"

if [ -z "$declared" ]; then
  echo "note: the manifest declares no hash (Zotero installs without checking)"
else
  echo "hash declared: ${declared:0:32}..."
  echo "hash actual:   ${actual:0:32}..."
  if [ "$declared" != "$actual" ]; then
    echo "MISMATCH: Zotero would reject this update" >&2
    exit 1
  fi
  echo "OK: the manifest describes exactly the published XPI"
fi

# The link the plugin is built with must match the release actually published.
if [ "$link" != "https://github.com/${repo}/releases/download/v${version}/${name}.xpi" ]; then
  echo "WARNING: update_link does not follow the expected pattern" >&2
fi

# And the manifest must be reachable at the fixed URL baked into the plugin.
if curl -fsSL -o /dev/null "$manifest_url"; then
  echo "OK: the fixed manifest URL resolves (${owner}/${name}@release)"
else
  echo "BROKEN: ${manifest_url}" >&2
  exit 1
fi

echo "xpi size: $(wc -c < "$work/plugin.xpi") bytes"
echo "ALL GOOD"
