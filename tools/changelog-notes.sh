#!/usr/bin/env bash
# Extract one version's section from a changelog, for `gh release edit`.
#
# Falls back to the Unreleased section, so a release whose version has no entry
# yet still gets notes instead of only the generated contributor block. A version
# with no entry and an empty Unreleased section legitimately produces nothing;
# the caller treats empty output as "leave the release as it is".
#
# Usage: tools/changelog-notes.sh <version-without-leading-v> [changelog]
set -euo pipefail

version="${1:?usage: changelog-notes.sh <version> [changelog]}"
file="${2:-CHANGELOG.md}"

section() {
  # Print the body of "## [<name>]" up to the next "## [" heading.
  sed -n "/^## \[$1\]/,/^## \[/p" "$file" | sed '1d;$d'
}

notes="$(section "$version" | sed '/^[[:space:]]*$/d')"
if [ -z "$notes" ]; then
  notes="$(section "Unreleased" | sed '/^[[:space:]]*$/d')"
fi

printf '%s\n' "$notes"
