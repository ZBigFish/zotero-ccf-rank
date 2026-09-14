#!/usr/bin/env bash
# Extract one version's section from CHANGELOG.md, for `gh release edit`.
#
# Falls back to the Unreleased section, so a release whose version has no entry
# yet still gets notes instead of only the generated contributor block.
#
# Usage: tools/changelog-notes.sh <version-without-leading-v>
set -euo pipefail

version="${1:?usage: changelog-notes.sh <version>}"
file="CHANGELOG.md"

section() {
  # Print the body of "## [<name>]" up to the next "## [" heading.
  sed -n "/^## \[$1\]/,/^## \[/p" "$file" | sed '1d;$d'
}

notes="$(section "$version" | sed '/^[[:space:]]*$/d')"
if [ -z "$notes" ]; then
  notes="$(section "Unreleased" | sed '/^[[:space:]]*$/d')"
fi

printf '%s\n' "$notes"
