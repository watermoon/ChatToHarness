# ChatToHarness Multi-Device Cloud Router

**Status: development branch. Workers not yet production deployed; a real ChatGPT single-connector and multi-device acceptance remains pending.** All existing legacy Secure MCP Tunnels remain unaffected.

Architecture: one remote MCP connector to `/mcp` through an OAuth-protected Resource Worker; a separate authorization Worker runs self-hosted owner-key OAuth 2.1 backed by KV (no Zero Trust or GitHub); Durable Object manages device pairing, online presence and exact device routing. Desktop OS safeStorage encrypts each device credential locally.

Expected URLs:
- OAuth issuer: `https://chattoharness-auth.watermoon3322.workers.dev`
- MCP: `https://chattoharness-cloud-router.watermoon3322.workers.dev/mcp`

MCP tools: `create_pairing_code`, `list_devices`, `call_device_tool`. Remotely permitted device tool: **`get_harness_status` only**. No Shell, file write, Git write or Computer Use until explicit later authorization and real acceptance.

Setup: [P3-OAUTH.md](P3-OAUTH.md). One-time pairing: [PAIRING.md](PAIRING.md).

Check code with `npm test` (repo root) and `npm run check` (`cloud-router/`). A successful dry-run does **not** mean a Worker was deployed or ChatGPT is authenticated.

## Desktop first-run cloud initialization

The desktop Connection settings has an Initialize Cloud Service action. After Cloudflare browser authorization, the client automatically discovers the account, workers.dev subdomain and existing OAuth KV namespace through Cloudflare's API. Only if several accounts or matching OAuth KV namespaces exist does the interface ask which to reuse. The client uses bundled Node.js and Wrangler, opens the Cloudflare browser login only when required, provisions both Workers and KV, sets a 256-bit owner key as a Worker Secret, and verifies OAuth discovery and rejection of anonymous MCP access.

The owner key is OS-encrypted using Electron safeStorage. An explicit user action copies the key for ChatGPT OAuth authorization. The existing Tunnel remains untouched; this setup does not need MCP, Computer Use, a terminal or host-installed Wrangler. Runtime-generated configuration is placed under app userData, never Git. Production E2E remains a separate acceptance gate.
