ALTER TABLE `FinalScore`
  ADD COLUMN `isInvalidated` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `invalidatedAt` DATETIME(3) NULL,
  ADD COLUMN `invalidatedBy` VARCHAR(150) NULL,
  ADD COLUMN `invalidationReason` TEXT NULL;

CREATE INDEX `FinalScore_appRatingId_isInvalidated_deletedAt_idx`
  ON `FinalScore`(`appRatingId`, `isInvalidated`, `deletedAt`);

CREATE TABLE `ExaminationInvalidation` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `appRatingId` INTEGER NOT NULL,
  `finalScoreId` INTEGER NOT NULL,
  `invalidatedBy` VARCHAR(150) NOT NULL,
  `reason` TEXT NOT NULL,
  `fraudCategory` VARCHAR(100) NULL,
  `previousStatusId` INTEGER NULL,
  `previousScore` DOUBLE NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `ExaminationInvalidation_appRatingId_createdAt_idx`(`appRatingId`, `createdAt`),
  INDEX `ExaminationInvalidation_finalScoreId_idx`(`finalScoreId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ExaminationInvalidation`
  ADD CONSTRAINT `ExaminationInvalidation_appRatingId_fkey` FOREIGN KEY (`appRatingId`) REFERENCES `AppRating`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `ExaminationInvalidation_finalScoreId_fkey` FOREIGN KEY (`finalScoreId`) REFERENCES `FinalScore`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
