# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Educators who organize and review student submissions within classes.

## Product Purpose

CheckMate helps educators create classes, collect student documents, compare submissions with their prior class archive and inspect potential public-web sources. Success means an educator can review matching passages and source leads while remaining responsible for interpreting the evidence.

## Positioning

CheckMate is an instructor-controlled review workspace. It does not access Turnitin's private student-paper corpus or determine whether plagiarism occurred.

## Operating Context

Educators create classes, collect work directly or through a shareable student link, and review comparisons against submissions they own across their classes. Public-web checks use Brave Search when configured and consented to by student link submitters.

## Capabilities and Constraints

- The requested first release is a working local MVP, not a sample-data-only prototype.
- Educators can create accounts with open email/password self-sign-up.
- Submission files are PDF or DOCX, up to 25 MB each.
- Educators enter a student name per file; batch upload associates each selected file with its entered name.
- Students can submit up to 10 documents in one batch through an instructor-created link without creating an account, then receive a private, unguessable receipt link for only that batch's review results.
- Student receipt links expose matches from the submitting instructor's archive only as anonymized source labels; they do not expose other students' names, document names, or reports.
- Uploaded PDFs and rendered DOCX documents retain page boundaries so matched-page coverage can be calculated and reviewed with page numbers.
- Student link submitters can decline the public-web check and still submit their work.
- A consented public-web check sends up to three short excerpts sampled across document pages to Brave Search. Each returned source lead is linked to the excerpt's page. The entered student name, filename, email addresses, URLs, phone numbers, and file metadata are excluded from queries.
- Educators can compare work with submissions from all of their own classes; student links cannot view class submissions, archive matches, or reports.
- Brave Search results are limited public-index source leads for human inspection, not exhaustive internet coverage, Turnitin matches, or plagiarism findings.
- Educators can delete individual submissions and entire classes, including their comparison records and stored files.
- Page match percentage is the share of rendered pages with one or more exact five-word archive matches or public-web source leads. Archive overlap and public-web leads are reported separately; neither is an automated finding of plagiarism or misconduct.
- Use pnpm as the default package manager.
- The web interface offers light and dark themes, with light mode as the default.
- Use PostgreSQL for application data and a local on-disk uploads directory for documents in the local MVP.
- The comparison corpus is limited to submissions owned by the signed-in instructor. Institutional or cross-account archives are not in scope.
- The backend container includes headless LibreOffice for DOCX page rendering; student documents remain on the configured server and are not sent to a document-conversion service.
- Production deployment, Turnitin integration, email verification/password recovery, and additional user roles remain outside the confirmed first-release scope.

## Evidence on Hand

The repository README describes an intended plagiarism-checking product but contains no real student documents, reports, customers, or usage evidence. Any demonstration content must be synthetic and labeled as such.

## Product Principles

- Keep educators in control of interpretation and decisions.
- Make compared passages and their source submissions inspectable.
- Keep archive comparisons within the signed-in instructor's own submissions.
- Be explicit about what is implemented and what a similarity score does not prove.
- Disclose external text processing and let student submitters opt out of public-web checks.

## Accessibility & Inclusion

No product-specific accessibility standard has been confirmed. The web interface should still use accessible semantic controls, keyboard operation, and clear status/error feedback.
