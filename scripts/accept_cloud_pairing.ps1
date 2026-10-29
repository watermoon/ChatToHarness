$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $root
try {
  Write-Host '[ChatToHarness] Automatic device pairing acceptance (read-only, no Cloudflare deploy)'
  & node --test tests/cloud-router-autopair.test.cjs tests/cloud-router-pairing.test.cjs tests/cloud-router-oauth.test.cjs tests/cloud-ui-layout.test.cjs
  if ($LASTEXITCODE -ne 0) { throw 'Cloud pairing acceptance tests failed' }
  & npm test
  if ($LASTEXITCODE -ne 0) { throw 'Full regression failed' }
  if ($env:CTH_EXECUTABLE) {
    & npm run smoke:ui
    if ($LASTEXITCODE -ne 0) { throw 'Packaged GUI acceptance failed' }
  } else {
    Write-Host 'GUI smoke skipped: set CTH_EXECUTABLE to a packaged ChatToHarness executable.'
  }
  Write-Host 'PASS: browser approval, owner authentication, device credentials, UI and regression tests.'
}
finally { Pop-Location }
