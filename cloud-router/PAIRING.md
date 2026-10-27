# 一次配对，多设备自动连接

## 用户体验

1. 在 ChatGPT 中打开唯一的 `ChatToHarness` 远程 MCP 插件。**它必须先使用所有者密钥完成自托管 OAuth 授权**，不需要 Cloudflare Zero Trust 或 GitHub 登录。
2. 调用 `create_pairing_code`，生成 43 字符一次性随机配对码，五分钟内有效。
3. 在要连接的 Windows/macOS 设备上启动 ChatToHarness，进入“连接配置 → 多设备连接 · 一次配对”。
4. 输入统一的 `https://<your-mcp-domain>/mcp` 服务地址，粘贴配对码，点击“配对当前设备”。
5. 后台自动使用配对码领取专属设备密钥（32 随机字节）。密钥通过操作系统 `safeStorage` 加密存储在用户配置目录，云端仅保存 SHA-256 摘要。
6. 后续启动自动使用设备密钥建立 `wss://<your-mcp-domain>/agent`；ChatGPT 调用 `list_devices` 即可看到多个已连接设备，并通过 `call_device_tool` 的 `device_id` 精确路由。

**设备端无需 GitHub 登录、Cloudflare 单独登录、输入自定义设备 ID、手工编辑密钥或创建额外 ChatGPT 插件。**

## 安全边界

- 仅认证后的 MCP 调用有权创建一次性配对码；匿名客户端只能尝试带正确配对码的兑换请求。
- 配对码为 256 位随机数，服务端只保存摘要，一次性使用，5 分钟超时。**不得在公开群聊或日志中共享**。
- 已配对的设备 ID 不可通过另一个有效配对码覆盖；各设备彼此独立，不能通过“仅报设备名”冒充。
- 新连接只有在配对后拥有正确密钥时才被接受；云端只存储密钥的摘要，持久密钥仅在该设备可解密的配置中保存。
- 仅允许 `get_harness_status` 这项只读工具；远程 Shell、文件写入和 Computer Use 未开放。
- Cloudflare 的正式端点必须 HTTPS/WSS，禁止公网 HTTP；本地安全存储不可用时，不能保存或激活新配对。
- 现有三个 Tunnel 保留到生产部署和双设备真机验收完成为止。

## 当前测试覆盖与待办

- 单元：签发、过期、一次性兑换、同一设备重复配对拒绝、别名不能越权、无明文密钥持久化、安全存储不可用、服务启动后的自动恢复。
- 模拟：Durable Object 注册和精确工具路由，离线目标不静默切换；OAuth Access 用户白名单。
- **未验证**：Cloudflare 正式部署、真正的 ChatGPT OAuth 登录、Cloudflare Durable Object WebSocket hibernation、Windows/macOS 同时在线、实际应用安装包 GUI 验收。
- 上线前应补充设备撤销/重新配对入口、速率限制、真机双端安全验收，并验证云端断线后执行状态不确定时不自动重放副作用。

GitHub OAuth 与仓库同步不属于设备配对方案。所有者密钥由授权 Worker 校验并签发 OAuth 令牌；设备端只依赖配对签发的独立设备密钥。
