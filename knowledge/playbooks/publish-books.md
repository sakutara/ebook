---
type: Playbook
title: Publish books with the R2 deployer
description: How the owner uploads EPUBs to R2 with the local deployer page, edits metadata, deletes books and rebuilds the catalog.
tags: [deployer, r2]
status: draft
generated: { by: claude-opus-5-5, at: 2026-11-24T09:00:00Z }
---

# Before the first time

The Worker is deployed and `ADMIN_TOKEN` is set ([Deploy the R2 Worker](/playbooks/deploy-r2-worker.md)).
`.env.local` has `VITE_R2_BASE_URL` (the deployer pre-fills it).

# Publish

1. `npm run deployer` → open http://localhost:5174 (the only origin the Worker accepts writes from by default).
2. The Worker URL and admin code are pre-filled from `VITE_R2_BASE_URL` and `R2_SECRET` in `.env.local`. Press "Kết nối". If `R2_SECRET` is not set, enter the admin token and tick "Nhớ trên máy này" only on your own computer.
3. Drop many `.epub` files (or "Chọn"). Each becomes a card: cover, title, author, genres and the folder name (slug) are read from the EPUB ([R2 source](/domain/r2-source.md), [Genre](/domain/genre.md)).
4. Check each card: fix title/author, toggle Tiên hiệp / Huyền huyễn / Khoa huyễn or add another genre. "Đã có" cards are unticked (same file already online). A red "Sẽ ghi đè «…»" means the slug belongs to another book — change the slug unless you really mean to replace it.
5. "Tải lên N truyện". Each book uploads `<slug>.epub`, `cover.jpg`, `metadata.json`, then `catalog.json` is updated. Failed books show "Thử lại"; "Dừng" stops after the current book.
6. Readers see new books on their next catalog sync (app start, reconnect, or after 5 minutes when the app becomes visible).

# Delete or repair

- "Đã đăng" → "Xoá" removes the 3 files and the catalog entry. Readers who cached the book keep it ("Chỉ còn trên máy").
- "Dựng lại catalog" rebuilds `catalog.json` from every `metadata.json` — use it if the catalog was edited by hand or an upload was interrupted between the files and the catalog step.

# Updating a book

Upload the new EPUB with the same title (same slug): the status shows "Cập nhật"; readers'
cached copies refresh automatically because the md5 changes.
