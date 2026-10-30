## 2026-10-30 工具计数与 ChatGPT 连接工具快照差异

- unity.local 已运行 769ec712，get_harness_status 的网关全目录为 48 个工具，含 get_tool_result_page/get_tool_result_file，状态 ready；ChatGPT 当前 MacHarness 插件实际可调用仅 46 个，少了以上两个分页工具和 get_execution_summary，而额外存在 computer_use（按 ChatGPT 和服务端实际枚举逐项比对）。
- App 连接状态原在 app/main.cjs 的 mcpManager state 回调仅使用 visibleTools().length，漏算独立由 Gateway 提供的两个分页工具，导致 renderer 工具摘要持续显示 46。现在取 Gateway result tools 加 manager visibleTools，UI 与 get_harness_status 同一计算口径。
- ChatGPT 连接工具清单是独立的元数据快照，服务端重启不会自动更新 ChatGPT 已批准的工具定义，需从 Plugins 对应连接刷新工具元数据，并在新对话验收。不能将本机 UI 的 48 等同于当前 ChatGPT 46 个可调用工具。
- npm test：708 项，692 PASS、16 SKIP、0 FAIL（首次并发执行出现未判明的瞬时失败，完整日志复跑通过）。

## 2026-10-30 UnifyHarness 缺失分页工具修复（macOS unity.local）

- MCP Gateway 现有 get_tool_result_page/get_tool_result_file 实现和优先 tools/list 顺序确认存在；此前本机运行的是旧版 4e55c3f，且 get_harness_status 仅返回 manager 的 46 基础工具，漏掉网关附加的两项。
- get_harness_status 的工具目录包含结果分页工具；Cloudflare Worker MCP 直接增加带必填 device_id 的 get_tool_result_page/get_tool_result_file，并同步 Worker 与 macOS Agent 白名单及自动初始化生成配置。
- 云端代理分页只允许 get_harness_status 的已保存结果，通过本机 MCP Gateway 原生 result store 读取；严禁透过 result_id 访问本地文件、Shell 或第三方 MCP 结果，拒绝非法参数及未经允许的工具。
- 新增 tests/cloud-result-paging.test.cjs，补充 Worker 工具发现、云端设备选择、分页路由与安全拒绝回归。macOS 全量 npm test 返回 0，专项 40/40 PASS；Mac App 在固定 dist/mac-arm64/ChatToHarness.app 本地构建返回 0。
- 尚需独立确认云端 Worker 实际部署后的 tools/list 和重新加载的 ChatGPT 插件列表；构建不等于运行中的插件已热更新。

## 2026-10-30 二次实测：标准 OAuth 回调与 Windows Keyring 幂等修复

- Rocket 打包 Wrangler 4.152 实际执行标准 OAuth，报告已打开默认浏览器，Chrome 显示 Cloudflare Dashboard。未完成账号授权，不能声称已获取 OAuth Token。
- 同一设备再次登录时，旧代码每次直接复制 Windows Keyring 原生模块，实测 fs.cpSync 返回 EPIPE/errno32。修复为源和目标内容 SHA256 校验：完整且一致时复用，不再覆盖已加载的 .node；首次/修复安装采用 staging 和原子重命名。
- 增加重复两次无覆盖、损坏修复、缺少依赖失败的专项测试。Keyring 实机重新运行无 EPIPE，标准 OAuth 回调服务已确认监听 IPv6 loopback [::1]:8976；先前仅探测 IPv4 的结果并不足以判定未监听。
- Keyring 安装失败、占用、完整性异常保留独立错误码和中英日用户提示，不归类为登录失败。
- 完整 npm test 退出 0，云端专项 34/34 通过；打包应用 UI smoke 退出 0，未进行真实远端授权。构建固定输出 dist/win-unpacked，不创建按功能命名的应用目录。
- 真实端到端授权仍待用户在浏览器批准，确认 Wrangler 凭据、Cloudflare ready 及设备自动登记，之前不能标记 PASS。

## 2026-10-30 Cloudflare Device OAuth 页面返回 10404 的实网复现与回退

- Rocket 已运行 dac34a8 的 Windows 打包版；Chrome 确实打开 `https://dash.cloudflare.com/oauth2/device`，不是旧包或 Keyring 缺失。2026-10-30 使用无用户令牌、虚构验证码的 GET 实测：`/oauth2/device` 返回 HTTP 404 JSON `code:10404`、`No route for that URI`；带末尾斜线同样 404；标准 OAuth `/oauth2/auth` 和 `/oauth2/authorize` 返回 302。官方 Wrangler Device Authorization 文档仍指向 `/oauth2/device`，故不能未经证据称为代码 URI 拼错；不能确定是 Cloudflare 区域性故障还是服务端变更。
- 在初始化需登录时，针对 Device 授权页执行无凭据的短超时探测；**仅**检测到 Cloudflare `404+10404` 时，改调用 `wrangler login --use-keyring` 标准浏览器 OAuth（Wrangler 启动浏览器、本机 localhost:8976 完成回调）；其它网络/权限错误不触发回退。标准 OAuth 失败报告专有的中文/英/日诊断，不再建议用户重复刷新已知失败的 Device 页面。
- 新增 10404 回退和其它 404/403/网络异常不误回退回归。真实标准 OAuth 最终授权及浏览器回调尚未由用户或实际登录验证，不能标记在线登录 PASS。

## 2026-10-30 Windows Cloudflare Keyring 打包缺失复发：构建阶段阻止再次交付

- Rocket 0.8.1（基线 4e55c3f）确认内置 Wrangler 与 Node 存在，但 `cloud-router/node_modules/@napi-rs/keyring` 和 `keyring-win32-x64-msvc` 缺失；此前构建仅以 Wrangler 主文件存在决定跳过 `npm ci`，导致构建成功而授权入口在 `prepareKeyring` 失败，未触发浏览器授权。2026-10-28 的打包自测仅覆盖 Wrangler CLI 和 IPC 资源路径，没有覆盖 Keyring 原生依赖。
- 构建前检查 Wrangler、Keyring 主包及目标系统原生包；缺失时重新执行 `npm ci --prefix cloud-router --include=optional`，仍缺失立即失败。构建后再次检查打包资源，Windows 用内置 Node 实际加载 Keyring 并验证 Wrangler `login --help` 支持 `--device` / `--use-keyring`；任何失败均使本地构建与发布 CI 构建失败。
- 初始化前检查 Windows Keyring，缺失时明确报 `CLOUD_KEYRING_RUNTIME_MISSING`，不可当作网页登录失败；错误弹窗提供准确原因与中文、英文、日文提示。增加缺少 Keyring 时不运行登录命令的回归。
- Rocket `npm test`：696 项，677 PASS、19 SKIP、0 FAIL；免安装 Windows 构建成功（使用独立目录避免覆盖正在运行的旧程序），内置 Keyring 实际加载 PASS。尚未以真实 Cloudflare 账户完成浏览器 OAuth 端到端授权，因此不能宣称在线授权验收完成。

## 2026-10-29 实际自动登记失败修复与用户实测成功

- 真实 Worker 日志定位：账户验证函数使用 redirect=error，Cloudflare edge fetch 仅支持 follow/manual，直接抛 TypeError，未发起账户权限验证。客户端将该失败吞并为 CLOUD_ACCOUNT_ENROLL_FAILED。
- 改为 redirect=manual，非成功响应仍拒绝，不跟随任何重定向；保留脱敏的状态/错误码诊断，新增模拟 edge 限制与重定向拒绝回归。Auth 和 Router 已实际部署该修复，当前已安装客户端无需换包。
- 用户在本轮修复部署后实际重试并明确反馈：已成功连接。不能将此前单测或公开 403 探测误记为此前绑定已通过；真实绑定成功证据为本次用户反馈。
- 专项 5/5 PASS，两个 Worker dry-run PASS；完整 npm test：695 项，676 PASS、19 SKIP、0 FAIL。客户端错误细分和中文提示已在源码改进，未为这些提示另行构建覆盖正在运行的程序。

## 2026-10-29 单用户多设备：Cloudflare 作为唯一交互身份

- 桌面新接入通过内置 Wrangler Cloudflare 授权，读取账户/子域名/Worker/KV 验证归属；缺少服务时创建，旧服务自动迁移。初始化完成自动登记本机，不再要求 Owner Key、手动批准或配对码。
- account-enroll 云端端点使用固定部署的 CF_ACCOUNT_ID，经 Cloudflare 官方账户脚本 API 验证 Bearer 的实际权限；客户端不能自报账户绕过验证。设备本地产生随机连接凭据，云端只保存摘要，后续重连复用现有凭据。未认证请求 403，旧配对入口在账户模式为 410；原 DO 设备记录保持。
- OAuth 登录页改为 Cloudflare device grant，浏览器绑定的短时会话、Origin/自定义头校验、Cloudflare 账户归属检查完成后自动继续 OAuth；无自定义批准/Owner Key 表单。真实线上登录入口 200，并成功获得 Cloudflare 登录链接。
- 迁移前读取保留已有普通变量，与新 CF_ACCOUNT_ID 合并；不使用会保留旧身份变量的 keep-vars 标志。密钥、KV 和 DO 记录均不清理。Owner Key 旧方法/DOM 仅为旧版兼容保留，不在新产品流程暴露。
- 真实部署 Auth/Router 已完成；公开探测 identity_mode=cloudflare，account-enroll 无凭据 403，pair-request 410。带真实 Cloudflare 凭据的在线登记测试被自动审批拦截，未执行；无凭据公开探测和账户/自动登记模拟测试通过，不能宣称真实绑定端到端已完成。
- 最终 npm test：694 项，675 PASS、19 SKIP、0 FAIL。两个 Worker dry-run PASS；包括账户身份绑定、跨账户拒绝、无 Owner 初始化、保留自定义变量、设备自动登记、无 Owner OAuth、CSRF 拒绝等回归。构建统一覆盖 dist/win-unpacked，构建期间不再改动源文件。

## 2026-10-29 打包档案完整性与 Electron 欢迎页

- 上轮打包期间修改被收录的 docs/dev.md，造成 app.asar 目录大小/偏移与实际文件内容不一致，后续 271 个文件校验失败（包含 package.json）。自定义 Electron 发行目录还保留 default_app.asar，错误启动暴露默认欢迎页。
- afterPack 移除默认欢迎应用，并按包内 SHA256 校验所有已打包文件及 package.json/app/main.cjs 启动入口；最终 build 再验一次。新增真实档案损坏和欢迎页残留的回归测试。构建期间禁止编辑任何被收录的源文件。
- 档案专项测试 1/1 PASS；重新构建结果以实际命令和校验日志为准。

## 2026-10-29 Harness 外部连接统一读取代理配置

- 自动绑定与设备列表遗漏 fetcher 注入、设备 Agent 使用默认 WebSocket，未遵循 Harness 代理设置。更新检查和远程 HTTP MCP 原使用 Electron 默认网络，也未统一。
- 主进程创建共享网络适配器；云端初始化/管理、绑定/轮询/设备列表、设备 WebSocket、更新检查/下载、远程 HTTP MCP 全部注入该适配器。每次请求或重连读取当前配置与目标绕过规则，按 direct/system/manual 选择路由；配置变更重建已配对 Agent 连接，保留暂停断开状态。已有 Tunnel 仍使用原 selectProxy 路径。本机进程间回环连接保持本机。
- WebSocket 异步选路支持失败退避与停止期间丢弃迟到连接，不重放远端调用。
- 全量 npm test：686 项，667 PASS、19 SKIP、0 FAIL。补充真实 HTTP CONNECT 转发与配置切换到直连验证，以及 WebSocket 选路、代理失败重试、停止时未完成选路回归。
- 尚未以真实账户完成自动绑定端到端验证；测试不代表真实绑定成功。构建统一覆盖 dist/win-unpacked。

## 2026-10-29 云端检测失败后的重试入口

- UI 将 remote=unreachable 直接作为初始化按钮禁用条件，导致检测失败后无法从初始化入口重新检测/授权。现改为可点击的重试云端初始化；busy、已部署以及无本机密钥的部分部署继续保持原保护。
- 重试仍调用原 findOptions 并重新验证状态，未知状态拒绝任何部署。新增网络失败后恢复测试及实际 renderer 禁用表达式测试。专项 38/38 PASS。
- 当前本机只读探测（system 模式，已核实系统代理 127.0.0.1:7897）：already_deployed、remote=deployed、hasOwnerKey=false，无错误；没有部署或修改远端资源。

## 2026-10-29 授权后令牌超时与 Harness 代理配置

- 实际日志显示 device OAuth 授权后 token endpoint 请求多次超时。云端 bootstrap 原未接入 Harness 代理设置。
- cloud-network 统一复用 selectProxy，按当前 Harness direct/system/manual 模式及绕过规则选路，手动认证读取已保存密码；CLI 显式覆盖继承的代理环境变量，云端 API 为每个 URL 选择 dispatcher。授权完成后状态切回 discovering。
- 专项 cloud-network + cloud-bootstrap 25/25 PASS，包含三种模式、绕过规则和配置变更。真实 OAuth 完成和后续部署仍待新版运行验证，不能以单测替代。

## 2026-10-29 Windows 云端授权未打开修复

- 真实复现：内置 Node 执行 Wrangler 4.152.0 device login，在请求授权前因缺少 @napi-rs/keyring 退出；管道启动不能自动交互安装。
- 固定打包 keyring 1.3.0 和平台二进制，Windows 登录前放入 Wrangler 实际解析的 native/keyring 目录；保留加密凭据存储。应用用 Electron 打开带本次验证码的官方授权页面，Wrangler 禁止重复打开。
- 真实进程探测：成功生成 device code，探测主动终止，未完成 OAuth 或部署云端。全量 676 项：657 PASS、19 SKIP、0 FAIL；浏览器回调断言专项 21/21 PASS。

## 2026-10-29 云端初始化错误提示改为用户可读弹框

- 根因：设置页将 cloud.error、result.error 直接拼接到状态文字，导致 CLOUD_WRANGLER_FAILED_LOGIN 等内部代码暴露给用户。
- 调整：新增统一云端错误弹框；根据错误码映射登录、运行时、部署、密钥、子域名、账户权限和远端验证等可操作的说明。设置页状态只显示阶段和远端状态，不再展示原始错误码。
- 验收：node --test tests/cloud-error-ui.test.cjs 与 npm test。
- Verified on MOON: targeted tests 14/14 PASS; npm test 676 total, 657 PASS, 19 SKIP, 0 FAIL; Electron development UI smoke PASS.


## 2026-10-29 设备列表 Harness 与 OS 产品版本上报

- 原因：本地 Agent 已发 harness_version，但云端新 Worker 未部署、设备未重新注册，云端设备记录缺版本；旧 UI 对本机也未使用本地 package.json 兜底，故显示 Harness —。
- 本机新增 local_harness_version 和 local_os_version 本地兜底，Mac 通过 sw_vers -productVersion 采集真实 macOS 产品版本（Mac 实测 macOS 14.6.1，不能把 Darwin 23.6.0 当成 macOS 产品版本）；Windows 以系统 build 判断 10/11/Server 并显示 Build；Linux 取 os-release PRETTY_NAME（失败才明确标注内核）。
- 新 Agent 注册协议增加 os_version；Router Worker 验证字段后持久化设备 os_version 并在 paired-devices 返回；旧设备缺字段兼容。UI 其他设备仅显示真实注册上报，未知保持 —；本机缺失服务端字段才本地兜底。本机徽标 13px、800 粗体与深色。
- 本地测试：专项 66/66 通过；npm test 675 项（659 PASS、16 SKIP、0 FAIL），两个 Worker dry-run 通过；Mac ARM64 实机构建 App 位于 dist/dev-device-version-20261029/mac-arm64/ChatToHarness.app，codesign deep strict 和 macOS 14.0 最低版本 PASS，打包 GUI smoke PASS，realLocalTools=46，三语言 zh-CN/en/ja。
- 当前尚未向 Cloudflare 部署新 Worker；其他设备需新版客户端重连后方能补足云端版本。未清理 Owner Key、KV、设备数据，未覆盖 App，未提交或推送源码。

## 2026-10-29 彻底重置云端与设备列表信息完善

- 追加安全回归：resetProof HMAC 绑定已验证 Owner Key、原 Cloudflare 账户、KV 与子域名；伪造 resetStage/resetProof 不能跳过核验删除其他账户。对 DeviceHub 内部清理的 WebSocket 关闭、deleteAlarm/deleteAll 增加测试；本地配对凭据移除后必须保留其他 Tunnel 配置文件。专项重置 7/7 PASS，本地配对 9/9 PASS；之前完整 npm test 667 项（651 PASS、16 SKIP、0 FAIL），新增两项测试单独通过。
- 最终本地 Mac 构建：CTH_DIST_SUBDIR=dev-full-cloud-reset-final-20261029 npm run build EXIT 0；产物 dist/dev-full-cloud-reset-final-20261029/mac-arm64/ChatToHarness.app；codesign --verify --deep --strict PASS、macOS 最低 14.0 校验通过。打包 GUI smoke 返回 packaged=true、realLocalTools=46、语言 zh-CN/en/ja，EXIT 0。首次构建的 GUI 烟测曾因旧测试等待已隐藏 Owner Key 标题而失败，更新验收断言到初始化旁的复制按钮后同一界面通过；最终包重新构建并通过。
- 真实 Cloudflare 上线、真实全量删除均未执行。实际执行彻底重置会让现有 ChatGPT OAuth 和设备配对失效，仍需人工确认。Workers.dev 子域名、Cloudflare 账户本身和服务端无法遍历的其他设备本地旧密文不删除；Owner Key 等本机凭据仅在所有远端步骤成功后才删除。


- 在「云端服务 → 高级管理」新增「彻底重置云端」危险按钮与原生确认弹窗。需完整输入 RESET CHATTOHARNESS 才能执行。已存在完整、已验证本机 Owner Key 且云端部署可核对时才允许初次执行；半途失败的已签名重置流水账允许同目标恢复。
- 远端安全阶段：Cloudflare OAuth 管理账户权限校验、资源精确核查、OAuth KV 标题与 ID 双重校验，检查所有 Worker 的 KV 引用，不允许删除共享或来源不明的 KV；随后将含 Owner 验证的设备数据清理端点部署至已验证的 Router Worker，私有 AUTH_SERVER 绑定验证 Owner Key，删除唯一 default DeviceHub Durable Object 的全部存储；再删除专属 Router 和 Auth Worker，并确认 Cloudflare API 返回不存在；最后删除专属 OAuth KV 并验证不存在。
- 所有远端步骤成功才清理本机 app/cloudflare-bootstrap/credentials.json、生成的 auth/router JSONC，以及 cloud-router-pairing.json。保留本地 Tunnel/系统代理、普通用户配置与其他目录。其他电脑上的本地过期文件不跨设备删除，但远端设备凭据已无效，需要重新绑定。
- 失败不会提前清除本机 Owner Key；每一步的 resetStage 和由原 Owner Key HMAC 绑定账号/KV/子域名的 resetProof 可用于安全重试、拒绝手工篡改跨账户删除。仅本地收尾失败可不依赖重新登录 Cloudflare 完成。不可将「重新初始化云端」（保留数据）与「彻底重置云端」（删除）混淆。命名的 Durable Object 实例数据通过 deleteAll 清空，但 Cloudflare 内部 namespace 元数据不承诺自动消失。
- 用户另要求：刷新设备列表按钮紧随「已配对设备」标题；设备列表恢复平台、Harness 版本、在线/离线及仅本机显示的「本机」标记，当前设备名称加粗；旧设备还未上报版本时使用 —。为支持版本登记，桌面 Agent 注册上报 package version，DO 保存最后上报版本，设备清单返回值供 UI 显示；新 Worker 部署与新版设备重新连接后数据才齐全。
- Owner Key 复制按钮移到云端初始化按钮旁边，常驻的 Owner Key 单行说明隐藏，详情通过现有高级管理入口；状态依旧可由内部状态事件通知。没有重置真实线上资源、未更新实际部署的 Router/Auth Worker，保留全部未提交修改。
- 2026-10-29 Mac 本机：npm test 667 项（651 PASS，16 SKIP，0 FAIL）；Router/Auth 两个 wrangler dry-run 均 PASS；破坏性重置只用模拟后端验证正常删除、共享 KV 拒绝、远端部分失败可重试、局部清理失败恢复、伪造流水账拒绝。用户的云端及已配对设备未被修改。本机 .app 最终产物及 GUI 结果以同轮后续记录为准。

## 2026-10-29 设备区单行操作与设备列表视觉层级

- Mac 本地包 dist/dev-device-row-20261029/mac-arm64/ChatToHarness.app 成功构建、codesign deep strict 通过。完整 packaged GUI smoke 的首次尝试因 Playwright 把裁剪为 1x1 像素的无障碍播报区域判定为 visible 而失败；修正测试为实际矩形/position 检查后使用同一个安装包重跑 smoke PASS，packaged=true，macOS arm64，46 个真实本地工具，zh-CN/en/ja。没有变更已打包应用源码。
- UI 单测检查：未配对/连接中/在线/离线只出现一个状态动作；已配对清单中所有条目保留完整 ID，当前设备 name 强调，在线专用醒目状态，离线弱化；折叠项仍保持用户选择的设备名。真实 GUI smoke 检查当前设备行 → 已配对设备标题/刷新 → 下拉的实际纵向顺序，顶部「已连接」无可见冗余文字。


- 当前设备行统一为 当前设备：真实设备名 [i] [单一状态按钮]；当前在线显示「断开」，已配对不在线显示「连接」，未配对显示「配对」，继续使用既有配对弹窗；连接中禁用重复连接按钮。
- 其下是「已配对设备」与刷新按钮，以及可展开的全量已配对设备下拉清单（包括离线）。在线项用绿色高亮「在线」，离线状态弱化，当前设备名称加粗并使用浅背景标明；展开项目继续保留完整设备 ID，避免同名混淆。
- 原孤立的「已连接」文字不再常驻，仅保留隐藏的 aria-live 状态用作无障碍播报及错误反馈。设备名取自真实设备信息，不硬编码。
- 本地专项 44/44 通过，完整 npm test 658 项（642 通过，16 跳过，0 失败），git diff --check 通过；Mac 本地打包 GUI smoke 验收补充顺序和隐藏状态断言。
- 未动云端 Worker、Owner Key、设备凭据或持久断开语义；未操作运行中的 Mac 连接，不覆盖旧 App，不提交代码。最终打包结果随后记录。

## 2026-10-29 已配对设备断开与云端安全重新初始化
- 最终版 Mac arm64 路径：dist/dev-device-disconnect-final-20261029/mac-arm64/ChatToHarness.app。Mac 本地 npm run build 成功、codesign deep strict 和 macOS 14.0 最低版本校验成功、打包 GUI smoke 通过（packaged=true、realLocalTools=46、zh-CN/en/ja）。
- GUI smoke 测试覆盖未配对下断开/重连均隐藏、未拥有管理密钥时重新初始化禁用、当前设备字体 >=15px。额外补齐 redeploying_auth/redeploying_router 进度与多语言，专项测试 23/23 通过。
- 不在用户当前工作的 Mac 上实际断开连接，不执行真实远端重新部署；这两项行为属于新包上线后的手动功能验证。本轮本地源码保留修改且未提交推送。


- 已配对设备在「连接配置 → 多设备连接 → 当前设备」提供「断开连接」，断开当前设备的统一 MCP WebSocket/Agent；保留设备 ID 和本机 safeStorage 加密的设备凭据，云端设备列表仍保留离线设备。使用同位置的「重新连接」直接利用已保存凭据连接，无需再次配对。
- 本机持久化暂停标志 paused=true，断开后即使重启桌面 App 也不会自动重连；重新连接将 paused=false 持久化。兼容旧 schema 1 凭据，无 paused 字段默认为允许自动连接；存储更新采取原子替换、不回写明文 Token。
- 「当前设备」信息由原 11px 的辅助文字提升为 15px、600 字重；设备详情 i 保持按需显示完整 ID，不在主界面常驻长串字符。
- 已部署并且本机保存有效管理 Owner Key 的云端，在「云端服务 → 高级管理」显示「重新初始化云端」按钮。用户二次确认后仅向原账号/原 KV/原 workers.dev 子域名执行两个 Worker 的 keep-vars 重部署，保留原 Owner Key Secret、OAuth KV、设备 DO 记录和设备 ID；不执行密钥轮换、KV 创建/清空或设备解除绑定。强制校验本机原始管理记录及现有线上两个 Worker，校验失败时不触发部署。已有云端但本机没有管理密钥时该按钮禁用，此时应先关联/找回管理凭据。
- 「刷新云端配置」只重新检测，不触发部署。「彻底清空已有云端」需要另行设计带备份与强确认的危险操作，绝不能由普通重新初始化暗中执行。
- 本地专项测试覆盖断开、关闭 Agent、进程重启后保持断开、手动恢复，凭据密文不变；云端重新初始化的 keep-vars 双 Worker 重部署及 KV/Secret 不修改。全量 npm test 656 项（640 PASS、16 SKIP、0 FAIL），git diff --check PASS。
- 本轮没有实际断开当前工作的 Mac 连接，也没有执行远端重新初始化；只验证业务实现、模拟 Worker 部署和安全边界。新的 Mac 安装包及 GUI 烟测结果见本轮后续记录；保留所有用户未提交修改。

## 2026-10-29 配对弹窗与连接页信息收敛

- 用户要求精简自动配对 UI：不再常驻手动输入一次性配对码，仅尚未配对时显示配对设备入口。点击后打开原生 dialog；默认提供自动授权和手工模式；仅点击手工模式时显示 43 位一次性配对码。已配对时隐藏入口，正在等待批准时也避免重复申请；关闭清空敏感输入，原生 Esc 退出。
- 云端服务、多设备连接、设备列表三处冗长说明改为紧邻标题的可点击 i 图标；Owner Key 常驻状态缩短为已保存/未保存，完整说明在 i；当前设备常驻仅显示设备名，完整 ID 放在 i 详情里。信息使用 details/summary 支持键盘操作。设备下拉仍保留精确设备 ID。
- 自动配对协议、云端 Worker、OWNER_AUTH_KEY、设备 Token、KV 均未改动；保留其他未提交修改和原手工配对服务接口。
- 本地 UI/i18n 单测 39/39 PASS；全量 npm test 共 649 项（633 PASS、16 SKIP、0 FAIL）；git diff --check PASS。
- macOS 14 arm64 本机构建 CTH_DIST_SUBDIR=dev-compact-modal-20261029 npm run build 成功，独立 App 在 dist/dev-compact-modal-20261029/mac-arm64/ChatToHarness.app，codesign deep strict PASS。打包 GUI smoke 第一次因为原脚本直接点击已隐藏手工按钮而失败；调整测试步骤为真实弹窗交互（默认隐藏、点击展开、输入校验、关闭清空），同一包重新运行 npm run smoke:ui PASS，返回 packaged=true，realLocalTools=46，语言 zh-CN/en/ja。
- 未覆盖原安装版、未上传 CI、未提交或推送；尚待用户视觉复验，不能把 GUI 自动烟测等同于视觉验收。

