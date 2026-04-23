-- CreateTable
CREATE TABLE `Preview` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `appRatingId` INTEGER NULL,
    `groupMemberId` INTEGER NULL,
    `eventId` INTEGER NULL,
    `file` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Preview` ADD CONSTRAINT `Preview_appRatingId_fkey` FOREIGN KEY (`appRatingId`) REFERENCES `AppRating`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Preview` ADD CONSTRAINT `Preview_groupMemberId_fkey` FOREIGN KEY (`groupMemberId`) REFERENCES `GroupMember`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Preview` ADD CONSTRAINT `Preview_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
