# ChatToHarness Multi-Device Cloud Router

**Status: development branch. Workers not yet production deployed; a real ChatGPT single-connector and multi-device acceptance remains pending.** All existing legacy Secure MCP Tunnels remain unaffected.

Architecture: one remote MCP connector to `/mcp` through an OAuth-protected Resource Worker; a separate authorization Worker runs self-hosted owner-key OAuth 2.1 backed by KV (no Zero Trust or GitHub); Durable Object manages device pairing, online presence and exact device routing. Desktop OS safeStorage encrypts each device credential locally.

Expected URLs:
- OAuth issuer: `https://chattoharness-auth.watermoon3322.workers.dev`
- MCP: `https://chattoharness-cloud-router.watermoon3322.workers.dev/mcp`

MCP tools: `create_pairing_code`, `list_devices`, `list_device_tools`, `inspect_client_context`, `get_tool_result_page`, `get_tool_result_file`, and `call_device_tool`. Each paired device publishes a versioned catalog derived from its live local MCP definitions. `list_device_tools(device_id, cursor, limit)` returns that device's remote-safe tools and schemas; `call_device_tool` requires the selected `device_id`, `tool_name`, `catalog_version`, and object `arguments`. The Worker checks per-device catalog membership/version, then the device Agent checks the live catalog again and dispatches through the normal local MCP manager policy/grant/approval path. Only tools explicitly annotated read-only, non-destructive and closed-world are eligible, with a local denylist for sensitive diagnostics and all command/write/Computer Use operations. Catalog discovery does not grant permission. An optional operator `ALLOWED_TOOLS` setting can further restrict the global cloud surface. Result recovery remains restricted to snapshots produced by `get_harness_status` and cannot read saved results from local filesystem, shell or other MCP tools.

Setup: [P3-OAUTH.md](P3-OAUTH.md). One-time pairing: [PAIRING.md](PAIRING.md).

Check code with `npm test` (repo root) and `npm run check` (`cloud-router/`). A successful dry-run does **not** mean a Worker was deployed or ChatGPT is authenticated.

## Desktop first-run cloud initialization

The desktop Connection settings has an Initialize Cloud Service action. After Cloudflare browser authorization, the client automatically discovers the account, workers.dev subdomain and existing OAuth KV namespace through Cloudflare's API. Only if several accounts or matching OAuth KV namespaces exist does the interface ask which to reuse. The client uses bundled Node.js and Wrangler, opens the Cloudflare browser login only when required, provisions both Workers and KV, sets a 256-bit owner key as a Worker Secret, and verifies OAuth discovery and rejection of anonymous MCP access.

The owner key is OS-encrypted using Electron safeStorage. An explicit user action copies the key for ChatGPT OAuth authorization. The existing Tunnel remains untouched; this setup does not need MCP, Computer Use, a terminal or host-installed Wrangler. Runtime-generated configuration is placed under app userData, never Git. Production E2E remains a separate acceptance gate.

## MCP client-context inspection

The read-only, argument-free `inspect_client_context` tool reports OpenAI request hints from the current `tools/call` request's `params._meta`: `openai/session`, `openai/userAgent`, `openai/userLocation`, and `openai/locale`. It reports presence but masks the anonymized `openai/subject` and `openai/organization` identifiers. Other metadata and authorization secrets are not returned. Missing fields are `null` and explicitly marked absent.

This tool runs in the OAuth-protected Resource Worker and never invokes a device. These client-supplied hints are optional, unverified, and not a way to identify a local device, local IP address, or authorization principal. Do not use them for routing until validated by an independent trusted device association.

## Paired-device roster

The cloud router Durable Object stores device registration records indexed by a durable random device ID, independent of the hostname. The owner-authorized MCP `list_devices` and paired-device-only `GET /paired-devices` return registered names/platforms, online/offline state, and paired time; they never reveal credential digests. The desktop app uses its encrypted device credential to query this roster, mark the local device, display offline machines, and refresh status. Unknown/unpaired clients cannot read the roster. A device name may be changed without changing its ID; hardware MAC, disk serial and other tracking identifiers are not collected.
