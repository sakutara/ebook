# Log

## 2026-11-23

- add-donate-and-story-request: implemented (tasks 1.1–4.2; 316 unit, 94 e2e, all scenarios covered). Review fixes: dedup check runs before the no-accent warning; request page two columns only from xl; custom amount input autofocus; toast raised above the donate banner. Not archived yet (add-ebook-library-reader must be archived first so app-shell has a base spec)

- add-donate-and-story-request: spec approved by owner (incl. VITE_DONATE_NOTE, default `donate token dich truyen`); added decision 0007, domain/{donation,story-request}.md, data/story-requests.md; icons donate/copy/send/request drawn

- add-ebook-library-reader: implemented (tasks 0.1–7.5, 8.1 gates green: 211 unit, 72 e2e, 90/90 scenarios covered); reading-position.md updated for precise snippet location (added during e2e: repeated phrases picked the wrong paragraph)

- add-ebook-library-reader: spec approved by owner (rev 2, icon-first); knowledge docs for the change moved to stable

- add-ebook-library-reader (rev 2): owner asked for icon-first CTAs with AI-drawn icons → added ui/icons.md, decision 0006, src/ui/icons/svg/ (27 icons); updated ui/library.md, ui/reader.md

- add-ebook-library-reader: added domain/{drive-source,book,reading-position}.md, data/{books,book-files,covers,progress}.md, decisions 0002–0005, ui/{library,reader}.md; updated product/overview.md, playbooks/deploy.md
- bootstrap: created knowledge bundle (product overview, decision 0001, app shell, deploy playbook)

## 2026-11-23 — R2 + Worker
- Owner chose Cloudflare R2 behind a Worker as the book source ([0008](/decisions/0008-r2-worker-book-source.md)); Drive docs deprecated.
- Added [R2 source](/domain/r2-source.md), [Genre](/domain/genre.md), [Deploy the R2 Worker](/playbooks/deploy-r2-worker.md).
- Changes `move-books-to-r2` (implementing) and `add-r2-deployer` (planned, awaiting approval).

## 2026-11-24 — R2 deployer
- `add-r2-deployer` implemented: local page `npm run deployer` (port 5174) parses EPUBs in the browser, generates covers when missing, guards against overwriting another book's slug, uploads 3 files per book and merges `catalog.json` with If-Match.
- Verified end to end against `wrangler dev` (local R2): upload → catalog → library shows the new book.
- Playbook: [Publish books](/playbooks/publish-books.md).

## 2026-11-24 — Story request hardening
- Owner asked to protect the request form from floods; CSRF ruled out. `harden-story-request`:
  title-only key (Dexie v5 re-key), 10 s throttle, honeypot, Sheet dedupe Apps Script.
- Updated [Story request](/domain/story-request.md), [storyRequests](/data/story-requests.md),
  decision [0007](/decisions/0007-google-form-write-only-sink.md); added
  [Sheet de-duplication](/playbooks/sheet-dedupe.md).
