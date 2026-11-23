## ADDED Requirements

### Requirement: Donate banner
When the donate config is complete, every screen except the reader SHALL show a banner with the text "Ủng hộ token dịch truyện" and a button (icon `donate` + text "Ủng hộ") that opens the donate dialog. The banner SHALL NOT be dismissible and SHALL NOT cover page content (the main area reserves its height).

#### Scenario: donate.banner.shown
- **GIVEN** `VITE_DONATE_BANK=VCB`, account no and name are set
- **WHEN** `#/` or `#/settings` or `#/request` is open
- **THEN** the banner text and the "Ủng hộ" button are visible

#### Scenario: donate.banner.reader-hidden
- **WHEN** `#/read/a` is open
- **THEN** the banner is not rendered

#### Scenario: donate.banner.config-missing
- **GIVEN** any of the three donate env vars is empty, or the bank is not recognised
- **WHEN** any screen is open
- **THEN** the banner is not rendered

#### Scenario: donate.layout.narrow
- **WHEN** `#/` is shown at 375 px
- **THEN** the banner sits directly above the bottom tab bar, spans the width, there is no horizontal scroll, and the last library row is not hidden behind it

#### Scenario: donate.layout.wide
- **WHEN** `#/` is shown at 1280 px
- **THEN** the banner is pinned to the bottom of the content column (not under the side nav)

### Requirement: Amount choice
The dialog SHALL offer preset amounts 10.000, 20.000, 50.000, 100.000 ₫ (20.000 selected by default) and "Tuỳ chọn", which reveals a numeric input accepting whole đồng from 1.000 to 50.000.000, shown with `.` thousands separators.

#### Scenario: donate.amount.preset
- **WHEN** the user picks "50k"
- **THEN** the QR is regenerated for amount 50000 and the caption shows "50.000 ₫"

#### Scenario: donate.amount.custom
- **WHEN** the user picks "Tuỳ chọn" and types `35000`
- **THEN** the input shows `35.000` and the QR encodes amount 35000

#### Scenario: donate.amount.invalid
- **WHEN** the custom input is empty, below 1.000 or above 50.000.000
- **THEN** a hint "Từ 1.000 đến 50.000.000 ₫" is shown, no QR is shown, and download is disabled

### Requirement: VietQR code
The QR SHALL be a VietQR (EMVCo, NAPAS 247 `QRIBFTTA`) payload built on the device from the configured BIN, account number, amount and the transfer note (see *Transfer note*), with a valid CRC-16/CCITT-FALSE, rendered without any network request. Bank name, account name, account number and transfer note SHALL be shown under it, with buttons to copy the account number and the note.

#### Scenario: donate.qr.payload
- **GIVEN** BIN 970436, account `0123456789`, amount 20000
- **WHEN** the payload is built
- **THEN** it contains `0010A000000727`, `010212`, `00069704360110` + `0123456789`, `0208QRIBFTTA`, `5303704`, `540520000`, `5802VN`, `0824donate token dich truyen` and ends with `6304` + the correct CRC (uppercase hex)

#### Scenario: donate.qr.bank-alias
- **WHEN** `VITE_DONATE_BANK` is `vcb`, `Vietcombank` or `970436`
- **THEN** the BIN resolves to 970436 and the displayed bank name is "Vietcombank"

#### Scenario: donate.qr.offline
- **GIVEN** the browser is offline
- **WHEN** the dialog opens
- **THEN** the QR is rendered and no network request is made

#### Scenario: donate.qr.copy
- **WHEN** the user presses copy account number
- **THEN** the digits are written to the clipboard and a toast "Đã sao chép số tài khoản" shows

### Requirement: Transfer note
The transfer note (nội dung chuyển khoản) SHALL come from `VITE_DONATE_NOTE`, defaulting to `donate token dich truyen` when empty or unset. It SHALL be converted to ASCII (accents removed, `đ`→`d`), limited to letters, digits and spaces, whitespace collapsed and cut to 25 characters (the VietQR purpose field limit), and the same cleaned text SHALL be shown in the dialog and encoded in the QR.

#### Scenario: donate.note.default
- **GIVEN** `VITE_DONATE_NOTE` is unset
- **WHEN** the dialog opens
- **THEN** the note shown and encoded is `donate token dich truyen`

#### Scenario: donate.note.env
- **GIVEN** `VITE_DONATE_NOTE=Ủng hộ Tủ Truyện!`
- **WHEN** the payload is built
- **THEN** the note shown and encoded is `Ung ho Tu Truyen`

#### Scenario: donate.note.too-long
- **GIVEN** a note of 40 characters
- **WHEN** the payload is built
- **THEN** the encoded note is its first 25 characters, trailing space trimmed

### Requirement: Download QR
The dialog SHALL have a download button that saves a PNG (at least 600 px wide) containing the QR, the amount, bank name, account name and number, named `ung-ho-<amount>.png`.

#### Scenario: donate.download.png
- **GIVEN** amount 50000
- **WHEN** the user presses download
- **THEN** a file `ung-ho-50000.png` of type `image/png` is downloaded

#### Scenario: donate.dialog.close
- **WHEN** the user presses close, Esc, or taps the backdrop
- **THEN** the dialog closes and focus returns to the "Ủng hộ" button
