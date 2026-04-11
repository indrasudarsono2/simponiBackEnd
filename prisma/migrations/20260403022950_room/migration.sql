-- AlterTable
ALTER TABLE `token` MODIFY `expiredDate` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `Room` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `appRatingId` INTEGER NULL,
    `checker` VARCHAR(100) NULL,
    `startDate` DATETIME(3) NULL,
    `finishDate` DATETIME(3) NULL,
    `file` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Room` ADD CONSTRAINT `Room_appRatingId_fkey` FOREIGN KEY (`appRatingId`) REFERENCES `AppRating`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Room` ADD CONSTRAINT `Room_checker_fkey` FOREIGN KEY (`checker`) REFERENCES `User`(`nik`) ON DELETE SET NULL ON UPDATE CASCADE;
