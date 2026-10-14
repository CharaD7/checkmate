ALTER TABLE "Submission"
ADD COLUMN "pageTexts" TEXT,
ADD COLUMN "receiptCodeHash" TEXT;

CREATE INDEX "Submission_receiptCodeHash_idx"
ON "Submission"("receiptCodeHash");
