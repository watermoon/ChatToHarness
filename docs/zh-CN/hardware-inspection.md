# 只读检查 USB、PnP 和串口设备

[English](../en/hardware-inspection.md) | [简体中文](../zh-CN/hardware-inspection.md) | [日本語](../ja/hardware-inspection.md)

> 适用于 ChatToHarness 0.8.1。

## 使用目标

通过只读设备清单，识别已连接的 USB 设备、即插即用（PnP）设备及其 COM 串口映射。

## 开始前

- 这些工具仅适用于 Windows；在其他平台调用会返回“不支持的平台”错误。
- 查询使用固定的 Windows 硬件枚举接口，不会主动请求管理员权限。
- 通过 UnifyHarness 远程调用时，先使用 `list_devices`，明确选择目标设备，再用对应的 `device_id` 调用 `list_device_tools`。调用目录中的工具时，必须使用返回的 `catalog_version`，并通过 `call_device_tool` 执行。不能默认当前电脑，也不能静默切换设备。
- 这些工具只枚举设备元数据，不会打开、读取或写入 COM 串口。

## 操作步骤

1. 调用 `list_usb_devices` 枚举当前 USB 设备。可选参数 `limit` 范围为 1–200，默认 100。
2. 调用 `list_pnp_devices` 查看相关 USB、Ports 和 HID 设备。可选参数 `limit` 范围为 1–200，默认 100。
3. 调用 `list_serial_ports` 列出 COM 端口及其 PnP 身份信息。可选参数 `limit` 范围为 1–128，默认 64。
4. 从结果中复制准确的 `instance_id`，传给 `get_pnp_device_details`，读取允许返回的设备身份、父设备、服务、驱动和位置属性。
5. 综合设备名称、厂商 ID（VID）、产品 ID（PID）、PnP 实例 ID 和 COM 端口名称进行判断。USB 转串口芯片的通用名称本身不能证明连接的就是某块开发板，应以硬件 ID 和设备详情为依据。

## 完成后的表现

能够确认设备条目、VID/PID、PnP 状态以及关联的 COM 端口。如果结果包含 `truncated: true`，表示达到本次数量上限；可在文档允许的范围内调高 `limit`。

## 没有成功时

- 空结果表示 Windows 本次查询没有返回匹配的当前设备，不代表 USB 接口一定损坏。
- 如果 PnP 列表中有设备但没有 COM 映射，它可能没有串口接口，或驱动尚未创建 COM 端口。
- 如果详情返回 `found: false`，请重新枚举，并使用最新结果中的完整 `instance_id`。
- 这些工具不会安装、卸载、更新、启用或禁用设备/驱动；不会访问串口数据、烧录固件或修改开发板状态。

## 下一步

- [连接和管理远程服务](remote-services.md)
- [信任服务并理解工具权限](service-trust.md)
- [理解执行记录和诊断信息](execution-records.md)
