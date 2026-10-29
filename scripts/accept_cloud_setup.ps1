$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $root
try {
  & node --test tests/cloudflare-discovery.test.cjs tests/cloud-bootstrap.test.cjs tests/cloud-ui-layout.test.cjs tests/i18n.test.cjs
  if ($LASTEXITCODE -ne 0) { throw 'Cloud setup tests failed' }
  & npm test
  if ($LASTEXITCODE -ne 0) { throw 'Full regression failed' }
  Push-Location (Join-Path $root 'cloud-router')
  try { & npm run check; if ($LASTEXITCODE -ne 0) { throw 'Wrangler dry-run failed' } }
  finally { Pop-Location }
  if ($env:CTH_EXECUTABLE) {
    & npm run smoke:ui
    if ($LASTEXITCODE -ne 0) { throw 'Packaged GUI smoke failed' }
  }
  Write-Host 'PASS: cloud setup + full regression + Worker dry-run'
} finally { Pop-Location }
