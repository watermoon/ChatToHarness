# Cloudflare Access + OAuth 2.1

This branch no longer needs a GitHub OAuth App or a GitHub sign-in. The human authorizes the single ChatGPT MCP connector through **Cloudflare Access**; devices authenticate separately using an automatically issued device secret after one-time pairing.

## Identity flow

1. Configure one HTTPS OAuth authorization Worker (`chattoharness-auth`) and one HTTPS resource Worker (`chattoharness-cloud-router`).
2. Set up Cloudflare Zero Trust with an **Access application scoped to the authorization worker's `/authorize` path only**. Choose "Cloudflare account" membership as the IdP and restrict the policy to the intended member(s).
3. Cloudflare supplies verified `ctx.access.getIdentity()` to the authorization Worker. The Worker also enforces `ACCESS_ALLOWED_EMAILS` (case-insensitive exact match; empty denies everyone).
4. The authorization Worker uses `@cloudflare/workers-oauth-provider` 1.x for consent, PKCE S256, CIMD/DCR, access tokens and revocation. Discovery, `/oauth/token` and registration must **not** be Access-protected, as non-browser clients need them.
5. The MCP resource Worker validates bearer tokens against the auth Worker using Service Binding and re-checks the subject/email allowlist. **No plain GitHub, Cloudflare, or ChatGPT browser session is trusted by the resource endpoint.**
6. A ChatGPT user runs `create_pairing_code` from the authenticated MCP connector, then pastes the one-use code into the new desktop pairing panel. Device token is encrypted with OS `safeStorage` and reused on restart.

## Cloudflare configuration needed before deployment

- Set `OAUTH_ISSUER` and `MCP_RESOURCE_URL` to real matching HTTPS domain URLs in **both** wrangler files.
- Create OAuth KV and configure `auth-server/wrangler.toml` with its namespace ID.
- Configure `ACCESS_ALLOWED_EMAILS` to the intended authorized account email(s) in **both** workers. Never use a wildcard or leave empty expecting users to pass.
- Restrict Cloudflare Access to the authorization `/authorize` path. Do **not** enable Worker-wide Access for the auth or MCP Worker, or you will block OAuth clients and device WebSockets.
- Deploy the auth Worker first; then deploy the resource Worker with an `AUTH_SERVER` Service Binding.
- In ChatGPT, install **one** OAuth-protected remote MCP connector at `https://<mcp-host>/mcp`; confirm 401 challenge + `WWW-Authenticate` and metadata, then complete the Access login/consent.
- Device operations currently remain limited to `get_harness_status` with empty arguments. Shell, file editing, Git writes and Computer Use are not yet permitted through the cloud route.

## Verification limitations

Local unit tests and Wrangler dry-run do not prove online Cloudflare Access identity, OAuth token exchange, real WebSockets, or ChatGPT app authorization. Such checks require the actual Cloudflare account/domain, and should be completed in a separate deployment acceptance report. Keep all three existing Secure MCP Tunnel plugins until this passes.

Details of pairing: [PAIRING.md](PAIRING.md).
