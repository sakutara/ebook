## MODIFIED Requirements

### Requirement: Missing Drive configuration
When `VITE_R2_BASE_URL` is empty or not an `http(s)` URL, the library SHALL show "Chưa cấu hình máy chủ truyện" instead of syncing, while cached books in the catalog remain listed and readable. The Settings source section SHALL be titled "Máy chủ truyện" and show the base URL host and the catalog status.

#### Scenario: app-shell.config.missing
- **GIVEN** the build has no `VITE_R2_BASE_URL` and one cached book
- **WHEN** the library opens
- **THEN** the notice is shown, no request is made and the cached book card is shown

#### Scenario: app-shell.config.settings
- **GIVEN** `VITE_R2_BASE_URL` is `https://tu-truyen.example.workers.dev`
- **WHEN** Settings opens
- **THEN** a section "Máy chủ truyện" shows "tu-truyen.example.workers.dev" and the last sync time