## 2026-10-29 云端环境自动初始化与可操作引导

- 最终本机验收：自动配置专项 35/35 PASS；完整测试 648 项（632 PASS、16 SKIP、0 FAIL）；两个 Worker Wrangler dry-run PASS；Mac arm64 本地目录 dist/dev-cloud-setup-20261029/mac-arm64/ChatToHarness.app 构建完成、codesign deep strict PASS、打包版 Electron smoke:ui PASS。UI 烟测新增引导控件检查；首次 smoke 因新增了第二个同属 Cloudflare 的上下文帮助按钮造成旧测试计数不符，修正断言后复验 PASS，非应用功能故障。Windows 脚本尚未在 Windows 真机执行。源代码未提交/推送；没有更改生产 Workers/KV/Owner Key/配对数据。

- 目标：减少 Cloudflare 初始化时选择账户、KV、子域名、Owner Key 的手工步骤。App 启动后仅做只读检测；点击「自动初始化云端」才会执行登录、创建或部署，已有服务不会被自动覆盖。
- 多账户：仅在能查到一套账户同时包含 chattoharness-auth 和 chattoharness-cloud-router 两个 Worker 时自动选择；否则要求用户选择。多 OAuth KV：根据已有授权 Worker 的 OAUTH_KV 绑定 ID 唯一识别；不能确认则要求选择，不猜测。
- 首次 Cloudflare 登录：Wrangler login --device --use-keyring。应用尝试直接唤起浏览器；浏览器无法自动打开时，通过界面提供固定安全授权页和短时验证码，完成后清空；不会将原始 token 或 CLI 日志发送到渲染器。
- 没有 workers.dev 子域名时显示建议名称，用户可编辑确认，之后通过 Cloudflare API PUT /accounts/{account_id}/workers/subdomain 创建并校验，不修改已经存在的子域名。API 不可达时不会猜测资源不存在。
- KV 不存在时自动创建；其余保留既有安全顺序：先加密保存 Owner Key，之后配置 Worker 和 Secret、验证 OAuth、health 与匿名 MCP 401。若已部署但本机密钥丢失、权限缺失或网络状态不明，安全阻止自动覆盖，改为给出明确恢复指引。
- UI：仅在选择账户/KV 或新建子域名时出现对应表单；常驻精简状态和 1–6 步进度，完整 Cloudflare 登录/权限/Workers/KV/密钥恢复说明收在帮助页。
- Windows/macOS 测试脚本：scripts/accept_cloud_setup.ps1 和 scripts/accept_cloud_setup.sh；含专项、全量和 Wrangler dry-run，设置 CTH_EXECUTABLE 可追加打包 GUI 验收，不部署生产服务。
- 新测试覆盖只读初始化、避免重命名子域名、自动识别真实 Worker/KV 归属、账号歧义必须人工选择、短期验证码安全生命周期，以及动态 UI。生产账户已存在正常服务，本轮不得为测试再次创建生产 KV/子域名或轮换 Owner Key。

## 2026-10-29 自动配对与云端设置 UI 收敛

- 最终 Mac 本地重新打包（包含「当前设备已绑定」按钮状态）：CTH_DIST_SUBDIR=dev-auto-pair-final-20261029 npm run build EXIT 0，产物 dist/dev-auto-pair-final-20261029/mac-arm64/ChatToHarness.app；代码签名校验和完整打包 GUI smoke EXIT 0。构建成功的后续重试取代了前一次异常退出的结果。
- 一键验收脚本新增 scripts/accept_cloud_pairing.sh 和 scripts/accept_cloud_pairing.ps1；macOS bash 本机执行通过（641 tests，625 PASS / 16 SKIP / 0 FAIL），Windows PowerShell 脚本尚需 Windows 主机实际执行。设置 CTH_EXECUTABLE 可追加打包 GUI 测试。


- 在当前 feat/cloudflare-multi-device-router 分支新增桌面发起自动配对：本地 32 字节安全随机数作为设备 Token，仅发送 SHA-256 摘要；云端申请、owner 审核、轮询及持久设备注册；默认不要求 ChatGPT 对话创建/复制一次性码。
- Cloudflare 授权 Worker 仅通过已存在的 AUTH_SERVER 服务绑定向 Router Worker 提供私有 Owner Key 验证 RPC；浏览器审批页有同源随机 Cookie + 表单 CSRF、设备信息核对、一次性处理、5 分钟失效；管理云端的本机还可用 OS 加密的 Owner Key + 设备自己的轮询密钥自动批准。不得向不匹配的 MCP URL 发送 Owner Key。
- 旧的 create_pairing_code、pair-redeem、手工配对和已保存设备密钥保持兼容；设备不能重名覆盖，允许工具仍为 get_harness_status 只读；不改变既有 Tunnel、OAuth KV、Durable Object 数据或 Owner Key。
- UI：将 Owner Key 管理合入云端服务卡片，说明移入「说明/帮助」面板，敏感显示/轮换收在高级管理；多设备配对默认仅显示整行 MCP 地址和自动绑定按钮，手工配对码折叠为兼容方式；两类输入框同宽。
- 本地验收：自动配对安全专项含未授权拒绝、Owner Key 验证、CSRF、一次性设备、设备端密钥不外泄与管理设备无浏览器路径；npm test 641 项（625 通过、16 跳过、0 失败），Wrangler 双 Worker dry-run 成功。
- Mac arm64 本机打包 App 路径 dist/dev-auto-pair-20261029/mac-arm64/ChatToHarness.app。构建命令本轮第一次返回码 1，electron-builder 控制台输出截断但包体落盘；随后独立检查 App 主程序、app.asar、云端资源、macOS 14.0 最低系统、codesign deep strict 均通过；使用这一包执行完整 npm run smoke:ui 成功，单独验证两个输入框实测等宽、Owner Key 合并卡片、手工配对码默认折叠；没有覆盖现有 App。构建命令返回码 1 的异常仍应单独定位，不能将第一次构建命令记作成功。
- 真实云端部署：auth Worker version 8ae01c7d-8e43-4e85-a2ca-95dce7a42e5b，OWNER_AUTH_KEY 更新前后均存在，未轮换；router Worker 单独发布成功，保留 KV/DO 与原有设备数据。线上 GET OAuth metadata=200、GET router /health=200、无凭据 MCP=401、无效 pairing poll=403（PAIR_INVALID）。
- 统一 UnifyHarness（不是旧 macHarness）实际 list_devices 已返回设备 unity.local / cu-5c6b94d1-3fef-47b7-855a-84fde8858c81 为 online=true，call_device_tool(get_harness_status,{}) 实际成功，工具状态 ready，报告 46 个本地工具。该 Mac 之前已有配对凭据，自动配对测试未覆盖真实未配对设备的首次授权；浏览器批准流程的端到端真实验收需在新设备进行，不能把模拟单测当作实机通过。

- 生产部署时先发布 auth Worker（只新增私有验证接口），再发布 router Worker；**不轮换 OWNER_AUTH_KEY，不触发 OAuth EPOCH 变动，不重新创建 KV/DO**。部署前后需验证 Worker Secret 存在和 OAuth 元数据、MCP 401。

## 2026-10-29 OAuth 授权页 Chrome 跳转停留修复

- 实际浏览器证据：POST /authorize 返回 302，Location 指向 ChatGPT OAuth callback，但页面停留在表单。Cookie 随请求正常发送，Owner Key 正确，问题不是 Cookie 或密钥。
- 根因：授权页面 Content-Security-Policy 采用 form-action 'self'；Chromium 对表单 POST 后的跨站 302 重定向也执行该策略，阻止到 ChatGPT 的导航。
- 修复：CSP 仅新增 https://chatgpt.com 为允许的表单重定向目的地，保留 default-src 'none'、base-uri 'none'、frame-ancestors 'none' 等安全限制。没有更改 Worker Secret、OAuth KV、Router Worker 或设备配对数据。
- Mac 本地 OAuth 专项 6/6 PASS，全量 npm test 为 636 项（620 PASS，16 SKIP，0 FAIL），Wrangler auth/router dry-run PASS。仅授权 Worker 部署成功，版本 7187c3e7-25d7-4b2d-969f-62b6f2b8b1ec；部署后 OWNER_AUTH_KEY 仍存在。
- 线上验证：新的授权 GET 为 HTTP 200；响应 CSP 允许 https://chatgpt.com 且原限制完整，授权 Cookie 设置正常。ChatGPT 实际 OAuth Callback/Token Exchange 仍待用户从 ChatGPT 新发起完整授权验证，旧标签页保留旧 CSP 不能复用。
- 改动保留在本地开发分支，未提交、推送或上传 CI 工件，保留其他已有未提交改动。

## 2026-10-28 既有 Cloudflare Owner Key 实机轮换

- 按用户授权执行：Mac 本地 Cloudflare 管理令牌有效、账户唯一、Workers 子域名及 OAuth KV 唯一；授权 Worker 和 Router Worker 均存在。
- 新 Owner Key 先用 Electron safeStorage 加密持久保存 pending，再由 Wrangler 通过 stdin 更新现有授权 Worker 的 OWNER_AUTH_KEY；不重建 Worker、KV 或设备列表，也不调整 OAuth epoch。
- 云端执行返回 phase=ready、remote=deployed、keyPersistedLocally=true；独立 Electron 进程重启后仍可解密，凭据记录 complete=true，无 pending 残留。密钥明文未输出到会话/日志。
- 桌面连接配置提供复制、限时 30 秒显示与手动轮换入口；轮换操作需要显式确认，旧 Owner Key 不再支持新授权，已签发 OAuth Token 不会自动撤销。
- 真正的 ChatGPT OAuth 重新授权尚待用户在客户端验收。本轮只执行 Mac 本机构建，不上传 GitHub CI 产物。

## 2026-10-28 Owner Key 授权指引更正

- 移除普通连接页 Owner Key 复制与显示按钮，并撤销上轮增加的敏感密钥读取/剪贴板 IPC，防止客户端暴露原文。
- Cloudflare Worker Secret 无法在部署后回显；新增 Cloudflare 控制台入口，仅核对 chattoharness-auth → Settings → Variables and Secrets 下 OWNER_AUTH_KEY 是否已配置。
- 初始化密钥生成于最初初始化的设备并本地加密保存。丢失后先查原设备或安全备份，不能直接从 Cloudflare 复制；如需轮换必须协调更新云端和本地，禁止重复初始化。
- 本地 macOS 14 上执行 Node 全量回归，并仅打包可直接运行的 .app；不生成 DMG、不使用 GitHub CI、不部署真实云端服务。

## 2026-10-28 Owner Key 入口常驻与 Mac 本地打包验收

- 「连接配置」新增常驻的 Owner Key 卡片、复制按钮和显式显示/隐藏；本机没有密钥时也能看到卡片和禁用的操作。密钥只在用户按下显示时通过本地 IPC 读取，30 秒后或窗口失焦立即清空；不会放入常规状态对象或日志。
- macOS 14.6.1 本机检查默认 LocalHarness 配置目录，cloudflare-bootstrap/credentials.json 不存在；当前 Mac 无法复制真实 Owner Key。不能从已部署的 Worker 地址反推出密钥，应从原始初始化设备找回，不得覆盖现有 Owner Secret。
- 本机专项测试 44/44 PASS；全量 npm test 632 项（617 PASS、15 SKIP、0 FAIL）。本机 CTH_DIST_SUBDIR=dev-ownerkey-20261028 npm run build 仅创建可运行 .app，不生成 DMG；最低系统 14.0 和 codesign 核验通过，隔离 GUI smoke PASS。真实 Cloudflare OAuth 未验收。
- 额外添加打包 GUI 检查：没有 Owner Key 时复制和显示按钮保持可见但禁用，并提示来源。已保留运行中的现有应用和用户配置。

# Development record — Windows computer use


## 2026-10-28 macOS 当前设备配对 Invalid URL 修复与实机验收

- **现象与原因**：macOS ChatToHarness 点击「配对当前设备」出现 `配对失败：TypeError: Invalid URL`。真实路径 `app/renderer.js` 读取 `#cloud-mcp-url`，`app/cloud-router-pairing.cjs:origin` 对空值执行 `new URL(mcpUrl)`，未捕获底层异常；Cloudflare 自动发现虽然提供 Worker 信息，但没有将已验证的远端 MCP URL 传给配对输入框。
- **修复**：`CloudBootstrap.status()` 在远端部署已验证时返回发现的 Worker MCP 地址；界面仅在输入未被手工编辑且为空时预填该地址，绝不覆盖手工输入。点击配对时先校验 HTTPS + 精确 `/mcp` 路径、无凭证/查询/fragment、43 位 URL-safe 一次性配对码；非法输入不发网络请求，并显示本地化的明确错误。底层 `origin()` 将空值或非 URL 统一转为 `CLOUD_PAIR_URL_INVALID`，不再泄漏 JS TypeError。
- **验证**：macOS 14.6.1（arm64）在提交 `22e02e784a89d0712ebfbd04a4b5d62b15054741` 上运行 `node --test tests/cloud-router-pairing.test.cjs tests/cloud-router-service.test.cjs tests/cloud-bootstrap.test.cjs tests/cloud-ui-layout.test.cjs`，**26/26 通过**。输出 `dist/mac14-pair-fix-20261028/ChatToHarness-0.8.1-macos-arm64.dmg`（约 354 MiB）；`LSMinimumSystemVersion=14.0`，`codesign --verify --deep --strict` 及 `hdiutil verify` 均通过。
- **真实打包版验收**：`CTH_DIST_SUBDIR=mac14-pair-fix-20261028 CTH_SMOKE_OUTPUT=.cache/acceptance/mac14-pair-fix-20261028 npm run smoke:installer` 在该 macOS 14.6.1 实机 **PASS**；挂载 DMG、复制并启动打包版 Electron，在 UI 点击「配对当前设备」对空地址、非法 URL、无效一次性码校验均通过（无 `TypeError: Invalid URL`），三语切换/加密保存等既有验收通过，卸载后隔离用户配置保留。
- **边界**：没有从真实 Cloudflare 获取并消费可用的一次性配对码，**不能宣称真实云端配对成功**。并未覆盖已安装 App 或真实用户配置；Mac 完整 `npm test` 曾在此前轮次失败/终止，本轮只有指定的 26 项与隔离安装 smoke 验收是已证实 PASS。测试包为 ad-hoc 签名、未公证，用户 Finder 下载后 Gatekeeper 流程仍需复验。

## 2026-10-28 macOS 14.6.1 云端设置新版 DMG 兼容验收（MacHarness 实机）

- **误区纠正**：先前 GitHub Actions 使用 macOS 15 runner，完成的打包/安装烟测只能证明那台构建机通过，不能声称 macOS 14.6.1 用户机器兼容。macOS 15 编译本身并不必然要求 macOS 15 运行；仍需同时检查最低部署版本、动态依赖、应用启动及 Gatekeeper/公证。
- **实机环境**：MacHarness 报告 macOS 14.6.1（23G93）、Apple Silicon arm64、Xcode 16.2。此前工作区干净，已在原分支 `feat/cloudflare-multi-device-router` fast-forward 到 `94b87a2`；没有创建 worktree、替换 /Applications 安装版或访问真实凭据。
- **问题与修复**：Mac 14 真包安装验收最初发现 `当前设备：尚未识别` 缺英语/日语翻译；修复后仍发现切换语言时 Cloudflare 账户和 KV 下拉框占位选项未重新渲染（`请选择`、`账户`、`创建新的`）。已分别补 `app/locales.js` 和 `app/renderer.js`，并为测试增加有界中文残留诊断及回归断言。
- **最终构建**：在 macOS 14.6.1 本机从提交 `94b87a26f7eb443d63148a1b9792956e9e0d2474` 构建 `dist/mac14-cloud-release-test-20261028/ChatToHarness-0.8.1-macos-arm64.dmg`（约 354 MiB）。App Info.plist `LSMinimumSystemVersion=14.0`；`codesign --verify --deep --strict` 和 `hdiutil verify` 均通过。
- **实机验收**：`node --test tests/cloud-bootstrap.test.cjs tests/cloudflare-discovery.test.cjs tests/cloud-ui-layout.test.cjs` 共 **20/20 通过**。使用独立测试配置通过 `CTH_DIST_SUBDIR=mac14-cloud-release-test-20261028 CTH_SMOKE_OUTPUT=.cache/acceptance/mac14-cloud-release-test-20261028 npm run smoke:installer`：真实挂载 DMG、复制 App、启动打包版 Electron、46 个可用本地工具、三语界面及凭据保持、窗口/连接管理、清理与卸载后保留配置均通过，返回 `installer:true,startup:true,uninstallRetainsData:true`。
- **边界**：macOS 14 上的完整 `npm test` 曾以退出码 1 结束（日志因输出限制截断），不能宣称完整本机测试通过；云端真实 Worker/Tunnel 未在本轮验证。DMG 使用 ad hoc 签名、未公证，且未通过带下载 quarantine 属性的 Finder 双击安装流程，Gatekeeper 是否弹出警告仍需用户最终复验。保留原本地安装版、历史 DMG 和配置，不自动安装。

## 2026-10-27 Cloudflare 多实例状态自动检查和连接页重排

- **位置**：连接配置依次显示「安全通道配置」→「多实例远端服务」→「多设备连接」。已有 Tunnel、代理及设备配对字段不改动。新增结构回归 `tests/cloud-ui-layout.test.cjs`。
- **自动发现**：页面加载自动经 preload/IPC 调用 cloud-bootstrap-discover。已有 Wrangler 授权时发现账户、workers.dev 子域名、OAuth KV；对已选择账户读取 Cloudflare Worker Scripts 清单。只有已认证清单证明两个脚本均不存在时才显示「已确认未部署」；没有授权、清单权限不足、超时和单纯公开 HTTP 404 均不能证明未初始化。远端另行只读检查 OAuth 元数据、Router /health 和未授权 MCP 401；本地 complete 记录不能代替实时检查。
- **安全边界**：已部署且本机无 owner key 时禁用初始化；本机保存但从未完成验证的 owner key 不直接提升为 ready；部分部署只有持有本机现存密钥时才允许尝试修复。未知状态不得执行覆盖部署，且不会在页面加载时自动弹出账户授权或部署。Worker 查询 token 不进入 renderer 状态和日志。
- **回归用例**：扩充 `tests/cloud-bootstrap.test.cjs` 与 `tests/cloudflare-discovery.test.cjs`，覆盖已部署/未部署/不完整/网络不可达、缺失或尚未验证的 owner key、Cloudflare 清单读取失败，以及安全通道版面与 discovery IPC。
- **验收状态**：改动由 GitHub 仓库接口直接提交到 `feat/cloudflare-multi-device-router`；HomeWinHarness 在本轮尝试中持续返回 `MCP SSE probe returned 429 from openai.org`。**尚未执行 Node 测试、真实 Electron/UI/Windows 端或实际 Cloudflare 端到端验收，不得标记通过**。恢复连接后执行 `node --test tests/cloud-bootstrap.test.cjs tests/cloudflare-discovery.test.cjs tests/cloud-ui-layout.test.cjs`，再执行 `node --test --test-concurrency=1 tests/*.test.cjs`；验证真实云端之前不得生成正式发布结论。未创建 worktree、安装包或 PR，未更改其他设备工作区。

## 2026-10-26 macOS 14 原生 helper 兼容修复（Issue #2，本地验收）

- **构建**：Swift 编译明确使用 `arm64-apple-macosx14.0`、`x86_64-apple-macosx14.0` 和 `MACOSX_DEPLOYMENT_TARGET=14.0`，通过 `lipo` 合并通用 helper。先在临时目录完成双架构编译与检查，再替换资源，失败时保留上次可用 helper。
- **构建门槛**：新增 `scripts/mac-helper-compatibility.cjs`；编译后、打包前、复制后及最终资源校验都用 `xcrun vtool -show-build` 要求每个切片 minos 为 14.0，并用 `otool -L` 校验经审核的系统框架/Swift 库名单，拒绝 `libswift_stdio.dylib`、未知库和 rpath 依赖。新增 SDK 依赖需要先在 macOS 14 审核，不能直接放宽名单。完整安装包继续为 arm64；现有 Node/Tunnel 固定下载尚不支持 darwin-x64，不能把通用 helper 宣称为通用应用。
- **诊断**：权限检查与长驻 helper 保留缺失组件、不可执行、架构不匹配、dyld/系统兼容性、超时和其他启动失败代码；stderr 有界读取，仅映射固定错误码，不回显私有路径。IPC、启动时权限弹窗和中英日界面保留具体原因，不再丢成通用 MCP 失败。未修改系统授权机制、Esc/STOP 或既有用户设置。
- **回归**：首轮完整 577 项为 564 通过、2 失败、11 跳过，两项旧打包夹具使用文本冒充原生文件而被新校验拒绝；改为实际二进制及 `codesign` 签名变更。最终完整 577 项：**566 通过、0 失败、11 跳过**；聚焦 44 项全部通过。新增覆盖不兼容/缺失切片/缺库、真实 helper 双切片权限查询、实际子进程 stderr 排空与失败码、界面与打包签名回归。
- **14.6.1 真机授权及 GUI**：初始屏幕录制 true、辅助功能 false；显式调用 `request_permissions`，用户在系统设置开启后重新查询，两项均 true。独立源码 helper 及同次包内 helper 最终均通过临时窗口截图、真实点击、输入/退格、滚动、可见轨迹、指针干扰恢复、同屏/跨屏拖动、松键、close_session、全局 Esc（保留目标窗口）。初次启动曾返回 CU_NATIVE_ERROR，第二次跨屏释放状态断言曾失败；未确认根因、未修改产品绕过保护，原始失败记录保留，后续独立运行通过。修饰键快捷键与实体 STOP 按钮点击仍未验收。
- **独立安装包**：`CTH_DIST_SUBDIR=mac14-compat-20261026 node scripts/build.cjs --dist` 生成 `dist/mac14-compat-20261026/ChatToHarness-0.8.1-macos-arm64.dmg`，267632086 字节，SHA-256 `8611260f267632b5f2901406fb771e8856c5dfa2d8fc955ab003f36961f3cec1`。包内六个相关应用文件与当前源码逐字节一致；包内 helper 两切片 minos 14.0、无 libswift_stdio；应用 `codesign --verify --deep --strict` 和 `hdiutil verify` 通过。隔离配置启动同次 Electron 应用，真实权限 IPC 成功；dyld 缺库夹具经真实 IPC 保留 CU_HELPER_OS_INCOMPATIBLE，控制保持关闭。验收实例与临时窗口均已关闭。
- **边界**：未安装/覆盖 `/Applications/ChatToHarness.app`，未改现有配置，未创建 worktree、提交、push 或 PR。当前签名为 ad hoc，未公证；原生 Intel、精确 14.0、其他系统、安装后 TCC 身份、远端 CI、真实 ChatGPT 全链路未验收。权限属于实际进程/应用身份，当前授权不保证新安装副本已有权限。
- **证据**：[结构化报告](evidence/macos14-compatibility-2026-10-26.json)；原始日志位于 `.cache/acceptance/mac14-20261026/`。完整测试命令为 `node --test --test-concurrency=1 tests/*.test.cjs`。真实 GUI 验收显式执行 `node scripts/test-computer-use-macos-interactive.cjs --confirm-real-gui-input`；可用 `CTH_MAC_HELPER` 指定包内 helper 的绝对路径（会在临时窗口发送真实输入）。


## 2026-10-25 代理配置上游 PR 提交前验证

- 上游 `DJ-Huang/ChatToHarness:main` 与本地基线同为 `1cddb2d`；当前分支原地提交，通过 fork 的独立远程分支提出 PR，不使用工作树、不更新 fork/main。PR 标题及说明使用中文。
- 完整串行回归 567 项：540 通过、10 失败、17 跳过。8 项在既有安全测试创建符号链接时遇到本机 EPERM；2 项在既有 stdio/task 测试清理 Windows Unicode 临时目录时遇到 EPERM。代理认证、设置持久化及界面相关用例通过。原始日志：`.cache/acceptance/proxy-pr-full-tests-20261025.log`，不把环境失败改为通过。
- 将代理界面验收脚本接入现有 Windows/macOS 打包 CI；默认测试同次打包应用，`--dev` 可选择开发入口，显式 `CTH_EXECUTABLE` 仍可指定已生成应用。中文草稿 PR 将完整披露本地环境限制，双平台 CI 通过后才转为待评审。

## 2026-10-25 按标注精简代理设置页

- 按用户截图移除页面副标题、卡片内重复标题与说明、服务器格式说明及底部通道说明。返回入口移至页面顶部并改成带箭头的“返回”按钮；页面仍保留单一标题与正确的区域关联、进入/返回焦点。
- 三个连接方式在桌面宽度并排显示。移除认证开关，手动配置中直接并排展示用户名和密码选填框；均为空时不启用认证，填写时沿用现有认证、记住密码与清除密码逻辑。将绕过列表提示放到“不走代理的地址”标签后，保留恢复默认功能。
- UI/i18n 回归 27 项通过；开发版隔离 Electron 验收通过，额外核对顶部返回、无重复标题、三个模式同行、凭据同行且无 required、提示位于列表上方，以及空凭据不启用认证。原有 HTTP/SOCKS5 认证、保存取消、加密、重启恢复、转接清理及三语流程继续通过。报告/截图位于 `.cache/acceptance/proxy-layout-20261025/`。未操作用户安装版配置。
- 新安装包位于 `dist/proxy-layout-20261025/ChatToHarness-0.8.1-windows-x64-setup.exe`。同次打包应用的上述验收全部通过，四个更新的界面文件与包内逐字节一致，应用已关闭；报告及截图位于 `.cache/acceptance/proxy-layout-packaged-20261025/`。另有 12 项真实代理认证/Tunnel 回归通过。未执行安装或真实云端连接。

## 2026-10-25 常规代理页、认证与连接测试

