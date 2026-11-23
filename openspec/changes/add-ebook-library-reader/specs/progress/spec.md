## ADDED Requirements

### Requirement: Save the reading position
While reading, the app SHALL save a layered anchor (`cfi`, `snippet`, `sectionIndex`, `sectionHref`, `sectionFraction`, `fraction`, `bookMd5`, `normTitle`) as defined in /knowledge/domain/reading-position.md, at most once per second after a relocate, and immediately on `pagehide` and when the document becomes hidden. Each save SHALL write `progress` and enqueue an outbox op `progress.upsert` in the same transaction.

#### Scenario: progress.save.relocate
- **WHEN** the reader turns 5 pages within 1 second
- **THEN** exactly one save happens after the last turn, holding the last page's anchor

#### Scenario: progress.save.hidden
- **WHEN** the document becomes hidden 200 ms after a page turn
- **THEN** the anchor of that page is saved without waiting for the debounce

#### Scenario: progress.save.offline
- **GIVEN** the device is offline
- **WHEN** the reader turns a page
- **THEN** the position is stored and a `progress.upsert` op is queued, with no error shown

#### Scenario: progress.save.resync
- **GIVEN** 3 positions were saved offline
- **WHEN** the device comes back online
- **THEN** the sync engine flushes the queued ops through the local-only adapter and the outbox is empty

### Requirement: Resume on the same version
Opening a book whose saved `bookMd5` equals the opened file's md5 SHALL go to the saved `cfi`.

#### Scenario: progress.resume.same-version
- **GIVEN** a position at 37 % in "a" saved on md5 "m1"
- **WHEN** "a" (md5 "m1") is reopened, also after an app restart
- **THEN** the page with the saved snippet is shown

### Requirement: Resume on a changed version
When the md5 differs, the app SHALL try in order: the `cfi` if the normalised text at it starts with the first 40 normalised characters of `snippet`; the snippet inside the saved section; that section at `sectionFraction`; `goToFraction(fraction)`. It SHALL then save a fresh anchor with the new md5.

#### Scenario: progress.resume.after-refresh
- **GIVEN** a position saved on md5 "m1" in a chapter, and Drive's new version "m2" adds a paragraph before it
- **WHEN** the cache is refreshed to "m2" and "a" is opened
- **THEN** the page showing the saved snippet is shown
- **AND** the stored position now has `bookMd5 = "m2"`

### Requirement: Locate the snippet precisely
The snippet step SHALL search the section matched by `sectionHref` (then `sectionIndex`) using the longest key that matches — the whole normalised snippet, then its first 80, then 40 characters — and, when the key occurs more than once, SHALL pick the occurrence nearest to `sectionFraction`.

#### Scenario: progress.resume.ambiguous-snippet
- **GIVEN** the saved snippet's first 40 characters occur in several paragraphs of the section, and the book changed
- **WHEN** the book is opened on the new version
- **THEN** the page showing the saved snippet is shown, not the first occurrence in the section

#### Scenario: progress.resume.snippet-gone
- **GIVEN** the saved snippet's text was rewritten in the new version
- **WHEN** "a" is opened on the new version
- **THEN** the saved section is shown at its saved section fraction

#### Scenario: progress.resume.section-gone
- **GIVEN** the saved section no longer exists in the new version
- **WHEN** "a" is opened
- **THEN** the reader goes to the saved whole-book fraction

### Requirement: Position is independent of the cache
A saved position SHALL be kept when the book's cache is deleted or replaced, and when the position is re-attached to a re-uploaded book.

#### Scenario: progress.resume.after-cache-clear
- **GIVEN** a position for "a" exists and its cache was deleted
- **WHEN** "a" is opened online and re-downloaded
- **THEN** the saved position is restored

#### Scenario: progress.resume.reuploaded
- **GIVEN** a position was re-attached from "old" to "new" by the catalog
- **WHEN** "new" is opened
- **THEN** the reader resumes at the saved snippet

### Requirement: Manage positions
Settings SHALL offer "Xoá tiến độ đọc" (confirm dialog) that soft-deletes every position through the repository (outbox `progress.delete` per row), and the JSON backup SHALL export and import `progress` and `settings` only.

#### Scenario: progress.clear.all
- **WHEN** the user confirms "Xoá tiến độ đọc"
- **THEN** every position has `deleted = 1`, cards show no %, and books open at the start

#### Scenario: progress.backup.roundtrip
- **GIVEN** positions for "a" and "b" and cached files exist
- **WHEN** the user exports and imports the backup on a fresh install
- **THEN** both positions are restored and the backup file contains no `bookFiles`, `covers` or `books` data
