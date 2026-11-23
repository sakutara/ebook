## MODIFIED Requirements

### Requirement: Routes and navigation
The app SHALL use hash routes `#/` (Thư viện), `#/read/<id>` (reader, full-screen without app nav), `#/request` (Yêu cầu) and `#/settings` (Cài đặt), with nav items "Thư viện", "Yêu cầu" and "Cài đặt" in that order, UI text in Vietnamese and `<html lang="vi">`.

#### Scenario: app-shell.routes.reader-fullscreen
- **WHEN** `#/read/a` is open
- **THEN** neither the bottom tab bar nor the side nav is visible
- **AND** the back button returns to `#/` with the previous search query and scroll position kept

#### Scenario: app-shell.routes.request
- **WHEN** the user taps the "Yêu cầu" nav item
- **THEN** `#/request` opens and the item is marked `aria-current="page"`

#### Scenario: app-shell.layout.narrow
- **WHEN** `#/` is shown at 375 px
- **THEN** the bottom tab bar with "Thư viện", "Yêu cầu" and "Cài đặt" is visible and there is no horizontal scroll

#### Scenario: app-shell.layout.wide
- **WHEN** `#/` is shown at 1280 px
- **THEN** the side nav is visible and the bottom tab bar is hidden
