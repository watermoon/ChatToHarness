# Production ChatGPT OAuth boundary (not implemented)

The existing `/mcp` endpoint uses a prototype static bearer token. ChatGPT custom remote MCP plugins do **not** accept user-provided static bearer headers. Do not create a public no-auth plugin to bypass this.

## Recommended hosted identity chain

1. Use Cloudflare's `@cloudflare/workers-oauth-provider` **1.x** and a real identity provider (Cloudflare Access or GitHub OAuth). Follow the v1 split authorization-server/resource-server API; do not copy obsolete 0.x examples.
2. Deploy an authorization Worker with `OAUTH_KV`, PKCE S256, CIMD/DCR, consent, token issuance, refresh and revocation.
3. Deploy a resource Worker with authenticated `/mcp`; it validates access tokens against the authorization Worker through a service binding. Require the exact `/mcp` audience and least-privilege scopes. An unauthorized request receives RFC 9728 metadata and a compliant `WWW-Authenticate` challenge.
4. Keep the DeviceHub Durable Object private to the resource Worker; continue to authenticate each device separately with a unique rotating device credential.
5. Enforce operator/device grants at the cloud boundary and original local MCP Manager. Never authorize write/shell/Computer Use solely because an OAuth token is valid.
6. Test ChatGPT login, a second device, identity revocation, offlined target, token refresh, and actual approval/STOP/Esc flows. Leave existing Tunnel plugins in place until this passes.

**Current deployment gate:** no OAuth integration, no Cloudflare account credentials, and no end-to-end ChatGPT connection have been verified.

References:
- https://developers.cloudflare.com/changelog/post/2026-10-01-workers-oauth-provider-1x/
- https://github.com/cloudflare/workers-oauth-provider
- https://developers.openai.com/api/docs/guides/custom-mcp-server
