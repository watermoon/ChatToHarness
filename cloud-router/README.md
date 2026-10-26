# ChatToHarness multi-device cloud router — P1 prototype

Status: local-only proof of concept. **Not deployed, not linked to the desktop application or ChatGPT.**

Goal: one remote MCP endpoint at `/mcp`, multiple independently connected Windows/macOS devices using `/agent`, and explicit per-device routing without a user-operated VPS.

## Design

- Cloudflare Worker serves a stateless MCP Streamable HTTP-compatible JSON-RPC endpoint.
- One SQLite-backed Durable Object instance owns hibernatable inbound WebSocket connections from devices.
- Each device authenticates with a **different** secret from `DEVICE_TOKENS`; device IDs are stable and not credentials.
- MCP caller authenticates using `MCP_BEARER_TOKEN` (prototype bearer authorization; a production ChatGPT installation may require OAuth).
- `list_devices` shows authenticated, currently connected devices.
- `call_device_tool` requires `device_id`, `tool_name`, and `arguments`.
- The cloud allowlist `ALLOWED_TOOLS` defaults to `get_harness_status` only.
- Device-side `src/agent.cjs` needs an authenticated local MCP executor supplied by ChatToHarness. It must not bypass existing app permissions, project guidance, or Computer Use STOP/Esc authorization.

No current Tunnel or plugin is modified, and the existing three connections remain usable.

## Local tests

From the repository root:

```sh
node --test tests/cloud-router.test.cjs tests/cloud-router-agent.test.cjs
```

## Cloudflare preparation (not yet performed)

1. Install Wrangler in this subproject after reviewing dependencies.
2. Run `wrangler login` on an authorized Cloudflare account.
3. Configure secrets in the Worker (never commit secrets):
   - `MCP_BEARER_TOKEN`: random high-entropy secret for the MCP caller, minimum 24 characters.
   - `DEVICE_TOKENS`: JSON mapping stable device IDs to unique high-entropy secrets, e.g. `{"moon":"<secret1>","mac":"<secret2>"}`.
4. Review the read-only `ALLOWED_TOOLS` list and perform `wrangler deploy` in `cloud-router/`.
5. Validate the actual MCP client authentication contract before configuring a single ChatGPT plugin. The prototype bearer token is **not** an OAuth implementation.

## Remaining work before production

- Wire agent lifecycle into the Electron main process and app-owned authenticated MCP gateway; do not access private gateway IPC externally.
- Ensure each connector advertises a trustworthy per-device tool catalog and preserves tool approval semantics. Generic `call_device_tool` is a P1 transport proof, not equivalent to 47 first-class tools.
- Implement ChatGPT-compatible OAuth or another supported authentication configuration, authorization scopes, revocation and rotation, origin protection and rate-limits.
- Add explicit execution idempotency and durable acknowledgement/reconciliation (a lost response may mean a tool already ran). Restrict non-idempotent tools until verified.
- Test WebSocket hibernation, disconnect/reconnect, duplicate device, multi-device concurrency and real macOS/Windows calls in Cloudflare, including Agent permissions.
- Test privacy and failure cases: no false online device reporting, request/result size caps, intentional STOP/Esc, local confirmations, partial execution and no secret logging.
- Preserve the current three Tunnel connections until the new single ChatGPT plugin works in end-to-end acceptance.

No GPU/VM is required; Cloudflare provides the hosted routing plane while each device executes its own local tools.

## Stage P2: desktop integration, opt-in only

The desktop Electron main process now bundles `app/cloud-router-agent.cjs` and `app/cloud-router-service.cjs`. Default is OFF. This does not touch the existing Secure MCP Tunnel. For a **trusted development environment only**, supply these variables at process startup:

```text
CTH_CLOUD_ROUTER_ENABLED=1
CTH_CLOUD_ROUTER_URL=wss://<your-owned-worker-host>/agent
CTH_CLOUD_DEVICE_TOKEN=<unique-device-secret-minimum-24-characters>
```

The stable device ID is the existing `computer-use-device-id`, not the secret. Cloudflare's `DEVICE_TOKENS` must map that ID to the matching token. The Electron state includes a sanitized `cloudRouter` connection status when opted in. The Manager enforces only `get_harness_status` with empty arguments in this stage. **File edits, shell, Git, and Computer Use are not remotely enabled.** Read `OAUTH-PLAN.md` before any ChatGPT/public deployment.

Local setup (Mac and Windows): `cd cloud-router && npm ci && npm run check` validates the Worker bundle and Durable Object binding without deploying. Wrangler 4.152.0 is pinned in the lockfile. Neither a Cloudflare account nor secrets are needed for this dry run. `npm run deploy` is intentionally not part of automated tests.
