# OAuth and device pairing

For the current Cloudflare Access (not GitHub) authorization implementation, consult [P3-OAUTH.md](P3-OAUTH.md). For one-time device pairing and auto-reconnect, see [PAIRING.md](PAIRING.md).

The end-user's existing ChatGPT login is not a verifiable authentication credential for arbitrary third-party WebSocket devices. Cloudflare Access authenticates the ChatGPT MCP operator, while per-device short-lived pairing and long-lived encrypted credentials protect registration. These processes are independent and transparent to the device user after pairing.
