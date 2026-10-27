# ChatToHarness Multi-Device Cloud Router

**Status: development branch; not deployed to Cloudflare and not verified with a real ChatGPT connector.** Existing HomeWinHarness, WinHarness and MacHarness tunnels remain unchanged.

The goal is ONE ChatGPT remote MCP connector with live device discovery, explicit device routing and automatic reconnection on Windows/macOS, using Cloudflare Workers + Durable Objects.

## Components

- `src/secure-worker.mjs`: OAuth-protected remote MCP resource. The public `/mcp` endpoint requires a Cloudflare Access-backed OAuth token (validated using the auth Worker service binding).
- `auth-server/index.mjs`: OAuth Provider 1.x; **Cloudflare Access** signs in the authorized user at `/authorize`. No GitHub OAuth App or GitHub login.
- `src/worker.mjs` + `src/pairing.mjs`: Durable Object device presence, secure one-time pairing, per-device credentials, exact routing and safe failure responses.
- Desktop `app/cloud-router-service.cjs` + `app/cloud-router-pairing.cjs`: first pairing through local UI, credential encryption via Electron safeStorage, reconnect on startup.

ChatGPT tool names: `create_pairing_code`, `list_devices`, `call_device_tool`. Only `get_harness_status` is allowed remotely in this stage. Remote shell/files/Computer Use are explicitly denied.

## Running tests

From repo root: `npm test`.
From `cloud-router/`: `npm ci && npm run check`. This compiles both Workers with Wrangler **without deploying**.

## Setup

See [P3-OAUTH.md](P3-OAUTH.md) for the Cloudflare Access + OAuth configuration and [PAIRING.md](PAIRING.md) for pairing UX, security and acceptance criteria.

Real Cloudflare account, HTTPS domains, OAuth KV and authorization policies are prerequisites for P4 deployment. Do not switch off the three existing Tunnel plugins before genuine end-to-end approval.
