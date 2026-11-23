# Tasks — add-r2-deployer

Starts after `move-books-to-r2` tasks 1.x and 2.1 are done. Same TDD rules.

## 1. Scaffold
- [x] 1.1 `deployer/` entry, `vite.deployer.config.ts`, `npm run deployer`, `spark-md5` dep, vitest include `tests/deployer/**`
  - Scenarios: deployer.build.excluded
  - Test: npx vitest run tests/deployer/build-excluded.test.ts && npm run build

## 2. Pure logic
- [x] 2.1 `epub-meta.ts` — Scenarios: deployer.extract.metadata, deployer.extract.broken
- [x] 2.2 `md5.ts` (chunked, matches `md5sum` of a fixture)
- [x] 2.3 `cover-jpeg.ts` — Scenarios: deployer.cover.resize, deployer.cover.generated
- [x] 2.4 `draft.ts` — Scenarios: deployer.review.status, deployer.review.invalid-slug
- [x] 2.5 `catalog-merge.ts` — Scenarios: deployer.catalog.merge, deployer.catalog.conflict

## 3. Network
- [x] 3.1 `admin-client.ts` (XHR upload progress, error kinds) — Scenarios: deployer.connect.bad-token
- [x] 3.2 `upload-queue.ts` — Scenarios: deployer.upload.layout, deployer.upload.progress, deployer.upload.partial-failure, deployer.upload.offline

## 4. UI
- [x] 4.1 ConnectPanel — Scenarios: deployer.connect.ok, deployer.connect.bad-token, deployer.connect.forget
- [x] 4.2 DropZone + DraftCard — Scenarios: deployer.pick.many, deployer.review.*
- [x] 4.3 Upload bar (Tải lên / Dừng / Thử lại) — Scenarios: deployer.upload.*
- [x] 4.4 PublishedTab — Scenarios: deployer.manage.delete, deployer.manage.rebuild

## 5. E2E and docs
- [x] 5.1 tests/e2e/deployer.spec.ts — Scenarios: deployer.layout.narrow, deployer.layout.wide, deployer.upload.layout
- [x] 5.2 Architect: playbook /knowledge/playbooks/publish-books.md, log entry

> 4.x detail: see design.md "UI components". Tests in tests/deployer/ui-*.test.tsx with an injected store built by `createStore` with fakes.
