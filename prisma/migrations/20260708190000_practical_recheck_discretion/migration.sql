INSERT INTO `status` (`status`, `createdAt`, `updatedAt`)
SELECT 'PRACTICAL RECHECK', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM `status` WHERE `status` = 'PRACTICAL RECHECK' AND `deletedAt` IS NULL);

CREATE TABLE `PracticalRecheckAuthorization` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `appRatingId` INTEGER NOT NULL,
  `grantedBy` VARCHAR(150) NOT NULL,
  `reason` TEXT NOT NULL,
  `passingGrade` DOUBLE NOT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3) NULL,
  UNIQUE INDEX `PracticalRecheckAuthorization_appRatingId_key`(`appRatingId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PracticalRecheckAttempt` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `authorizationId` INTEGER NOT NULL,
  `practicalTestId` INTEGER NOT NULL,
  `checkerGroupId` INTEGER NULL,
  `score` DOUBLE NULL,
  `file` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `PracticalRecheckAttempt_authorizationId_practicalTestId_key`(`authorizationId`, `practicalTestId`),
  INDEX `PracticalRecheckAttempt_checkerGroupId_authorizationId_idx`(`checkerGroupId`, `authorizationId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PracticalRecheckAuthorization`
  ADD CONSTRAINT `PracticalRecheckAuthorization_appRatingId_fkey` FOREIGN KEY (`appRatingId`) REFERENCES `AppRating`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `PracticalRecheckAttempt`
  ADD CONSTRAINT `PracticalRecheckAttempt_authorizationId_fkey` FOREIGN KEY (`authorizationId`) REFERENCES `PracticalRecheckAuthorization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `PracticalRecheckAttempt_practicalTestId_fkey` FOREIGN KEY (`practicalTestId`) REFERENCES `PracticalTest`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `PracticalRecheckAttempt_checkerGroupId_fkey` FOREIGN KEY (`checkerGroupId`) REFERENCES `CheckerGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
