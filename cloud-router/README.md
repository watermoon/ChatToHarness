# ChatToHarness Multi-Device Cloud Router

**Status: development branch. Workers not yet production deployed; a real ChatGPT single-connector and multi-device acceptance remains pending.** All existing legacy Secure MCP Tunnels remain unaffected.

Architecture: one remote MCP connector to `/mcp` through an OAuth-protected Resource Worker; a separate authorization Worker runs self-hosted owner-key OAuth 2.1 backed by KV (no Zero Trust or GitHub); Durable Object manages device pairing, online presence and exact device routing. Desktop OS safeStorage encrypts each device credential locally.

Expected URLs:
- OAuth issuer: `https://chattoharness-auth.watermoon3322.workers.dev`
- MCP: `https://chattoharness-cloud-router.watermoon3322.workers.dev/mcp`

MCP tools: `create_pairing_code`, `list_devices`, `call_device_tool`. Remotely permitted device tool: **`get_harness_status` only**. No Shell, file write, Git write or Computer Use until explicit later authorization and real acceptance.

Setup: [P3-OAUTH.md](P3-OAUTH.md). One-time pairing: [PAIRING.md](PAIRING.md).

Check code with `npm test` (repo root) and `npm run check` (`cloud-router/`). A successful dry-run does **not** mean a Worker was deployed or ChatGPT is authenticated.
