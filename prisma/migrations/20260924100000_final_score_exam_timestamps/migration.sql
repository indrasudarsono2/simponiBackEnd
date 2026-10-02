ALTER TABLE `FinalScore`
  ADD COLUMN `essayStartedAt` DATETIME(3) NULL,
  ADD COLUMN `essaySubmittedAt` DATETIME(3) NULL,
  ADD COLUMN `multipleChoiceStartedAt` DATETIME(3) NULL,
  ADD COLUMN `multipleChoiceSubmittedAt` DATETIME(3) NULL;
