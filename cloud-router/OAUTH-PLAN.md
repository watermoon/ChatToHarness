# OAuth strategy — self-hosted owner credential

No Cloudflare Zero Trust, GitHub account, email login, or extra IdP is required. The existing Cloudflare OAuth Provider 1.x authorization worker serves ChatGPT's standard OAuth 2.1 flow. One secret owner key in a Worker Secret protects authorizations; the resource worker verifies OAuth tokens by private Service Binding. Device registration is a separate one-time pairing workflow.

See [P3-OAUTH.md](P3-OAUTH.md) for the Cloudflare deployment, key setup, rotation and security constraints and [PAIRING.md](PAIRING.md) for device registration and auto-reconnect.
