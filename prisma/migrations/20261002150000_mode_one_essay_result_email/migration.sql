ALTER TABLE `FinalScore`
  ADD COLUMN `essayResultEmailQueuedAt` DATETIME(3) NULL,
  ADD COLUMN `essayResultEmailClaimedAt` DATETIME(3) NULL,
  ADD COLUMN `essayResultEmailSentAt` DATETIME(3) NULL;

CREATE INDEX `FinalScore_essay_email_queue_idx`
  ON `FinalScore`(`essayResultEmailQueuedAt`, `essayResultEmailSentAt`, `essayResultEmailClaimedAt`);
