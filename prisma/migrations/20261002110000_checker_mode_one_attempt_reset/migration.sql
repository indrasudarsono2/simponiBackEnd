CREATE TABLE `ExaminationAttemptReset` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `appRatingId` INTEGER NOT NULL,
    `eventId` INTEGER NOT NULL,
    `groupMemberId` INTEGER NOT NULL,
    `checkerNik` VARCHAR(150) NOT NULL,
    `reason` TEXT NOT NULL,
    `attemptNumber` INTEGER NOT NULL,
    `previousStatusId` INTEGER NULL,
    `voidedFinalScoreId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ExaminationAttemptReset_appRatingId_createdAt_idx`(`appRatingId`, `createdAt`),
    INDEX `ExaminationAttemptReset_checkerNik_createdAt_idx`(`checkerNik`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ExaminationAttemptReset` ADD CONSTRAINT `ExaminationAttemptReset_appRatingId_fkey`
FOREIGN KEY (`appRatingId`) REFERENCES `AppRating`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
