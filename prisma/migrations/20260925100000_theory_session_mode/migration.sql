ALTER TABLE `Event`
  ADD COLUMN `theoryMode` VARCHAR(20) NOT NULL DEFAULT 'MODE_1',
  ADD COLUMN `difficulty` VARCHAR(20) NOT NULL DEFAULT 'HARD';

CREATE TABLE `TheorySession` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `eventId` INTEGER NOT NULL,
  `leadNik` VARCHAR(150) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'WAITING',
  `durationSeconds` INTEGER NOT NULL,
  `remainingSeconds` INTEGER NOT NULL,
  `startedAt` DATETIME(3) NULL,
  `resumedAt` DATETIME(3) NULL,
  `endedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `TheorySession_eventId_status_idx` (`eventId`, `status`),
  INDEX `TheorySession_leadNik_status_idx` (`leadNik`, `status`),
  CONSTRAINT `TheorySession_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TheorySessionParticipant` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `sessionId` INTEGER NOT NULL,
  `eventUserId` INTEGER NOT NULL,
  `appRatingId` INTEGER NULL,
  `finalScoreId` INTEGER NULL,
  `questionSnapshot` JSON NULL,
  `essayAnswers` JSON NULL,
  `multipleChoiceAnswers` JSON NULL,
  `essaySubmittedAt` DATETIME(3) NULL,
  `multipleChoiceSubmittedAt` DATETIME(3) NULL,
  `joinedAt` DATETIME(3) NULL,
  `finalizedAt` DATETIME(3) NULL,
  `resultEmailClaimedAt` DATETIME(3) NULL,
  `resultEmailSentAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `TheorySessionParticipant_sessionId_eventUserId_key` (`sessionId`, `eventUserId`),
  UNIQUE INDEX `TheorySessionParticipant_finalScoreId_key` (`finalScoreId`),
  INDEX `TheorySessionParticipant_appRatingId_finalScoreId_idx` (`appRatingId`, `finalScoreId`),
  CONSTRAINT `TheorySessionParticipant_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `TheorySession`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `TheorySessionParticipant_eventUserId_fkey` FOREIGN KEY (`eventUserId`) REFERENCES `EventUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `TheorySessionParticipant_appRatingId_fkey` FOREIGN KEY (`appRatingId`) REFERENCES `AppRating`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `TheorySessionParticipant_finalScoreId_fkey` FOREIGN KEY (`finalScoreId`) REFERENCES `FinalScore`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TheorySessionAction` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `sessionId` INTEGER NOT NULL,
  `actorNik` VARCHAR(150) NOT NULL,
  `action` VARCHAR(30) NOT NULL,
  `seconds` INTEGER NULL,
  `reason` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `TheorySessionAction_sessionId_createdAt_idx` (`sessionId`, `createdAt`),
  CONSTRAINT `TheorySessionAction_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `TheorySession`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `Roles` (`role`, `createdAt`, `updatedAt`, `deletedAt`)
SELECT 'CHECKER EXAMINATION LEAD', NOW(3), NOW(3), NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `Roles`
  WHERE UPPER(TRIM(`role`)) = 'CHECKER EXAMINATION LEAD' AND `deletedAt` IS NULL
);

INSERT INTO `Menu` (`menu`, `createdAt`, `updatedAt`, `deletedAt`)
SELECT 'theorySession', NOW(3), NOW(3), NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `Menu` WHERE `menu` = 'theorySession' AND `deletedAt` IS NULL
);

INSERT INTO `RolesMenu` (`roleId`, `menuId`, `createdAt`, `updatedAt`, `deletedAt`)
SELECT roleRow.`id`, menuRow.`id`, NOW(3), NOW(3), NULL
FROM `Roles` roleRow
JOIN `Menu` menuRow ON menuRow.`menu` = 'theorySession' AND menuRow.`deletedAt` IS NULL
WHERE UPPER(TRIM(roleRow.`role`)) = 'CHECKER EXAMINATION LEAD'
  AND roleRow.`deletedAt` IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM `RolesMenu` existing
    WHERE existing.`roleId` = roleRow.`id`
      AND existing.`menuId` = menuRow.`id`
      AND existing.`deletedAt` IS NULL
  );
