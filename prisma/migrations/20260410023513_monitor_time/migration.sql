-- DropForeignKey
ALTER TABLE `apprating` DROP FOREIGN KEY `AppRating_applicationDocId_fkey`;

-- DropIndex
DROP INDEX `AppRating_applicationDocId_fkey` ON `apprating`;

-- CreateTable
CREATE TABLE `MonitorTime` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `appRatingId` INTEGER NULL,
    `eventQuestionId` INTEGER NULL,
    `time` FLOAT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AppRating` ADD CONSTRAINT `AppRating_applicationDocId_fkey` FOREIGN KEY (`applicationDocId`) REFERENCES `ApplicationDoc`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MonitorTime` ADD CONSTRAINT `MonitorTime_appRatingId_fkey` FOREIGN KEY (`appRatingId`) REFERENCES `AppRating`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MonitorTime` ADD CONSTRAINT `MonitorTime_eventQuestionId_fkey` FOREIGN KEY (`eventQuestionId`) REFERENCES `EventQuestion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