- 将代理模式改为单选分组，按模式展开手动服务器、类型与端口。补充身份验证开关、用户名、密码、显示/清除密码及记住密码；密码独立使用系统加密存储，未记住时仅在当前进程保留，不回显到公开状态。密码与服务器/用户名绑定，更换目标后不复用旧凭据；仅替换密码也会停止旧连接。
- 增加本机/局域网绕过选项、草稿连接测试与保存/取消。测试不保存、不使用 Runtime API Key，区分认证、超时、DNS、TLS 和目标失败；401/403 只证明网络可达。取消和离开代理页清除输入的密码，代理页内回车只保存，不触发通道连接。同步三语帮助和界面。
- 实测发现当前 Tunnel 拒绝 SOCKS5 URL（此前参数夹具未覆盖此能力）。新增仅监听回环、随机凭据保护且限制通道目标的 SOCKS5 转接；HTTP/HTTPS Basic 与 SOCKS5 用户名密码均以真实协议握手验证。代理凭据通过环境变量引用传递，不出现在启动参数中；转接在停止、失败、重配和退出时关闭。
- 新增 12 项认证测试，包含错误密码、HTTP/HTTPS/SOCKS5 到真实本地 TLS 目标、证书验证、绕过、超时、转接授权/目标限制/清理及真实 bundled Tunnel 认证，均通过；测试证书仅用于本机夹具，没有安装到系统信任库。设置中的代理/加密用例 5 项通过，UI/取消聚焦复核 42 项通过。
- 组合回归首轮 78 项为 77 通过、1 平台跳过；后续同组 76 通过、1 失败、1 跳过，失败为既有 stdio 夹具删除 Windows Unicode 临时目录时的 EPERM（该项独立复测通过，但组合失败保留）。不宣称完整套件通过。
- 开发版及最终 `dist/proxy-auth-final-20261025/win-unpacked/ChatToHarness.exe` 均使用隔离配置完成真实 Electron IPC 验收：认证失败/成功、测试不保存、加密保存、回车行为、取消清密钥、绕过、三语、凭据环境引用、转接启停、密码替换、重启保存及会话密码失效全部通过。包内 11 个相关文件与源码逐字节一致。最终报告/截图位于 `.cache/acceptance/proxy-auth-packaged-20261025/`；业务 Tunnel 使用本地夹具，不代表真实云端连通。未安装或替换用户现有版本。
- 最终安装包 `ChatToHarness-0.8.1-windows-x64-setup.exe` 为 213971164 字节，SHA-256 `47cd03f8905b34761265120a59968fe0cdd92372298e134f0b0dc5b5f73cfdda`；同次应用 asar SHA-256 `3a615517bf466e1e4bf144d56771fad3cf9a9f73f0982b8b3a4d8392cc0ae3da`。

## 2026-10-25 完整代理设置与本机网段绕过

- 代理设置支持直连、系统、手动三种模式；手动支持 HTTP、HTTPS、SOCKS5 和独立服务器/端口。不走代理列表支持域名后缀、通配域名、IPv4/IPv6 与 CIDR；默认包含 localhost、环回、常见私网与链路本地范围，并按当前网卡的真实前缀生成本机同网段（包括非 /24 与 IPv6）。恢复默认地址会重新读取当前网卡。
- 增加配置校验与持久化，兼容旧 useSystemProxy；代理设置可在没有 Tunnel 凭据时单独保存，保留其他未提交草稿。安全通道连接先匹配绕过规则，再选择系统或手动代理；显式直连及绕过结果不受继承的 shell 代理影响。设置范围为安全通道，不修改操作系统代理。同步中英日界面和帮助。
- 聚焦回归 48 项，47 通过、1 平台跳过；设置中的代理及加密保存 3 项通过。打包应用隔离验收覆盖默认模式/网卡网段、无凭据保存、非法端口不覆盖、恢复默认、重启持久化、三种手动协议参数、绕过覆盖显式代理、清理继承代理、系统/直连、三语及关闭清理，首轮通过。截图检查后补齐端口字段样式，并重新生成最终包复核。
- 初轮完整设置包位于 `dist/proxy-settings-full-20261025/`；最终包位于 `dist/proxy-settings-complete-20261025/`。隔离验收报告与截图位于 `.cache/acceptance/proxy-full-packaged-20261025/`。Tunnel 使用本地夹具，协议验收证明参数及路由选择，不代表真实远端代理或云端连通；未执行安装。
- 最终 Windows 安装包已生成并重新启动同次打包应用复核，上述隔离验收全部通过；安装包 213930257 字节，SHA-256 `0934d470ded17999876f774b710e9a2c2b85496a02d8000d0ac15af0f3e45bfb`；已测试 app.asar SHA-256 `f036ed52afabd61689a11356928231e89631680684dc0eac67aba5bf8663bd10`。保留现有用户安装版及配置，测试实例已关闭。

## 2026-10-25 代理设置 Windows 打包测试

- 使用当前工作区生成 `dist/proxy-settings-20261025/ChatToHarness-0.8.1-windows-x64-setup.exe`，213912408 字节，SHA-256 `f6ca8d61caff18f8f3b8d04d1231a297ac5aae575cfbfffb407bca79b4f04cdf`。构建组件校验通过；没有执行安装或替换用户安装版。
- 从同次生成的 `win-unpacked/ChatToHarness.exe` 启动隔离 Electron 实例，使用真实 preload/IPC、系统加密存储、系统代理解析及本机工具，远端 Tunnel 用本地健康服务夹具替代。入口与设置子页、默认关闭、返回保留草稿、保存后的代理参数、重启自动连接与代理状态恢复、关闭代理后不再传参数且重启仍关闭、三语切换、无渲染异常均通过，测试应用已关闭。
- 首次夹具在关闭代理后读取到旧连接参数文件，断言失败；改为清除本测试独占的旧报告并等待新子进程生成参数后复测通过，未修改应用代码。应用 asar SHA-256 `86dc4d0f2f470ae567cbd91d2790b952aeac1e79c6ef702b96e87eda9236ac8f`。报告及截图：`.cache/acceptance/proxy-packaged-20261025/`。这不是安装程序执行验收或真实云端连通验收。

## 2026-10-25 代理配置入口与设置子页

- 自动连接右侧改为“代理配置”按钮，点击进入独立“代理设置”子页；系统代理复选框移到子页，默认关闭，沿用原配置保存及连接逻辑。子页提供返回连接配置及保存并连接，切换页面保留草稿，进入和返回时恢复适当焦点。
- 侧栏保持连接配置选中，键盘导航沿用连接配置位置，子页帮助沿用连接配置文档，中英日翻译同步。
- mcp-ui/i18n/system-proxy 共 27 项通过；Edge 无窗口浏览器验证入口、子页、焦点、返回保留草稿、保存后连接及重载、窄屏无溢出、三语切换，均通过。报告及截图位于 `.cache/acceptance/proxy-settings-subpage-20261025/`；浏览器接口为隔离模拟，不代表真实云端连接验收。

## 2026-10-25 本地代理配置入口完善

- 后续自测：五个相关测试文件共 55 项，52 通过、2 失败、1 平台跳过；两项失败均在既有配置测试创建符号链接时遇到 Windows EPERM，保留失败结果。代理默认关闭、旧配置兼容、配置持久化、解析及连接参数传递用例通过。
- Edge 无窗口浏览器加载实际页面资源、使用隔离模拟 IPC，验证右侧同排、默认关闭、先保存后连接、重载恢复、680px 换行无横向溢出、中英日切换及无页面异常；均通过，并人工查看宽窄截图。报告与截图位于 `.cache/acceptance/proxy-page-20261025/`。不代表 Electron 原生 IPC 或真实云端代理连通验收。
- 保留连接配置页中位于自动连接右侧的“应用系统代理”入口，默认关闭；补充“连接时读取系统代理，保存并连接后生效”说明和辅助描述关联，中英日同步。宽度不足时选项自动换行。
- 沿用已有设置持久化和系统代理连接链路，增加渲染器行为回归：旧配置默认关闭、后台更新保留未保存选择、先保存后连接、重新加载恢复已保存选择。
- 本轮聚焦验证：system-proxy/runtime/i18n/mcp-ui 共 43 项，42 通过、1 平台跳过；settings 的 system proxy 用例 1 项通过；git diff --check 通过。这些是本地代码与隔离夹具验证，未进行真实桌面或云端连接验收。

## 2026-10-24 连接配置：可选应用系统代理

- 在“打开应用时自动连接”右侧添加“应用系统代理”，默认不勾选；配置保存、旧配置兼容、草稿保留及中英日翻译同步接入。
- 勾选后，每次连接由 Electron 独立 session 按系统设置解析 OpenAI 控制端地址，支持系统静态代理及 PAC 解析结果；选择首选代理或 DIRECT，通过 `--control-plane.http-proxy` 显式传入 Tunnel，并沿用到自动重试。不支持的类型或无效解析结果明确报错。未勾选时保持原有网络行为。
- Windows 无窗口实机读取返回 `PROXY 127.0.0.1:7897`，转换为 `http://127.0.0.1:7897`。连接、参数传递、默认关闭、设置持久化、旧配置兼容及翻译已有聚焦回归；runtime/system-proxy/i18n/mcp-ui 共 42 项，41 通过、1 平台跳过。配置套件最初另有代理 URL 解析失败，已修正并通过代理测试；原有两项符号链接测试受 Windows EPERM 限制，仍保留失败。
- 本地应用构建输出到 `dist/system-proxy/win-unpacked`，使用已解压 Electron 的 `CTH_ELECTRON_DIST`。未操作运行中应用的选项或宣称真实云端连接、可见界面验收。

## 2026-10-24 PR #19：修复插件抽屉遮挡本机确认

- 提交 `e298b12` 的网站、双平台完整单元测试、打包、工具验收和长任务恢复均通过；随后 macOS / Windows 安装包界面验收在同一处失败：插件管理模态抽屉遮挡了全局“允许此次调用”按钮，导致真实点击超时。
- 将同一个本机确认区域放入当前打开的管理抽屉，关闭时恢复到原来的全局位置，保持待确认请求和按钮事件原样。没有复制确认内容、自动允许请求或绕过模态输入保护。
- 新增回归覆盖待确认请求在打开/关闭不同插件抽屉时的位置、关闭不授权、原按钮继续解析正确请求。保留既有安装包真实点击验收，不用强制点击或测试侧关闭面板掩盖问题。按用户要求不在本地补跑，交由新提交的远端 CI 验证。


## 2026-10-24 PR #19：取消帮助文档章节数量限制

- 三个 CI 任务在提交 `7901f8a` 均因同一根因失败：帮助构建器按二级标题的位置分配六个固定链接，并强制章节数等于六；新增 Computer Use 章节触发同一组七项网站相关失败。
- 按用户后续意见取消固定数量和顺序要求。现有三语标准标题按名称保留 `goal / before / steps / result / troubleshooting / next` 链接；其他二级标题自动生成独立目录链接，重复标题使用唯一后缀。搜索摘要优先取目标章节，允许任意数量、自定义标题和重新排序。文档原有新增二级标题保持不变，作者指南的六段结构改为建议。
- 新增两项兼容检查，覆盖三语插入/重排后旧链接与摘要、零个/一个/多个章节、重复标题和 Unicode 标题；没有放宽链接安全或 HTML 转义。
- 初步按旧结构临时调整文档后的本地网站检查为 26 通过、1 失败；失败是运行环境不允许向工程构建目录写入产物。该临时文档调整已撤回，最终采用构建器修复。用户明确选择“不在本地补跑”后，没有再次运行本地测试；最终结果以新提交的远端 CI 为准。


## 2026-10-24 统一插件列表与插件管理

- 按用户确认的收敛方案移除“已安装 / MCP 服务”并列目录。Computer Use 和已有外部服务共用一个插件列表，以“内置 / MCP”标签区分。现有 MCP 配置及授权数据原样使用，没有存储格式迁移或自动启停。
- 外部插件“管理”在同一右侧抽屉提供“概览与权限 / 连接配置”；仅显示选中的服务，保留测试连接、显式信任、启停、删除复核、工具及项目授权。后台状态更新不替换未保存配置，关闭后清除未保存的密钥。错误在抽屉内可见，列表展示真实连接阶段。
- “添加插件”提供 MCP 接入和配置导入；“插件设置”独立管理明确影响全部 MCP 插件的允许所有工具开关与不含密钥的导出。权限模型及既有安全后端未改动。
- **聚焦检查**：首次同一组 14 项检查中 12 通过、2 失败，发现“已启用”状态翻译缺失、旧夹具错误地为只读权限检查传入参数；补齐翻译并修正夹具。用户明确同意补跑后，同一组 **14/14 通过**，包括选中插件的权限操作只作用于该插件、草稿保留、关闭清密钥、导航不授权、导入不启用、显式信任及三语目录。未扩大到完整测试或安装验收。随后只修正全局设置提示中的方位措辞。
- **真实开发界面**：重启当前开发实例，核对单一列表、添加插件的两个入口、MCP 接入表单、单独的全局权限及导出入口；未保存样例服务或操作权限开关。Computer Use 列表仍显示已启用，通道就绪。外部多插件选择和权限路由由上述隔离夹具验证，未宣称真实外部服务验收。
- 更新三语使用说明及既有 UI / 帮助截图脚本的导航入口。改动仍在当前分支，未提交、推送、打包或安装。


## 2026-10-24 插件页内右侧管理面板

- 根据用户后续澄清，移除侧栏独立 Computer Use 页面；点击插件“管理”在原插件页打开右侧管理抽屉。Computer Use 开关与系统权限、MCP 添加/编辑配置共用抽屉，关闭时保留原插件标签，清除未保存的敏感配置输入。支持关闭按钮、Esc、点击遮罩及原生 dialog 焦点约束；权限提示仍作为独立顶层确认弹窗。
- 已从开发版菜单重载，真实界面核对：左侧无独立 Computer Use 入口；“插件 → 已安装 → 管理”展开右侧面板，背景仍为插件页；关闭后仍选中“已安装”，焦点返回“管理”。开关保持用户先前确认的开启状态，屏幕录制与辅助功能均显示已授权。后续 UI 操作检测到用户正在改变窗口，未继续争抢操作。
- 更新三语使用说明及既有界面验收脚本入口。JavaScript 语法与 diff 空白检查通过；这是可逆界面布局调整，未新增或运行测试套件。本次未更改权限检查和开关后端，也未创建桌面控制输入会话。


## 2026-10-24 开发版 Computer Use 授权与插件入口

- 当前分支 `codex/release-v0.6.2`，基于合并提交 `379b2c4` 原地修改；不使用工作树、不改版本号、不提交或推送。
- 新增可执行 `dev.sh`，复用 `Start.sh --dev`。macOS 缓存开发包设置独立 `local.localharness.mac.dev` 标识及权限用途说明，保留 npm Electron 原件、用户数据目录和钥匙串身份。实际系统权限仍取决于应用及启动来源，不能将宿主进程中的结果外推到其他启动方式或安装包。
- 侧栏 MCP Servers 调整为“插件”，含“已安装 / MCP 服务”标签；内置 Computer Use 卡片链接至独立 Computer Use 设置页。原有 MCP 配置、导入导出、信任和逐项权限沿用原接口。新增只读权限检查接口，不会因检查成功自动启用控制；检查到已启用服务权限撤销时停止控制。授权提示改为原生 HTML dialog，保持聚焦、Esc 关闭及停止后不自动重放输入。
- 参考 OpenAI 官方文档 https://learn.chatgpt.com/docs/computer-use 的插件管理与独立 Computer Use 设置入口。当前客户端禁止自动读取自身窗口，因此未声称做了 ChatGPT 窗口逐像素对照。
- **验证**：`tests/dev-app.test.cjs`、`tests/computer-use-permissions.test.cjs`、`tests/computer-use-toggle.test.cjs` 共 17 项通过；JavaScript / shell 语法与 `git diff --check` 通过。既有 MCP UI 夹具、界面验收脚本和帮助截图脚本已适配新导航和 dialog；未扩大运行这些测试，也未运行完整测试或安装包验收。
- **真实开发界面**：通过 `dev.sh` 启动当前源码，核对插件两个标签、独立开关及权限状态；点击“检查权限”后仍保持关闭。当前实例显示屏幕录制、辅助功能均已授权。用户当次明确回复“打开”后才打开“允许控制电脑”；真实界面显示已启用，持久化 `computerUseEnabled=true`。重新连接后的实际 MCP 目录包含 `computer_use`，连接与工具健康为 ready，共 47 tools。
- **边界**：这是当前 macOS 开发实例的界面、授权检查和工具注册验收。没有创建 Computer Use 输入会话或执行鼠标/键盘任务，没有验证 Windows、其他启动来源或安装版；自动化检查不能替代这些验收。修改后保留开发实例运行及用户确认的开启状态。


## 2026-10-23 用户更新后的安装版整体验收

- 安装目录的 app.asar、独立适配器及 native helper 与交付包哈希一致；真实 connector 返回该构建指纹、ready、46 tools。结束时生产 connector 确认 `closed:true`。
- SDK 经仓库真实 Gateway/Manager 调用安装目录 stdio/native：原生 HUD 精确显示用户提供的聊天标题；会话复用名称更新、六段从窗口外开始的真实移动通过，独立采样最大倒退 0px，日志 839 条/421 次 move_step，无任务或聊天标题。不能据此认定间歇抖动已修复。
- 安装版真实拖动位移预期/实测均为 (+36,+32)；遮挡恢复与拒绝、瞬态重新规划、慢速接管让渡、HUD 避挡、STOP、通用任务 ID 完整往返与自动关闭通过。全局/逐窗口授权两组中文输入、失焦保护、最小化恢复、截图分块通过（8463654 字节、33 块，重组摘要与解码均核验）。各组 cleanupClosed 均为 true。
- 安装版 Electron Playwright 主界面验收通过，使用隔离配置与模拟隧道；语言、导航、凭据持久化、重启、MCP 管理、审批、日志与清理通过。它不是远程真实隧道端到端验收。
- 原生夹具首次因反射调用漏传 Inject 的 allowHeld 参数失败；保留原日志，仅修正测试传入 false 后重跑，PNG、Unicode、按键、点击、滚动、几何/焦点保护、生产授权、辉光、STOP/Esc 全部通过。未改变安装程序。
- **仍开放**：原鼠标跳回根因、本聊天客户端缓存缺少 conversation_title 参数、跨屏/macOS 原生体验；此前全量 9 项失败不被本轮覆盖。证据见 [安装版验收记录](evidence/computer-use-installed-2026-10-23.json)，原始日志位于 `.cache/acceptance/computer-use/installed-*-20261023.*`，界面报告位于 `.cache/acceptance/installed-ui-20261023/`。

## 2026-10-23 日志修复构建安装包及整体回归准备

- [x] 用户要求生成安装包后自行更新，再进行整体测试。使用独立目录 `dist/computer-use-logs-20261023/` 构建，不替换运行中的应用、不执行安装或卸载，不改版本号、不推送。
- [x] `node scripts/build.cjs --dist` 生成 `ChatToHarness-0.7.3-windows-x64-setup.exe`，大小 **213400736 字节**，SHA-256 **46255d972fe3cd14f6258a24969949425f74d8a55cececae7cde5117ecf56a3f**。应用源码指纹 `1df5c87fc987e4a51a08b5e9b307983b0450b34d3dc64b73e2503376c5d36bf6`，Git 检查点 `7db29d4e2d72333d97b6b1afb501116b46b5dadc`，包含当前未提交修复。
- [x] 打包资源逐项 SHA-256 核对通过；`app.asar` 包含真实聊天标题字段、原会话名称更新和日志路径状态；原生组件含日志实现。构建程序完成 NSIS 及 blockmap 生成；没有把打包成功等同于安装验收。
- [x] 全量测试中修正三项过时断言：Windows 打包夹具缺少必需 native helper、Mac HUD 仍引用旧尺寸/标签。另两项运行时测试的 HOME 预期未覆盖 Windows USERPROFILE 回退，改正后该组 **8 通过 / 0 失败 / 1 跳过**。这些修改仅影响测试，不改变安装包中的应用源码。
- **已保存结果**：首次并行全量测试 402 通过、12 失败、14 跳过；修正首批过时断言后的串行全量为 412 通过、10 失败、14 跳过，其中 8 项 EPERM 符号链接权限失败，2 项为随后已修正的 HOME 预期。最终复核结果以 `.cache/acceptance/computer-use/full-suite-final-20261023.log` 和输出目录 `verification.json` 为准；未将环境失败改成跳过或报告为通过。
- **最终全量**：436 项，**413 通过、9 失败、14 跳过**；8 项为 Windows 符号链接 EPERM 权限限制，另 1 项为任务取消夹具等待终态超时。任务取消项随后单独复测通过，仍保留全量中的失败记录，不据此称全量通过。安装包及测试摘要：[交付凭据](evidence/computer-use-installer-2026-10-23.json)。
- [ ] **待用户更新后的实机整体验收**：确认实际安装版构建指纹及工具 Schema 刷新，检查连接、窗口授权、真实聊天标题、鼠标从窗口外进入的轨迹和日志、文本/键盘、拖动、输入中断、STOP/Esc、任务 ID 完整链路与会话关闭；跨屏和 macOS 原生验收仍需各自硬件。鼠标回跳根因保持开放。

## 2026-10-23 无人操作、窗口外指针回跳：增加诊断日志（Issue #2）

