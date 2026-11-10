# CheckMate

CheckMate is an educator workspace for collecting class submissions and reviewing exact phrase overlap between documents. A similarity percentage is a review signal, not a finding of plagiarism or intent.

The current build is a **local MVP**: instructors create accounts and classes, accept PDF/DOCX submissions through uploads or student links, compare documents with their own instructor-wide archive, review public-web source leads, and delete files or classes. Students can submit up to 10 documents in a batch and use a private receipt link to view page-based scores and evidence for those documents only. Files are stored on the application server's disk; metadata, page text, and comparison status are stored in PostgreSQL.

## Requirements

- Node.js 22.13+
- pnpm 10+
- Docker Compose

## Run locally

From the repository root:

```sh
pnpm install
cp apps/backend/.env.example apps/backend/.env
```

Set `JWT_SECRET` in `apps/backend/.env` to a long random value. Start PostgreSQL, apply migrations, and run the backend container:

```sh
docker compose up -d postgres
docker compose run --rm --no-deps backend pnpm --filter @checkmate/backend exec prisma migrate deploy
docker compose up -d --build backend
```

Start the frontend:

```sh
pnpm --filter @checkmate/frontend dev
```

Open <http://localhost:5173>. The API runs on <http://localhost:3003/api>. PostgreSQL is published on host port 5433 to avoid colliding with an existing local database. The backend image includes headless LibreOffice so DOCX pagination works without installing LibreOffice on the host. Uploaded files are stored in a persistent Compose volume; deleting a submission or class removes its database records and files.

Set `BRAVE_SEARCH_API_KEY` in `apps/backend/.env` to enable public-web checks. Student link submitters can opt in to these checks; up to 12 short excerpts sampled across document pages are searched without the entered name, filename, or file metadata. Keep `apps/backend/.env` private and do not commit it.

## How comparison works

CheckMate preserves page boundaries from PDFs and rendered DOCX files, then compares exact five-word phrases against submissions belonging to the same instructor across their classes. The displayed page percentage is the share of pages with at least one exact archive match or an exact overlap in a returned Brave result excerpt. Public-web search leads with no exact text overlap in the returned excerpt remain visible for inspection but do not affect the score. The evidence detail identifies the page, matched text, source, and within-page overlap score.

With a configured Brave Search key, the app can query up to 12 short excerpts sampled from across the document. Result descriptions are checked for exact five-word overlaps with the submitted page; a match confirms text in the search-result excerpt only, not the full source page. Results identify the page from which each excerpt came. This is a limited sample of Brave's public search index, not exhaustive global coverage, a full-page crawl, or Turnitin; it does not provide Turnitin's private student-paper corpus. Students submitting through a shared link can decline the web check and still receive archive comparison results. Search leads and exact phrase overlaps are review aids, not findings of plagiarism. Educators must inspect the evidence and make their own decisions.

Student receipt links reveal only the batch submitted with that receipt, and archive evidence is anonymized so it does not disclose another student's identity or document. Scanned PDFs without an embedded text layer are not supported. Email verification, password recovery, organization accounts, institutional archives, and remote object storage are not part of this local MVP.

## Workspace commands

- `pnpm dev` — run API and frontend in parallel
- `pnpm build` — build workspace packages
- `pnpm test` — run workspace tests
- `pnpm lint` — type-check the frontend and lint the backend
