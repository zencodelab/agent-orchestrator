#!/usr/bin/env bash
#
# Build the frontend in demo mode and publish it to the `gh-pages` branch,
# which GitHub Pages serves at https://zencodelab.github.io/agent-orchestrator/.
#
# Pushes with the zencodelab gh token (via gh's credential helper), NOT the
# macOS keychain. Requires: `gh auth login` for the zencodelab account.
#
# Usage:  ./scripts/deploy-pages.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="https://github.com/zencodelab/agent-orchestrator.git"
BASE_PATH="/agent-orchestrator/"

echo "==> Building demo bundle (base ${BASE_PATH})"
cd "$REPO_ROOT/frontend"
VITE_BASE="$BASE_PATH" npm run build:demo

echo "==> Assembling gh-pages tree"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp -R "$REPO_ROOT/frontend/dist/." "$TMP/"
touch "$TMP/.nojekyll"   # tell GitHub Pages not to run Jekyll on the build

echo "==> Publishing to gh-pages"
gh auth switch --user zencodelab >/dev/null 2>&1 || true
(
  cd "$TMP"
  git init -q
  git checkout -q -b gh-pages
  git add -A
  git -c user.name="zencodelab" -c user.email="zencodestudio@gmail.com" \
    commit -qm "Deploy demo to GitHub Pages"
  git -c credential.helper='' -c credential.helper='!gh auth git-credential' \
    push -f "$REMOTE" gh-pages
)
gh auth switch --user afsalaazeez >/dev/null 2>&1 || true

echo "==> Done -> https://zencodelab.github.io/agent-orchestrator/"
