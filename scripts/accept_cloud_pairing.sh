#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
echo "[ChatToHarness] Automatic device pairing acceptance (read-only, no Cloudflare deploy)"
node --test tests/cloud-router-autopair.test.cjs tests/cloud-router-pairing.test.cjs tests/cloud-router-oauth.test.cjs tests/cloud-ui-layout.test.cjs
npm test
if [[ -n "${CTH_EXECUTABLE:-}" ]]; then
  npm run smoke:ui
else
  echo "GUI smoke skipped: set CTH_EXECUTABLE to a packaged ChatToHarness binary."
fi
echo "PASS: browser approval, owner authentication, device credentials, UI and regression tests."
