ALTER TABLE `MultipleChoice`
  ADD COLUMN `mandatoryItemId` INTEGER NULL;

CREATE INDEX `MultipleChoice_mandatoryItemId_isMats_isActive_deletedAt_idx`
  ON `MultipleChoice`(`mandatoryItemId`, `isMats`, `isActive`, `deletedAt`);

ALTER TABLE `MultipleChoice`
  ADD CONSTRAINT `MultipleChoice_mandatoryItemId_fkey`
  FOREIGN KEY (`mandatoryItemId`) REFERENCES `MandatoryItems`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `MatsConfiguration`
  ADD COLUMN `mode` VARCHAR(30) NOT NULL DEFAULT 'SEPARATE_POOL';

CREATE TABLE `MatsCategoryAllocation` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `mandatoryItemId` INTEGER NOT NULL,
  `quantity` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3) NULL,
  UNIQUE INDEX `MatsCategoryAllocation_mandatoryItemId_key`(`mandatoryItemId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `MatsCategoryAllocation_mandatoryItemId_fkey`
    FOREIGN KEY (`mandatoryItemId`) REFERENCES `MandatoryItems`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MatsQuestionSelection`
  ADD COLUMN `mode` VARCHAR(30) NOT NULL DEFAULT 'SEPARATE_POOL',
  ADD COLUMN `mandatoryItemId` INTEGER NULL;

ALTER TABLE `MatsQuestionSelection`
  ADD CONSTRAINT `MatsQuestionSelection_mandatoryItemId_fkey`
  FOREIGN KEY (`mandatoryItemId`) REFERENCES `MandatoryItems`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `MultipleChoiceCorrection`
  ADD COLUMN `matsMode` VARCHAR(30) NULL,
  ADD COLUMN `mandatoryItemId` INTEGER NULL;

ALTER TABLE `MultipleChoiceCorrection`
  ADD CONSTRAINT `MultipleChoiceCorrection_mandatoryItemId_fkey`
  FOREIGN KEY (`mandatoryItemId`) REFERENCES `MandatoryItems`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
