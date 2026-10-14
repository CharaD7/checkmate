ALTER TABLE "Classroom"
ADD COLUMN "submissionCodeHash" TEXT;

CREATE UNIQUE INDEX "Classroom_submissionCodeHash_key"
ON "Classroom"("submissionCodeHash");

ALTER TABLE "Submission"
ADD COLUMN "webSearchStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN "webSearchResults" TEXT,
ADD COLUMN "webSearchError" TEXT;
