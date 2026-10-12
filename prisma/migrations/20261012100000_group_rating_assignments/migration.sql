-- Additive migration. Existing groups remain policy 0; no historical rows are rewritten.
ALTER TABLE `Group` ADD COLUMN `assignmentPolicy` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `ratingIds` JSON NULL;
CREATE TABLE `CheckerGroupRating` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `checkerGroupId` INTEGER NOT NULL,
  `ratingId` INTEGER NOT NULL,
  UNIQUE INDEX `CheckerGroupRating_checkerGroupId_ratingId_key` (`checkerGroupId`, `ratingId`),
  INDEX `CheckerGroupRating_ratingId_idx` (`ratingId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `GroupAssignmentAudit` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `groupId` INTEGER NOT NULL,
  `actorNik` VARCHAR(150) NOT NULL,
  `action` VARCHAR(30) NOT NULL,
  `snapshot` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `GroupAssignmentAudit_groupId_createdAt_idx` (`groupId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `CheckerGroupRating` ADD CONSTRAINT `CheckerGroupRating_checkerGroupId_fkey`
  FOREIGN KEY (`checkerGroupId`) REFERENCES `CheckerGroup` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CheckerGroupRating` ADD CONSTRAINT `CheckerGroupRating_ratingId_fkey`
  FOREIGN KEY (`ratingId`) REFERENCES `Rating` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `GroupAssignmentAudit` ADD CONSTRAINT `GroupAssignmentAudit_groupId_fkey`
  FOREIGN KEY (`groupId`) REFERENCES `Group` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
