---
type: Domain Concept
title: Donation (ủng hộ token dịch truyện)
description: A VietQR bank-transfer QR generated on the device from build-time bank config and a chosen amount.
tags: [donate, vietqr]
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-23T08:00:00Z }
---

# Config (build env)

| var | example | notes |
|---|---|---|
| `VITE_DONATE_BANK` | `VCB` / `Vietcombank` / `970436` | bank short name, common name or 6-digit NAPAS BIN; mapped to a BIN by `src/donate/banks.ts` |
| `VITE_DONATE_ACCOUNT_NO` | `0123456789` | digits only |
| `VITE_DONATE_ACCOUNT_NAME` | `NGUYEN VAN A` | shown under the QR |
| `VITE_DONATE_NOTE` | `donate token dich truyen` | nội dung chuyển khoản; optional, this is the default. Cleaned to ASCII letters/digits/spaces, ≤ 25 chars |

Any missing/unknown → banner hidden (nothing to donate to).

# Amounts

Presets 10.000 · 20.000 · 50.000 · 100.000 ₫; custom integer 1.000–50.000.000 ₫.

# QR payload

VietQR = EMVCo merchant-presented QR (NAPAS 247, service `QRIBFTTA`), built locally — no
network, so it works offline. Tags: 00=01, 01=12 (dynamic, has amount), 38 (GUID
`A000000727`, 01 → {00 BIN, 01 account}, 02 `QRIBFTTA`), 53=704, 54=amount, 58=VN,
62.08=transfer note (ASCII, banks strip accents), 63=CRC-16/CCITT-FALSE.
