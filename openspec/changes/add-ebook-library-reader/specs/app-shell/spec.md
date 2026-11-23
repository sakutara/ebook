## ADDED Requirements

### Requirement: Routes and navigation
The app SHALL use hash routes `#/` (Thư viện), `#/read/<id>` (reader, full-screen without app nav) and `#/settings` (Cài đặt), with nav items "Thư viện" and "Cài đặt", UI text in Vietnamese and `<html lang="vi">`.

#### Scenario: app-shell.routes.reader-fullscreen
- **WHEN** `#/read/a` is open
- **THEN** neither the bottom tab bar nor the side nav is visible
- **AND** the back button returns to `#/` with the previous search query and scroll position kept

#### Scenario: app-shell.layout.narrow
- **WHEN** `#/` is shown at 375 px
- **THEN** the bottom tab bar with "Thư viện" and "Cài đặt" is visible and there is no horizontal scroll

#### Scenario: app-shell.layout.wide
- **WHEN** `#/` is shown at 1280 px
- **THEN** the side nav is visible and the bottom tab bar is hidden

### Requirement: Missing Drive configuration
When `VITE_GD_API_KEY` or `VITE_GD_FOLDER_ID` is empty, the library SHALL show "Chưa cấu hình thư mục Google Drive" instead of syncing, while cached books in the catalog remain listed and readable.

#### Scenario: app-shell.config.missing
- **GIVEN** the build has no API key and one cached book
- **WHEN** the library opens
- **THEN** the notice is shown, no Drive request is made and the cached book card is shown

### Requirement: Works offline after first visit
The built app SHALL precache its shell and the foliate-js EPUB chunks, so that after one online visit the library, search, settings and the reader for cached books load with no network.

#### Scenario: app-shell.offline.reload
- **GIVEN** the preview build was visited online once and book "a" was cached
- **WHEN** the browser goes offline and reloads `#/read/a`
- **THEN** the book renders

### Requirement: Icon-first actions
Action buttons SHALL be icon-only: a 24 px inline SVG from the app's own icon set (`src/ui/icons/svg/`, see /knowledge/ui/icons.md) inside a hit area of at least 44×44 px, with the Vietnamese label as both `aria-label` and `title` and no visible text. Only primary nav items, the "Tất cả"/"Đã lưu" filter and buttons inside confirm dialogs SHALL show icon + text.

#### Scenario: app-shell.icons.icon-only
- **WHEN** the library, reader chrome and settings are rendered
- **THEN** every button outside nav, the filter and dialogs contains an `svg` and no visible text, and has equal non-empty `aria-label` and `title`

#### Scenario: app-shell.icons.labelled-exceptions
- **WHEN** the nav, the filter and the "Xoá toàn bộ cache" confirm dialog are rendered
- **THEN** each of their buttons shows its icon and its Vietnamese text

#### Scenario: app-shell.icons.offline
- **GIVEN** the app is offline after one visit
- **WHEN** any page renders
- **THEN** all icons are visible and no request is made for icon files

#### Scenario: app-shell.icons.theme
- **WHEN** the reader theme is Tối
- **THEN** icon strokes use the text colour of the reader chrome (currentColor)

#### Scenario: app-shell.icons.layout.narrow
- **WHEN** the viewport is 375 px wide
- **THEN** every icon button's bounding box is at least 44×44 px and adjacent icon buttons are at least 8 px apart

#### Scenario: app-shell.icons.layout.wide
- **WHEN** the viewport is 1280 px wide and the pointer hovers an icon button
- **THEN** its `title` tooltip text equals its accessible name and a visible focus ring appears on keyboard focus
