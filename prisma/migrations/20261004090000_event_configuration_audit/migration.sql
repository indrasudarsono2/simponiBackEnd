CREATE TABLE `EventConfigurationVersion` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `eventId` INTEGER NOT NULL,
  `version` INTEGER NOT NULL,
  `source` VARCHAR(40) NOT NULL,
  `actorNik` VARCHAR(150) NULL,
  `actorName` VARCHAR(150) NULL,
  `reason` TEXT NOT NULL,
  `snapshot` JSON NOT NULL,
  `lockedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `EventConfigurationVersion_eventId_version_key` (`eventId`, `version`),
  CONSTRAINT `EventConfigurationVersion_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `ModeOneExamDraft` ADD COLUMN `configurationVersionId` INTEGER NULL;
ALTER TABLE `FinalScore` ADD COLUMN `configurationVersionId` INTEGER NULL;
ALTER TABLE `ModeOneExamDraft` ADD CONSTRAINT `ModeOneExamDraft_configurationVersionId_fkey` FOREIGN KEY (`configurationVersionId`) REFERENCES `EventConfigurationVersion` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `FinalScore` ADD CONSTRAINT `FinalScore_configurationVersionId_fkey` FOREIGN KEY (`configurationVersionId`) REFERENCES `EventConfigurationVersion` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
