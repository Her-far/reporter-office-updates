# Cumulative update for the unchanged 1.0.12 application

The first 1.0.12 update accepted only build 111. Older clients therefore selected
the 286.3 MiB full installer. Simply lowering minBuild would be unsafe: that
patch omitted the earlier document-engine and panel fixes and rejected old bases.

This package takes the union of changed or new files against every published
1.0.6–1.0.11 full installer. Inputs are pinned by size and SHA-256 in releases.json.
Every payload byte comes from the existing, tested 1.0.12 full installer. The
application version and application code do not change. Unchanged runtime and
third-party source archives are not transferred again.

The candidate is limited to 60 MiB. Checks cover original client feed selection,
real Windows installation from all six versions, equality to the full 1.0.12
payload, normal startup, preserving user files and OAuth migration backups,
idempotent application, and rejecting unsupported or newer versions.

The full installer and the original 1.0.11-only patch remain immutable release
assets. Publication adds a distinctly named cumulative asset and switches the
existing version-112 feed only after validation. Clients before 1.0.6 retain the
full-install fallback. Future patches must compare every advertised supported
base, not only the immediately preceding release.
