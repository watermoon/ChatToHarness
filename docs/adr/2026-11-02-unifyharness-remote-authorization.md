# ADR: UnifyHarness per-device remote tool authorization (2026-11-02)

Status: implementation in feature branch; production Cloudflare rollout and manual GUI acceptance pending.

## Decision
- Device owners can configure remote tool grants individually, per functional group, or globally in the ChatToHarness cloud connection page. Display the complete local MCP tool catalog, including denied tools; never imply catalog discovery itself grants execution. Batch changes validate all tool names and persist atomically.
- Grant **duration** is distinct from execution **confirmation policy**. `once` permits one invocation attempt (for Computer Use, one native operation session); `session` permits usage only during the current device↔cloud connection and is cleared on disconnect/restart; `permanent` is stored locally. Defaults remain read-only where previously safe. Temporary authorization is never persisted, and after it expires an explicitly selected tool remains denied rather than falling back to implicit read-only access. A persistent boolean grants file schema v1 is read compatibly and rewritten in schema v2 on next change. Existing process-termination per-call confirmation and Computer Use per-operation-session confirmation remain mandatory regardless of grant duration.
- Group and global grant changes only change this device; session grants must not be interpreted as ChatGPT chat session grants, because the server has no authenticated association with a ChatGPT conversation. Revoking or disconnecting invalidates ephemeral native session authorizations; stale in-flight completions cannot restore grants or consume a newer one-time grant.
- Default stays deny-for-remote for all tools except previously verified read-only, non-destructive closed-world tools. A new grant must be saved locally on the selected device; the cloud must never create or widen a grant by itself.
- An enabled tool is published with its original input schema and security annotations, plus a bounded `remoteGrant.mode` when explicitly granted. The Worker validates this metadata and refuses requests outside the selected device's current catalog/version. A grant edit causes a catalog version refresh.
- **Computer Use:** local approval required at `open_session` once per operation session. Subsequent input/observe calls are permitted only with a valid approved session ID and only until timeout, closure, disconnection or revocation. Window permissions, real input, user takeover, STOP/Esc and existing Computer Use authorization remain in force.
- **Destructive/process-control operations:** `kill_process`, `force_terminate` and equivalent high-impact operations require an explicit local confirmation on every invocation even when their per-tool grant is enabled. Denials/timeouts reject rather than retry.
- Local `McpManager.call` must remain the execution path, preserving project grants, local folder permissions and platform-specific capability checks. Do not route through an alternate shell or bypass local approval.
- Device disconnect revokes ephemeral Computer Use session approval, never persistent grants. No operation is replayed after an ambiguous disconnect.
- Existing Cloudflare OAuth, pairing and Secure MCP Tunnel are preserved.

## Security considerations
- Local tool annotations alone are not authorization. Both cloud catalog membership/version and current device-side permissions are required.
- Fail closed when local dialogs cannot run, approvals are declined, a grant is revoked while waiting, or a request expires.
- The remote catalog can describe a mutating tool as mutating; the cloud must not label generic `call_device_tool` read-only once writable tools can be invoked.
- Some read-only tools access sensitive data or arbitrary URLs. Their inclusion should still require explicit user intent.
- Do not globally enable high-risk grants on first launch; the local user must opt in individually.
- A testing build and Cloudflare dry-run do not establish production operation; production deployment requires separate compatibility validation and manual acceptance.

## Acceptance
- Unit tests demonstrate grant persistence/revocation, per-call denial, session-once approval, rejection after disconnect/expiry, and schema validation.
- Full suite, Windows build and Worker dry-run must succeed. Record exact results in `docs/dev.md`.
- Real device UI and production Cloudflare tests are separate and must not be marked passed until exercised.