- **用户澄清**：没有人在移动鼠标；异常是鼠标从目标窗口外朝目标移动一小段后返回原处。本轮不再把该反馈归因于用户接管。用户随后要求先添加日志，供下次复发调查；回跳根因保持开放。
- **范围**：Windows 原生本地有界 JSONL 日志；保留既有输入后端与恢复策略。本轮试验性的 SendInput/所有权采样方案没有纳入最终日志改动；全局钩子方案被自动审批拒绝且未应用。用户要求停止 REA 后不再使用该工具。
- [x] 原生日志记录动作/会话关联、构建 MVID、显示器、计划坐标、立即实测坐标、下一帧差异、重算次数、窗口外状态、DPI、辉光位置和鼠标释放结果。差异原因记为 `unknown`；不记录文本、按键内容、标题或截图。
- [x] 独立写线程、有界队列、同用户多 helper 写入互斥、每份 4 MiB 的当前/上一份轮转日志；磁盘不可用时不影响输入和 STOP。日志位于 `%APPDATA%\ChatToHarness\logs\computer-use-pointer\`；服务状态可返回路径。
- [x] **聚焦回归**：90 项，86 通过、0 失败、4 项 macOS 专属跳过。包括真实 C# 编译、并发写入、轮转大小、磁盘不可用、路径元数据和原有输入/任务生命周期。沙箱目录的首次轮转测试失败，同一测试在真实 Windows 文件系统通过；未将沙箱失败报告为通过。
- [x] **真实桌面日志验收**：六段移动均从目标窗口外开始，没有注入偏移；均完成、独立轨迹采样最大倒退 0 像素、`cleanupClosed=true`。本会话落盘 **982 条记录 / 464 条 move_step**，日志未包含测试任务/聊天名称。日志捕获 **8 次 pointer_mismatch / 8 次 move_replan**，立即写入与读取一致，但部分下一轮读数不同；不能从该现象推定人类输入或认定根因。原始日志保留在本机目录。
- [x] **部署**：用户明确选择“1（现在启用日志）”后，于北京时间 2026-10-23 16:01 仅替换安装目录原生 helper 和 `bundle.json` 对应校验值。组件 SHA-256 为 `97316318f4721eb568d69cc75accbc2bfdf14f4c3509600d5f8a97af31305055`；原生会话为空，四个应用 PID `[7724,14156,20816,31364]` 前后完全一致，主 `app.asar` 校验值未变，无应用重启。旧文件及凭据备份于 `.cache/hotfix-backups/pointer-logging-20261023-080137-993/`；下次会话自动记录。首次原子替换因 PowerShell 空路径参数失败且未改文件，改为明确备份路径后成功；安装后再次独立核对组件与清单一致。旧聊天标题构建的整体安装仍未执行。证据见 [日志及部署记录](evidence/computer-use-pointer-logging-2026-10-23.json)。

## 2026-10-23 当前聊天真实标题传递修正（Issue #2）

- **用户确认的真实聊天名称**：“继续修复 Computer Use 问题”。此前验收只传入测试任务标签，HUD 的“任务”显示通过不代表“聊天”标题通过；该覆盖缺口已明确纠正。产品代码不硬编码这一个标题。
- [x] `conversation_title` 接受宿主元数据或用户明确提供的确切标题，保持与 `session_title` 任务描述独立；未知时不猜测。
- [x] 修复 `open_session` 复用原会话时静默丢弃新标题的问题。仅在原生会话空闲时串行更新私有 HUD 元数据；输入/任务执行中返回 `CU_BUSY`；不重开窗口授权、不消耗截图观察、不重放 GUI 输入、不把名称写入一般状态结果。
- [x] 六个聚焦回归文件：**87 项，83 通过、0 失败、4 项 macOS 专属跳过**。新增真实标题补充、保留已有标题、原生输入互斥和错误目标拒绝测试。首次新增测试使用非数字窗口 ID 导致预期错误，改用有效窗口 ID 后通过。
- [x] 真实 Windows MCP SDK → Gateway → native：`--atomic-drag --title-only --conversation-title=继续修复 Computer Use 问题` 退出 0，原生标签逐字匹配 `聊天：继续修复 Computer Use 问题`，会话复用更新任务名通过，`cleanupClosed=true`。报告 `.cache/acceptance/computer-use/windows-conversation-title-result.json`。这是显式传入标题的真实验收，不宣称自动读取 Codex 侧栏名称。
- **当前安装版差异**：本轮开始时运行的是 `D:\\Program Files\\ChatToHarness` 中 0.7.3 / commit `a9ba8eac27eb404c71ff948b8e6592bdd26eb22a` 构建；当前连接工具 Schema 不含 `conversation_title`，仍有旧版 session_title 描述。源码修复本身不会更新该运行进程或外部客户端缓存。

## 2026-10-23 指针接管、释放结果和标题契约后续修复（Issue #2）

- **范围**：当前 `feat/computer-use` 分支；修改 Windows 原生代码、双平台工具描述和验收夹具。未改版本号、未替换安装版、未推送；不使用工作树。
- [x] **慢速用户接管**：旧逻辑把每 25 毫秒不超过 2 像素的持续移动累计为静止，可能恢复合成输入争抢鼠标。现在任何坐标变化都重置静止窗口，连续静止 320 毫秒才重算路径，持续运动在本地有界等待后返回可恢复冲突。动作路径基于 Windows 实际接受的指针坐标比较下一次采样，避免坐标量化导致错误重算。
- [x] **释放失败**：分步 `mouse_up` 检查 `ReleaseHeldMouse()` 返回值；释放失败返回 `CU_INPUT_FAILED`，不再错误报告成功。此失败分支尚未通过真实 SendInput 故障注入验收。
- [x] **双平台标题**：删除 Windows/macOS 对共享 `session_title` Schema 的过时覆盖；任务名称必填，真实聊天标题仅使用可选 `conversation_title`。修正 macOS 描述中要求省略任务名称的矛盾提示。
- [x] **回归**：七个聚焦测试文件共 **86 项：82 通过、0 失败、4 项 Mac 专属跳过**；包含真实编译 C# 的静止窗口逻辑测试（慢速持续运动、1 像素来回运动、短暂偏移后恢复）。Windows 原生 helper 编译通过。沙箱内任务检查点测试超时；同一测试集在沙箱外通过，不能将前者算作通过。
- [x] **真实 Windows 桌面**：MCP SDK → Gateway → native 隔离窗口；窗口内及窗口外 12 个样本的系统指针稳定、辉光对齐；真实拖动 `(36,32)`、遮挡恢复、短暂指针重规划、HUD 避挡、STOP、任务 ID 全链路和自动关闭已通过。逐窗口模式的慢速接管测试（每 25 毫秒移动 1 像素）确认返回 `CU_USER_INPUT_ACTIVE`，原会话继续有效并可重新观察。
- **诊断限制**：早期样本在未开启 Computer Use 的对照组也观察到指针返回原位，无法将用户原始跳回反馈全部归因于辉光。最后稳定样本来自单显示器；跨屏人工混合轨迹、安装版及 macOS 原生验收仍未完成，原始反馈不标记为全面解决。
- **验收脚本**：增加独立系统指针/辉光坐标采样、未开启服务的对照组、慢速接管测试和失败后显式关闭检查；修正逐窗口模式 STOP 后第二次开会话缺失的本地授权步骤。完整最新结果见 `.cache/acceptance/computer-use/windows-atomic-drag-result.json`。
- **最终逐窗口验收**：`node scripts/test-computer-use-mcp.cjs --atomic-drag --per-window` 退出 0；慢速接管、拖动、遮挡、STOP、第二次授权、任务全链路及自动关闭全部通过，`cleanupClosed=true`。包含源码 SHA-256 的摘要：[验收证据](evidence/computer-use-pointer-per-window-2026-10-23.json)。

## Generic GUI Agent ID and session-name contracts — 2026-10-23

- **Issue / branch:** ChatToHarness #1 / `feat/computer-use`; Windows repository `D:\\proj\\github\\ChatToHarness`. No macHarness, real pointer input, version bump, installation or push.
- [x] **Public task IDs:** Both general GUI and compatibility window-move tasks now use persistent Harness device UUID + 13-digit Unix epoch millisecond timestamp; same-millisecond collisions append a sequence number. No legacy `cu_agent_<hash>`/`cu_task_<hash>` API compatibility. Stable idempotency hashes remain private filesystem indices; duplicate start recovers the original task, conflicting payload is rejected. `task_id` input schema, status, cancel and decision calls all use the same validated format.
- [x] **AI session naming:** `open_session` requires a truthful human-readable `session_title`; use known real ChatGPT/Codex title or an accurate task description, never a guessed conversation title or UUID. Native HUD title is sent through already-authorized private stdio.
- [x] **Planner context wiring:** MCP Gateway forwards a per-connection Sampling Planner through Manager → HarnessServices → ComputerUseSwitch → BaseComputerUse to the specific started Agent task. Never stash a different client's Planner on a shared controller. Without Sampling, task safely awaits an external decision.
- [x] **Regressions:** 119 Computer Use mock regression tests: **115 PASS / 0 FAIL / 4 SKIP** (Mac-only on Windows); JS syntax and `git diff --check` PASS. Includes per-client Planner forwarding, device identity, readable task ID allocation and collision, same-key idempotency, required session name, stop/consent, macOS/Windows contracts. Real model Sampling after tool return and GUI task completion remain unverified.
- [ ] **Full npm test:** fails in this Windows environment. Observed `EPERM` on Windows test-created symlinks under `D:\\system_folder\\Temp` and `Bundled computer-use resources are missing` in Windows packaging-config test. Do not report full suite as passing or treat these failures as Computer Use regressions without independent reproduction.
- [ ] **Open:** real installed-client Sampling in ChatGPT/Codex, Windows/macOS native end-to-end dynamic interaction, cross-application authorization transitions, full npm test and new installation package. Do not treat mock suite or test build metadata as release acceptance.

## Computer Use device-time task IDs and readable titles — 2026-10-23

- **Issue/branch:** ChatToHarness #1, `feat/computer-use`; Windows checkout, no macHarness, no live desktop input, no installer/version update.
- [x] Generic and window-move TaskRunner IDs now use registered device ID + 13-digit millisecond time + optional collision sequence. A private idempotency index prevents duplicate work after lost replies. Legacy hash task IDs are intentionally unsupported.
- [x] New task IDs are accepted consistently by MCP input schema, runtime validation, task get/cancel/decision handlers and Windows/macOS packaging manifests.
- [x] AI must send a human-readable `session_title` with each `open_session`, describing the real current task; names are shown by native HUD via private stdio, not fabricated from unknown conversation metadata.
- [x] The app-owned MCP Gateway forwards a client-scoped optional Sampling Planner into the generic Computer Use task; no shared mutable global planner reference.
- [x] Mock-only regression: 112 cases across core, schema, Windows/macOS adapters, packaging, policy, app switch/HUD — 108 pass, 0 fail, 4 macOS-only skip on Windows. `git diff --check` PASS. No real GUI action attempted.
- [ ] Production follow-ups: rebuilt Windows installer, client MCP sampling after tool return, full native GUI acceptance, macOS hardware checks, full npm test environment.



## General Computer Use Agent: chunked model screenshots — 2026-10-23

- **Branch / issue:** `feat/computer-use` / ChatToHarness #1; Windows checkout `D:\\proj\\github\\ChatToHarness`. No macHarness used, no real-system pointer input, version bump or installer replacement.
- [x] **Full screenshot pipeline:** `app/computer-use-planner-images.cjs` reconstructs `observe` screenshots with `delivery=chunked` by bounded `read_screenshot` calls in the same authorized original session. Checks screenshot ID, offset, EOF, byte size, base64, each chunk SHA-256 and overall SHA-256; stops on abort or snapshot expiry. No raw screenshot is persisted to disk.
- [x] **Model input image:** large screenshots are downsampled only for the model using bounded in-memory JPEG previews. `planner_image` dimensions and image-to-native pixel scale accompany decisions; `x/y` are mapped to actual GUI screenshot coordinates before `BaseComputerUse` input validation. The native screenshot/observation is not resized or given new authority.
- [x] **Integration:** generic Agent now uses the screenshot preparation layer before calling Planner or awaiting decisions. Corrupt, unavailable or expired chunks cause safe re-observation, not an unverified GUI action. Windows/macOS staging manifests include the shared helper.
- [x] **Verification:** mock-only cross-platform eight-suite `node --test` **93 total, 89 PASS, 0 FAIL, 4 SKIP** (macOS-dependent skips on Windows), syntax checks and `git diff --check` PASS. Includes large synthetic 2400×1600 screenshot preview, corrupted/out-of-order chunks, abort before read, coordinate transform and end-to-end forced chunked observe → planner.
- [ ] **Open:** actual ChatGPT/Codex host `sampling/createMessage` after tool return, native Windows and macOS visual integration, cross-application authorization, production JPEG preview readability and overall full-suite environment failures. Mock success is not production acceptance.



## General Computer Use Agent reliability — 2026-10-22

- **Branch / issue:** `feat/computer-use`, continuing ChatToHarness #1, Windows checkout `D:\\proj\\github\\ChatToHarness`. No macHarness used, no production mouse movements, installer/version unchanged.
- [x] **Stale decision renewal:** `ComputerUseAgentRunner` automatically invalidates external `decision_id` before the native 30-second observation deadline (28-second limit), drops the previous screenshot from memory, re-observes and issues a fresh decision token. A late submitted action or `done:true` is rejected before native input, not retried against a stale screenshot.
- [x] **Abortable Planner and MCP Sampling:** replaced `Promise.race`'s leaked 15-second timer with a bounded decision helper that always clears timers and listens for STOP/cancel. Cancelling while sampling aborts the model request signal; late model output cannot execute GUI actions. The optional Sampling Planner forwards AbortSignal to SDK `createMessage`.
- [x] **Mock-only Windows+macOS-shared regression:** `node --test` for seven Computer Use suites: **85 tests / 81 PASS / 0 FAIL / 4 SKIP** (macOS-only on Windows). Syntax and `git diff --check` PASS. Agent+Sampling focused suite previously took ~15.7s with the dangling timer; after fix 14 cases completed in ~1.4s.
- [ ] **Still open:** verify the installed ChatGPT/Codex MCP client's async `sampling/createMessage` support, Windows desktop and Mac native acceptance, cross-application authorization handoff, large/chunked screenshot planning, full `npm test` environment failures and arbitrary GUI task completion evidence. Test-only results are not production acceptance.



## Generic Computer Use GUI Agent — 2026-10-22

- **Scope / branch:** General, platform-neutral GUI agent core on `feat/computer-use`, in Windows checkout `D:\\proj\\github\\ChatToHarness`. No macHarness invoked; no version number or installed app changed. Legacy window move remains a compatibility test, not the core architecture.
- [x] **Generic executor:** `app/computer-use-agent-runner.cjs` handles `observe → plan → act → observe` with one scoped native session, dynamic click/type/key/scroll/drag actions, checkpoints, fresh-observation completion decision, cancellation and backoff. Does not blindly replay unknown side effects or reopen terminated sessions.
- [x] **Public API:** `start_task`, `get_task`, `cancel_task`, `submit_task_decision`; task records persist only status/goal digest/action name and geometry, not screenshots or typed text. No configured Planner means explicit `awaiting_decision`, not false autonomous success.
- [x] **MCP Sampling bridge:** SDK `Server.createMessage` is available. Win/Mac stdio adapters install an optional planner only when the connected client advertises sampling; requests include only the original window's in-memory screenshot, no arbitrary external model endpoint. Client declines/errors yield safe waiting. Actual ChatGPT/Codex host support still unverified.
- [x] **Distribution:** Windows and macOS staging + manifests include the generic Agent Runner and sampling planner; `docs/computer-use-agent-architecture.md` and policy updated. Legacy move-specific tasks remain intact.
- [x] **Mock-only validation:** 82 test cases total, **78 PASS / 0 FAIL / 4 SKIP** (macOS-only skipped on Windows), plus JS syntax and `git diff --check` PASS. Tests include dynamic multi-step Planner, external decisions, stale decision rejection, input conflict recovery, STOP/cancel, native side-effect uncertainty, restart no-replay, sampling fallback and package manifests. No real desktop cursor controlled.
- [ ] **Remaining gates:** prove sampling works after an MCP call has returned in target clients; Windows installed-app/native GUI acceptance, macOS real-hardware build and GUI acceptance, cross-application authorization transitions, broader UI workflows and full npm test. No claim of fully validated autonomous deployment.



## Computer Use TaskRunner V1 — 2026-10-22

- **Issue/branch:** ChatToHarness #1 / `feat/computer-use`. Implemented exclusively through winHarness in `D:\\proj\\github\\ChatToHarness`; no macHarness, no real-system cursor test, no version bump or installed-app replacement.
- [x] **Narrow, locally executing GUI task engine:** `app/computer-use-task-runner.cjs` adds an authorized `move_window` workflow that keeps running between MCP requests. A fresh scoped observation plus explicit target desktop x/y and idempotency key are required. It never executes Shell or infers permission.
- [x] **MCP API:** `start_move_task`, `get_move_task`, `cancel_move_task` share the Windows/macOS `BaseComputerUse` contract. One active task per native session; direct concurrent input is rejected. Lost `start` replies are deduplicated, including after the task completes; changed goals with the same key are rejected.
- [x] **Safe loop and checkpoint:** progress is atomically persisted without screenshots or text; focus/input errors are observed and recovered with backoff, drag status is never treated as task success without fresh geometry verification, STOP/Esc/explicit cancellation/terminated native session aborts. A confirmed completed task closes its native session and overlay. On service restart existing incomplete work is marked interrupted for reads; it is never injected into a new session automatically.
- [x] **Cross-platform distribution:** both resource manifests and staging copies include the TaskRunner and `durable-files` helpers; `AGENTS.md`, `docs/computer-use-policy.md`, `docs/windows-computer-use.md` and `docs/computer-use-task-runner.md` describe the behavior and boundaries.
- [x] **Mock-only verification:** `node --test tests/computer-use-task-runner.test.cjs tests/computer-use-platform-packaging.test.cjs tests/windows-computer-use.test.cjs tests/macos-computer-use.test.cjs tests/computer-use-policy.test.cjs`: **71 total, 67 pass, 0 fail, 4 macOS-only skip** on Windows; `git diff --check` PASS. No actual desktop pointer was controlled by these tests.
- [ ] **Acceptance gates:** native installed Windows workflow, macOS packaged workflow/native Swift acceptance, full npm test environment failures, and general multi-step arbitrary GUI planning remain open. TaskRunner is a narrow session-scoped executor; it does not keep control after the MCP service/native session terminates, nor does it run a model unattended.



## Cross-platform Computer Use task continuation — 2026-10-22

- **Issue / branch:** ChatToHarness #1 / feat/computer-use; Windows checkout D:\\proj\\github\\ChatToHarness; worktree clean before editing; no macHarness used, no version bump or installed application replacement.
- [x] **Both OS task contract:** docs/computer-use-policy.md section 0 and AGENTS.md require recovery without a fixed attempt cap while the original session remains valid, until verified completion, explicit STOP/Esc/user cancellation or terminated session. User input activity means pause, not task cancellation; unknown effects cannot be blindly repeated.
- [x] **Shared MCP output:** app/base-computer-use.cjs returns task_state (recovering/session_terminated), recovery_action and replay_same_input=false for recoverable failures. Both win/mac tool descriptions require caller continuation. This is a response contract, not an autonomous task scheduler after the chat turn.
- [x] **Windows atomic pre-press:** native/ComputerUse.cs reports input_started=false until left-down may have been sent; true afterward. JS bridge forwards the flag so focus loss/input collision before down keeps original session, whereas possibly injected mouse-down still terminates session safely.
- [x] **Cross-platform mocked tests:** Windows helper compiled; initial four-suite run 62 tests / 58 pass / 0 fail / 4 Mac-only skip; git diff --check clean. Separate native GUI acceptance still required.
- [x] **Real Windows disposable GUI acceptance:** `node scripts/test-computer-use-mcp.cjs --atomic-drag` final rerun EXIT 0 through actual SDK/Gateway/MCP/native helper. Confirmed target drag (36,32) measured (36,32), single-grip occlusion recovery, all-grip occlusion safe fail and fresh observation, HUD top-edge avoidance, real top-edge drag, STOP button and closed session. The first run after edits stopped on `CU_USER_INPUT_ACTIVE` before any mouse-down; after the recovery loop was added a separate run failed because the fixture's `overlay_all` reported `covered:false`. An independent rerun passed all fixture assertions. Do not conceal the two failed runs or infer repeated stability from the passing run.
- [x] **macOS native parity in shared source:** native/MacComputerUse.swift now reports `input_started` around the atomic left-down boundary, analogous to Windows. Additional mocked Mac pre-press recovery and Swift source regressions bring the focused suites to **64 tests / 60 PASS / 0 FAIL / 4 SKIP** (Mac-only skips) on Windows. Windows C# helper build and `git diff --check` PASS. Swift compiler and physical macOS GUI are **not** verified; no macHarness invoked.
- [ ] **Full-suite blockers:** `npm test` EXIT 1 on Windows. Reported problems include `EPERM` creating a symlink in temporary settings tests, timeouts in persistent task-store tests, and bundled resources missing for Windows packaging configuration tests. These were not marked PASS or silently changed; the targeted Computer Use tests remain green.
- [ ] **Remaining:** address unrelated full-suite environment/test blockers, validate installed Windows build and manual Esc, verify Swift build/macOS native input on a macOS machine. No persistent unattended retry scheduler is implemented or claimed.



## Windows Computer Use 实机拖动/遮挡/HUD 收口 — 2026-10-22

- **Issue/branch:** ChatToHarness #1, `feat/computer-use`, follow-up to local commit `66ad106`. 用户明确要求删除误放的三个 3DFace 目录；逐个限定目录检查后删除 `.3dface-p0b-matrix-20261020` (1 entry), `.3dface-p0b-review-20261020` (4), `.3dface-render-transfer-20261020` (12)。`git status` 删除后干净，这些文件原本不受 Git 跟踪，没有混入提交。
- [x] **HUD 自遮挡修复:** Windows `StopWindow.FollowTargetDisplay` 在当前屏幕顶部居中时检查授权目标的可拖动标题栏矩形；如相交，将 HUD 移至该屏底部（STOP 可继续点击），避免 HUD 自身导致 `CU_TARGET_OCCLUDED`。未改 Mac、未引入不可见窗口定位作为实际移动方式。
- [x] **错误语义:** `drag_window` 的输入前确定性遮挡失败返回 `execution_state:not_started`、`operation_executed:false`、`next_action:observe`；可能已经注入鼠标输入的故障仍返回 unknown、终止会话，禁止自动重放。
- [x] **真实 Windows SDK→认证 Gateway→MCP→原生 helper→WinForms 临时窗口：** `node scripts/test-computer-use-mcp.cjs --atomic-drag` EXIT 0。实际拖动要求平移 (36,32) px，观察结果完全一致；第一个标题栏落点被独立非激活临时窗口遮挡时自动改用备用点，目标平移保持正确；遮住全部落点时 `CU_TARGET_OCCLUDED` 且未发送鼠标按下，会话维持 ready，清除遮挡后重新观察成功。
- [x] **真实 HUD/顶部避让：** fixture 枚举 Windows 原生 HUD 的实际窗口和子控件，验证会话原文标题、当前/上一步操作文本及 STOP。通过仅用于测试窗口的 `position_top` 放到屏幕顶部后，核验 HUD 与标题栏不重叠，再次真实拖动成功；这属于测试窗口的定位设置，不是生产 Computer Use 的 API 兜底。
- [x] **STOP:** 测试 fixture 先核验唯一的预期会话标题，再向其真实原生 STOP 按钮发送 Win32 `BM_CLICK` 测试消息；helper 退出、`get_session` 返回 closed、`close_session` 返回 `closed:true`。这是按钮消息验收，不是肉眼/物理鼠标 STOP 点击验收。
- [x] **代码回归:** `node scripts/build-computer-use.cjs` 编译通过；定向测试 49 total / 45 PASS / 0 FAIL / 4 Mac-only SKIP；`git diff --check` 通过。验收报告：`.cache/acceptance/computer-use/windows-atomic-drag-result.json`。
- [ ] **保留未验收项:** `node scripts/test-computer-use-native.cjs` 仍在本机因 `CU_USER_INPUT_ACTIVE` 终止（未取消真实用户接管检测）；Esc 真正热键、肉眼 Cyan 动画质量、异构多屏真实拖动及完整安装包尚未在本轮新改动上验收。此前完整 `npm test` 有 10 FAIL（符号链接权限/资源打包等），并非全量通过。
- **运行/交付约束:** 未修改版本号、未覆盖运行中的安装或 Windows MCP 服务；此证据仅适用于本地源码构建的原生 helper，正式部署后仍需单独验收。

## Windows 与 macOS Computer Use 源码对齐 — 2026-10-22

- **Issue/branch:** ChatToHarness #1 / `feat/computer-use`。通过 winHarness 操作 Windows 本地仓库，没有使用 macHarness；原有三个 3DFace 未跟踪目录保留。
- [x] Windows 原生 `drag_window`：新鲜 observation、最多三个输入前标题栏命中点、补偿终点、真实鼠标渐进移动/按下/拖动/释放；异常与用户接管时释放左键，不自动重放结果未知的动作。
- [x] 遮挡诊断：`WindowFromPoint` 返回窗口 ID/PID/进程名/边界与 hit-test 标识，禁止泄露其它窗口标题；安全失败保留会话，输入可能已执行的失败则终止会话。
- [x] Windows HUD：深色高对比度圆角面板、3.5s Cyan 周界动画、顶部居中、当前原生动作、上一动作结果与时间、可选真实会话名称；保留 STOP/Esc 和光标 Glow。
- [x] 双平台共享契约：两个平台均公开 `drag_window` 和 `session_title`；标题仅经 private stdio 传递、缺失不编造；明确任务结束应调用 `close_session`。没有添加系统 API 静默定位。
- [x] Windows C# 原生 helper 重新编译通过。最终定向回归 49 项：45 PASS / 0 FAIL / 4 SKIP（Mac-only）；`git diff --check` 通过。完整 `npm test` 为 390 项：366 PASS / 10 FAIL / 14 SKIP，存在 Windows 符号链接权限 EPERM 与缺少打包资源等非目标失败，不能宣称全量通过。
- [ ] Windows GUI fixture：`node scripts/test-computer-use-native.cjs` 出现 `CU_USER_INPUT_ACTIVE`，无法标记通过；未关闭保护或盲目重试。原子拖动、跨屏、HUD 真实视觉和 STOP/Esc 需要独立无干扰的 GUI 验收。
- **Next:** 完成最终全量静态回归与 GUI 验收。没有升级、安装或覆盖正在运行的应用；版本号不变。


## 已授权的系统窗口 API 兜底与原移动任务收口 — 2026-10-22

- **用户指示：** 真实 Computer Use 因遮挡、拖动状态、设备交互等问题不能完成窗口移动时，不应一次失败便放弃；可以考虑系统 API 兜底。只针对已授权目标窗口定位，不能以 API 绕过权限拒绝、用户接管、STOP/Esc 或错误设备。
- [x] 更新 docs/computer-use-policy.md 及 AGENTS.md：优先原生真实鼠标，诊断后有限重试；只有用户明确授权时改用目标范围限定的窗口定位 API，必须独立核验坐标，说明使用何种操作方式。其它 GUI 行为未获得额外授权。
- [x] **真实 Mac 系统 API 操作成功（不是鼠标拖动）：** 目标进程 PID=14254，窗口 ID=6458，ChatToHarness；操作前 System Events 查询大小为 1160×850。读到三显示器第二屏 Quartz 坐标 x=-1640, y=-1440, 2560×1440，按左边缘、上下居中计算目标 (-1640,-1145)；使用授权的 System Events Accessibility 窗口位置接口直接定位。
- [x] **独立位置校验：** 另行从 Core Graphics CGWindowListCopyWindowInfo 查询目标窗口 ID=6458/PID=14254，得到 Bounds X=-1640,Y=-1145,Width=1160,Height=850，完全符合目标；没有通过 shell 伪装可见鼠标拖动。移动前 Computer Use 的最后会话已处于 closed，无按住的鼠标残留。
- **注：** 系统 API 直接定位已证明该次任务可以在旧 0.7.2 运行环境下完成；将该兜底能力变成后续可独立授权的正式窗口 API MCP 工具仍是可选工程工作，不得把仓库中的文档规则描述成已经部署的工具能力。0.7.3 DMG 也未因此自动替换当前程序。


## 0.7.3 Mac installer / atomic drag fix acceptance — 2026-10-22

- **Source commit:** e5038b32d8964a8b27fe701bcea27c9325fcfd64, feat/computer-use, clean at build. Version 0.7.3.
- **Isolated build:** CTH_DIST_SUBDIR=0.7.3-occlusion-drag npm run dist EXIT 0；没有清理、覆盖当前运行中的旧 0.7.2 安装及其目录。
- **DMG:** dist/0.7.3-occlusion-drag/ChatToHarness-0.7.3-macos-arm64.dmg；SHA-256 7e2a79e72b6df729d23de80fce321e759a48d5bae93c50d95bdd2f0ccd36e76d。
- **Bundle:** build-info.json commit=e5038b3、dirty=false、version=0.7.3；codesign --verify --deep --strict EXIT 0（ad-hoc 签名，未 Apple notarize）。
- **Real isolated installer smoke:** CTH_SMOKE_OUTPUT=.cache/acceptance/installer-0.7.3-occlusion-drag npm run smoke:installer EXIT 0；hdiutil DMG CRC/挂载通过，独立已打包应用启动及 UI smoke 通过，卸载保留用户数据（installer=true / startup=true / uninstallRetainsData=true）。
- **Scope caveat:** 独立安装验收并不等于用户已升级。仍须在用户安装新版本并使 MCP 刷新后验证 ChatToHarness 本体跨屏拖动、遮挡元数据和完整 HUD 交互；不要自动升级或关闭 Issue #1。

## macOS CU_TARGET_OCCLUDED / 拖动状态恢复 — 2026-10-22

- **Issue/branch:** ChatToHarness #1, feat/computer-use；修复前工作区 clean；不覆盖当前运行版，不创建 worktree，不通过 setpos 伪装真实鼠标拖动。
- [x] **遮挡根因及诊断：** 原函数 isOccluded(at:) 对 CGWindow 仅做矩形测试，可能将透明/穿透重叠层误判为阻挡，且不报告挡住者。新 occluder(at:) 结合 AX 元素真实命中判断，只在命中当前目标进程且候选不是同应用其它窗口时放行；AX 未知 fail-closed，返回 ID/PID/owner/layer/alpha/bounds，隐去窗口标题。
- [x] **分步状态超时：** 旧 mouse_down — observe — mouse_drag 的 MCP 往返可能超过 30 秒原生保护，出现 CU_MOUSE_NOT_HELD / CU_DRAG_ABORTED。Mac-only drag_window 将真实 CGEvent 指针移动、按下、拖动、松开合并成一次调用，原生失败时也释放；按下之前最多探测三个候选落点，补偿目标坐标；按下后不重放。
- [x] **安全边界：** observe.window_bounds 公开 Quartz 窗口矩形供精准计算；原子拖动限定标题栏位置和物理存在的显示器目标，仍保留前台、进程身份、geometry、新鲜截图、用户未接管及 Esc/STOP；Windows 不广告、不接受该操作。
- [x] **自动测试：** npm test 388 total / 379 PASS / 0 FAIL / 9 SKIP；Mac 专项 25 total / 24 PASS / 0 FAIL / 1 SKIP；HUD 6 PASS。Swift 构建及 git diff --check 通过。
- [x] **真实 Mac GUI：** 临时 AppKit 测试窗口从 (200,791) 移至 (277,835)，目标位移 (78,45)、实际 (77,44)；随后跨屏移动至第二显示器 (-1624,-904)，精准匹配目标坐标；左键释放、close_session 和 Esc 全部验证。第一次跨屏测试轮次在前置点击遇到 CU_POINTER_OFF_PATH、未进入拖动，独立新 fixture 复测通过；不可将保护性失败隐去。
- [ ] **正式安装版待验收：** 当前运行中的 0.7.2 未被替换。新版本安装后的 MCP 工具刷新、ChatToHarness 主窗口操作和 HUD 实际视觉仍需验收；Command+A、STOP 按钮实际点击和 Glow 视觉效果保持开放。
- **下一步：** 隔离打包 0.7.3 Mac DMG 并验证签名与隔离安装，不主动覆盖运行版；同步 GitHub Issue #1。


## Isolated macOS HUD conversation and activity DMG — 2026-10-22

- **Build:** source commit `11132d85b36db8c28c57797e5e7c9d3df067eeb5` on `feat/computer-use`; `CTH_DIST_SUBDIR=0.7.2-hud-session npm run dist` PASS. Version stays 0.7.2; output isolated from prior and running installations.
- **Artifact:** `dist/0.7.2-hud-session/ChatToHarness-0.7.2-macos-arm64.dmg` (255 MiB). SHA-256 `2f4440d04d2ab54b53614d49d5158bf509c983ad395b9e2c45332b01d5fb7997`; embedded `build-info.json` records exact commit and `dirty=false`.
- **Code signing:** `codesign --verify --deep --strict` PASS, ad hoc signature; not notarized.
- **Isolated installer smoke:** `CTH_DIST_SUBDIR=0.7.2-hud-session CTH_SMOKE_OUTPUT=.cache/acceptance/installer-0.7.2-hud-session npm run smoke:installer` exit 0; DMG integrity/mount PASS; packaged GUI smoke PASS; data-preserving uninstall fixture PASS (`installer/startup/uninstallRetainsData=true`). No active ChatToHarness installation was overwritten.
- **Remaining acceptance:** A real GUI session using the new build has **not** yet visually confirmed the new current/previous rows or the optional client-supplied conversation name. The ChatGPT/Codex host currently does not automatically convey its chat display title to standalone MCP, so no live automatic-title acceptance is claimed.

## Mac Computer Use HUD conversation label and operation visibility — 2026-10-22

- **Request:** replace displayed native UUID with the ChatGPT/Codex visible chat name and make current/previous operations observable while preserving local STOP/Esc behavior.
- **Source boundary:** standalone MCP registration has no verified ChatGPT/Codex conversation-title field. ChatGPT/Codex chat sidebar titles cannot be read automatically from this local helper. A new optional Mac-only `open_session.session_title` accepts a client-supplied **known actual** title (1–80 safe characters); when absent HUD explicitly states title unavailable rather than fabricating a name. The native UUID remains internal and accessible only in a diagnostic tooltip. The optional title is delivered by an internal stdio handshake only after native ready, before the service is ready for input; no title in process args, environment, logs, or ordinary tool results. Public tool action set does not include the internal setter.
- **UI:** height 140 points; header/title, conversation label, **current native action** and **previous native result + local completion time** all have separate rows. The executing action appears immediately and persists until native completion; idle remains the accurate current state afterward while the prior action/result remains visible. Actual typed text, screenshot contents and key values are never displayed. Operations rejected before native invocation are not misrepresented as native actions.
- **Constraints:** Windows MCP input schema remains unchanged. ESC/STOP, permissions, one-use screenshots, session expiration, foreground and input safety remain unchanged. Optional title is not authenticated against the ChatGPT UI; trustworthy host propagation is necessary for automatic accurate naming.
- **Verification/remaining:** `npm run build:computer-use` native Swift PASS. `npm test` 385 total / 376 PASS / 0 FAIL / 9 SKIP (exit 0); scoped macOS/Windows HUD/API tests 43 PASS / 0 FAIL / 1 SKIP. New regression coverage verifies optional title handshake, bounded/non-control title validation, no title in normal tool output, separate operation rows, timestamp/outcome and shared core MCP schema. Package/installed visual verification reported separately. A real post-install HUD visual check is pending and must not be marked passed from source/static tests.

## Isolated macOS installer build for Computer Use corrections — 2026-10-22

- **Code commit:** `ff9577d` (version remains 0.7.2). Built with `CTH_DIST_SUBDIR=0.7.2-cu-fixes npm run dist` EXIT 0, preserving the active prior installation and its unpacked build directory.
- **DMG:** `dist/0.7.2-cu-fixes/ChatToHarness-0.7.2-macos-arm64.dmg` (about 255 MiB), SHA-256 `4ba888d9da42c4c16707951350bb9bf554337171d27710dd7792fb5354b88c27`.
- **Bundle:** CFBundleShortVersionString 0.7.2; embedded `build-info.json` has `commit=ff9577d21693759a57568ac5719ec83f2f8531ff`, `dirty=false`; `codesign --verify --deep --strict` PASS (ad hoc, **not notarized**).
- **Isolated installer smoke:** `CTH_DIST_SUBDIR=0.7.2-cu-fixes CTH_SMOKE_OUTPUT=.cache/acceptance/installer-0.7.2-cu-fixes npm run smoke:installer` EXIT 0. DMG verified/mounted, isolated app launch/GUI smoke passed, uninstall retains user data fixture. Report indicated `installer=true`, `startup=true`, `uninstallRetainsData=true`.
- **Limits:** The replacement DMG was built, not installed onto the user's currently running application. The real Computer Use HUD appearance and end-to-end automatic post-task close still require subsequent on-desktop observation; the smoke tested isolated app startup, not a new real mouse drag.

## macOS Computer Use parameter, cleanup and HUD corner fixes — 2026-10-22

- **Work item/branch:** ChatToHarness #1, `feat/computer-use`. User reported 11:25:49 `CU_INVALID_ARGUMENT` for drag button calls, STOP/HUD persisting after a completed task, and four pointed HUD corners. Initial worktree clean.
- **Cause #1 (confirmed):** public MCP schema advertised `button` for mouse actions, but the per-action validation whitelist excluded it from both `mouse_down` and `mouse_up`. Supplying `button: left` caused rejection before native input. Required screenshot `x,y` for down but not up was independently correct. Fixed action validation to accept optional explicit left and reject right for drag; normalize native command by removing the alias. Existing `click` right-button functionality is preserved.
- **Cause #2 (confirmed for incident):** final cross-display drag ended with `mouse_up`, but no `close_session` was invoked before user-facing completion. Helpers intentionally keep STOP/Esc active until explicitly closed, emergency-stopped or expired. Updated shared MCP guidance and `docs/computer-use-policy.md` to require close + verification **before** final completion wording. Added a 120-second no-tool-call shutdown watchdog to terminate orphaned native helper/HUD; it is a fallback, not a task-completion signal. Explicit close remains necessary to close immediately.
- **Cause #3 (source-based diagnosis):** rounded dark MacHUDSurface was nested inside an unmasked rectangular NSVisualEffectView backdrop and rectangular NSPanel window shadow. Removed both backing artifacts; direct MacHUDSurface root retains `cornerRadius`, `masksToBounds`, dark high-contrast backplate, STOP control and animated cyan orbit.
- **Verification:** `npm run build:computer-use` PASS, including native Swift helper. Targeted macOS/native/platform tests **54 total / 53 pass / 0 fail / 1 skip**. Shared policy tests **14/14 pass**. Full `npm test` **381 total / 372 pass / 0 fail / 9 skip**, exit 0. Added tests for explicit-left down/up, invalid right-button drag, independent idle cleanup, and corner layering invariant.
- **Limitations:** The new UI has not been viewed in an installed production 0.7.2 app or verified with a live ChatGPT-to-MCP GUI session. Existing installed/running app was not overwritten. Real cross-display drag was verified on the prior build, not repeated with the modified helper.


## ChatToHarness 0.7.2 Mac installer acceptance — 2026-10-22

- **Source/build:** `feat/computer-use`, committed source `5b4b34d` (clean), version `0.7.2`; `CTH_DIST_SUBDIR=0.7.2 npm run dist` PASS. DMG: `dist/0.7.2/ChatToHarness-0.7.2-macos-arm64.dmg`, approximately 255 MiB.
- **SHA-256:** `2e860e2a4f7f582afe67e4972cec465211c34ab20af4847402d64dbd7101b4eb`. `CFBundleShortVersionString=0.7.2`; packaged `build-info.json` commit `5b4b34dce4e9bc54ea515d805ad8c893da1a4def`, `dirty=false`. `codesign --verify --deep --strict` PASS; ad-hoc signature, **not Apple notarized**. Native helper includes `cyanPerimeterOrbit`.
- **Real isolated installer smoke:** `CTH_DIST_SUBDIR=0.7.2 CTH_SMOKE_OUTPUT=.cache/acceptance/installer-0.7.2 npm run smoke:installer` EXIT 0. DMG CRC verified and mounted; app copied to temporary install dir; GUI smoke PASS; uninstall-preservation fixture PASS: `installer=true`, `startup=true`, `uninstallRetainsData=true` in `.cache/acceptance/installer-0.7.2/installer-result.json`.
- **Tests:** prior to DMG build, `npm test` 375 total / 366 PASS / 0 FAIL / 9 SKIP; isolated-output unit tests 3/3 PASS. No Windows real GUI test.
- **Safety:** initial unisolated build failed `ENOTEMPTY` cleaning `dist/mac-arm64`, where the user's connected ChatToHarness app is **running**. Its directory was not moved or deleted. Subsequent build into `dist/0.7.2` succeeded. Old DMG remains unchanged. No application upgrade was performed or GitHub Release created.

## Release preparation 0.7.2 — 2026-10-22

- **Version bump:** `package.json` and `package-lock.json` to 0.7.2; notes `release-notes/v0.7.2.md`. Current branch `feat/computer-use`, work item ChatToHarness #1.
- **Scope:** Mac Computer Use HUD high-contrast text and orbiting cyan perimeter; device routing policy explicit > trusted current session > sole available > numbered selection, plus tools' visible real-input guidance.
- **Delivery:** build local macOS arm64 DMG from committed source (not GitHub Release), no changes to installed/running application. Validate signing, packaged native HUD and actual installer smoke. Keep Windows real GUI and ChatGPT-hosted router enforcement as pending.
- **Build isolation fix:** First `npm run dist` returned `ENOTEMPTY` while cleaning `dist/mac-arm64`, because the currently running ChatToHarness instance **is launched from that unpacked build directory**. Never remove, rename, or overwrite it while connected. Added `CTH_DIST_SUBDIR` output isolation for build + installer smoke: run `CTH_DIST_SUBDIR=0.7.2 npm run dist` then `CTH_DIST_SUBDIR=0.7.2 npm run smoke:installer`; outputs go to `dist/0.7.2/`. Old default remains unchanged for nonrunning builds. Path validation rejects traversal. Unit tests: `tests/output-directory.test.cjs` 3/3 PASS.




## Computer Use policy: session-first device routing and real input — 2026-10-22

- **Work item / branch:** ChatToHarness #1 / `feat/computer-use`. Canonical policy: `docs/computer-use-policy.md`; new root `AGENTS.md` directs development assistants to read it.
- **Multi-device selection:** explicit user device overrides all; if not explicit, choose the device **reliably associated with the current ChatGPT conversation** even when more than one Harness is connected; with no session binding choose the sole available device; if still ambiguous, list friendly connected devices as numbered choices `1、2、3…` (never request an internal device UUID). An unavailable explicitly named/bound device never silently falls back to a different one. The function `resolveComputerUseDevice` in `app/computer-use-devices.cjs` implements a pure, tested version of these rules for a trusted router; it cannot determine chat session binding from a standalone Harness.
- **GUI behavior:** visible native `computer_use` mouse/keyboard is the default for user requests to move/drag windows: `observe → mouse_move → mouse_down → observe → mouse_drag → mouse_up → verify`. Direct AppleScript/Accessibility or Win32 position APIs are not an implicit fallback. Explicit setpos/setsize permission remains separate; preserve Esc/STOP, window consent, screenshot freshness, no uncertain input replay.
- **Tool surfaces:** `registeredComputerUse` appends device-routing and visible-real-input rules to the platform-specific tool description, and publishes `_meta["com.chattoharness/computer-use-policy"]` (policy v1). `McpManager.visibleTools` attaches a guidance notice to command-capable `start_process`, `interact_with_process`, and `start_task` entries without altering their argument contracts.
- **Security boundary:** a local Harness does **not** see ChatGPT's entire list of connectors, cannot assert conversation association, and cannot force the ChatGPT UI to ask for device selection. This is guidance plus a pure routing contract, **not** implemented centralized session routing or technical restriction on arbitrary shell commands. Strong enforcement requires a trusted host/router capability boundary.
- **Validation:** `node --test tests/computer-use-policy.test.cjs tests/computer-use-devices.test.cjs tests/computer-use-toggle.test.cjs` 20/20 PASS; scoped MCP/Computer Use regression 96/96 PASS; full macOS `npm test` **375 total / 366 pass / 0 fail / 9 skip**. No Windows real-device acceptance and no reinstallation of the running app.



## Mac Computer Use HUD contrast and orbiting cyan border — 2026-10-22

- **Issue / branch:** ChatToHarness #1; `feat/computer-use`. User screenshot showed white title, session and activity text almost invisible on a pale green/tinted Computer Use panel.
- **Fix (P0 legibility):** New `native/MacHUDSurface.swift` applies a strongly opaque dark-navy layer (`alpha=0.97`) **above** NSVisualEffectView instead of relying on the effective system material behind the text. Title, session and activity use dedicated bright cyan, light-gray, and white high-contrast colors. STOP/Esc keeps its existing red-button presentation and callback.
- **Animation:** Base cyan rounded-rectangle border with a glowing cyan head and dimmer trailing segment. Two CAShapeLayers animate `lineDashPhase` in linear infinite loops, **3.5 seconds per full perimeter**; `layout()` recomputes the rounded path, dash lengths and animation for narrow monitors. No extra global timers/threads; no change to physical cursor, STOP, HUD placement, or window focus policy.
- **Build integration:** `scripts/build-computer-use.cjs` compiles the new Swift unit; dev rebuild watching and source inventory tests include it. `npm run build:computer-use` PASS (macOS native executable compiled). Dedicated AppKit acceptance checks live layers, infinite path animation, automatic border reflow and text contrast against a **worst-case white desktop**. Measured contrast: title 13.14:1, session 14.31:1, action 16.46:1 (all > WCAG AAA 7:1).
- **Tests:** `node --test tests/mac-hud-surface.test.cjs tests/mac-computer-use-indicator.test.cjs tests/macos-computer-use.test.cjs tests/mac-display-route.test.cjs tests/mac-permission-diagnostics.test.cjs tests/dev.test.cjs tests/computer-use-platform-packaging.test.cjs` => **39 PASS / 0 FAIL / 0 SKIP**. No running installed 0.7.1 app was replaced, and no Windows real-device test was performed. Visual acceptance of the animated border on the user's desktop is pending a fresh installation of a build containing this commit.
- **Packaged app verification:** `npm run build` EXIT 0; `dist/mac-arm64/ChatToHarness.app` has app version `0.7.1`, `build-info.json.commit=173b0fb`, `dirty=false`; ad-hoc `codesign --verify --deep --strict` PASS. Packaged native helper contains `cyanPerimeterOrbit`. This is an unpacked app build for inspection, **not a rebuilt DMG** and not installed over the running application.



## macOS 0.7.1 real cross-display Computer Use acceptance — 2026-10-22

- **Target/build:** running packaged ChatToHarness 0.7.1, build source `5bcca47`, device `unity.local` (macOS arm64). Mac Harness only; no Windows real-device testing.
- **User scenario:** move the ChatToHarness application window from the primary display onto the second (upper-left) display and leave the app frontmost. This time actual mouse input was exercised, not AppleScript window positioning.
- **Real control sequence:** native `list_windows` → `open_session` (target `ChatToHarness`, PID 69895) → `get_session` ready → `activate` → `observe` → `mouse_move` → `observe` → `mouse_down` → `observe` → `mouse_drag` (Quartz desktop destination `-500,-1220`) → `mouse_up` → `close_session`. All returned successful completion; mouse down/drag reported held=true and mouse up held=false.
- **OS verification after drag:** target window Quartz frame `X=-1100, Y=-1240, Width=1160, Height=850` fully within second display `X=-1640, Y=-1440, Width=2560, Height=1440`; `NSWorkspace.shared.frontmostApplication.processIdentifier == 69895`, `localizedName=ChatToHarness`. **Mac real pointer cross-display drag + foreground acceptance: PASS.**
- **Coverage limits:** This passes the above concrete scenario only, does not retroactively turn the macOS screenshot probe timeout in the 0.7.1 full suite into a PASS and does not establish Windows actual mouse/GUI acceptance. Explicit multi-device intent still depends on ChatGPT's tool selection behavior.
- **Git tracking:** current branch `feat/computer-use`; prior implementation and installer evidence already committed. This entry records the newly completed real-device acceptance, rather than creating an unnecessary code change.


## 0.7.1 macOS arm64 DMG acceptance evidence (2026-10-21)

- **Build source:** `5bcca47` on `feat/computer-use`; `npm run dist` EXIT 0, output `dist/ChatToHarness-0.7.1-macos-arm64.dmg`. Previous `0.7.0` DMG preserved; running installed application was not changed.
- **Bundle:** `CFBundleShortVersionString=0.7.1`, `CFBundleVersion=0.7.1`. `codesign --verify --deep --strict` EXIT 0; signature `adhoc` (no developer team, **not notarized**). File SHA-256 `505606a0a5920a861d0e668ba62e40d2fd1be48e6d3d2571e4716bcb4a1c18bb`.
- **Actual installer smoke:** `npm run smoke:installer` PASS; verified DMG checksum and mount, copied app to temporary isolated location, launched GUI/credential-isolation tests, and verified removal of app leaves fixture user data intact. Report `.cache/acceptance/installer/installer-result.json`: `installer=true`, `startup=true`, `uninstallRetainsData=true`.
- **Actual packaged MCP test:** Opened bundled `computer-use/app/macos-computer-use-stdio.cjs` with bundled Node using a temporary `LOCALHARNESS_HOME`; registered tool metadata includes `unity.local`, macOS, device UUID. `get_session` **without** `target_device_id` returned `state=none`; a wrong explicit ID returned `CU_TARGET_DEVICE_MISMATCH`. No native mouse session was opened.
- **Release limitations:** Full test suite `npm test` is **354 PASS / 1 FAIL / 9 SKIP**, with existing macOS real screenshot probe timeout. Real pointer drag and Windows real-device acceptance remain unverified. Client-side intent policy for multi-device ambiguous prompts cannot be enforced from an independent Harness server, only communicated through MCP tool discovery metadata/description. No GitHub release or remote push performed.

## Release 0.7.1 — automatic Computer Use device binding (2026-10-21)

- **Behavior:** device ID / name / OS advertised via MCP tool registration; ChatGPT chooses the connector based on available tools and user's requested target. `target_device_id` becomes optional and is not exposed to end users; selected connector binds the local ID automatically. An explicitly wrong ID is rejected before native input. Multiple connected computers with ambiguous intent require the chat client to ask for a friendly name; no false assertion of a host-level modal.
- **Entry points:** app-owned Computer Use and standalone Mac/Windows stdio registrations share `app/computer-use-devices.cjs`. The already authorized, platform-local window permissions remain unchanged.
- **Version:** `package.json` and `package-lock.json` = 0.7.1; release notes `release-notes/v0.7.1.md`. macOS-only build and tests; Windows real-device acceptance is explicitly pending.
- **Validation, macOS development checkout:** device/session routing and stdio discovery focused suite **25 PASS, 0 FAIL**. Full `npm test`: **354 PASS / 1 FAIL / 9 SKIP** of 364; failure: `tests/mac-native-observe-glow.test.cjs` helper `probe_window` timed out at 30 seconds (existing native ScreenCaptureKit issue; not represented as PASS). Real cross-display drag remains pending. Installer verification to be appended after build.


## Device-bound Computer Use tool registration — 2026-10-21

- **Request:** Replace conditional multi-device roster/dialog dependency with an unconditional requirement for an explicit target device. Every Harness reports its own stable `cu-UUID`, hostname and OS at MCP Computer Use registration.
- **Implementation:** `app/computer-use-devices.cjs` now owns identity, registration schema, target validation and standalone device home. App-owned tool and macOS/Windows standalone stdio tool both expose a device-specific title, `_meta["com.chattoharness/device"]`, and a JSON Schema **required** `target_device_id` with `const` set to the local ID. Wrong/missing IDs are rejected before native helper startup; native calls receive their original validated arguments.
- **Architecture:** No online roster or presumed device count. The chat client must ask which computer if the user did not choose one. A mere ID is not cryptographic proof that the user actually selected it, and an in-ChatGPT device picker is not implemented; see `docs/adr/0002-multi-device-computer-use-routing.md`.
- **Scope:** Only `macHarness` used. The Windows source contract is updated but **no Windows real-device validation** is claimed. The prior macOS `CU_USER_INPUT_ACTIVE` real-GUI acceptance issue remains open.
- **Validation:** `npm run build:computer-use` EXIT 0 (macOS native Swift binary). Mac-focused test set `node --test tests/computer-use-devices.test.cjs tests/computer-use-toggle.test.cjs tests/computer-use-permissions.test.cjs tests/computer-use-platform-packaging.test.cjs tests/macos-computer-use.test.cjs tests/mac-display-route.test.cjs tests/mac-permission-diagnostics.test.cjs tests/mac-computer-use-indicator.test.cjs` **41 PASS / 0 FAIL / 0 SKIP**; `node --test tests/mcp-gateway.test.cjs tests/mcp-manager.test.cjs tests/mcp-ui.test.cjs` **48 PASS / 0 FAIL / 0 SKIP**. The standalone macOS MCP SDK tool listing and missing-ID rejection were exercised; Mac real drag not reattempted.


## Multi-device Computer Use target guard — 2026-10-21

- Scope: only macHarness/macOS validation, no winHarness tool use. ADR `docs/adr/0002-multi-device-computer-use-routing.md`. Local host device ID persists; a supplied `target_device_id` mismatch rejects before native input. An injected, verified roster with 2+ live machines requires device selection and returns `CU_DEVICE_SELECTION_REQUIRED`; an untrusted or stale roster rejects.
- **Platform boundary:** Independent ChatGPT connectors have no shared online roster in this app. User-facing device choice dialog still requires ChatGPT router or an aggregate MCP broker, so do not mark global multi-device behavior accepted. The model-side prompt rule is documented, not treated as a technical enforcement. Device choice is bound to the active native session, so `mouse_up` still works without requerying a failed broker; a new session requires another choice.
- **Focused verification:** macOS build `npm run build:computer-use` PASS; `node --test tests/computer-use-devices.test.cjs tests/computer-use-toggle.test.cjs tests/macos-computer-use.test.cjs tests/mac-display-route.test.cjs tests/mac-permission-diagnostics.test.cjs tests/mac-computer-use-indicator.test.cjs` 27/27 PASS (0 skip). No Windows environment tools used.
- **Real desktop evidence: Native Mac Screen Recording and Accessibility were granted. An isolated native GUI click test failed `CU_USER_INPUT_ACTIVE` during pointer motion (no replay). Do not claim real drag PASS; Windows native tests expressly excluded by user.


## Cross-platform four-stage mouse control — 2026-10-21

- **Work item:** existing Computer Use issue #1; branch `feat/computer-use`. Added `mouse_move`, `mouse_down`, `mouse_drag`, `mouse_up` to the shared MCP schema and native Windows/macOS adapters. Ordinary move/down use fresh window screenshot pixels; drag uses fresh observation and global display coordinates (`screen_x`/`screen_y`, Windows virtual pixels, macOS Quartz points). `mouse_up` intentionally works without screenshot or geometry validation after a dragged window moves.
- **Safety:** explicit held-left-button state; disallow ordinary input during hold; no cross-display off-screen targets; preserve STOP/Esc, user-intervention detection, native target PID and foreground guards. Native release on stop, error, disconnect and 30-second inactivity. A failed drag terminates the session without replay. Existing uncommitted HUD edits preserved.
- **Status:** Mac native helper rebuilt; MCP simulation tests for both OS passed. Windows machine compiler/actual GUI validation not yet verified. Installed native binaries were not replaced.


## Mac Computer Use session indicator — 2026-10-21

- **Work item:** [ChatToHarness #1](https://github.com/watermoon/ChatToHarness/issues/1), branch `feat/computer-use`. The requested native Computer Use indicator is now a **530 × 108 pt, translucent NSVisualEffectView panel** with high-contrast cyan 3 pt border, a red **STOP · Esc** button, and a bright activity line. It is placed at the **top-center of the display containing the authorized window**, respecting the menu bar via `visibleFrame`, rather than the previous bottom-corner 320 × 52 pt button. It follows target-window screen moves without weakening input's screenshot-geometry checks.
- **Session identity:** `BaseComputerUse.open_session` creates the UUID first, passes that same identifier to the macOS native helper via a **new, optional fifth CLI argument**, and displays the actual full MCP Session ID on the HUD. Native CLI still accepts the original four-argument invocation for standalone backward compatibility. Windows native command arguments are unchanged.
- **Live action indicator:** native Swift updates status on `observe` (window screenshot), `activate` (focus window), `type_text`, `key_press`, `click` and `scroll`. For click/scroll the UI first reports **moving pointer**, then reports click or scroll after pointer motion finishes; restores **waiting for next action** when the request finishes. Chinese and English labels track local OS language. The indicator never exposes typed text, key names or screenshot bytes.
- **Narrow displays:** The STOP button is anchored to the HUD's trailing edge; titles and activity fields shrink/truncate while preserving the button's hit area when the authorized window moves to a narrower secondary display. Verified with native Swift compilation and focused layout-source regression.
- **Safety:** Existing Esc event tap and physical STOP callback still terminate the entire helper. Overlay is not a simulated cursor and has a real user-facing STOP button; window identity, foreground, fresh screenshot observation and explicit OS permissions remain mandatory. `activate` is not renamed to `move window` because no window-reposition API exists.
- **Verification:** native Swift compiled successfully with `swiftc`; dedicated `tests/mac-computer-use-indicator.test.cjs` and Mac native/controller tests passed. `npm run build:computer-use` PASS, macOS own-window real screenshot/glow test 2/2 PASS. `npm test` PASS: **356 total / 347 pass / 0 fail / 9 skip**. Native HUD visual placement and STOP click still require real desktop acceptance; cannot be claimed solely from compilation.


## Computer Use base + permission installer verified — 2026-10-21

- **Branch / source commit:** `feat/computer-use`, `ac9779388bf9d890be47ff7e6a6f75a563df8ed2`. Includes `BaseComputerUse`, OS-specific native adapter selection and packaging exclusions, read-only permission preflight and explicit user-initiated grant prompt, and permission loss notification that stops sessions.
- **Mac OS-specific verification:** `npm run test:computer-use-mac` exit 0. Native helper `permission_status` reported `screen_recording=false` and `accessibility=false` for the current Mac identity, so a full native input test was neither possible nor attempted; user consent must be explicit.
- **Mac application build:** `npm run build` PASS, package version `0.7.0`, build commit `ac9779388bf9d890be47ff7e6a6f75a563df8ed2`, `dirty=false`. Inspected `app.asar` for base, Mac controller, permission service, and switch; confirmed Windows controller/Windows stdio launcher absent. Native Resources contain Mac helper and Mac JS only, no Windows EXE. `codesign --verify --deep --strict` PASS with ad-hoc signature, not notarized.
- **Mac DMG:** `dist/ChatToHarness-0.7.0-macos-arm64.dmg` produced with macOS `hdiutil create -format UDZO`; `hdiutil verify` PASS; 397769063 bytes. SHA-256 generated by build task; no public checksum or Release published.
- **Installer acceptance:** `npm run smoke:installer` exit 0, on isolated user fixture; DMG mount, copy, launch, GUI workflow and retention of user data all PASS. Permission-denied UI checked without invoking `request_permissions` (no consent prompt triggered).
- **Source regression:** `npm test` 351 total / 341 PASS / 0 FAIL / 10 SKIP; `node scripts/release.cjs check` PASS.
- **Deployment:** Neither installed/running ChatToHarness nor its current ChatGPT connection was overwritten. No push/tag/GitHub Release. Windows platform-specific source assertions pass, but Windows installer/GUI requires validation on a Windows machine.
- **Outstanding Computer Use acceptance:** Mac Command+A reliability, user-visible STOP control, Glow and cross-display physical pointer checks; Windows native GUI acceptance. A real granted TCC run should confirm OS prompt identity and correct persistence.


## Computer Use cross-platform base and permission UX — 2026-10-21

- **Issue:** watermoon/ChatToHarness #1, **branch:** `feat/computer-use`. Both OS native controllers now inherit `BaseComputerUse` for session lifecycle, window/screenshot protocol, stale-observation protection, chunked images, cancellation and error handling. Mac no longer extends or imports `WindowsComputerUse`; native adapter selection is fixed to the host platform.
- **Build separation:** `scripts/packaging-platform.cjs` excludes opposite platform JS adapters and stdio entrypoints from `app.asar`, while `scripts/prepare-computer-use.cjs` stages only the current OS adapter + base + native executable and removes stale opposite OS files from resources. `electron-builder.config.cjs` applies the same filters to extraResources. `scripts/dev.cjs` fingerprint now includes both OS controller implementations and native Swift files; tests/dev.test.cjs fixture updated.
- **Permissions:** `app/computer-use-permissions.cjs` runs the native Mac helper in read-only `permission_status` before enabling the switch, checks Screen Recording + Accessibility and fails closed. Windows does not invoke TCC; per-window consent remains native. `request_permissions` is invoked **only after a direct click** on the app's permission dialog.
- **User flow:** MCP Servers checkbox stays off if Mac permissions are absent. A native app-owned Electron dialog appears with missing grants, explicit request, macOS Privacy & Security settings links, retry, and dismiss. Grant/recheck enables the tool and persists only if permission checks pass. Reboot with a saved enabled setting rechecks before registration. In-flight enable/disable operations are guarded against stale async completion.
- **Runtime revocation:** `BaseComputerUse` reports asynchronous session-start permission denials before the tool client has polled; synchronous tool-call permission errors and input-blocking session states are also reported. The switch stops native input, cancels sessions, removes `computer_use` from MCP tools/list, and signals the Electron UI; input is not auto-replayed. Windows consent denial has a Windows-specific prompt without Mac settings.
- **Verification:** `npm test` **351 total / 341 PASS / 0 FAIL / 10 SKIP**; `node scripts/release.cjs check` PASS. Real Electron development smoke passed with helper TCC grants absent (Screen Recording=false / Accessibility=false), showing local permission guidance without requesting native OS authorization. Windows behavior validated via simulated OS tests; live Windows GUI acceptance still pending.
- **Next:** Commit, build macOS arm64 app, verify `app.asar` and native resource platform isolation, and run isolated installer smoke. Do not push, tag, auto-install, or grant OS permissions on behalf of the user. macOS Command+A, STOP and Glow visual acceptance remain open.


## Computer Use MCP Servers toggle installer acceptance — 2026-10-21

- **Feature commit:** `0e73f1c`; **Electron UI follow-up commit:** `1a23c18`, local branch `feat/computer-use`. Windows/macOS each selects its own helper and stores the checkbox preference per device, not per Git project.
- **Real Electron dev UI:** `node scripts/ui-smoke.cjs --dev` PASS using an isolated configuration; the checkbox was checked and unchecked and persistence was verified without opening any real Computer Use session.
- **Clean macOS arm64 app build:** `npm run build` PASS from `1a23c185e6666d3e4349467314d79eadde11eee7`, `dirty=false`, app version `0.7.0`. Checked `app.asar` includes `app/builtin-computer-use.cjs`, Electron renderer and main integration files; Mac native helper exists in bundled resources and the app passes deep code signature validation. Uses ad-hoc signing, no Apple notarization.
- **Rebuilt local DMG:** `dist/ChatToHarness-0.7.0-macos-arm64.dmg`, **396774795 bytes**; `hdiutil verify` PASS. This replaces the older local DMG at the same path, not the existing /Applications application. No published GitHub Release, tag or push.
- **Installed-app smoke:** `npm run smoke:installer` PASS, temporary DMG mount/detach and isolated installed GUI launch. New checkbox checked/unchecked in the packaged application; preferences persisted; no extra external MCP Server; existing local MCP management and language settings passed. Final report `{"platform":"darwin-arm64","version":"0.7.0","credentialMode":"isolated fixtures","installer":true,"startup":true,"uninstallRetainsData":true}`.
- **Source checks:** `npm test` 336 total, 326 PASS / 0 FAIL / 10 SKIP. `npm run test:computer-use-mac` PASS. Windows platform selection and cancellation were tested in simulations, but not on a live Windows desktop.
- **Operational note:** The current installed `0.7.0` app still runs the older binary until manually replaced/restarted. The user must reopen the MCP Servers page after installing this updated local 0.7.0 package. A ChatGPT client may require tool list refresh to see the new built-in `computer_use`.
- **Remaining:** Real Computer Use cursor Glow and STOP button visual inspection and macOS Command+A defect; Windows actual on-screen Computer Use acceptance. Disabling the checkbox will not bypass any local TCC/foreground/user takeover guard.


## Computer Use MCP Servers opt-in toggle — 2026-10-21

- **Real Electron UI acceptance (latest):** `node scripts/ui-smoke.cjs --dev` PASS with an isolated test profile. It actually checked then unchecked the MCP Servers Computer Use checkbox, verified both persisted values in `preferences.json`, and confirmed no external MCP server was created. The event handler retains the clicked value during asynchronous state re-render, avoiding a momentary erroneous flip. No desktop input was injected during this test.

- **Issue / branch:** [#1](https://github.com/watermoon/ChatToHarness/issues/1), `feat/computer-use`. User requires a checkbox on **MCP Servers**, where checked automatically registers the current OS Computer Use tool; unchecked immediately terminates control and removes the tool.
- **UI / IPC:** `app/index.html` adds `mcp-computer-use`, `app/renderer.js` handles change with the checked value captured **before** UI refresh, `app/preload.cjs` exposes only `mcpSetComputerUse`, and `app/main.cjs` owns the permissioned IPC. No direct renderer filesystem/native helper control.
- **Device-local persistence:** `app/preferences.cjs` uses secure atomic `preferences.json` write, `computerUseEnabled=false` default. The new field does **not** modify third-party MCP trust, policy, credential encryption or any other computer's settings. Startup reads the saved preference and exposes it on `state().mcp.computerUse`.
- **Platform isolation:** `app/builtin-computer-use.cjs` exclusively imports `MacComputerUse` and uses `resources/computer-use/ChatToHarness.MacComputerUse` for `darwin`, or exclusively `WindowsComputerUse` and `ChatToHarness.ComputerUse.exe` for `win32`. Other platforms fail closed. The helper must exist before enabling. Native sessions are only created lazily on the first authorized tool call, not from opening the settings page.
- **First-party tool registration:** `app/harness-services.cjs` publishes a single `computer_use` tool only when opted in and the **matching local native helper exists**. `McpManager.changed()` immediately notifies clients via `notifications/tools/list_changed`; no manual `mcpServers` import, admin trust bypass for third-party servers, duplicated platforms, or tunnel restart is needed. Client may still need to refresh its tool catalog.
- **Disabling safety:** The Electron IPC checkbox uncheck synchronously calls `computerUse.setEnabled(false)` *before* waiting behind queued configuration actions; current native helper, outstanding inputs/screenshots and pending calls are aborted. Late replies fail closed with `CU_DISABLED` and no usable image data. `McpManager.stop()` stops control even when preference remains enabled, and connection can later restart with a fresh native controller.
- **Permissions:** Opting in does not bypass OS Screen Recording, Accessibility, local Esc/STOP, window identity/focus/geometry, or user-takeover safeguards. Enabling permits broad desktop-window access through the existing `all_windows` mode; the UI states this explicitly.
- **Automated verification:** `tests/computer-use-toggle.test.cjs` checks default-off, persisted on/off, macOS/Windows exclusive adapter selection, absent native helper, cancellation and stale response suppression, catalog notifications and denied disabled calls. `tests/mcp-ui.test.cjs` validates UI and restricted IPC, including the re-render race fix. macOS native `get_session` smoke check after enabling passed; full project `npm test` and `npm run test:computer-use-mac` passed.
- **Remaining:** No changes have been installed in the running 0.7.0 app. Build and install an updated local app before the actual settings checkbox can be seen and tested visually. Windows has source/model verification only; Windows real GUI acceptance remains pending. macOS Command+A, Glow, STOP visual acceptance also remain open.


## macOS 0.7.0 local installer completed — 2026-10-21

- **Version / branch / built Commit:** `0.7.0` on `feat/computer-use`; verified packaged build identity `15e0802613b1c951c8ba2954116adc059128c52e` with `dirty=false`. `package.json` and both lockfile versions match. Release notes `release-notes/v0.7.0.md`.
- **Tests:** `npm test`: 329 total, **320 PASS / 0 FAIL / 9 SKIP**, `node scripts/release.cjs check`: PASS. Never created a tag or GitHub Release.
- **App build:** `npm run build` completed successfully; `dist/mac-arm64/ChatToHarness.app` carries version `0.7.0`, native Mac Computer Use helper and supporting MCP resources. `codesign --verify --deep --strict` passed; signature is **ad-hoc**, not an Apple Developer ID, and **not notarized**.
- **DMG:** locally staged the signed application and /Applications shortcut, created `dist/ChatToHarness-0.7.0-macos-arm64.dmg` with `hdiutil create -format UDZO`; `hdiutil verify` passed. Size **387022786 bytes**. SHA-256 computed via `shasum -a 256` in the local build task; the checksum was not added to a published Release.
- **Isolated installer acceptance:** `npm run smoke:installer` completed **exit 0**. Mounted DMG, installed into a temporary directory, detached image, launched app through GUI smoke (zh-CN/en/ja, MCP management, update checks, settings persistence etc.). Report: `{"platform":"darwin-arm64","version":"0.7.0","credentialMode":"isolated fixtures","installer":true,"startup":true,"uninstallRetainsData":true}`.
- **Deployment:** Did **not** replace currently running ChatToHarness in /Applications; no Git push, tag, notarization, or public GitHub Release.
- **Open acceptance:** macOS Computer Use modifier shortcuts (Command+A), physical STOP button, cursor Glow appearance, and display-specific real input acceptance remain pending; do not claim they were verified by installer smoke.


## macOS 0.7.0 local installer — 2026-10-21

- **User request:** replace the previous local `0.7.0-beta` target with exact stable SemVer `0.7.0` for macOS arm64. Do not publish or create Git tag; work on `feat/computer-use`.
- **Version:** `npm version 0.7.0 --no-git-tag-version --ignore-scripts`, `package.json` and both lockfile version fields agree; `node scripts/release.cjs check` passed.
- **Build path:** Electron/electron-builder prepares the macOS `.app`; if DMG builder times out, use a macOS native `hdiutil create -format UDZO` staging the verified app plus Applications symlink. Always verify the DMG and installed app separately.
- **Existing Computer Use acceptance limitations:** macOS modifier shortcuts, GUI STOP, cursor Glow visual inspection and multi-display end-to-end still incomplete; preserve these warnings despite stable version number.
- **Tests:** `npm test` on macOS completed: 329 total, **320 PASS / 0 FAIL / 9 SKIP**; version check PASS.
- **Next:** commit clean versioned source, rebuild signed app, create 0.7.0 DMG, run installer smoke and capture SHA-256/size/version/build commit. No GitHub publishing.



## macOS 0.7.0-beta installer candidate — 2026-10-21

- **Issue:** #1 (Computer Use), **branch:** `feat/computer-use`. User requested a **local macOS arm64 DMG** with exact app version `0.7.0-beta`; this is not a public GitHub Release, and no version tag or push is authorized.
- **Version:** `package.json` / `package-lock.json` / lock root updated together via `npm version 0.7.0-beta --no-git-tag-version`.
- **Beta compatibility:** `app/updater.cjs` accepts an installed prerelease when comparing to a published **stable** version; it still rejects published prerelease assets. `scripts/release.cjs check` accepts local beta version, but publication still requires a stable `vX.Y.Z` tag. UI smoke's mocked stable release is now an older version for beta builds.
- **Cross-platform test precision:** Windows-only native packaging and stdio checks skip on macOS and continue running on Windows.
- **Source checks:** `npm test`: 328 total, **318 PASS / 0 FAIL / 10 SKIP**. `node scripts/release.cjs check`: `Version verified: 0.7.0-beta`. Signed distribution is not configured; default Mac build uses ad-hoc signing without notarization.
- **DMG:** Standard `npm run dist` produced a valid signed `.app`, but `dmgbuild` exceeded the local task time limit. A local macOS `hdiutil`-generated UDZO DMG, containing the signed app and an Applications shortcut, was created and verified successfully. A clean-commit rebuild and final installer smoke validation are required before this candidate is accepted.
- **Initial installer smoke:** DMG mounted, app was copied to an isolated directory and image detached. The UI smoke reached Help but timed out at Update Check because it mocked a prerelease tag; fixed in source. Repeat smoke after clean rebuild.
- **Remaining known Mac Computer Use limitations:** Command+A modifier shortcut, STOP button visual click, cursor Glow appearance and cross-display Retina visual acceptance still need independent acceptance. The beta package must not be advertised as a stable production release.


## Human-paced native pointer motion — 2026-10-21

- **Key implementation commit:** e0a0f6c (real pointer trajectory, physical multi-monitor routes, source and local acceptance tests).

- **Issue / branch:** [#1](https://github.com/watermoon/ChatToHarness/issues/1), feat/computer-use; no worktree. macOS is P0. The previously uncommitted Windows native pointer implementation is incorporated into this cross-platform motion fix (Windows GUI acceptance still deferred).
- **Issue:** previously both native helpers moved a real OS pointer in no more than 32 steps, sleeping about 12ms/frame, so full-screen travel could end in <400ms and pointer Glow was difficult to follow.
- **Both platforms now:** time-based motion using a monotonic clock and approximately 60 Hz physical OS pointer updates; quintic acceleration/deceleration; deterministic small lateral arc when safely inside a single display; duration max(240ms, 170ms + distance / 850 pixels-per-second), capped 3.6s. Examples: 100px ~0.29s, 500px ~0.76s, 1000px ~1.35s, 3000px ~3.6s. No synthetic cursor or click ring.
- **Multi-display correctness:** macOS MacCursorTrajectory routes through shared screen boundaries rather than passing through empty display-coordinate regions. Windows Screen.AllScreens bridge routing implements the same contract. Keep target/focus/geometry/user button and modifier checks; macOS OS-event latency is accounted for by comparing cursor position against recent actually emitted points instead of exact previous frame. Out-of-route movement fails closed with CU_POINTER_OFF_PATH.
- **Evidence:** macOS Swift native helper builds. Three-screen geometry test passes 4 layouts x 301 real-coordinate samples (1204 on-screen points). macOS default suite 13 pass / 0 fail / 2 skip (current app window not visible and negative permission scenario not applicable). Windows C# compiles with Mono's mcs and Windows source timing tests 2/2 pass. An opt-in Mac GUI acceptance run returned exit 0 with an enforced >240ms real motion duration and >=8 distinct sampled OS cursor locations; other interactive runs aborted CU_USER_INPUT_ACTIVE/CU_WINDOW_NOT_FOREGROUND because active-user and window safety guards triggered. These results do NOT establish repeatable visual acceptance.
- **Remaining:** real Mac Glow aesthetic/visual review, repeat Mac GUI trajectory under stable foreground conditions and multiple displays, Windows actual native pointer/glow visual acceptance, modifier shortcut and STOP button, signed-app packaging. Do not claim those gates passed.
- **Commands:** npm run test:computer-use-mac; npm run test:computer-use-mac:gui (explicit real GUI, user-local only); node --test tests/windows-cursor-motion.test.cjs; C# validation with mcs or Windows native build on Windows. User requested natural pointer trajectory; no mouse-position circle.


## macOS Computer Use real GUI acceptance — 2026-10-21

- **Key implementation/test commit:** 79c5f4c (native Mac GUI input, observation anti-replay, Esc listener real-device tests and opt-in script).

- **Priority / issue / branch:** macOS Computer Use P0; GitHub Issue #1; feat/computer-use. Windows acceptance explicitly deferred and its native/ComputerUse.cs change and Windows cursor test are not modified.
- **TCC verified on the current Mac:** Screen Recording GRANTED, Accessibility GRANTED. No Input Monitoring permission required. macOS native input session reported state=ready, input_enabled=true, stop_hotkey=Esc, with successful screenshot observation and clean session close.
- **Disposable AppKit fixture:** tests/mac-computer-use-gui-fixture.swift (only synthetic test controls and ephemeral state in system temp). Actual 480x368 native window, geometry [200,791,680,1159] in screenshot point space. Native CGEvent mouse click on fixture incremented click count to 1; Unicode text matched "MacCU-2026-OK"; BACKSPACE removed final character; scroll delta 3 generated one scroll event; consumed observation was refused with CU_STALE_OBSERVATION; close_session passed. No business window was mutated. GUI fixture and temp data were cleaned up.
- **Esc emergency stop:** tests/mac-computer-use-esc-fixture.swift emits a real system Esc event only if the fixture PID is foreground. The passive event tap shut down the control helper, while the fixture app remained open. This verifies synthetic Esc delivery and listener response, not a manual human keyboard press. The on-screen STOP button has not been individually clicked/accepted.
- **Test commands:** npm run test:computer-use-mac:gui (explicit, interactive, actual mouse/keyboard) PASS 2/2, 0 skipped, after running each GUI scenario in its own child process. Default npm run test:computer-use-mac PASS 12, FAIL 0, SKIP 2 (the existing ChatToHarness window was not visible during the run; the no-Accessibility test now correctly skips because Accessibility is granted).
- **Newly discovered defect:** cross-platform CTRL+A mapped to Command+A does not actually select all in a native NSTextField. Follow-on synthetic events sometimes trip CU_USER_INPUT_ACTIVE. Do NOT mark modified-shortcut support as accepted. The native key-event path has been adjusted to explicitly release modifier key state; the Command+A semantic failure still needs a dedicated fix and re-test.
- **Remaining real-device acceptance:** Command+A and other modifier shortcuts, on-screen STOP button, visual verification of pointer silhouette Glow, cross-display/Retina geometry and window movement, permission revocation, installed signed macOS build / DMG packaging.
- **Next:** address shortcut semantics without disabling any input-active safety checks; run targeted GUI fixture acceptance again; do not change or accept Windows for this Mac milestone.


## macOS Computer Use P0 permission correction — 2026-10-20

- User challenged why both Accessibility and Input Monitoring were required for Mac Computer Use. Apple Developer Technical Support confirms Accessibility grants both event posting and listening; separate Input Monitoring authorization is unnecessary when Accessibility is granted.
- Removed CGRequestListenEventAccess and CGPreflightListenEventAccess from native/MacComputerUse.swift diagnostics, removed the Input Monitoring grant request/status gate from scripts/mac-computer-use-permissions.cjs, and updated tests/mac-permission-diagnostics.test.cjs. The CGEvent passive Esc event tap remains mandatory for input to start; if it fails, control is denied. Mac read-only observation remains Screen Recording only.
- Only two OS grants are requested: Screen Recording for window observation, Accessibility for input and Esc interception. ChatGPT official Computer Use documentation describes the same permission model. The helper may still require OS approval for the actual signed process identity.
- Verification: npm run test:computer-use-mac PASS 14/14; permission status reports Screen Recording GRANTED and Accessibility MISSING on this Mac. Input Monitoring was not requested. Real input and Esc/STOP not yet accepted.
- Issue #1; branch feat/computer-use; Windows native acceptance remains deferred, native/ComputerUse.cs and tests/windows-cursor-motion.test.cjs not changed or included in Mac commit.


## macOS Computer Use P0 continued — 2026-10-20

- Issue #1; branch feat/computer-use. Windows native/visual acceptance remains deferred. Windows pointer changes in native/ComputerUse.cs and tests/windows-cursor-motion.test.cjs deliberately remain uncommitted and are not staged.
- Permission evidence: running native helper reports Screen Recording GRANTED, Accessibility MISSING, Input Monitoring MISSING. Added explicit permission status/request commands; OS grants are process-identity-specific and cannot be bypassed.
- Real ScreenCaptureKit: list_windows succeeded (27 entries); own ChatToHarness window screenshot 1160×850, 211,199 PNG bytes, negative-coordinate geometry [1759,-1328,2919,-478], without image files.
- Real MCP: observation-only session opens with Screen Recording alone and returns screenshot/chunks; type_text rejected CU_ACCESSIBILITY_REQUIRED. Status now exposes input_enabled=false, input_blocked_reason and null stop_hotkey in read-only mode.
- Swift implementation: native screenshot probe, per-frame identity/geometry validation without repeated ScreenCaptureKit round-trips; separate MacCursorGlow uses system cursor alpha/hotspot to paint a mouse-transparent light-blue outer silhouette, no synthetic cursor/click ring. Glow compiles but is not visually accepted.
- Automated evidence: npm run test:computer-use-mac PASS 14/14, 0 skipped, serial native GUI tests. Source build and staging succeed. Actual input, global Esc/STOP, glow appearance, multi-display and signed DMG acceptance remain pending.
- Next: user grants Accessibility and Input Monitoring to actual helper identity, restarts it, then validates real input and emergency stop on disposable app. No Windows acceptance at this milestone.


## macOS Computer Use P0 implementation — 2026-10-20

- **Priority:** user explicitly promoted macOS Computer Use to highest priority. Defer Windows native/installer/visual acceptance; preserve previous Windows source and pending tests without claiming acceptance.
- **Branch:** `feat/computer-use`, in-place; no worktree. **Issue:** [#1](https://github.com/watermoon/ChatToHarness/issues/1) (open).
- **Key implementation commit:** 31f03e9 (macOS Swift helper, MCP adapter, packaging and Mac 7/7 tests; local commit only).
- **Native implementation:** `native/MacComputerUse.swift` (macOS 14+, arm64): ScreenCaptureKit window listing/single-window capture; AppKit consent picker; guarded foreground/window identity/launchDate/geometry/occlusion checks; CGEvent pointer, click, scroll, Unicode typing and bounded keys (CTRL shortcuts map to Command). A local non-activating STOP panel and passive Esc event tap must both initialize before input; missing Screen Recording, Accessibility or Esc capabilities reject the session. Parent-process watchdog and 10-minute deadline close control.
- **MCP:** `app/macos-computer-use.cjs`, `app/macos-computer-use-stdio.cjs`; reuse existing one-use observation, image compression, SHA256, chunks, sessions and no-replay semantics via platform-qualified native connection. Windows tool name/policy remains separate.
- **Build/packaging:** `scripts/build-computer-use.cjs`, `scripts/prepare-computer-use.cjs`, `scripts/computer-use-config.cjs`, `electron-builder.config.cjs`, platform-dispatched `app/computer-use-stdio.cjs`; source `npm run computer-use:mac`, build `npm run build:computer-use`.
- **Mac verification:** `npm run test:computer-use-mac` exit **0**, **7/7** dedicated tests pass, including native binary launch and MCP stdio discovery. Swift optimized helper compilation exit 0. macOS native `list_windows` returned **`CU_SCREEN_RECORDING_REQUIRED`**, confirming fail-closed behavior on this host. Real window capture, input, Esc/STOP and Retina/multi-display are **not yet validated** because the required local TCC grants have not been established. Do not mark supported/released.
- **Acceptance still open:** real installed-app Screen Recording + Accessibility (+ Input Monitoring if event tap requires it), target consent, screenshot geometry/retina, visual overlay and native pointer silhouette glow, actual click/scroll/Unicode, Esc/STOP under focus/full-screen, permission revocation, signed DMG identity, screenshot persistence/no-replay, Mac packaging verification. Windows full acceptance postponed by user.
- **Next:** obtain interactive Mac TCC permission evidence for the executing app/helper; run disposable GUI fixture with global stop verified, then accept. Maintain `docs/computer-use-macos-plan.md` and Issue #1.


## Fix cursor-shaped Glow alignment — 2026-10-20

- User reported that Glow was not actually wrapped around the real mouse cursor. Root cause: the previous `MakeCursorGlow()` always drew a 76×76 radial disk centered on the pointer coordinate, ignoring cursor silhouette and hotspot.
- Replaced the disk with a silhouette-based outer halo: use `GetIconInfo` and `GetObjectW` for the active Windows cursor bitmap dimensions/hotspot; compare `DrawIconEx` results on white/black backgrounds to derive the actual visible cursor shape, including monochrome cursors; expand a soft light-blue gradient only *outside* the cursor's opaque pixels. Rendering uses premultiplied-alpha `WS_EX_LAYERED` and remains click-through. A cursor handle change invalidates the cached sprite; ordinary mouse movement only repositions the sprite. If cursor extraction is unsupported, hide the halo instead of drawing an incorrect circle.
- Reused the same silhouette/hotspot-based Glow for `observe` screenshots while continuing to show the real system cursor. No coordinate, authorization, stop-key, or capture-size contract changes.
- Before editing, committed the earlier five-file accepted change as `57c19d0` on `feat/computer-use`. Native code compiled. Source **and installed** fixture runs both exited 0 with `CURSOR_HOTSPOT=0,0`, `GLOW_OFFSET=-14,-14`, `GLOW_SIZE=60x60`, `REAL_MOUSE_GLOW_TRACKS_CURSOR=true`, `CLICK_THROUGH_GLOW=true` and `NATIVE_ACCEPTANCE_PASS`. The fixture asserts no old radial-corner fill and verifies actual overlay geometry against the Windows cursor hotspot. Contract tests: 20/20 pass; `git diff --check` pass.
- Deployed corrected native helper to `D:\\Program Files\\ChatToHarness\\resources\\computer-use\\ChatToHarness.ComputerUse.exe` after confirming no active helper session; updated installed bundle manifest. SHA-256 `2dda11074a10aa036b3dba961715ada874b58ca682bd6c1ce8a1198c5991176e`, manifest verified using the installed Node runtime. Previous helper and manifest backed up in `.cache/hotfix-backups/cursor-silhouette-glow-20261020/`. Did not restart the ChatToHarness application or its already connected MCP adapter (only native component changed). The full remote ChatGPT-to-MCP visual rendering path is not independently proven by fixture tests.

## Continuous real-pointer highlight, Esc-only stop — 2026-10-20

- Requested change: removed the previously introduced 1.4-second click-location ring entirely. Pointer input still uses the Windows system cursor through SetCursorPos; added a separate 76 x 76 click-through, non-activating WS_EX_LAYERED overlay with a soft light-blue radial alpha gradient, tracking the **real** GetCursorPos approximately every 40 ms while the controlled target is foreground. The gradient is continuously attached to the real cursor, not an alternate/fake cursor or a click indicator. It hides when the target is inactive, minimized, cursor leaves target, or the session ends.
- Screenshot observation continues to composite the **actual Windows cursor**, now with the same soft blue glow behind it. The target screenshot remains the same size and physical-pixel coordinate system.
- Removed Ctrl+Alt+F12 registration, UI instruction and MCP stop_hotkey return value; Esc is now the only keyboard shortcut and STOP button remains available. Remote key_press Esc removed from permitted keyboard commands to reserve it for local stop. Old historical acceptance records below remain as historical records, not current feature guidance.
- Actual source native fixture: exit 0. Verified mouse glow followed the physical mouse to two separate positions, did not intercept two consecutive native clicks, blue window outline followed moved target, real cursor overlay was rendered into captures, STOP and Esc terminated the helper. Contract tests 20/20 pass; app/windows-computer-use.cjs syntax and git diff --check pass.
- Installed hotfix completed: backed up both prior files and resources/bundle.json under .cache/hotfix-backups/real-pointer-esc-only-20261020, copied compiled helper plus revised app/windows-computer-use.cjs into D:\\Program Files\\ChatToHarness\\resources\\computer-use, and verified both SHA-256 values against the resource manifest (native 8f736187313193f30f4e5fe6b2edbe10b18db7024981113ce9122c06144686bb; adapter 84cd79abecf9f04cf261b9d53fd656fec1c1bdc72f0c3f0ac5be9f46a415c41e). The **installed** native fixture exited 0 with REAL_MOUSE_GLOW_TRACKS_CURSOR=true, CLICK_THROUGH_GLOW=true and NATIVE_ACCEPTANCE_PASS.\n- Restarted only the specifically identified installed Computer Use stdio node process; MCP manager automatically reconnected. Updating the tool definition revoked its previous tool permission, so restored exactly that existing computer_use tool to its prior direct-allow policy through the desktop application's MCP UI. Live plugin then reported ready with **46 tools** (tools_version 18). New `open_session` and `get_session` both reported **stop_hotkey=Esc**, and a test session against the ChatToHarness window closed cleanly. No full ChatToHarness restart or installer rebuild was performed; source remains uncommitted.

## Stronger light-blue boundary and pointer visibility — 2026-10-20

- User feedback: the translucent blue frame was too subtle, and the mouse was absent from Computer Use screenshots.
- Increased same-hue outline alpha from **12..102/255** to **25..178/255** without changing its light-blue color or blocking input.
- Native PrintWindow excludes the mouse cursor: observations now composite the actual visible Windows cursor using GetCursorInfo, GetIconInfo and DrawIconEx with proper cursor hotspot and GDI cleanup; original dimensions/coordinates unchanged.
- Successful click and scroll show a light-blue cursor-position ring for 1.4 seconds in the existing mouse-transparent, non-activating overlay. The ring hides on elapsed time, foreground change, physical cursor movement or session close.
- Local Windows fixture acceptance exit 0: screenshot cursor rendered 74 pixels; outline sampled RGB (192,225,248); blue mouse ring visibly captured; repeated click through overlay passed. Esc, STOP, Ctrl+Alt+F12 and window-follow checks also passed.
- Hot-deployed native helper to D:\\Program Files\\ChatToHarness\\resources\\computer-use\\ChatToHarness.ComputerUse.exe after verifying no active native session. Backup in .cache/hotfix-backups/computer-use-visible-pointer-20261020/ (binary and bundle.json). Installed helper SHA-256: 6cd6c3e91ddaa26528cc2acfef8633560d9627a4a891d15b1c5be3b2601a769e, bundled manifest synchronized and confirmed valid by installed Node. Re-ran the **installed** helper fixture: exit 0 with SCREENSHOT_NATIVE_CURSOR_PIXELS=74, OUTLINE_PIXEL_RGB=192,225,248, OUTLINE_FOLLOWS_WINDOW=true, MOUSE_FEEDBACK_VISIBLE=true, REPEATED_CLICK_WITH_OVERLAY=true and NATIVE_ACCEPTANCE_PASS. Computer-use interface tests 20/20 passed; git diff --check passed. No Git commit/push or full app installer build performed.
- Real ChatGPT-to-MCP screenshot presentation remains unverified by this fixture alone.

## Computer Use visibility / stop affordance — 2026-10-20

- User-requested local source change on `feat/computer-use`: add a non-activating, mouse-transparent, light-blue semi-transparent gradient outline around the controlled window, updated on the native UI timer; show a prominent control banner and STOP button. Closing the helper removes the outline.
- Register unmodified `Esc` as the session-wide stop hotkey. Retain `Ctrl+Alt+F12` as backup. If either reservation fails, do not start a controllable session. Esc is intentionally reserved for stopping and is not available for normal target-app keyboard use while control is active.
- Initial runtime acceptance (installed native helper) confirmed STOP, Ctrl+Alt+F12 and Esc, but exposed **RGB (228,43,255)** purple edge contamination from magenta `TransparencyKey`. Corrected the overlay to a true per-pixel-alpha `WS_EX_LAYERED` window with a premultiplied top-down DIB and `UpdateLayeredWindow`.
- Final source and **installed helper** acceptance: `resources/node/node.exe scripts/test-computer-use-native.cjs 'D:\\Program Files\\ChatToHarness\\resources\\computer-use\\ChatToHarness.ComputerUse.exe'` **exit 0**. Fixture confirmed light-blue displayed pixel **RGB (214,232,245)**, correct target-outline geometry, follow on actual window movement, and successful STOP, Ctrl+Alt+F12 and **Esc** session termination. Full native fixture output ended `NATIVE_ACCEPTANCE_PASS`. `resources/node/node.exe --test tests/windows-computer-use.test.cjs` earlier passed **20/20**. Windows source helper compiled successfully.
- Hot-deployed the corrected helper to `D:\\Program Files\\ChatToHarness\\resources\\computer-use\\ChatToHarness.ComputerUse.exe`, updated the installed `resources/bundle.json` SHA-256 (UTF-8 without BOM), and verified it is parsable by installed Node. Installed SHA-256: `7101fc9ce255b2e77bbd12819daf86f9c9dc25260f525604e9a4a5ead819af0f`. Pre-update backup: `.cache/hotfix-backups/visibility-esc-blue-fix-20261020/`. Full ChatGPT-to-MCP interactive presentation was not separately retested; native installed helper was tested directly. No Git commit or release was performed.



Date: 2026-10-19 (Asia/Shanghai). Checkout: ChatToHarness, package version 0.6.0. Node used: v24.19.0 on Windows x64 (repository recommends 24.22.0). No release, commit or remote changes were made.

## Implemented

- Optional independent stdio MCP server: `app/windows-computer-use-stdio.cjs`.
- Single `computer_use` endpoint: local window consent, observation PNG, click, Unicode literal input, bounded key presses, wheel input and session close.
- Native .NET Framework helper: `native/ComputerUse.cs`; fixed executable invocation with shell:false, environment allowlist, parent watchdog, ten-minute session lifetime, local STOP and Ctrl+Alt+F12.
- Strict per-action validation, one active native operation, one-use 30-second observation, geometry/foreground/occlusion checks, no replay after uncertain input, no image/text/title persistence by the standalone service.
- `npm run build:computer-use` compiles the helper and creates an importable `resources/computer-use/mcp-config.json` for this checkout. Generated resources are ignored by Git.
- Existing application MCP integration is reused without changing trust/policy defaults, directory grants or shell execution policy. This source preview is not bundled into released installers.

## Actual verification

1. `npm ci --ignore-scripts --no-audit --no-fund`: exit 0, 359 packages installed. Install lifecycle scripts were intentionally not run; this is not an Electron packaging/build acceptance.
2. `node --check` for `app/windows-computer-use.cjs`, `app/windows-computer-use-stdio.cjs`, `scripts/build-computer-use.cjs`, `scripts/test-computer-use-native.cjs`, `tests/windows-computer-use.test.cjs`: all exit 0.
3. `node --test tests/windows-computer-use.test.cjs tests/mcp-manager.test.cjs tests/mcp-gateway.test.cjs`: **44 tests, 44 pass, 0 fail, 0 skipped**, exit 0. Includes ten new computer-use tests; the remaining tests exercise existing gateway/manager behavior. The real standalone MCP stdio endpoint was initialized and listed/invoked for invalid-argument rejection without opening native UI.
4. `node scripts/test-computer-use-native.cjs`: helper and isolated fixture compiled, exit 0. Report: `NATIVE_ACCEPTANCE_PASS: PNG, Unicode literal input, Ctrl+A/Backspace, button click, wheel submission, geometry rejection, foreground rejection`. Only disposable fixture windows were targeted. Wheel submission was checked, not a particular application's resulting scroll offset.
5. Final `node --test tests/*.test.cjs`: **299 tests, 286 pass, 10 fail, 3 skipped**, exit 1. Eight failures report Windows `EPERM` for symbolic-link creation in existing history/log/settings/context tests. Two existing runtime tests failed: `real stdio MCP preflight strips runtime keys, retains HOME and shuts down its server` and `supervisor readiness, authorization failure and explicit stop use only local fixture processes`; their causes remain unresolved in this change. The full suite is not green. Earlier runs also showed variable whole-file runtime/transport failures, so counts vary with test completion; the totals above are the final run, not a combined count.
6. `git diff --check`: exit 0. Initial Git worktree was clean; changes are local and uncommitted.

## Local Windows packaging acceptance — 2026-10-20 (Asia/Shanghai)

This section supersedes the earlier source-only packaging and consent/STOP acceptance gaps, but not the remaining limitations below. Work began on October 19 and completed after local midnight.

- Added Windows-only resource staging for the helper, standalone service and production SDK dependencies; the developer's absolute source config is excluded from packaging. Staged code prefers its adjacent native helper. The bundled configuration generator resolves Node and service paths from the actual installation directory. Existing service trust/tool authorization remains unchanged.
- `node node_modules/electron/install.js`: exit 0, pinned Electron runtime prepared. `npm run dist`: exit 0. Node 24.22.0, Tunnel 0.0.16 and Desktop Commander 0.3.0 were prepared using existing pinned archive checksums. Post-package resource verification passed.
- Artifact: `dist/ChatToHarness-0.6.0-windows-x64-setup.exe`, **200251354 bytes**, SHA-256 **ac4322a65627d59ef330a697df1124cbf8eb2c4f1d8e3959e46a9ad071c6784d**, Authenticode status **NotSigned**. This is a local preview of uncommitted work, not a published release. Companion digest: `dist/SHA256SUMS-computer-use-preview.txt`.
- Fourteen changed/new JavaScript files checked with bundled Node `--check`: 14/14 pass. `git diff --check`: exit 0.
- `node --test tests/windows-computer-use.test.cjs tests/windows-computer-use-packaging.test.cjs tests/packaging.test.cjs tests/dev.test.cjs`: **32 total, 31 pass, 0 fail, 1 platform skip**, exit 0.
- `node scripts/smoke-computer-use.cjs`: final exit 0. Actual bundled Node v24.22.0 and service copied to an unrelated temporary directory with spaces/Chinese characters; MCP discovery and invalid-session rejection passed without source-checkout dependencies. Packaged native helper passed PNG, Unicode literal typing, Ctrl+A/Backspace, button click, wheel submission, geometry/focus rejection, real production consent picker, STOP button, and actual Ctrl+Alt+F12. An intermediate run could not activate the fixture; the test driver was adjusted to click only its own verified visible window when OS activation is denied. The production focus checks were not weakened. Report: `.cache/acceptance/computer-use/packaged-result.json`.
- `node scripts/ui-smoke.cjs`: exit 0 against `dist/win-unpacked/ChatToHarness.exe`. Passed three languages/persistence, navigation, synthetic encrypted config/replacement, reconnect, single instance, window hide, owned-process cleanup, logs, MCP management/default deny, tool/project approvals and auth recovery. 45 base tools observed; optional computer-use is independently enabled and tested above. Remote Tunnel uses a local fixture, not a live account. Report/screenshots: `.cache/acceptance/ui-report.json` and sibling PNGs.
- `npm run smoke:installer`: exit 1, deliberately refused before install/uninstall because this is not a dedicated CI profile. Exact reason: `Windows installer acceptance requires a dedicated CI profile.` No CI/profile protection was bypassed and no personal app data was replaced. Actual NSIS install/uninstall and preservation of real installation state remain unverified.
- Final `resources/node/node.exe --test tests/*.test.cjs`: **301 total, 287 pass, 11 fail, 3 skipped**, exit 1. Eight symbolic-link permission failures remain; two runtime preflight/supervisor failures remain; the owner-exit Windows Job Object test also failed. This record does not attribute the three process/runtime failures to the new feature or claim they are resolved. Full regression acceptance is still not green despite passing package-specific checks.
- No commit, tag, upload, deployment or public release was performed. Summary evidence: [package evidence](evidence/windows-computer-use-package-2026-10-20.json).

## Earlier source acceptance limits

Native input tests directly bound the implementation to the fixture's own window. Production consent picker usability, real hotkey/STOP activation, ten-minute expiry, owner death during consent, packaged delivery and real-client image rendering have not received end-to-end interactive acceptance. JavaScript tests cover consent refusal/timeout, cancellation, session close and no replay using a fake native connection. Arbitrary application compatibility, GPU/protected-window capture and privilege isolation remain unverified. This is not an OS sandbox.

Update: packaged delivery, production consent, STOP and the emergency hotkey now passed fixture acceptance as recorded above. Ten-minute expiry, owner death during consent, real remote-client rendering and arbitrary application compatibility remain outside that acceptance.

Setup and exact supported calls: [windows-computer-use.md](windows-computer-use.md). Decision: [ADR](adr/0001-windows-computer-use.md).

## Session recovery and authorization modes — 2026-10-20

- Reproduced the missing recovery path before editing: regression `recovers a lost open response` failed (expected `ready`, got no state). The original implementation waited for native consent before returning its routing ID and returned only `CU_SESSION_EXISTS` on retry; the cause of the remote client's original missing response itself was not proven. This was an API recovery defect regardless of transport cause.
- `open_session` now immediately returns `session_id` with `initializing`/`awaiting_consent`. `get_session` without an ID and repeat open recover the current session; close without an ID works during consent or active input. Wrong IDs/targets remain rejected. Consent/start timeouts and failures are retained as closed-session diagnostics. No click/text replay is introduced; old callbacks cannot invalidate a new session. Added an output schema exposing ID/state explicitly.
- Per the user's subsequent explicit request, configuration defaults to `all_windows`; `CTH_COMPUTER_USE_AUTHORIZATION_MODE=per_window` retains separate local consent for each window session. Global mode adds visible-window discovery and explicit `window_id` targeting. Client arguments cannot change the authorization mode. Foreground, geometry, observation freshness, input bounds and local emergency stop remain enforced.
- `resources/node/node.exe --test tests/windows-computer-use.test.cjs tests/windows-computer-use-packaging.test.cjs tests/mcp-manager.test.cjs tests/mcp-gateway.test.cjs`: **52/52 pass, 0 fail, 0 skipped**, exit 0. Computer-use-specific contract file now contains 16 tests.
- Nine affected JavaScript files passed bundled-Node `--check`; `git diff --check` passed. Sanitized evidence for both actual Harness modes is saved under `docs/evidence/computer-use-recovery-*-2026-10-20.json`.
- Actual end-to-end `scripts/test-computer-use-mcp.cjs` uses production `McpGateway`, authenticated stdio relay, `McpManager`, per-tool policy and the installed native service. The tool called is **windows-computer__computer_use**. A disposable fixture is selected; the tool itself performs screenshots/click/text, while fixture-only setup/consent is local test infrastructure. Both default global mode and `--per-window` passed real screenshot, Unicode literal text, lost-open recovery, repeated-open no replay and ID-less close/startup cleanup. Reports are `.cache/acceptance/computer-use/session-recovery-result.json` and `per-window-recovery-result.json`; final fixture image contains only synthetic text.
- Official computer-use was initially used only for application configuration/cleanup, then stopped when the user prohibited it. Subsequent full acceptance and app reconfiguration were performed through **local Harness computer_use**. The same namespaced tool successfully clicked the installed app's service enable/disable controls and adjusted its policy by keyboard. This is a local acceptance gateway using real Harness routing and installed service files, not a claim that the current chat acquired a freshly generated remote connector tool definition.
- Updated the already installed service adapter and native helper at the discovered installation, keeping originals under `.cache/hotfix-backups/session-recovery-20261020`. Resource hashes were updated for these local hotfixes. Restarted only that MCP service, with prior direct-call permission restored. Live plugin `get_harness_status` confirms **ready, 46 tools, tools_version 7**, including `windows-computer__computer_use`. The tool definition now describes recovery and configured modes. No terminal command was typed through GUI.
- A fixture output encoding issue was corrected to UTF-8. One intermediate input test detected extra characters during desktop input; the clean final runs passed. Shared-desktop user input can still race with global input; this remains a limitation rather than a sandbox guarantee.
- The earlier installer has not been rebuilt for this hotfix. Current installed service and repository source contain the fix; old release/build identity metadata still identifies the original application package. Prior full-suite failures and unrelated installer/remote-Tunnel acceptance gaps remain unresolved. No commit or public release was made.

## Explicit activation and structured PNG delivery — 2026-10-20

- Added `activate(session_id)`, which requires no old observation, restores minimized targets and verifies actual foreground after identity validation and bounded attempts. A temporary UI-thread input-queue attachment is always detached. No fake Alt keys/clicks or foreground-lock configuration changes are used. Failure reports `CU_ACTIVATION_FAILED`; lost-focus input errors recommend `activate`. Activation always invalidates old observations and never replays input. Windows can still deny activation or a hung target can time out.
- `observe` now exposes matching base64 PNG bytes in both native image content and `structuredContent.screenshot`, with explicit output schema, MIME/encoding, byte length and SHA-256. The text summary omits binary data. Reduced native/adapter PNG limit to 2 MiB and tested combined JSON below the existing 8 MiB gateway budget. No screenshot persistence or directory access changes were added to the service.
- `resources/node/node.exe scripts/build-computer-use.cjs`: exit 0; native helper compiled. `resources/node/node.exe --test tests/windows-computer-use.test.cjs tests/windows-computer-use-packaging.test.cjs tests/mcp-manager.test.cjs tests/mcp-gateway.test.cjs`: **54 tests, 54 pass, 0 fail, 0 skipped**, exit 0. Four affected JS files passed `--check`; `git diff --check` passed.
- Actual `scripts/test-computer-use-mcp.cjs` acceptance passed for source and installed service, each in default global and `--per-window` modes. Each uses the real production Harness manager, authenticated gateway, SDK relay and namespaced `windows-computer__computer_use`; no official computer-use provider was used. A disposable distractor steals focus; input is rejected with no distractor text. The tool reactivates the target, rejects the old observation, restores it after minimization, captures and types synthetic Chinese text. The fixture only establishes test conditions; focus recovery and typing are production tool calls.
- Decoded the structured-only fallback to `.cache/acceptance/computer-use/structured-screenshot-fallback.png`, verified its digest/length and byte equality with the MCP image block, and visually inspected it: the synthetic Chinese output and PASS are visible. Sanitized results: `docs/evidence/computer-use-focus-global-2026-10-20.json` and `computer-use-focus-per-window-2026-10-20.json`.
- Updated the previously installed adapter/helper and resource hashes; originals backed up under `.cache/hotfix-backups/focus-image-20261020`. Used only our Harness computer-use tool to disable/re-enable that MCP service and restore its previous direct-call permission after schema revocation. The same new `activate` action also succeeded against the installed app window. Controller and test sessions were closed. Live connector `get_harness_status`: **ready, 46 tools, tools_version 9**. Existing package build identity remains unchanged; no installer rebuild, commit or public release occurred.
- Remote connector rendering of the updated computer-use image remains **unverified**: this chat still lacks the regenerated callable computer-use definition. A separate live `get_file_result` attempt for the synthetic image returned `PATH_NOT_ALLOWED` because the actual source checkout is outside the app's configured authorized folders; no folder grants were widened. Native and structured PNG delivery through the real local Harness gateway passed, but this does not prove remote UI rendering. The original remote omission's exact layer has not been established. Earlier full-suite and installer acceptance limitations remain unchanged.
- The interactive acceptance controller initially kept its terminal input stream alive after reporting completed cleanup; its owned Node process was interrupted after the computer-use session had closed. Explicitly closing/pausing the controller input fixes that test-driver lifecycle. Retested installed service with a piped `quit` and `--control-app`: exit 0, focus/PNG/input checks and controller shutdown passed. Final syntax/diff checks passed.

## Lossless compression and large screenshot chunks — 2026-10-20

- Replaced the whole-image 2 MiB rejection with lossless adaptive encoding and bounded network chunks. sharp **0.35.5**, libvips **8.18.7**, bundled Node **24.22.0**. `format: auto` compares optimized PNG and lossless WebP against original PNG, retaining the smallest; explicit `png`/`webp` supports client compatibility. Original resolution and exact pixels are preserved, verified by decoding and comparing all pixels in contract tests. Automatic mode retains PNG if optional WebP encoding fails; PNG optimization can fall back to the valid original. There is no claim of a universally optimal format or silent lossy compression.
- Small compressed images (<=1 MiB) retain native image plus structured fallback. Larger images return a manifest. `read_screenshot` supports repeatable byte offsets, default 256 KiB/max 512 KiB, per-chunk and whole-image SHA-256, next offset and EOF. Clients decode each Base64 chunk separately before concatenation. Existing 8 MiB gateway result budget is unchanged. Only one snapshot stays in memory for 120 seconds, released by a timer or observation/activation/input/close. Chunk reads do not refresh input's separate 30-second authority. The local native IPC bound is 64 MiB, native PNG guard 40 MiB within the existing 8-megapixel geometry limit; no folder grants or persistence were added.
- Added the image module to optional-service resource staging and lockfile-pinned production dependencies, preserving sharp/native-library upstream licenses. `npm install --save-exact sharp@0.35.5 --ignore-scripts --no-audit --no-fund`: exit 0, 4 packages added. Production staging `prepareComputerUse` installed 107 packages with scripts/dev dependencies disabled, exit 0. Native helper compiled successfully. A temporary diagnostics command tried sharp's unexported package.json path and failed; corrected diagnostics use public `sharp.versions` and confirm the versions above.
- First expanded contract run exposed a manually copied malformed PNG test constant (13 pass/7 fail); replaced it with a generated valid 100x80 PNG. Final targeted regression: **56 tests, 56 pass, 0 fail, 0 skipped**, exit 0. Includes actual lossless pixel comparison, >2 MiB compressed image assembly/hash, uneven chunk boundaries, retries, invalid ranges/IDs, expiry, snapshot invalidation and unchanged input deadlines. Existing manager/gateway contracts also pass. Five affected JavaScript files passed `--check`; `git diff --check` passed.
- Real Harness SDK relay -> authenticated production gateway -> manager -> installed native service acceptance passed in both `all_windows` and `per_window`. It uses `windows-computer__computer_use`, without the official computer-use provider. Synthetic Chinese fixture: native PNG **7196 bytes**, optimized PNG **5765**, lossless WebP **2108** (selected). Large synthetic fixture: native PNG **9304486 bytes**, compressed WebP **8148258 bytes**, **32 chunks**, largest response **350988 bytes**, exact reconstructed length/hash and decodable 2000x1500 image. Small forced chunk mode and stale screenshot rejection also pass. The earlier smaller fixture (3.7 MB source/3.3 MB compressed) passed before increasing stress dimensions.
- Relocated production resources and bundled Node to an unrelated temporary directory: `scripts/smoke-computer-use.cjs` exit 0, portable/MCP/native all true. Production consent, STOP, Ctrl+Alt+F12, Unicode, clicks, wheel and existing focus/geometry rejections passed. This is resource staging/relocation acceptance, not a new installer build or NSIS install/uninstall acceptance.
- Updated the current installed optional service, helper, production dependencies and bundle hashes. Prior service directory/manifest are backed up under `.cache/hotfix-backups/compression-chunks-20261020`. Restarted only that configured service and restored its previous direct permission using our local Harness computer-use tool. Controller/test sessions closed normally. Live connector confirms **ready, 46 tools, tools_version 11**. The earlier installer/release assets and package build identity remain unchanged. No commit/public release was made. Remote chat rendering and remote chunk assembly remain unverified; actual local Harness transport and installed native implementation passed.

## 2026-10-23 Computer Use 交互与任务 ID 整改（Issue #2）

- **分支/范围**：feat/computer-use；Windows native/ComputerUse.cs、Mac native/MacComputerUse.swift / MacCursorGlow.swift、通用 app/base-computer-use.cjs / computer-use-agent-runner.cjs、MCP 验收与文档。
- [x] 会话 ready 后先激活窗口，失败时提示重试激活再截图；Agent 先激活后观察。原子拖动仍按标题栏真实鼠标移动→按下→拖动→释放→核验。
- [x] Windows 移除 6 像素硬失败；短暂外部指针偏移重新计算路径，持续用户接管时让渡控制；仅在原生确认 left-up 后保留会话继续观察。
- [x] Windows/macOS 源码改为全桌面光标辉光，不扩大输入窗口授权。HUD 新增目标窗口标题/PID、任务与聊天分离、STOP 圆角边距、阶段状态。
- [x] 真正聊天标题通过可选 conversation_title 从宿主传递；不可获取时保留明确缺失提示，不推测。session_title 继续表示任务。
- [x] Windows C# helper 编译及聚焦跨平台 JS 测试通过；真实 MCP Gateway 窗口夹具 node scripts/test-computer-use-mcp.cjs --atomic-drag 返回 Exit 0，报告 .cache/acceptance/computer-use/windows-atomic-drag-result.json。
- [x] 真实鼠标 (+36,+32) 位移验证、部分/全部标题栏遮挡处理、HUD 避挡、测试注入一次指针偏移后的重新规划、实际 STOP 按钮退出通过。
- [x] SDK→McpGateway→McpManager→native：start_task→get_task→submit_task_decision→succeeded→closed 的新任务 ID 完整链路通过。
- [ ] Mac Swift 本机编译和动态 HUD/鼠标视觉验收尚未做；Windows 上的 Mac JS 模拟测试不能替代原生验收。
- [ ] ChatGPT 宿主当前聊天真实标题元数据注入及客户端缓存工具 Schema 的刷新，需要实际客户端验证。
- [ ] 安装包构建与干净重装后验证，按后续构建结果更新；本轮尚未覆盖安装版。
- **Issue**：https://github.com/watermoon/ChatToHarness/issues/2。未通过项保持开放。

### 2026-10-23 后续回归缺陷（未完成）

- [ ] **Windows 鼠标位置/辉光跳回**：用户反馈启用 Computer Use 后，鼠标位于授权目标窗口之外时出现“移动一小段距离后立即跳回原位”的抖动。当前尚未确认是鼠标真实坐标被复位还是辉光视图位置错误；不宣称已解决。需优先在真实桌面做鼠标坐标与辉光位置独立采样，检查 `MoveCursorVisibleDuringDrag` 的用户输入接管逻辑和 HUD/光标跟踪、进程间位置控制冲突；修复后覆盖“窗口内→窗口外→跨屏”的人工/自动混合轨迹验收。
- **提交性质**：本次为当前实现检查点；包含未完成的 macOS 原生验收、外部 ChatGPT Schema 缓存端到端验收及上述抖动缺陷。关联 Issue #2。

## 2026-10-23 macOS Computer Use 按 Windows 基准对齐（Issue #2 后续）

- **基准**：Windows 与 macOS 均为 feat/computer-use / cd747f0，工作区起始干净；JavaScript BaseComputerUse、任务 ID Schema、Planner 和路由相同。差异在 macOS 原生 Quartz 实现。
- [x] **用户指针输入恢复**：macOS 不再因为一次超过 18pt 的偏移就终止拖动；先停止注入并等待 320ms 安静期（总等待上限约 1.8 秒），从实际鼠标位置重建剩余跨屏轨迹。持续鼠标移动/按键接管返回 CU_USER_INPUT_ACTIVE，向上层暴露 input_conflict.reason，由同一任务会话继续观察/恢复而不抢夺用户输入。
- [x] **左键释放确认**：Quartz mouse-up 使用上一次真实发送的 drag 终点坐标，避免事件排队中的位置滞后；等待连续三次系统按钮释放状态采样。只有确认释放才上报 mouse_released=true，未确认不得在原会话里盲目重放；STOP/Esc 保留独立释放兜底。
- [x] **真实前台验证**：activate 不再只信 NSRunningApplication.activate 返回值，还核对 NSWorkspace.shared.frontmostApplication 的 PID，失败仍可恢复。
- [x] **Native 构建**：Mac 本机 npm run build:computer-use Exit 0；生成资源目录的 ChatToHarness.MacComputerUse。
- [x] **Mac 非交互**：npm run test:computer-use-mac，30 测试 / 28 通过 / 2 按环境跳过 / 0 失败；增加 deviceId wrong-platform fixture 修正和 post-press release contract。
- [x] **Mac 真实 GUI**：npm run test:computer-use-mac:gui Exit 0；临时测试窗口真实点击、Unicode 输入/退格、滚动、鼠标可见轨迹、跨屏拖动、一次外部 pointer-nudge（+34,+19）后的路线恢复、mouse-up 状态和 close_session 均通过；分别测试全局 Esc 成功关闭原生 helper 而不关闭测试窗口。
- [ ] **未完成验收**：STOP 按钮的真实鼠标点击、不同鼠标/刷新率组合下的持续用户接管、HUD 外观人工视觉检查及安装后 ChatGPT 缓存 Schema 验收仍需独立确认。
- [ ] **交付**：尚未重新构建/安装正式 macOS DMG；运行中的应用包仍不等于当前源码。Windows 真实鼠标在目标窗口外偶发跳回的回归 Issue 保持开放。

## 2026-10-23 上游同步（DJ-Huang/ChatToHarness）

- **上游**：`https://github.com/DJ-Huang/ChatToHarness.git`；默认分支 `main`，获取时 `upstream/main=dd8a8925c473920e7470964ca27fd3451c9dbba6`。本地 `feat/computer-use` 合并前 HEAD 为 `bec76f60299fd3c618a8a57086d3bb7f95bf77ac`；共同祖先 `eb25b6f66c292b1d9a70013457b32744b47ef6f5`，上游独有 23 提交，开发分支独有 52 提交。
- [x] 在已有分支执行非破坏性 `git merge --no-commit --no-ff upstream/main`；7 个文件冲突逐项整合。保留分支版本 `0.7.3` 而不降级至上游 `0.6.2`；同时保留 Computer Use 注册/任务规划与上游新诊断、MCP 结果分页及恢复机制。
- [x] Mac 上执行 `npm test`：531 项，516 pass、15 skip、0 fail；为 Mac 上运行的 Windows 测试夹具配置稳定的测试设备 ID，避免将主机设备身份识别问题误报为功能回归。
- [x] `npm run test:computer-use-mac`：30 项，28 pass、2 environment skip、0 fail；Mac Swift 原生组件编译通过。
- [ ] 同步后的 Windows 原生安装包/完整真 GUI 回归仍需在 Windows 主机验证；当前 Mac 上的已安装版不等于新合并的工作区。
- [ ] 用户反馈的 Windows 鼠标在目标窗口外跳回/抖动仍未关闭；PR 应先保持 Draft，不应假称全部验收完成。
- **目标 PR**：`DJ-Huang/ChatToHarness:main` ← `watermoon/ChatToHarness:feat/computer-use`。提交前确认远程分支未被他人推进，避免强制推送。

## 2026-10-23 版本号对齐上游（PR #18）

- [x] 按用户要求，以 `DJ-Huang/ChatToHarness:main` 当前应用版本 `0.6.2` 为准，将 `package.json`、根目录 `package-lock.json` 的应用根版本统一从 `0.7.3` 调整为 `0.6.2`。此前合并记录中“保留开发分支 0.7.3”的说明仅是合并当时的历史状态，本条为后续覆盖决策。
- [x] 第三方依赖（如 `iconv-lite@0.7.3`）、既有旧版本安装验收报告与 `release-notes/v0.7.3.md` 均属于依赖数据或历史事实，不能作为当前应用版本直接替换。
- [ ] 本次版本声明同步不等于生成或安装 `0.6.2` 安装包；新安装包仍需单独构建验证。目标仍是上游 Draft PR [#18](https://github.com/DJ-Huang/ChatToHarness/pull/18)。

## 2026-10-23 Computer Use 被遮挡窗口的可见移动恢复规则（上游 Draft PR #18）

- [x] 针对 iTerm2 新建 Tab 验收中 `activate` 完成但点击被 `CU_TARGET_OCCLUDED` 拦截的场景，在 `docs/computer-use-policy.md` 补充跨平台策略：复查会话、目标身份、遮挡和安全落点；若控件仍不可达且授权目标的标题栏有可见安全落点，可使用真实 Computer Use 鼠标临时移动同一目标窗口，核验后继续原任务。
- [x] 不允许操控遮挡方、不绕过用户接管和 STOP/Esc、不自动使用未授权 AppleScript/Accessibility/Win32 直接定位；标题栏不可达或执行结果不确定时不得盲目重放。
- [ ] 这次是操作规范更新，不代表原生执行器已具备自动移动逻辑；Mac/Windows 实际遮挡恢复仍需独立验收。
- [x] 同步把上游 Draft PR #18 的说明改为中文，保留现有测试与待验收项。

## 2026-10-23 Computer Use 聊天名称来源整改

- [x] 禁止在公开 MCP 工具中把 AI 自填的 `conversation_title` 当作 ChatGPT 真实标题；`session_title` 仅表示任务。
- [x] 增加可选宿主元数据 `_meta["com.chattoharness/conversationTitle"]` 在 MCP Gateway / Manager / 内置 Computer Use 间转发，并校验内容；没有宿主提供的标题时显示不可获取。
- [x] 增加针对错误标题隔离、元数据提取以及 macOS/Windows 共享链路的单元测试。
- [ ] 当前 ChatGPT 未验证会发送此自定义元数据，`openai/session` 只是匿名 ID；真实聊天标题自动填充仍受 ChatGPT 客户端能力限制，不能宣称已通过端到端验收。
- [ ] 新改动尚未重新构建/安装 DMG；保留上游 PR #18 Draft，关联 Issue #2。

## 2026-10-24 Computer Use 旧版 MCP schema 会话标题兼容（Issue #2）

- [x] 复现：当前连接器公开的 `computer_use` schema 缺少 `session_title`，而 native `open_session` 要求该字段，导致 `CU_SESSION_TITLE_REQUIRED`；已安装的 `app.asar` 实际已有新字段，确认是连接器侧 stale schema。
- [x] `app/harness-services.cjs` 在调用 native 前通过 `computer-use-compat.cjs` 给旧 schema 的 `open_session` 补入明确标记的任务标题；不会伪造 ChatGPT 会话名称，也不会改写显式传入的标题或绕过 STOP/Esc 等保护。
- [x] 回归测试 `node --test tests/computer-use-policy.test.cjs tests/macos-computer-use.test.cjs tests/computer-use-compat.test.cjs`：36/36 通过。
- [x] Mac 构建：`CTH_DIST_SUBDIR=title-schema-fix node scripts/build.cjs` 成功，生成 `dist/title-schema-fix/mac-arm64/ChatToHarness.app`，签名校验通过。
- [ ] 更新本机安装后，以旧 schema 再次调用 `open_session` 验证真实 Computer Use，并完成 iTerm2 移到第 2 屏中央；若发现 stale schema 持续存在，另行追踪 ChatGPT 端工具缓存刷新机制。

## 2026-10-25 手动代理配置紧凑两行布局与自动记住密码

- 按确认后的 UI 原稿将手动配置拆成两行：类型、服务器地址、端口；用户名（选填）、密码与显示/隐藏密码图标。服务器地址不再独占整行，字段标签与控件横向对齐，并为窄窗口提供纵向回退布局。
- 移除记住密码复选框、清除密码按钮及相关说明文字。保存密码时始终由系统安全存储加密记住；显隐按钮使用可访问的按钮状态。输入后清空密码可清除已保存凭据；未编辑的空密码仍保留原凭据。
- 开发版 Electron 隔离 UI/认证 smoke：通过（22 项检查），截图及报告在 .cache/acceptance/proxy-auth-ui-20261025/。检查包含布局、返回、模式同行、选填凭据、密码显隐、加密记住、取消/清空、HTTP/SOCKS5 认证、重启恢复、代理桥清理和三语。
- 代理专项测试：16 通过、0 失败；完整 npm test：572 项，555 通过、0 失败、17 跳过。renderer、locales 与 smoke 脚本语法检查通过。


## 2026-10-26 Cloudflare 托管式多设备 MCP 路由（分支 feat/cloudflare-multi-device-router）

- [x] Mac 本地创建独立功能分支；切换前的 19 项未提交修改完整保留，无 worktree/reset/clean。
- [x] 新增 cloud-router/src/worker.mjs：MCP JSON-RPC /mcp、Durable Object WebSocket 设备注册、设备认证和显式 device_id 路由。
- [x] 新增 cloud-router/src/agent.cjs：设备侧连接与受限只读工具调用执行器接口；不自动重放断线中的调用。
- [x] 新增独立测试与 Cloudflare wrangler.toml 配置及 README；10/10 路由和设备侧单元测试通过（本地模拟）。
- [ ] 桌面端 Electron 网关真实适配、生命周期及设置 UI 未开发；保留原三个 Tunnel 连接。
- [ ] 云端真实 Wrangler 部署、ChatGPT 统一插件 OAuth 接入、macOS/Windows 两台真机端到端验收未执行。
- [ ] 写操作、Shell、Computer Use 未开放；需完成身份认证、设备级授权、审批、可靠状态核验及真实验收。


## 2026-10-26 Cloud Router P2 — Mac 桌面接入（feat/cloudflare-multi-device-router）

- [x] Mac 上新增 `app/cloud-router-agent.cjs` 和 `app/cloud-router-service.cjs`，设备 ID 复用本机持久 Computer Use 身份，独立进程内 MCP Manager 调用。
- [x] Electron 启动/退出生命周期接入：仅设置 `CTH_CLOUD_ROUTER_ENABLED=1` 时才连接，保留原有 Tunnel；云状态脱敏展示。
- [x] 云端、本地双白名单仅允许 `get_harness_status`，Terminal/文件写入/Computer Use 被显式拒绝；测试覆盖连接、拒绝和单设备指定。
- [x] Wrangler 4.152.0 作为云端子项目依赖，`npm run check` 本地 dry-run 通过，Cloudflare Durable Object 绑定识别成功。
- [ ] Cloudflare 正式账号凭据与真实部署尚不可用；OAuth 2.1/CIMD 设计记录在 `cloud-router/OAUTH-PLAN.md`，**未实现**。
- [ ] 需完成真实 Worker WebSocket、双设备同时在线、持久化授权和客户端 OAuth 端到端验收，之后才允许覆盖现有独立 Tunnel 连接。
- [x] 本轮全量回归：`npm test` 591 项，575 通过、0 失败、16 跳过；macOS Node 语法检查通过（2026-10-26）。

## 2026-10-26 Cloud Router P3 — OAuth 2.1（feat/cloudflare-multi-device-router）

- [x] Cloudflare workers-oauth-provider 1.2.4 split workers：新增 auth-server（GitHub OAuth、同意页面、CIMD/DCR + PKCE、KV 授权数据）及 secure-worker（OAuthResourceServer、Service Binding audience/scope/有效期/撤销校验）。
- [x] 正式 Worker 入口不再直接导出不受保护的旧路由；移除演示用 MCP_BEARER_TOKEN；设备 WebSocket 仍按独立设备密钥认证。
- [x] 严格 GitHub 数字用户 ID 白名单，授权端和 MCP 资源端二次校验；配置默认空列表拒绝所有用户。
- [x] 本地 Workerd：MCP 无授权 HTTP 401 + WWW-Authenticate，RFC 9728 元数据 HTTP 200，RFC 8414 发现含 PKCE S256/CIMD，DCR 注册 HTTP 201；同意页面、缺 Cookie 拒绝、同意后携带 state 跳转 GitHub OAuth 均通过。
- [x] npm test：595 个测试中 579 通过 / 0 失败 / 16 跳过；两份 wrangler dry-run 构建通过。
- [ ] 实际 GitHub OAuth 回调、令牌交换/刷新/撤销、Cloudflare 真实部署、ChatGPT 单插件 OAuth 接入仍待账号授权；绝不宣称已完成线上 E2E。
- [ ] 多设备真机并发、权限及 Computer Use 仍需单独验收；现有三个 Tunnel 原样保留。
- 续接步骤：阅读 cloud-router/P3-OAUTH.md，先配置真实域名、Cloudflare KV/GitHub OAuth App/ID 白名单与设备 secret；部署授权 Worker 再部署资源 Worker；先确认 OAuth 链路无误再切换任意连接。


## 2026-10-27 Cloud Router P3/P4 — Cloudflare Access 与一次性配对（分支 feat/cloudflare-multi-device-router）

- [x] 取消 GitHub OAuth 登录依赖：授权 Worker 使用 Cloudflare Access 提供的可信 `ctx.access.getIdentity()` 和邮箱白名单，仍保留 ChatGPT OAuth 2.1。
- [x] 新增 `create_pairing_code`，5 分钟有效的高强度一次性配对码；Durable Object 持久保存设备凭据摘要，已配对设备不能冒名覆盖。
- [x] ChatToHarness“连接配置”新增多设备配对 UI 与 IPC，设备端使用 `safeStorage` 加密保存密钥，应用启动后自动连接云路由；独立原 Tunnel 保持不变。
- [x] 云端仅允许 `get_harness_status`，跨设备错投/离线不自动切换，终端、文件写入和 Computer Use 尚未开放。
- [ ] 尚需云端真实部署、Cloudflare Access OAuth 联调、macOS/Windows 双机验收、设备撤销与重新配对、线上限流、正式安装包验收。
- [ ] 本期测试结果及 Commit 以后续提交记录和实际验收日志为准，不以本地单测代替云端验收。

### 2026-10-27 一次性配对阶段验收结果

- [x] macOS 本地完整测试：`npm test` 602 项 / 586 PASS / 0 FAIL / 16 SKIP（其中包括新增设备配对测试）。
- [x] Cloudflare Resource/Auth Worker：`cd cloud-router && npm run check` 双 Worker dry-run 构建通过，无公网部署。
- [x] macOS arm64 App：`npm run build` 成功，输出 dist/mac-arm64/ChatToHarness.app；未公证，也未覆盖已安装的正式应用。
- [x] 打包版 UI 冒烟 `npm run smoke:ui` 通过，覆盖 zh-CN/en/ja、导航、重启连接、加密配置等流程。第一次失败因英文配对文案未翻译，补齐后复验通过。
- [ ] 尚未实际上线 Cloudflare Workers/Access，不具备正式单插件接入能力；需要真实域名、KV、Access 邮箱白名单和在线授权，以及 Windows/macOS 真机并发验收。
- [ ] 实际配对后设备撤销/重置、云端限流和 WebSocket Hibernation 的在线验收仍待实现；保持旧三个 Tunnel 原状。

## 2026-10-27 Cloud Router P3/P4 Self-hosted owner authorization 方案 B

- [x] 不依赖 Zero Trust Access/GitHub；所有者授权密钥为 256-bit 随机 Worker Secret，不公开、不提交。
- [x] OWNER_AUTH_EPOCH 两个 Worker 一致，用于旧 OAuth 授权作废。OAuth Provider 1.2.x 不接受带冒号的 userId，已改为 cth-owner-v1。
- [x] 保留用户已填写的真实 workers.dev 服务地址及 KV ID；删除邮箱白名单；设备配对机制独立。
- [x] 定向 OAuth/路由/配对测试及双 Worker dry-run 编译通过。
- [ ] OAuth 真实浏览器授权、ChatGPT 单插件与三设备联调仍待验收；本轮不部署云端。
- [ ] 初版 Workerd 使用 owner:v1 导致授权 500，定位为 SDK 禁止冒号，修改后完整 OAuth E2E 尚待再次执行。

### 2026-10-27 方案 B — Cloudflare 正式部署验证

- [x] 已部署 `chattoharness-auth` Worker 至 `https://chattoharness-auth.watermoon3322.workers.dev`，Cloudflare 版本 `f807add3-a365-42c5-9027-08d3c95f0bd3`。
- [x] 已部署 `chattoharness-cloud-router` Worker 至 `https://chattoharness-cloud-router.watermoon3322.workers.dev/mcp`，Cloudflare 版本 `0d3b8793-9e9b-4240-9f85-85f797a5d9dd`。
- [x] Auth Worker 已绑定实际 OAuth KV；Owner Key 已通过 Cloudflare Worker Secret 配置，Mac 本地副本在 Keychain（密钥从未提交或在聊天中显示）。
- [x] 真实公网：OAuth Discovery 200、PKCE S256、MCP Resource Metadata 200、无 Token MCP 401（含 OAuth challenge）、错误 Owner Key 403、正确 Owner Key 授权码 302、Token 换取成功、带 Token 调用 MCP `tools/list` 成功。
- [ ] ChatGPT 插件实际安装授权、`list_devices`/`create_pairing_code` 对 Durable Object 的在线调用、Mac/Windows 真机一次性配对和三设备并发均待验收，不能据此宣称全部迁移完成。
- [ ] 设备撤销、重新配对、生产限流和远程高级工具权限仍为后续任务；既有三个 Tunnel 保留正常使用。

## 2026-10-27 Cloudflare standalone bootstrap (without MCP or Computer Use)

- [x] 桌面端连接配置新增「初始化云端服务」，在主进程独立执行云端初始化。
- [x] 使用内置 Node 和 Wrangler 登录、创建或复用 OAuth KV、部署两 Worker、写入 OWNER_AUTH_KEY、验收 OAuth discovery=200 和匿名 MCP=401。
- [x] 主进程从 CSPRNG 生成 256-bit 所有者密钥，通过 Electron safeStorage 加密保存；仅用户按明确按钮时复制到剪贴板，不回显到状态/日志/版本库。
- [x] 不依赖 MCP、Computer Use、外部 Node 或终端；旧 Tunnel 不做切换；远程工具只允许 get_harness_status。
- [x] Mac 安装包本地构建和动态配置双 Worker dry-run 通过；CloudBootstrap 单测通过。
- [ ] 真实 Cloudflare 生产部署和 ChatGPT OAuth、多设备联调尚未通过；不得宣称生产已上线。
- [ ] Windows 安装包及真实 Windows 初始化仍待复验；Bundled Wrangler 体积需后续优化。


## 2026-10-27 Cloudflare bootstrap auto-discovery

- [x] Cloudflare API 自动读取已授权账户列表、Workers 子域名、现有 OAuth KV namespace ID，去除用户手填子域名与 KV ID。
- [x] 通过 Wrangler auth token --json 获取临时凭据，仅在 Electron 主进程内存使用，不传递到 UI、日志或 Git；Cloudflare HTTPS API 仅访问官方固定域名。
- [x] 单账户/单 KV 自动选择；多个候选账户或命名空间时要求明确选择；无 KV 才创建；持久化账户 ID 并校验归属。
- [x] 真实 Cloudflare 账户查得子域名 watermoon3322、KV OAUTH_KV；新版自动发现辅助模块对真实 API 验证通过；双 Worker 动态配置 dry-run 通过。
- [x] Mac 安装包重新构建、zh/en/ja UI 冒烟通过；npm test 全仓库 612 项：597 PASS、15 SKIP、0 FAIL。

## 2026-10-27 Cloud Router selectable Cloudflare configuration and paired-device inventory

- [x] Cloudflare 账户和已有 OAuth KV 自动发现后，在客户端常驻列表展示；只有一项或与现有配置匹配时自动预选。允许刷新、切换账户和 KV；当前选中账户的 Workers 子域名由 Cloudflare API 读取，不要求输入。
- [x] 新增设备绑定认证的 GET /paired-devices：在 Durable Object 使用已配对记录和活动 WebSocket 构建包含在线/离线状态的清单，拒绝无有效设备 Token 的访问，绝不返回 Token 或哈希。
- [x] 客户端已配对设备列表展示名称、平台、在线/离线、当前设备及持久随机 device_id；自动刷新并保留离线时最近一次快照。
- [x] 复用 computer-use-device-id 文件下的随机持久 UUID，不用设备名称当唯一标识；改名及软件重启不改变 ID，清空身份数据或克隆配置需要重新处理身份关系。
- [x] Mac 构建与 zh/en/ja UI 冒烟 PASS；npm test 615 项：599 PASS、16 SKIP、0 FAIL；Router + Auth 双 Worker dry-run PASS。
- [ ] 真实 ChatGPT OAuth、三台设备实际配对及在线/离线 UI 数据一致性仍需线上验收；旧 Tunnel 不做改动。

## 2026-10-27 Device roster cloud deployment

- [x] Router Worker updated in Cloudflare: deployed version `24134db0-649a-4a58-8660-ce2f2ff0b963` with `GET /paired-devices`.
- [x] Live probes: `/health` HTTP 200, anonymous `/paired-devices` HTTP 401, unauthenticated `/mcp` HTTP 401.
- [ ] Authenticated paired-device roster on the user's actual 3 devices still requires physical device pairing and UI verification; anonymous denial alone does not verify the full flow.

## 2026-10-27 Connection page layout, device picker and remote cloud detection

- [x] 连接配置页顺序：先「安全通道配置」，再「初始化云端服务」，然后「多设备连接」。现有 Tunnel 配置与连接操作不变。
- [x] 已配对设备列表改为展开式选择器：收起时仅展示已选设备名称，展开项展示 `设备名 (device_id)`，配套展示平台、在线/离线状态；当前设备独立显示名称与完整稳定 ID，选择其他设备时仍保持可见。
- [x] 云端初始化自动检测：只读查询授权服务 OAuth metadata 200、Router /health 200、未授权 /mcp 401，区分已部署/未部署/部分部署/网络不可达；不以本地记录代替真实云端健康。真实已部署的 workers.dev 环境检测通过。
- [x] 若云端已部署但本机未持有所有者密钥，不重新生成密钥覆盖云端；界面显示缺少本机密钥并禁用初始化入口。
- [x] npm test：619 total，603 PASS、16 SKIP、0 FAIL；Mac 安装包构建与 zh/en/ja UI 冒烟通过；本轮只改桌面端和测试，不重新部署 Worker。
- [ ] 三台真实已配对设备的选择器数据与端到端 OAuth 执行路径仍需人工联调验收。
