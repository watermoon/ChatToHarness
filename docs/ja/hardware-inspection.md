# USB・PnP・シリアルデバイスを読み取り専用で確認する

[English](../en/hardware-inspection.md) | [简体中文](../zh-CN/hardware-inspection.md) | [日本語](../ja/hardware-inspection.md)

> ChatToHarness 0.8.1 対象。

## 目的

読み取り専用のインベントリーツールで、接続中の USB デバイス、PnP デバイス、COM ポートとの対応を確認します。

## 始める前に

- これらのツールは Windows 専用です。他の OS では未対応エラーを返します。
- 固定された Windows のハードウェア情報クエリを使用し、管理者権限への昇格を要求しません。
- UnifyHarness 経由で使う場合は、最初に `list_devices` を呼び出して対象デバイスを明示的に選び、その `device_id` で `list_device_tools` を呼び出します。ツールの実行には返された `catalog_version` を指定して `call_device_tool` を使います。現在の PC を推測したり、別のデバイスへ自動的に切り替えたりしないでください。
- これらのツールが取得するのはデバイスのメタデータだけです。COM ポートを開いたり、読み書きしたりしません。

## 操作手順

1. `list_usb_devices` で現在の USB デバイスを列挙します。任意の `limit` は 1～200（既定値 100）です。
2. `list_pnp_devices` で USB、Ports、HID 関連デバイスを確認します。任意の `limit` は 1～200（既定値 100）です。
3. `list_serial_ports` で COM ポートと PnP ID の対応を確認します。任意の `limit` は 1～128（既定値 64）です。
4. 結果の正確な `instance_id` をコピーし、`get_pnp_device_details` に渡して、許可された識別情報、親デバイス、サービス、ドライバー、場所の情報を取得します。
5. デバイス名、Vendor ID（VID）、Product ID（PID）、PnP instance ID、COM ポート名を照合します。汎用 USB シリアルブリッジの名前だけでは開発ボードを特定できません。ハードウェア ID と詳細情報を根拠にしてください。

## 完了時の状態

現在のデバイス項目、VID/PID、PnP 状態、関連する COM ポートを確認できます。`truncated: true` が含まれる場合は件数上限に達しています。仕様範囲内で `limit` を増やしてください。

## うまくいかない場合

- 結果が空の場合、そのクエリで Windows が一致する現在のデバイスを返さなかったことを意味します。USB ポートの物理故障を示すものではありません。
- PnP には表示されるのに COM ポートがない場合、シリアルインターフェイスがないか、ドライバーが COM ポートを作成していない可能性があります。
- 詳細結果が `found: false` の場合は再列挙し、最新の正確な `instance_id` を使用してください。
- これらのツールはドライバーやデバイスのインストール、削除、更新、有効化、無効化を行いません。シリアルデータの読み書き、ファームウェア書き込み、ボード状態の変更も行いません。

## 次のステップ

- [リモートサービスを接続・管理する](remote-services.md)
- [サービスの信頼とツール権限を理解する](service-trust.md)
- [実行履歴と診断情報を理解する](execution-records.md)
