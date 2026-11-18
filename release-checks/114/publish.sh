#!/usr/bin/env bash
set -euo pipefail
tag=electimes-v1.0.14
source_sha=34d6968e646e8ef79a21e35160ff4bf7b9b350d7
feed=delivery/electimes-latest.json
repo=Her-far/reporter-office-updates
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git fetch --no-tags origin main
git show FETCH_HEAD:electimes-latest.json > "$RUNNER_TEMP/current.json"
old=$(jq -r .build "$RUNNER_TEMP/current.json")
if [[ $old == 114 ]]; then cmp -s "$RUNNER_TEMP/current.json" "$feed"; exit; fi
test "$old" = 112
# Reuse the original source commit accompanying the tested installers.
git fetch delivery/Office-1.0.14-source.bundle refs/heads/release/electimes-1.0.14
test "$(git rev-parse FETCH_HEAD)" = "$source_sha"
git merge-base --is-ancestor origin/main "$source_sha"
git push origin "$source_sha:refs/heads/release/electimes-1.0.14"
if ! gh release view "$tag" --repo "$repo" >/dev/null 2>&1; then
  gh release create "$tag" --repo "$repo" --draft --target "$source_sha" --title '전기신문 오피스 1.0.14' --notes "$(jq -r '.notes[] | "- " + .' "$feed")" --latest=false
fi
for file in delivery/*.exe delivery/*SHA256SUMS*.txt; do
  name=$(basename "$file")
  existing=$(gh release view "$tag" --repo "$repo" --json assets --jq ".assets[] | select(.name == \"$name\") | .digest")
  if [[ -n "$existing" ]]; then test "$existing" = "sha256:$(sha256sum "$file" | cut -d' ' -f1)"
  else gh release upload "$tag" "$file" --repo "$repo"; fi
done
gh release edit "$tag" --repo "$repo" --draft=false --latest=false
for key in installer fullInstaller; do
  url=$(jq -r ".$key.url" "$feed")
  curl -fsSL --retry 4 "$url" -o "$RUNNER_TEMP/fetched.exe"
  test "$(stat -c %s "$RUNNER_TEMP/fetched.exe")" = "$(jq -r ".$key.size" "$feed")"
  printf '%s  %s\n' "$(jq -r ".$key.sha256" "$feed")" "$RUNNER_TEMP/fetched.exe" | sha256sum --check
done
git checkout --detach "$source_sha"
cp "$feed" electimes-latest.json
git add electimes-latest.json
git commit -m 'release: serve Electimes Office 1.0.14 cumulative automatic update'
git push origin HEAD:main
