# P3 — OAuth 2.1 for ChatToHarness Cloud Router

**Code and local verification are in place. Not production deployed.** Keep the existing three Secure MCP Tunnels in service until a real ChatGPT authorization and multi-device E2E acceptance passes.

## Architecture

- `chattoharness-auth`: Cloudflare Workers OAuth Provider **1.2.4**, GitHub OAuth login, explicit consent, PKCE S256 + CIMD/DCR client handling, KV-backed OAuth codes/grants/tokens.
- `chattoharness-cloud-router`: resource Worker; the **only** public MCP URL is `https://<mcp-domain>/mcp`. `OAuthResourceServer` verifies token audience, scope and expiration through a private `AUTH_SERVER.validateToken` service binding. A second check verifies the GitHub user ID against the allowed IDs and authenticated subject.
- Device connections to `wss://<mcp-domain>/agent` use *separate unique device tokens*, unaffected by OAuth. Those tokens are not MCP bearer credentials and never grant end-user access.
- The internal `authorizedWorker` dispatcher has **no public Worker default entry**. Unauthenticated calls cannot reach tools, and the old static `MCP_BEARER_TOKEN` approach has been removed from the deployed Worker.
- Device operations remain capped at read-only `get_harness_status` both in the Worker allowlist and local Agent. Writing, terminal and Computer Use are not remotely enabled.

## Deployment prerequisites

1. Own a Cloudflare account and two HTTPS custom hostnames, e.g. `auth.your-domain` and `mcp.your-domain`. Set them identically across both Workers' `OAUTH_ISSUER` and `MCP_RESOURCE_URL` variables. **Do not use the example.invalid defaults.** Both Workers have `workers_dev = false`: a custom domain/route needs explicit configuration before deployment.
2. Create `OAUTH_KV` with Wrangler, copy its actual namespace ID into `auth-server/wrangler.toml`. Keep the `global_fetch_strictly_public` flag for CIMD document fetching.
3. Create a GitHub **OAuth App**. Configure its Authorization Callback URL to `https://<auth-domain>/callback`. Set `GITHUB_CLIENT_ID` on the auth Worker, and write the client secret with `wrangler secret put GITHUB_CLIENT_SECRET -c auth-server/wrangler.toml`. Never commit the secret or put it in an issue/ChatGPT conversation.
4. Determine the *numeric GitHub user ID* of each authorized operator. Configure `GITHUB_ALLOWED_USER_IDS` (comma-delimited) **identically on both Workers**. Empty allowlists reject everybody; arbitrary authenticated GitHub users are not permitted.
5. Provision a distinct device token (minimum 24 unpredictable characters) for every local ChatToHarness installation. Save `DEVICE_TOKENS` as a Cloudflare secret in the resource Worker, mapping device IDs to their tokens. Do not reuse the GitHub OAuth secret.
6. Deploy the auth Worker first, then the resource Worker so the Service Binding can resolve `chattoharness-auth`. Test metadata and login before switching any device over.

## Verification

Run `npm ci` inside `cloud-router/` and `npm run check` for both Worker dry-runs; run repository `npm test`. Local Workerd can use *loopback-only* HTTP resource URLs through `--var MCP_RESOURCE_URL:http://127.0.0.1:<port>/mcp`, but production HTTP hosts are rejected.

HTTP smoke tests, using the **real configured domain**:

- `GET https://<auth-domain>/.well-known/oauth-authorization-server`: discovery includes `authorization_endpoint`, `token_endpoint`, `registration_endpoint`, `code_challenge_methods_supported` containing `S256`, and CIMD support.
- `GET https://<mcp-domain>/.well-known/oauth-protected-resource/mcp`: RFC 9728 metadata advertises issuer and `mcp:read`.
- Unauthenticated `POST https://<mcp-domain>/mcp`: **401**, including `WWW-Authenticate` with `resource_metadata`. **Do not accept a 404 or a 200 here**.
- ChatGPT custom MCP connection: choose **OAuth / CIMD** (DCR available as fallback), authorize via the GitHub login and consent page; verify `list_devices` and `get_harness_status` on the explicitly selected device. Incorrect subject, missing scope, expired token, wrong audience, and revoked grants must be rejected.
- Verify an offline device does not silently fail over. Any ambiguous execution state does not auto-retry; local Computer Use permissions, STOP/Esc, and app approvals remain independent.

## Current acceptance boundary

- Local Workerd produced `401 Unauthorized` with a Bearer challenge for an unauthenticated MCP call, and RFC 9728 protected resource metadata returned HTTP 200.
- Local auth Worker produced RFC 8414 metadata, while `/authorize` without OAuth parameters was rejected.
- **Not tested:** actual GitHub OAuth callback and consent-cookie flow, real token exchange, token refresh/revocation, remote Cloudflare deployment, a genuine ChatGPT client, or two physical devices.
- GitHub OAuth authentication only identifies an allowed human. It does not authorize a particular device or file operation; those are governed by additional router and local permission checks. This release deliberately exposes only read-only health/status.

Official APIs: https://github.com/cloudflare/workers-oauth-provider/tree/main/examples/split-workers and https://developers.openai.com/plugins/build/auth
