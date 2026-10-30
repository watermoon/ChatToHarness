'use strict';
// Chinese source messages, English and Japanese translations. Shared by renderer and main.
(function(root){
  const messages = {
  "云端无法验证 Cloudflare 账户权限，请重新登录 Cloudflare 后重试。": ["The service could not verify Cloudflare account permissions. Sign in again and retry.", "Cloudflare アカウントの権限を確認できません。再ログインしてください。"],
  "设备登记信息未通过验证，请刷新设备信息后重试。": ["Device information was rejected. Refresh it and retry.", "デバイス情報を更新して再試行してください。"],
  "云端设备登记服务暂时不可用，请稍后重试。": ["Device registration is temporarily unavailable. Try again later.", "デバイス登録サービスは一時的に利用できません。"],
  "云端返回的设备登记结果无效，请更新云端服务后重试。": ["Invalid registration response. Update the cloud service and retry.", "登録結果が無効です。クラウドサービスを更新してください。"],
  "设备连接失败，请检查账户授权和网络设置后重试。": ["Device connection failed. Check account authorization and network settings.", "アカウント認証とネットワーク設定を確認してください。"],
  "使用同一个 Cloudflare 账户连接此设备": ["Connect this device using the same Cloudflare account", "同じ Cloudflare アカウントでこのデバイスを接続"],
  "使用同一个 Cloudflare 账户自动发现服务并连接各台设备。": ["Use the same Cloudflare account to discover the service and connect your devices.", "同じ Cloudflare アカウントでサービスを検出し、各デバイスを接続します。"],
  "使用同一个 Cloudflare 账户连接设备，后续启动自动连接。": ["Connect with the same Cloudflare account; reconnect automatically on startup.", "同じ Cloudflare アカウントで接続し、次回から自動接続します。"],
  "使用 Cloudflare 账户连接": ["Connect with Cloudflare", "Cloudflare アカウントで接続"],
  "连接当前设备": ["Connect this device", "このデバイスを接続"],
  "在原有 Cloudflare 账户重新部署两个 Worker，保留 OAuth KV、设备连接凭据及设备 ID。不会执行清空或重建操作。": ["Redeploy both Workers in the current Cloudflare account, preserving OAuth KV and device credentials and IDs.", "Cloudflare アカウント内の Worker を再配置し、OAuth KV とデバイス認証情報を保持します。"],
  "重试云端初始化": ["Retry cloud initialization", "クラウド初期化を再試行"],
  "清除本机凭据": ["Removing local credentials", "ローカル認証情報を削除中"],
  "删除 OAuth KV": ["Deleting OAuth KV", "OAuth KV を削除中"],
  "删除授权 Worker": ["Deleting auth Worker", "認証 Worker を削除中"],
  "删除 MCP Worker": ["Deleting MCP Worker", "MCP Worker を削除中"],
  "清空设备记录": ["Erasing device records", "デバイス登録を消去中"],
  "核验云端资源": ["Verifying cloud resources", "クラウドリソースを確認中"],
  "本机": ["This device", "このデバイス"],
  "将永久删除 ChatToHarness 的授权 Worker、路由 Worker、OAuth KV 内容和设备绑定记录，并清除本机 Owner Key、配对凭据。其他设备需要重新绑定。此操作无法撤销。": ["Permanently deletes ChatToHarness auth and router Workers, OAuth KV data and device bindings, and the local Owner Key and pairing credentials. Other devices must pair again. This cannot be undone.", "ChatToHarness の認証/ルーター Worker、OAuth KV、デバイス登録を削除し、ローカルの Owner Key とペアリング情報も消去します。元に戻せません。"],
  "关闭": ["Close", "閉じる"],
  "重置未完成，可重试：": ["Reset incomplete, retry: ", "リセット未完了、再試行："],
  "正在彻底重置云端…": ["Permanently resetting cloud…", "クラウドを完全リセット中…"],
  "输入 RESET CHATTOHARNESS 确认": ["Type RESET CHATTOHARNESS to confirm", "RESET CHATTOHARNESS と入力して確認"],
  "确认永久重置": ["Confirm permanent reset", "完全リセットを確認"],
  "彻底重置云端": ["Permanently reset cloud", "クラウドを完全にリセット"],
  "配对": ["Pair", "ペアリング"],
  "断开": ["Disconnect", "切断"],
  "重新部署 MCP 服务": ["Redeploying MCP service", "MCP サービスを再デプロイ中"],
  "重新部署授权服务": ["Redeploying authorization service", "認証サービスを再デプロイ中"],
  "重新初始化会重新部署现有云端 Worker，可能短暂断线；保留 Owner Key、KV 和设备配对。确认继续？": ["Reinitialize by redeploying the existing cloud Workers? Connections may briefly drop. Owner Key, KV and paired devices are retained.", "既存の Worker を再デプロイして再初期化しますか？一時切断することがあります。Owner Key、KV、登録済みデバイスは保持します。"],
  "在原有 Cloudflare 账户重新部署两个 Worker，保留 Owner Key、OAuth KV、已配对设备及设备 ID。不会执行清空或重建操作。": ["Redeploy both Workers in the existing Cloudflare account, preserving Owner Key, OAuth KV, paired devices and device IDs. Nothing is erased.", "既存 Cloudflare アカウントの両 Worker を再デプロイします。Owner Key、OAuth KV、登録済みデバイス、ID は保持し、削除しません。"],
  "重新初始化失败": ["Cloud reinitialization failed", "クラウド再初期化失敗"],
  "重新初始化说明": ["About cloud reinitialization", "クラウド再初期化について"],
  "重新初始化云端": ["Reinitialize cloud", "クラウドを再初期化"],
  "云端连接操作失败": ["Cloud connection operation failed", "クラウド接続操作に失敗しました"],
  "已断开": ["Disconnected", "切断済み"],
  "断开连接": ["Disconnect", "切断"],
  "此密钥用于 ChatGPT OAuth 所有者授权；可复制或在高级管理中临时显示。不同设备不共享设备密钥。": ["Used for ChatGPT OAuth owner authorization; copy or reveal it in advanced settings. Every device has a separate device credential.", "ChatGPT OAuth の所有者認証に使用します。詳細設定でコピー・一時表示できます。デバイスの認証情報は個別です。"],
  "查看当前设备 ID": ["View this device ID", "現在のデバイス ID を表示"],
  "设备列表说明": ["About device list", "デバイス一覧の説明"],
  "多设备连接说明": ["About multi-device connection", "マルチデバイス接続の説明"],
  "Owner Key 说明": ["About Owner Key", "Owner Key の説明"],
  "云端服务说明": ["About cloud service", "クラウドサービスの説明"],
  "确认配对": ["Confirm pairing", "ペアリングを確認"],
  "关闭配对窗口": ["Close pairing dialog", "ペアリングダイアログを閉じる"],
  "输入一次性配对码": ["Enter one-time pairing code", "ワンタイムペアリングコードを入力"],
  "自动授权": ["Authorize automatically", "自動認証"],
  "配对设备": ["Pair device", "デバイスをペアリング"],
  "设备 ID": ["Device ID", "デバイス ID"],
  "未保存": ["Not saved", "未保存"],
  "已保存": ["Saved", "保存済み"],
  "打开 Cloudflare 授权页 ↗": ["Open Cloudflare authorization ↗", "Cloudflare 認証ページを開く ↗"],
  "Cloudflare 验证码：": ["Cloudflare verification code: ", "Cloudflare 認証コード："],
  "打开 Cloudflare 控制台 ↗": ["Open Cloudflare dashboard ↗", "Cloudflare ダッシュボードを開く ↗"],
  "自动检测 Cloudflare 环境。需要授权或选择时，会显示具体步骤。": ["Detecting Cloudflare. You will see steps when authorization or selection is needed.", "Cloudflare を検出します。認証や選択が必要な場合は手順を表示します。"],
  "新建 workers.dev 子域名": ["Create workers.dev subdomain", "workers.dev サブドメインを作成"],
  "自动初始化云端": ["Auto setup cloud", "クラウドを自動セットアップ"],
  "继续自动初始化": ["Continue auto setup", "自動セットアップを続行"],
  "创建子域名并继续初始化": ["Create subdomain and continue", "サブドメインを作成して続行"],
  "初始化进度": ["Setup step", "セットアップ手順"],
  "云端环境已就绪，Owner Key 本机安全保存，可直接使用统一 MCP 地址。": ["Cloud is ready. Owner Key is securely stored on this device and the unified MCP URL is available.", "クラウドは準備完了です。Owner Key は端末に安全に保存され、統一 MCP URL が使えます。"],
  "仅检测到部分云端服务；保留现有数据，请在确认 Owner Key 后执行恢复。": ["Only part of the cloud deployment is detected. Keep existing data and verify Owner Key before recovery.", "クラウドの一部のみ検出されました。データを保持し、Owner Key を確認してから復旧してください。"],
  "云端状态无法确认：请检查网络或代理，刷新配置后再操作，避免重复部署。": ["Cloud state cannot be verified. Check networking or proxy, then refresh before retrying deployment.", "クラウドの状態を確認できません。ネットワークやプロキシを確認し、再デプロイ前に更新してください。"],
  "本机记录与当前账户/子域名不匹配，已停止操作以保护原有云端服务。": ["This device record does not match the selected account or subdomain. Setup stopped to protect existing services.", "端末の記録が選択したアカウントやサブドメインと一致しません。既存サービスを保護するため停止しました。"],
  "Worker 已部署但健康检查尚未通过：检查网络、域名以及 Workers 日志，再刷新验证。": ["Workers are deployed but health checks failed. Check networking, domain and Worker logs, then refresh.", "Worker はデプロイ済みですがヘルスチェックに失敗しました。ネットワーク、ドメイン、ログを確認してください。"],
  "Owner Key Secret 写入失败：请检查 Workers Secret 写入权限，切勿重新生成密钥。": ["Writing Owner Key Secret failed. Check Workers secret write permissions; do not regenerate the key.", "Owner Key Secret の設定に失敗しました。書き込み権限を確認し、キーを再生成しないでください。"],
  "Worker 部署失败：请检查 Cloudflare Workers 写入权限及账户限制，修复后重试。": ["Worker deployment failed. Check Workers write permissions and account limits, then retry.", "Worker のデプロイに失敗しました。書き込み権限とアカウント制限を確認してください。"],
  "该账户已有 workers.dev 子域名；请刷新自动检测，不要覆盖原有名称。": ["The account already has a workers.dev subdomain. Refresh discovery; do not overwrite the existing name.", "既に workers.dev サブドメインがあります。既存の名前を上書きせず、再検出してください。"],
  "自动注册子域名失败：请在 Cloudflare → Workers & Pages 中配置 workers.dev 子域名，然后刷新重试。": ["Subdomain registration failed. Set up the workers.dev subdomain in Cloudflare Workers & Pages, then refresh.", "サブドメイン登録に失敗しました。Cloudflare Workers & Pages で workers.dev を設定し、更新してください。"],
  "未发现可管理的 Cloudflare 账户：请登录有 Workers 权限的账户。": ["No manageable Cloudflare account found. Sign in with an account permitted to manage Workers.", "管理可能な Cloudflare アカウントが見つかりません。Workers 権限のあるアカウントでログインしてください。"],
  "无法访问 Cloudflare API：请检查网络及账户 Workers/KV 读取权限，再刷新配置。": ["Cannot access Cloudflare API. Check network and Workers/KV read permissions, then refresh.", "Cloudflare API にアクセスできません。ネットワークと Workers/KV の参照権限を確認して更新してください。"],
  "应用缺少内置 Node 或 Wrangler：请使用完整安装包，或在本地重新打包后重试。": ["Bundled Node or Wrangler is missing. Use a complete app build and retry.", "内蔵 Node または Wrangler がありません。完全なアプリを使用して再試行してください。"],
  "系统安全存储不可用：请启用操作系统钥匙串/凭据管理器后重试。": ["Secure storage is unavailable. Enable your OS keychain or credential manager and retry.", "安全なストレージが使えません。OS のキーチェーンまたは資格情報マネージャーを有効にして再試行してください。"],
  "云端已存在，但本机没有可验证的 Owner Key。请在「高级管理」中关联并轮换，不会自动覆盖已有服务。": ["The cloud service exists but this device has no verified Owner Key. Use Advanced settings to link and rotate; existing services will not be overwritten automatically.", "クラウドは存在しますが検証済み Owner Key がありません。詳細設定から連携・ローテーションしてください。既存サービスは自動上書きされません。"],
  "检测到多个 OAuth KV：请选择已有 ChatToHarness KV，避免创建重复资源或覆盖其他数据。": ["Multiple OAuth KV namespaces found. Select the existing ChatToHarness namespace to avoid duplicates or overwrites.", "OAuth KV が複数見つかりました。重複作成や上書きを避けるため既存の ChatToHarness 用 KV を選んでください。"],
  "该账户尚无 workers.dev 子域名：已建议一个名称，可修改后点击自动初始化，系统会注册子域名。": ["No workers.dev subdomain exists. Review the suggested name, edit it if needed, then continue to register it.", "workers.dev サブドメインがありません。候補名を確認・変更して続行すると登録されます。"],
  "检测到多个 Cloudflare 账户：请选择要部署 ChatToHarness 的账户，再点击自动初始化。": ["Multiple Cloudflare accounts found. Choose the account to use, then continue auto setup.", "Cloudflare アカウントが複数あります。使用するアカウントを選択し、自動セットアップを続けてください。"],
  "需要 Cloudflare 授权：点击「自动初始化云端」，在弹出的浏览器中批准登录。若未打开，请查看帮助说明。": ["Cloudflare authorization required. Click Auto setup and approve access in the browser. See Help if it does not open.", "Cloudflare 認証が必要です。「自動セットアップ」を押してブラウザーで承認してください。開かない場合はヘルプを参照してください。"],
  "自动初始化进行中；请勿关闭客户端，部署完成后会自动验证。": ["Cloud setup is in progress. Keep the app open; deployment will be verified automatically.", "クラウドをセットアップ中です。アプリを閉じずにお待ちください。デプロイ後に自動検証します。"],
  "点击「自动初始化云端」：登录后自动检测账户、创建必要资源、部署服务并验证。": ["Click Auto setup. After login, the app detects your account, provisions missing resources, deploys Workers, and verifies them.", "「クラウドを自動セットアップ」を押します。ログイン後、アカウント検出、必要なリソースの作成、デプロイ、検証が自動で行われます。"],
  "当前设备已绑定": ["Device already paired", "このデバイスはペアリング済みです"],
  "云端服务、Owner Key 与设备配对说明": ["Cloud service, Owner Key and pairing guide", "クラウドサービス、Owner Key、ペアリングの説明"],
  "使用配对码绑定": ["Pair with code", "コードでペアリング"],
  "手动输入一次性配对码（兼容方式）": ["Enter a one-time pairing code (legacy)", "ワンタイムペアリングコードを入力（互換）"],
  "授权并绑定当前设备": ["Authorize and pair this device", "承認してこのデバイスをペアリング"],
  "通过浏览器批准当前设备，后续启动自动连接。": ["Approve this device in your browser; subsequent launches connect automatically.", "ブラウザーでこのデバイスを承認すると、次回から自動接続します。"],
  "多设备连接": ["Multi-device connection", "マルチデバイス接続"],
  "高级管理": ["Advanced settings", "詳細設定"],
  "配对说明 ↗": ["Pairing guide ↗", "ペアリング手順 ↗"],
  "使用说明 ↗": ["Help ↗", "使い方 ↗"],
  "自动发现 Cloudflare 服务，管理 Owner Key 和接入状态。": ["Discover Cloudflare service and manage Owner Key and connection.", "Cloudflare サービスを検出し、Owner Key と接続を管理します。"],
  "云端服务": ["Cloud service", "クラウドサービス"],
  "等待浏览器批准": ["Awaiting browser approval", "ブラウザーでの承認待ち"],
  "正在申请绑定": ["Requesting approval", "承認を申請中"],
  "自动绑定失败：": ["Automatic pairing failed: ", "自動ペアリング失敗："],
  "正在申请设备绑定…": ["Requesting device pairing…", "デバイスのペアリングを申請しています…"],
  "MCP 地址无效，请填写完整的 HTTPS 地址": ["Invalid MCP address. Enter the complete HTTPS URL.", "MCP アドレスが無効です。完全な HTTPS URL を入力してください。"],
  "无法显示密钥": ["Could not reveal key", "キーを表示できません"],
  "轮换未完成，请检查状态": ["Rotation incomplete. Check status.", "更新未完了。状態をご確認ください。"],
  "轮换成功，请复制新 Owner Key": ["Rotation complete. Copy the new Owner Key.", "更新完了。新しい Owner Key をコピーしてください。"],
  "确认轮换现有云端 Owner Key？旧密钥不能用于新授权，已有 OAuth Token 不会自动撤销。": ["Rotate this cloud Owner Key? Old key cannot authorize new clients; issued OAuth tokens are not automatically revoked.", "クラウド Owner Key を更新しますか？旧キーは新しい認証に使用できません。既存の OAuth Token は自動失効しません。"],
  "本机未保存 Owner Key；可关联已有云端服务并轮换": ["Owner Key not saved. Link the existing cloud service and rotate.", "Owner Key は未保存です。既存のクラウドサービスに連携して更新してください。"],
  "本机已保存 Owner Key，可复制或临时显示": ["Owner Key saved locally. Copy or reveal temporarily.", "Owner Key はこの端末に保存済みです。コピーまたは一時表示できます。"],
  "Owner Key（30 秒后自动隐藏）": ["Owner Key (auto-hide after 30 seconds)", "Owner Key（30 秒後に自動非表示）"],
  "更新云端 Owner Key": ["Updating cloud Owner Key", "クラウド Owner Key を更新中"],
  "关联并轮换 Owner Key": ["Link and rotate Owner Key", "Owner Key の連携・更新"],
  "复制 Owner Key": ["Copy Owner Key", "Owner Key をコピー"],
  "本机没有 Owner Key 记录；请检查最初初始化设备或备份": ["No local Owner Key record; check the initializing device or backup.", "この端末に Owner Key はありません。初期化端末またはバックアップを確認してください。"],
  "本机已保存 Owner Key 记录；Cloudflare 不能显示原密钥": ["Owner Key record saved locally; Cloudflare cannot reveal its value.", "Owner Key はローカルに保存されていますが Cloudflare は元の値を表示できません。"],
  "正在检查本机授权记录…": ["Checking local authorization record…", "ローカル認証情報を確認中…"],
  "打开 Cloudflare 控制台": ["Open Cloudflare dashboard", "Cloudflare ダッシュボードを開く"],
  "密钥丢失：优先检查初始设备和安全备份；如果无法恢复，需要同步轮换云端 Secret 和本地凭据。不要直接覆盖或重复部署。": ["Lost key: check the original device or secure backup; otherwise rotate the cloud Secret and local credentials together. Do not overwrite it or redeploy blindly.", "キーを紛失した場合は初期化端末またはバックアップを確認し、必要ならクラウドと端末側の認証情報を連携してローテーションしてください。"],
  "检查配置：Cloudflare Workers & Pages → chattoharness-auth → Settings → Variables and Secrets → OWNER_AUTH_KEY。": ["Check Cloudflare Workers & Pages → chattoharness-auth → Settings → Variables and Secrets → OWNER_AUTH_KEY.", "Cloudflare Workers & Pages → chattoharness-auth → Settings → Variables and Secrets → OWNER_AUTH_KEY を確認します。"],
  "首次初始化：ChatToHarness 生成 Owner Key，并加密保存于初始设备。": ["First setup: ChatToHarness generates an Owner Key and saves it encrypted on the original device.", "初期設定時：ChatToHarness が Owner Key を生成し、初期化端末に暗号化して保存します。"],
  "Cloudflare Worker Secret 保存后无法查看原始值。在 Cloudflare 只能检查 OWNER_AUTH_KEY 是否已配置，不能复制原密钥。": ["Cloudflare Worker Secrets cannot be revealed after saving. You can only verify whether OWNER_AUTH_KEY exists.", "Cloudflare Worker Secret は保存後に値を表示できません。OWNER_AUTH_KEY の登録状況のみ確認できます。"],
  "每套云端服务只有一个 Owner Key，供 ChatGPT 授权使用；不是设备配对码。": ["One Owner Key per cloud deployment authorizes ChatGPT; it is not a device pairing code.", "各クラウド構成の Owner Key は一つで、デバイスのペアリングコードとは異なります。"],
  "Owner Key 授权指引": ["Owner Key authorization guide", "Owner Key 認証ガイド"],
  "应用系统代理": ["Use system proxy", "システムプロキシを使用"],
  "代理配置": ["Proxy configuration", "プロキシ構成"],
  "代理设置": ["Proxy settings", "プロキシ設定"],
  "返回": ["Back", "戻る"],
  "用户名（选填）": ["Username (optional)", "ユーザー名（任意）"],
  "密码（选填）": ["Password (optional)", "パスワード（任意）"],
  "代理服务器需要身份验证": ["Proxy server requires authentication", "プロキシサーバーに認証が必要"],
  "用户名": ["Username", "ユーザー名"],
  "密码": ["Password", "パスワード"],
  "显示密码": ["Show password", "パスワードを表示"],
  "记住密码": ["Remember password", "パスワードを保存"],
  "清除密码": ["Clear password", "パスワードを消去"],
  "保存": ["Save", "保存"],
  "直连": ["Direct", "直接接続"],
  "通过代理": ["Via proxy", "プロキシ経由"],
  "测试地址": ["Test URL", "テスト URL"],
  "使用操作系统配置的代理。需要填写用户名密码时，请选择手动配置。": ["Use your operating system proxy configuration. Choose manual configuration to enter a username and password.", "OS のプロキシ設定を使用します。ユーザー名とパスワードを指定する場合は手動設定を選択してください。"],
  "记住的密码由系统加密保存；不勾选时仅在本次应用运行期间保留。": ["Remembered passwords are encrypted by the operating system. Otherwise they are kept only while this app is running.", "保存するパスワードは OS で暗号化されます。未選択の場合はアプリの実行中のみ保持します。"],
  "绕过本机地址": ["Bypass local addresses", "ローカルアドレスを除外"],
  "绕过局域网地址（包括当前网段）": ["Bypass LAN addresses (including current subnets)", "LAN アドレスを除外（現在のサブネットを含む）"],
  "已保存密码；留空保留原密码。": ["Password available. Leave blank to keep it.", "パスワードは保存済みです。空欄で維持します。"],
  "密码仅在本次运行有效；留空保留。": ["Password is available for this app session only. Leave blank to keep it.", "パスワードは今回の実行中のみ有効です。空欄で維持します。"],
  "尚未保存密码。": ["No password saved.", "パスワードは未保存です。"],
  "请填写代理密码，或重新输入已保存的密码。": ["Enter the proxy password or re-enter the saved password.", "プロキシのパスワードを入力してください。"],
  "代理密码无法解密，请重新输入。": ["Unable to decrypt the proxy password. Enter it again.", "プロキシのパスワードを復号できません。再入力してください。"],
  "代理密码格式无效。": ["Invalid proxy password format.", "プロキシパスワードの形式が無効です。"],
  "SOCKS5 密码不能超过 255 字节。": ["SOCKS5 passwords cannot exceed 255 bytes.", "SOCKS5 のパスワードは 255 バイト以内にしてください。"],
  "代理密码无法加密，原配置已保留。": ["Unable to encrypt the proxy password. Existing settings were preserved.", "プロキシのパスワードを暗号化できません。元の設定を維持しました。"],
  "代理认证失败，请检查用户名和密码。": ["Proxy authentication failed. Check the username and password.", "プロキシ認証に失敗しました。ユーザー名とパスワードを確認してください。"],
  "连接测试超时。": ["Connection test timed out.", "接続テストがタイムアウトしました。"],
  "无法解析服务器地址。": ["Unable to resolve the server address.", "サーバーのアドレスを解決できません。"],
  "TLS 证书验证失败，请检查代理或目标证书。": ["TLS certificate validation failed. Check the proxy or destination certificate.", "TLS 証明書の検証に失敗しました。プロキシまたは接続先の証明書を確認してください。"],
  "代理已响应，但测试目标返回异常。": ["The proxy responded, but the test destination returned an error.", "プロキシは応答しましたが、テスト先がエラーを返しました。"],
  "测试地址必须是有效的 HTTP 或 HTTPS 地址。": ["The test URL must be a valid HTTP or HTTPS address.", "有効な HTTP または HTTPS のテスト URL を入力してください。"],
  "已有连接测试正在进行。": ["A connection test is already running.", "接続テストは既に実行中です。"],
  "代理连接失败，请检查服务器和端口。": ["Proxy connection failed. Check the server and port.", "プロキシに接続できません。サーバーとポートを確認してください。"],
  "正在测试连接…": ["Testing connection…", "接続をテスト中…"],
  "连接成功（HTTP {status}，{ms} 毫秒，{route}）。": ["Connected (HTTP {status}, {ms} ms, {route}).", "接続成功（HTTP {status}、{ms} ミリ秒、{route}）。"],
  "代理模式": ["Proxy mode", "プロキシモード"],
  "不使用代理（直连）": ["No proxy (direct)", "プロキシを使用しない（直接接続）"],
  "使用系统代理": ["Use system proxy", "システムプロキシを使用"],
  "手动配置代理": ["Manual proxy configuration", "プロキシを手動設定"],
  "系统模式读取操作系统的代理设置；手动模式使用下方地址。": ["System mode reads your operating system settings; manual mode uses the address below.", "システムモードでは OS の設定、手動モードでは下のアドレスを使用します。"],
  "代理类型": ["Proxy type", "プロキシの種類"],
  "代理服务器": ["Proxy server", "プロキシサーバー"],
  "填写主机名或 IP 地址，不含协议和端口。": ["Enter a hostname or IP address without a scheme or port.", "ホスト名または IP アドレスを入力してください。プロトコルとポートは不要です。"],
  "端口": ["Port", "ポート"],
  "不走代理的地址": ["Bypass proxy for", "プロキシを使用しないアドレス"],
  "恢复默认地址": ["Restore default addresses", "既定のアドレスに戻す"],
  "每行一个，或用逗号分隔。支持域名、IP、CIDR 网段及 *.example.com。默认包含本机、常见内网地址段及当前网卡所在网段；切换网络后可恢复默认地址。": ["One entry per line or separated by commas. Supports domains, IPs, CIDR subnets and *.example.com. Defaults include local addresses, common private ranges and current adapter subnets. Restore defaults after changing networks.", "改行またはカンマで区切ります。ドメイン、IP、CIDR、*.example.com に対応します。既定値にはローカルアドレス、一般的なプライベート範囲、現在のネットワークが含まれます。ネットワーク変更後は既定値に戻せます。"],
  "这些设置用于安全通道连接。保存后请重新连接，命中不走代理地址时使用直连。": ["These settings apply to the secure tunnel. Reconnect after saving. Matching bypass addresses connect directly.", "安全なトンネルに適用されます。保存後に再接続してください。除外アドレスには直接接続します。"],
  "保存代理设置": ["Save proxy settings", "プロキシ設定を保存"],
  "代理设置已保存，请重新连接。": ["Proxy settings saved. Reconnect to apply.", "プロキシ設定を保存しました。再接続してください。"],
  "代理配置无效，请检查代理地址、端口和不走代理的地址。": ["Invalid proxy configuration. Check the server, port and bypass addresses.", "プロキシ設定が無効です。サーバー、ポート、除外アドレスを確認してください。"],
  "配置安全通道使用的代理。": ["Configure the proxy used by the secure tunnel.", "安全なトンネルで使用するプロキシを設定します。"],
  "返回连接配置": ["Back to connection configuration", "接続設定に戻る"],
  "连接时读取系统代理，保存并连接后生效。": ["Read the system proxy when connecting. Apply with Save and connect.", "接続時にシステムプロキシを取得します。保存して接続すると適用されます。"],
  "系统代理设置无效。": ["Invalid system proxy setting.", "システムプロキシ設定が無効です。"],
  "无法读取可用的系统代理，请检查系统代理设置。": ["Unable to read a usable system proxy. Check your system proxy settings.", "利用可能なシステムプロキシを取得できません。設定を確認してください。"],
  "系统代理类型暂不支持，请配置 HTTP 或 SOCKS5 代理。": ["Unsupported system proxy type. Configure an HTTP or SOCKS5 proxy.", "未対応のプロキシ形式です。HTTP または SOCKS5 を設定してください。"],
  "已开启允许所有工具。各插件保存的逐项权限在关闭此开关后生效。": ["Allow all tools is enabled. Each plugin’s saved tool permissions take effect after turning it off.", "すべてのツールが許可されています。オフにすると、各プラグインに保存されたツール権限が適用されます。"],
  "已启用": ["Enabled", "有効"],
  "添加插件": ["Add plugin", "プラグインを追加"],
  "插件设置": ["Plugin settings", "プラグイン設定"],
  "接入 MCP 服务": ["Connect an MCP server", "MCP サーバーに接続"],
  "通过 MCP 连接本机或远程工具。": ["Connect local or remote tools through MCP.", "MCP でローカルまたはリモートのツールに接続します。"],
  "从已有配置中批量添加插件。": ["Add multiple plugins from an existing configuration.", "既存の設定から複数のプラグインを追加します。"],
  "允许所有 MCP 插件工具": ["Allow all MCP plugin tools", "すべての MCP プラグインツールを許可"],
  "全局工具权限": ["Global tool permissions", "全体のツール権限"],
  "以下设置影响所有 MCP 插件。": ["These settings affect every MCP plugin.", "これらの設定はすべての MCP プラグインに適用されます。"],
  "导出插件连接配置，不包含密钥、信任或工具授权。": ["Export plugin connection settings without secrets, trust decisions, or tool grants.", "秘密情報、信頼、ツールの許可を含めずにプラグインの接続設定をエクスポートします。"],
  "插件管理内容": ["Plugin management sections", "プラグイン管理の項目"],
  "概览与权限": ["Overview & permissions", "概要と権限"],
  "导入配置": ["Import configuration", "設定をインポート"],
  "插件管理": ["Plugin management", "プラグイン管理"],
  "关闭插件管理": ["Close plugin management", "プラグイン管理を閉じる"],
  "插件": ["Plugins", "プラグイン"],
  "插件分类": ["Plugin categories", "プラグインの分類"],
  "已安装": ["Installed", "インストール済み"],
  "MCP 服务": ["MCP servers", "MCP サーバー"],
  "你的插件": ["Your plugins", "利用中のプラグイン"],
  "管理内置能力和通过 MCP 连接的工具。": ["Manage built-in capabilities and tools connected through MCP.", "内蔵機能と MCP で接続したツールを管理します。"],
  "内置": ["Built-in", "内蔵"],
  "让 AI 查看和操作你电脑上的应用。": ["Let AI view and control apps on your computer.", "AI にコンピューター上のアプリの表示と操作を許可します。"],
  "管理": ["Manage", "管理"],
  "添加 MCP 插件": ["Add MCP plugin", "MCP プラグインを追加"],
  "连接工具，管理 AI 可以使用的能力。": ["Connect tools and manage what AI can use.", "ツールを接続し、AI が利用できる機能を管理します。"],
  "管理 AI 对电脑应用的控制和系统权限。": ["Manage desktop app control and system permissions for AI.", "AI によるアプリ操作とシステム権限を管理します。"],
  "控制": ["Control", "操作"],
  "允许控制电脑": ["Allow computer control", "コンピューターの操作を許可"],
  "让 AI 查看和操作当前电脑的应用。关闭后立即停止控制并移除工具。": ["Let AI view and control apps on this computer. Turning this off immediately stops control and removes the tool.", "このコンピューター上のアプリの表示と操作を AI に許可します。オフにすると操作を即座に停止し、ツールを削除します。"],
  "操作期间可随时按 Esc 或点击 STOP 停止。": ["Press Esc or click STOP at any time to stop control.", "Esc キーまたは STOP でいつでも操作を停止できます。"],
  "系统权限": ["System permissions", "システム権限"],
  "在 macOS 隐私与安全性中管理授权。": ["Manage access in macOS Privacy & Security.", "macOS のプライバシーとセキュリティで権限を管理します。"],
  "检查权限": ["Check permissions", "権限を確認"],
  "用于查看应用窗口。": ["Used to view app windows.", "アプリのウィンドウを表示するために使用します。"],
  "打开设置": ["Open settings", "設定を開く"],
  "用于点击、输入和响应停止快捷键。": ["Used to click, type, and respond to the stop shortcut.", "クリック、入力、停止ショートカットへの応答に使用します。"],
  "开发版与安装版需要分别授权。修改权限后，请重新检查；必要时重启应用。": ["Development and installed apps need separate permission grants. Check again after changes; restart the app if needed.", "開発版とインストール版には個別の権限が必要です。変更後は再確認し、必要に応じてアプリを再起動してください。"],
  "在系统设置中为 ChatToHarness 开启屏幕录制与辅助功能。开发版与安装版需要分别授权。": ["Enable Screen Recording and Accessibility for ChatToHarness in System Settings. Development and installed apps need separate grants.", "システム設定で ChatToHarness の画面収録とアクセシビリティを有効にしてください。開発版とインストール版には個別の許可が必要です。"],
  "组件不可用": ["Component unavailable", "コンポーネントを利用できません"],
  "尚未检查": ["Not checked", "未確認"],
  "已授权": ["Granted", "許可済み"],
  "未授权": ["Not granted", "未許可"],
  "通过 MCP 连接": ["Connected through MCP", "MCP で接続"],
  "Computer Use 需要系统权限": ["Computer Use requires system permissions", "Computer Use にはシステム権限が必要です"],
  "权限授予后请重新检查。当前操作已停止，不会自动重放鼠标或键盘输入。": ["After granting permission, check again. The current operation has stopped; mouse and keyboard input will not be replayed.", "権限を許可後に再確認してください。現在の操作は停止し、マウスやキー入力を再実行しません。"],
  "请求系统授权": ["Request system permission", "システム権限を要求"],
  "打开屏幕录制设置": ["Open Screen Recording settings", "画面収録設定を開く"],
  "打开辅助功能设置": ["Open Accessibility settings", "アクセシビリティ設定を開く"],
  "重新检查": ["Check again", "再確認"],
  "稍后处理": ["Later", "後で"],
  "屏幕录制": ["Screen Recording", "画面収録"],
  "辅助功能": ["Accessibility", "アクセシビリティ"],
  "缺少系统权限：{permissions}": ["Missing system permissions: {permissions}", "不足しているシステム権限：{permissions}"],
  "权限检查失败，请重新检查或在系统设置中确认。": ["Permission check failed. Check again or inspect system settings.", "権限確認に失敗しました。再確認するかシステム設定を確認してください。"],
  "Windows 窗口授权未完成。请再次选择目标窗口并确认授权。": ["Windows window consent was not completed. Select the target window again and approve control.", "Windows のウィンドウ許可が完了していません。対象ウィンドウを選び直し、操作を許可してください。"],

  "启用 Computer Use": ["Enable Computer Use", "Computer Use を有効にする"],
  "仅注册当前操作系统的桌面控制工具（macOS / Windows），默认关闭。关闭后立即终止正在进行的控制会话并移除工具。启用后可控制当前用户的桌面窗口；仍受系统权限、前台检查及 Esc/STOP 保护。": ["Register only the desktop controller for this OS (macOS / Windows). Off by default. Disabling immediately ends control sessions and removes the tool. Enabling permits controlling desktop windows, subject to OS permissions, foreground checks and Esc/STOP.", "この OS（macOS / Windows）専用のデスクトップ操作ツールのみ登録します。初期値はオフです。無効にすると操作セッションが終了し、ツールが削除されます。有効時は OS の権限、前面ウィンドウの検査と Esc/STOP に従いデスクトップを操作できます。"],
  "当前设备缺少 Computer Use 原生组件。": ["Computer Use native helper is not available on this device.", "この端末には Computer Use のネイティブコンポーネントがありません。"],
  "已启用当前系统的 Computer Use；通道连接后自动提供工具。": ["Computer Use is enabled for this OS; the tool will be available when connected.", "この OS の Computer Use が有効です。接続するとツールが公開されます。"],
  "已关闭：ChatGPT 无法发现或执行 Computer Use。": ["Disabled: ChatGPT cannot discover or invoke Computer Use.", "無効：ChatGPT は Computer Use を検出・実行できません。"],
  "部分工具不可用": ["Some tools are unavailable", "一部のツールを利用できません"],
  "通道状态与工具状态分别检查；部分工具暂时不可用。": ["The channel and tools have separate health checks. Some tools are currently unavailable.", "接続とツールの状態は別々に確認されます。一部のツールは現在利用できません。"],
  "本页帮助": ["Help for this page", "この画面のヘルプ"],
  "使用文档": ["User guide", "使い方ガイド"],
  "按步骤了解连接、文件、工具和问题处理。": ["Step-by-step help for connections, files, tools and troubleshooting.", "接続、ファイル、ツール、問題解決を手順に沿って確認できます。"],
  "打开帮助中心": ["Open help center", "ヘルプセンターを開く"],
  "支持这个项目": ["Support this project", "このプロジェクトを応援"],
  "如果 ChatToHarness 帮到了你，欢迎到 GitHub 点个 Star。": ["If ChatToHarness has helped you, consider giving it a star on GitHub.", "ChatToHarness が役立ったら、GitHub で Star を付けて応援していただけるとうれしいです。"],
  "在 GitHub 点 Star": ["Star on GitHub", "GitHub で Star を付ける"],
  "日志": ["Logs", "ログ"],
  "日志子菜单": ["Log submenu", "ログのサブメニュー"],
  "实时日志": ["Live logs", "リアルタイムログ"],
  "退出码 {code}": ["Exit code {code}", "終了コード {code}"],
  "持续查看本机连接、工具调用与异常日志。": ["Follow local connections, tool calls and errors as they happen.", "ローカル接続・ツール呼び出し・エラーをリアルタイムで確認します。"],
  "直接查看本机工具、连接和异常，自动滚动更新。": ["View local tools, connections and errors in a live scrolling feed.", "ローカルのツール・接続・エラーを自動スクロールで表示します。"],
  "查看实时日志": ["View live logs", "リアルタイムログを見る"],
  "本机应用事件与工具执行状态，每 2 秒更新；不包含完整文件内容和密钥。": ["Local app events and tool execution states update every 2 seconds; full file contents and credentials are excluded.", "ローカルアプリのイベントとツール実行状態を2秒ごとに更新します。ファイル全文や認証情報は含まれません。"],
  "自动更新": ["Updating live", "自動更新中"],
  "已暂停": ["Paused", "一時停止中"],
  "日志筛选": ["Log filters", "ログフィルター"],
  "工具": ["Tools", "ツール"],
  "异常": ["Errors", "異常"],
  "系统": ["System", "システム"],
  "搜索日志": ["Search logs", "ログを検索"],
  "自动滚动": ["Auto-scroll", "自動スクロール"],
  "暂停": ["Pause", "一時停止"],
  "继续": ["Resume", "再開"],
  "清空显示": ["Clear view", "表示をクリア"],
  "重新载入": ["Reload recent", "最新ログを再読込"],
  "实时日志内容": ["Live log entries", "リアルタイムログの内容"],
  "打开日志文件夹": ["Open log folder", "ログフォルダーを開く"],
  "查看执行记录 →": ["Execution history →", "実行履歴を見る →"],
  "等待新日志…": ["Waiting for log entries…", "新しいログを待機中…"],
  "没有符合筛选条件的日志。": ["No log entries match the current filters.", "フィルターに一致するログはありません。"],
  "已显示 {count} 条日志，内存最多保留 400 条。": ["Showing {count} entries; at most 400 kept in memory.", "{count} 件表示中。メモリには最大400件保持します。"],

  "执行记录": ["Execution history", "実行履歴"],
  "按需查看本机工具执行与响应写入状态。": ["Inspect local execution and response writes on demand.", "ローカル実行と応答書き込みを確認します。"],
  "筛选": ["Filter", "フィルター"],
  "全部": ["All", "すべて"],
  "进行中": ["Running", "実行中"],
  "错误": ["Errors", "エラー"],
  "搜索执行记录": ["Search execution history", "実行履歴を検索"],
  "刷新": ["Refresh", "更新"],
  "本机写入成功不代表 ChatGPT 已接收。远端确认始终未知。": ["A successful local write does not prove ChatGPT received the result. Remote acknowledgement is unknown.", "ローカル書き込みの成功は ChatGPT の受信を保証しません。リモート確認は不明です。"],
  "详细诊断（30 分钟后自动关闭）": ["Detailed diagnostics (off automatically after 30 minutes)", "詳細診断（30 分後に自動停止）"],
  "选择": ["Select", "選択"],
  "时间": ["Time", "時刻"],
  "工具与操作": ["Tool and operation", "ツールと操作"],
  "项目或 MCP": ["Project or MCP", "プロジェクトまたは MCP"],
  "状态": ["State", "状態"],
  "耗时": ["Duration", "所要時間"],
  "上一页": ["Previous", "前へ"],
  "下一页": ["Next", "次へ"],
  "导出所选记录": ["Export selected records", "選択した記録をエクスポート"],
  "记录详情": ["Record details", "記録の詳細"],
  "复制诊断摘要": ["Copy diagnostic summary", "診断概要をコピー"],
  "复制恢复信息": ["Copy recovery information", "復旧情報をコピー"],
  "结果已保存，可恢复": ["Result saved and recoverable", "結果は保存済みで復元できます"],
  "保存的结果已过期": ["Saved result expired", "保存された結果は期限切れです"],
  "此记录未保存结果": ["No saved result for this record", "この記録には保存された結果がありません"],
  "结果保存失败，请先核对任务与产物": ["Result could not be saved; inspect the task and artifacts first", "結果を保存できませんでした。先にタスクと成果物を確認してください"],
  "保存的结果暂不可用": ["Saved result is currently unavailable", "保存された結果を現在利用できません"],
  "已接收": ["Received", "受信済み"],
  "等待批准": ["Waiting for approval", "承認待ち"],
  "任务已提交": ["Task submitted", "タスク送信済み"],
  "执行中": ["Running", "実行中"],
  "成功": ["Succeeded", "成功"],
  "失败": ["Failed", "失敗"],
  "已中断": ["Interrupted", "中断"],
  "未知": ["Unknown", "不明"],
  "正在取消": ["Cancelling", "キャンセル中"],
  "待补全参数": ["Needs arguments", "パラメーターの補完待ち"],
  "待读取项目规范": ["Needs project guidance", "プロジェクト規約の確認待ち"],
  "响应已写入本机通道": ["Response written to local channel", "応答をローカル通道に書き込み済み"],
  "本机写入成功": ["Local write succeeded", "ローカル書き込み成功"],
  "本机写入失败": ["Local write failed", "ローカル書き込み失敗"],

  "查看参数与确认来源": ["Parameters and confirmation source", "パラメーターと確認元"],
  "这是 ChatToHarness 本机确认。ChatGPT、操作系统和外部服务可能另行确认。": ["This is a local ChatToHarness confirmation. ChatGPT, the operating system and external services may ask separately.", "これは ChatToHarness のローカル確認です。ChatGPT、OS、外部サービスが別途確認する場合があります。"],
  "项目授权用于复用确认，不会把终端或外部服务限制在该目录中。": ["Project grants reuse confirmation; they do not confine a terminal or external service to this directory.", "プロジェクト権限は確認を再利用します。端末や外部サービスのアクセス範囲をこのディレクトリに制限するものではありません。"],
  "本机授权范围": ["Local permission scope", "ローカル権限の範囲"],
  "仅本次": ["This call only", "今回のみ"],
  "此项目内记住": ["Remember for this project", "このプロジェクトで記憶"],
  "记住此工具": ["Remember this tool", "このツールを記憶"],
  "已记住 {count} 个项目的授权": ["Permissions saved for {count} projects", "{count} 件のプロジェクト権限を保存済み"],
  "项目授权范围": ["Project permission scope", "プロジェクト権限の範囲"],
  "清除项目授权": ["Clear project permissions", "プロジェクト権限を解除"],

  "添加工作目录或 MCP 服务，保存连接配置，即可开始。": ["Add a working directory or MCP server, then save your connection settings to begin.", "作業ディレクトリまたは MCP サーバーを追加し、接続設定を保存して開始してください。"],
  "未启用文件工具": ["File tools disabled", "ファイルツールは無効です"],
  "已拒绝此次工具调用。": ["This tool call was rejected.", "今回のツール呼び出しを拒否しました。"],
  "此次调用的确认已过期，未获得执行授权。": ["Confirmation expired. This call was not authorized to execute.", "確認期限が切れました。この呼び出しは実行を許可されていません。"],
  "服务认证失败，请检查密钥或请求头。": ["Server authentication failed. Check secrets or request headers.", "サーバー認証に失敗しました。キーまたはリクエストヘッダーを確認してください。"],
  "MCP 操作已取消。": ["The MCP operation was cancelled.", "MCP 操作をキャンセルしました。"],
  "MCP 服务连接失败，请检查配置或稍后重试。": ["MCP server connection failed. Check the configuration or try again later.", "MCP サーバーへの接続に失敗しました。設定を確認するか、後でもう一度お試しください。"],
  "连接 MCP 服务超时，请检查服务是否可用。": ["The MCP connection timed out. Check whether the server is available.", "MCP 接続がタイムアウトしました。サーバーが利用可能か確認してください。"],
  "工具目录已更新，请刷新后重试。": ["The tool catalog changed. Refresh it and retry.", "ツール一覧が更新されました。更新して再試行してください。"],
  "MCP 服务已断开；执行中的调用请先检查实际结果。": ["The MCP server disconnected. Check the actual result of any call that was running.", "MCP サーバーが切断されました。実行中だった呼び出しの実際の結果を先に確認してください。"],
  "调用确认无效，请重新发起请求。": ["The call confirmation is invalid. Make a new request.", "呼び出しの確認が無効です。新しいリクエストを送信してください。"],
  "工具参数无效，请检查后重试。": ["Tool arguments are invalid. Check them and retry.", "ツールの引数が無効です。確認して再試行してください。"],
  "MCP 配置无效，请检查后重试。": ["MCP configuration is invalid. Check it and retry.", "MCP 設定が無効です。確認して再試行してください。"],
  "工具已变更，请刷新列表后重新授权。": ["The tool changed. Refresh the list and authorize it again.", "ツールが変更されました。一覧を更新して権限を再設定してください。"],
  "MCP 消息超过允许大小，请减少请求或返回内容。": ["The MCP message exceeds the size limit. Reduce the request or response content.", "MCP メッセージがサイズ上限を超えています。リクエストまたは応答の内容を減らしてください。"],
  "尚无已授权的工具，请先启用服务并设置工具权限，或添加工作目录。": ["No tools are authorized yet. Enable a server and set tool permissions, or add a working directory.", "許可されたツールがありません。サーバーを有効にしてツール権限を設定するか、作業ディレクトリを追加してください。"],
  "工具权限已变更，此次调用已停止。": ["Tool permissions changed. This call was stopped.", "ツール権限が変更されました。この呼び出しは停止されました。"],
  "服务返回的 MCP 消息无效，连接已停止。": ["The server returned an invalid MCP message. The connection was stopped.", "サーバーが無効な MCP メッセージを返したため、接続を停止しました。"],
  "此服务的 MCP 协议版本暂不支持，请使用兼容版本。": ["This MCP protocol version is unsupported. Use a compatible server version.", "この MCP プロトコルバージョンには対応していません。互換性のあるサーバーをご利用ください。"],
  "此服务有缺失或无法解密的密钥，请编辑并重新填写。": ["This server has missing or unreadable secrets. Edit it and enter them again.", "このサーバーには不足または復号できないキーがあります。編集して再入力してください。"],
  "此服务正在处理较多请求，请稍后重试。": ["The server is handling too many requests. Try again shortly.", "サーバーへのリクエストが多すぎます。しばらくしてから再試行してください。"],
  "MCP 连接已停止。": ["The MCP connection stopped.", "MCP 接続を停止しました。"],
  "调用已超时。若已开始执行，请先检查实际结果。": ["The call timed out. If execution had started, check the actual result first.", "呼び出しがタイムアウトしました。実行が始まっていた場合は実際の結果を先に確認してください。"],
  "工具定义已变更，请重新核对并授权。": ["The tool definition changed. Review it and authorize it again.", "ツールの定義が変更されました。再確認して権限を設定してください。"],
  "此工具尚未获得调用授权。": ["This tool is not authorized for calls.", "このツールは呼び出しを許可されていません。"],
  "请先核对并信任此服务，再连接或测试。": ["Review and trust this server before connecting or testing.", "接続やテストの前にサーバーを確認して信頼してください。"],
  "无法启动服务，请检查命令、参数与工作目录。": ["The server could not start. Check the command, arguments and working directory.", "サーバーを起動できません。コマンド、引数、作業ディレクトリを確認してください。"],
  "MCP 服务连接已关闭。": ["The MCP server connection is closed.", "MCP サーバー接続が閉じられました。"],
  "此服务已在运行，请复用现有连接。": ["This server is already running. Reuse the existing connection.", "このサーバーは実行中です。既存の接続を再利用してください。"],
  "服务 ID 须以小写字母开头，最多 32 位，可含数字、下划线或连字符。": ["Server IDs must start with a lowercase letter, use at most 32 characters, and contain only lowercase letters, numbers, underscores or hyphens.", "サーバー ID は小文字で始め、32 文字以内の小文字英数字・アンダースコア・ハイフンを使用してください。"],
  "请填写启动命令；文件路径须为对应平台的绝对路径。": ["Enter a command. File paths must be absolute for the target platform.", "起動コマンドを入力してください。ファイルパスは対象プラットフォームの絶対パスが必要です。"],
  "启动工作目录须为对应平台的绝对路径。": ["The working directory must be an absolute path for the target platform.", "作業ディレクトリには対象プラットフォームの絶対パスを指定してください。"],
  "服务地址须使用 HTTPS；仅本机回环地址可使用 HTTP，且不能包含账号、密码或片段。": ["Server URLs require HTTPS; only loopback addresses may use HTTP. Do not include credentials or fragments.", "サーバー URL には HTTPS が必要です。HTTP はループバックアドレスのみ使用できます。認証情報やフラグメントを含めないでください。"],
  "此连接方式暂不支持，请选择 stdio 或 Streamable HTTP。": ["This transport is unsupported. Choose stdio or Streamable HTTP.", "この接続方式には対応していません。stdio または Streamable HTTP を選択してください。"],
  "平台覆盖配置无效，请仅使用 darwin 和 win32。": ["Platform overrides are invalid. Use only darwin and win32.", "プラットフォーム別設定が無効です。darwin と win32 のみ使用してください。"],
  "密钥引用无效，请保留原引用或重新输入密钥。": ["The secret reference is invalid. Keep the original reference or enter the secret again.", "キー参照が無効です。元の参照を残すか、キーを再入力してください。"],
  "导入配置无效，请检查 JSON 格式及服务定义。": ["The import is invalid. Check the JSON format and server definitions.", "インポート設定が無効です。JSON 形式とサーバー定義を確認してください。"],
  "导入预览已过期，请重新预览。": ["The import preview expired. Preview it again.", "インポートのプレビュー期限が切れました。再度プレビューしてください。"],
  "导入预览与当前配置冲突，请重新预览。": ["The import preview conflicts with current configuration. Preview it again.", "インポートのプレビューが現在の設定と競合しています。再度プレビューしてください。"],
  "此 MCP 服务已不存在，请刷新列表。": ["This MCP server no longer exists. Refresh the list.", "この MCP サーバーは削除されています。一覧を更新してください。"],
  "MCP 服务数量超过上限（100）。": ["The number of MCP servers exceeds the limit of 100.", "MCP サーバー数が上限の 100 件を超えています。"],
  "MCP 配置超过允许大小，请减少服务或配置内容。": ["MCP configuration exceeds the size limit. Reduce servers or configuration content.", "MCP 設定がサイズ上限を超えています。サーバー数または設定内容を減らしてください。"],
  "此启动配置不适用于当前平台，请填写平台覆盖路径。": ["This launch configuration does not support this platform. Add a platform-specific path.", "この起動設定は現在のプラットフォームに対応していません。プラットフォーム別のパスを指定してください。"],
  "系统安全存储不可用，请完成系统授权后重试。": ["System secure storage is unavailable. Complete system authorization and retry.", "システムの安全なストレージを利用できません。システムの許可を完了して再試行してください。"],
  "密钥无法安全保存，请重试。": ["The secret could not be saved securely. Retry.", "キーを安全に保存できません。再試行してください。"],
  "MCP 配置目录不安全，未读取或写入配置。": ["The MCP configuration directory is unsafe. Configuration was not read or written.", "MCP 設定ディレクトリが安全でないため、設定の読み書きを行っていません。"],
  "MCP 配置存储不可用，请检查目录权限。": ["MCP configuration storage is unavailable. Check directory permissions.", "MCP 設定ストレージを利用できません。ディレクトリ権限を確認してください。"],
  "MCP 配置文件无法读取，原文件已保留。": ["The MCP configuration file could not be read. The original file has been preserved.", "MCP 設定ファイルを読み取れません。元のファイルは保持されています。"],
  "MCP 配置无法保存，请检查目录权限后重试。": ["MCP configuration could not be saved. Check directory permissions and retry.", "MCP 設定を保存できません。ディレクトリ権限を確認して再試行してください。"],
  "电脑操作组件缺失，请重新安装 ChatToHarness。": ["The Computer Use helper is missing. Reinstall ChatToHarness.", "コンピューター操作ヘルパーがありません。ChatToHarness を再インストールしてください。"],
  "电脑操作组件与当前 macOS 不兼容或缺少系统运行库，请安装支持 macOS 14 的 ChatToHarness 安装包。": ["The Computer Use helper is incompatible with this macOS or a system library is missing. Install a macOS 14 compatible ChatToHarness package.", "コンピューター操作ヘルパーがこの macOS に非対応か、システムライブラリがありません。macOS 14 対応パッケージをインストールしてください。"],
  "电脑操作组件不支持当前处理器，请安装匹配此 Mac 的安装包。": ["The Computer Use helper does not support this processor. Install a package for this Mac.", "コンピューター操作ヘルパーがこのプロセッサーに非対応です。この Mac 用のパッケージをインストールしてください。"],
  "系统拒绝启动电脑操作组件，请检查应用文件权限或重新安装。": ["The system refused to launch the Computer Use helper. Check app file permissions or reinstall.", "システムがヘルパーの起動を拒否しました。アプリのファイル権限を確認するか再インストールしてください。"],
  "电脑操作组件响应超时，请检查系统授权弹窗后重试。": ["The Computer Use helper timed out. Check for a system permission prompt and retry.", "ヘルパーの応答がタイムアウトしました。システムの権限ダイアログを確認して再試行してください。"],
  "电脑操作组件启动失败，请查看应用日志并检查安装包是否完整。": ["The Computer Use helper failed to start. Check the app logs and package integrity.", "ヘルパーを起動できませんでした。アプリのログとパッケージを確認してください。"],
  "电脑操作组件返回了无效权限状态，请重新安装或查看应用日志。": ["The Computer Use helper returned an invalid permission status. Reinstall or check the app logs.", "ヘルパーの権限状態が無効です。再インストールするかアプリのログを確認してください。"],
  "MCP 操作未完成，请检查配置后重试。": ["The MCP operation could not complete. Check the configuration and retry.", "MCP 操作を完了できません。設定を確認して再試行してください。"],
  "以小写字母开头，可含数字、下划线或连字符，保存后保持不变。": ["Start with a lowercase letter; numbers, underscores and hyphens are allowed. The ID stays fixed after saving.", "小文字で始め、数字・アンダースコア・ハイフンも使用できます。保存後は変更できません。"],
  "配置本应用的工具服务，再通过安全通道提供给客户端。": ["Configure this app’s tool services and share them with clients through the secure tunnel.", "このアプリのツールサービスを設定し、安全なトンネル経由でクライアントに提供します。"],
  "工作目录：{directory}": ["Working directory: {directory}", "作業ディレクトリ：{directory}"],
  "编辑 MCP 服务": ["Edit MCP server", "MCP サーバーを編集"],
  "添加 MCP 服务": ["Add MCP server", "MCP サーバーを追加"],
  "正在保存…": ["Saving…", "保存中…"],
  "保存服务": ["Save server", "サーバーを保存"],
  "尚未添加 MCP 服务。添加服务或导入配置后，先测试连接再授权工具。": ["No MCP servers yet. Add a server or import configuration, then test the connection and authorize tools.", "MCP サーバーはまだありません。追加または設定をインポートし、接続をテストしてからツールを許可してください。"],
  "已停用": ["Disabled", "無効"],
  "已连接": ["Connected", "接続済み"],
  "等待信任": ["Trust required", "信頼の確認待ち"],
  "未连接": ["Disconnected", "未接続"],
  "协议版本：{version}": ["Protocol version: {version}", "プロトコルバージョン：{version}"],
  "协议版本：尚未协商": ["Protocol version: not negotiated yet", "プロトコルバージョン：未確定"],
  "此服务有缺失的密钥，请编辑并重新填写：{fields}": ["This server has missing secrets. Edit and replace: {fields}", "このサーバーには不足しているキーがあります。編集して再入力してください：{fields}"],
  "停用": ["Disable", "無効にする"],
  "启用": ["Enable", "有効にする"],
  "测试连接": ["Test connection", "接続をテスト"],
  "删除": ["Delete", "削除"],
  "删除此服务会停止连接并移除配置。": ["Deleting this server stops its connection and removes its configuration.", "このサーバーを削除すると接続が停止し、設定が削除されます。"],
  "确认删除": ["Confirm deletion", "削除を確定"],
  "取消": ["Cancel", "キャンセル"],
  "工具与授权（{count}）": ["Tools and permissions ({count})", "ツールと権限（{count}）"],
  "允许所有工具": ["Allow all tools", "すべてのツールを許可"],
  "已启用且受信任的 MCP 服务将放行全部工具，包括以后新增的工具；关闭后恢复逐项权限。切换时，权限受影响的待确认请求或调用会被取消。": ["All tools from enabled, trusted MCP servers are allowed directly, including tools added later. Turning this off restores individual permissions. Switching cancels pending confirmations or calls whose permissions are affected.", "有効で信頼済みの MCP サーバーでは、今後追加されるものも含め、すべてのツールを確認なしで呼び出せます。オフにすると個別の権限に戻ります。切り替え時に、権限の影響を受ける確認待ちのリクエストや呼び出しはキャンセルされます。"],
  "此设置仅管理本机工具权限，ChatGPT 仍可能要求授权。": ["This setting manages local tool permissions only. ChatGPT may still request permission.", "この設定はこの端末のツール権限のみを管理します。ChatGPT 側で許可を求められる場合があります。"],
  "已开启允许所有工具。下方逐项权限在关闭此开关后生效。": ["Allow all tools is on. The individual permissions below apply when this switch is off.", "すべてのツールの許可がオンです。以下の個別権限は、この設定をオフにすると適用されます。"],
  "连接后可预览工具。": ["Connect to preview tools.", "接続後にツールを確認できます。"],
  "关闭后使用的权限": ["Permission when off", "オフ時の権限"],
  "关闭后 {tool} 的调用权限": ["Call permission for {tool} when off", "オフ時の {tool} の呼び出し権限"],
  "连接后可预览工具；工具默认禁用。": ["Connect to preview tools. All tools are disabled by default.", "接続後にツールを確認できます。ツールは初期状態では無効です。"],
  "调用权限": ["Call permission", "呼び出し権限"],
  "{tool} 的调用权限": ["Call permission for {tool}", "{tool} の呼び出し権限"],
  "禁用": ["Disabled", "無効"],
  "直接调用": ["Allow calls", "確認なしで許可"],
  "每次本机确认": ["Confirm every call locally", "毎回この端末で確認"],
  "输入参数": ["Input schema", "入力スキーマ"],
  "返回格式": ["Output schema", "出力スキーマ"],
  "信任并测试": ["Trust and test", "信頼してテスト"],
  "信任并连接": ["Trust and connect", "信頼して接続"],
  "确认截止：{time}": ["Confirmation expires at {time}", "確認期限：{time}"],
  "拒绝": ["Reject", "拒否"],
  "允许此次调用": ["Allow this call", "今回の呼び出しを許可"],
  "请填写有效的 JSON。": ["Enter valid JSON.", "有効な JSON を入力してください。"],
  "启动参数必须是字符串 JSON 数组。": ["Arguments must be a JSON array of strings.", "起動引数は文字列の JSON 配列で入力してください。"],
  "此字段必须是 JSON 对象。": ["This field must be a JSON object.", "この欄には JSON オブジェクトを入力してください。"],
  "导入后需要重新填写引用的密钥。": ["Referenced secrets must be entered again after importing.", "インポート後に参照先のキーを再入力してください。"],
  "导入仅保存配置，不会启动服务；所有工具保持禁用。": ["Import saves configuration without starting servers. All tools remain disabled.", "インポートは設定のみ保存し、サーバーを起動しません。すべてのツールは無効のままです。"],
  "请填写服务 ID 和显示名称。": ["Enter a server ID and display name.", "サーバー ID と表示名を入力してください。"],
  "调用时限须为 1 到 90 秒。": ["The call timeout must be between 1 and 90 seconds.", "呼び出しの制限時間は 1〜90 秒で指定してください。"],
  "MCP 服务配置已保存。": ["MCP server configuration saved.", "MCP サーバー設定を保存しました。"],
  "MCP 配置已导入，请逐项确认信任与工具授权。": ["MCP configuration imported. Review trust and tool permissions for each server.", "MCP 設定をインポートしました。サーバーごとに信頼とツール権限を確認してください。"],
  "已复制 MCP 配置。": ["MCP configuration copied.", "MCP 設定をコピーしました。"],
  "请复制已选中的 MCP 配置。": ["Copy the selected MCP configuration.", "選択した MCP 設定をコピーしてください。"],
  "等待本机确认": ["Local confirmation required", "この端末での確認待ち"],
  "核对服务、工具和参数后再允许执行。关闭窗口不会自动允许。": ["Review the server, tool and arguments before allowing execution. Closing the window does not grant permission.", "サーバー、ツール、引数を確認してから実行を許可してください。ウィンドウを閉じても自動許可されません。"],
  "文件工具需要先选择工作目录；MCP 扩展可以单独使用。Runtime API Key 仅用于运行通道，不能代替客户端或 API 调用方的凭据。": ["File tools require a working directory. MCP extensions can be used independently. The Runtime API Key runs the tunnel and does not replace client or API credentials.", "ファイルツールには作業ディレクトリが必要です。MCP 拡張は単独で利用できます。Runtime API Key はトンネル専用で、クライアントや API の認証情報とは異なります。"],
  "应用级 MCP 服务": ["MCP servers for this app", "アプリ共通の MCP サーバー"],
  "在 ChatToHarness 中连接工具服务，所有客户端共用；无需创建 Agent。": ["Connect tool services in ChatToHarness for all clients. No agent setup is needed.", "ChatToHarness にツールサービスを接続して、すべてのクライアントで利用できます。エージェントの作成は不要です。"],
  "添加服务": ["Add server", "サーバーを追加"],
  "先信任服务，再逐项授权工具。新增或变更的工具默认禁用，客户端可能需要刷新工具目录。": ["Trust each server, then authorize its tools. New or changed tools are disabled by default. Clients may need to refresh their tool catalog.", "サーバーを信頼してからツールごとに権限を設定してください。追加・変更されたツールは初期状態で無効です。クライアント側で一覧の更新が必要な場合があります。"],
  "确认信任此服务": ["Review server trust", "サーバーの信頼を確認"],
  "本地服务以当前用户身份运行；工作目录白名单不会限制第三方进程。仅连接你信任的服务。": ["Local servers run as your user. Working directory permissions do not restrict third-party processes. Only connect servers you trust.", "ローカルサーバーは現在のユーザー権限で動作します。作業ディレクトリの許可は外部プロセスを制限しません。信頼できるサーバーにのみ接続してください。"],
  "保存配置不会授权工具。请勿将密钥写入命令参数或服务地址。": ["Saving configuration does not authorize tools. Keep secrets out of command arguments and server URLs.", "設定の保存だけではツールは許可されません。起動引数やサーバー URL にキーを記載しないでください。"],
  "服务 ID": ["Server ID", "サーバー ID"],
  "使用小写字母、数字或下划线，保存后保持不变。": ["Use lowercase letters, numbers or underscores. The ID stays fixed after saving.", "小文字の英数字とアンダースコアを使用してください。保存後は変更できません。"],
  "显示名称": ["Display name", "表示名"],
  "连接方式": ["Transport", "接続方式"],
  "调用时限（秒）": ["Call timeout (seconds)", "呼び出しの制限時間（秒）"],
  "包含本机确认的等待时间，最长 90 秒。": ["Includes time waiting for local confirmation, up to 90 seconds.", "この端末での確認待ち時間を含みます。最大 90 秒です。"],
  "启动命令": ["Command", "起動コマンド"],
  "启动参数（JSON 数组）": ["Arguments (JSON array)", "起動引数（JSON 配列）"],
  "启动工作目录（可选）": ["Working directory (optional)", "起動時の作業ディレクトリ（任意）"],
  "环境变量（JSON 对象）": ["Environment variables (JSON object)", "環境変数（JSON オブジェクト）"],
  "Mac / Windows 启动覆盖": ["Mac / Windows command overrides", "Mac / Windows の起動設定"],
  "按平台覆盖 command、args、cwd": ["Override command, args and cwd by platform", "プラットフォーム別の command・args・cwd"],
  "使用 darwin 和 win32；未填写的字段沿用上方配置。": ["Use darwin and win32. Omitted fields use the values above.", "darwin と win32 を使用します。省略した項目は上の設定を引き継ぎます。"],
  "服务地址": ["Server URL", "サーバー URL"],
  "远程服务使用 HTTPS；本机回环地址可使用 HTTP。": ["Remote servers require HTTPS. Local loopback addresses may use HTTP.", "リモートサーバーには HTTPS が必要です。ローカルのループバックアドレスでは HTTP を使用できます。"],
  "请求头（JSON 对象）": ["Request headers (JSON object)", "リクエストヘッダー（JSON オブジェクト）"],
  "环境变量与请求头的新值由系统加密保存；已保存的值仅显示 secretRef 引用。保留引用可继续使用，缺失的密钥需要重新填写。": ["New environment and header values are encrypted by the system. Saved values appear only as secretRef references. Keep a reference to reuse it; missing secrets must be entered again.", "新しい環境変数とヘッダー値はシステムで暗号化して保存されます。保存済みの値は secretRef 参照のみ表示します。参照を残すと再利用でき、不足しているキーは再入力が必要です。"],
  "导入与导出": ["Import and export", "インポートとエクスポート"],
  "支持本应用配置和 mcpServers JSON。导入的服务保持停用，密钥、信任与工具授权不会随导出转移。": ["Supports this app’s format and mcpServers JSON. Imported servers stay disabled. Export does not transfer secrets, trust or tool permissions.", "このアプリの形式と mcpServers JSON に対応します。インポートしたサーバーは無効のままです。キー、信頼、ツール権限はエクスポートされません。"],
  "粘贴配置 JSON": ["Paste configuration JSON", "設定 JSON を貼り付け"],
  "预览导入": ["Preview import", "インポートをプレビュー"],
  "导出配置": ["Export configuration", "設定をエクスポート"],
  "待导入服务": ["Servers to import", "インポートするサーバー"],
  "确认导入（全部停用）": ["Import with all servers disabled", "すべて無効の状態でインポート"],
  "不含密钥的导出 JSON": ["Exported JSON without secrets", "キーを含まないエクスポート JSON"],
  "复制配置": ["Copy configuration", "設定をコピー"],
  "诊断只记录服务、工具、耗时和执行状态。断线重连不会自动重放调用；执行中断时请先检查实际结果。": ["Diagnostics record only the server, tool, duration and execution status. Reconnecting does not replay calls. Check the actual result after an interrupted call.", "診断にはサーバー、ツール、所要時間、実行状態のみ記録します。再接続で呼び出しを自動再実行しません。中断した場合は実際の結果を先に確認してください。"],
  "上次检查：{time}": ["Last checked: {time}", "最終確認：{time}"],
  "读取与搜索自动附带适用规范；没有 AGENTS.md 也可正常工作。写入前交付尚未读取的规范。": ["Reads and searches include applicable guidance. Projects without AGENTS.md work normally. Undelivered guidance is provided before writes.", "読み取りと検索には適用規約を添えます。AGENTS.md がなくても利用できます。書き込み前に未読の規約を渡します。"],
  "应用更新": ["App updates", "アプリの更新"],
  "检查更新": ["Check for updates", "更新を確認"],
  "更新应用后，建议刷新聊天客户端中的插件工具列表，以加载最新工具和参数说明。": ["After updating the app, refresh the plugin's tool list in your chat client to load the latest tools and parameter descriptions.", "アプリの更新後は、チャットクライアントでプラグインのツール一覧を更新し、最新のツールとパラメーターの説明を読み込むことをおすすめします。"],
  "重启 {product}": ["Restart {product}", "{product} を再起動"],
  "自动检查更新": ["Automatically check for updates", "更新を自動確認"],
  "启动后检查，此后每 24 小时检查一次。发现新版本时提醒。": ["Check after launch and every 24 hours. Notify when an update is available.", "起動後と以後 24 時間ごとに確認し、新版があればお知らせします。"],
  "正在读取版本…": ["Reading version…", "バージョンを取得中…"],
  "更新下载进度": ["Update download progress", "更新のダウンロード状況"],
  "下载并安装": ["Download and install", "ダウンロードしてインストール"],
  "继续安装": ["Continue installation", "インストールを続行"],
  "查看版本说明 ↗": ["Release notes ↗", "リリースノート ↗"],
  "当前版本 v{version}": ["Current version v{version}", "現在のバージョン v{version}"],
  "当前版本 v{current} · 最新版本 v{latest}": ["Current v{current} · Latest v{latest}", "現在 v{current} · 最新 v{latest}"],
  "尚未检查更新。": ["Updates have not been checked yet.", "更新はまだ確認していません。"],
  "正在检查…": ["Checking…", "確認中…"],
  "正在检查正式发布版本…": ["Checking stable releases…", "安定版を確認中…"],
  "当前没有可用更新。": ["No updates are available.", "利用可能な更新はありません。"],
  "有新版本可用。": ["A new version is available.", "新しいバージョンがあります。"],
  "暂未发布可用的正式版本。": ["No stable release is available yet.", "利用可能な安定版はまだ公開されていません。"],
  "开发模式仅检查版本，请更新源码后重新运行。": ["Development mode checks versions only. Update the source and run again.", "開発モードではバージョン確認のみ行います。ソースを更新して再実行してください。"],
  "正在校验安装包…": ["Verifying the installer…", "インストーラーを検証中…"],
  "正在停止连接并打开安装程序…": ["Stopping the connection and opening the installer…", "接続を停止し、インストーラーを開いています…"],
  "安装包已校验，可以继续安装。": ["The installer is verified and ready.", "インストーラーを検証しました。インストールを続行できます。"],
  "正在下载更新 {percent}%": ["Downloading update {percent}%", "更新をダウンロード中 {percent}%"],
  "发现新版本 v{version}": ["Update available: v{version}", "新版 v{version} があります"],
  "请先保存或撤销未保存的配置，再安装更新。": ["Save or discard unsaved configuration changes before installing.", "未保存の設定を保存または破棄してからインストールしてください。"],
  "校验后会停止连接，打开 DMG 并退出应用。请将新版拖入“应用程序”。": ["After verification, the connection stops, the DMG opens, and the app quits. Drag the new version into Applications.", "検証後に接続を停止してアプリを終了します。DMG の新版を「アプリケーション」にドラッグしてください。"],
  "校验后会停止连接并打开安装向导，随后退出应用。": ["After verification, the connection stops, the installer opens, and the app quits.", "検証後に接続を停止してアプリを終了し、インストールウィザードを開きます。"],
  "更新请求失败，请检查网络后重试。": ["The update request failed. Check your connection and retry.", "更新リクエストに失敗しました。接続を確認して再試行してください。"],
  "更新服务暂时限制请求，请稍后重试。": ["The update service is rate limited. Try again later.", "更新サービスのリクエスト制限に達しました。後でもう一度お試しください。"],
  "无法识别正式发布版本，请稍后重新检查。": ["Cannot read a stable release. Check again later.", "正式リリースを確認できません。後でもう一度確認してください。"],
  "当前系统或架构不支持此更新。": ["This system or architecture is not supported by this update.", "このシステムまたはアーキテクチャは更新に対応していません。"],
  "最新版本尚未提供当前系统的安装包，请稍后重新检查。": ["The latest release has no installer for this system yet. Check again later.", "最新リリースにはこのシステム用のインストーラーがありません。後でもう一度確認してください。"],
  "安装包校验失败或缺少校验信息，未启动安装。请重新检查或下载。": ["Installer verification failed or checksum information is missing. Installation was not started. Check again or download again.", "検証に失敗したか、チェックサムがありません。インストールは開始されていません。再確認または再ダウンロードしてください。"],
  "无法保存安装包，请检查磁盘空间和目录写入权限后重试。": ["Cannot save the installer. Check disk space and folder write permissions, then retry.", "インストーラーを保存できません。空き容量とフォルダーの書き込み権限を確認して再試行してください。"],
  "请先检查更新，再下载安装。": ["Check for updates before downloading and installing.", "先に更新を確認してからダウンロードしてください。"],
  "无法打开安装程序，请重试。": ["Cannot open the installer. Try again.", "インストーラーを開けません。再試行してください。"],
  "自动检查更新设置无效。": ["Invalid automatic update preference.", "更新の自動確認設定が無効です。"],
  "偏好设置无法保存，请重试。": ["Cannot save preferences. Try again.", "設定を保存できません。再試行してください。"],
  "AGENTS.md 与相关规则": [
    "AGENTS.md and related rules",
    "AGENTS.md と関連規約"
  ],
  "AgentKit 接入说明 ↗": [
    "AgentKit guide ↗",
    "AgentKit 接続ガイド ↗"
  ],
  "Responses API 工具配置示例": [
    "Responses API tool configuration example",
    "Responses API ツール設定例"
  ],
  "Responses API 接入说明 ↗": [
    "Responses API guide ↗",
    "Responses API 接続ガイド ↗"
  ],
  "Responses API 的 MCP 工具声明": [
    "MCP tool definition for Responses API",
    "Responses API の MCP ツール定義"
  ],
  "Runtime API Key 无效或已失效，请重新填写后连接。": [
    "The Runtime API Key is invalid or expired. Enter it again and reconnect.",
    "Runtime API Key が無効か期限切れです。再入力して接続してください。"
  ],
  "Runtime API Key 格式无效，请粘贴一行完整密钥。": [
    "Invalid Runtime API Key format. Paste the complete key on one line.",
    "Runtime API Key の形式が無効です。完全なキーを1行で貼り付けてください。"
  ],
  "Tunnel ID 应为 tunnel_ 后跟 32 位小写字母或数字。": [
    "The Tunnel ID must be tunnel_ followed by 32 lowercase letters or digits.",
    "Tunnel ID は tunnel_ に続く32文字の小文字英数字です。"
  ],
  "Tunnel ID 格式无效，应为 tunnel_ 加 32 位小写字母或数字。": [
    "Invalid Tunnel ID. Use tunnel_ followed by 32 lowercase letters or digits.",
    "Tunnel ID が無効です。tunnel_ に続く32文字の小文字英数字を入力してください。"
  ],
  "tunnel_替换为已配置的通道标识": [
    "tunnel_replace_with_your_configured_id",
    "tunnel_設定済みのIDに置換"
  ],
  "为这个工作空间建立一条安全通道。": [
    "Create a secure connection to this workspace.",
    "このワークスペースへの安全な接続を設定します。"
  ],
  "从连接到第一次调用": [
    "From connection to your first tool call",
    "接続から最初のツール呼び出しまで"
  ],
  "以下接入方式有官方支持，实际可用性取决于账号权限与客户端配置。": [
    "These clients have official support. Availability depends on account permissions and client setup.",
    "以下は公式に対応する接続方法です。利用可否はアカウント権限とクライアント設定によります。"
  ],
  "你的工作空间，由你掌控。": [
    "Your workspace. In your control.",
    "自分のワークスペースを、自分の手で。"
  ],
  "使用为这个工作空间创建的通道与运行密钥。": [
    "Use the tunnel and runtime key created for this workspace.",
    "このワークスペース用のトンネルと実行用キーを使用します。"
  ],
  "使用后台图标恢复窗口；选择「退出 ChatToHarness」才会停止受管进程。": [
    "Use the background icon to reopen the window. Quit ChatToHarness to stop managed processes.",
    "バックグラウンドアイコンで画面を開けます。管理対象プロセスは「ChatToHarness を終了」で停止します。"
  ],
  "使用提示与故障处理": [
    "Tips and troubleshooting",
    "使い方とトラブル対処"
  ],
  "使用账号所支持的 Tunnel 接入入口。确认通道所属组织与客户端账号具有访问权限。": [
    "Use your account's supported Tunnel connection flow. Check organization and client access permissions.",
    "アカウントで利用可能な Tunnel 接続機能を使い、所属組織とクライアントのアクセス権を確認してください。"
  ],
  "保存 Tunnel ID 后显示": [
    "Shown after saving a Tunnel ID",
    "Tunnel ID の保存後に表示"
  ],
  "保存工作目录设置": [
    "Save workspace settings",
    "作業フォルダー設定を保存"
  ],
  "保存并连接": [
    "Save and connect",
    "保存して接続"
  ],
  "保存并连接前，请在「工作目录」中至少选择一个目录。Runtime API Key 仅用于运行通道，不能代替客户端或 API 调用方的凭据。": [
    "Select at least one work directory before connecting. The Runtime API Key runs the tunnel; clients and API callers need their own credentials.",
    "接続前に作業フォルダーを1つ以上選んでください。Runtime API Key はトンネル実行用です。クライアントや API 呼び出し側の認証情報とは別です。"
  ],
  "停止连接": [
    "Stop connection",
    "接続を停止"
  ],
  "允许文件工具访问的目录": [
    "Directories accessible to file tools",
    "ファイルツールがアクセスできるフォルダー"
  ],
  "全选": [
    "Select all",
    "すべて選択"
  ],
  "关闭窗口后仍然运行": [
    "Keep running after closing the window",
    "ウィンドウを閉じても実行を継続"
  ],
  "关闭窗口后继续后台运行；不会随系统登录启动。": [
    "Keep running when the window closes. Starting at system login is disabled.",
    "画面を閉じてもバックグラウンドで動作します。ログイン時の自動起動は無効です。"
  ],
  "准备连接你的工作空间": [
    "Connect your workspace",
    "ワークスペースを接続しましょう"
  ],
  "剪切": [
    "Cut",
    "切り取り"
  ],
  "受管进程组件缺失，请重新安装应用。": [
    "The managed-process component is missing. Reinstall the application.",
    "プロセス管理コンポーネントがありません。アプリを再インストールしてください。"
  ],
  "后台图标无法读取。": [
    "The background icon could not be loaded.",
    "バックグラウンドアイコンを読み込めません。"
  ],
  "启动路径格式无效。": [
    "Invalid launch path.",
    "起動パスが無効です。"
  ],
  "在客户端完成接入": [
    "Finish client setup",
    "クライアントの接続を完了"
  ],
  "在支持的工作区添加自定义 MCP，选择与本应用相同的 Tunnel，再确认工具权限。": [
    "Add a custom MCP in a supported workspace, choose the same Tunnel, and confirm tool permissions.",
    "対応するワークスペースでカスタム MCP を追加し、同じ Tunnel を選んでツール権限を確認します。"
  ],
  "填写后保存": [
    "Enter details to save",
    "入力後に保存してください"
  ],
  "复制": [
    "Copy",
    "コピー"
  ],
  "安全通道": [
    "Secure tunnel",
    "安全なトンネル"
  ],
  "安全通道配置": [
    "Secure tunnel settings",
    "安全なトンネルの設定"
  ],
  "官方支持": [
    "Official support",
    "公式対応"
  ],
  "客户端": [
    "Client",
    "クライアント"
  ],
  "客户端接入时选择同一个 Tunnel。": [
    "Choose the same Tunnel in your client.",
    "クライアントでも同じ Tunnel を選んでください。"
  ],
  "客户端通过安全通道调用本机工具": [
    "Client calls local tools through a secure tunnel",
    "安全なトンネルを介してローカルツールを呼び出す"
  ],
  "对话，连接本机工具": [
    "Connect chat to local tools",
    "チャットからローカルツールへ"
  ],
  "将 AI 对话连接到本机执行环境。": [
    "Connect AI chat to your local harness.",
    "AI チャットをローカルの実行環境へ。"
  ],
  "将此声明加入请求的 tools 数组。API 调用凭据由调用方管理，不使用 Runtime API Key。": [
    "Add this definition to the request's tools array. The caller manages API credentials separately from the Runtime API Key.",
    "この定義をリクエストの tools 配列に追加します。API 認証情報は呼び出し側で管理し、Runtime API Key は使用しません。"
  ],
  "尚未选择": [
    "Not selected",
    "未選択"
  ],
  "尚未配置": [
    "Not configured",
    "未設定"
  ],
  "工作目录": [
    "Work directories",
    "作業フォルダー"
  ],
  "工作目录与工程规范设置已保存。": [
    "Work directories and project instruction settings saved.",
    "作業フォルダーとプロジェクト規約の設定を保存しました。"
  ],
  "工作空间已准备就绪": [
    "Your workspace is ready",
    "ワークスペースの準備ができました"
  ],
  "工作空间暂未连接": [
    "Your workspace is disconnected",
    "ワークスペースは未接続です"
  ],
  "工作空间概览": [
    "Workspace overview",
    "ワークスペースの概要"
  ],
  "工具引擎": [
    "Tool engine",
    "ツールエンジン"
  ],
  "工具调用前不自动提供工程规范": [
    "Project instructions are not loaded automatically",
    "プロジェクト規約の自動読み込みは無効です"
  ],
  "工程规范": [
    "Project instructions",
    "プロジェクト規約"
  ],
  "工程规范设置无效。": [
    "Invalid project instruction setting.",
    "プロジェクト規約の設定が無効です。"
  ],
  "已保存的文件夹路径格式无效。": [
    "A saved directory path is invalid.",
    "保存済みフォルダーパスの形式が無効です。"
  ],
  "已保存；输入新密钥可替换": [
    "Saved; enter a new key to replace",
    "保存済み・新しいキーで置換できます"
  ],
  "已停止": [
    "Stopped",
    "停止中"
  ],
  "已关闭": [
    "Off",
    "無効"
  ],
  "已复制通道标识。": [
    "Tunnel ID copied.",
    "Tunnel ID をコピーしました。"
  ],
  "已安全保存": [
    "Securely saved",
    "安全に保存済み"
  ],
  "已清除通道标识与密钥，工作目录设置已保留。": [
    "Tunnel ID and key cleared. Work directories were retained.",
    "Tunnel ID とキーを削除しました。作業フォルダー設定は保持しています。"
  ],
  "应用导航": [
    "Application navigation",
    "アプリのナビゲーション"
  ],
  "应用正在退出。": [
    "The application is quitting.",
    "アプリを終了しています。"
  ],
  "应用组件不完整，请重新安装应用，或使用一键启动入口准备组件。": [
    "Application components are missing. Reinstall or prepare components with the one-click launcher.",
    "アプリのコンポーネントが不足しています。再インストールするか、ワンクリック起動で準備してください。"
  ],
  "应用组件或配置无法读取。请重新安装应用，或通过一键启动入口重新准备组件。": [
    "Cannot read application components or settings. Reinstall or prepare components again with the one-click launcher.",
    "コンポーネントまたは設定を読み込めません。再インストールするか、ワンクリック起動で再準備してください。"
  ],
  "应用组件未正确载入，请退出后重新打开 ChatToHarness。": [
    "Application components did not load. Quit and reopen ChatToHarness.",
    "コンポーネントを読み込めませんでした。ChatToHarness を終了して開き直してください。"
  ],
  "应用配置无法读取。": [
    "Cannot read application settings.",
    "アプリ設定を読み込めません。"
  ],
  "建立安全通道": [
    "Establish secure tunnel",
    "安全なトンネルを確立"
  ],
  "开发者接入": [
    "Developer access",
    "開発者向け接続"
  ],
  "当前通道标识": [
    "Current Tunnel ID",
    "現在の Tunnel ID"
  ],
  "当前通道标识（供客户端配置时使用）": [
    "Current Tunnel ID (for client setup)",
    "現在の Tunnel ID（クライアント設定用）"
  ],
  "打开 ChatGPT": [
    "Open ChatGPT",
    "ChatGPT を開く"
  ],
  "打开应用时自动连接": [
    "Connect automatically when opening the app",
    "アプリを開いたときに自動接続"
  ],
  "打开窗口": [
    "Open window",
    "ウィンドウを開く"
  ],
  "执行工具": [
    "Run tools",
    "ツールを実行"
  ],
  "找不到这个 Tunnel，请检查 Tunnel ID、所属组织和工作区关联。": [
    "Tunnel not found. Check the Tunnel ID, organization, and workspace association.",
    "Tunnel が見つかりません。ID、所属組織、ワークスペースとの関連付けを確認してください。"
  ],
  "接入与帮助": [
    "Connect and help",
    "接続とヘルプ"
  ],
  "接入说明 ↗": [
    "Connection guide ↗",
    "接続ガイド ↗"
  ],
  "控制台": [
    "Console",
    "コンソール"
  ],
  "控制台页面": [
    "Console pages",
    "コンソールのページ"
  ],
  "推荐开启": [
    "Recommended",
    "推奨"
  ],
  "撤销": [
    "Undo",
    "取り消す"
  ],
  "操作工程前提供适用的 AGENTS.md 和规则索引，由客户端按任务读取相关正文。": [
    "Provide applicable AGENTS.md and a rules index before operations. The client reads relevant rules for the task.",
    "操作前に AGENTS.md と規約一覧を提供します。クライアントがタスクに関連する本文を読み込みます。"
  ],
  "操作已停止。": [
    "Operation stopped.",
    "操作を停止しました。"
  ],
  "操作未完成，请重试。": [
    "Operation did not complete. Try again.",
    "操作が完了しませんでした。再試行してください。"
  ],
  "操作未完成，请重试或查看日志。": [
    "Operation did not complete. Try again or view logs.",
    "操作が完了しませんでした。再試行するかログを確認してください。"
  ],
  "文件 · 终端 · 开发工具": [
    "Files · Terminal · Development",
    "ファイル・ターミナル・開発ツール"
  ],
  "文件、终端与开发工具": [
    "Files, terminals, and development tools",
    "ファイル、ターミナル、開発ツールは"
  ],
  "文件夹必须是已存在的绝对路径。": [
    "Directories must be existing absolute paths.",
    "既存フォルダーの絶対パスを指定してください。"
  ],
  "文件工具访问范围": [
    "File tool access",
    "ファイルツールのアクセス範囲"
  ],
  "无法保存本机配置，原配置已保留。请检查磁盘空间和文件权限。": [
    "Cannot save settings. Original settings retained. Check disk space and file permissions.",
    "設定を保存できません。元の設定は保持しています。空き容量とファイル権限を確認してください。"
  ],
  "无法加密 API Key，原配置已保留。请检查系统安全存储授权。": [
    "Cannot encrypt the API Key. Original settings retained. Check system secure-storage authorization.",
    "API Key を暗号化できません。元の設定は保持しています。安全なストレージへのシステム認可を確認してください。"
  ],
  "无法解密已保存的 Runtime API Key，请重新输入密钥。": [
    "Cannot decrypt the saved Runtime API Key. Enter the key again.",
    "保存済み Runtime API Key を復号できません。再入力してください。"
  ],
  "无法访问本机配置目录，请检查文件权限。": [
    "Cannot access the settings directory. Check file permissions.",
    "設定フォルダーにアクセスできません。ファイル権限を確認してください。"
  ],
  "日志文件夹暂时无法打开。": [
    "Cannot open the log directory right now.",
    "ログフォルダーを開けません。"
  ],
  "显示全部": [
    "Show all",
    "すべて表示"
  ],
  "显示密钥": [
    "Show key",
    "キーを表示"
  ],
  "更换或清除凭据": [
    "Replace or clear credentials",
    "認証情報の変更・削除"
  ],
  "替换密钥时直接输入新值。清除后会停止连接，工作目录与规则设置仍然保留。": [
    "Enter a new key to replace it. Clearing credentials stops the connection but retains directory and rule settings.",
    "新しいキーを入力すると置き換えます。削除すると接続は停止しますが、フォルダーと規約設定は保持します。"
  ],
  "有文件夹不存在或无法读取，请重新选择。": [
    "A directory is missing or unreadable. Select it again.",
    "存在しないか読み込めないフォルダーがあります。選び直してください。"
  ],
  "有未保存的更改": [
    "Unsaved changes",
    "未保存の変更があります"
  ],
  "服务配置页面": [
    "Service settings",
    "サービス設定"
  ],
  "未读取": [
    "Unavailable",
    "未取得"
  ],
  "本地工具检查失败，请确认项目目录可访问，再点击“检查连接”。": [
    "Local tool check failed. Check project access, then check local tools again.",
    "ローカルツールの確認に失敗しました。工程フォルダーへのアクセスを確認し、再確認してください。"
  ],
  "本机工具": [
    "Local tools",
    "ローカルツール"
  ],
  "本机工具检查": [
    "Check local tools",
    "ローカルツールを確認"
  ],
  "本机工具检查通过。": [
    "Local tools passed the check.",
    "ローカルツールの確認に成功しました。"
  ],
  "本机工具配置无法读取，请打开日志目录，检查工具配置文件。": [
    "Cannot read tool settings. Open logs and check the tool configuration.",
    "ツール設定を読み込めません。ログを開いて設定ファイルを確認してください。"
  ],
  "本机已准备好接收请求，下一步在客户端完成接入。": [
    "Local tools are ready. Finish setup in your client.",
    "リクエストを受け付ける準備ができました。クライアントの接続を完了してください。"
  ],
  "本机运行": [
    "Running locally",
    "ローカルで実行中"
  ],
  "本机配置文件无法读取或格式无效。原文件已保留，请查看帮助后修复。": [
    "Settings are unreadable or invalid. The original file is retained. See help to repair it.",
    "設定ファイルを読み込めないか形式が無効です。元のファイルは保持しています。ヘルプを確認してください。"
  ],
  "本机配置目录必须是普通文件夹，不能是符号链接。": [
    "The settings directory must be a regular folder, not a symbolic link.",
    "設定フォルダーにはシンボリックリンクではなく通常のフォルダーを指定してください。"
  ],
  "本机配置目录无效。": [
    "Invalid settings directory.",
    "設定フォルダーが無効です。"
  ],
  "查看 Codex 指引": [
    "Codex guide",
    "Codex ガイド"
  ],
  "查看指引": [
    "View guide",
    "ガイドを見る"
  ],
  "查看日志": [
    "View logs",
    "ログを表示"
  ],
  "检查中": [
    "Checking",
    "確認中"
  ],
  "检查中…": [
    "Checking…",
    "確認中…"
  ],
  "检查本机工具": [
    "Check local tools",
    "ローカルツールを確認"
  ],
  "检查网络、通道所属组织及密钥权限。网络故障会自动重试，凭据错误需要修正后重新连接。": [
    "Check your network, tunnel organization, and key permissions. Network failures retry automatically; fix credential errors before reconnecting.",
    "ネットワーク、トンネルの組織、キー権限を確認してください。通信障害は自動再試行し、認証エラーは修正後に再接続します。"
  ],
  "概览": [
    "Overview",
    "概要"
  ],
  "正在建立安全连接": [
    "Establishing a secure connection",
    "安全な接続を確立しています"
  ],
  "正在建立安全通道…": [
    "Establishing secure tunnel…",
    "安全なトンネルを確立中…"
  ],
  "正在建立安全通道，请稍候。": [
    "Establishing a secure tunnel. Please wait.",
    "安全なトンネルを確立しています。しばらくお待ちください。"
  ],
  "正在恢复安全连接": [
    "Restoring the secure connection",
    "安全な接続を復旧しています"
  ],
  "正在恢复连接…": [
    "Restoring connection…",
    "接続を復旧中…"
  ],
  "正在检查": [
    "Checking",
    "確認中"
  ],
  "正在检查本机工具…": [
    "Checking local tools…",
    "ローカルツールを確認中…"
  ],
  "正在检查本机执行环境": [
    "Checking the local environment",
    "ローカル実行環境を確認しています"
  ],
  "正在确认本机工具是否可用。": [
    "Checking whether local tools are available.",
    "ローカルツールが利用できるか確認しています。"
  ],
  "正在读取组件版本…": [
    "Reading component versions…",
    "コンポーネントのバージョンを取得中…"
  ],
  "正在载入": [
    "Loading",
    "読み込み中"
  ],
  "正在连接": [
    "Connecting",
    "接続中"
  ],
  "正在连接…": [
    "Connecting…",
    "接続中…"
  ],
  "正在重连": [
    "Reconnecting",
    "再接続中"
  ],
  "此密钥没有通道使用权限，请在服务配置页面检查所属组织及 Tunnels Read + Use 权限。": [
    "This key cannot use the tunnel. Check its organization and Tunnels Read + Use permissions in service settings.",
    "このキーにはトンネルの利用権限がありません。サービス設定で所属組織と Tunnels Read + Use 権限を確認してください。"
  ],
  "每一步都有清晰的状态。": [
    "See the status of every step.",
    "各ステップの状態を確認できます。"
  ],
  "添加目录": [
    "Add directory",
    "フォルダーを追加"
  ],
  "清除凭据": [
    "Clear credentials",
    "認証情報を削除"
  ],
  "状态未知": [
    "Unknown status",
    "不明な状態"
  ],
  "由你掌控的执行环境": [
    "Your tools. Your control.",
    "実行環境を自分の手で管理"
  ],
  "由系统加密保存，界面不会回显已保存的密钥。": [
    "Encrypted by the system. Saved keys are never displayed.",
    "システムで暗号化して保存します。保存済みのキーは再表示しません。"
  ],
  "目录设置约束文件工具。终端按当前用户权限执行，目录设置不构成终端沙箱。": [
    "Directory settings restrict file tools. The terminal runs with your user permissions and is not sandboxed by these settings.",
    "フォルダー設定はファイルツールを制限します。ターミナルは現在のユーザー権限で実行され、この設定による隔離はありません。"
  ],
  "等待检查": [
    "Awaiting check",
    "確認待ち"
  ],
  "等待系统凭据授权": [
    "Waiting for credential authorization",
    "認証情報へのアクセス許可を待機中"
  ],
  "等待系统授权": [
    "Awaiting authorization",
    "システム認可待ち"
  ],
  "等待连接": [
    "Awaiting connection",
    "接続待ち"
  ],
  "管理访问目录": [
    "Manage directories",
    "フォルダーを管理"
  ],
  "粘贴": [
    "Paste",
    "貼り付け"
  ],
  "系统安全存储当前不可用，无法保存或读取密钥。请完成系统授权后重试。": [
    "System secure storage is unavailable. Authorize access in the system dialog, then try again.",
    "システムの安全なストレージを利用できません。システム画面で認可してから再試行してください。"
  ],
  "编辑": [
    "Edit",
    "編集"
  ],
  "自动加载": [
    "Automatic",
    "自動読み込み"
  ],
  "自动加载工程规范": [
    "Load project instructions automatically",
    "プロジェクト規約を自動で読み込む"
  ],
  "自动连接设置无效。": [
    "Invalid auto-connect setting.",
    "自動接続の設定が無効です。"
  ],
  "规则按工程、目标目录与内容版本绑定。自动交付由应用保障，理解和遵循规范由客户端模型完成。": [
    "Rules are bound to the project, scope, and content version. The app delivers them; the client model interprets and follows them.",
    "規約は工程、対象フォルダー、内容の版に紐付きます。アプリが提供し、クライアントモデルが理解して従います。"
  ],
  "让耗时命令在后台运行，再分次读取输出。重连不会自动重放工具操作。": [
    "Run long commands in the background and read output in stages. Reconnecting never replays tool operations.",
    "時間のかかるコマンドはバックグラウンドで実行し、出力を分けて読み取ってください。再接続で操作を再実行することはありません。"
  ],
  "设置已保存": [
    "Settings saved",
    "設定を保存しました"
  ],
  "识别工程": [
    "Identify project",
    "工程を特定"
  ],
  "请先保存工作目录设置，再检查本机工具。": [
    "Save work directory settings before checking local tools.",
    "作業フォルダー設定を保存してからツールを確認してください。"
  ],
  "请先在“工作目录”中选择至少一个可访问的本机文件夹。": [
    "Select at least one accessible folder in Work directories first.",
    "先に作業フォルダーでアクセス可能なフォルダーを1つ以上選んでください。"
  ],
  "请先填写 Tunnel ID。": [
    "Enter a Tunnel ID first.",
    "先に Tunnel ID を入力してください。"
  ],
  "请先添加目录": [
    "Add a directory first",
    "先にフォルダーを追加"
  ],
  "请在客户端选择同一通道并验证工具调用。": [
    "Select the same tunnel in your client and verify a tool call.",
    "クライアントで同じトンネルを選び、ツール呼び出しを確認してください。"
  ],
  "请在系统窗口授权访问已保存的凭据。": [
    "Allow access to saved credentials in the system dialog.",
    "システム画面で保存済み認証情報へのアクセスを許可してください。"
  ],
  "请填写 Runtime API Key。": [
    "Enter a Runtime API Key.",
    "Runtime API Key を入力してください。"
  ],
  "请复制已选中的通道标识。": [
    "Copy the selected Tunnel ID.",
    "選択された Tunnel ID をコピーしてください。"
  ],
  "请求来源无效。": [
    "Invalid request source.",
    "リクエスト元が無効です。"
  ],
  "请至少添加一个工作目录。": [
    "Add at least one work directory.",
    "作業フォルダーを1つ以上追加してください。"
  ],
  "请至少选择一个有效的本机文件夹。": [
    "Select at least one valid local folder.",
    "有効なローカルフォルダーを1つ以上選んでください。"
  ],
  "请重新安装应用，或使用一键启动入口检查组件准备结果。": [
    "Reinstall the app or check component setup with the one-click launcher.",
    "アプリを再インストールするか、ワンクリック起動で準備状態を確認してください。"
  ],
  "读取适用规范": [
    "Read instructions",
    "適用規約を読み込む"
  ],
  "输入 Runtime API Key": [
    "Enter Runtime API Key",
    "Runtime API Key を入力"
  ],
  "运行在你的电脑上。": [
    "Run on your computer.",
    "あなたのコンピューターで実行されます。"
  ],
  "还没有工作目录。添加工程或文件夹，开启本机协作。": [
    "No work directories yet. Add a project or folder to get started.",
    "作業フォルダーがありません。工程またはフォルダーを追加してください。"
  ],
  "连接": [
    "Connect",
    "接続"
  ],
  "连接中": [
    "Connecting",
    "接続中"
  ],
  "连接中断，正在自动尝试恢复。": [
    "Connection interrupted. Retrying automatically.",
    "接続が切断されました。自動で復旧を試みています。"
  ],
  "连接你的客户端": [
    "Connect your client",
    "クライアントを接続"
  ],
  "连接客户端，开始第一次本机工具调用。": [
    "Connect a client and make your first local tool call.",
    "クライアントを接続し、ローカルツールを呼び出しましょう。"
  ],
  "连接已停止。": [
    "Connection stopped.",
    "接続を停止しました。"
  ],
  "连接已停止，可以随时重新连接。": [
    "Connection stopped. You can reconnect at any time.",
    "接続は停止中です。いつでも再接続できます。"
  ],
  "连接异常": [
    "Connection issue",
    "接続エラー"
  ],
  "连接时自动检查": [
    "Checked automatically on connection",
    "接続時に自動で確認"
  ],
  "连接暂时中断，正在自动重连。请检查网络或代理设置。": [
    "Connection interrupted. Retrying automatically. Check network or proxy settings.",
    "接続が切断されました。自動再接続中です。ネットワークやプロキシ設定を確認してください。"
  ],
  "连接组件意外退出，正在重新连接。": [
    "The connection component exited unexpectedly. Reconnecting.",
    "接続コンポーネントが予期せず終了しました。再接続しています。"
  ],
  "连接通道": [
    "Connect tunnel",
    "トンネルに接続"
  ],
  "连接配置": [
    "Connection settings",
    "接続設定"
  ],
  "连接需要你的关注": [
    "Your connection needs attention",
    "接続状態の確認が必要です"
  ],
  "连接需要处理": [
    "Connection needs attention",
    "接続の確認が必要です"
  ],
  "连接需要处理，请查看上方提示。": [
    "Connection needs attention. See the message above.",
    "接続状態の確認が必要です。上のメッセージを確認してください。"
  ],
  "选择你希望客户端协作的工程或文件夹。": [
    "Choose projects or folders for your client to work with.",
    "クライアントと連携する工程やフォルダーを選んでください。"
  ],
  "选择允许文件工具访问的目录": [
    "Choose directories for file tool access",
    "ファイルツールがアクセスするフォルダーを選択"
  ],
  "选择协作范围，自动交付工程规范。": [
    "Choose the scope and deliver project instructions automatically.",
    "作業範囲を選び、プロジェクト規約を自動で提供します。"
  ],
  "选择同一通道，再发起一次工具调用。": [
    "Choose the same tunnel, then make a tool call.",
    "同じトンネルを選び、ツールを呼び出してください。"
  ],
  "选择工作目录，保存连接配置，即可开始。": [
    "Choose work directories and save connection settings to begin.",
    "作業フォルダーを選び、接続設定を保存して始めましょう。"
  ],
  "通过官方支持的产品入口使用 Tunnel。运行通道的密钥与调用 API 的凭据分别管理。": [
    "Use Tunnel through an officially supported product. Runtime and API caller credentials are managed separately.",
    "公式対応の製品から Tunnel を利用します。トンネル実行用と API 呼び出し用の認証情報は別々に管理します。"
  ],
  "通道就绪": [
    "Tunnel ready",
    "トンネル準備完了"
  ],
  "通道就绪表示本机可以接收请求。客户端权限与实际调用结果，需要在对应客户端确认。": [
    "Tunnel ready means local tools can receive requests. Verify client permissions and actual calls in the client.",
    "トンネル準備完了はローカル側が受付可能な状態です。権限と実際の呼び出しはクライアントで確認してください。"
  ],
  "通道已就绪": [
    "Tunnel is ready",
    "トンネルの準備ができました"
  ],
  "通道运行组件": [
    "Tunnel runtime",
    "トンネル実行コンポーネント"
  ],
  "遇到问题时，从本机工具与通道状态开始检查。": [
    "Start troubleshooting with local tools and tunnel status.",
    "問題があるときは、ローカルツールとトンネル状態を確認してください。"
  ],
  "配置内容无效，请重新填写。": [
    "Invalid settings. Enter them again.",
    "設定内容が無効です。入力し直してください。"
  ],
  "配置已保存": [
    "Configuration saved",
    "接続設定を保存しました"
  ],
  "配置文件不是独立的普通文件，请检查本机配置目录。": [
    "The settings file is not an independent regular file. Check the settings directory.",
    "設定ファイルが独立した通常のファイルではありません。設定フォルダーを確認してください。"
  ],
  "重做": [
    "Redo",
    "やり直す"
  ],
  "重新连接": [
    "Reconnect",
    "再接続"
  ],
  "重连中": [
    "Reconnecting",
    "再接続中"
  ],
  "链接无效。": [
    "Invalid link.",
    "リンクが無効です。"
  ],
  "长时间任务": [
    "Long-running tasks",
    "時間のかかるタスク"
  ],
  "隐藏其他应用": [
    "Hide others",
    "ほかを隠す"
  ],
  "隐藏密钥": [
    "Hide key",
    "キーを隠す"
  ],
  "需要处理": [
    "Needs attention",
    "確認が必要"
  ],
  "{count} 项可用": [
    "Available: {count}",
    "{count} 項目が利用可能"
  ],
  "{count} 个目录": [
    "Folders: {count}",
    "{count} 個のフォルダー"
  ],
  "已就绪": [
    "Ready",
    "準備完了"
  ],
  "已就绪 · {count} 项工具": [
    "Ready · {count} tools",
    "準備完了・{count} ツール"
  ],
  "移除目录 {directory}": [
    "Remove directory {directory}",
    "フォルダー {directory} を削除"
  ],
  "退出 {product}": [
    "Quit {product}",
    "{product} を終了"
  ],
  "关于 {product}": [
    "About {product}",
    "{product} について"
  ],
  "隐藏 {product}": [
    "Hide {product}",
    "{product} を隠す"
  ],
  "{product} 无法启动": [
    "{product} could not start",
    "{product} を起動できません"
  ],
  "语言": [
    "Language",
    "言語"
  ],
  "界面语言": [
    "Interface language",
    "表示言語"
  ],
  "语言设置无法保存，请重试。": [
    "Cannot save language preference. Try again.",
    "言語設定を保存できません。再試行してください。"
  ],
  "语言设置无效。": [
    "Invalid language preference.",
    "言語設定が無効です。"
  ],
  '类型：': ['Type:', '種類：'],
  '服务器地址：': ['Server address:', 'サーバーアドレス：'],
  '端口：': ['Port:', 'ポート：'],
  '用户名（选填）：': ['Username (optional):', 'ユーザー名（任意）：'],
  '密码：': ['Password:', 'パスワード：'],
  '隐藏密码': ['Hide password', 'パスワードを隠す'],
  "尚未配对": ["Not paired", "未ペアリング"],
  "正在自动重连": ["Reconnecting automatically", "自動再接続中"],
  "连接失败": ["Connection failed", "接続に失敗しました"],
  "已连接：": ["Connected:", "接続済み："],
  "等待配对": ["Waiting for pairing", "ペアリング待機中"],
  "正在验证一次性配对码…": ["Verifying one-time pairing code…", "ワンタイムペアリングコードを検証中…"],
  "配对失败：": ["Pairing failed:", "ペアリング失敗："],
  "请先填写统一 MCP 地址": ["Enter the unified MCP service URL first", "統合 MCP サービス URL を先に入力してください"],
  "MCP 地址无效，请填写完整的 https://…/mcp 地址": ["Invalid MCP URL; enter the full https://…/mcp address", "MCP URL が無効です。完全な https://…/mcp アドレスを入力してください"],
  "配对码格式不正确，请使用 43 位一次性配对码": ["Invalid pairing code; enter the 43-character one-time code", "ペアリングコードが無効です。43 文字のワンタイムコードを入力してください"],
  "请核对服务地址和配对码": ["Check the service URL and pairing code", "サービス URL とペアリングコードを確認してください"],
  "多设备连接 · 一次配对": ["Multi-device connection · Pair once", "複数デバイス接続・一度だけペアリング"],
  "配对当前设备": ["Pair this device", "このデバイスをペアリング"],
  "统一 MCP 地址": ["Shared MCP URL", "共通 MCP URL"],
  "一次性配对码（5 分钟有效）": ["One-time pairing code (valid for 5 minutes)", "ワンタイムペアリングコード（有効期間5分）"],
  "只需配对一次，重启后自动连接。原有 Tunnel 配置不受影响。": ["Pair once to reconnect automatically after restart. Existing Tunnel settings are unchanged.", "一度ペアリングすれば、再起動後も自動接続します。既存の Tunnel 設定は変更されません。"],
  "在 ChatGPT 的统一 ChatToHarness 插件中调用 create_pairing_code，复制返回的配对码到这里。": ["Call create_pairing_code in the shared ChatToHarness connector in ChatGPT, then paste the code here.", "ChatGPT の共通 ChatToHarness コネクタで create_pairing_code を呼び出し、返されたコードをここに貼り付けてください。"],
  "从 ChatGPT 复制配对码": ["Paste the pairing code from ChatGPT", "ChatGPT のペアリングコードを貼り付け"],
  "初始化云端服务": ["Initialize cloud service", "クラウドサービスを初期化"],
  "不需要终端、Node.js、Wrangler 或 Computer Use；首次授权 Cloudflare 后自动部署。": ["No terminal, Node.js, Wrangler, or Computer Use required. Authorize Cloudflare once to deploy automatically.", "ターミナル、Node.js、Wrangler、Computer Use は不要です。Cloudflare を一度認証すると自動デプロイします。"],
  "Cloudflare workers.dev 子域名": ["Cloudflare workers.dev subdomain", "Cloudflare workers.dev サブドメイン"],
  "例如：watermoon3322": ["For example: watermoon3322", "例：watermoon3322"],
  "已有 OAuth KV ID（可选）": ["Existing OAuth KV ID (optional)", "既存の OAuth KV ID（任意）"],
  "留空则自动创建或查找": ["Leave blank to detect or create automatically", "空欄の場合は自動検出または作成"],
  "复制我的授权密钥": ["Copy my authorization key", "認証キーをコピー"],
  "尚未初始化": ["Not initialized", "未初期化"],
  "首次使用时 Cloudflare 可能打开浏览器请求账户授权；授权密钥只保存在系统加密存储，绝不提交到仓库。": ["Cloudflare may open your browser to authorize your account. Your owner key stays OS-encrypted and is never committed to the repository.", "初回は Cloudflare の認証画面が開くことがあります。所有者キーは OS で暗号化され、リポジトリには保存されません。"],
  "验证 Cloudflare 账户": ["Checking Cloudflare account", "Cloudflare アカウントを確認中"],
  "请在浏览器批准 Cloudflare 授权": ["Approve Cloudflare authorization in your browser", "ブラウザーで Cloudflare 認証を承認してください"],
  "准备部署配置": ["Preparing deployment settings", "デプロイ設定を準備中"],
  "准备 KV 存储": ["Preparing KV storage", "KV ストレージを準備中"],
  "部署授权服务": ["Deploying OAuth server", "OAuth サーバーをデプロイ中"],
  "安全设置所有者密钥": ["Storing owner key securely", "所有者キーを安全に保存中"],
  "部署 MCP 服务": ["Deploying MCP service", "MCP サービスをデプロイ中"],
  "验证服务": ["Verifying services", "サービスを確認中"],
  "云端服务已就绪": ["Cloud service ready", "クラウドサービスの準備完了"],
  "云端初始化失败": ["Cloud initialization failed", "クラウドの初期化に失敗しました"],
  "云端操作未完成": ["Cloud operation incomplete", "クラウド操作が完了しませんでした"],
  "Owner Key 轮换未完成": ["Owner Key rotation incomplete", "Owner Key のローテーションが完了しませんでした"],
  "云端重置未完成": ["Cloud reset incomplete", "クラウドのリセットが完了しませんでした"],
  "\u91cd\u7f6e\u672a\u5b8c\u6210\uff0c\u53ef\u91cd\u8bd5\u3002": ["The reset is incomplete. Please retry.", "\u30ea\u30bb\u30c3\u30c8\u304c\u5b8c\u4e86\u3057\u3066\u3044\u307e\u305b\u3093\u3002\u3082\u3046\u4e00\u5ea6\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002"],
  "\u6b63\u5728\u81ea\u52a8\u68c0\u67e5\u4e91\u7aef\u670d\u52a1\u2026": ["Checking cloud services automatically…", "\u30af\u30e9\u30a6\u30c9\u30b5\u30fc\u30d3\u30b9\u3092\u81ea\u52d5\u78ba\u8a8d\u4e2d\u2026"],
  "重置未完成，可重试。": ["Reset incomplete. You can retry.", "リセットが完了しませんでした。再試行できます。"],
  "知道了": ["Got it", "了解"],
  "未能完成 Cloudflare 登录。请在浏览器中登录 Cloudflare 并批准授权，然后重新点击“自动初始化云端”重试。": ["Cloudflare sign-in did not complete. Sign in to Cloudflare and approve authorization in your browser, then click “Initialize cloud automatically” again.", "Cloudflare へのログインが完了しませんでした。ブラウザーで Cloudflare にログインして認証を承認し、「クラウドを自動初期化」をもう一度クリックしてください。"],
  "无法启动本机的云端部署工具。请重启 ChatToHarness 后重试；如果问题仍然存在，请重新安装最新版。": ["The local cloud deployment tool could not start. Restart ChatToHarness and try again; if the problem persists, reinstall the latest version.", "ローカルのクラウドデプロイツールを起動できませんでした。ChatToHarness を再起動して再試行し、解決しない場合は最新版を再インストールしてください。"],
  "程序包缺少 Windows Cloudflare 授权所需的 Keyring 原生组件，尚未进入浏览器授权流程。这是应用打包错误，请使用修复后的版本。": ["The app package is missing the Windows native Keyring component needed for Cloudflare authorization, so browser authorization has not started. This is a packaging error; use a fixed build.", "アプリに Cloudflare 認証用の Windows Keyring ネイティブコンポーネントが含まれていないため、ブラウザー認証は開始されていません。パッケージの不具合です。修正版を使用してください。"],
  "本机云端部署工具响应超时。请检查网络连接后重试；如果问题持续，请重启 ChatToHarness。": ["The local cloud deployment tool timed out. Check the network connection and retry; if the problem persists, restart ChatToHarness.", "ローカルのクラウドデプロイツールがタイムアウトしました。ネットワーク接続を確認して再試行し、解決しない場合は ChatToHarness を再起動してください。"],
  "Cloudflare 资源部署失败。请确认当前账户具有 Workers 部署权限，并检查网络连接后重试。": ["Cloudflare resource deployment failed. Confirm that the current account can deploy Workers, check the network connection, and try again.", "Cloudflare リソースのデプロイに失敗しました。現在のアカウントに Workers のデプロイ権限があることとネットワーク接続を確認して再試行してください。"],
  "无法保存 Cloudflare Worker 密钥。请确认当前账户具有 Worker 密钥管理权限后重试。": ["Could not save the Cloudflare Worker secret. Confirm that the current account can manage Worker secrets and try again.", "Cloudflare Worker のシークレットを保存できませんでした。現在のアカウントにシークレット管理権限があることを確認して再試行してください。"],
  "无法创建 Workers 子域名。请检查 Cloudflare 账户权限和子域名设置后重试。": ["Could not create the Workers subdomain. Check Cloudflare account permissions and subdomain settings, then try again.", "Workers サブドメインを作成できませんでした。Cloudflare アカウントの権限とサブドメイン設定を確認して再試行してください。"],
  "尚无法确认 Workers 子域名已创建。请刷新云端配置后再试，不要重复创建其他资源。": ["Could not verify that the Workers subdomain was created. Refresh cloud configuration before retrying; do not create duplicate resources.", "Workers サブドメインが作成されたことを確認できませんでした。重複リソースを作らず、クラウド設定を更新してから再試行してください。"],
  "所选 Workers 子域名已被占用。请换一个子域名后重试。": ["The selected Workers subdomain is already in use. Choose another subdomain and try again.", "選択した Workers サブドメインは既に使用されています。別のサブドメインを選択して再試行してください。"],
  "未找到可用的 Cloudflare 账户。请确认浏览器登录的是正确账户，并检查账户权限。": ["No available Cloudflare account was found. Confirm that the browser is signed in to the correct account and check its permissions.", "利用可能な Cloudflare アカウントが見つかりません。ブラウザーで正しいアカウントにログインしていることと権限を確認してください。"],
  "无法访问 Cloudflare API。请检查网络连接和账户权限后重试。": ["Could not reach the Cloudflare API. Check the network connection and account permissions, then try again.", "Cloudflare API に接続できませんでした。ネットワーク接続とアカウント権限を確認して再試行してください。"],
  "服务已尝试部署，但未能通过远端健康检查。请刷新云端配置，并检查 Cloudflare Workers 状态。": ["Deployment was attempted, but the remote health check failed. Refresh cloud configuration and check the Cloudflare Workers status.", "デプロイを試みましたが、リモートのヘルスチェックに失敗しました。クラウド設定を更新し、Cloudflare Workers の状態を確認してください。"],
  "无法确认云端服务当前状态。请检查网络连接后刷新云端配置；不要直接重置或覆盖现有服务。": ["The current cloud service state could not be verified. Check the network and refresh cloud configuration; do not reset or overwrite existing services.", "現在のクラウドサービスの状態を確認できませんでした。ネットワークを確認して設定を更新してください。既存サービスをリセットまたは上書きしないでください。"],
  "云端操作未能完成。请检查 Cloudflare 登录状态、账户权限和网络连接后重试。": ["The cloud operation could not be completed. Check Cloudflare sign-in, account permissions, and the network connection, then try again.", "クラウド操作を完了できませんでした。Cloudflare のログイン状態、アカウント権限、ネットワーク接続を確認して再試行してください。"],
  "授权密钥已复制；请在 ChatGPT 授权页面粘贴": ["Owner key copied. Paste it into the ChatGPT authorization page.", "所有者キーをコピーしました。ChatGPT の認証ページに貼り付けてください。"],
  "复制密钥失败": ["Could not copy the key", "キーのコピーに失敗しました"],
  "自动发现 Cloudflare 账户、Workers 子域名和已有 OAuth KV；可从列表选择，唯一匹配时自动选中。": ["Automatically discover Cloudflare accounts, Workers subdomains, and existing OAuth KV; choose from the list. Unique matches are preselected.", "Cloudflare アカウント、Workers サブドメイン、OAuth KV を自動検出し一覧から選択できます。一意の候補は自動選択されます。"],
  "刷新云端配置": ["Refresh cloud configuration", "クラウド設定を更新"],
  "配置已识别": ["Configuration detected", "設定を検出しました"],
  "创建新的 OAuth KV": ["Create a new OAuth KV", "新しい OAuth KV を作成"],
  "自动识别失败": ["Automatic discovery failed", "自動検出に失敗しました"],
  "已配对设备": ["Paired devices", "ペアリング済みデバイス"],
  "展示已配对的电脑；离线设备也会保留。仅已配对设备可查看列表。": ["All paired computers remain listed, including offline devices. Only paired devices can view this list.", "オフラインを含むペアリング済みのコンピューターを表示します。ペアリング済みデバイスのみ閲覧できます。"],
  "刷新设备列表": ["Refresh device list", "デバイス一覧を更新"],
  "选择设备": ["Select device", "デバイスを選択"],
  "未识别": ["Not identified", "未識別"],
  "多实例远端服务": ["Multi-instance cloud service", "マルチインスタンス・クラウドサービス"],
  "正在检测云端服务": ["Checking cloud services", "クラウドサービスを確認中"],
  "需要授权 Cloudflare 才能检测": ["Authorize Cloudflare to check deployment", "デプロイ確認には Cloudflare 認証が必要です"],
  "云端状态无法验证": ["Cloud status cannot be verified", "クラウドの状態を確認できません"],
  "云端已部署，但本机尚未关联": ["Cloud deployed but not linked to this device", "クラウドはデプロイ済みですが、この端末と未連携です"],
  "云端已部署，本机密钥尚待验证": ["Cloud deployed; this device's owner key is unverified", "クラウドはデプロイ済みですが、この端末の所有者キーは未確認です"],
  "授权并初始化云端服务": ["Authorize and initialize cloud service", "認証してクラウドサービスを初期化"],
  "确认尚未初始化": ["Confirmed not initialized", "未初期化であることを確認しました"],
  "已确认云端服务未部署": ["Confirmed no cloud service deployment", "クラウドサービスが未デプロイであることを確認しました"],
  "云端连接异常，初始化状态未知": ["Cloud connection failed; initialization status unknown", "クラウド接続に失敗したため初期化状態は不明です"],
  "云端服务已初始化": ["Cloud service initialized", "クラウドサービスは初期化済みです"],
  "云端已部署（需关联）": ["Cloud deployed (link device)", "クラウドはデプロイ済み（端末連携が必要）"],
  "修复云端服务": ["Repair cloud service", "クラウドサービスを修復"],
  "授权并检查云端服务": ["Authorize and check cloud service", "クラウドを認証して確認"],
  "云端尚未检测": ["Cloud service not checked", "クラウドサービス未確認"],
  "检测到云端服务已部署": ["Cloud service deployed", "クラウドサービスはデプロイ済み"],
  "尚未部署云端服务": ["Cloud service not deployed", "クラウドサービス未デプロイ"],
  "云端服务部署不完整": ["Cloud deployment incomplete", "クラウドのデプロイは未完了"],
  "暂时无法检测云端服务": ["Cannot check cloud service right now", "クラウドサービスを確認できません"],
  "云端服务不可用": ["Cloud service unavailable", "クラウドサービスが利用できません"],
  "本机尚未保存所有者密钥，不能直接覆盖云端服务": ["Owner key not saved on this device; existing cloud deployment cannot be overwritten", "このデバイスに所有者キーがありません。既存のクラウド環境は上書きできません"],
  "尚未配对设备": ["No paired devices yet", "ペアリング済みデバイスはありません"],
  "配对后可查看设备清单。": ["Pair a device to see the roster.", "ペアリング後にデバイス一覧を表示します。"],
  "尚未同步设备清单": ["No device roster synchronized yet", "デバイス一覧は未同期です"],
  "当前设备": ["This device", "このデバイス"],
  "当前设备：尚未识别": ["Current device: not identified", "現在のデバイス：未識別"],
  "在线": ["Online", "オンライン"],
  "离线": ["Offline", "オフライン"],
  "设备清单暂时无法更新（显示上次结果）": ["Could not refresh devices (showing last known data)", "デバイス一覧を更新できません（前回の結果を表示）"],
  "设备清单更新时间：": ["Device roster updated: ", "デバイス一覧の更新時刻："],
  "点击初始化后自动识别 Cloudflare 账户、workers.dev 子域名及已有的 OAuth KV，无需复制 ID。": ["Automatically discover your Cloudflare account, workers.dev subdomain and existing OAuth KV. No IDs to copy.", "Cloudflare アカウント、workers.dev サブドメイン、既存の OAuth KV を自動検出します。ID のコピーは不要です。"],
  "选择 Cloudflare 账户": ["Select Cloudflare account", "Cloudflare アカウントを選択"],
  "选择 OAuth KV": ["Select OAuth KV", "OAuth KV を選択"],
  "请选择": ["Please select", "選択してください"],
  "自动识别账户和 KV": ["Discovering Cloudflare account and KV", "Cloudflare アカウントと KV を検出中"],
  "请选择 Cloudflare 账户": ["Select a Cloudflare account", "Cloudflare アカウントを選択してください"],
  "请选择 OAuth KV": ["Select an OAuth KV", "OAuth KV を選択してください"],
  "检测到子域名：": ["Detected subdomain: ", "検出されたサブドメイン："],
};
  if (typeof module === 'object' && module.exports) module.exports = messages;
  else root.CTHMessages = Object.freeze(messages);
})(typeof window === 'object' ? window : this);
