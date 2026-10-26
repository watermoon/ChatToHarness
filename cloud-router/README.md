# ChatToHarness Multi-Device Cloud Router

Current development stage: **P3 OAuth 2.1 implementation and local Workerd tests**. Not deployed to a public domain and not connected to a real ChatGPT plugin. The existing independent Secure MCP Tunnels remain available.

## Architecture

- `chattoharness-auth`: Cloudflare Worker using `@cloudflare/workers-oauth-provider` 1.2.4, GitHub OAuth sign-in, explicit consent, PKCE S256, CIMD / DCR client registration, KV-backed OAuth grants.
- `chattoharness-cloud-router`: Cloudflare Worker with `OAuthResourceServer`, a private auth Worker Service Binding and Durable Object WebSockets for multiple device agents.
- `GET /health`: non-sensitive health endpoint.
- `POST /mcp`: OAuth-protected MCP JSON-RPC calls. Unauthenticated requests receive 401 and `WWW-Authenticate` metadata.
- `GET /.well-known/oauth-protected-resource/mcp`: OAuth protected-resource metadata.
- `wss://<mcp-host>/agent`: device agent socket, separately authenticated using a distinct per-device secret.
- `list_devices`: online, authenticated devices.
- `call_device_tool`: explicit device routing; no automatic failover on missing/unknown execution.

Only `get_harness_status` with empty arguments is remotely allowed in P3. The desktop bridge is disabled by default; local shell, file editing, Git writes and Computer Use remain blocked. The old hard-coded bearer prototype is **not** a public MCP entrypoint.

## Setup and security

See **[P3-OAUTH.md](P3-OAUTH.md)**. It documents the two Worker deployments, GitHub OAuth App callback, KV namespace, allowed GitHub numeric IDs, protected resource URL, secrets and ChatGPT client testing. The checked-in example.invalid hostnames and empty user allowlists cannot serve real users.

Never commit GitHub OAuth client secrets, device tokens, bearer tokens, or `.dev.vars` files.

## Tests

From repository root:

```sh
npm test
```

From `cloud-router/`:

```sh
npm ci
npm run check
```

`npm run check` dry-runs **both** Worker builds. It does not deploy to Cloudflare. The new P3 tests also cover exact GitHub ID allowlisting, audience/issuer URL validation, invalid identity, and HTML escaping.

Local Workerd acceptance (using localhost override to avoid requiring a real domain) verified RFC 8414 discovery, PKCE S256, CIMD, DCR registration, consent page, browser-bound consent cookie, rejection without consent cookie, and resource-server 401 / RFC 9728 metadata.

## Remaining deployment gates

- Supply real Cloudflare account, custom domains, KV ID, GitHub OAuth App client ID/secret, allowlisted user IDs, and individual device credentials.
- Deploy the two Workers, then verify real GitHub sign-in, token exchange, refresh/revocation and ChatGPT connection.
- Run simultaneous macOS and Windows end-to-end tests before replacing the three original plugin connections.
