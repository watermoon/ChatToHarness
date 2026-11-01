# Inspect USB, PnP and serial devices

[English](../en/hardware-inspection.md) | [简体中文](../zh-CN/hardware-inspection.md) | [日本語](../ja/hardware-inspection.md)

> For ChatToHarness 0.8.1.

## Your goal

Identify connected USB devices, Plug and Play (PnP) devices and COM-port mappings using read-only inventory tools.

## Before you start

- These tools are available on Windows only. Other platforms return an unsupported-platform error.
- The queries use fixed Windows hardware inventory APIs. They do not request administrator elevation.
- When using UnifyHarness, first call `list_devices`, choose the intended device explicitly, then call `list_device_tools` for that `device_id`. Invoke a listed tool through `call_device_tool` using the returned `catalog_version`. Do not assume the current computer or silently switch devices.
- These tools enumerate device metadata only. They do not open, read from or write to a COM port.

## Steps

1. Call `list_usb_devices` to enumerate present USB devices. The optional `limit` is 1–200 (default 100).
2. Call `list_pnp_devices` to inspect relevant USB, Ports and HID devices. The optional `limit` is 1–200 (default 100).
3. Call `list_serial_ports` to list COM ports and their associated PnP identity. The optional `limit` is 1–128 (default 64).
4. Copy the exact `instance_id` from a result and pass it to `get_pnp_device_details`. This returns allowlisted identity, parent, service, driver and location properties.
5. Correlate the device name, vendor ID (VID), product ID (PID), PnP instance ID and COM-port name. A generic USB-to-serial bridge name does not by itself identify the attached development board; use the IDs and hardware details as evidence.

## What success looks like

You can identify the present device entry, its VID/PID and PnP status, and any associated COM port. A result may include `truncated: true` when the requested limit was reached; increase the limit within the documented range if needed.

## If it does not work

- An empty result means Windows did not return a matching present device for that query; it does not prove the USB port is physically faulty.
- If the device appears in PnP but has no COM mapping, it may not expose a serial interface or its driver may not have created a COM port.
- If details return `found: false`, re-enumerate and use the current exact `instance_id`.
- These tools do not install, remove, update, enable or disable drivers/devices. They do not access serial-port data, flash firmware, or change the board.

## Next steps

- [Connect and manage remote services](remote-services.md)
- [Trust a service and understand tool permissions](service-trust.md)
- [Understand execution records and diagnostics](execution-records.md)
