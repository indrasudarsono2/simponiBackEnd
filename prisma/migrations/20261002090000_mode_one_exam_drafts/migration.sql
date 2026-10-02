CREATE TABLE `ModeOneExamDraft` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `appRatingId` INTEGER NOT NULL,
    `eventId` INTEGER NOT NULL,
    `eventUserId` INTEGER NOT NULL,
    `groupMemberId` INTEGER NOT NULL,
    `ownerNik` VARCHAR(150) NOT NULL,
    `kind` VARCHAR(20) NOT NULL,
    `questionSnapshot` JSON NOT NULL,
    `answers` JSON NOT NULL,
    `deadlineAt` DATETIME(3) NULL,
    `submittedAt` DATETIME(3) NULL,
    `processingAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ModeOneExamDraft_appRatingId_kind_key`(`appRatingId`, `kind`),
    INDEX `ModeOneExamDraft_submittedAt_deadlineAt_processingAt_idx`(`submittedAt`, `deadlineAt`, `processingAt`),
    INDEX `ModeOneExamDraft_ownerNik_eventId_idx`(`ownerNik`, `eventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ModeOneExamDraft` ADD CONSTRAINT `ModeOneExamDraft_appRatingId_fkey` FOREIGN KEY (`appRatingId`) REFERENCES `AppRating`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
