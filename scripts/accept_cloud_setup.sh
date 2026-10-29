#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
echo "[ChatToHarness] Cloud setup acceptance (no remote mutations)"
node --test tests/cloudflare-discovery.test.cjs tests/cloud-bootstrap.test.cjs tests/cloud-ui-layout.test.cjs tests/i18n.test.cjs
npm test
(cd cloud-router && npm run check)
if [[ -n "${CTH_EXECUTABLE:-}" ]]; then
  npm run smoke:ui
else
  echo "GUI smoke optional: set CTH_EXECUTABLE to a packaged ChatToHarness executable."
fi
echo "PASS: cloud setup + full regression + Worker dry-run"
