ALTER TABLE `ApplicationDoc`
  ADD COLUMN `ojtRecommendationStatus` VARCHAR(20) NULL,
  ADD COLUMN `ojtAcceptedAt` DATETIME(3) NULL,
  ADD COLUMN `ojtAcceptedByNik` VARCHAR(150) NULL;

CREATE INDEX `ApplicationDoc_ojtNik_ojtRecommendationStatus_idx`
  ON `ApplicationDoc`(`ojtNik`, `ojtRecommendationStatus`);

CREATE TABLE `OjtLetterSequence` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `branchId` INTEGER NOT NULL,
  `year` INTEGER NOT NULL,
  `lastNumber` INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `OjtLetterSequence_branchId_year_key` (`branchId`, `year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
